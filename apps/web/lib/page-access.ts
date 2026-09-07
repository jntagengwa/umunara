import 'server-only'
import { cache } from 'react'
import { notFound, redirect } from 'next/navigation'
import { ApiError, requireRole, requireUser, routeCache, type Actor } from '@umunara/api'
import { createServiceContext, type ServiceContext } from '@umunara/api/context'
import type { Role } from '@umunara/schemas'

const requestContext = cache(async () => {
  const services = await createServiceContext(routeCache)
  const actor = await requireUser(services.auth)
  return { services, actor }
})

export async function requirePageRole(
  role: Role,
): Promise<{ services: ServiceContext; actor: Actor }> {
  try {
    const context = await requestContext()
    requireRole(context.actor, role)
    return context
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect('/sign-in')
    if (error instanceof ApiError && error.status === 403) notFound()
    throw error
  }
}
