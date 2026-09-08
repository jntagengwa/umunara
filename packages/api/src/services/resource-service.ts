import 'server-only'
import type { PaginatedResult, ResourceRow } from '@umunara/database'
import {
  idSchema,
  pageQuerySchema,
  type PageQuery,
  type ResourceSummaryDto,
} from '@umunara/schemas'
import type { Actor } from '../auth/require-user'
import { requireRole } from '../auth/require-role'
import { ApiError } from '../errors'

export interface ResourceStore {
  getById(id: string): Promise<ResourceRow | null>
  list(query: PageQuery): Promise<PaginatedResult<ResourceRow>>
  sign(path: string, expiresIn: number): Promise<string>
}

export class ResourceService {
  constructor(private readonly repository: ResourceStore) {}

  async list(actor: Actor, input: PageQuery): Promise<PaginatedResult<ResourceSummaryDto>> {
    requireRole(actor, 'member')
    const result = await this.repository.list(pageQuerySchema.parse(input))
    return {
      ...result,
      data: result.data.map(({ id, title, description }) => ({ id, title, description })),
    }
  }

  async createDownloadUrl(
    actor: Actor,
    resourceId: string,
  ): Promise<{ url: string; expiresAt: string }> {
    requireRole(actor, 'member')
    const resource = await this.repository.getById(idSchema.parse(resourceId))
    if (!resource || resource.status !== 'published') throw new ApiError(404, 'Resource not found.')
    if (resource.visibility !== 'public' && resource.visibility !== 'member') {
      throw new ApiError(403, 'Resource is unavailable.')
    }
    const expiresIn = 60
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
    const url = await this.repository.sign(resource.storage_path, expiresIn)
    return { url, expiresAt }
  }
}
