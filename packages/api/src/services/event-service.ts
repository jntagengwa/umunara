import 'server-only'
import type { EventInsert, EventRow, PaginatedResult } from '@umunara/database'
import {
  contentQuerySchema,
  eventCreateSchema,
  type ContentQuery,
  type ContentQueryInput,
  type EventCreateInput,
  type EventDto,
} from '@umunara/schemas'
import type { Actor } from '../auth/require-user'
import { requireRole } from '../auth/require-role'
import type { CacheInvalidator } from '../cache/invalidation'
import { cacheTags } from '../cache/tags'
import type { AuditWriter } from './audit-service'

export interface EventStore {
  list(query: ContentQuery): Promise<PaginatedResult<EventRow>>
  create(input: EventInsert): Promise<EventRow>
}

function toEventDto(row: EventRow): EventDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    location: row.location,
    onlineUrl: row.online_url,
    capacity: row.capacity,
    status: row.status,
    visibility: row.visibility,
  }
}

export class EventService {
  constructor(
    private readonly repository: EventStore,
    private readonly audit: AuditWriter,
    private readonly cache: CacheInvalidator,
  ) {}

  async list(actor: Actor | null, input: ContentQueryInput): Promise<PaginatedResult<EventDto>> {
    const query = contentQuerySchema.parse(input)
    if (query.scope !== 'public') requireRole(actor, query.scope === 'all' ? 'editor' : 'member')
    const result = await this.repository.list(query)
    return { ...result, data: result.data.map(toEventDto) }
  }

  async create(actor: Actor, input: EventCreateInput): Promise<EventDto> {
    requireRole(actor, 'editor')
    const value = eventCreateSchema.parse(input)
    const row = await this.repository.create({
      title: value.title,
      description: value.description,
      starts_at: value.startsAt,
      ends_at: value.endsAt,
      location: value.location,
      online_url: value.onlineUrl,
      capacity: value.capacity,
      status: value.status,
      visibility: value.visibility,
      author_id: actor.id,
      published_at: value.status === 'published' ? new Date().toISOString() : null,
    })
    try {
      await this.audit.write(actor, 'create', 'event', row.id)
    } finally {
      this.cache.invalidate([cacheTags.events(row.visibility)])
    }
    return toEventDto(row)
  }
}
