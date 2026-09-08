// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { ApiError } from '@umunara/api'
import { GET } from './v1/admin/bank/transactions/route'
import { POST as classify } from './v1/admin/bank/transactions/[id]/classify/route'
import { POST as reconcile } from './v1/admin/bank/transactions/[id]/reconcile/route'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ updateTag: vi.fn(), revalidateTag: vi.fn() }))
const state = vi.hoisted(() => ({
  role: 'admin',
  approved: true,
  authenticated: true,
  rateLimit: vi.fn(),
  list: vi.fn(),
  classify: vi.fn(),
  linkPayout: vi.fn(),
}))
vi.mock('@umunara/api/context', () => ({
  createServiceContext: async () => ({
    auth: {
      getUser: async () =>
        state.authenticated
          ? { id: '11111111-1111-4111-8111-111111111111', emailConfirmedAt: '2026-01-01' }
          : null,
      getProfile: async (id: string) => ({
        id,
        role: state.role,
        approvedAt: state.approved ? '2026-01-01' : null,
      }),
    },
  }),
}))
vi.mock('@umunara/api/bank/reconciliation-context', () => ({
  createReconciliationService: () => state,
}))
vi.mock('../../lib/request-rate-limit', () => ({ requireRequestRateLimit: state.rateLimit }))
const id = '11111111-1111-4111-8111-111111111111'
const context = { params: Promise.resolve({ id }) }
const request = (body: unknown, origin = 'https://umunara.test') =>
  new Request('https://umunara.test/api/v1/admin/bank/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin },
    body: JSON.stringify(body),
  })
const read = (query = 'from=2026-09-01&to=2026-09-30') =>
  new Request(`https://umunara.test/api/v1/admin/bank/transactions?${query}`)
beforeEach(() => {
  vi.clearAllMocks()
  state.role = 'admin'
  state.approved = true
  state.authenticated = true
  state.list.mockResolvedValue({ items: [], hasMore: false })
  state.classify.mockResolvedValue({ outcome: 'applied' })
  state.linkPayout.mockResolvedValue({ outcome: 'applied', linkIds: [id] })
})
it.each(['pending', 'member', 'editor'])('denies %s before review dependencies', async (role) => {
  state.role = role
  expect((await GET(read())).status).toBe(403)
  expect((await classify(request({ classification: 'donation' }), context)).status).toBe(403)
  expect((await reconcile(request({ donationIds: [id] }), context)).status).toBe(403)
  expect(state.list).not.toHaveBeenCalled()
  expect(state.classify).not.toHaveBeenCalled()
  expect(state.linkPayout).not.toHaveBeenCalled()
})
it('denies anonymous and unapproved admins', async () => {
  state.authenticated = false
  expect((await GET(read())).status).toBe(401)
  state.authenticated = true
  state.approved = false
  expect((await GET(read())).status).toBe(403)
})
it('validates signed filters, date bounds, duplicate keys and pagination before service calls', async () => {
  const response = await GET(
    read(
      `from=2026-09-01&to=2026-09-30&page=2&pageSize=25&minAmountMinor=-500&accountId=${id}&classification=unreviewed`
    )
  )
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(state.list).toHaveBeenCalledWith(
    expect.objectContaining({ id, role: 'admin' }),
    expect.objectContaining({ minAmountMinor: -500, accountId: id, page: 2, pageSize: 25 })
  )
  for (const query of [
    'from=2026-09-01&to=2026-09-30&page=1&page=2',
    'from=2026-09-01&to=2026-09-30&pageSize=101',
    'from=2026-02-30&to=2026-09-30',
    'from=2026-09-01&to=2026-09-30&minAmountMinor=',
    'from=2026-09-01&to=2026-09-30&actorId=attacker',
  ])
    expect((await GET(read(query))).status).toBe(400)
  expect(state.list).toHaveBeenCalledTimes(1)
})
it('requires same-origin strict inputs and derives the acting admin', async () => {
  expect(
    (await classify(request({ classification: 'donation' }, 'https://attacker.test'), context))
      .status
  ).toBe(403)
  expect(
    (await classify(request({ classification: 'donation', actorId: id }), context)).status
  ).toBe(400)
  expect((await classify(request({ classification: 'income' }), context)).status).toBe(400)
  expect((await reconcile(request({ donationIds: [id, id] }), context)).status).toBe(400)
  expect(
    (
      await reconcile(request({ donationIds: [id] }), {
        params: Promise.resolve({ id: 'invalid' }),
      })
    ).status
  ).toBe(400)
  expect(state.classify).not.toHaveBeenCalled()
  expect(state.linkPayout).not.toHaveBeenCalled()
  expect((await classify(request({ classification: 'non_donation' }), context)).status).toBe(200)
  expect((await reconcile(request({ donationIds: [id] }), context)).status).toBe(200)
  expect(state.linkPayout).toHaveBeenCalledWith(
    expect.objectContaining({ id, role: 'admin' }),
    id,
    [id]
  )
})
it('returns a recoverable private conflict response', async () => {
  state.linkPayout.mockRejectedValueOnce(new ApiError(409, 'Match conflict.'))
  const response = await reconcile(request({ donationIds: [id] }), context)
  expect(response.status).toBe(409)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(await response.json()).toEqual({ error: 'Match conflict.' })
})
