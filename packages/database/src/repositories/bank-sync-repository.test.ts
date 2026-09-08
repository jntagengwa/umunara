import { createClient } from '@supabase/supabase-js'
import { expect, it, vi } from 'vitest'
import type { Database } from '../database.types'
import { BankSyncRepository } from './bank-sync-repository'
vi.mock('server-only', () => ({}))
const id = '11111111-1111-4111-8111-111111111111'
function fixture(result: unknown = { ok: true }, status = 200) {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(Response.json(result, { status }))
  const repository = new BankSyncRepository(
    createClient<Database>('https://database.example.test', 'fixture-key', { global: { fetch } })
  )
  return { repository, fetch }
}
it('validates a connection-specific claim before its single RPC', async () => {
  const f = fixture({ outcome: 'idle' })
  expect(await f.repository.claim(id, id)).toEqual({ outcome: 'idle' })
  expect(String(f.fetch.mock.calls[0]?.[0])).toContain('/rpc/claim_bank_sync')
  expect(JSON.parse(String(f.fetch.mock.calls[0]?.[1]?.body))).toEqual({
    connection: id,
    lease: id,
  })
  await expect(f.repository.claim('all', id)).rejects.toThrow()
  expect(f.fetch).toHaveBeenCalledTimes(1)
})
it('sends bounded page, lease and completion in one atomic RPC', async () => {
  const f = fixture({ outcome: 'applied', added: 0, modified: 0, removed: 0 })
  const page = {
    connectionId: id,
    pageId: id,
    expectedCursor: null,
    cursor: 'next',
    added: [],
    modified: [],
    removed: [],
  }
  await f.repository.savePage(page, id, false)
  expect(JSON.parse(String(f.fetch.mock.calls[0]?.[1]?.body))).toEqual({
    worker_input: { page, leaseId: id, hasMore: false },
  })
})
it('does not pass a raw Item or webhook to persistence', async () => {
  const f = fixture()
  await expect(
    f.repository.enqueue('item-private', 'a'.repeat(64), 'TRANSACTIONS.SYNC_UPDATES_AVAILABLE')
  ).rejects.toThrow()
  expect(f.fetch).not.toHaveBeenCalled()
  await f.repository.enqueue('b'.repeat(64), 'a'.repeat(64), 'TRANSACTIONS.SYNC_UPDATES_AVAILABLE')
  expect(f.fetch).toHaveBeenCalledTimes(1)
})
it('rejects secret-bearing RPC responses and masks failures', async () => {
  await expect(
    fixture({ outcome: 'idle', accessToken: 'private' }).repository.claim(id, id)
  ).rejects.toThrow()
  await expect(
    fixture({ code: '40001', message: 'private-bank-details' }, 400).repository.claim(id, id)
  ).rejects.toMatchObject({ code: '40001', message: 'Database operation failed.' })
})
