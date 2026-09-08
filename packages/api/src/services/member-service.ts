import 'server-only'
import { idSchema, roleSchema, type Role } from '@umunara/schemas'
import type { Actor } from '../auth/require-user'
import { requireRole } from '../auth/require-role'
import type { AuditWriter } from './audit-service'

export interface MemberStore {
  setRole(
    id: string,
    role: Role,
    approvedAt: string | null,
  ): Promise<{ id: string; role: Role; approved_at: string | null }>
}

export class MemberService {
  constructor(
    private readonly repository: MemberStore,
    private readonly audit: AuditWriter,
  ) {}

  async approve(actor: Actor, id: string): Promise<Actor> {
    return this.setRole(actor, id, 'member')
  }

  async setRole(actor: Actor, id: string, input: Role): Promise<Actor> {
    requireRole(actor, 'admin')
    const role = roleSchema.parse(input)
    const row = await this.repository.setRole(
      idSchema.parse(id),
      role,
      role === 'pending' ? null : new Date().toISOString(),
    )
    await this.audit.write(actor, 'set-role', 'member', row.id, { role })
    // Authorization/profile reads are request-scoped and never shared in the data cache.
    return { id: row.id, role: row.role, approvedAt: row.approved_at }
  }
}
