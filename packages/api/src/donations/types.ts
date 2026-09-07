import type { DonationEventInput, DonationEventResult } from '@umunara/schemas'

export type { DonationProvider, DonationStatus, DonationCadence, NormalizedDonation,
  DonationEventInput, DonationEventResult } from '@umunara/schemas'

/** Both methods atomically persist an authenticated provider event and projection. */
export interface DonationLedgerRepository {
  recordEvent(event: DonationEventInput): Promise<DonationEventResult>
  upsertDonation(input: DonationEventInput): Promise<DonationEventResult>
}
