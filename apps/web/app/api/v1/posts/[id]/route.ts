import { optionalUser, requireUser, routeCache } from '@umunara/api'
import { createServiceContext } from '@umunara/api/context'
import { idSchema, postUpdateSchema } from '@umunara/schemas'
import { jsonResponse, readJson, requireSameOrigin } from '../../../http'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, route: RouteContext): Promise<Response> {
  return jsonResponse(async () => {
    const id = idSchema.parse((await route.params).id)
    const context = await createServiceContext(routeCache)
    return context.posts.get(await optionalUser(context.auth), id)
  })
}

export async function PATCH(request: Request, route: RouteContext): Promise<Response> {
  return jsonResponse(async () => {
    const id = idSchema.parse((await route.params).id)
    const input = postUpdateSchema.parse(await readJson(request))
    const context = await createServiceContext(routeCache)
    return context.posts.update(await requireUser(context.auth), id, input)
  })
}

export async function DELETE(request: Request, route: RouteContext): Promise<Response> {
  return jsonResponse(async () => {
    requireSameOrigin(request)
    const id = idSchema.parse((await route.params).id)
    const context = await createServiceContext(routeCache)
    return context.posts.remove(await requireUser(context.auth), id)
  })
}
