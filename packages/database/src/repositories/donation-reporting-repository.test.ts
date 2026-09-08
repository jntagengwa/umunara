import { expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../database.types'
import { DonationReportingRepository } from './donation-reporting-repository'

vi.mock('server-only', () => ({}))
const range = { from: '2026-01-01', to: '2026-01-31', currency: 'USD' }
function fixture(body: unknown, status = 200) {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () => Response.json(body, { status }))
  const client = createClient<Database>('https://database.example.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  })
  return { repository: new DonationReportingRepository(client), fetch }
}
it('requests one parameterized aggregate RPC with no donor fields or table downloads', async () => {
  const { repository, fetch } = fixture([])
  expect(await repository.aggregate(range)).toEqual([])
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(String(fetch.mock.calls[0]?.[0])).toBe(
    'https://database.example.test/rest/v1/rpc/donation_report'
  )
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
    report_from: '2026-01-01',
    report_to: '2026-01-31',
    report_currency: 'USD',
  })
})
it('validates dates before sending a database request', async () => {
  const { repository, fetch } = fixture([])
  await expect(repository.aggregate({ ...range, from: '2026-02-30' })).rejects.toThrow()
  expect(fetch).not.toHaveBeenCalled()
})
it('masks database errors and rejects unsafe or nonaggregate responses', async () => {
  await expect(
    fixture({ code: 'XX000', message: 'private detail' }, 500).repository.aggregate(range)
  ).rejects.toMatchObject({ message: 'Database operation failed.' })
  await expect(
    fixture([{ donor_profile_id: 'private' }]).repository.aggregate(range)
  ).rejects.toMatchObject({ message: 'Database operation failed.' })
})
it('decodes exact integer strings, preserves negative net and rejects precision loss', async () => {
  const group = {
    period: 'current',
    month: '2026-01',
    provider: 'paypal',
    cadence: 'yearly',
    giftCount: '1',
    grossAmountMinor: '100',
    feeAmountMinor: '1500',
    refundedAmountMinor: '100',
    netAmountMinor: '-1500',
  }
  expect(await fixture([group]).repository.aggregate(range)).toEqual([
    {
      ...group,
      giftCount: 1,
      grossAmountMinor: 100,
      feeAmountMinor: 1500,
      refundedAmountMinor: 100,
      netAmountMinor: -1500,
    },
  ])
  await expect(
    fixture([{ ...group, grossAmountMinor: '9007199254740993' }]).repository.aggregate(range)
  ).rejects.toMatchObject({ message: 'Database operation failed.' })
})
