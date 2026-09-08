import type { BrowserContext } from '@playwright/test'

export async function signIn(
  context: BrowserContext,
  role: 'pending' | 'member' | 'editor' | 'admin',
  id = '11111111-1111-4111-8111-111111111111',
): Promise<void> {
  const token = [
    'eyJhbGciOiJIUzI1NiJ9',
    Buffer.from(
      JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600, testRole: role }),
    ).toString('base64url'),
    'test-signature',
  ].join('.')
  const session = {
    access_token: token,
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id },
  }
  await context.addCookies([
    {
      name: 'sb-127-auth-token',
      value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`,
      domain: 'localhost',
      path: '/',
    },
  ])
}
