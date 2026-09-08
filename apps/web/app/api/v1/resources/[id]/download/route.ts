import { requireUser, routeCache } from '@umunara/api'
import { createServiceContext } from '@umunara/api/context'
import { jsonResponse } from '../../../../http'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return jsonResponse(async () => {
    const context = await createServiceContext(routeCache)
    return context.resources.createDownloadUrl(await requireUser(context.auth), (await params).id)
  })
}
