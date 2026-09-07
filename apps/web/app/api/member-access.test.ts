// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@umunara/database'
import { POST as approve } from './v1/admin/members/[id]/approve/route'
import { GET as download } from './v1/resources/[id]/download/route'
import { POST as register } from './v1/events/[id]/registrations/route'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ updateTag: vi.fn(), revalidateTag: vi.fn() }))
const state = vi.hoisted(() => ({
  client: undefined as unknown,
  role: 'member',
  signed: false,
  rpc: false,
  approved: false,
  auditError: false,
}))
vi.mock('@umunara/database/server', () => ({ createServerClient: async () => state.client }))
vi.mock('@umunara/database/admin', () => ({ createAdminClient: () => state.client }))
const id = '11111111-1111-4111-8111-111111111111'
const targetId = '22222222-2222-4222-8222-222222222222'
const context = { params: Promise.resolve({ id: targetId }) }

beforeEach(() => {
  state.role = 'member'
  state.signed = false
  state.rpc = false
  state.approved = false
  state.auditError = false
  state.client = createClient<Database>('http://supabase.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    accessToken: async () => 'test-token',
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input))
        let data: unknown = null
        if (url.pathname.endsWith('/audit_log') && state.auditError) {
          return Response.json({ code: 'XX000', message: 'private audit detail' }, { status: 500 })
        }
        if (url.pathname.endsWith('/profiles')) {
          if (init?.method === 'PATCH') {
            expect(url.searchParams.get('role')).toBe('eq.pending')
            expect(url.searchParams.get('id')).toBe(`eq.${targetId}`)
            state.approved = true
            data = {
              id: targetId,
              role: 'member',
              approved_at: '2026-09-07',
              full_name: 'Member',
              email: 'member@example.test',
            }
          } else
            data = {
              id,
              role: state.role,
              approved_at: state.role === 'pending' ? null : '2026-09-01',
            }
        } else if (url.pathname.endsWith('/resources')) {
          data = {
            id: targetId,
            storage_path: 'guide.pdf',
            status: 'published',
            visibility: 'member',
          }
        } else if (url.pathname === '/storage/v1/object/sign/resources/guide.pdf') {
          expect(JSON.parse(String(init?.body)).expiresIn).toBe(60)
          state.signed = true
          data = { signedURL: '/object/sign/resources/guide.pdf?token=private' }
        } else if (url.pathname.endsWith('/rpc/register_for_event')) {
          expect(JSON.parse(String(init?.body))).toEqual({ target_event_id: targetId })
          state.rpc = true
          data = {
            id: targetId,
            event_id: targetId,
            profile_id: id,
            status: 'registered',
            registered_at: '2026-09-07',
          }
        }
        return Response.json(data)
      },
    },
  })
  Object.defineProperty(state.client, 'auth', {
    value: {
      getUser: async () => ({
        data: { user: { id, email_confirmed_at: '2026-09-01' } },
        error: null,
      }),
    },
  })
})

function request(method: string, origin?: string): Request {
  return new Request('http://localhost/api/v1/test', {
    method,
    ...(origin ? { headers: { Origin: origin } } : {}),
  })
}

it('denies pending downloads without issuing a storage token and never caches errors', async () => {
  state.role = 'pending'
  const response = await download(request('GET'), context)
  expect(response.status).toBe(403)
  expect(response.headers.get('Cache-Control')).toContain('no-store')
  expect(state.signed).toBe(false)
})

it('returns a short-lived private URL without caching', async () => {
  const response = await download(request('GET'), context)
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toContain('no-store')
  expect(await response.json()).toMatchObject({
    url: expect.stringContaining('token=private'),
    expiresAt: expect.any(String),
  })
  expect(state.signed).toBe(true)
})

it('permits approval only for admins and uses a conditional pending update', async () => {
  expect((await approve(request('POST'), context)).status).toBe(403)
  expect(state.approved).toBe(false)
  state.role = 'admin'
  const response = await approve(request('POST'), context)
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ id: targetId, role: 'member' })
  expect(state.approved).toBe(true)
})

it('uses the authenticated registration transaction and blocks cross-origin mutations', async () => {
  expect((await register(request('POST', 'https://evil.test'), context)).status).toBe(403)
  expect(state.rpc).toBe(false)
  state.role = 'pending'
  expect((await register(request('POST'), context)).status).toBe(403)
  expect(state.rpc).toBe(false)
  state.role = 'member'
  const response = await register(request('POST'), context)
  expect(response.status).toBe(201)
  expect(await response.json()).toMatchObject({ eventId: targetId, profileId: id })
})

it('reports saved approval audit failures with no-store and no leaked details', async () => {
  state.role = 'admin'
  state.auditError = true
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    const response = await approve(request('POST'), context)
    expect(response.status).toBe(500)
    expect(state.approved).toBe(true)
    expect(response.headers.get('Cache-Control')).toContain('no-store')
    expect(await response.json()).toEqual({
      error: 'The change was saved, but its audit record could not be recorded.',
    })
  } finally {
    log.mockRestore()
  }
})
