import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { PlaidWebhookVerifier } from './plaid-webhook-verifier'

vi.mock('server-only', () => ({}))
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const body = JSON.stringify({
  webhook_type: 'TRANSACTIONS',
  webhook_code: 'SYNC_UPDATES_AVAILABLE',
  item_id: 'private-item',
})
const now = Math.floor(Date.now() / 1000)
function fixture(claims = {}, header = {}, key = {}) {
  const payload = {
    iat: now,
    request_body_sha256: createHash('sha256').update(body).digest('hex'),
    ...claims,
  }
  const unsigned = [{ alg: 'ES256', kid: 'key', typ: 'JWT', ...header }, payload]
    .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
    .join('.')
  const token = `${unsigned}.${sign('sha256', Buffer.from(unsigned), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`
  const provider = {
    getWebhookVerificationKey: vi.fn().mockResolvedValue({
      key: {
        ...publicKey.export({ format: 'jwk' }),
        kid: 'key',
        alg: 'ES256',
        use: 'sig',
        created_at: now - 1000,
        expired_at: null,
        ...key,
      },
    }),
  }
  return {
    provider,
    verifier: new PlaidWebhookVerifier(provider),
    headers: new Headers({ 'Plaid-Verification': token }),
  }
}
afterEach(() => vi.restoreAllMocks())
it('verifies real ES256 signatures and deduplicates signed delivery metadata', async () => {
  const f = fixture()
  const event = await f.verifier.verify(f.headers, body)
  expect(event).toEqual({
    itemId: 'private-item',
    eventType: 'TRANSACTIONS.SYNC_UPDATES_AVAILABLE',
    deduplicationKey: expect.stringMatching(/^[a-f0-9]{64}$/),
  })
  expect(await f.verifier.verify(f.headers, body)).toEqual(event)
  const later = fixture({ iat: now - 1 })
  expect(await later.verifier.verify(later.headers, body)).not.toEqual(event)
})
it.each([
  [{ iat: now - 301 }, {}, {}],
  [{ iat: now + 30 }, {}, {}],
  [{ exp: now - 1 }, {}, {}],
  [{ nbf: now + 30 }, {}, {}],
  [{ request_body_sha256: 'a'.repeat(64) }, {}, {}],
  [{}, { alg: 'HS256' }, {}],
  [{}, { crit: ['x'] }, {}],
  [{}, {}, { kid: 'other' }],
  [{}, {}, { expired_at: now - 1 }],
  [{}, {}, { crv: 'P-384' }],
])('rejects invalid claims/header/key %#', async (claims, header, key) => {
  const f = fixture(claims, header, key)
  await expect(f.verifier.verify(f.headers, body)).rejects.toMatchObject({
    status: 401,
    message: 'Invalid Plaid webhook.',
  })
})
it('rejects body whitespace tampering, forged signatures and missing headers', async () => {
  const f = fixture()
  await expect(f.verifier.verify(f.headers, `${body} `)).rejects.toThrow('Invalid Plaid webhook.')
  const token = f.headers.get('plaid-verification')!.split('.')
  token[2] = Buffer.alloc(64).toString('base64url')
  await expect(
    f.verifier.verify(new Headers({ 'plaid-verification': token.join('.') }), body)
  ).rejects.toThrow()
  await expect(f.verifier.verify(new Headers(), body)).rejects.toThrow()
})
it('fails safely when key lookup fails', async () => {
  const f = fixture()
  f.provider.getWebhookVerificationKey.mockRejectedValue(new Error('private-key-provider-details'))
  await expect(f.verifier.verify(f.headers, body)).rejects.toThrow('Invalid Plaid webhook.')
})
it('rejects stale claims and invalid signature sizes without a remote key lookup', async () => {
  const f = fixture({ iat: now - 301 })
  await expect(f.verifier.verify(f.headers, body)).rejects.toThrow()
  expect(f.provider.getWebhookVerificationKey).not.toHaveBeenCalled()
  const current = fixture()
  const parts = current.headers.get('plaid-verification')!.split('.')
  parts[2] = 'AA'
  await expect(
    current.verifier.verify(new Headers({ 'plaid-verification': parts.join('.') }), body)
  ).rejects.toThrow()
  expect(current.provider.getWebhookVerificationKey).not.toHaveBeenCalled()
})
it('reuses a recently validated provider key', async () => {
  const f = fixture()
  await f.verifier.verify(f.headers, body)
  await f.verifier.verify(f.headers, body)
  expect(f.provider.getWebhookVerificationKey).toHaveBeenCalledTimes(1)
})
