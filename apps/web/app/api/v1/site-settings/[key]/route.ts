import { requireUser, routeCache } from '@umunara/api'
import { createServiceContext } from '@umunara/api/context'
import { settingKeySchema, siteSettingUpdateSchema } from '@umunara/schemas'
import { jsonResponse, readJson } from '../../../http'

type RouteContext = { params: Promise<{ key: string }> }

export async function GET(_request: Request, route: RouteContext): Promise<Response> {
  return jsonResponse(async () => {
    const key = settingKeySchema.parse((await route.params).key)
    const context = await createServiceContext(routeCache)
    return context.siteSettings.get(await requireUser(context.auth), key)
  })
}

export async function PUT(request: Request, route: RouteContext): Promise<Response> {
  return jsonResponse(async () => {
    const key = settingKeySchema.parse((await route.params).key)
    const input = siteSettingUpdateSchema.parse(await readJson(request))
    const context = await createServiceContext(routeCache)
    return context.siteSettings.update(await requireUser(context.auth), key, input)
  })
}
