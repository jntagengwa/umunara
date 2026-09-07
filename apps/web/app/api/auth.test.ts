// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { POST as signUp } from './v1/auth/sign-up/route'
import { POST as signIn } from './v1/auth/sign-in/route'
import { POST as signOut } from './v1/auth/sign-out/route'
import { GET as confirm } from './v1/auth/confirm/route'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ updateTag: vi.fn(), revalidateTag: vi.fn() }))
const jar = vi.hoisted(() => new Map<string, string>())
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      jar.set(name, value)
    },
  }),
}))
const id = '11111111-1111-4111-8111-111111111111'
const credentials = { email: 'person@example.test', password: 'long-password' }
const provider = vi.fn<typeof fetch>()
const user = {
  id,
  email: credentials.email,
  email_confirmed_at: '2026-09-07',
  app_metadata: {},
  user_metadata: {},
}

function session() {
  return {
    access_token: [
      'eyJhbGciOiJIUzI1NiJ9',
      Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString(
        'base64url',
      ),
      'test',
    ].join('.'),
    refresh_token: 'test-refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user,
  }
}
function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}
function request(action: string, body?: unknown): Request {
  return new Request('http://localhost/api/v1/auth/' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}
beforeEach(() => {
  jar.clear()
  provider.mockReset()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://auth.test')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-public-key')
  vi.stubGlobal('fetch', provider)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it('signs up through Auth, preserves confirmation, and returns no session to the browser', async () => {
  provider.mockResolvedValue(json({ ...user, email_confirmed_at: null }))
  const response = await signUp(request('sign-up', { ...credentials, fullName: 'New member' }))
  expect(response.status).toBe(201)
  expect(await response.json()).toEqual({ redirectTo: '/check-email' })
  expect(response.headers.get('cache-control')).toContain('no-store')
  expect(provider).toHaveBeenCalledWith(
    expect.stringContaining(
      '/auth/v1/signup?redirect_to=http%3A%2F%2Flocalhost%2Fapi%2Fv1%2Fauth%2Fconfirm',
    ),
    expect.objectContaining({ body: expect.stringContaining('"full_name":"New member"') }),
  )
  expect(jar.get('sb-auth-auth-token-code-verifier')).toBeTruthy()
  expect(jar.has('sb-auth-auth-token')).toBe(false)
})

it('creates cookies for immediate signup and directs the user to their actual account state', async () => {
  provider.mockResolvedValue(json(session()))
  const response = await signUp(request('sign-up', { ...credentials, fullName: 'New member' }))
  expect(await response.json()).toEqual({ redirectTo: '/account' })
  expect([...jar.keys()].some((name) => name.endsWith('-auth-token'))).toBe(true)
})

it('validates credentials and refuses extra role fields and cross-origin mutations before Auth', async () => {
  expect(
    (await signUp(request('sign-up', { ...credentials, password: 'short', fullName: 'Name' })))
      .status,
  ).toBe(400)
  expect(
    (await signUp(request('sign-up', { ...credentials, fullName: 'Name', role: 'admin' }))).status,
  ).toBe(400)
  expect((await signIn(request('sign-in', { ...credentials, email: 'bad' }))).status).toBe(400)
  const crossOrigin = request('sign-in', credentials)
  crossOrigin.headers.set('Origin', 'https://attacker.test')
  expect((await signIn(crossOrigin)).status).toBe(403)
  const crossOriginOut = request('sign-out')
  crossOriginOut.headers.set('Origin', 'https://attacker.test')
  expect((await signOut(crossOriginOut)).status).toBe(403)
  expect(provider).not.toHaveBeenCalled()
})

it('signs in with password, persists cookies, and clears them when signing out', async () => {
  provider.mockResolvedValueOnce(json(session()))
  const response = await signIn(request('sign-in', credentials))
  expect(await response.json()).toEqual({ redirectTo: '/account' })
  expect(provider).toHaveBeenCalledWith(
    expect.stringContaining('grant_type=password'),
    expect.objectContaining({ body: expect.stringContaining('"password":"long-password"') }),
  )
  expect(jar.get('sb-auth-auth-token')).toBeTruthy()
  provider.mockResolvedValueOnce(new Response(null, { status: 204 }))
  expect(await (await signOut(request('sign-out'))).json()).toEqual({ redirectTo: '/sign-in' })
  expect(jar.get('sb-auth-auth-token')).toBe('')
})

it('returns a safe sign-in error without logging or echoing provider details', async () => {
  const logging = vi.spyOn(console, 'error')
  provider.mockResolvedValue(
    json({ message: 'secret-provider-detail', code: 'invalid_credentials' }, 400),
  )
  const response = await signIn(request('sign-in', credentials))
  expect(response.status).toBe(400)
  expect(await response.text()).not.toMatch(/secret-provider-detail|long-password/)
  expect(logging).not.toHaveBeenCalled()
  logging.mockRestore()
})

it('verifies an email token, writes the resulting session cookie, and ignores external redirect input', async () => {
  provider.mockResolvedValue(json(session()))
  const response = await confirm(
    new Request(
      'http://localhost/api/v1/auth/confirm?token_hash=one-use-hash&type=email&next=https://attacker.test',
    ),
  )
  expect(response.headers.get('location')).toBe('http://localhost/account')
  expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  expect(jar.get('sb-auth-auth-token')).toBeTruthy()
  expect(provider).toHaveBeenCalledWith(
    expect.stringContaining('/auth/v1/verify'),
    expect.objectContaining({ body: expect.stringContaining('"token_hash":"one-use-hash"') }),
  )
})

it('exchanges the PKCE code from a confirmation link using the signup verifier cookie', async () => {
  jar.set('sb-auth-auth-token-code-verifier', 'test-verifier')
  provider.mockResolvedValue(json(session()))
  const response = await confirm(
    new Request('http://localhost/api/v1/auth/confirm?code=one-use-code'),
  )
  expect(response.headers.get('location')).toBe('http://localhost/account')
  expect(provider).toHaveBeenCalledWith(
    expect.stringContaining('grant_type=pkce'),
    expect.objectContaining({
      body: expect.stringContaining('"code_verifier":"test-verifier"'),
    }),
  )
})

it('routes invalid, expired, and wrong-purpose confirmations back to sign in without authenticating', async () => {
  for (const query of ['', '?token_hash=token&type=recovery']) {
    expect(
      (await confirm(new Request('http://localhost/api/v1/auth/confirm' + query))).headers.get(
        'location',
      ),
    ).toContain('/sign-in?confirmation=failed')
  }
  expect(provider).not.toHaveBeenCalled()
  provider.mockResolvedValue(json({ message: 'Token expired', code: 'otp_expired' }, 403))
  expect(
    (
      await confirm(
        new Request('http://localhost/api/v1/auth/confirm?token_hash=expired&type=email'),
      )
    ).headers.get('location'),
  ).toContain('/sign-in?confirmation=failed')
  expect(jar.has('sb-auth-auth-token')).toBe(false)
})
