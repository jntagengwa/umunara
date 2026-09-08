import { describe, expect, it } from 'vitest'
import { donationEventSchema, normalizeDonation } from './donations'

describe('donation normalization', () => {
  it('normalizes a provider amount without floating point values', () => {
    expect(normalizeDonation({ provider: 'stripe', amountMinor: 2500, currency: 'usd' })).toMatchObject({
      grossAmountMinor: 2500, feeAmountMinor: 0, netAmountMinor: 2500,
      currency: 'USD', status: 'succeeded', cadence: 'one_time',
    })
  })

  it.each([1.5, -1, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, '2500'])(
    'rejects invalid minor units: %s', (amountMinor) => {
      expect(() => normalizeDonation({ provider: 'stripe', amountMinor, currency: 'USD' })).toThrow()
    },
  )

  it('subtracts fees and cumulative refunds using integers', () => {
    expect(normalizeDonation({ provider: 'paypal', amountMinor: 2500, feeAmountMinor: 100,
      refundedAmountMinor: 500, currency: 'EUR' }).netAmountMinor).toBe(1900)
  })

  it.each([
    { currency: 'ZZZ' }, { currency: 'US' }, { feeAmountMinor: -1 },
    { refundedAmountMinor: 2501 }, { status: 'paid' }, { cadence: 'daily' },
    { status: 'refunded' }, { status: 'pending', feeAmountMinor: 100 },
    { provider: 'unknown' }, { card: { number: 'sensitive' } },
  ])('rejects invalid normalized values: %s', (overrides) => {
    expect(() => normalizeDonation({ provider: 'stripe', amountMinor: 2500, currency: 'USD', ...overrides })).toThrow()
  })

  it('requires event identity and rejects raw provider payloads', () => {
    const input = { provider: 'stripe', providerEventId: 'evt_1', providerReference: 'gift_1',
      occurredAt: '2026-09-07T12:00:00Z', receivedAt: '2026-09-07T12:00:00Z',
      donation: normalizeDonation({ provider: 'stripe', amountMinor: 2500, currency: 'USD' }) }
    expect(donationEventSchema.parse(input)).toMatchObject(input)
    expect(donationEventSchema.safeParse({ ...input, payload: {} }).success).toBe(false)
    expect(donationEventSchema.safeParse({ ...input, providerEventId: '' }).success).toBe(false)
    expect(donationEventSchema.safeParse({ ...input, provider: 'paypal' }).success).toBe(false)
    expect(donationEventSchema.safeParse({ ...input, occurredAt: 'not-a-date' }).success).toBe(false)
    expect(donationEventSchema.safeParse({ ...input, donation: { ...input.donation, netAmountMinor: 1 } }).success).toBe(false)
  })

  it('allows a dispute fee greater than the reversed gift', () => {
    expect(normalizeDonation({ provider: 'stripe', amountMinor: 100, feeAmountMinor: 1500,
      refundedAmountMinor: 100, status: 'reversed', currency: 'USD' }).netAmountMinor).toBe(-1500)
  })

  it('still rejects unsafe fees', () => {
    expect(() => normalizeDonation({ provider: 'stripe', amountMinor: 100,
      feeAmountMinor: Number.MAX_SAFE_INTEGER + 1, currency: 'USD' })).toThrow()
  })

  it('accepts an explicit verified reinstatement envelope', () => {
    const input = { provider: 'stripe', providerEventId: 'won_1', providerReference: 'gift_1',
      correctsProviderEventId: 'reversed_1', occurredAt: '2026-09-08T12:00:00Z',
      receivedAt: '2026-09-07T12:00:00Z',
      donation: normalizeDonation({ provider: 'stripe', amountMinor: 100, currency: 'USD' }) }
    expect(donationEventSchema.parse(input)).toMatchObject(input)
    expect(donationEventSchema.safeParse({ ...input, correctsProviderEventId: '' }).success).toBe(false)
    expect(donationEventSchema.safeParse({ ...input, correctsProviderEventId: 'won_1' }).success).toBe(false)
    expect(donationEventSchema.safeParse({ ...input,
      donation: { ...input.donation, status: 'pending' } }).success).toBe(false)
  })
})
