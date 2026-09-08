import { resolveDonationReportRange, type DonationSummaryDto } from '@umunara/schemas'
import { DonationDashboard } from '../../../../features/donations/donation-dashboard'
import { readDonationSummary } from '../../../../lib/donation-reports'
import { requirePageRole } from '../../../../lib/page-access'
import { ApiError } from '@umunara/api'

export default async function DonationReportingPage() {
  const { actor } = await requirePageRole('admin')
  const range = resolveDonationReportRange({})
  let summary: DonationSummaryDto | null = null
  try {
    summary = await readDonationSummary(actor, range)
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 503) throw error
  }
  return <DonationDashboard initialRange={range} initialSummary={summary} />
}
