// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { POST as order } from './v1/donations/paypal/order/route'
import { POST as capture } from './v1/donations/paypal/order/[id]/capture/route'
import { POST as webhook } from './v1/webhooks/paypal/route'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), updateTag: vi.fn() }))
const provider = vi.fn<typeof fetch>()
function request(
  body: unknown = { amountMinor: 2500, currency: 'USD', cadence: 'one_time' }
): Request {
  return new Request('https://umunara.test/api/v1/donations/paypal/order', {
    method: 'POST',
    headers: {
      Origin: 'https://umunara.test',
      'Content-Type': 'application/json',
      'x-vercel-forwarded-for': '203.0.113.1',
    },
    body: JSON.stringify(body),
  })
}
beforeEach(() => {
  for (const [key, value] of Object.entries({
    NODE_ENV: 'production',
    VERCEL: '1',
    VERCEL_URL: 'umunara-e2e.vercel.app',
    DONATION_RATE_LIMIT_ENABLED: '1',
    RATE_LIMIT_SECRET: 'fixture-secret-at-least-thirty-two-characters',
    PAYPAL_CLIENT_ID: 'fixture-client',
    PAYPAL_CLIENT_SECRET: 'fixture-secret',
    PAYPAL_WEBHOOK_ID: 'WH123',
    PAYPAL_ENVIRONMENT: 'sandbox',
    DONATION_APPLICATION_ORIGIN: 'https://umunara.test',
    NEXT_PUBLIC_SUPABASE_URL: 'http://database.test',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key',
  }))
    vi.stubEnv(key, value)
  provider.mockReset().mockImplementation(async (input) => {
    const path = new URL(String(input)).pathname
    if (path.includes('/rate-limit-api/')) return new Response(null, { status: 204 })
    if (path === '/v1/oauth2/token')
      return Response.json({ access_token: 'fixture-access', expires_in: 300 })
    if (path === '/v2/checkout/orders')
      return Response.json({
        id: 'ORDER123',
        links: [
          { rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER123' },
        ],
      })
    if (path === '/v1/notifications/verify-webhook-signature')
      return Response.json({ verification_status: 'FAILURE' })
    throw new Error('Unexpected provider request')
  })
  vi.stubGlobal('fetch', provider)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

it('returns only approval data and keeps capture capability in a secure HttpOnly cookie', async () => {
  const response = await order(request())
  expect(response.status).toBe(201)
  expect(await response.json()).toEqual({
    id: 'ORDER123',
    approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER123',
  })
  expect(response.headers.get('set-cookie')).toMatch(/HttpOnly/)
  expect(response.headers.get('set-cookie')).toMatch(/Secure/)
  expect(response.headers.get('set-cookie')).toMatch(/SameSite=Lax/)
  expect(response.headers.get('cache-control')).toContain('no-store')
})
it('rejects cross-origin requests, arbitrary browser fields, and missing capture capability', async () => {
  const foreign = request()
  foreign.headers.set('origin', 'https://evil.test')
  expect((await order(foreign)).status).toBe(403)
  expect(
    (
      await order(
        request({
          amountMinor: 2500,
          currency: 'USD',
          cadence: 'one_time',
          returnUrl: 'https://evil.test',
        })
      )
    ).status
  ).toBe(400)
  expect((await capture(request({}), { params: Promise.resolve({ id: 'ORDER123' }) })).status).toBe(
    403
  )
  expect(provider.mock.calls.some(([url]) => String(url).includes('/v2/'))).toBe(false)
})
it('fails closed when managed limits or credentials are missing', async () => {
  vi.stubEnv('DONATION_RATE_LIMIT_ENABLED', '')
  expect((await order(request())).status).toBe(503)
  expect(provider).not.toHaveBeenCalled()
  vi.stubEnv('DONATION_RATE_LIMIT_ENABLED', '1')
  vi.stubEnv('PAYPAL_CLIENT_SECRET', '')
  expect((await order(request())).status).toBe(503)
})
it('rejects invalid webhook signatures without exposing headers or payloads', async () => {
  const response = await webhook(
    new Request('https://umunara.test/api/v1/webhooks/paypal', {
      method: 'POST',
      body: '{"private":"value"}',
      headers: {
        'paypal-auth-algo': 'SHA256withRSA',
        'paypal-cert-url': 'https://api.paypal.com/v1/notifications/certs/CERT123',
        'paypal-transmission-id': 'transmission123',
        'paypal-transmission-sig': 'secret-signature',
        'paypal-transmission-time': '2026-10-02T12:00:00Z',
      },
    })
  )
  expect(response.status).toBe(400)
  expect(await response.text()).not.toMatch(/private|value|secret-signature/)
})
