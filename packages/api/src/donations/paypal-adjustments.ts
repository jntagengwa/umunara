import 'server-only'
import { z } from 'zod'
import { donationEventSchema, normalizeDonation, type DonationEvent } from '@umunara/schemas'
import type { DonationRepository } from '@umunara/database/repositories'
import {
  links,
  minorUnits,
  money,
  providerId,
  relatedId,
  type PayPalWebhook,
} from './paypal-contracts'

const adjustmentSchema = z.object({
  id: providerId,
  sale_id: providerId.optional(),
  capture_id: providerId.optional(),
  links,
  status: z.string().optional(),
  state: z.string().optional(),
  amount: z.unknown(),
  seller_payable_breakdown: z
    .object({ total_refunded_amount: money, paypal_fee: money })
    .optional(),
})

export async function normalizePayPalAdjustment(
  event: PayPalWebhook,
  environment: 'sandbox' | 'live',
  ledger: Pick<DonationRepository, 'findPayPalDonation'>
): Promise<DonationEvent> {
  const reversed = event.event_type.endsWith('.REVERSED')
  const sale = event.event_type.startsWith('PAYMENT.SALE.')
  const resource = adjustmentSchema.parse(event.resource)
  const explicitReference = sale ? resource.sale_id : resource.capture_id
  const linkedReference = resource.links.some((link) => link.rel === 'up')
    ? relatedId(resource.links, environment, sale ? '/v1/payments/sale/' : '/v2/payments/captures/')
    : undefined
  if (explicitReference && linkedReference && explicitReference !== linkedReference)
    throw new Error('Conflicting original payment identities.')
  const reference = explicitReference ?? linkedReference
  if (!reference) throw new Error('Missing original payment identity.')

  // Both reversal and refund webhooks may carry a refund resource. Its id is
  // never a gift ID. Only authenticated original-payment fields/links select it.
  const original = await ledger.findPayPalDonation(reference)
  if (!original || ['pending', 'failed'].includes(original.donation.status))
    throw new Error('Original settlement unavailable.')
  const gross = original.donation.grossAmountMinor
  let amount: number
  if (sale) {
    const value = z.object({ total: z.string(), currency: z.string() }).parse(resource.amount)
    if (resource.state !== 'completed') throw new Error('Sale adjustment is not settled.')
    amount = minorUnits({ value: value.total, currency_code: value.currency })
  } else {
    if (resource.status !== 'COMPLETED') throw new Error('Capture adjustment is not settled.')
    amount = minorUnits(resource.amount)
  }
  if (original.donation.currency !== 'USD' || amount <= 0 || amount > gross)
    throw new Error('Adjustment amount differs from the original gift.')

  const breakdown = resource.seller_payable_breakdown
  // Never infer a full reversal from its event name or add a refund delta to
  // a stale read. A partial adjustment requires a verified cumulative total.
  const refunded = !sale && breakdown ? minorUnits(breakdown.total_refunded_amount) : amount
  if ((!breakdown || sale) && amount !== gross)
    throw new Error('Cumulative adjustment reconciliation required.')
  if (refunded < amount || refunded > gross) throw new Error('Invalid cumulative adjustment.')
  if (breakdown && minorUnits(breakdown.paypal_fee) !== 0)
    throw new Error('Refund fee reconciliation required.')

  return donationEventSchema.parse({
    ...original,
    providerEventId: event.id,
    occurredAt: event.create_time,
    donation: normalizeDonation({
      provider: 'paypal',
      amountMinor: gross,
      feeAmountMinor: original.donation.feeAmountMinor,
      refundedAmountMinor: refunded,
      currency: original.donation.currency,
      cadence: original.donation.cadence,
      status: refunded === gross ? (reversed ? 'reversed' : 'refunded') : 'succeeded',
    }),
  })
}
