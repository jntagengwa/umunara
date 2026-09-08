// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { POST as webhook } from './v1/webhooks/plaid/route'
import { POST as sync } from './v1/internal/bank/sync/route'
import { ApiError } from '@umunara/api'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ updateTag: vi.fn(), revalidateTag: vi.fn() }))
const state = vi.hoisted(() => ({ sync: vi.fn(), handleWebhook: vi.fn(), factory: vi.fn() }))
vi.mock('@umunara/api/bank/context', () => ({
  createBankSyncService: () => {
    state.factory()
    return state
  },
}))
const secret = 'fixture-separate-sync-secret-32-characters'
const id = '11111111-1111-4111-8111-111111111111'
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('BANK_SYNC_SECRET', secret)
  state.sync.mockResolvedValue({ added: 1, modified: 0, removed: 0 })
  state.handleWebhook.mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllEnvs())
const request = (body: string, authorization?: string) =>
  new Request('https://umunara.test/api/v1/internal/bank/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(authorization ? { authorization } : {}) },
    body,
  })
it.each([undefined, 'Bearer browser-session', 'Bearer wrong-secret'])(
  'denies internal sync before constructing dependencies (%s)',
  async (authorization) => {
    const response = await sync(request(JSON.stringify({ connectionId: id }), authorization))
    expect(response.status).toBe(401)
    expect(state.factory).not.toHaveBeenCalled()
  }
)
it('requires configured secret and rejects unknown request fields', async () => {
  vi.stubEnv('BANK_SYNC_SECRET', '')
  expect((await sync(request('{}', `Bearer ${secret}`))).status).toBe(503)
  vi.stubEnv('BANK_SYNC_SECRET', secret)
  expect(
    (await sync(request(JSON.stringify({ connectionId: id, actorId: id }), `Bearer ${secret}`)))
      .status
  ).toBe(400)
  expect(state.factory).not.toHaveBeenCalled()
})
it('syncs only the explicit connection and returns private counts', async () => {
  const response = await sync(request(JSON.stringify({ connectionId: id }), `Bearer ${secret}`))
  expect(await response.json()).toEqual({ added: 1, modified: 0, removed: 0 })
  expect(state.sync).toHaveBeenCalledWith(id)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
})
it('preserves the raw webhook body and propagates safe signature errors', async () => {
  const body = '{ "item_id": "test" }\n'
  expect((await webhook(request(body))).status).toBe(200)
  expect(state.handleWebhook).toHaveBeenCalledWith(expect.any(Headers), body)
  state.handleWebhook.mockRejectedValue(new ApiError(401, 'Invalid Plaid webhook.'))
  expect((await webhook(request(body))).status).toBe(401)
})
it('bounds webhook bodies before dependency construction', async () => {
  expect((await webhook(request('x'.repeat(65537)))).status).toBe(413)
  expect(state.factory).not.toHaveBeenCalled()
})
