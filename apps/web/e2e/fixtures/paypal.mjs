import { createHmac } from 'node:crypto'

const custom = 'umunara:v1:11111111-1111-4111-8111-111111111111:2500:USD:one_time'
const amount = (value) => ({ value, currency_code: 'USD' })
const projections = new Map()
const seen = new Set()
let applications = 0
let orderCustom = custom

export async function handlePayPalFixture(request, response, url) {
  if (url.pathname === '/__test/paypal-ledger') {
    if (request.method === 'DELETE') {
      projections.clear()
      seen.clear()
      applications = 0
    }
    response.end(
      JSON.stringify({ events: seen.size, applications, projections: [...projections.values()] })
    )
    return true
  }
  if (url.pathname === '/rest/v1/donations' && url.searchParams.get('provider') === 'eq.paypal') {
    const row = projections.get(url.searchParams.get('provider_reference')?.slice(3))
    response.end(
      JSON.stringify(
        row
          ? {
              id: '11111111-1111-4111-8111-111111111111',
              provider_reference: row.providerReference,
              last_event_at: row.occurredAt,
              received_at: row.receivedAt,
              donor_profile_id: null,
              gross_amount_minor: row.donation.grossAmountMinor,
              fee_amount_minor: row.donation.feeAmountMinor,
              refunded_amount_minor: row.donation.refundedAmountMinor,
              net_amount_minor: row.donation.netAmountMinor,
              currency: row.donation.currency,
              status: row.donation.status,
              cadence: row.donation.cadence,
            }
          : null
      )
    )
    return true
  }
  if (!url.pathname.startsWith('/__test/paypal/')) return false
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString()
  const path = url.pathname.slice('/__test/paypal'.length)
  if (path === '/v1/oauth2/token') {
    response.end(JSON.stringify({ access_token: 'paypal-fixture-access', expires_in: 300 }))
    return true
  }
  if (request.headers.authorization !== 'Bearer paypal-fixture-access') {
    response.statusCode = 401
    response.end('{}')
    return true
  }
  const body = raw ? JSON.parse(raw) : null
  let result
  if (path === '/v1/notifications/verify-webhook-signature') {
    const original = raw.match(/,"webhook_event":([\s\S]*)}$/)?.[1]
    const expected = createHmac('sha256', 'paypal-fixture-verification')
      .update(original ?? '')
      .digest('hex')
    result = {
      verification_status:
        body.webhook_id === 'WH-FIXTURE' && body.transmission_sig === expected
          ? 'SUCCESS'
          : 'FAILURE',
    }
  } else if (path === '/v2/checkout/orders' && request.method === 'POST') {
    if (
      body.purchase_units?.[0]?.amount?.value !== '25.00' ||
      body.payment_source?.paypal?.experience_context?.return_url !==
        'http://localhost:55430/give?paypal=approved'
    ) {
      response.statusCode = 400
      response.end('{}')
      return true
    }
    orderCustom = body.purchase_units[0].custom_id
    result = {
      id: 'ORDER123',
      links: [
        { rel: 'payer-action', href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER123' },
      ],
    }
  } else if (path === '/v2/checkout/orders/ORDER123') {
    result = {
      id: 'ORDER123',
      intent: 'CAPTURE',
      purchase_units: [{ custom_id: orderCustom, amount: amount('25.00') }],
    }
  } else if (path === '/v2/checkout/orders/ORDER123/capture') {
    result = { id: 'ORDER123', status: 'COMPLETED' }
  } else if (path.startsWith('/v1/billing/plans/')) {
    result = {
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
      payment_preferences: { setup_fee: amount('0.00') },
    }
  } else if (path === '/v1/billing/subscriptions' && request.method === 'POST') {
    if (
      body.plan?.billing_cycles?.[0]?.pricing_scheme?.fixed_price?.value !== '25.00' ||
      body.application_context?.return_url !== 'http://localhost:55430/give?paypal=returned'
    ) {
      response.statusCode = 400
      response.end('{}')
      return true
    }
    result = {
      id: 'I-SUB123',
      links: [
        {
          rel: 'approve',
          href: 'https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=I-SUB123',
        },
      ],
    }
  } else if (path === '/v1/billing/subscriptions/I-SUB123') {
    result = { id: 'I-SUB123', custom_id: custom.replace('one_time', 'monthly') }
  } else {
    response.statusCode = 404
    result = {}
  }
  response.end(JSON.stringify(result))
  return true
}

export function ingestPayPalFixture(body, request, response) {
  const event = body.event_input
  if (
    request.headers.authorization !== 'Bearer local-test-service-key' ||
    event.provider !== 'paypal' ||
    event.donation.netAmountMinor !==
      event.donation.grossAmountMinor -
        event.donation.feeAmountMinor -
        event.donation.refundedAmountMinor ||
    Object.keys(event).some((key) => ['rawBody', 'payload', 'metadata'].includes(key))
  ) {
    response.statusCode = 400
    response.end('{}')
    return
  }
  const previous = projections.get(event.providerReference)
  if (previous && previous.receivedAt !== event.receivedAt) {
    response.statusCode = 400
    response.end('{}')
    return
  }
  const outcome = seen.has(event.providerEventId)
    ? 'duplicate'
    : previous &&
        (previous.occurredAt > event.occurredAt ||
          previous.donation.refundedAmountMinor > event.donation.refundedAmountMinor)
      ? 'stale'
      : 'applied'
  seen.add(event.providerEventId)
  if (outcome === 'applied') {
    projections.set(event.providerReference, event)
    applications++
  }
  response.end(
    JSON.stringify({
      outcome,
      donationId: '11111111-1111-4111-8111-111111111111',
      eventId: '22222222-2222-4222-8222-222222222222',
    })
  )
}
