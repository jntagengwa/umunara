import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, EventRegistrationRow } from '../database.types'
import { databaseResult } from './result'

export class EventRegistrationRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async register(eventId: string): Promise<EventRegistrationRow> {
    return databaseResult(await this.client.rpc('register_for_event', { target_event_id: eventId }))
  }
}
