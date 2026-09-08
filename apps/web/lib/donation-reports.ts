import 'server-only'
import { unstable_cache } from 'next/cache'
import { ApiError, requireRole, type Actor } from '@umunara/api'
import { ReportingService } from '@umunara/api/donations/reporting-service'
import { createAdminClient } from '@umunara/database/admin'
import { DonationReportingRepository, RepositoryError } from '@umunara/database/repositories'
import type { DonationSummaryDto } from '@umunara/schemas'

export async function readDonationSummary(
  actor: Actor,
  input: unknown
): Promise<DonationSummaryDto> {
  requireRole(actor, 'admin')
  try {
    return await new ReportingService(new DonationReportingRepository(createAdminClient()), {
      read: (key, tags, load) => unstable_cache(load, [key], { tags, revalidate: 300 })(),
    }).getSummary(actor, input)
  } catch (error) {
    if (error instanceof RepositoryError)
      throw new ApiError(503, 'Donation reporting is temporarily unavailable.')
    throw error
  }
}
