import 'server-only'
import { isIP } from 'node:net'
import { checkRateLimit } from '@vercel/firewall'
import { ApiError } from '@umunara/api'

export async function requireAuthRateLimit(
  request: Request,
  action: 'sign-in' | 'sign-up',
): Promise<void> {
  const host = process.env.VERCEL_URL
  // Only Vercel's ingress is trusted to overwrite this header. There is no local bypass.
  const caller = request.headers.get('x-vercel-forwarded-for')
  if (
    process.env.AUTH_RATE_LIMIT_ENABLED !== '1' ||
    process.env.VERCEL !== '1' ||
    process.env.NODE_ENV !== 'production' ||
    !host ||
    !/^[a-z0-9-]+\.vercel\.app$/i.test(host) ||
    !caller ||
    !isIP(caller) ||
    (process.env.RATE_LIMIT_SECRET?.length ?? 0) < 32
  )
    throw new ApiError(503, 'Account access is temporarily unavailable. Please try again later.')

  let result: Awaited<ReturnType<typeof checkRateLimit>>
  try {
    result = await checkRateLimit(`umunara-auth-${action}`, {
      rateLimitKey: caller,
      // Never forward credentials, cookies, arbitrary headers, or a client-controlled host.
      headers: new Headers({ host, 'x-real-ip': caller, 'x-forwarded-for': caller }),
    })
  } catch {
    throw new ApiError(503, 'Account access is temporarily unavailable. Please try again later.')
  }
  if (result.error === 'not-found')
    throw new ApiError(503, 'Account access is temporarily unavailable. Please try again later.')
  if (result.rateLimited || result.error)
    throw new ApiError(429, 'Too many attempts. Please wait before trying again.')
}
