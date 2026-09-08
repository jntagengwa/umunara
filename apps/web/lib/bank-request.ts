import 'server-only'
import { requireRole, requireUser, routeCache, type Actor } from '@umunara/api'
import { createServiceContext } from '@umunara/api/context'
import { requireSameOrigin } from '../app/api/http'
import { requireRequestRateLimit } from './request-rate-limit'

export async function requireBankAdmin(request: Request): Promise<Actor> {
  requireSameOrigin(request)
  const services = await createServiceContext(routeCache)
  const actor = await requireUser(services.auth)
  requireRole(actor, 'admin')
  await requireRequestRateLimit(request, {
    rule: 'umunara-bank-connection',
    enabled: process.env.BANK_RATE_LIMIT_ENABLED === '1',
    unavailableMessage: 'Bank connections are temporarily unavailable.',
  })
  return actor
}
