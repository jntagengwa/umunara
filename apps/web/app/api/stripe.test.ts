// @vitest-environment node
import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { POST as checkout } from './v1/donations/stripe/checkout/route'
import { POST as webhook } from './v1/webhooks/stripe/route'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), updateTag: vi.fn() }))
const provider = vi.fn<typeof fetch>()
function request(
  body: unknown = { amountMinor: 2500, currency: 'USD', cadence: 'monthly' }
): Request {
  return new Request('https://umunara.test/api/v1/donations/stripe/checkout', {
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
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('VERCEL', '1')
  vi.stubEnv('VERCEL_URL', 'umunara-e2e.vercel.app')
  vi.stubEnv('DONATION_RATE_LIMIT_ENABLED', '1')
  vi.stubEnv('RATE_LIMIT_SECRET', 'fixture-secret-at-least-thirty-two-characters')
  vi.stubEnv('STRIPE_RESTRICTED_KEY', 'rk_test_fixture_only')
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_fixture_only')
  vi.stubEnv('DONATION_APPLICATION_ORIGIN', 'https://umunara.test')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://database.test')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fixture-service-key')
  provider.mockReset().mockImplementation(async (input) => {
    if (String(input).includes('/rate-limit-api/')) return new Response(null, { status: 204 })
    return Response.json({ url: 'https://checkout.stripe.com/c/pay/cs_fixture' })
  })
  vi.stubGlobal('fetch', provider)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

it('returns only a private checkout URL through the application API', async () => {
  const response = await checkout(request())
  expect(response.status).toBe(201)
  expect(response.headers.get('cache-control')).toContain('no-store')
  expect(await response.json()).toEqual({
    checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_fixture',
  })
  expect(provider.mock.calls.map(([url]) => String(url))).toEqual([
    'https://umunara-e2e.vercel.app/.well-known/vercel/rate-limit-api/umunara-donation-checkout',
    'https://api.stripe.com/v1/checkout/sessions',
  ])
})

it('rejects cross-origin and malformed intents before any provider request', async () => {
  const foreign = request()
  foreign.headers.set('origin', 'https://evil.test')
  expect((await checkout(foreign)).status).toBe(403)
  expect((await checkout(request({ amountMinor: 0 }))).status).toBe(400)
  expect(
    (
      await checkout(
        request({
          amountMinor: 2500,
          currency: 'USD',
          cadence: 'monthly',
          donorProfileId: 'forged',
        })
      )
    ).status
  ).toBe(400)
  expect(provider).not.toHaveBeenCalled()
})

it('blocks checkout if its managed limit is unavailable or reached', async () => {
  vi.stubEnv('DONATION_RATE_LIMIT_ENABLED', '')
  expect((await checkout(request())).status).toBe(503)
  expect(provider).not.toHaveBeenCalled()
  vi.stubEnv('DONATION_RATE_LIMIT_ENABLED', '1')
  provider.mockResolvedValue(new Response(null, { status: 429 }))
  expect((await checkout(request())).status).toBe(429)
  expect(provider).toHaveBeenCalledTimes(1)
})

it('requires restricted credentials and masks checkout provider failures', async () => {
  vi.stubEnv('STRIPE_RESTRICTED_KEY', 'sk_test_fixture_only')
  expect((await checkout(request())).status).toBe(503)
  vi.stubEnv('STRIPE_RESTRICTED_KEY', 'rk_test_fixture_only')
  provider.mockImplementation(async (url) =>
    String(url).includes('/rate-limit-api/')
      ? new Response(null, { status: 204 })
      : Response.json(
          { error: { message: 'secret_provider_details', type: 'invalid_request_error' } },
          { status: 400 }
        )
  )
  const response = await checkout(request())
  expect(response.status).toBe(503)
  expect(await response.text()).not.toMatch(/secret_provider|rk_test|whsec/)
})

it('verifies exact raw webhook text and does not use browser CSRF checks', async () => {
  const raw =
    '{ "id":"evt_ignored", "type":"customer.created", "livemode":false, "api_version":"2026-08-26.dahlia", "data":{"object":{}} }'
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = `t=${timestamp},v1=${createHmac('sha256', 'whsec_fixture_only').update(`${timestamp}.${raw}`).digest('hex')}`
  const response = await webhook(
    new Request('https://umunara.test/api/v1/webhooks/stripe', {
      method: 'POST',
      headers: { 'Stripe-Signature': signature },
      body: raw,
    })
  )
  expect(response.status).toBe(200)
  expect(provider).not.toHaveBeenCalled()
  const invalid = await webhook(
    new Request('https://umunara.test/api/v1/webhooks/stripe', {
      method: 'POST',
      headers: { 'Stripe-Signature': signature },
      body: raw + ' ',
    })
  )
  expect(invalid.status).toBe(400)
  expect(
    (
      await webhook(
        new Request('https://umunara.test/api/v1/webhooks/stripe', { method: 'POST', body: raw })
      )
    ).status
  ).toBe(400)
  expect(provider).not.toHaveBeenCalled()
})
