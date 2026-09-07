import type { DonationCadence, DonationProvider, DonationStatus } from '@umunara/schemas'

export interface DonationRow {
  id: string
  provider: DonationProvider
  provider_reference: string
  donor_profile_id: string | null
  gross_amount_minor: number
  fee_amount_minor: number
  refunded_amount_minor: number
  net_amount_minor: number
  currency: string
  status: DonationStatus
  cadence: DonationCadence
  received_at: string
  last_event_at: string
  created_at: string
  updated_at: string
}

export interface DonationEventRow {
  id: string
  donation_id: string
  provider: DonationProvider
  provider_event_id: string
  provider_reference: string
  occurred_at: string
  received_at: string
  status: DonationStatus
  gross_amount_minor: number
  fee_amount_minor: number
  refunded_amount_minor: number
  currency: string
  cadence: DonationCadence
}

export interface DonationAdjustmentRow {
  id: string
  donation_id: string
  event_id: string
  gross_delta_minor: number
  fee_delta_minor: number
  refunded_delta_minor: number
  net_delta_minor: number
  previous_status: DonationStatus | null
  status: DonationStatus
  created_at: string
}
