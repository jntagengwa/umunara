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
  private readonly entries = new Map<string, { key: VerificationKey | null; until: number }>()
  private readonly pending = new Map<string, Promise<VerificationKey>>()
  private windowStarted = 0
  private lookups = 0

  async get(provider: KeyProvider, keyId: string): Promise<VerificationKey> {
    const now = Date.now()
    const cached = this.entries.get(keyId)
    if (cached && cached.until > now) {
      if (!cached.key) throw new Error('Webhook key unavailable.')
      return cached.key
    }
    const pending = this.pending.get(keyId)
    if (pending) return pending
    if (now - this.windowStarted >= 60_000) {
      this.windowStarted = now
      this.lookups = 0
    }
    if (this.pending.size >= 4 || this.lookups >= 8)
      throw new Error('Webhook key lookup capacity exceeded.')
    this.lookups++
    const load = this.load(provider, keyId)
    this.pending.set(keyId, load)
    try {
      return await load
    } finally {
      this.pending.delete(keyId)
    }
  }

  private async load(provider: KeyProvider, keyId: string): Promise<VerificationKey> {
    try {
      const key = keySchema.parse(await provider.getWebhookVerificationKey(keyId)).key
      if (key.kid !== keyId || key.expired_at !== null || key.created_at > Date.now() / 1000)
        throw new Error('Invalid webhook key.')
      this.remember(keyId, key, 60_000)
      return key
    } catch {
      this.remember(keyId, null, 10_000)
      throw new Error('Webhook key unavailable.')
    }
  }

  private remember(keyId: string, key: VerificationKey | null, ttl: number): void {
    this.entries.delete(keyId)
    if (this.entries.size >= 8) {
      const oldest = this.entries.keys().next().value
      if (oldest !== undefined) this.entries.delete(oldest)
    }
    this.entries.set(keyId, { key, until: Date.now() + ttl })
  }
}
