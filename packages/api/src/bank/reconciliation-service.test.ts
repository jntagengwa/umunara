import { beforeEach, expect, it, vi } from 'vitest'
import { RepositoryError } from '@umunara/database/repositories'
import type { Actor } from '../auth/require-user'
import { ReconciliationService } from './reconciliation-service'

vi.mock('server-only', () => ({}))
const id = '11111111-1111-4111-8111-111111111111'
const admin: Actor = { id, role: 'admin', approvedAt: '2026-01-01' }
const query = { from: '2026-09-01', to: '2026-09-30', page: 2, pageSize: 25, minAmountMinor: -500 }
const bank = {
  list: vi.fn(async () => ({ items: [], hasMore: false })),
  classify: vi.fn(async () => ({ outcome: 'applied' as const })),
}
const links = { link: vi.fn(async () => ({ outcome: 'applied' as const, linkIds: [id] })) }
const cache = { invalidate: vi.fn() }
const service = new ReconciliationService(bank, links, cache)
beforeEach(() => {
  vi.clearAllMocks()
})

it('matches a processor payout through the existing atomic link without creating a donation', async () => {
  await expect(service.linkPayout(admin, id, [id])).resolves.toEqual({
    outcome: 'applied',
    linkIds: [id],
  })
  expect(links.link).toHaveBeenCalledExactlyOnceWith({
    actorId: id,
    transactionId: id,
    donationIds: [id],
    kind: 'processor_payout',
  })
  expect(bank.classify).not.toHaveBeenCalled()
  expect(cache.invalidate).toHaveBeenCalledExactlyOnceWith(['bank:transactions'])
})
it.each(['pending', 'member', 'editor'] as const)(
  'denies %s before reading or writing',
  async (role) => {
    const actor = { ...admin, role }
    await expect(service.list(actor, query)).rejects.toMatchObject({ status: 403 })
    await expect(service.classify(actor, id, 'donation')).rejects.toMatchObject({ status: 403 })
    await expect(service.linkPayout(actor, id, [id])).rejects.toMatchObject({ status: 403 })
    expect(bank.list).not.toHaveBeenCalled()
    expect(bank.classify).not.toHaveBeenCalled()
    expect(links.link).not.toHaveBeenCalled()
  }
)
it('denies anonymous and unapproved admins', async () => {
  await expect(service.list(null, query)).rejects.toMatchObject({ status: 401 })
  await expect(
    service.classify({ ...admin, approvedAt: null }, id, 'donation')
  ).rejects.toMatchObject({ status: 403 })
})
it('validates bounded filters and derives the actor for the repository', async () => {
  await expect(service.list(admin, query)).resolves.toEqual({ items: [], hasMore: false })
  expect(bank.list).toHaveBeenCalledExactlyOnceWith(id, query)
  await expect(service.list(admin, { ...query, pageSize: 101 })).rejects.toThrow()
  await expect(service.list(admin, { ...query, from: '2025-01-01' })).rejects.toThrow()
  expect(bank.list).toHaveBeenCalledTimes(1)
})
it('classifies with one atomic audited write and only bank cache invalidation', async () => {
  await service.classify(admin, id, 'non_donation')
  expect(bank.classify).toHaveBeenCalledExactlyOnceWith({
    actorId: id,
    transactionId: id,
    classification: 'non_donation',
  })
  expect(cache.invalidate).toHaveBeenCalledExactlyOnceWith(['bank:transactions'])
  expect(links.link).not.toHaveBeenCalled()
})
it('rejects duplicate payout targets and invalid classifications before persistence', async () => {
  await expect(service.linkPayout(admin, id, [id, id])).rejects.toThrow()
  await expect(service.classify(admin, id, 'income')).rejects.toThrow()
  expect(bank.classify).not.toHaveBeenCalled()
  expect(links.link).not.toHaveBeenCalled()
})
it.each(['22023', '23505', '23514'])(
  'returns a safe conflict for incompatible matches (%s)',
  async (code) => {
    links.link.mockRejectedValueOnce(new RepositoryError(code))
    await expect(service.linkPayout(admin, id, [id])).rejects.toMatchObject({
      status: 409,
      message:
        'This transaction cannot be changed or matched as requested. Refresh and check the classification, currency, amounts and existing links.',
    })
    expect(cache.invalidate).not.toHaveBeenCalled()
  }
)
