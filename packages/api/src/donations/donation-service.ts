import 'server-only'
import type { StripeCheckoutResult } from '@umunara/schemas'
import type { CacheInvalidator } from '../cache/invalidation'
import type { DonationLedgerRepository } from './types'
import type { StripeAdapter } from './stripe-adapter'
import type { PayPalAdapter } from './paypal-adapter'
import { ApiError } from '../errors'

export class DonationService {
  constructor(
    private readonly stripe: StripeAdapter | null,
    private readonly ledger: DonationLedgerRepository,
    private readonly cache: CacheInvalidator,
    private readonly paypal?: PayPalAdapter
  ) {}

  createStripeCheckout(input: unknown): Promise<StripeCheckoutResult> {
    if (!this.stripe) throw new ApiError(503, 'Stripe is unavailable.')
    return this.stripe.createCheckout(input)
  }

  async handleStripeEvent(rawBody: string, signature: string): Promise<void> {
    if (!this.stripe) throw new ApiError(503, 'Stripe is unavailable.')
    const event = await this.stripe.verifyAndNormalize(rawBody, signature)
    if (!event) return
    const result = await this.ledger.recordEvent(event)
    if (result.outcome === 'applied') {
      // Reports should tag every covered UTC month, including historical gifts
      // whose fees/refunds changed, rather than expiring all finance caches.
      this.cache.invalidate([`donations:summary:${event.receivedAt.slice(0, 7)}`])
    }
  }

  createPayPalOrder(input: unknown) {
    return this.requirePayPal().createOrder(input)
  }
  createPayPalSubscription(input: unknown) {
    return this.requirePayPal().createSubscription(input)
  }
  capturePayPalOrder(id: string, token: string) {
    return this.requirePayPal().captureOrder(id, token)
  }

  async handlePayPalEvent(rawBody: string, headers: Headers): Promise<void> {
    const event = await this.requirePayPal().verifyAndNormalize(rawBody, headers)
    if (!event) return
    const result = await this.ledger.recordEvent(event)
    if (result.outcome === 'applied')
      this.cache.invalidate([`donations:summary:${event.receivedAt.slice(0, 7)}`])
  }

  private requirePayPal(): PayPalAdapter {
    if (!this.paypal) throw new ApiError(503, 'PayPal is unavailable.')
    return this.paypal
  }
}
