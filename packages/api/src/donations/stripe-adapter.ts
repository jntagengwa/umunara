import 'server-only'
import { randomInt, randomUUID } from 'node:crypto'
import StripeClient from 'stripe'
import {
  stripeCheckoutSchema,
  stripeCheckoutResultSchema,
  donationEventSchema,
  type StripeCheckoutResult,
  type DonationEvent,
} from '@umunara/schemas'
import { ApiError } from '../errors'
import { stripeId } from './stripe-metadata'
import { StripeNormalizer } from './stripe-normalizer'

export const stripeApiVersion = '2026-08-26.dahlia'

export class StripeAdapter {
  private readonly normalizer: StripeNormalizer
  private readonly origin: string

  constructor(
    private readonly stripe: StripeClient,
    private readonly webhookSecret: string,
    applicationOrigin: string,
    private readonly liveMode: boolean
  ) {
    const url = new URL(applicationOrigin)
    if (
      url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
    ) {
      throw new Error('Invalid donation application origin.')
    }
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash)
      throw new Error('Invalid donation application origin.')
    this.origin = url.origin
    this.normalizer = new StripeNormalizer(stripe)
  }

  async createCheckout(input: unknown): Promise<StripeCheckoutResult> {
    const donation = stripeCheckoutSchema.parse(input)
    const intentId = randomUUID()
    const metadata = {
      purpose: 'umunara_donation',
      donation_intent_id: intentId,
      amount_minor: String(donation.amountMinor),
      currency: donation.currency,
      cadence: donation.cadence,
    }
    try {
      const recurring = donation.cadence !== 'one_time'
      const session = await this.stripe.checkout.sessions.create(
        {
          mode: recurring ? 'subscription' : 'payment',
          adaptive_pricing: { enabled: false },
          client_reference_id: intentId,
          metadata,
          ...(recurring
            ? { subscription_data: { metadata } }
            : { payment_intent_data: { metadata } }),
          integration_identifier: `umunara_donations_${Array.from({ length: 8 }, () => String.fromCharCode(97 + randomInt(26))).join('')}`,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: donation.currency.toLowerCase(),
                unit_amount: donation.amountMinor,
                product_data: { name: 'Umunara donation' },
                ...(recurring
                  ? { recurring: { interval: donation.cadence === 'monthly' ? 'month' : 'year' } }
                  : {}),
              },
            },
          ],
          success_url: `${this.origin}/give?checkout=returned`,
          cancel_url: `${this.origin}/give?checkout=cancelled`,
        },
        { idempotencyKey: `donation-checkout:${intentId}` }
      )
      return stripeCheckoutResultSchema.parse({ checkoutUrl: session.url })
    } catch {
      throw new ApiError(503, 'Checkout is temporarily unavailable. Please try again later.')
    }
  }

  async verifyAndNormalize(rawBody: string, signature: string): Promise<DonationEvent | null> {
    let event: StripeClient.Event
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret)
      if (
        event.livemode !== this.liveMode ||
        event.account ||
        event.api_version !== stripeApiVersion
      ) {
        throw new Error('Unexpected webhook environment or version.')
      }
    } catch {
      throw new ApiError(400, 'Invalid Stripe webhook.')
    }
    try {
      let snapshot
      switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded':
        case 'checkout.session.async_payment_failed':
          if (event.data.object.mode !== 'payment') return null
          snapshot = await this.normalizer.payment(stripeId(event.data.object.payment_intent))
          break
        case 'payment_intent.succeeded':
        case 'payment_intent.payment_failed':
          snapshot = await this.normalizer.payment(event.data.object.id)
          break
        case 'invoice.payment_succeeded':
        case 'invoice.payment_failed':
          snapshot = await this.normalizer.invoice(event.data.object.id)
          break
        case 'charge.refunded':
          snapshot = await this.normalizer.refund(stripeId(event.data.object.payment_intent))
          break
        default:
          return null
      }
      return snapshot
        ? donationEventSchema.parse({
            ...snapshot,
            provider: 'stripe',
            providerEventId: event.id,
            occurredAt: new Date(event.created * 1000).toISOString(),
            donorProfileId: null,
          })
        : null
    } catch {
      throw new ApiError(503, 'Unable to process Stripe webhook. Please retry later.')
    }
  }
}
