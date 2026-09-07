import 'server-only'
import type StripeClient from 'stripe'
import { normalizeDonation, type DonationEventInput } from '@umunara/schemas'
import { readDonationMetadata, stripeId } from './stripe-metadata'

type GiftSnapshot = Pick<DonationEventInput, 'providerReference' | 'receivedAt' | 'donation'>

/** Provider reads use the latest state, so a delayed success cannot undo a refund. */
export class StripeNormalizer {
  constructor(private readonly stripe: StripeClient) {}

  async payment(id: string): Promise<GiftSnapshot | null> {
    const payment = await this.stripe.paymentIntents.retrieve(id, {
      expand: ['latest_charge.balance_transaction'],
    })
    const metadata = readDonationMetadata(payment.metadata)
    if (!metadata) return null
    if (metadata.cadence !== 'one_time') throw new Error('Unexpected payment cadence.')
    this.checkAmount(metadata, payment.amount, payment.currency)
    return this.snapshot(
      payment.id,
      payment.status === 'succeeded' ? undefined : payment.created,
      metadata,
      payment.status === 'succeeded'
        ? 'succeeded'
        : payment.status === 'processing'
          ? 'pending'
          : 'failed',
      payment
    )
  }

  async invoice(id: string): Promise<GiftSnapshot | null> {
    const invoice = await this.stripe.invoices.retrieve(id)
    const metadata = readDonationMetadata(invoice.parent?.subscription_details?.metadata)
    if (!metadata) return null
    if (metadata.cadence === 'one_time') throw new Error('Unexpected invoice cadence.')
    this.checkAmount(metadata, invoice.amount_due, invoice.currency)
    if (invoice.status !== 'paid')
      return this.snapshot(invoice.id, invoice.created, metadata, 'failed')
    // Checkout creates one donation line with no discounts, credits, or tax.
    // Refuse unsupported partial/multi-payment invoices rather than misstate giving.
    if (invoice.amount_paid !== invoice.amount_due)
      throw new Error('Unexpected invoice settlement.')
    const payments = await this.stripe.invoicePayments.list({
      invoice: id,
      status: 'paid',
      limit: 2,
    })
    const item = payments.data[0]
    if (
      payments.has_more ||
      payments.data.length !== 1 ||
      item?.payment.type !== 'payment_intent'
    ) {
      throw new Error('Unsupported invoice payment.')
    }
    const payment = await this.stripe.paymentIntents.retrieve(
      stripeId(item.payment.payment_intent),
      {
        expand: ['latest_charge.balance_transaction'],
      }
    )
    this.checkAmount(metadata, payment.amount, payment.currency)
    if (payment.status !== 'succeeded') throw new Error('Invoice payment is not settled.')
    const paidAt = invoice.status_transitions.paid_at
    if (!Number.isSafeInteger(paidAt) || !paidAt || paidAt < 0)
      throw new Error('Missing invoice settlement time.')
    return this.snapshot(invoice.id, paidAt, metadata, 'succeeded', payment)
  }

  async refund(paymentId: string): Promise<GiftSnapshot | null> {
    const oneTime = await this.payment(paymentId)
    if (oneTime) return oneTime
    const payments = await this.stripe.invoicePayments.list({
      payment: { type: 'payment_intent', payment_intent: paymentId },
      limit: 2,
    })
    if (!payments.data.length) return null
    if (payments.has_more || payments.data.length !== 1)
      throw new Error('Ambiguous invoice payment.')
    return this.invoice(stripeId(payments.data[0]?.invoice))
  }

  private checkAmount(
    metadata: NonNullable<ReturnType<typeof readDonationMetadata>>,
    amount: number,
    currency: string
  ): void {
    if (metadata.amount_minor !== amount || metadata.currency !== currency.toUpperCase()) {
      throw new Error('Donation identity mismatch.')
    }
  }

  private snapshot(
    reference: string,
    receivedTimestamp: number | undefined,
    metadata: NonNullable<ReturnType<typeof readDonationMetadata>>,
    status: 'pending' | 'failed' | 'succeeded',
    payment?: StripeClient.PaymentIntent
  ): GiftSnapshot {
    let feeAmountMinor = 0
    let refundedAmountMinor = 0
    if (status === 'succeeded') {
      const charge = payment?.latest_charge
      if (!charge || typeof charge === 'string' || !charge.paid)
        throw new Error('Missing settled charge.')
      const balance = charge.balance_transaction
      if (
        !balance ||
        typeof balance === 'string' ||
        balance.currency.toUpperCase() !== metadata.currency
      ) {
        throw new Error('Missing same-currency settlement fees.')
      }
      feeAmountMinor = balance.fee
      refundedAmountMinor = charge.amount_refunded
      // The charge's balance transaction records receipt of the one-time
      // payment. available_on is its later payout availability, not receipt.
      receivedTimestamp ??= balance.created
    }
    if (!Number.isSafeInteger(receivedTimestamp) || !receivedTimestamp || receivedTimestamp < 0)
      throw new Error('Missing donation receipt time.')
    return {
      // Unsettled attempts remain an auditable zero-recognized projection.
      // Only settlement reserves the canonical gift and its immutable date.
      providerReference: status === 'succeeded' ? reference : `unsettled:${reference}`,
      receivedAt: new Date(receivedTimestamp * 1000).toISOString(),
      donation: normalizeDonation({
        provider: 'stripe',
        amountMinor: metadata.amount_minor,
        currency: metadata.currency,
        cadence: metadata.cadence,
        feeAmountMinor,
        refundedAmountMinor,
        status: refundedAmountMinor === metadata.amount_minor ? 'refunded' : status,
      }),
    }
  }
}
