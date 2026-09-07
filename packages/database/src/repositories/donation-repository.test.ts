import { describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../database.types'
import { normalizeDonation } from '@umunara/schemas'
import { DonationRepository } from './donation-repository'

vi.mock('server-only', () => ({}))

const event = {
  provider: 'stripe' as const,
  providerEventId: 'evt_1',
  providerReference: 'gift_1',
  occurredAt: '2026-09-07T12:00:00Z',
  receivedAt: '2026-09-07T12:00:00Z',
  donation: normalizeDonation({ provider: 'stripe', amountMinor: 2500, currency: 'USD' }),
}
const result = { outcome: 'applied', donationId: '11111111-1111-4111-8111-111111111111',
  eventId: '22222222-2222-4222-8222-222222222222' }

function fixture(body: unknown, status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => new Response(JSON.stringify(body), { status }))
  const client = createClient<Database>('https://database.example.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch },
  })
  return { repository: new DonationRepository(client), fetch }
}

describe('donation repository', () => {
  it.each(['recordEvent', 'upsertDonation'] as const)('%s sends exactly one atomic RPC', async (method) => {
    const { repository, fetch } = fixture(result)
    await expect(repository[method](event)).resolves.toEqual(result)
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, request] = fetch.mock.calls[0]!
    expect(url.toString()).toBe('https://database.example.test/rest/v1/rpc/ingest_donation_event')
    expect(request?.method).toBe('POST')
    expect(JSON.parse(String(request?.body))).toEqual({ event_input: { ...event, donorProfileId: null, correctsProviderEventId: null } })
  })

  it.each(['duplicate', 'stale'])('preserves the %s result without another write', async (outcome) => {
    const { repository, fetch } = fixture({ ...result, outcome })
    await expect(repository.recordEvent(event)).resolves.toMatchObject({ outcome })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid data before contacting the database', async () => {
    const { repository, fetch } = fixture(result)
    await expect(repository.recordEvent({ ...event, providerEventId: '' })).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('submits a reversal and its reinstatement as separate immutable events', async () => {
    const { repository, fetch } = fixture(result)
    await repository.recordEvent({ ...event, providerEventId: 'reversed_1',
      donation: normalizeDonation({ provider: 'stripe', amountMinor: 2500, currency: 'USD',
        refundedAmountMinor: 2500, feeAmountMinor: 3000, status: 'reversed' }) })
    await repository.recordEvent({ ...event, providerEventId: 'won_1', correctsProviderEventId: 'reversed_1',
      occurredAt: '2026-09-08T12:00:00Z' })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toMatchObject({
      event_input: { providerEventId: 'won_1', correctsProviderEventId: 'reversed_1',
        donation: { status: 'succeeded', refundedAmountMinor: 0 } },
    })
  })

  it('does not surface provider payloads from database errors', async () => {
    const { repository } = fixture({ code: '23514', message: 'sensitive provider information' }, 400)
    await expect(repository.recordEvent(event)).rejects.toMatchObject({ code: '23514', message: 'Database operation failed.' })
  })

  it('rejects malformed RPC responses', async () => {
    const { repository } = fixture({ outcome: 'applied' })
    await expect(repository.recordEvent(event)).rejects.toThrow()
  })
})
