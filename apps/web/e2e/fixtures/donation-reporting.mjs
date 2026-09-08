// HTTP aggregate boundary fixture. SQL semantics are verified separately by pgTAP.
const gifts = new Map()
let reads = []
export function recordReportingFixture(event) {
  gifts.set(`${event.provider}:${event.providerReference}`, event)
}
export function handleReportingControl(request, response, url) {
  if (url.pathname !== '/__test/donation-reporting') return false
  if (request.method === 'DELETE') {
    gifts.clear()
    reads = []
  }
  response.end(JSON.stringify(reads))
  return true
}
export function reportFixture(body, request, response) {
  if (request.headers.authorization !== 'Bearer local-test-service-key') {
    response.statusCode = 403
    return response.end('{}')
  }
  reads.push(body)
  const from = Date.parse(body.report_from)
  const to = Date.parse(body.report_to) + 86400000
  const previous = from - (to - from)
  const groups = new Map()
  for (const event of gifts.values()) {
    const donation = event.donation
    const received = Date.parse(event.receivedAt)
    if (
      received < previous ||
      received >= to ||
      donation.currency !== body.report_currency ||
      !['succeeded', 'refunded', 'reversed'].includes(donation.status)
    )
      continue
    const period = received >= from ? 'current' : 'previous'
    const month = new Date(received).toISOString().slice(0, 7)
    const key = `${period}:${month}:${event.provider}:${donation.cadence}`
    const group = groups.get(key) ?? {
      period,
      month,
      provider: event.provider,
      cadence: donation.cadence,
      giftCount: 0,
      grossAmountMinor: 0,
      feeAmountMinor: 0,
      refundedAmountMinor: 0,
      netAmountMinor: 0,
    }
    group.giftCount++
    for (const field of [
      'grossAmountMinor',
      'feeAmountMinor',
      'refundedAmountMinor',
      'netAmountMinor',
    ])
      group[field] += donation[field]
    groups.set(key, group)
  }
  return response.end(
    JSON.stringify(
      [...groups.values()].map((group) => ({
        ...group,
        giftCount: String(group.giftCount),
        grossAmountMinor: String(group.grossAmountMinor),
        feeAmountMinor: String(group.feeAmountMinor),
        refundedAmountMinor: String(group.refundedAmountMinor),
        netAmountMinor: String(group.netAmountMinor),
      }))
    )
  )
}
