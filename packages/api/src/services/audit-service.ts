import 'server-only'
import type { Json } from '@umunara/database'
import type { Actor } from '../auth/require-user'
import { requireRole } from '../auth/require-role'
import { ApiError } from '../errors'

export interface AuditWriter {
  write(
    actor: Actor,
    action: string,
    entityType: string,
    entityId: string,
    details?: Json,
  ): Promise<void>
}

export interface AuditStore {
  append(entry: {
    actor_id: string
    action: string
    entity_type: string
    entity_id: string
    details: Json
  }): Promise<void>
}

export class AuditService implements AuditWriter {
  constructor(private readonly repository: AuditStore) {}

  async write(
    actor: Actor,
    action: string,
    entityType: string,
    entityId: string,
    details: Json = {},
  ): Promise<void> {
    requireRole(actor, 'editor')
    try {
      await this.repository.append({
        actor_id: actor.id,
        action,
        entity_type: entityType,
        entity_id: entityId,
        details,
      })
    } catch {
      console.error(
        JSON.stringify({
          event: 'audit_append_failed',
          actorId: actor.id,
          action,
          entityType,
          entityId,
        }),
      )
      throw new ApiError(500, 'The change was saved, but its audit record could not be recorded.')
    }
  }
}
