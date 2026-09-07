import { createClient } from '@supabase/supabase-js'
import { expect, it, vi } from 'vitest'
import type { Database } from '../database.types'
import { ProfileRepository } from './profile-repository'

it('recovers the exact total after PostgREST rejects an out-of-range offset', async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    if (init?.method === 'HEAD') return new Response(null, { headers: { 'Content-Range': '*/25' } })
    return Response.json(
      {
        code: 'PGRST103',
        message: 'Requested range not satisfiable',
        details: 'An offset of 200 was requested, but there are only 25 rows.',
        hint: null,
      },
      { status: 416, headers: { 'Content-Range': '*/25' } },
    )
  })
  const client = createClient<Database>('http://database.test', 'public-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetcher },
  })
  expect(await new ProfileRepository(client).listPending({ page: 9, pageSize: 25 })).toEqual({
    data: [],
    total: 25,
    page: 9,
    pageSize: 25,
  })
  expect(fetcher).toHaveBeenCalledTimes(2)
  const [url, init] = fetcher.mock.calls[1]
  expect(new URL(String(url)).searchParams.get('role')).toBe('eq.pending')
  expect(new URL(String(url)).searchParams.has('offset')).toBe(false)
  expect(init?.method).toBe('HEAD')
})

it('does not swallow unrelated database failures', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ code: '42501', message: 'denied' }, { status: 403 }))
  const client = createClient<Database>('http://database.test', 'public-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetcher },
  })
  await expect(
    new ProfileRepository(client).listPending({ page: 9, pageSize: 25 }),
  ).rejects.toMatchObject({ code: '42501' })
  expect(fetcher).toHaveBeenCalledTimes(1)
})
