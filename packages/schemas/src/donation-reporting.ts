import { z } from 'zod'
import { donationCadenceSchema, donationCurrencySchema, donationProviderSchema } from './donations'

const day = 86_400_000
const reportDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`)
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value &&
      value >= '2000-01-01' &&
      value <= '9998-12-31'
    )
  }, 'Expected a calendar date from 2000 through 9998.')

export const donationReportRangeSchema = z
  .object({
    from: reportDate,
    to: reportDate,
    currency: donationCurrencySchema.default('USD'),
  })
  .strict()
  .refine(({ from, to }) => {
    const days = (Date.parse(to) - Date.parse(from)) / day + 1
    return days >= 1 && days <= 366
  }, 'Choose an inclusive range of 1 to 366 days.')

export type DonationReportRange = z.infer<typeof donationReportRangeSchema>

export function resolveDonationReportRange(input: unknown, now = new Date()): DonationReportRange {
  const value = z
    .object({
      from: reportDate.optional(),
      to: reportDate.optional(),
      currency: donationCurrencySchema.optional(),
    })
    .strict()
    .parse(input)
  const today = now.toISOString().slice(0, 10)
  return donationReportRangeSchema.parse(
    value.from === undefined && value.to === undefined
      ? { ...value, from: `${today.slice(0, 4)}-01-01`, to: today }
      : value
  )
}

export function donationComparisonRange(range: DonationReportRange): { from: string; to: string } {
  const start = Date.parse(range.from)
  const duration = Date.parse(range.to) - start + day
  return {
    from: new Date(start - duration).toISOString().slice(0, 10),
    to: new Date(start - day).toISOString().slice(0, 10),
  }
}

export function donationReportMonths(range: { from: string; to: string }): string[] {
  const months: string[] = []
  const cursor = new Date(`${range.from.slice(0, 7)}-01T00:00:00Z`)
  while (cursor.toISOString().slice(0, 7) <= range.to.slice(0, 7)) {
    months.push(cursor.toISOString().slice(0, 7))
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return months
}

const integer = z.number().int().safe()
const positive = integer.nonnegative()
export const donationReportTotalsSchema = z
  .object({
    giftCount: positive,
    grossAmountMinor: positive,
    feeAmountMinor: positive,
    refundedAmountMinor: positive,
    netAmountMinor: integer,
  })
  .strict()
export type DonationReportTotals = z.infer<typeof donationReportTotalsSchema>

// PostgreSQL sums are decimal strings, so JSON parsing never rounds bigint totals.
const databaseInteger = z
  .string()
  .regex(/^-?\d+$/)
  .transform(Number)
  .pipe(integer)
export const donationReportGroupsSchema = z.array(
  z
    .object({
      period: z.enum(['current', 'previous']),
      month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      provider: donationProviderSchema,
      cadence: donationCadenceSchema,
      giftCount: databaseInteger.pipe(positive),
      grossAmountMinor: databaseInteger.pipe(positive),
      feeAmountMinor: databaseInteger.pipe(positive),
      refundedAmountMinor: databaseInteger.pipe(positive),
      netAmountMinor: databaseInteger,
    })
    .strict()
    .refine(
      (value) =>
        BigInt(value.netAmountMinor) ===
        BigInt(value.grossAmountMinor) -
          BigInt(value.feeAmountMinor) -
          BigInt(value.refundedAmountMinor),
      'Invalid report totals.'
    )
)
export type DonationReportGroup = z.infer<typeof donationReportGroupsSchema>[number]

export const donationSummarySchema = donationReportTotalsSchema
  .extend({
    range: donationReportRangeSchema,
    comparison: z
      .object({
        from: z.string(),
        to: z.string(),
        netAmountMinor: integer,
        growthPercentage: z.number().finite().nullable(),
      })
      .strict(),
    monthly: z.array(donationReportTotalsSchema.extend({ month: z.string() })),
    providerMix: z.array(donationReportTotalsSchema.extend({ provider: donationProviderSchema })),
    cadenceMix: z.array(donationReportTotalsSchema.extend({ cadence: donationCadenceSchema })),
  })
  .strict()
export type DonationSummaryDto = z.infer<typeof donationSummarySchema>
