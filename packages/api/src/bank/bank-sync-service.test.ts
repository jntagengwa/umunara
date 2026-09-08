import { expect, it, vi } from 'vitest'
import { BankSyncService } from './bank-sync-service'
import { PlaidSyncError } from './plaid-sync-contracts'

vi.mock('server-only', () => ({}))
const id = '11111111-1111-4111-8111-111111111111'
const account = '22222222-2222-4222-8222-222222222222'
function fixture() {
  const repository = {
    claim: vi.fn().mockResolvedValue({
      outcome: 'ready',
      connectionId: id,
      actorId: id,
      secretReference: id,
      cursor: 'stored',
      cycleId: id,
      accounts: [{ id: account, providerAccountId: 'a1', currency: 'USD' }],
    }),
    bindItem: vi.fn().mockResolvedValue(undefined),
    savePage: vi.fn().mockResolvedValue({ outcome: 'applied', added: 1, modified: 0, removed: 0 }),
    release: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockResolvedValue({ cursor: 'stored', cycleId: account }),
    enqueue: vi.fn().mockResolvedValue(undefined),
  }
  const provider = {
    syncTransactions: vi.fn().mockResolvedValue({
      added: [
        {
          transaction_id: 't1',
          account_id: 'a1',
          amount: -1.01,
          iso_currency_code: 'USD',
          date: '2026-09-01',
          name: 'Gift',
          pending: false,
        },
      ],
      modified: [],
      removed: [],
      next_cursor: 'next',
      has_more: false,
    }),
  }
  const secrets = {
    read: vi.fn().mockResolvedValue({
      connectionId: id,
      actorId: id,
      itemId: 'item',
      accessToken: 'private-access',
    }),
  }
  const verifier = {
    verify: vi.fn().mockResolvedValue({
      itemId: 'item',
      deduplicationKey: 'a'.repeat(64),
      eventType: 'TRANSACTIONS.SYNC_UPDATES_AVAILABLE',
    }),
  }
  return {
    repository,
    provider,
    secrets,
    verifier,
    service: new BankSyncService(provider, secrets, repository, verifier),
  }
}
it('uses the stored cursor, normalizes credit cents and saves one atomic page', async () => {
  const f = fixture()
  await expect(f.service.sync(id)).resolves.toEqual({ added: 1, modified: 0, removed: 0 })
  expect(f.provider.syncTransactions).toHaveBeenCalledWith('private-access', 'stored')
  expect(f.repository.savePage).toHaveBeenCalledWith(
    expect.objectContaining({
      connectionId: id,
      expectedCursor: 'stored',
      cursor: 'next',
      added: [expect.objectContaining({ accountId: account, amountMinor: 101 })],
    }),
    expect.any(String),
    false
  )
})
it('does not read tokens or contact Plaid for inactive or busy connections', async () => {
  const f = fixture()
  f.repository.claim.mockResolvedValue({ outcome: 'idle' })
  await f.service.sync(id)
  expect(f.secrets.read).not.toHaveBeenCalled()
  expect(f.provider.syncTransactions).not.toHaveBeenCalled()
})
it('does not advance a cursor on Vault failure and returns a safe error', async () => {
  const f = fixture()
  f.secrets.read.mockRejectedValue(new Error('private-access'))
  await expect(f.service.sync(id)).rejects.toThrow(
    'Bank synchronization is temporarily unavailable.'
  )
  expect(f.repository.savePage).not.toHaveBeenCalled()
  expect(f.repository.release).toHaveBeenCalled()
})
it('verifies before scheduling and stores only item and event hashes', async () => {
  const f = fixture()
  await f.service.handleWebhook(new Headers(), 'raw')
  expect(f.repository.enqueue).toHaveBeenCalledWith(
    expect.stringMatching(/^[a-f0-9]{64}$/),
    'a'.repeat(64),
    'TRANSACTIONS.SYNC_UPDATES_AVAILABLE'
  )
  f.verifier.verify.mockRejectedValue(new Error('Invalid signature'))
  await expect(f.service.handleWebhook(new Headers(), 'raw')).rejects.toThrow()
  expect(f.repository.enqueue).toHaveBeenCalledTimes(1)
})
it('paginates added, modified and removed updates using each committed cursor', async () => {
  const f = fixture()
  const first = await f.provider.syncTransactions()
  f.provider.syncTransactions
    .mockResolvedValueOnce({ ...first, has_more: true })
    .mockResolvedValueOnce({
      added: [],
      modified: [{ ...first.added[0], amount: 4.25 }],
      removed: [{ transaction_id: 'removed', account_id: 'a1' }],
      next_cursor: 'last',
      has_more: false,
    })
  f.repository.savePage
    .mockResolvedValueOnce({ outcome: 'applied', added: 1, modified: 0, removed: 0 })
    .mockResolvedValueOnce({ outcome: 'applied', added: 0, modified: 1, removed: 1 })
  expect(await f.service.sync(id)).toEqual({ added: 1, modified: 1, removed: 1 })
  expect(f.provider.syncTransactions).toHaveBeenLastCalledWith('private-access', 'next')
  expect(f.repository.savePage.mock.calls[1]?.[0]).toMatchObject({
    expectedCursor: 'next',
    modified: [expect.objectContaining({ amountMinor: -425 })],
    removed: ['removed'],
  })
})
it('retries exactly the same page after an ambiguous database response', async () => {
  const f = fixture()
  f.repository.savePage
    .mockRejectedValueOnce(new Error('lost response'))
    .mockResolvedValueOnce({ outcome: 'duplicate', added: 1, modified: 0, removed: 0 })
  expect(await f.service.sync(id)).toEqual({ added: 0, modified: 0, removed: 0 })
  expect(f.repository.savePage.mock.calls[0]).toEqual(f.repository.savePage.mock.calls[1])
  expect(f.provider.syncTransactions).toHaveBeenCalledTimes(1)
})
it('restarts mutation errors from the durable original cursor with fresh cycle receipts', async () => {
  const f = fixture()
  const first = await f.provider.syncTransactions()
  f.provider.syncTransactions
    .mockClear()
    .mockResolvedValueOnce({ ...first, has_more: true })
    .mockRejectedValueOnce(new PlaidSyncError('restart'))
    .mockResolvedValueOnce(first)
  await f.service.sync(id)
  expect(f.provider.syncTransactions.mock.calls.map((call) => call[1])).toEqual([
    'stored',
    'next',
    'stored',
  ])
  expect(f.repository.restart).toHaveBeenCalledTimes(1)
  expect(f.repository.savePage.mock.calls[0]?.[0].pageId).not.toBe(
    f.repository.savePage.mock.calls[1]?.[0].pageId
  )
})
it.each(['reauthorization_required', 'disconnected'] as const)(
  'persists safe %s state for invalid access',
  async (reason) => {
    const f = fixture()
    f.provider.syncTransactions.mockRejectedValue(new PlaidSyncError(reason))
    await expect(f.service.sync(id)).rejects.toThrow(
      'Bank synchronization is temporarily unavailable.'
    )
    expect(f.repository.release).toHaveBeenCalledWith(id, expect.any(String), reason)
    expect(f.repository.savePage).not.toHaveBeenCalled()
  }
)
it('retains durable pending continuation after a bounded number of pages', async () => {
  const f = fixture()
  let cursor = 0
  f.provider.syncTransactions.mockImplementation(async () => ({
    added: [],
    modified: [],
    removed: [],
    next_cursor: `c${cursor++}`,
    has_more: true,
  }))
  await f.service.sync(id)
  expect(f.provider.syncTransactions).toHaveBeenCalledTimes(20)
  expect(f.repository.release).toHaveBeenCalledWith(id, expect.any(String), 'continue')
})
it.each([1.001, Number.MAX_SAFE_INTEGER])(
  'rejects unsafe money %s without advancing',
  async (amount) => {
    const f = fixture()
    const first = await f.provider.syncTransactions()
    f.provider.syncTransactions.mockResolvedValue({
      ...first,
      added: [{ ...first.added[0], amount }],
    })
    await expect(f.service.sync(id)).rejects.toThrow()
    expect(f.repository.savePage).not.toHaveBeenCalled()
  }
)
