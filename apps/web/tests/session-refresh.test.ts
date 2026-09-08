// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { refreshSession } from '@umunara/database/proxy'

vi.mock('server-only', () => ({}))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it('renews an expired session in both the downstream request and returned browser cookies', async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://refresh.test')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-public-key')
  const id = '11111111-1111-4111-8111-111111111111'
  const user = { id, email_confirmed_at: '2026-09-07' }
  const token = (expires: number) =>
    [
      'eyJhbGciOiJIUzI1NiJ9',
      Buffer.from(JSON.stringify({ sub: id, exp: expires })).toString('base64url'),
      'test',
    ].join('.')
  const expired = {
    access_token: token(1),
    refresh_token: 'old-refresh',
    expires_at: 1,
    token_type: 'bearer',
    user,
  }
  const renewed = {
    access_token: token(Math.floor(Date.now() / 1000) + 3600),
    refresh_token: 'new-refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user,
  }
  const provider = vi
    .fn<typeof fetch>()
    .mockImplementation(async (url) =>
      Response.json(String(url).includes('/token') ? renewed : user),
    )
  vi.stubGlobal('fetch', provider)
  const request = new NextRequest('http://localhost/member', {
    headers: {
      Cookie:
        'sb-refresh-auth-token=base64-' +
        Buffer.from(JSON.stringify(expired)).toString('base64url'),
    },
  })
  const response = await refreshSession(request)
  const cookie = response.cookies.get('sb-refresh-auth-token')
  expect(cookie?.value).toBeTruthy()
  expect(request.cookies.get('sb-refresh-auth-token')?.value).toBe(cookie?.value)
  expect(response.headers.get('x-middleware-request-cookie')).toContain(cookie?.value)
  expect(response.headers.get('set-cookie')).toContain('sb-refresh-auth-token=')
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  const decoded = JSON.parse(Buffer.from(cookie!.value.slice(7), 'base64url').toString())
  expect(decoded.refresh_token).toBe('new-refresh')
  expect(provider).toHaveBeenCalledWith(
    expect.stringContaining('grant_type=refresh_token'),
    expect.any(Object),
  )
  expect(provider).toHaveBeenCalledWith(
    expect.stringContaining('/auth/v1/user'),
    expect.any(Object),
  )
})
