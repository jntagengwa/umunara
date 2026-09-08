import { ApiError, requireRole, requireUser, routeCache } from '@umunara/api'
import { createServiceContext } from '@umunara/api/context'
import { readDonationSummary } from '../../../../../../lib/donation-reports'
import { jsonResponse } from '../../../../http'

export async function GET(request: Request): Promise<Response> {
  return jsonResponse(async () => {
    const context = await createServiceContext(routeCache)
    const actor = await requireUser(context.auth)
    requireRole(actor, 'admin')
    const query = new URL(request.url).searchParams
    if ([...query.keys()].some((key) => query.getAll(key).length !== 1))
      throw new ApiError(400, 'Each report filter may appear only once.')
    return readDonationSummary(actor, Object.fromEntries(query))
  })
}
