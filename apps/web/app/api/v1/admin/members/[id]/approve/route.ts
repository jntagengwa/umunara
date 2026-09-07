import { requireUser, routeCache } from '@umunara/api'
import { createServiceContext } from '@umunara/api/context'
import { jsonResponse, requireSameOrigin } from '../../../../../http'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return jsonResponse(async () => {
    requireSameOrigin(request)
    const context = await createServiceContext(routeCache)
    return context.membership.approve(await requireUser(context.auth), (await params).id)
  })
}
