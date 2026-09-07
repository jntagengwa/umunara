// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { POST as signIn } from '../app/api/v1/auth/sign-in/route'
import { POST as signUp } from '../app/api/v1/auth/sign-up/route'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ updateTag: vi.fn(), revalidateTag: vi.fn() }))
const provider = vi.hoisted(() => ({ signIn: vi.fn(), signUp: vi.fn() }))
vi.mock('../app/api/v1/auth/service', () => ({ createSessionService: async () => provider }))
const firewall = vi.fn<typeof fetch>()
function request(caller = '203.0.113.1', action = 'sign-in'): Request {
  return new Request('https://umunara.vercel.app/api/v1/auth/' + action, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://umunara.vercel.app',
      'x-vercel-forwarded-for': caller,
      'x-forwarded-for': 'spoofed',
      'x-real-ip': 'spoofed',
      host: 'attacker.test',
      Cookie: 'private-session=secret',
      Authorization: 'Bearer secret',
    },
    body: JSON.stringify({
      email: 'person@example.test',
      password: 'password-for-test',
      ...(action === 'sign-up' ? { fullName: 'Name' } : {}),
    }),
  })
}
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('VERCEL', '1')
  vi.stubEnv('VERCEL_URL', 'umunara.vercel.app')
  vi.stubEnv('AUTH_RATE_LIMIT_ENABLED', '1')
  vi.stubEnv('RATE_LIMIT_SECRET', 'test-secret-that-is-at-least-thirty-two-characters')
  firewall.mockReset().mockResolvedValue(new Response(null, { status: 204 }))
  provider.signIn.mockReset().mockResolvedValue({ redirectTo: '/account' })
  provider.signUp.mockReset().mockResolvedValue({ redirectTo: '/check-email' })
  vi.stubGlobal('fetch', firewall)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it('throttles repeated calls across requests while allowing a different caller before Auth', async () => {
  const managedCounters = new Map<string, number>()
  firewall.mockImplementation(async (_url, init) => {
    const key = new Headers(init?.headers).get('x-vercel-rate-limit-key') ?? ''
    const count = (managedCounters.get(key) ?? 0) + 1
    managedCounters.set(key, count)
    return new Response(null, { status: count > 2 ? 429 : 204 })
  })
  expect((await signIn(request())).status).toBe(200)
  expect((await signIn(request())).status).toBe(200)
  const limited = await signIn(request())
  expect(limited.status).toBe(429)
  expect(limited.headers.get('cache-control')).toContain('no-store')
  expect((await signIn(request('203.0.113.2'))).status).toBe(200)
  expect(provider.signIn).toHaveBeenCalledTimes(3)
  expect(firewall).toHaveBeenCalledTimes(4)
})

it('uses the managed signup rule and sends only trusted minimal metadata to it', async () => {
  expect((await signUp(request('203.0.113.1', 'sign-up'))).status).toBe(201)
  const [url, init] = firewall.mock.calls[0]
  expect(url).toBe(
    'https://umunara.vercel.app/.well-known/vercel/rate-limit-api/umunara-auth-sign-up',
  )
  const headers = new Headers(init?.headers)
  expect(headers.get('x-real-ip')).toBe('203.0.113.1')
  expect(JSON.stringify([...headers])).not.toMatch(
    /spoofed|private-session|Bearer secret|person@example|password-for-test|attacker.test/,
  )
})

it.each(['AUTH_RATE_LIMIT_ENABLED', 'VERCEL', 'VERCEL_URL', 'RATE_LIMIT_SECRET'])(
  'fails closed when %s is missing',
  async (name) => {
    vi.stubEnv(name, '')
    expect((await signIn(request())).status).toBe(503)
    expect(firewall).not.toHaveBeenCalled()
    expect(provider.signIn).not.toHaveBeenCalled()
  },
)

it('rejects spoofable fallback headers and invalid caller chains', async () => {
  for (const caller of ['', '203.0.113.1, 198.51.100.1', 'not-an-ip']) {
    expect((await signIn(request(caller))).status).toBe(503)
  }
  expect(firewall).not.toHaveBeenCalled()
  expect(provider.signIn).not.toHaveBeenCalled()
})

it.each([404, 403, 500])('blocks Auth when managed firewall returns %i', async (status) => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  try {
    firewall.mockResolvedValue(new Response(null, { status }))
    expect((await signIn(request())).status).toBe(status === 403 ? 429 : 503)
    expect(provider.signIn).not.toHaveBeenCalled()
  } finally {
    warning.mockRestore()
  }
})
