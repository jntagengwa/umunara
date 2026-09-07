import 'server-only'
import { z } from 'zod'
import {
  donationEventSchema,
  normalizeDonation,
  type DonationEvent,
  type PayPalCheckout,
} from '@umunara/schemas'
import type { DonationRepository } from '@umunara/database/repositories'
import type { PayPalClient } from './paypal-client'
import {
  links,
  minorUnits,
  money,
  providerId,
  providerTime,
  readIntent,
  relatedId,
  type PayPalWebhook,
} from './paypal-contracts'

type ReceiptReader = Pick<DonationRepository, 'findPayPalDonation'>
const captureSchema = z.object({
  id: providerId,
  status: z.string(),
  amount: money,
  custom_id: z.string().optional(),
  update_time: providerTime,
  create_time: providerTime.optional(),
  seller_receivable_breakdown: z.object({ paypal_fee: money, net_amount: money }).optional(),
  supplementary_data: z.object({ related_ids: z.object({ order_id: providerId }) }).optional(),
})
const saleSchema = z.object({
  id: providerId,
  state: z.string(),
  billing_agreement_id: providerId,
  amount: z.object({ total: z.string(), currency: z.string() }),
  update_time: providerTime,
  transaction_fee: z.object({ value: z.string(), currency: z.string() }).optional(),
})

export class PayPalNormalizer {
  constructor(
    private readonly client: PayPalClient,
    private readonly ledger: ReceiptReader
  ) {}

  async normalize(event: PayPalWebhook): Promise<DonationEvent | null> {
    switch (event.event_type) {
      case 'PAYMENT.CAPTURE.COMPLETED':
      case 'PAYMENT.CAPTURE.PENDING':
      case 'PAYMENT.CAPTURE.DENIED':
        return this.capture(event)
      case 'PAYMENT.SALE.COMPLETED':
        return this.sale(event)
      case 'PAYMENT.CAPTURE.REFUNDED':
      case 'PAYMENT.SALE.REFUNDED':
      case 'PAYMENT.CAPTURE.REVERSED':
      case 'PAYMENT.SALE.REVERSED':
        return this.adjustment(event)
      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
        return this.failedRenewal(event)
      default:
        return null
    }
  }

  private async capture(event: PayPalWebhook): Promise<DonationEvent | null> {
    const capture = captureSchema.parse(event.resource)
    if (capture.status !== event.event_type.split('.').at(-1))
      throw new Error('Capture status differs from event.')
    const orderId = capture.supplementary_data?.related_ids.order_id
    if (!orderId) throw new Error('Missing order identity.')
    const order = z
      .object({
        purchase_units: z
          .array(z.object({ custom_id: z.string().optional(), amount: money }))
          .length(1),
      })
      .parse(await this.client.request(`/v2/checkout/orders/${orderId}`))
    const intent = readIntent(order.purchase_units[0].custom_id)
    if (!intent) return null
    if (intent.cadence !== 'one_time') throw new Error('Unexpected capture cadence.')
    if (
      (capture.custom_id && order.purchase_units[0].custom_id !== capture.custom_id) ||
      minorUnits(order.purchase_units[0].amount) !== intent.amountMinor ||
      minorUnits(capture.amount) !== intent.amountMinor
    )
      throw new Error('Order identity changed.')
    if (capture.status !== 'COMPLETED') {
      if (!capture.create_time) throw new Error('Missing attempt creation time.')
      return donationEventSchema.parse({
        provider: 'paypal',
        providerEventId: event.id,
        providerReference: `unsettled:${capture.id}`,
        receivedAt: capture.create_time,
        occurredAt: event.create_time,
        donation: normalizeDonation({
          provider: 'paypal',
          amountMinor: intent.amountMinor,
          currency: intent.currency,
          cadence: intent.cadence,
          status: capture.status === 'PENDING' ? 'pending' : 'failed',
        }),
      })
    }
    const breakdown = capture.seller_receivable_breakdown
    if (!breakdown) throw new Error('Settlement fees unavailable.')
    const fee = minorUnits(breakdown.paypal_fee)
    if (minorUnits(breakdown.net_amount) !== intent.amountMinor - fee)
      throw new Error('Unsupported settlement conversion.')
    return this.settled(
      event,
      capture.id,
      capture.update_time,
      intent,
      minorUnits(capture.amount),
      fee
    )
  }

  private async subscription(id: string): Promise<PayPalCheckout | null> {
    const subscription = z
      .object({ custom_id: z.string().optional() })
      .parse(await this.client.request(`/v1/billing/subscriptions/${providerId.parse(id)}`))
    const intent = readIntent(subscription.custom_id)
    if (intent?.cadence === 'one_time') throw new Error('Unexpected subscription cadence.')
    return intent
  }

  private async sale(event: PayPalWebhook): Promise<DonationEvent | null> {
    const sale = saleSchema.parse(event.resource)
    if (sale.state !== 'completed') throw new Error('Sale has not settled.')
    const intent = await this.subscription(sale.billing_agreement_id)
    if (!intent) return null
    if (!sale.transaction_fee) throw new Error('Settlement fees unavailable.')
    return this.settled(
      event,
      sale.id,
      sale.update_time,
      intent,
      minorUnits({ value: sale.amount.total, currency_code: sale.amount.currency }),
      minorUnits({
        value: sale.transaction_fee.value,
        currency_code: sale.transaction_fee.currency,
      })
    )
  }

  private async settled(
    event: PayPalWebhook,
    reference: string,
    receivedAt: string,
    intent: PayPalCheckout,
    amount: number,
    fee: number
  ): Promise<DonationEvent> {
    if (amount !== intent.amountMinor) throw new Error('Payment amount differs from intent.')
    const original = await this.ledger.findPayPalDonation(reference)
    if (
      original &&
      (original.receivedAt !== receivedAt ||
        original.donation.grossAmountMinor !== amount ||
        original.donation.cadence !== intent.cadence)
    )
      throw new Error('Settlement identity changed.')
    return donationEventSchema.parse({
      provider: 'paypal',
      providerEventId: event.id,
      providerReference: reference,
      occurredAt: event.create_time,
      receivedAt,
      donation:
        original?.donation ??
        normalizeDonation({
          provider: 'paypal',
          amountMinor: amount,
          feeAmountMinor: fee,
          currency: intent.currency,
          cadence: intent.cadence,
        }),
    })
  }

  private async adjustment(event: PayPalWebhook): Promise<DonationEvent> {
    const reversed = event.event_type.endsWith('.REVERSED')
    const sale = event.event_type.startsWith('PAYMENT.SALE.')
    const resource = z
      .object({
        id: providerId,
        sale_id: providerId.optional(),
        links,
        status: z.string().optional(),
        state: z.string().optional(),
        amount: z.unknown().optional(),
        seller_payable_breakdown: z
          .object({ total_refunded_amount: money, paypal_fee: money })
          .optional(),
      })
      .parse(event.resource)
    const reference = reversed
      ? resource.id
      : sale
        ? (resource.sale_id ??
          relatedId(resource.links, this.client.apiOrigin, '/v1/payments/sale/'))
        : relatedId(resource.links, this.client.apiOrigin, '/v2/payments/captures/')
    const original = await this.ledger.findPayPalDonation(reference)
    // A refund cannot invent a receipt date. Retry after the settlement webhook arrives.
    if (!original || ['pending', 'failed'].includes(original.donation.status))
      throw new Error('Original settlement unavailable.')
    let refunded = original.donation.grossAmountMinor
    if (!reversed && !sale) {
      if (resource.status !== 'COMPLETED' || !resource.seller_payable_breakdown)
        throw new Error('Refund is not settled.')
      refunded = minorUnits(resource.seller_payable_breakdown.total_refunded_amount)
      // PayPal does not expose a cumulative refunded-fee total here. Do not apply
      // a per-refund fee as a cumulative fee or race read/modify/write adjustments.
      if (minorUnits(resource.seller_payable_breakdown.paypal_fee) !== 0)
        throw new Error('Refund fee reconciliation required.')
    } else if (!reversed) {
      const refundAmount = z
        .object({ total: z.string(), currency: z.string() })
        .parse(resource.amount)
      if (
        resource.state !== 'completed' ||
        minorUnits({ value: refundAmount.total, currency_code: refundAmount.currency }) !== refunded
      )
        throw new Error('Cumulative sale refund reconciliation required.')
    }
    return donationEventSchema.parse({
      ...original,
      providerEventId: event.id,
      occurredAt: event.create_time,
      donation: normalizeDonation({
        provider: 'paypal',
        amountMinor: original.donation.grossAmountMinor,
        feeAmountMinor: original.donation.feeAmountMinor,
        refundedAmountMinor: refunded,
        currency: original.donation.currency,
        cadence: original.donation.cadence,
        status: reversed
          ? 'reversed'
          : refunded === original.donation.grossAmountMinor
            ? 'refunded'
            : 'succeeded',
      }),
    })
  }

  private async failedRenewal(event: PayPalWebhook): Promise<DonationEvent | null> {
    const resource = z
      .object({
        id: providerId,
        billing_info: z.object({
          last_failed_payment: z.object({ amount: money, time: providerTime }),
        }),
      })
      .parse(event.resource)
    const intent = await this.subscription(resource.id)
    if (!intent) return null
    const attempt = resource.billing_info.last_failed_payment
    if (minorUnits(attempt.amount) !== intent.amountMinor)
      throw new Error('Unsupported outstanding renewal amount.')
    return donationEventSchema.parse({
      provider: 'paypal',
      providerEventId: event.id,
      providerReference: `unsettled:${resource.id}:${attempt.time}`,
      receivedAt: attempt.time,
      occurredAt: event.create_time,
      donation: normalizeDonation({
        provider: 'paypal',
        amountMinor: intent.amountMinor,
        currency: intent.currency,
        cadence: intent.cadence,
        status: 'failed',
      }),
    })
  }
}
