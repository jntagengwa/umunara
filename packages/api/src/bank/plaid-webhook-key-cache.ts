import 'server-only'
import { z } from 'zod'

const keySchema = z.object({
  key: z.object({
    alg: z.literal('ES256'),
    kty: z.literal('EC'),
    crv: z.literal('P-256'),
    use: z.literal('sig'),
    kid: z.string().min(1).max(255),
    x: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    y: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    created_at: z.number().int(),
    expired_at: z.number().int().nullable(),
  }),
})
type VerificationKey = z.infer<typeof keySchema>['key']
type KeyProvider = { getWebhookVerificationKey(keyId: string): Promise<unknown> }

/** Bounded per-process public-key cache. Never serves stale keys after lookup failure. */
export class PlaidWebhookKeyCache {
  private readonly entries = new Map<string, { key: VerificationKey; until: number }>()
  private readonly failures = new Map<string, number>()
  private readonly discovery = { pending: new Map<string, Promise<VerificationKey>>(), lookups: 0 }
  private readonly refresh = { pending: new Map<string, Promise<VerificationKey>>(), lookups: 0 }
  private windowStarted = 0

  async get(provider: KeyProvider, keyId: string): Promise<VerificationKey> {
    const now = Date.now()
    const cached = this.entries.get(keyId)
    if (cached && cached.until > now) return cached.key
    if ((this.failures.get(keyId) ?? 0) > now) throw new Error('Webhook key unavailable.')
    const pending = this.discovery.pending.get(keyId) ?? this.refresh.pending.get(keyId)
    if (pending) return pending
    if (now - this.windowStarted >= 60_000) {
      this.windowStarted = now
      this.discovery.lookups = 0
      this.refresh.lookups = 0
    }
    // Unknown IDs cannot spend the budget or occupy the slots needed to refresh
    // an established key. Expired trusted entries retain their refresh eligibility.
    const pool = cached ? this.refresh : this.discovery
    const concurrency = cached ? 2 : 4
    if (pool.pending.size >= concurrency || pool.lookups >= 8)
      throw new Error('Webhook key lookup capacity exceeded.')
    pool.lookups++
    const load = this.load(provider, keyId)
    pool.pending.set(keyId, load)
    try {
      return await load
    } finally {
      pool.pending.delete(keyId)
    }
  }

  private async load(provider: KeyProvider, keyId: string): Promise<VerificationKey> {
    try {
      const key = keySchema.parse(await provider.getWebhookVerificationKey(keyId)).key
      if (key.kid !== keyId || key.expired_at !== null || key.created_at > Date.now() / 1000)
        throw new Error('Invalid webhook key.')
      this.failures.delete(keyId)
      this.remember(keyId, key)
      return key
    } catch {
      this.failures.delete(keyId)
      if (this.failures.size >= 16) {
        const oldest = this.failures.keys().next().value
        if (oldest !== undefined) this.failures.delete(oldest)
      }
      this.failures.set(keyId, Date.now() + 10_000)
      throw new Error('Webhook key unavailable.')
    }
  }

  private remember(keyId: string, key: VerificationKey): void {
    this.entries.delete(keyId)
    if (this.entries.size >= 8) {
      const oldest = this.entries.keys().next().value
      if (oldest !== undefined) this.entries.delete(oldest)
    }
    this.entries.set(keyId, { key, until: Date.now() + 60_000 })
  }
}
