import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { setTimeout } from 'node:timers/promises'
import { createClient } from '@supabase/supabase-js'

// Requires a production build and a running isolated local Supabase workdir.
const workdir = process.argv[2]
if (!workdir) throw new Error('Pass the isolated Supabase workdir.')
const environment = JSON.parse(
  execFileSync('npx', ['--yes', 'supabase', 'status', '--workdir', workdir, '--output', 'json'], {
    encoding: 'utf8',
  }),
)
assert.ok(['localhost', '127.0.0.1'].includes(new URL(environment.API_URL).hostname))
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(environment.API_URL, environment.SERVICE_ROLE_KEY, options)
const member = createClient(environment.API_URL, environment.ANON_KEY, options)
const testId = randomUUID()
const path = `task6-tests/${testId}.txt`
const portProbe = createServer()
portProbe.listen(0, '127.0.0.1')
await once(portProbe, 'listening')
const address = portProbe.address()
assert.ok(address && typeof address === 'object')
const port = String(address.port)
await new Promise((resolve) => portProbe.close(resolve))
const appUrl = `http://127.0.0.1:${port}`
const require = createRequire(new URL('../apps/web/package.json', import.meta.url))

function data(result) {
  if (result.error) throw result.error
  return result.data
}

async function waitForApp(server) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('Test app exited before becoming ready.')
    try {
      if ((await fetch(`${appUrl}/give`)).ok) return
    } catch {
      // Startup has not bound the loopback port yet.
    }
    await setTimeout(100)
  }
  throw new Error('Test app did not become ready.')
}

let userId
let resourceId
let uploaded = false
let server
try {
  const email = `${testId}@example.test`
  const password = randomUUID()
  userId = data(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user.id
  data(
    await admin.storage.from('resources').upload(path, 'Private route test', { cacheControl: '0' }),
  )
  uploaded = true
  resourceId = data(
    await admin
      .from('resources')
      .insert({
        title: 'Controlled download test',
        author_id: userId,
        storage_path: path,
        status: 'published',
        visibility: 'member',
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single(),
  ).id
  const session = data(await member.auth.signInWithPassword({ email, password })).session
  assert.ok(session)
  const cookie = `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`
  server = spawn(
    process.execPath,
    [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', port],
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
  await waitForApp(server)
  const route = `${appUrl}/api/v1/resources/${resourceId}/download`
  const denied = await fetch(route, { headers: { Cookie: cookie } })
  assert.equal(denied.status, 403)
  assert.match(denied.headers.get('cache-control'), /no-store/)

  data(
    await admin
      .from('profiles')
      .update({ role: 'member', approved_at: new Date().toISOString() })
      .eq('id', userId),
  )
  assert.ok(
    (await member.storage.from('resources').download(path)).error,
    'direct download must fail',
  )
  assert.ok(
    (await member.storage.from('resources').createSignedUrl(path, 86_400)).error,
    'member must not mint a day-long URL',
  )
  assert.ok(
    (await member.storage.from('resources').createSignedUrl(path, 60)).error,
    'even short URLs must use the route',
  )

  const before = Date.now()
  const response = await fetch(route, { headers: { Cookie: cookie } })
  assert.equal(response.status, 200)
  assert.match(response.headers.get('cache-control'), /no-store/)
  const download = await response.json()
  assert.ok(Date.parse(download.expiresAt) > before)
  assert.ok(Date.parse(download.expiresAt) <= Date.now() + 60_000)
  const token = new URL(download.url).searchParams.get('token')
  assert.ok(token)
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
  assert.equal(claims.exp - claims.iat, 60)
  const file = await fetch(download.url)
  assert.equal(file.status, 200)
  assert.equal(await file.text(), 'Private route test')

  data(
    await admin
      .from('resources')
      .update({ status: 'draft', published_at: null })
      .eq('id', resourceId),
  )
  const draft = await fetch(route, { headers: { Cookie: cookie } })
  assert.equal(draft.status, 404)
  assert.match(draft.headers.get('cache-control'), /no-store/)
  data(await admin.from('profiles').update({ role: 'pending', approved_at: null }).eq('id', userId))
  assert.equal((await fetch(route, { headers: { Cookie: cookie } })).status, 403)
  process.stdout.write(
    'PASS: direct reads/signing denied; authorized route returns a 60-second no-store URL; draft/revoked access denied.\n',
  )
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    await once(server, 'exit')
  }
  if (uploaded) data(await admin.storage.from('resources').remove([path]))
  if (resourceId) data(await admin.from('resources').delete().eq('id', resourceId))
  if (userId) data(await admin.auth.admin.deleteUser(userId))
}
