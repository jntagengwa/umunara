import { createCipheriv, createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'

const pages = JSON.parse(
  readFileSync(new URL('../../tests/fixtures/plaid-sync.json', import.meta.url), 'utf8')
)
const connectionId = '71000000-0000-4000-8000-000000000001'
const reference = '71000000-0000-4000-8000-000000000002'
const accountId = '71000000-0000-4000-8000-000000000003'
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const nonce = randomBytes(12)
const cipher = createCipheriv('aes-256-gcm', Buffer.alloc(32, 7), nonce)
cipher.setAAD(Buffer.from(reference))
const ciphertext = Buffer.concat([
  cipher.update(
    JSON.stringify({
      connectionId,
      actorId: connectionId,
      itemId: 'sync-item-fixture',
      accessToken: 'sync-access-private',
    })
  ),
  cipher.final(),
])
const envelope = {
  version: 1,
  nonce: nonce.toString('base64'),
  tag: cipher.getAuthTag().toString('base64'),
  ciphertext: ciphertext.toString('base64'),
}
const events = new Set()
let cursor = null
let pending = true
let applied = 0
let waiting = false
export async function handleBankSyncFixture(request, response, url) {
  const path = url.pathname
  const rpc = path.replace('/rest/v1/rpc/', '')
  if (
    !path.startsWith('/__test/bank-sync/') &&
    ![
      'claim_bank_sync',
      'bind_bank_sync_item',
      'save_bank_worker_page',
      'enqueue_bank_webhook',
      'release_bank_sync',
    ].includes(rpc) &&
    path !== '/__test/plaid/transactions/sync' &&
    path !== '/__test/plaid/webhook_verification_key/get' &&
    path !== `/__test/vault/v1/secret/data/bank/${reference}`
  )
    return false
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const body = Buffer.concat(chunks).toString()
  const input = body ? JSON.parse(body) : {}
  let result = { ok: true }
  if (path === '/__test/bank-sync/reset') {
    cursor = null
    pending = true
    applied = 0
    events.clear()
    waiting = input.waiting === true
  }
  if (path === '/__test/bank-sync/stats') result = { cursor, pending, applied, events: events.size }
  if (path === '/__test/bank-sync/sign') {
    const rawBody = JSON.stringify({
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'SYNC_UPDATES_AVAILABLE',
      item_id: 'sync-item-fixture',
    })
    const unsigned = [
      { alg: 'ES256', kid: 'fixture-key', typ: 'JWT' },
      {
        iat: Math.floor(Date.now() / 1000),
        request_body_sha256: createHash('sha256').update(rawBody).digest('hex'),
      },
    ]
      .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
      .join('.')
    result = {
      rawBody,
      token: `${unsigned}.${sign('sha256', Buffer.from(unsigned), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`,
    }
  }
  if (path === '/__test/plaid/webhook_verification_key/get')
    result = {
      key: {
        ...publicKey.export({ format: 'jwk' }),
        alg: 'ES256',
        kid: 'fixture-key',
        use: 'sig',
        created_at: 1,
        expired_at: null,
      },
    }
  if (path === `/__test/vault/v1/secret/data/bank/${reference}`)
    result = {
      data: { data: envelope, metadata: { version: 1, destroyed: false, deletion_time: '' } },
    }
  if (path === '/__test/plaid/transactions/sync') {
    if (input.access_token !== 'sync-access-private') response.statusCode = 400
    result = waiting
      ? pages.waiting
      : !input.cursor
        ? pages.initial
        : input.cursor === 'cursor-1'
          ? pages.incremental
          : { added: [], modified: [], removed: [], next_cursor: 'cursor-2', has_more: false }
    waiting = false
  }
  if (
    path.startsWith('/rest/v1/rpc/') &&
    request.headers.authorization !== 'Bearer local-test-service-key'
  )
    response.statusCode = 403
  if (rpc === 'claim_bank_sync')
    result =
      input.connection === connectionId && pending
        ? {
            outcome: 'ready',
            connectionId,
            actorId: connectionId,
            secretReference: reference,
            cursor,
            cycleId: connectionId,
            accounts: [{ id: accountId, providerAccountId: 'selected-account', currency: 'USD' }],
          }
        : { outcome: 'idle' }
  if (rpc === 'save_bank_worker_page') {
    const { page, hasMore } = input.worker_input
    if (page.expectedCursor !== cursor || JSON.stringify(input).includes('sync-access-private'))
      response.statusCode = 400
    cursor = page.cursor
    pending = hasMore
    applied++
    result = {
      outcome: 'applied',
      added: page.added.length,
      modified: page.modified.length,
      removed: page.removed.length,
    }
  }
  if (rpc === 'enqueue_bank_webhook' && !events.has(input.deduplication_key)) {
    events.add(input.deduplication_key)
    pending = true
  }
  response.end(JSON.stringify(result))
  return true
}
