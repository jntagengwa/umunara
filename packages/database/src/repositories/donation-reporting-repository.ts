import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { donationReportGroupsSchema, donationReportRangeSchema } from '@umunara/schemas'
import type { DonationReportGroup, DonationReportRange } from '@umunara/schemas'
import type { Database } from '../database.types'
import { databaseResult, RepositoryError } from './result'

export class DonationReportingRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async aggregate(range: DonationReportRange): Promise<DonationReportGroup[]> {
    const { from, to, currency } = donationReportRangeSchema.parse(range)
    const result = databaseResult(
      await this.client.rpc('donation_report', {
        report_from: from,
        report_to: to,
        report_currency: currency,
      })
    )
    const parsed = donationReportGroupsSchema.safeParse(result)
    if (!parsed.success) throw new RepositoryError('INVALID_REPORT')
    return parsed.data
  }
}
