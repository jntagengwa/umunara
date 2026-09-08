// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { POST as link } from './v1/admin/bank/link-token/route'
import { POST as exchange } from './v1/admin/bank/exchange-token/route'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ updateTag: vi.fn(), revalidateTag: vi.fn() }))
const state = vi.hoisted(() => ({
  role: 'admin',
  approved: true,
  authenticated: true,
  rateLimit: vi.fn(),
  createLinkToken: vi.fn(),
  exchangePublicToken: vi.fn(),
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
vi.mock('@umunara/api/bank/context', () => ({
  createBankConnectionService: () => ({
    createLinkToken: state.createLinkToken,
    exchangePublicToken: state.exchangePublicToken,
  }),
}))
vi.mock('../../lib/request-rate-limit', () => ({ requireRequestRateLimit: state.rateLimit }))
beforeEach(() => {
  vi.clearAllMocks()
  state.role = 'admin'
  state.approved = true
  state.authenticated = true
  state.createLinkToken.mockResolvedValue({ linkToken: 'link-fixture' })
  state.exchangePublicToken.mockResolvedValue({
    id: '11111111-1111-4111-8111-111111111111',
    institutionName: 'Bank',
    status: 'active',
    lastSyncedAt: null,
  })
})
const request = (body: unknown, origin = 'https://umunara.test') =>
  new Request('https://umunara.test/api/v1/admin/bank/link-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin },
    body: JSON.stringify(body),
  })
it.each(['pending', 'member', 'editor'])(
  'denies %s before providers or rate limiting',
  async (role) => {
    state.role = role
    state.approved = role !== 'pending'
    expect((await link(request({ businessAccountConsent: true }))).status).toBe(403)
    expect((await exchange(request({}))).status).toBe(403)
    expect(state.createLinkToken).not.toHaveBeenCalled()
    expect(state.exchangePublicToken).not.toHaveBeenCalled()
    expect(state.rateLimit).not.toHaveBeenCalled()
  }
)
it('denies anonymous and unapproved admin users', async () => {
  state.authenticated = false
  expect((await link(request({}))).status).toBe(401)
  state.authenticated = true
  state.approved = false
  expect((await link(request({}))).status).toBe(403)
})
it('requires same-origin consent and strict bounded token/selection input', async () => {
  expect(
    (await link(request({ businessAccountConsent: true }, 'https://attacker.test'))).status
  ).toBe(403)
  expect((await link(request({ businessAccountConsent: false }))).status).toBe(400)
  expect(
    (
      await exchange(
        request({
          businessAccountConsent: true,
          publicToken: 'public-fixture',
          selectedAccountIds: [],
        })
      )
    ).status
  ).toBe(400)
  expect(
    (
      await exchange(
        request({
          businessAccountConsent: true,
          publicToken: 'public-fixture',
          selectedAccountIds: ['a1'],
          actorId: 'attacker',
        })
      )
    ).status
  ).toBe(400)
  expect(state.exchangePublicToken).not.toHaveBeenCalled()
})
it('returns private no-store tokens and safe connection responses for an admin', async () => {
  const response = await link(request({ businessAccountConsent: true }))
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(await response.json()).toEqual({ linkToken: 'link-fixture' })
  const connected = await exchange(
    request({
      businessAccountConsent: true,
      publicToken: 'public-fixture',
      selectedAccountIds: ['a1'],
    })
  )
  expect(connected.status).toBe(201)
  expect(await connected.text()).not.toMatch(/public-fixture|access_token|secretReference/)
  expect(state.exchangePublicToken).toHaveBeenCalledWith(
    expect.objectContaining({ role: 'admin' }),
    'public-fixture',
    ['a1']
  )
})
