// Loopback PostgREST boundary fixture; this does not execute PostgreSQL.
import { recordReportingFixture } from './donation-reporting.mjs'
const actorId = '11111111-1111-4111-8111-111111111111'
export const payoutId = '71000000-0000-4000-8000-000000000001'
export const giftId = '72000000-0000-4000-8000-000000000001'
let transactions = []
let calls = []
const gift = {
  provider: 'stripe',
  providerReference: 'review-gift',
  receivedAt: '2026-09-07T12:00:00Z',
  donation: {
    currency: 'USD',
    status: 'succeeded',
    cadence: 'one_time',
    grossAmountMinor: 10000,
    feeAmountMinor: 300,
    refundedAmountMinor: 0,
    netAmountMinor: 9700,
  },
}

export async function handleBankReviewFixture(request, response, url) {
  const routes = [
    '/rest/v1/rpc/list_bank_transactions',
    '/rest/v1/rpc/classify_bank_transaction',
    '/rest/v1/rpc/link_bank_reconciliation',
  ]
  if (url.pathname === '/__test/bank-review') {
    if (request.method === 'DELETE') {
      calls = []
      transactions = Array.from({ length: 26 }, (_, index) => ({
        id: `71000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        accountId: actorId,
        amountMinor: index === 0 ? 9700 : -100,
        currency: 'USD',
        bookedOn: '2026-09-07',
        description: index === 0 ? 'Stripe settlement' : `Bank charge ${index}`,
        pending: false,
        classification: 'unreviewed',
        removedAt: null,
        accountName: 'Business checking',
        accountMask: '1234',
        linkCount: 0,
      }))
      recordReportingFixture(gift)
    }
    response.end(
      JSON.stringify({ calls, donationCount: 1, netAmountMinor: gift.donation.netAmountMinor })
    )
    return true
  }
  if (!routes.includes(url.pathname)) return false
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const input = JSON.parse(Buffer.concat(chunks).toString())
  calls.push({ path: url.pathname, input })
  if (
    request.headers.authorization !== 'Bearer local-test-service-key' ||
    (input.actor_id ?? input.classification_input?.actorId ?? input.link_input?.actorId) !== actorId
  ) {
    response.statusCode = 403
    response.end(JSON.stringify({ code: '42501' }))
    return true
  }
  if (url.pathname.endsWith('list_bank_transactions')) {
    const q = input.query_input
    const filtered = transactions.filter(
      (t) =>
        t.bookedOn >= q.from &&
        t.bookedOn <= q.to &&
        (!q.accountId || t.accountId === q.accountId) &&
        (!q.currency || t.currency === q.currency) &&
        (!q.classification || t.classification === q.classification) &&
        (q.minAmountMinor === undefined || t.amountMinor >= q.minAmountMinor) &&
        (q.maxAmountMinor === undefined || t.amountMinor <= q.maxAmountMinor)
    )
    const offset = (q.page - 1) * q.pageSize
    response.end(
      JSON.stringify({
        items: filtered.slice(offset, offset + q.pageSize),
        hasMore: filtered.length > offset + q.pageSize,
      })
    )
    return true
  }
  const operation = input.classification_input ?? input.link_input
  const source = transactions.find((t) => t.id === operation.transactionId)
  const link = url.pathname.endsWith('link_bank_reconciliation')
  if (
    !source ||
    (source.linkCount && (!link || operation.donationIds?.[0] !== giftId)) ||
    (link &&
      (source.amountMinor !== 9700 ||
        !['unreviewed', 'processor_payout'].includes(source.classification) ||
        operation.kind !== 'processor_payout' ||
        operation.donationIds.length !== 1 ||
        operation.donationIds[0] !== giftId))
  ) {
    response.statusCode = 400
    response.end(JSON.stringify({ code: '22023', message: 'private-provider-account' }))
    return true
  }
  source.classification = link ? 'processor_payout' : operation.classification
  if (link) source.linkCount = 1
  response.end(
    JSON.stringify(link ? { outcome: 'applied', linkIds: [giftId] } : { outcome: 'applied' })
  )
  return true
}
