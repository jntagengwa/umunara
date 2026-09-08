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
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})
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
it('accepts a valid delivery after eight unknown IDs exhaust discovery following a window reset', async () => {
  vi.useFakeTimers()
  const f = fixture()
  const validKey = await f.provider.getWebhookVerificationKey()
  f.provider.getWebhookVerificationKey.mockClear().mockImplementation(async (kid: string) => {
    if (kid !== 'key') throw new Error('Unknown provider key')
    return validKey
  })
  const expected = await f.verifier.verify(f.headers, body)
  vi.advanceTimersByTime(60_001)
  for (let index = 0; index < 8; index++) {
    const unknown = fixture({}, { kid: `unknown-${index}` })
    await expect(f.verifier.verify(unknown.headers, body)).rejects.toThrow('Invalid Plaid webhook.')
  }
  expect(await f.verifier.verify(f.headers, body)).toEqual(expected)
  expect(
    f.provider.getWebhookVerificationKey.mock.calls.filter(([kid]) => kid === 'key')
  ).toHaveLength(2)
})
it('demotes confirmed revoked keys so malformed signatures cannot drain trusted refresh capacity', async () => {
  vi.useFakeTimers()
  const f = fixture()
  const validKey = await f.provider.getWebhookVerificationKey()
  let revoked = false
  f.provider.getWebhookVerificationKey.mockClear().mockImplementation(async (kid: string) => ({
    key: { ...validKey.key, kid, expired_at: revoked && kid !== 'key' ? now : null },
  }))
  const forged = Array.from({ length: 7 }, (_, index) => {
    const token = fixture({}, { kid: `old-${index}` })
      .headers.get('plaid-verification')!
      .split('.')
    // Canonical 64-byte garbage passes cheap structure checks and triggers key lookup,
    // but must always fail the actual ES256 signature verification.
    token[2] = Buffer.alloc(64).toString('base64url')
    return new Headers({ 'plaid-verification': token.join('.') })
  })
  for (const headers of forged) await expect(f.verifier.verify(headers, body)).rejects.toThrow()
  const expected = await f.verifier.verify(f.headers, body)
  vi.advanceTimersByTime(60_001)
  revoked = true
  for (const headers of forged) await expect(f.verifier.verify(headers, body)).rejects.toThrow()
  vi.advanceTimersByTime(10_001)
  await expect(f.verifier.verify(forged[0]!, body)).rejects.toThrow()
  expect(await f.verifier.verify(f.headers, body)).toEqual(expected)
})
