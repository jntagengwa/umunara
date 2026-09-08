import 'server-only'
import type { PaginatedResult, ProfileRow } from '@umunara/database'
import { idSchema, pageQuerySchema, type PageQuery, type ProfileDto } from '@umunara/schemas'
import type { Actor } from '../auth/require-user'
import { requireRole } from '../auth/require-role'
import type { CacheInvalidator } from '../cache/invalidation'
import { cacheTags } from '../cache/tags'
import { ApiError } from '../errors'
import type { AuditWriter } from './audit-service'

export interface MembershipStore {
  approvePending(id: string): Promise<ProfileRow | null>
  listPending(query: PageQuery): Promise<PaginatedResult<ProfileRow>>
}

function toProfileDto(row: ProfileRow): ProfileDto {
  return {
    id: row.id,
    role: row.role,
    approvedAt: row.approved_at,
    fullName: row.full_name,
    email: row.email,
  }
}

export class MembershipService {
  constructor(
    private readonly repository: MembershipStore,
    private readonly audit: AuditWriter,
    private readonly cache: CacheInvalidator,
  ) {}

  async listPending(actor: Actor, input: PageQuery): Promise<PaginatedResult<ProfileDto>> {
    requireRole(actor, 'admin')
    const result = await this.repository.listPending(pageQuerySchema.parse(input))
    return { ...result, data: result.data.map(toProfileDto) }
  }

  async approve(admin: Actor, profileId: string): Promise<ProfileDto> {
    requireRole(admin, 'admin')
    const row = await this.repository.approvePending(idSchema.parse(profileId))
    if (!row) throw new ApiError(409, 'This profile is no longer pending approval.')
    try {
      await this.audit.write(admin, 'approve', 'member', row.id)
    } finally {
      // Auth reads are request-scoped; subsequent requests re-read the changed profile.
      this.cache.invalidate([cacheTags.profile(row.id)])
    }
    return toProfileDto(row)
  }
}
