import 'server-only'
import type { StripeCheckoutResult } from '@umunara/schemas'
import type { CacheInvalidator } from '../cache/invalidation'
import type { DonationLedgerRepository } from './types'
import type { StripeAdapter } from './stripe-adapter'

export class DonationService {
  constructor(
    private readonly stripe: StripeAdapter,
    private readonly ledger: DonationLedgerRepository,
    private readonly cache: CacheInvalidator
  ) {}

  createStripeCheckout(input: unknown): Promise<StripeCheckoutResult> {
    return this.stripe.createCheckout(input)
  }

  async handleStripeEvent(rawBody: string, signature: string): Promise<void> {
    const event = await this.stripe.verifyAndNormalize(rawBody, signature)
    if (!event) return
    const result = await this.ledger.recordEvent(event)
    if (result.outcome === 'applied') {
      // Reports should tag every covered UTC month, including historical gifts
      // whose fees/refunds changed, rather than expiring all finance caches.
      this.cache.invalidate([`donations:summary:${event.receivedAt.slice(0, 7)}`])
    }
  }
}
