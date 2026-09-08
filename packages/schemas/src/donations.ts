import { z } from 'zod'
import { donationCurrencies } from './donation-currencies'

export const donationProviderSchema = z.enum(['stripe', 'paypal', 'manual', 'bank'])
export const donationStatusSchema = z.enum(['pending', 'succeeded', 'failed', 'refunded', 'reversed'])
export const donationCadenceSchema = z.enum(['one_time', 'monthly', 'yearly'])
export const donationCurrencySchema = z.string().regex(/^[A-Z]{3}$/)
  .refine((value) => donationCurrencies.has(value), 'Expected an ISO 4217 currency code.')
const minorUnits = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

const amounts = {
  provider: donationProviderSchema,
  currency: donationCurrencySchema,
  status: donationStatusSchema,
  cadence: donationCadenceSchema,
  grossAmountMinor: minorUnits,
  feeAmountMinor: minorUnits,
  refundedAmountMinor: minorUnits,
  netAmountMinor: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
}

export const normalizedDonationSchema = z.object(amounts).strict().superRefine((value, ctx) => {
  if (value.refundedAmountMinor > value.grossAmountMinor) {
    ctx.addIssue({ code: 'custom', message: 'Refunds cannot exceed the gift amount.' })
  }
  if (value.netAmountMinor !== value.grossAmountMinor - value.feeAmountMinor - value.refundedAmountMinor) {
    ctx.addIssue({ code: 'custom', message: 'Net amount must equal gross less fees and refunds.' })
  }
  if ((value.status === 'refunded' || value.status === 'reversed') && value.refundedAmountMinor !== value.grossAmountMinor) {
    ctx.addIssue({ code: 'custom', message: 'Refunded or reversed gifts must be fully refunded.' })
  }
  if ((value.status === 'pending' || value.status === 'failed') && (value.feeAmountMinor !== 0 || value.refundedAmountMinor !== 0)) {
    ctx.addIssue({ code: 'custom', message: 'Unsettled gifts cannot carry fees or refunds.' })
  }
})

const normalizationInputSchema = z.object({
  provider: donationProviderSchema,
  amountMinor: minorUnits,
  feeAmountMinor: minorUnits.default(0),
  refundedAmountMinor: minorUnits.default(0),
  currency: z.string().transform((value) => value.toUpperCase()).pipe(donationCurrencySchema),
  status: donationStatusSchema.default('succeeded'),
  cadence: donationCadenceSchema.default('one_time'),
}).strict()

export function normalizeDonation(input: unknown): NormalizedDonation {
  const { amountMinor, ...value } = normalizationInputSchema.parse(input)
  return normalizedDonationSchema.parse({ ...value, grossAmountMinor: amountMinor,
    netAmountMinor: amountMinor - value.feeAmountMinor - value.refundedAmountMinor })
}

// An allowlisted normalized snapshot, never a raw provider payload. Signature
// verification belongs to the later provider adapter before this boundary.
export const donationEventSchema = z.object({
  provider: donationProviderSchema,
  providerEventId: z.string().trim().min(1).max(255),
  providerReference: z.string().trim().min(1).max(255),
  correctsProviderEventId: z.string().trim().min(1).max(255).nullable().default(null),
  occurredAt: z.string().datetime({ offset: true }),
  receivedAt: z.string().datetime({ offset: true }),
  donorProfileId: z.string().uuid().nullable().default(null),
  donation: normalizedDonationSchema,
}).strict().refine((value) => value.provider === value.donation.provider, 'Provider must match the donation.')
  .refine((value) => value.correctsProviderEventId === null || (
    value.correctsProviderEventId !== value.providerEventId && value.donation.status === 'succeeded'
  ), 'A correction must reference another event and reinstate succeeded funds.')

export const donationEventResultSchema = z.object({
  outcome: z.enum(['applied', 'duplicate', 'stale']),
  donationId: z.string().uuid(),
  eventId: z.string().uuid(),
}).strict()

export type DonationProvider = z.infer<typeof donationProviderSchema>
export type DonationStatus = z.infer<typeof donationStatusSchema>
export type DonationCadence = z.infer<typeof donationCadenceSchema>
export type NormalizedDonation = z.infer<typeof normalizedDonationSchema>
export type DonationEventInput = z.input<typeof donationEventSchema>
export type DonationEvent = z.infer<typeof donationEventSchema>
export type DonationEventResult = z.infer<typeof donationEventResultSchema>
