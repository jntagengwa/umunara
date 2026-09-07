import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { setTimeout } from 'node:timers/promises'
import { createClient } from '@supabase/supabase-js'

// This smoke test is deliberately restricted to the existing isolated test stack.
const workdir = process.argv[2]
assert.equal(workdir, '/private/tmp/umunara-core-platform-task3.Lch2gq')
const environment = JSON.parse(
  execFileSync(
    process.env.SUPABASE_CLI ?? 'supabase',
    ['status', '--workdir', workdir, '--output', 'json'],
    { encoding: 'utf8' },
  ),
)
assert.equal(new URL(environment.API_URL).port, '55321')
assert.ok(['localhost', '127.0.0.1'].includes(new URL(environment.API_URL).hostname))
const admin = createClient(environment.API_URL, environment.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const probe = createServer().listen(0, '127.0.0.1')
await once(probe, 'listening')
const address = probe.address()
assert.ok(address && typeof address === 'object')
const port = String(address.port)
await new Promise((resolve) => probe.close(resolve))
const appUrl = `http://localhost:${port}`
const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const email = `auth-${randomUUID()}@example.test`
const password = randomUUID()
const jar = new Map()
let userId
let server

async function request(path, body) {
  const response = await fetch(appUrl + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '),
      Origin: appUrl,
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: 'manual',
  })
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';')[0]
    const index = pair.indexOf('=')
    jar.set(pair.slice(0, index), pair.slice(index + 1))
  }
  return response
}

try {
  server = spawn(
    process.execPath,
    [require.resolve('next/dist/bin/next'), 'start', '--hostname', 'localhost', '--port', port],
    {
      cwd: new URL('../apps/web/', import.meta.url),
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: environment.API_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: environment.ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: environment.SERVICE_ROLE_KEY,
      },
      stdio: ['ignore', 'ignore', 'inherit'],
    },
  )
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await request('/give')).ok) {
        ready = true
        break
      }
    } catch {
      // The application may not have bound its loopback port yet.
    }
    await setTimeout(100)
  }
  assert.ok(ready, 'The production app must start.')
  const signup = await request('/api/v1/auth/sign-up', {
    email,
    password,
    fullName: 'Auth smoke test',
  })
  assert.equal(signup.status, 201)
  const signupResult = await signup.json()
  const users = await admin.auth.admin.listUsers()
  assert.ifError(users.error)
  userId = users.data.users.find((user) => user.email === email)?.id
  assert.ok(userId, 'The application signup must create a real Auth user.')

  // Verify the real confirmation endpoint, also when this isolated stack auto-confirms signup.
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  assert.ifError(link.error)
  const confirmation = await request(
    '/api/v1/auth/confirm?type=email&token_hash=' +
      encodeURIComponent(link.data.properties.hashed_token),
  )
  assert.equal(confirmation.status, 303)
  assert.equal(confirmation.headers.get('location'), appUrl + '/account')
  assert.ok(['/check-email', '/account'].includes(signupResult.redirectTo))
  assert.match(await (await request('/account')).text(), /Awaiting membership approval/)
  assert.equal((await request('/api/v1/posts?scope=member')).status, 403)
  const profile = await admin.from('profiles').select('role,approved_at').eq('id', userId).single()
  assert.ifError(profile.error)
  assert.deepEqual(profile.data, { role: 'pending', approved_at: null })

  const tokenCookie = [...jar].find(([name]) => name.endsWith('-auth-token'))
  assert.ok(tokenCookie)
  const stored = JSON.parse(Buffer.from(tokenCookie[1].slice(7), 'base64url').toString())
  jar.set(
    tokenCookie[0],
    'base64-' + Buffer.from(JSON.stringify({ ...stored, expires_at: 1 })).toString('base64url'),
  )
  const refreshed = await request('/account')
  assert.match(await refreshed.text(), /Awaiting membership approval/)
  const renewed = JSON.parse(Buffer.from(jar.get(tokenCookie[0]).slice(7), 'base64url').toString())
  assert.ok(renewed.expires_at > Math.floor(Date.now() / 1000))
  assert.notEqual(renewed.refresh_token, stored.refresh_token)
  assert.match(refreshed.headers.get('cache-control'), /no-store/)

  assert.equal((await request('/api/v1/auth/sign-out', {})).status, 200)
  assert.equal(jar.get(tokenCookie[0]), '')
  assert.equal((await request('/account')).headers.get('location'), '/sign-in')
  assert.equal(
    (await request('/api/v1/auth/sign-in', { email, password: 'wrong-password' })).status,
    400,
  )
  assert.equal((await request('/api/v1/auth/sign-in', { email, password })).status, 200)
  assert.match(await (await request('/account')).text(), /Awaiting membership approval/)
  assert.equal((await request('/api/v1/auth/sign-out', {})).status, 200)
  console.log(
    'PASS: real signup, email token confirmation, pending profile, private denial, proxy cookie renewal, password sign-in, and sign-out.',
  )
} finally {
  if (server) {
    server.kill('SIGTERM')
    await once(server, 'exit')
  }
  if (userId) {
    const deleted = await admin.auth.admin.deleteUser(userId)
    assert.ifError(deleted.error)
  }
}
