import { generateKeyPairSync } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { PlaidWebhookKeyCache } from './plaid-webhook-key-cache'

vi.mock('server-only', () => ({}))
const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const key = (kid: string) => ({
  key: {
    ...publicKey.export({ format: 'jwk' }),
    kid,
    alg: 'ES256',
    use: 'sig',
    created_at: 1,
    expired_at: null,
  },
})
afterEach(() => vi.useRealTimers())

it('shares concurrent lookups and supports a rotating key ID', async () => {
  const cache = new PlaidWebhookKeyCache()
  const provider = { getWebhookVerificationKey: vi.fn(async (kid: string) => key(kid)) }
  await Promise.all([cache.get(provider, 'one'), cache.get(provider, 'one')])
  expect(provider.getWebhookVerificationKey).toHaveBeenCalledTimes(1)
  expect((await cache.get(provider, 'two')).kid).toBe('two')
  expect(provider.getWebhookVerificationKey).toHaveBeenCalledTimes(2)
})
it('refreshes after a bounded TTL and never serves a key revoked on refresh', async () => {
  vi.useFakeTimers()
  const cache = new PlaidWebhookKeyCache()
  const provider = {
    getWebhookVerificationKey: vi
      .fn()
      .mockResolvedValueOnce(key('one'))
      .mockResolvedValue({ key: { ...key('one').key, expired_at: 2 } }),
  }
  await cache.get(provider, 'one')
  vi.advanceTimersByTime(60_001)
  await expect(cache.get(provider, 'one')).rejects.toThrow('Webhook key unavailable.')
  await expect(cache.get(provider, 'one')).rejects.toThrow('Webhook key unavailable.')
  expect(provider.getWebhookVerificationKey).toHaveBeenCalledTimes(2)
})
it('caches failed lookups briefly and retries after the cooldown', async () => {
  vi.useFakeTimers()
  const cache = new PlaidWebhookKeyCache()
  const provider = {
    getWebhookVerificationKey: vi
      .fn()
      .mockRejectedValueOnce(new Error('private'))
      .mockResolvedValue(key('one')),
  }
  await expect(cache.get(provider, 'one')).rejects.toThrow('Webhook key unavailable.')
  await expect(cache.get(provider, 'one')).rejects.toThrow('Webhook key unavailable.')
  vi.advanceTimersByTime(10_001)
  expect((await cache.get(provider, 'one')).kid).toBe('one')
  expect(provider.getWebhookVerificationKey).toHaveBeenCalledTimes(2)
})
it('bounds distinct key lookups even when each request invents a new ID', async () => {
  const cache = new PlaidWebhookKeyCache()
  const provider = { getWebhookVerificationKey: vi.fn(async (kid: string) => key(kid)) }
  for (let index = 0; index < 8; index++) await cache.get(provider, String(index))
  await expect(cache.get(provider, 'ninth')).rejects.toThrow(
    'Webhook key lookup capacity exceeded.'
  )
  expect(provider.getWebhookVerificationKey).toHaveBeenCalledTimes(8)
  expect((await cache.get(provider, '0')).kid).toBe('0')
})
it('does not let negative entries evict an unexpired trusted key', async () => {
  vi.useFakeTimers()
  const cache = new PlaidWebhookKeyCache()
  const provider = {
    getWebhookVerificationKey: vi.fn(async (kid: string) => {
      if (kid !== 'trusted') throw new Error('Unknown key')
      return key(kid)
    }),
  }
  await expect(cache.get(provider, 'initial-unknown')).rejects.toThrow()
  vi.advanceTimersByTime(59_000)
  await cache.get(provider, 'trusted')
  vi.advanceTimersByTime(1_001)
  for (let index = 0; index < 8; index++)
    await expect(cache.get(provider, `unknown-${index}`)).rejects.toThrow()
  expect((await cache.get(provider, 'trusted')).kid).toBe('trusted')
  expect(
    provider.getWebhookVerificationKey.mock.calls.filter(([kid]) => kid === 'trusted')
  ).toHaveLength(1)
})
it('reserves a trusted-key refresh slot while all discovery slots are occupied', async () => {
  vi.useFakeTimers()
  const cache = new PlaidWebhookKeyCache()
  const finish: Array<() => void> = []
  const provider = {
    getWebhookVerificationKey: vi.fn(async (kid: string) => {
      if (kid === 'trusted') return key(kid)
      await new Promise<void>((resolve) => finish.push(resolve))
      throw new Error('Unknown key')
    }),
  }
  await cache.get(provider, 'trusted')
  vi.advanceTimersByTime(60_001)
  const unknown = Array.from({ length: 4 }, (_, index) =>
    cache.get(provider, `unknown-${index}`).catch(() => null)
  )
  try {
    expect((await cache.get(provider, 'trusted')).kid).toBe('trusted')
    expect(provider.getWebhookVerificationKey).toHaveBeenCalledTimes(6)
  } finally {
    finish.forEach((resolve) => resolve())
    await Promise.all(unknown)
  }
})
