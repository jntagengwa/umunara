import 'server-only'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import {
  payPalApprovalSchema,
  payPalCheckoutSchema,
  type DonationEvent,
  type PayPalApproval,
} from '@umunara/schemas'
import type { DonationRepository } from '@umunara/database/repositories'
import { ApiError } from '../errors'
import { PayPalClient, type PayPalConfig } from './paypal-client'
import { PayPalNormalizer } from './paypal-normalizer'
import { links, minorUnits, money, providerId, readIntent, webhook } from './paypal-contracts'

export class PayPalAdapter {
  private readonly client: PayPalClient
  private readonly normalizer: PayPalNormalizer
  constructor(
    private readonly config: PayPalConfig,
    ledger: Pick<DonationRepository, 'findPayPalDonation'>
  ) {
    this.client = new PayPalClient(config)
    this.normalizer = new PayPalNormalizer(this.client, ledger)
  }

  async createOrder(input: unknown): Promise<PayPalApproval & { captureToken: string }> {
    const donation = payPalCheckoutSchema.extend({ cadence: z.literal('one_time') }).parse(input)
    const intentId = randomUUID()
    const result = await this.client.request(
      '/v2/checkout/orders',
      {
        intent: 'CAPTURE',
        purchase_units: [
          {
            custom_id: this.intent(intentId, donation.amountMinor, donation.cadence),
            amount: { currency_code: 'USD', value: this.decimal(donation.amountMinor) },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              shipping_preference: 'NO_SHIPPING',
              user_action: 'PAY_NOW',
              return_url: `${this.client.applicationOrigin}/give?paypal=approved`,
              cancel_url: `${this.client.applicationOrigin}/give?paypal=cancelled`,
            },
          },
        },
      },
      intentId
    )
    const approval = this.approval(result)
    const expires = Math.floor(Date.now() / 1000) + 900
    return { ...approval, captureToken: `${expires}.${this.signature(approval.id, expires)}` }
  }

  async createSubscription(input: unknown): Promise<PayPalApproval> {
    const donation = payPalCheckoutSchema
      .extend({ cadence: z.enum(['monthly', 'yearly']) })
      .parse(input)
    const planId =
      donation.cadence === 'monthly' ? this.config.monthlyPlanId : this.config.yearlyPlanId
    if (!planId) throw new ApiError(503, 'Recurring PayPal giving is temporarily unavailable.')
    try {
      const plan = z
        .object({
          status: z.literal('ACTIVE'),
          billing_cycles: z
            .array(
              z.object({
                tenure_type: z.literal('REGULAR'),
                sequence: z.literal(1),
                total_cycles: z.literal(0),
                frequency: z.object({
                  interval_unit: z.literal(donation.cadence === 'monthly' ? 'MONTH' : 'YEAR'),
                  interval_count: z.literal(1),
                }),
              })
            )
            .length(1),
          payment_preferences: z.object({ setup_fee: money.optional() }),
          taxes: z.unknown().optional(),
          quantity_supported: z.boolean().optional(),
        })
        .parse(await this.client.request(`/v1/billing/plans/${providerId.parse(planId)}`))
      if (
        plan.taxes ||
        plan.quantity_supported ||
        (plan.payment_preferences.setup_fee && minorUnits(plan.payment_preferences.setup_fee) !== 0)
      )
        throw new Error('Unsupported recurring plan.')
      const intentId = randomUUID()
      return this.approval(
        await this.client.request(
          '/v1/billing/subscriptions',
          {
            plan_id: planId,
            custom_id: this.intent(intentId, donation.amountMinor, donation.cadence),
            plan: {
              billing_cycles: [
                {
                  sequence: 1,
                  pricing_scheme: {
                    fixed_price: {
                      currency_code: 'USD',
                      value: this.decimal(donation.amountMinor),
                    },
                  },
                },
              ],
              payment_preferences: { auto_bill_outstanding: false },
            },
            application_context: {
              shipping_preference: 'NO_SHIPPING',
              user_action: 'SUBSCRIBE_NOW',
              return_url: `${this.client.applicationOrigin}/give?paypal=returned`,
              cancel_url: `${this.client.applicationOrigin}/give?paypal=cancelled`,
            },
          },
          intentId
        )
      )
    } catch {
      throw new ApiError(503, 'Recurring PayPal giving is temporarily unavailable.')
    }
  }

  async captureOrder(orderId: string, token: string): Promise<{ received: true }> {
    providerId.parse(orderId)
    const [expiry, supplied = ''] = token.split('.')
    const expires = Number(expiry)
    const expected = this.signature(orderId, expires)
    if (
      !/^\d+$/.test(expiry ?? '') ||
      !Number.isSafeInteger(expires) ||
      expires <= Date.now() / 1000 ||
      supplied.length !== expected.length ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    )
      throw new ApiError(403, 'PayPal approval expired. Please start again.')
    try {
      const order = z
        .object({
          id: providerId,
          intent: z.literal('CAPTURE'),
          purchase_units: z.array(z.object({ custom_id: z.string(), amount: money })).length(1),
        })
        .parse(await this.client.request(`/v2/checkout/orders/${orderId}`))
      const unit = order.purchase_units[0]
      const intent = readIntent(unit.custom_id)
      if (
        order.id !== orderId ||
        intent?.cadence !== 'one_time' ||
        intent.amountMinor !== minorUnits(unit.amount)
      )
        throw new Error('Invalid order intent.')
      await this.client.request(`/v2/checkout/orders/${orderId}/capture`, {}, `capture-${orderId}`)
      return { received: true }
    } catch {
      throw new ApiError(503, 'Unable to submit PayPal capture. Please try again.')
    }
  }

  async verifyAndNormalize(rawBody: string, headers: Headers): Promise<DonationEvent | null> {
    let verificationFields: Record<string, string>
    try {
      if (Buffer.byteLength(rawBody, 'utf8') > 1_000_000) throw new Error('Payload too large.')
      const parsed: unknown = JSON.parse(rawBody)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('Invalid payload.')
      verificationFields = Object.fromEntries(
        ['auth-algo', 'cert-url', 'transmission-id', 'transmission-sig', 'transmission-time'].map(
          (name) => [
            name.replaceAll('-', '_'),
            z
              .string()
              .min(1)
              .max(4096)
              .parse(headers.get(`paypal-${name}`)),
          ]
        )
      )
      const cert = new URL(verificationFields.cert_url)
      if (
        cert.protocol !== 'https:' ||
        ![
          'api.paypal.com',
          'api-m.paypal.com',
          'api.sandbox.paypal.com',
          'api-m.sandbox.paypal.com',
        ].includes(cert.hostname) ||
        cert.username ||
        cert.password ||
        cert.port ||
        !cert.pathname.startsWith('/v1/notifications/certs/')
      )
        throw new Error('Invalid certificate URL.')
    } catch {
      throw new ApiError(400, 'Invalid PayPal webhook.')
    }
    // Preserve the exact received JSON bytes as the nested webhook_event value.
    // Re-serializing that value changes whitespace/numeric lexemes used by verification.
    const prefix = JSON.stringify({ ...verificationFields, webhook_id: this.config.webhookId })
    const verified = await this.client.send(
      '/v1/notifications/verify-webhook-signature',
      `${prefix.slice(0, -1)},"webhook_event":${rawBody}}`
    )
    if (!z.object({ verification_status: z.literal('SUCCESS') }).safeParse(verified).success)
      throw new ApiError(400, 'Invalid PayPal webhook.')
    try {
      return await this.normalizer.normalize(webhook.parse(JSON.parse(rawBody)))
    } catch {
      throw new ApiError(503, 'Unable to process PayPal webhook. Please retry later.')
    }
  }

  private approval(input: unknown): PayPalApproval {
    try {
      const result = z.object({ id: providerId, links }).parse(input)
      const approvalUrl = result.links.find((link) =>
        ['approve', 'payer-action'].includes(link.rel)
      )?.href
      const approval = payPalApprovalSchema.parse({ id: result.id, approvalUrl })
      if (new URL(approval.approvalUrl).hostname !== this.client.approvalHost)
        throw new Error('Unexpected environment.')
      return approval
    } catch {
      throw new ApiError(503, 'Unable to open PayPal approval. Please try again.')
    }
  }
  private signature(id: string, expires: number): string {
    return createHmac('sha256', this.config.clientSecret)
      .update(`umunara:paypal:capture:${id}:${expires}`)
      .digest('hex')
  }
  private intent(id: string, amount: number, cadence: string): string {
    return `umunara:v1:${id}:${amount}:USD:${cadence}`
  }
  private decimal(amount: number): string {
    return `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, '0')}`
  }
}
