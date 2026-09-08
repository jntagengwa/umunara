// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@umunara/database'
import { GET, POST } from './v1/posts/route'
import { GET as getPost, PATCH, DELETE } from './v1/posts/[id]/route'
import { GET as getEvents, POST as createEvent } from './v1/events/route'
import { GET as getSetting, PUT as updateSetting } from './v1/site-settings/[key]/route'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ updateTag: vi.fn(), revalidateTag: vi.fn() }))
const state = vi.hoisted(() => ({
  client: undefined as unknown,
  role: 'editor',
  authenticated: true,
  databaseError: false,
  auditError: false,
  requests: [] as { path: string; method: string; body: unknown }[],
}))
vi.mock('@umunara/database/server', () => ({ createServerClient: async () => state.client }))
vi.mock('@umunara/database/admin', () => ({ createAdminClient: () => state.client }))

const id = '11111111-1111-4111-8111-111111111111'
const row = {
  id,
  author_id: id,
  title: 'Welcome',
  slug: 'welcome',
  content: 'Hello',
  excerpt: null,
  category_id: null,
  status: 'published',
  visibility: 'public',
  published_at: '2026-01-01',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
}
const context = { params: Promise.resolve({ id }) }

beforeEach(() => {
  state.role = 'editor'
  state.authenticated = true
  state.databaseError = false
  state.auditError = false
  state.requests = []
  state.client = createClient<Database>('http://supabase.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    accessToken: async () => 'test-token',
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input))
        const method = init?.method ?? 'GET'
        const body: unknown = init?.body ? JSON.parse(String(init.body)) : null
        state.requests.push({ path: url.pathname + url.search, method, body })
        if (
          (state.databaseError && url.pathname.endsWith('/posts')) ||
          (state.auditError && url.pathname.endsWith('/audit_log'))
        ) {
          return new Response(
            JSON.stringify({ code: 'XX000', message: 'secret database detail' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          )
        }
        let response: unknown = null
        if (url.pathname.endsWith('/profiles'))
          response = {
            id,
            role: state.role,
            approved_at: state.role === 'pending' ? null : '2026-01-01',
          }
        else if (url.pathname.endsWith('/posts'))
          response =
            method === 'GET' && !url.searchParams.has('id') ? [row] : { ...row, ...(body ?? {}) }
        else if (url.pathname.endsWith('/events'))
          response = method === 'GET' ? [] : { id, ...(body ?? {}) }
        else if (url.pathname.endsWith('/site_settings'))
          response = { id, key: 'home.hero', value: 'Welcome', ...(body ?? {}) }
        return new Response(JSON.stringify(response), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/7' },
        })
      },
    },
  })
  // getUser performs an external auth verification; the query client itself stays real.
  Object.defineProperty(state.client, 'auth', {
    value: {
      getUser: async () => ({
        data: { user: state.authenticated ? { id, email_confirmed_at: '2026-01-01' } : null },
        error: null,
      }),
    },
  })
})

function request(path: string, method = 'GET', body?: unknown): Request {
  return new Request(`http://localhost/api/v1/${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  })
}

describe('content API integration', () => {
  it('permits anonymous public reads but requires authentication for writes', async () => {
    state.authenticated = false
    expect((await GET(request('posts'))).status).toBe(200)
    expect((await POST(request('posts', 'POST', { title: 'New', slug: 'new' }))).status).toBe(401)
  })
  it('validates pagination before any repository query', async () => {
    const response = await GET(request('posts?pageSize=101'))
    expect(response.status).toBe(400)
    expect(state.requests).toHaveLength(0)
  })
  it('returns a public page of DTOs with explicit database filters', async () => {
    const response = await GET(request('posts?page=2&pageSize=1'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: [expect.objectContaining({ authorId: id })],
      page: 2,
      pageSize: 1,
      total: 7,
    })
    expect(
      state.requests.some(
        (item) =>
          item.path.includes('visibility=eq.public') &&
          item.path.includes('status=eq.published') &&
          item.path.includes('offset=1'),
      ),
    ).toBe(true)
  })
  it('rejects member writes and pending member-scope reads', async () => {
    state.role = 'member'
    expect((await POST(request('posts', 'POST', { title: 'New', slug: 'new' }))).status).toBe(403)
    state.role = 'pending'
    expect((await GET(request('posts?scope=member'))).status).toBe(403)
    expect(state.requests.every((entry) => entry.method === 'GET')).toBe(true)
  })
  it('rejects unknown fields and malformed JSON', async () => {
    expect(
      (await POST(request('posts', 'POST', { title: 'New', slug: 'new', authorId: id }))).status,
    ).toBe(400)
    const malformed = new Request('http://localhost/api/v1/posts', {
      method: 'POST',
      body: '{',
      headers: { 'Content-Type': 'application/json' },
    })
    expect((await POST(malformed)).status).toBe(400)
  })
  it('creates a post using the actor as author and writes an audit entry', async () => {
    const response = await POST(request('posts', 'POST', { title: 'New', slug: 'new' }))
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      title: 'New',
      slug: 'new',
      authorId: id,
      status: 'draft',
    })
    expect(state.requests).toContainEqual(
      expect.objectContaining({
        path: '/rest/v1/audit_log',
        method: 'POST',
        body: expect.objectContaining({ actor_id: id, entity_type: 'post', action: 'create' }),
      }),
    )
  })
  it('reads, updates and removes a post via asynchronous route params', async () => {
    expect((await getPost(request('posts/' + id), context)).status).toBe(200)
    const updated = await PATCH(request('posts/' + id, 'PATCH', { title: 'Changed' }), context)
    expect(await updated.json()).toMatchObject({ title: 'Changed' })
    expect((await DELETE(request('posts/' + id, 'DELETE'), context)).status).toBe(200)
  })
  it('creates events and permits editor site-setting updates', async () => {
    const events = await getEvents(request('events'))
    expect(events.status).toBe(200)
    expect(await events.json()).toMatchObject({ data: [], page: 1, pageSize: 25 })
    expect(
      (
        await createEvent(
          request('events', 'POST', { title: 'Gathering', startsAt: '2026-09-06T10:00:00Z' }),
        )
      ).status,
    ).toBe(201)
    const response = await updateSetting(
      request('site-settings/home.hero', 'PUT', { value: 'Welcome' }),
      { params: Promise.resolve({ key: 'home.hero' }) },
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ key: 'home.hero', value: 'Welcome' })
    expect(
      (
        await getSetting(request('site-settings/home.hero'), {
          params: Promise.resolve({ key: 'home.hero' }),
        })
      ).status,
    ).toBe(200)
  })
  it('hides database error details and reports failed audit writes', async () => {
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      state.databaseError = true
      const failedRead = await GET(request('posts'))
      expect(failedRead.status).toBe(500)
      expect(await failedRead.text()).not.toContain('secret database detail')
      state.databaseError = false
      state.auditError = true
      const failedAudit = await POST(request('posts', 'POST', { title: 'New', slug: 'new' }))
      expect(failedAudit.status).toBe(500)
      expect(await failedAudit.json()).toEqual({
        error: 'The change was saved, but its audit record could not be recorded.',
      })
      expect(diagnostic).toHaveBeenCalledWith(expect.stringContaining('audit_append_failed'))
      expect(diagnostic.mock.calls.flat().join()).not.toContain('secret database detail')
    } finally {
      diagnostic.mockRestore()
    }
  })
  it('rejects cross-origin cookie mutations', async () => {
    const input = request('posts', 'POST', { title: 'New', slug: 'new' })
    input.headers.set('Origin', 'https://attacker.test')
    expect((await POST(input)).status).toBe(403)
    expect(state.requests).toHaveLength(0)
  })
})
