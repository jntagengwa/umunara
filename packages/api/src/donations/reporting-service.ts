import 'server-only'
import {
  donationCadenceSchema,
  donationComparisonRange,
  donationProviderSchema,
  donationReportMonths,
  resolveDonationReportRange,
} from '@umunara/schemas'
import type {
  DonationReportGroup,
  DonationReportRange,
  DonationReportTotals,
  DonationSummaryDto,
} from '@umunara/schemas'
import type { Actor } from '../auth/require-user'
import { requireRole } from '../auth/require-role'
import { ApiError } from '../errors'

export interface DonationReportCache {
  read(
    key: string,
    tags: string[],
    load: () => Promise<DonationSummaryDto>
  ): Promise<DonationSummaryDto>
}

export class ReportingService {
  constructor(
    private readonly repository: {
      aggregate(range: DonationReportRange): Promise<DonationReportGroup[]>
    },
    private readonly cache?: DonationReportCache
  ) {}

  async getSummary(actor: Actor | null, input: unknown): Promise<DonationSummaryDto> {
    // This check must run even when the shared aggregate is already cached.
    requireRole(actor, 'admin')
    const range = resolveDonationReportRange(input)
    const previous = donationComparisonRange(range)
    const rangeTag = `donations:summary:${range.from}:${range.to}`
    const tags = [
      rangeTag,
      ...donationReportMonths({ from: previous.from, to: range.to }).map(
        (month) => `donations:summary:${month}`
      ),
    ]
    const load = async (): Promise<DonationSummaryDto> => {
      const groups = await this.repository.aggregate(range)
      const current = groups.filter((group) => group.period === 'current')
      const total = sum(current)
      const prior = sum(groups.filter((group) => group.period === 'previous'))
      return {
        ...total,
        range,
        comparison: {
          ...previous,
          netAmountMinor: prior.netAmountMinor,
          // A percentage against zero or negative giving is not meaningful.
          growthPercentage:
            prior.netAmountMinor > 0
              ? Math.round(
                  ((total.netAmountMinor - prior.netAmountMinor) / prior.netAmountMinor) * 10000
                ) / 100
              : null,
        },
        monthly: donationReportMonths(range).map((month) => ({
          month,
          ...sum(current.filter((group) => group.month === month)),
        })),
        providerMix: donationProviderSchema.options.map((provider) => ({
          provider,
          ...sum(current.filter((group) => group.provider === provider)),
        })),
        cadenceMix: donationCadenceSchema.options.map((cadence) => ({
          cadence,
          ...sum(current.filter((group) => group.cadence === cadence)),
        })),
      }
    }
    return this.cache ? this.cache.read(`${rangeTag}:${range.currency}`, tags, load) : load()
  }
}

function sum(rows: DonationReportGroup[]): DonationReportTotals {
  function total(key: keyof DonationReportTotals): number {
    const value = rows.reduce((result, row) => result + BigInt(row[key]), 0n)
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER))
      throw new ApiError(503, 'Report amounts exceed the supported range.')
    return Number(value)
  }
  return {
    giftCount: total('giftCount'),
    grossAmountMinor: total('grossAmountMinor'),
    feeAmountMinor: total('feeAmountMinor'),
    refundedAmountMinor: total('refundedAmountMinor'),
    netAmountMinor: total('netAmountMinor'),
  }
}
