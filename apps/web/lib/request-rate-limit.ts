import 'server-only'
import { isIP } from 'node:net'
import { checkRateLimit } from '@vercel/firewall'
import { ApiError } from '@umunara/api'

export async function requireRequestRateLimit(
  request: Request,
  options: {
    rule: string
    enabled: boolean
    unavailableMessage: string
  }
): Promise<void> {
  const host = process.env.VERCEL_URL
  // Only Vercel's ingress is trusted to overwrite this header. There is no local bypass.
  const caller = request.headers.get('x-vercel-forwarded-for')
  if (
    !options.enabled ||
    process.env.VERCEL !== '1' ||
    process.env.NODE_ENV !== 'production' ||
    !host ||
    !/^[a-z0-9-]+\.vercel\.app$/i.test(host) ||
    !caller ||
    !isIP(caller) ||
    (process.env.RATE_LIMIT_SECRET?.length ?? 0) < 32
  ) {
    throw new ApiError(503, options.unavailableMessage)
  }
  let result: Awaited<ReturnType<typeof checkRateLimit>>
  try {
    result = await checkRateLimit(options.rule, {
      rateLimitKey: caller,
      // Never forward credentials, cookies, arbitrary headers, or a client-controlled host.
      headers: new Headers({ host, 'x-real-ip': caller, 'x-forwarded-for': caller }),
    })
  } catch {
    throw new ApiError(503, options.unavailableMessage)
  }
  if (result.error === 'not-found') throw new ApiError(503, options.unavailableMessage)
  if (result.rateLimited || result.error)
    throw new ApiError(429, 'Too many attempts. Please wait before trying again.')
}
