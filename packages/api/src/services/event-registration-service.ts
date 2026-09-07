import 'server-only'
import type { EventRegistrationRow } from '@umunara/database'
import { RepositoryError } from '@umunara/database/repositories'
import { idSchema, type EventRegistrationDto } from '@umunara/schemas'
import type { Actor } from '../auth/require-user'
import { requireRole } from '../auth/require-role'
import { ApiError } from '../errors'

export interface EventRegistrationStore {
  register(eventId: string): Promise<EventRegistrationRow>
}

export class EventRegistrationService {
  constructor(private readonly repository: EventRegistrationStore) {}

  async register(member: Actor, eventId: string): Promise<EventRegistrationDto> {
    requireRole(member, 'member')
    idSchema.parse(eventId)
    try {
      const row = await this.repository.register(eventId)
      return {
        id: row.id,
        eventId: row.event_id,
        profileId: row.profile_id,
        status: row.status,
        registeredAt: row.registered_at,
      }
    } catch (error) {
      if (error instanceof RepositoryError && error.code === 'P0001') {
        throw new ApiError(409, 'This event is fully booked.')
      }
      throw error
    }
  }
}
