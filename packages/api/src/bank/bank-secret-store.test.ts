import { createDecipheriv } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { VaultBankSecretStore } from './bank-secret-store'
import { createBankConnectionService } from './context'

vi.mock('server-only', () => ({}))
const reference = '11111111-1111-4111-8111-111111111111'
const config = {
  url: 'https://vault.example.test',
  mount: 'secret',
  token: 'vault-test-token',
  encryptionKey: Buffer.alloc(32, 7).toString('base64'),
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
it('writes only authenticated ciphertext under an opaque create-only Vault reference', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(Response.json({ data: { version: 1 } }))
  vi.stubGlobal('fetch', fetch)
  const value = {
    connectionId: reference,
    actorId: reference,
    itemId: 'item-private',
    accessToken: 'access-private',
  }
  await new VaultBankSecretStore(config).save(reference, value)
  const [url, init] = fetch.mock.calls[0]!
  expect(url).toBe(`https://vault.example.test/v1/secret/data/bank/${reference}`)
  expect(String(init?.body)).not.toMatch(/access-private|item-private/)
  const envelope = JSON.parse(String(init?.body))
  expect(envelope.options).toEqual({ cas: 0 })
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(config.encryptionKey, 'base64'),
    Buffer.from(envelope.data.nonce, 'base64')
  )
  decipher.setAAD(Buffer.from(reference))
  decipher.setAuthTag(Buffer.from(envelope.data.tag, 'base64'))
  expect(
    JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(envelope.data.ciphertext, 'base64')),
        decipher.final(),
      ]).toString()
    )
  ).toEqual(value)
})
it.each([
  { url: 'http://vault.example.test' },
  { url: 'https://user:password@vault.example.test' },
  { encryptionKey: '' },
  { mount: '../escape' },
])('fails closed on invalid secret configuration %j', (input) => {
  expect(() => new VaultBankSecretStore({ ...config, ...input })).toThrow(
    'Invalid bank secret storage configuration.'
  )
})
it('fails closed before a provider call when any required configuration is missing', () => {
  vi.stubEnv('BANK_SECRET_ENCRYPTION_KEY', '')
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  expect(() => createBankConnectionService()).toThrow(
    'Bank connections are temporarily unavailable.'
  )
  expect(fetch).not.toHaveBeenCalled()
})
it('does not accept a failed Vault write', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ error: 'secret' }, { status: 403 }))
  )
  await expect(
    new VaultBankSecretStore(config).save(reference, {
      connectionId: reference,
      actorId: reference,
      itemId: 'item',
      accessToken: 'access',
    })
  ).rejects.toThrow('Bank secret storage unavailable.')
})
it('reads the authenticated envelope with matching connection and actor identity', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({}))
  vi.stubGlobal('fetch', fetch)
  const store = new VaultBankSecretStore(config)
  const value = {
    connectionId: reference,
    actorId: reference,
    itemId: 'item-secret',
    accessToken: 'token-secret',
  }
  await store.save(reference, value)
  const envelope = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)).data
  const respond = (data = envelope) =>
    fetch.mockResolvedValueOnce(
      Response.json({
        data: { data, metadata: { version: 1, destroyed: false, deletion_time: '' } },
      })
    )
  respond()
  expect(await store.read(reference, value)).toEqual(value)
  expect(fetch.mock.lastCall?.[1]).toMatchObject({
    method: 'GET',
    cache: 'no-store',
    redirect: 'error',
  })
  respond()
  await expect(
    store.read(reference, { ...value, connectionId: '22222222-2222-4222-8222-222222222222' })
  ).rejects.toThrow('Bank secret storage unavailable.')
  respond()
  await expect(store.read('22222222-2222-4222-8222-222222222222', value)).rejects.toThrow(
    'Bank secret storage unavailable.'
  )
  for (const change of [
    { tag: Buffer.alloc(16).toString('base64') },
    { nonce: 'invalid' },
    { version: 2 },
    { ciphertext: Buffer.alloc(100).toString('base64') },
  ]) {
    respond({ ...envelope, ...change })
    await expect(store.read(reference, value)).rejects.toThrow('Bank secret storage unavailable.')
  }
})
