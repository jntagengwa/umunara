import { optionalUser, requireUser, routeCache } from '@umunara/api'
import { createServiceContext } from '@umunara/api/context'
import { contentQuerySchema, postCreateSchema } from '@umunara/schemas'
import { jsonResponse, readJson } from '../../http'

export async function GET(request: Request): Promise<Response> {
  return jsonResponse(async () => {
    const query = contentQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    const context = await createServiceContext(routeCache)
    return context.posts.list(await optionalUser(context.auth), query)
  })
}

export async function POST(request: Request): Promise<Response> {
  return jsonResponse(async () => {
    const input = postCreateSchema.parse(await readJson(request))
    const context = await createServiceContext(routeCache)
    return context.posts.create(await requireUser(context.auth), input)
  }, 201)
}
