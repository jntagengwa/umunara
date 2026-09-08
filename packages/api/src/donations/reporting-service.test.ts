import { expect, it, vi } from 'vitest'
import type { Actor } from '../auth/require-user'
import { ReportingService } from './reporting-service'

vi.mock('server-only', () => ({}))
const admin: Actor = { id: 'admin', role: 'admin', approvedAt: '2026-01-01' }
const range = { from: '2026-01-01', to: '2026-01-31', currency: 'USD' }
const totals = {
  giftCount: 2,
  grossAmountMinor: 10000,
  feeAmountMinor: 0,
  refundedAmountMinor: 2500,
  netAmountMinor: 7500,
}
const rows = [
  {
    period: 'current' as const,
    month: '2026-01',
    provider: 'stripe' as const,
    cadence: 'one_time' as const,
    ...totals,
  },
  {
    period: 'previous' as const,
    month: '2025-12',
    provider: 'paypal' as const,
    cadence: 'monthly' as const,
    giftCount: 1,
    grossAmountMinor: 5000,
    feeAmountMinor: 0,
    refundedAmountMinor: 0,
    netAmountMinor: 5000,
  },
]

it('deducts refunds from net and compares the preceding equal-length receipt period', async () => {
  const repository = { aggregate: vi.fn().mockResolvedValue(rows) }
  const summary = await new ReportingService(repository).getSummary(admin, range)
  expect(summary).toMatchObject({
    ...totals,
    range,
    comparison: {
      from: '2025-12-01',
      to: '2025-12-31',
      netAmountMinor: 5000,
      growthPercentage: 50,
    },
    monthly: [{ month: '2026-01', ...totals }],
  })
  expect(summary.providerMix.find((row) => row.provider === 'stripe')).toMatchObject(totals)
  expect(summary.cadenceMix.find((row) => row.cadence === 'monthly')?.giftCount).toBe(0)
  expect(JSON.stringify(summary)).not.toMatch(/donor|providerReference|eventId/)
})

it('preserves negative net after full reversal with retained fees and avoids undefined growth', async () => {
  const summary = await new ReportingService({
    aggregate: async () => [
      {
        ...rows[0]!,
        giftCount: 1,
        grossAmountMinor: 100,
        feeAmountMinor: 1500,
        refundedAmountMinor: 100,
        netAmountMinor: -1500,
      },
    ],
  }).getSummary(admin, range)
  expect(summary.netAmountMinor).toBe(-1500)
  expect(summary.comparison.growthPercentage).toBeNull()
})

it('returns zero-filled months, totals and mixes for an empty inclusive range', async () => {
  const summary = await new ReportingService({ aggregate: async () => [] }).getSummary(admin, {
    from: '2026-01-31',
    to: '2026-03-01',
    currency: 'USD',
  })
  expect(summary.monthly.map(({ month, netAmountMinor }) => ({ month, netAmountMinor }))).toEqual([
    { month: '2026-01', netAmountMinor: 0 },
    { month: '2026-02', netAmountMinor: 0 },
    { month: '2026-03', netAmountMinor: 0 },
  ])
  expect(summary.giftCount).toBe(0)
  expect(summary.providerMix).toHaveLength(4)
})

it.each(['pending', 'member', 'editor'] as const)(
  'denies %s before repository or cache access',
  async (role) => {
    const aggregate = vi.fn()
    const read = vi.fn()
    await expect(
      new ReportingService({ aggregate }, { read }).getSummary({ ...admin, role }, range)
    ).rejects.toMatchObject({ status: 403 })
    expect(aggregate).not.toHaveBeenCalled()
    expect(read).not.toHaveBeenCalled()
  }
)

it('rejects an unapproved admin and unauthenticated request', async () => {
  const service = new ReportingService({ aggregate: async () => [] })
  await expect(service.getSummary({ ...admin, approvedAt: null }, range)).rejects.toMatchObject({
    status: 403,
  })
  await expect(service.getSummary(null, range)).rejects.toMatchObject({ status: 401 })
})

it.each([
  { from: '2026-02-30', to: '2026-03-01' },
  { from: '2026-02-01', to: '2026-01-31' },
  { from: '2025-01-01', to: '2026-01-02' },
  { from: '2026-01-01' },
  { ...range, currency: 'usd' },
])('rejects invalid range %j before data access', async (input) => {
  const aggregate = vi.fn()
  await expect(new ReportingService({ aggregate }).getSummary(admin, input)).rejects.toThrow()
  expect(aggregate).not.toHaveBeenCalled()
})

it('defaults to UTC year-to-date in USD', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-08T00:00:00Z'))
  try {
    const summary = await new ReportingService({ aggregate: async () => [] }).getSummary(admin, {})
    expect(summary.range).toEqual({ from: '2026-01-01', to: '2026-09-08', currency: 'USD' })
  } finally {
    vi.useRealTimers()
  }
})

it('tags the range and every receipt month including comparison-only months', async () => {
  const read = vi.fn(async (_key, _tags, load) => load())
  await new ReportingService({ aggregate: async () => [] }, { read }).getSummary(admin, range)
  expect(read.mock.calls[0]?.slice(0, 2)).toEqual([
    'donations:summary:2026-01-01:2026-01-31:USD',
    [
      'donations:summary:2026-01-01:2026-01-31',
      'donations:summary:2025-12',
      'donations:summary:2026-01',
    ],
  ])
})

it('fails safely if combined amounts exceed exact JavaScript integer precision', async () => {
  const row = {
    ...rows[0]!,
    grossAmountMinor: Number.MAX_SAFE_INTEGER,
    refundedAmountMinor: 0,
    netAmountMinor: Number.MAX_SAFE_INTEGER,
  }
  await expect(
    new ReportingService({ aggregate: async () => [row, row] }).getSummary(admin, range)
  ).rejects.toMatchObject({ status: 503 })
})
