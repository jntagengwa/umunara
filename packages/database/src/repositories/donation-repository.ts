import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  donationEventResultSchema,
  donationEventSchema,
  payPalReceiptRowSchema,
} from '@umunara/schemas'
import type { DonationEvent, DonationEventInput, DonationEventResult } from '@umunara/schemas'
import type { Database } from '../database.types'
import { databaseResult, RepositoryError } from './result'

export class DonationRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  /** Server ingestion only: retain immutable receipt identity for later adjustments. */
  async findPayPalDonation(reference: string): Promise<DonationEvent | null> {
    const { data, error } = await this.client
      .from('donations')
      .select('*')
      .eq('provider', 'paypal')
      .eq('provider_reference', reference)
      .maybeSingle()
    if (error) throw new RepositoryError(error.code)
    if (!data) return null
    const row = payPalReceiptRowSchema.parse(data)
    return donationEventSchema.parse({
      provider: 'paypal',
      providerEventId: row.id,
      providerReference: row.provider_reference,
      occurredAt: row.last_event_at,
      receivedAt: row.received_at,
      donorProfileId: row.donor_profile_id,
      donation: {
        provider: 'paypal',
        grossAmountMinor: row.gross_amount_minor,
        feeAmountMinor: row.fee_amount_minor,
        refundedAmountMinor: row.refunded_amount_minor,
        netAmountMinor: row.net_amount_minor,
        currency: row.currency,
        status: row.status,
        cadence: row.cadence,
      },
    })
  }

  /** The caller must verify provider authenticity before submitting this snapshot. */
  async recordEvent(event: DonationEventInput): Promise<DonationEventResult> {
    const input = donationEventSchema.parse(event)
    const result = databaseResult(
      await this.client.rpc('ingest_donation_event', { event_input: input })
    )
    return donationEventResultSchema.parse(result)
  }

  /** Requires an event envelope: no projection write can bypass event deduplication. */
  async upsertDonation(input: DonationEventInput): Promise<DonationEventResult> {
    return this.recordEvent(input)
  }
}
