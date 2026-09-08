import { expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../database.types'
import { BankReviewRepository } from './bank-review-repository'

vi.mock('server-only', () => ({}))
const id = '11111111-1111-4111-8111-111111111111'
const query = {
  from: '2026-09-01',
  to: '2026-09-30',
  page: 2,
  pageSize: 25,
  minAmountMinor: -100,
  maxAmountMinor: 100,
  accountId: id,
  classification: 'unreviewed' as const,
}
function fixture(body: unknown, status = 200) {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () => Response.json(body, { status }))
  const client = createClient<Database>('https://database.example.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  })
  return { repository: new BankReviewRepository(client), fetch }
}
it('sends all bounded filters and authenticated actor through one read RPC', async () => {
  const { repository, fetch } = fixture({ items: [], hasMore: false })
  await expect(repository.list(id, query)).resolves.toEqual({ items: [], hasMore: false })
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(String(fetch.mock.calls[0]?.[0])).toContain('/rpc/list_bank_transactions')
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
    actor_id: id,
    query_input: query,
  })
})
it('uses one classification RPC for the atomic classification and audit', async () => {
  const { repository, fetch } = fixture({ outcome: 'applied' })
  const input = { actorId: id, transactionId: id, classification: 'donation' as const }
  await expect(repository.classify(input)).resolves.toEqual({ outcome: 'applied' })
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(String(fetch.mock.calls[0]?.[0])).toContain('/rpc/classify_bank_transaction')
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
    classification_input: input,
  })
})
it('rejects invalid input before network and secret-bearing responses', async () => {
  const { repository, fetch } = fixture({ items: [], hasMore: false, accessToken: 'private' })
  await expect(repository.list(id, { ...query, pageSize: 101 })).rejects.toThrow()
  expect(fetch).not.toHaveBeenCalled()
  await expect(repository.list(id, query)).rejects.toThrow()
})
it('preserves safe repository codes without forwarding SQL messages', async () => {
  const { repository } = fixture({ code: '22023', message: 'private account details' }, 400)
  await expect(
    repository.classify({ actorId: id, transactionId: id, classification: 'non_donation' })
  ).rejects.toMatchObject({ code: '22023', message: 'Database operation failed.' })
})
