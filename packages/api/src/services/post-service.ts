import 'server-only'
import type { PaginatedResult, PostRow, PostInsert, PostUpdate } from '@umunara/database'
import {
  contentQuerySchema,
  postCreateSchema,
  postUpdateSchema,
  idSchema,
  type ContentQuery,
  type ContentQueryInput,
  type PostCreateInput,
  type PostUpdateInput,
  type PostDto,
} from '@umunara/schemas'
import type { Actor } from '../auth/require-user'
import { requireRole } from '../auth/require-role'
import type { CacheInvalidator } from '../cache/invalidation'
import { cacheTags } from '../cache/tags'
import { ApiError } from '../errors'
import type { AuditWriter } from './audit-service'
import { toPostDto, postValues } from './post-values'

export interface PostStore {
  list(query: ContentQuery): Promise<PaginatedResult<PostRow>>
  getById(id: string): Promise<PostRow | null>
  create(input: PostInsert): Promise<PostRow>
  update(id: string, input: PostUpdate): Promise<PostRow>
  remove(id: string): Promise<PostRow>
}

export class PostService {
  constructor(
    private readonly repository: PostStore,
    private readonly audit: AuditWriter,
    private readonly cache: CacheInvalidator,
  ) {}

  async list(actor: Actor | null, input: ContentQueryInput): Promise<PaginatedResult<PostDto>> {
    const query = contentQuerySchema.parse(input)
    if (query.scope !== 'public') requireRole(actor, query.scope === 'all' ? 'editor' : 'member')
    const result = await this.repository.list(query)
    return { ...result, data: result.data.map(toPostDto) }
  }

  async get(actor: Actor | null, id: string): Promise<PostDto> {
    const row = await this.find(id)
    if (row.status === 'draft') requireRole(actor, 'editor')
    else if (row.visibility === 'member') requireRole(actor, 'member')
    return toPostDto(row)
  }

  async create(actor: Actor, input: PostCreateInput): Promise<PostDto> {
    requireRole(actor, 'editor')
    const values = postCreateSchema.parse(input)
    const row = await this.repository.create({
      ...postValues(values),
      title: values.title,
      slug: values.slug,
      author_id: actor.id,
      published_at: values.status === 'published' ? new Date().toISOString() : null,
    })
    return this.finish(actor, 'create', row)
  }

  async update(actor: Actor, id: string, input: PostUpdateInput): Promise<PostDto> {
    requireRole(actor, 'editor')
    const values = postUpdateSchema.parse(input)
    const previous = await this.find(id)
    const row = await this.repository.update(id, {
      ...postValues(values),
      ...(values.status === undefined
        ? {}
        : {
            published_at:
              values.status === 'published'
                ? (previous.published_at ?? new Date().toISOString())
                : null,
          }),
    })
    return this.finish(actor, 'update', row, previous)
  }

  async publish(actor: Actor, id: string): Promise<PostDto> {
    requireRole(actor, 'editor')
    const previous = await this.find(id)
    const row = await this.repository.update(id, {
      status: 'published',
      published_at: previous.published_at ?? new Date().toISOString(),
    })
    return this.finish(actor, 'publish', row, previous)
  }

  async remove(actor: Actor, id: string): Promise<PostDto> {
    requireRole(actor, 'editor')
    idSchema.parse(id)
    const row = await this.repository.remove(id)
    return this.finish(actor, 'delete', row)
  }

  private async find(id: string): Promise<PostRow> {
    idSchema.parse(id)
    const row = await this.repository.getById(id)
    if (!row) throw new ApiError(404, 'Post not found.')
    return row
  }

  private async finish(
    actor: Actor,
    action: string,
    row: PostRow,
    previous?: PostRow,
  ): Promise<PostDto> {
    const tags = new Set([cacheTags.posts(row.visibility), cacheTags.post(row.slug)])
    if (previous) {
      tags.add(cacheTags.posts(previous.visibility))
      tags.add(cacheTags.post(previous.slug))
    }
    try {
      await this.audit.write(actor, action, 'post', row.id)
    } finally {
      this.cache.invalidate([...tags])
    }
    return toPostDto(row)
  }
}
