import { describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../database.types'
import { BankRepository } from './bank-repository'
import { ReconciliationRepository } from './reconciliation-repository'

vi.mock('server-only', () => ({}))
const id = '11111111-1111-4111-8111-111111111111'
const page = {
  connectionId: id,
  pageId: id,
  expectedCursor: null,
  cursor: 'next',
  added: [
    {
      providerTransactionId: 'txn_1',
      accountId: id,
      amountMinor: 2400,
      currency: 'USD',
      bookedOn: '2026-09-07',
      description: 'Deposit',
      pending: false,
    },
  ],
  modified: [],
  removed: [],
}
const link = {
  transactionId: id,
  actorId: id,
  kind: 'processor_payout' as const,
  donationIds: [id],
}

function fixture(body: unknown, status = 200) {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () => new Response(JSON.stringify(body), { status }))
  const client = createClient<Database>('https://database.example.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  })
  return {
    bank: new BankRepository(client),
    reconciliation: new ReconciliationRepository(client),
    fetch,
  }
}

describe('bank repositories', () => {
  it('sends all page changes and the expected cursor through one atomic RPC', async () => {
    const result = { outcome: 'applied', added: 1, modified: 0, removed: 0 }
    const { bank, fetch } = fixture(result)
    expect(await bank.saveSyncPage(page)).toEqual(result)
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, request] = fetch.mock.calls[0]!
    expect(String(url)).toBe('https://database.example.test/rest/v1/rpc/save_bank_sync_page')
    expect(request?.method).toBe('POST')
    expect(JSON.parse(String(request?.body))).toEqual({ page_input: page })
  })
  it('returns duplicate page outcomes without issuing separate writes', async () => {
    const { bank, fetch } = fixture({ outcome: 'duplicate', added: 1, modified: 0, removed: 0 })
    expect(await bank.saveSyncPage(page)).toMatchObject({ outcome: 'duplicate' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('rejects invalid page data before contacting the database', async () => {
    const { bank, fetch } = fixture(null)
    await expect(bank.saveSyncPage({ ...page, removed: ['txn_1'] })).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('keeps cursor conflicts retryable without leaking provider details', async () => {
    const { bank } = fixture({ code: '40001', message: 'secret cursor' }, 400)
    await expect(bank.saveSyncPage(page)).rejects.toMatchObject({
      code: '40001',
      message: 'Database operation failed.',
    })
  })
  it.each(['applied', 'duplicate'])('links existing gifts in one RPC (%s)', async (outcome) => {
    const result = { outcome, linkIds: [id] }
    const { reconciliation, fetch } = fixture(result)
    expect(await reconciliation.link(link)).toEqual(result)
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, request] = fetch.mock.calls[0]!
    expect(String(url)).toBe('https://database.example.test/rest/v1/rpc/link_bank_reconciliation')
    expect(JSON.parse(String(request?.body))).toEqual({ link_input: link })
  })
  it('rejects repeated donation targets before contacting the database', async () => {
    const { reconciliation, fetch } = fixture(null)
    await expect(reconciliation.link({ ...link, donationIds: [id, id] })).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('masks failed reconciliation details', async () => {
    const { reconciliation } = fixture({ code: '23505', message: 'private donor' }, 400)
    await expect(reconciliation.link(link)).rejects.toMatchObject({
      code: '23505',
      message: 'Database operation failed.',
    })
  })
  it('rejects malformed and secret-bearing responses', async () => {
    await expect(fixture({ outcome: 'applied' }).bank.saveSyncPage(page)).rejects.toThrow()
    await expect(
      fixture({ outcome: 'applied', linkIds: [id], accessToken: 'secret' }).reconciliation.link(
        link
      )
    ).rejects.toThrow()
  })
})
