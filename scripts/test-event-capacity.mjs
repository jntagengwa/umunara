import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { setTimeout } from 'node:timers/promises'

// Run only against the isolated local test stack; requires psql on PATH.
const databaseUrl = process.argv[2]
if (!databaseUrl || !['localhost', '127.0.0.1'].includes(new URL(databaseUrl).hostname)) {
  throw new Error('Pass a loopback PostgreSQL test database URL.')
}
const execute = promisify(execFile)
const eventId = randomUUID()
const firstId = randomUUID()
const secondId = randomUUID()

async function query(sql, applicationName = 'task6-capacity-check') {
  const url = new URL(databaseUrl)
  url.searchParams.set('application_name', applicationName)
  const { stdout } = await execute(
    'psql',
    ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', url.href, '-c', sql],
    { timeout: 15_000 },
  )
  return stdout.trim()
}

function register(profileId, holdLock = false) {
  return `begin;
    set local role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${profileId}","role":"authenticated"}', true);
    select public.register_for_event('${eventId}');
    ${holdLock ? 'select pg_sleep(2);' : ''}
    commit;`
}

async function waitUntil(sql) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if ((await query(sql)) === 't') return
    await setTimeout(20)
  }
  throw new Error('The expected concurrent database state was not observed.')
}

let first
let second
try {
  await query(`begin;
    insert into auth.users (id, email, email_confirmed_at) values
      ('${firstId}', '${firstId}@example.test', now()),
      ('${secondId}', '${secondId}@example.test', now());
    update public.profiles set role = 'member', approved_at = now() where id in ('${firstId}', '${secondId}');
    insert into public.events (id, title, starts_at, author_id, status, visibility, published_at, capacity)
      values ('${eventId}', 'Concurrent capacity test', now() + interval '1 day', '${firstId}', 'published', 'member', now(), 1);
    commit;`)
  first = query(register(firstId, true), firstId).then(
    () => ({ succeeded: true, error: '' }),
    (error) => ({ succeeded: false, error: error.stderr }),
  )
  await waitUntil(
    `select exists (select 1 from pg_stat_activity where application_name = '${firstId}' and wait_event = 'PgSleep')`,
  )
  second = query(register(secondId), secondId).then(
    () => ({ succeeded: true, error: '' }),
    (error) => ({ succeeded: false, error: error.stderr }),
  )
  await waitUntil(
    `select exists (select 1 from pg_stat_activity where application_name = '${secondId}' and wait_event_type = 'Lock')`,
  )
  const firstResult = await first
  assert.equal(firstResult.succeeded, true, firstResult.error)
  const result = await second
  assert.equal(result.succeeded, false)
  assert.match(result.error, /Event capacity reached/)
  assert.equal(
    await query(`select count(*) from public.event_registrations where event_id = '${eventId}'`),
    '1',
  )
  process.stdout.write(
    'PASS: overlapping registrations serialize; exactly one takes the last place.\n',
  )
} finally {
  await Promise.allSettled([first, second])
  await query(`begin;
    delete from public.events where id = '${eventId}';
    delete from auth.users where id in ('${firstId}', '${secondId}');
    commit;`)
}
