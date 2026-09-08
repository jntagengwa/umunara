// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@umunara/database'
import { GET } from './v1/admin/donations/summary/route'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (load: () => Promise<unknown>) => load,
}))
const state = vi.hoisted(() => ({
  client: undefined as unknown,
  role: 'admin',
  authenticated: true,
  reads: 0,
  error: false,
}))
vi.mock('@umunara/database/server', () => ({ createServerClient: async () => state.client }))
vi.mock('@umunara/database/admin', () => ({ createAdminClient: () => state.client }))
const id = '11111111-1111-4111-8111-111111111111'
beforeEach(() => {
  state.role = 'admin'
  state.authenticated = true
  state.reads = 0
  state.error = false
  state.client = createClient<Database>('http://supabase.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    accessToken: async () => 'test-token',
    global: {
      fetch: async (input) => {
        const url = new URL(String(input))
        if (url.pathname.endsWith('/profiles'))
          return Response.json({
            id,
            role: state.role,
            approved_at: state.role === 'pending' ? null : '2026-01-01',
          })
        if (url.pathname.endsWith('/rpc/donation_report')) {
          state.reads++
          return state.error
            ? Response.json({ code: 'XX000', message: 'private finance detail' }, { status: 500 })
            : Response.json([])
        }
        throw new Error(`Unexpected request ${url.pathname}`)
      },
    },
  })
  Object.defineProperty(state.client, 'auth', {
    value: {
      getUser: async () => ({
        data: { user: state.authenticated ? { id, email_confirmed_at: '2026-01-01' } : null },
        error: null,
      }),
    },
  })
})
const request = (query = 'from=2026-01-01&to=2026-01-31') =>
  new Request(`http://localhost/api/v1/admin/donations/summary?${query}`)
it.each(['pending', 'member', 'editor'])(
  'returns 403 for %s without a financial read',
  async (role) => {
    state.role = role
    const response = await GET(request())
    expect(response.status).toBe(403)
    expect(state.reads).toBe(0)
  }
)
it('requires authentication and disallows public response caching', async () => {
  state.authenticated = false
  const response = await GET(request())
  expect(response.status).toBe(401)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(state.reads).toBe(0)
})
it('returns aggregate-only empty totals for an admin', async () => {
  const response = await GET(request())
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    giftCount: 0,
    netAmountMinor: 0,
    range: { from: '2026-01-01', to: '2026-01-31', currency: 'USD' },
  })
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(state.reads).toBe(1)
})
it.each([
  'from=bad&to=2026-01-31',
  'from=2026-01-01',
  'currency=invalid',
  'from=2026-01-01&from=2026-02-01&to=2026-02-02',
  'donor=private',
])('rejects invalid/ambiguous filters %s', async (query) => {
  expect((await GET(request(query))).status).toBe(400)
  expect(state.reads).toBe(0)
})
it('reports a safe retryable error on aggregate failure', async () => {
  state.error = true
  const response = await GET(request())
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('private finance detail')
})
