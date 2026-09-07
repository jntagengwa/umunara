import 'server-only'
import { requireRequestRateLimit } from './request-rate-limit'

export async function requireAuthRateLimit(
  request: Request,
  action: 'sign-in' | 'sign-up',
): Promise<void> {
  await requireRequestRateLimit(request, {
    rule: `umunara-auth-${action}`,
    enabled: process.env.AUTH_RATE_LIMIT_ENABLED === '1',
    unavailableMessage: 'Account access is temporarily unavailable. Please try again later.',
  })
}
