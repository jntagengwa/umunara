import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { donationEventResultSchema, donationEventSchema } from '@umunara/schemas'
import type { DonationEventInput, DonationEventResult } from '@umunara/schemas'
import type { Database } from '../database.types'
import { databaseResult } from './result'

export class DonationRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  /** The caller must verify provider authenticity before submitting this snapshot. */
  async recordEvent(event: DonationEventInput): Promise<DonationEventResult> {
    const input = donationEventSchema.parse(event)
    const result = databaseResult(await this.client.rpc('ingest_donation_event', { event_input: input }))
    return donationEventResultSchema.parse(result)
  }

  /** Requires an event envelope: no projection write can bypass event deduplication. */
  async upsertDonation(input: DonationEventInput): Promise<DonationEventResult> {
    return this.recordEvent(input)
  }
}
