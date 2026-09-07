import { createHmac, randomUUID } from 'node:crypto'
import StripeClient from 'stripe'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DonationRepository } from '@umunara/database/repositories'
import { createAdminClient } from '@umunara/database/admin'
import { donationEventSchema, type DonationEvent } from '@umunara/schemas'
import { StripeAdapter } from './stripe-adapter'
import { DonationService } from './donation-service'

vi.mock('server-only', () => ({}))
const secret = 'whsec_fixture_only'
const metadata = {
  donation_intent_id: '11111111-1111-4111-8111-111111111111',
  purpose: 'umunara_donation',
  amount_minor: '2500',
  currency: 'USD',
  cadence: 'one_time',
}
const created = 1788825600
const payment = {
  id: 'pi_gift',
  object: 'payment_intent',
  created,
  amount: 2500,
  currency: 'usd',
  status: 'succeeded',
  metadata,
  latest_charge: {
    id: 'ch_gift',
    amount: 2500,
    amount_refunded: 0,
    currency: 'usd',
    paid: true,
    balance_transaction: { fee: 100, currency: 'usd', created: created + 60 },
  },
}
const invoice = {
  id: 'in_gift',
  object: 'invoice',
  created,
  amount_due: 2500,
  amount_paid: 2500,
  currency: 'usd',
  status: 'paid',
  status_transitions: { paid_at: created + 60 },
  parent: {
    subscription_details: { metadata: { ...metadata, cadence: 'monthly' } },
  },
}
const fetcher = vi.fn<typeof fetch>()
const invalidations: string[][] = []
let events: DonationEvent[] = []
const projections = new Map<string, DonationEvent>()
let applied = new Set<string>()
let checkoutBody: URLSearchParams
type PaymentFixture = Omit<typeof payment, 'latest_charge'> & {
  latest_charge: Omit<typeof payment.latest_charge, 'balance_transaction'> & {
    balance_transaction?: typeof payment.latest_charge.balance_transaction | null
  }
}
let currentPayment: PaymentFixture = payment
let currentInvoice: Omit<typeof invoice, 'status_transitions'> & {
  status_transitions: { paid_at: number | null }
} = invoice
let failLedger = false
let staleLedger = false
function signed(
  type: string,
  object: unknown,
  id = 'evt_gift',
  timestamp = Math.floor(Date.now() / 1000),
  occurredAt = created + 60
) {
  const raw = JSON.stringify({
    id,
    object: 'event',
    type,
    created: occurredAt,
    livemode: false,
    api_version: '2026-08-26.dahlia',
    data: { object },
  })
  return [
    raw,
    `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex')}`,
  ] as const
}
function service() {
  const stripe = new StripeClient('fixture-key', {
    httpClient: StripeClient.createFetchHttpClient(fetcher),
    maxNetworkRetries: 0,
  })
  return new DonationService(
    new StripeAdapter(stripe, secret, 'https://umunara.test', false),
    new DonationRepository(createAdminClient()),
    { invalidate: (tags) => invalidations.push([...tags]) }
  )
}
beforeEach(() => {
  events = []
  projections.clear()
  applied = new Set()
  invalidations.length = 0
  currentPayment = structuredClone(payment)
  currentInvoice = structuredClone(invoice)
  failLedger = false
  staleLedger = false
  checkoutBody = new URLSearchParams()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://database.test')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fixture-service-key')
  fetcher.mockReset().mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    if (url.pathname === '/v1/checkout/sessions') {
      checkoutBody = new URLSearchParams(String(init?.body))
      return Response.json({ url: 'https://checkout.stripe.com/c/pay/cs_fixture' })
    }
    if (url.pathname === '/v1/payment_intents/pi_gift') return Response.json(currentPayment)
    if (url.pathname === '/v1/invoices/in_gift') return Response.json(currentInvoice)
    if (url.pathname === '/v1/invoice_payments')
      return Response.json({
        data: [
          {
            invoice: 'in_gift',
            payment: { type: 'payment_intent', payment_intent: 'pi_gift' },
          },
        ],
        has_more: false,
      })
    if (url.pathname === '/rest/v1/rpc/ingest_donation_event') {
      if (failLedger)
        return Response.json({ code: 'XX000', message: 'private provider data' }, { status: 500 })
      const event = donationEventSchema.parse(JSON.parse(String(init?.body)).event_input)
      events.push(event)
      const outcome = applied.has(event.providerEventId)
        ? 'duplicate'
        : staleLedger
          ? 'stale'
          : 'applied'
      const previous = projections.get(event.providerReference)
      if (previous && previous.receivedAt !== event.receivedAt) {
        return Response.json(
          { code: '22023', message: 'Donation identity cannot change.' },
          { status: 400 }
        )
      }
      applied.add(event.providerEventId)
      if (outcome === 'applied') projections.set(event.providerReference, event)
      return Response.json({ outcome, donationId: randomUUID(), eventId: randomUUID() })
    }
    throw new Error(`Unexpected fixture request: ${url.pathname}`)
  })
  vi.stubGlobal('fetch', fetcher)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it('uses one atomic ledger call per verified delivery, with only one cache invalidation on duplicates', async () => {
  const app = service()
  const event = signed('checkout.session.completed', { mode: 'payment', payment_intent: 'pi_gift' })
  await app.handleStripeEvent(...event)
  await app.handleStripeEvent(...event)
  expect(events).toHaveLength(2)
  expect(events[0]).toMatchObject({
    providerReference: 'pi_gift',
    receivedAt: '2026-09-08T00:01:00.000Z',
    donation: {
      grossAmountMinor: 2500,
      feeAmountMinor: 100,
      netAmountMinor: 2400,
      status: 'succeeded',
    },
  })
  expect(invalidations).toEqual([['donations:summary:2026-09']])
})

it('rejects a tampered raw body and expired signature before network or ledger access', async () => {
  const app = service()
  const [raw, signature] = signed('checkout.session.completed', {})
  await expect(app.handleStripeEvent(raw + ' ', signature)).rejects.toMatchObject({ status: 400 })
  await expect(
    app.handleStripeEvent(...signed('checkout.session.completed', {}, 'evt_old', 1))
  ).rejects.toMatchObject({ status: 400 })
  expect(fetcher).not.toHaveBeenCalled()
})

it.each(['one_time', 'monthly', 'yearly'] as const)(
  'creates %s hosted checkout with immutable metadata and fixed redirects',
  async (cadence) => {
    const result = await service().createStripeCheckout({
      amountMinor: 2500,
      currency: 'USD',
      cadence,
    })
    expect(result).toEqual({ checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_fixture' })
    expect(checkoutBody.get('mode')).toBe(cadence === 'one_time' ? 'payment' : 'subscription')
    expect(checkoutBody.get('success_url')).toBe('https://umunara.test/give?checkout=returned')
    expect(checkoutBody.get('cancel_url')).toBe('https://umunara.test/give?checkout=cancelled')
    expect(checkoutBody.get('metadata[donation_intent_id]')).toMatch(/^[0-9a-f-]{36}$/)
    expect(checkoutBody.get('line_items[0][price_data][unit_amount]')).toBe('2500')
    expect(checkoutBody.get('adaptive_pricing[enabled]')).toBe('false')
    expect(checkoutBody.toString()).not.toMatch(/payment_method_types|automatic_tax/)
    expect(checkoutBody.get('integration_identifier')).toMatch(/^umunara_donations_[a-z]{8}$/)
  }
)

it('rejects an unsafe hosted checkout URL without exposing the provider response', async () => {
  fetcher.mockResolvedValue(Response.json({ url: 'https://checkout.stripe.com.evil.test/steal' }))
  await expect(
    service().createStripeCheckout({ amountMinor: 2500, currency: 'USD', cadence: 'one_time' })
  ).rejects.toMatchObject({ status: 503 })
})

it('does not invalidate stale ledger snapshots', async () => {
  staleLedger = true
  await service().handleStripeEvent(...signed('payment_intent.succeeded', { id: 'pi_gift' }))
  expect(events).toHaveLength(1)
  expect(invalidations).toEqual([])
})

it('ignores signed non-donation payments without writing a ledger row', async () => {
  currentPayment.metadata.purpose = 'other_application'
  await service().handleStripeEvent(...signed('payment_intent.succeeded', { id: 'pi_gift' }))
  expect(events).toHaveLength(0)
  expect(invalidations).toEqual([])
})

it('refuses changed gift identity and cross-currency fees instead of recording incorrect net giving', async () => {
  const event = signed('payment_intent.succeeded', { id: 'pi_gift' })
  currentPayment.amount = 3000
  await expect(service().handleStripeEvent(...event)).rejects.toMatchObject({ status: 503 })
  currentPayment.amount = 2500
  currentPayment.latest_charge.balance_transaction = {
    fee: 100,
    currency: 'eur',
    created: created + 60,
  }
  await expect(service().handleStripeEvent(...event)).rejects.toMatchObject({ status: 503 })
  expect(events).toHaveLength(0)
})

it('retains current refund state when an older completion is delivered', async () => {
  currentPayment.latest_charge.amount_refunded = 500
  await service().handleStripeEvent(
    ...signed('checkout.session.completed', { mode: 'payment', payment_intent: 'pi_gift' })
  )
  expect(events[0]).toMatchObject({
    donation: { status: 'succeeded', refundedAmountMinor: 500, netAmountMinor: 1900 },
  })
})

it('rejects fractional, zero and extra browser-controlled intent properties before creating checkout', async () => {
  for (const input of [
    { amountMinor: 1.2 },
    { amountMinor: 0 },
    { amountMinor: 2500, successUrl: 'https://evil.test' },
  ]) {
    await expect(
      service().createStripeCheckout({ currency: 'USD', cadence: 'one_time', ...input })
    ).rejects.toBeDefined()
  }
  expect(fetcher).not.toHaveBeenCalled()
})

it('maps a refund to the original gift and keeps retained processing fees', async () => {
  currentPayment.latest_charge.amount_refunded = 2500
  await service().handleStripeEvent(...signed('charge.refunded', { payment_intent: 'pi_gift' }))
  expect(events[0]).toMatchObject({
    providerReference: 'pi_gift',
    donation: {
      status: 'refunded',
      grossAmountMinor: 2500,
      refundedAmountMinor: 2500,
      netAmountMinor: -100,
    },
  })
})

it('records monthly invoice success once and ignores subscription checkout completion', async () => {
  const app = service()
  await app.handleStripeEvent(...signed('checkout.session.completed', { mode: 'subscription' }))
  expect(events).toHaveLength(0)
  await app.handleStripeEvent(...signed('invoice.payment_succeeded', { id: 'in_gift' }))
  expect(events[0]).toMatchObject({
    providerReference: 'in_gift',
    donation: {
      status: 'succeeded',
      cadence: 'monthly',
      grossAmountMinor: 2500,
      feeAmountMinor: 100,
    },
  })
})

it('links recurring refunds back to their invoice without creating another gift', async () => {
  currentPayment.metadata = { ...metadata, purpose: '' }
  currentPayment.latest_charge.amount_refunded = 500
  await service().handleStripeEvent(...signed('charge.refunded', { payment_intent: 'pi_gift' }))
  expect(events[0]).toMatchObject({
    providerReference: 'in_gift',
    donation: {
      status: 'succeeded',
      cadence: 'monthly',
      refundedAmountMinor: 500,
      netAmountMinor: 1900,
    },
  })
})

it('records failed recurring attempts without fees or recognized refunds', async () => {
  currentInvoice.status = 'open'
  currentInvoice.amount_paid = 0
  await service().handleStripeEvent(...signed('invoice.payment_failed', { id: 'in_gift' }))
  expect(events[0]).toMatchObject({
    providerReference: 'unsettled:in_gift',
    donation: { status: 'failed', feeAmountMinor: 0 },
  })
})

it.each(['one_time', 'monthly'] as const)(
  'attributes %s September failures paid October 2 to October without changing an immutable receipt',
  async (cadence) => {
    const recurring = cadence === 'monthly'
    const reference = recurring ? 'in_gift' : 'pi_gift'
    const failureType = recurring ? 'invoice.payment_failed' : 'payment_intent.payment_failed'
    const successType = recurring ? 'invoice.payment_succeeded' : 'payment_intent.succeeded'
    const settled = Date.parse('2026-10-02T12:00:00Z') / 1000
    currentPayment.status = 'requires_payment_method'
    currentInvoice.status = 'open'
    currentInvoice.amount_paid = 0
    const app = service()
    await app.handleStripeEvent(...signed(failureType, { id: reference }, 'evt_failure'))
    expect(projections.get(`unsettled:${reference}`)).toMatchObject({
      receivedAt: '2026-09-08T00:00:00.000Z',
      donation: { status: 'failed', feeAmountMinor: 0 },
    })
    currentPayment.status = 'succeeded'
    currentPayment.latest_charge.balance_transaction = {
      fee: 100,
      currency: 'usd',
      created: recurring ? settled - 60 : settled,
    }
    currentInvoice.status = 'paid'
    currentInvoice.amount_paid = 2500
    currentInvoice.status_transitions.paid_at = settled
    invalidations.length = 0
    await app.handleStripeEvent(
      ...signed(successType, { id: reference }, 'evt_settled', undefined, settled)
    )
    await app.handleStripeEvent(
      ...signed(successType, { id: reference }, 'evt_settled', undefined, settled)
    )
    expect(projections.get(reference)).toMatchObject({
      receivedAt: '2026-10-02T12:00:00.000Z',
      donation: { status: 'succeeded', grossAmountMinor: 2500 },
    })
    expect(invalidations).toEqual([['donations:summary:2026-10']])
    expect(projections.size).toBe(2)
    const recognized = [...projections.values()].filter(
      (event) => event.donation.status === 'succeeded'
    )
    expect(recognized.reduce((sum, event) => sum + event.donation.grossAmountMinor, 0)).toBe(2500)
    currentPayment.latest_charge.amount_refunded = 500
    if (recurring) currentPayment.metadata = { ...metadata, purpose: '' }
    await app.handleStripeEvent(
      ...signed(
        'charge.refunded',
        { payment_intent: 'pi_gift' },
        'evt_refund',
        undefined,
        settled + 120
      )
    )
    expect(projections.get(reference)).toMatchObject({
      receivedAt: '2026-10-02T12:00:00.000Z',
      donation: { refundedAmountMinor: 500, netAmountMinor: 1900 },
    })
  }
)

it('refuses a paid invoice without its settlement timestamp instead of falling back to creation', async () => {
  currentInvoice.status_transitions.paid_at = null
  await expect(
    service().handleStripeEvent(...signed('invoice.payment_succeeded', { id: 'in_gift' }))
  ).rejects.toMatchObject({ status: 503 })
  expect(events).toEqual([])
  expect(invalidations).toEqual([])
})

it.each([null, undefined])(
  'retries a settled payment with %s balance transaction before ledger writes, then applies fees once',
  async (balance) => {
    currentPayment.latest_charge.balance_transaction = balance
    const event = signed('payment_intent.succeeded', { id: 'pi_gift' })
    const app = service()
    await expect(app.handleStripeEvent(...event)).rejects.toMatchObject({
      status: 503,
      message: 'Unable to process Stripe webhook. Please retry later.',
    })
    expect(events).toEqual([])
    expect(invalidations).toEqual([])
    currentPayment.latest_charge.balance_transaction = {
      fee: 100,
      currency: 'usd',
      created: created + 60,
    }
    await app.handleStripeEvent(...event)
    await app.handleStripeEvent(...event)
    expect(applied.size).toBe(1)
    expect(projections.size).toBe(1)
    expect(projections.get('pi_gift')?.donation.netAmountMinor).toBe(2400)
    expect(invalidations).toEqual([['donations:summary:2026-09']])
  }
)

it('propagates ledger failure for provider retry without invalidating cache', async () => {
  failLedger = true
  await expect(
    service().handleStripeEvent(...signed('payment_intent.succeeded', { id: 'pi_gift' }))
  ).rejects.toBeDefined()
  expect(invalidations).toEqual([])
  failLedger = false
  await service().handleStripeEvent(...signed('payment_intent.succeeded', { id: 'pi_gift' }))
  expect(events).toHaveLength(1)
})
