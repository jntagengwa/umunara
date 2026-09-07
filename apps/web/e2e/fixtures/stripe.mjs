const seenEvents = new Set()
let applications = 0

export async function handleStripeFixture(request, response, url) {
  if (url.pathname === '/__test/donation-ledger') {
    if (request.method === 'DELETE') {
      seenEvents.clear()
      applications = 0
    }
    response.end(JSON.stringify({ events: seenEvents.size, applications }))
    return true
  }
  if (!url.pathname.startsWith('/__test/stripe/')) return false
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const body = new URLSearchParams(Buffer.concat(chunks).toString())
  const path = url.pathname.slice('/__test/stripe'.length)
  if (path === '/v1/checkout/sessions' && request.method === 'POST') {
    if (
      body.get('mode') !== 'subscription' ||
      body.get('line_items[0][price_data][unit_amount]') !== '2550' ||
      body.get('line_items[0][price_data][recurring][interval]') !== 'month' ||
      body.get('success_url') !== 'http://localhost:55430/give?checkout=returned'
    ) {
      response.statusCode = 400
      response.end(JSON.stringify({ error: { message: 'Unexpected fixture checkout input.' } }))
      return true
    }
    response.end(
      JSON.stringify({ id: 'cs_fixture', url: 'https://checkout.stripe.com/c/pay/cs_fixture' })
    )
    return true
  }
  if (path === '/v1/payment_intents/pi_fixture') {
    response.end(
      JSON.stringify({
        id: 'pi_fixture',
        created: 1788825600,
        amount: 2550,
        currency: 'usd',
        status: 'succeeded',
        metadata: {
          purpose: 'umunara_donation',
          donation_intent_id: '11111111-1111-4111-8111-111111111111',
          amount_minor: '2550',
          currency: 'USD',
          cadence: 'one_time',
        },
        latest_charge: {
          id: 'ch_fixture',
          paid: true,
          amount_refunded: 0,
          balance_transaction: { fee: 100, currency: 'usd', created: 1788825660 },
        },
      })
    )
    return true
  }
  response.statusCode = 404
  response.end(JSON.stringify({ error: { message: 'Unknown Stripe fixture request.' } }))
  return true
}

export function ingestDonationFixture(body, request, response) {
  const event = body?.event_input
  if (
    request.headers.authorization !== 'Bearer local-test-service-key' ||
    event?.providerReference !== 'pi_fixture' ||
    event?.donation.netAmountMinor !== 2450 ||
    Object.keys(event).some((key) => ['metadata', 'rawBody', 'payload'].includes(key))
  ) {
    response.statusCode = 400
    response.end(JSON.stringify({ code: '22023', message: 'Invalid donation fixture envelope.' }))
    return
  }
  const outcome = seenEvents.has(event.providerEventId) ? 'duplicate' : 'applied'
  seenEvents.add(event.providerEventId)
  if (outcome === 'applied') applications += 1
  response.end(
    JSON.stringify({
      outcome,
      donationId: '22222222-2222-4222-8222-222222222222',
      eventId: '33333333-3333-4333-8333-333333333333',
    })
  )
}
