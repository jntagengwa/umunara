import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PayPalAdapter } from './paypal-adapter'
import { DonationService } from './donation-service'
import type { DonationEvent } from '@umunara/schemas'

vi.mock('server-only', () => ({}))
const custom = 'umunara:v1:11111111-1111-4111-8111-111111111111:2500:USD:one_time'
const money = (value: string) => ({ value, currency_code: 'USD' })
const capture = {
  id: 'CAPTURE123',
  status: 'COMPLETED',
  amount: money('25.00'),
  custom_id: custom,
  create_time: '2026-09-30T23:00:00Z',
  update_time: '2026-10-02T12:00:00Z',
  seller_receivable_breakdown: { paypal_fee: money('1.00'), net_amount: money('24.00') },
  supplementary_data: { related_ids: { order_id: 'ORDER123' } },
}
const headers = new Headers({
  'paypal-auth-algo': 'SHA256withRSA',
  'paypal-cert-url': 'https://api.paypal.com/v1/notifications/certs/CERT123',
  'paypal-transmission-id': 'transmission123',
  'paypal-transmission-sig': 'fixture-signature',
  'paypal-transmission-time': '2026-10-02T12:00:00Z',
})
const fetcher = vi.fn<typeof fetch>()
let verification = 'SUCCESS'
let events: DonationEvent[] = []
const invalidate = vi.fn()
const seen = new Set<string>()
let verificationBody = ''
let createdBody: Record<string, unknown>
const ledger = {
  recordEvent: vi.fn(async (event: DonationEvent) => {
    const duplicate = seen.has(event.providerEventId)
    seen.add(event.providerEventId)
    events.push(event)
    return {
      outcome: duplicate ? ('duplicate' as const) : ('applied' as const),
      donationId: '11111111-1111-4111-8111-111111111111',
      eventId: '22222222-2222-4222-8222-222222222222',
    }
  }),
  upsertDonation: vi.fn(),
  findPayPalDonation: vi.fn(
    async (id: string) => events.find((e) => e.providerReference === id) ?? null
  ),
}
function adapter() {
  return new PayPalAdapter(
    {
      clientId: 'fixture-client',
      clientSecret: 'fixture-secret',
      webhookId: 'WH123',
      environment: 'sandbox',
      applicationOrigin: 'https://umunara.test',
      monthlyPlanId: 'P-MONTHLY',
      yearlyPlanId: 'P-YEARLY',
    },
    ledger
  )
}
function service() {
  return new DonationService(null, ledger, { invalidate }, adapter())
}
function event(type: string, resource: unknown = capture, id = type) {
  return ` { "id":${JSON.stringify(id)}, "event_type":${JSON.stringify(type)}, "create_time":"2026-10-02T12:01:00Z", "resource":${JSON.stringify(resource)} }\n`
}
beforeEach(() => {
  events = []
  seen.clear()
  verification = 'SUCCESS'
  invalidate.mockClear()
  ledger.recordEvent.mockClear()
  verificationBody = ''
  fetcher.mockReset().mockImplementation(async (input, init) => {
    const path = new URL(String(input)).pathname
    if (path === '/v1/oauth2/token')
      return Response.json({ access_token: 'fixture-access', expires_in: 300 })
    if (path === '/v1/notifications/verify-webhook-signature') {
      verificationBody = String(init?.body)
      return Response.json({ verification_status: verification })
    }
    if (path === '/v2/checkout/orders' || path === '/v1/billing/subscriptions') {
      createdBody = JSON.parse(String(init?.body))
      return Response.json({
        id: 'ORDER123',
        links: [
          { rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER123' },
        ],
      })
    }
    if (path === '/v2/checkout/orders/ORDER123')
      return Response.json({
        id: 'ORDER123',
        intent: 'CAPTURE',
        purchase_units: [{ custom_id: custom, amount: money('25.00') }],
      })
    if (path === '/v2/checkout/orders/ORDER123/capture')
      return Response.json({ id: 'ORDER123', status: 'COMPLETED' })
    if (path === '/v2/payments/captures/CAPTURE123') return Response.json(capture)
    if (path.startsWith('/v1/billing/plans/'))
      return Response.json({
        status: 'ACTIVE',
        billing_cycles: [
          {
            tenure_type: 'REGULAR',
            sequence: 1,
            total_cycles: 0,
            frequency: {
              interval_unit: path.endsWith('MONTHLY') ? 'MONTH' : 'YEAR',
              interval_count: 1,
            },
          },
        ],
        payment_preferences: { setup_fee: money('0.00') },
      })
    if (path === '/v1/billing/subscriptions/I-SUB123')
      return Response.json({ id: 'I-SUB123', custom_id: custom.replace('one_time', 'monthly') })
    throw new Error('Unexpected fixture path: ' + path)
  })
  vi.stubGlobal('fetch', fetcher)
})
afterEach(() => vi.unstubAllGlobals())

it('records a verified reversal against the settled gift without changing its receipt date', async () => {
  const app = service()
  await app.handlePayPalEvent(event('PAYMENT.CAPTURE.COMPLETED'), headers)
  await app.handlePayPalEvent(
    event('PAYMENT.CAPTURE.REVERSED', {
      id: 'REVERSAL123',
      status: 'COMPLETED',
      amount: money('25.00'),
      links: [
        { rel: 'up', href: 'https://api.sandbox.paypal.com/v2/payments/captures/CAPTURE123' },
      ],
    }),
    headers
  )
  expect(events[1]).toMatchObject({
    providerReference: 'CAPTURE123',
    receivedAt: '2026-10-02T12:00:00.000Z',
    donation: {
      status: 'reversed',
      refundedAmountMinor: 2500,
      feeAmountMinor: 100,
      netAmountMinor: -100,
    },
  })
})
it('embeds the exact received JSON in verification and only invalidates applied deliveries', async () => {
  const raw = event('PAYMENT.CAPTURE.COMPLETED')
  await service().handlePayPalEvent(raw, headers)
  await service().handlePayPalEvent(raw, headers)
  expect(verificationBody).toContain('"webhook_event":' + raw)
  expect(events).toHaveLength(2)
  expect(invalidate).toHaveBeenCalledTimes(1)
  expect(invalidate).toHaveBeenCalledWith(['donations:summary:2026-10'])
})
it('rejects failed verification before provider reads or ledger access', async () => {
  verification = 'FAILURE'
  await expect(
    service().handlePayPalEvent(event('PAYMENT.CAPTURE.COMPLETED'), headers)
  ).rejects.toMatchObject({ status: 400 })
  expect(events).toHaveLength(0)
  expect(fetcher).toHaveBeenCalledTimes(2)
})
it('rejects missing headers and malformed payload without provider requests', async () => {
  await expect(service().handlePayPalEvent('{}', new Headers())).rejects.toMatchObject({
    status: 400,
  })
  await expect(service().handlePayPalEvent('{', headers)).rejects.toMatchObject({ status: 400 })
  expect(fetcher).not.toHaveBeenCalled()
})
it('uses cumulative refunds and retries adjustments delivered before completion', async () => {
  const refund = {
    id: 'REFUND123',
    status: 'COMPLETED',
    amount: money('5.00'),
    seller_payable_breakdown: { total_refunded_amount: money('10.00'), paypal_fee: money('0.00') },
    links: [
      { rel: 'up', href: 'https://api-m.sandbox.paypal.com/v2/payments/captures/CAPTURE123' },
    ],
  }
  const app = service()
  await expect(
    app.handlePayPalEvent(event('PAYMENT.CAPTURE.REFUNDED', refund), headers)
  ).rejects.toMatchObject({ status: 503 })
  await app.handlePayPalEvent(event('PAYMENT.CAPTURE.COMPLETED'), headers)
  await app.handlePayPalEvent(event('PAYMENT.CAPTURE.REFUNDED', refund), headers)
  expect(events[1]?.donation).toMatchObject({
    status: 'succeeded',
    refundedAmountMinor: 1000,
    netAmountMinor: 1400,
  })
})
it.each(['one_time', 'monthly', 'yearly'])(
  'creates %s server-owned approval with a narrow response',
  async (cadence) => {
    const result =
      cadence === 'one_time'
        ? await adapter().createOrder({ amountMinor: 2500, currency: 'USD', cadence })
        : await adapter().createSubscription({ amountMinor: 2500, currency: 'USD', cadence })
    expect(result).toMatchObject({
      id: 'ORDER123',
      approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER123',
    })
    expect(JSON.stringify(createdBody)).toContain('25.00')
    expect(JSON.stringify(createdBody)).toContain('https://umunara.test/give?paypal=')
    expect(JSON.stringify(createdBody)).not.toContain('fixture-secret')
  }
)
it('requires a valid order-bound capture capability and never records capture responses as payment success', async () => {
  const api = adapter()
  const order = await api.createOrder({ amountMinor: 2500, currency: 'USD', cadence: 'one_time' })
  await expect(api.captureOrder('ORDER123', 'forged')).rejects.toMatchObject({ status: 403 })
  expect(await api.captureOrder('ORDER123', order.captureToken)).toEqual({ received: true })
  expect(events).toHaveLength(0)
})
it('ignores subscription activation and records sale payments only once', async () => {
  const app = service()
  await app.handlePayPalEvent(event('BILLING.SUBSCRIPTION.ACTIVATED', { id: 'I-SUB123' }), headers)
  const sale = {
    id: 'SALE123',
    state: 'completed',
    billing_agreement_id: 'I-SUB123',
    amount: { total: '25.00', currency: 'USD' },
    transaction_fee: { value: '1.00', currency: 'USD' },
    update_time: '2026-10-02T12:00:00Z',
  }
  await app.handlePayPalEvent(event('PAYMENT.SALE.COMPLETED', sale), headers)
  expect(events).toHaveLength(1)
  expect(events[0]).toMatchObject({
    providerReference: 'SALE123',
    donation: { cadence: 'monthly', netAmountMinor: 2400 },
  })
})
it('keeps failed renewal attempts separate from settled sales', async () => {
  await service().handlePayPalEvent(
    event('BILLING.SUBSCRIPTION.PAYMENT.FAILED', {
      id: 'I-SUB123',
      billing_info: {
        last_failed_payment: { amount: money('25.00'), time: '2026-09-30T23:00:00Z' },
      },
    }),
    headers
  )
  expect(events[0]).toMatchObject({
    providerReference: 'unsettled:I-SUB123:2026-09-30T23:00:00.000Z',
    donation: { status: 'failed', feeAmountMinor: 0 },
  })
})

it('resolves a capture intent from its order when the webhook omits custom_id', async () => {
  const { custom_id, ...resource } = capture
  expect(custom_id).toBe(custom)
  await service().handlePayPalEvent(event('PAYMENT.CAPTURE.COMPLETED', resource), headers)
  expect(events[0]?.donation.netAmountMinor).toBe(2400)
})
it.each(['PENDING', 'DECLINED', 'DENIED'])(
  'records %s capture attempts outside the immutable settled receipt',
  async (status) => {
    const app = service()
    await app.handlePayPalEvent(
      event(`PAYMENT.CAPTURE.${status}`, {
        ...capture,
        status,
        create_time: '2026-09-30T23:00:00Z',
      }),
      headers
    )
    await app.handlePayPalEvent(event('PAYMENT.CAPTURE.COMPLETED'), headers)
    expect(events[0]).toMatchObject({
      providerReference: 'unsettled:CAPTURE123',
      receivedAt: '2026-09-30T23:00:00.000Z',
      donation: { status: status === 'PENDING' ? 'pending' : 'failed', feeAmountMinor: 0 },
    })
    expect(events[1]).toMatchObject({
      providerReference: 'CAPTURE123',
      receivedAt: '2026-10-02T12:00:00.000Z',
    })
  }
)

it('applies verified cumulative partial reversals without marking the full gift reversed', async () => {
  const app = service()
  await app.handlePayPalEvent(event('PAYMENT.CAPTURE.COMPLETED'), headers)
  await app.handlePayPalEvent(
    event('PAYMENT.CAPTURE.REVERSED', {
      id: 'REVERSAL123',
      status: 'COMPLETED',
      amount: money('5.00'),
      seller_payable_breakdown: {
        total_refunded_amount: money('10.00'),
        paypal_fee: money('0.00'),
      },
      links: [
        { rel: 'up', href: 'https://api-m.sandbox.paypal.com/v2/payments/captures/CAPTURE123' },
      ],
    }),
    headers
  )
  expect(events[1]).toMatchObject({
    providerReference: 'CAPTURE123',
    donation: { status: 'succeeded', refundedAmountMinor: 1000, netAmountMinor: 1400 },
  })
})

it('resolves sale reversals by sale_id and validates the original receipt amount', async () => {
  const app = service()
  await app.handlePayPalEvent(
    event('PAYMENT.SALE.COMPLETED', {
      id: 'SALE123',
      state: 'completed',
      billing_agreement_id: 'I-SUB123',
      amount: { total: '25.00', currency: 'USD' },
      transaction_fee: { value: '1.00', currency: 'USD' },
      update_time: '2026-10-02T12:00:00Z',
    }),
    headers
  )
  await app.handlePayPalEvent(
    event('PAYMENT.SALE.REVERSED', {
      id: 'REFUND123',
      sale_id: 'SALE123',
      state: 'completed',
      amount: { total: '25.00', currency: 'USD' },
      links: [{ rel: 'up', href: 'https://api.sandbox.paypal.com/v1/payments/sale/SALE123' }],
    }),
    headers
  )
  expect(events[1]).toMatchObject({
    providerReference: 'SALE123',
    donation: { status: 'reversed', netAmountMinor: -100 },
  })
})

it.each([
  { amount: money('5.00') },
  { amount: { value: '25.00', currency_code: 'EUR' } },
  { amount: money('30.00') },
  { amount: money('0.00') },
  { amount: undefined },
  {
    amount: money('5.00'),
    seller_payable_breakdown: { total_refunded_amount: money('2.00'), paypal_fee: money('0.00') },
  },
  { amount: money('25.00'), capture_id: 'OTHER123' },
])(
  'rejects ambiguous or inconsistent reversal money/identity before ledger writes: %j',
  async (change) => {
    const app = service()
    await app.handlePayPalEvent(event('PAYMENT.CAPTURE.COMPLETED'), headers)
    await expect(
      app.handlePayPalEvent(
        event('PAYMENT.CAPTURE.REVERSED', {
          id: 'REFUND123',
          status: 'COMPLETED',
          links: [
            { rel: 'up', href: 'https://api-m.sandbox.paypal.com/v2/payments/captures/CAPTURE123' },
          ],
          ...change,
        }),
        headers
      )
    ).rejects.toMatchObject({ status: 503 })
    expect(events).toHaveLength(1)
  }
)

it.each(['api.sandbox.paypal.com', 'api-m.sandbox.paypal.com'])(
  'accepts the documented sandbox HATEOAS host %s',
  async (host) => {
    const app = service()
    await app.handlePayPalEvent(event('PAYMENT.CAPTURE.COMPLETED'), headers)
    await app.handlePayPalEvent(
      event('PAYMENT.CAPTURE.REFUNDED', {
        id: 'REFUND123',
        status: 'COMPLETED',
        amount: money('25.00'),
        seller_payable_breakdown: {
          total_refunded_amount: money('25.00'),
          paypal_fee: money('0.00'),
        },
        links: [{ rel: 'up', href: `https://${host}/v2/payments/captures/CAPTURE123` }],
      }),
      headers
    )
    expect(events[1]?.providerReference).toBe('CAPTURE123')
  }
)

it.each([
  'https://api.paypal.com',
  'https://api-m.paypal.com',
  'http://api.sandbox.paypal.com',
  'https://api.sandbox.paypal.com.evil.test',
  'https://api.sandbox.paypal.com:444',
])('rejects mismatched or unsafe HATEOAS origin %s', async (origin) => {
  const app = service()
  await app.handlePayPalEvent(event('PAYMENT.CAPTURE.COMPLETED'), headers)
  await expect(
    app.handlePayPalEvent(
      event('PAYMENT.CAPTURE.REVERSED', {
        id: 'REFUND123',
        status: 'COMPLETED',
        amount: money('25.00'),
        links: [{ rel: 'up', href: `${origin}/v2/payments/captures/CAPTURE123` }],
      }),
      headers
    )
  ).rejects.toMatchObject({ status: 503 })
  expect(events).toHaveLength(1)
})
it('does not manufacture zero fees when settlement fees are absent', async () => {
  const { seller_receivable_breakdown, ...resource } = capture
  expect(seller_receivable_breakdown).toBeDefined()
  await expect(
    service().handlePayPalEvent(event('PAYMENT.CAPTURE.COMPLETED', resource), headers)
  ).rejects.toMatchObject({ status: 503 })
  expect(events).toHaveLength(0)
  await service().handlePayPalEvent(event('PAYMENT.CAPTURE.COMPLETED'), headers)
  expect(events[0]?.donation.feeAmountMinor).toBe(100)
})
it('rejects changed amounts, cross-currency fees, and missing settlement timestamps', async () => {
  for (const resource of [
    { ...capture, amount: money('30.00') },
    { ...capture, update_time: undefined },
    {
      ...capture,
      seller_receivable_breakdown: {
        ...capture.seller_receivable_breakdown,
        paypal_fee: { value: '1.00', currency_code: 'EUR' },
      },
    },
  ]) {
    await expect(
      service().handlePayPalEvent(event('PAYMENT.CAPTURE.COMPLETED', resource), headers)
    ).rejects.toMatchObject({ status: 503 })
  }
  expect(events).toHaveLength(0)
})
it('rejects unsafe approval hosts, extra browser fields and forged capture order IDs', async () => {
  await expect(
    adapter().createOrder({
      amountMinor: 2500,
      currency: 'USD',
      cadence: 'one_time',
      status: 'succeeded',
    })
  ).rejects.toBeDefined()
  const order = await adapter().createOrder({
    amountMinor: 2500,
    currency: 'USD',
    cadence: 'one_time',
  })
  await expect(adapter().captureOrder('OTHER123', order.captureToken)).rejects.toMatchObject({
    status: 403,
  })
  fetcher.mockImplementation(async (input) =>
    new URL(String(input)).pathname === '/v1/oauth2/token'
      ? Response.json({ access_token: 'fixture-access', expires_in: 300 })
      : Response.json({
          id: 'ORDER123',
          links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com.evil.test/steal' }],
        })
  )
  await expect(
    adapter().createOrder({ amountMinor: 2500, currency: 'USD', cadence: 'one_time' })
  ).rejects.toMatchObject({ status: 503 })
})
