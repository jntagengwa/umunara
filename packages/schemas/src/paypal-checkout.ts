import { z } from 'zod'
import { donationCadenceSchema } from './donations'

export const payPalCheckoutSchema = z
  .object({
    amountMinor: z.number().int().min(50).max(99_999_999),
    currency: z.literal('USD'),
    cadence: donationCadenceSchema,
  })
  .strict()
export const payPalOrderIdSchema = z.string().regex(/^[A-Z0-9-]{5,64}$/)
export const payPalApprovalSchema = z
  .object({
    id: payPalOrderIdSchema,
    approvalUrl: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value)
        return (
          url.protocol === 'https:' &&
          ['www.paypal.com', 'www.sandbox.paypal.com'].includes(url.hostname) &&
          !url.username &&
          !url.password &&
          !url.port
        )
      }, 'Expected a PayPal approval URL.'),
  })
  .strict()
export type PayPalApproval = z.infer<typeof payPalApprovalSchema>
export type PayPalCheckout = z.infer<typeof payPalCheckoutSchema>

// Server repository boundary; never exposed by a browser endpoint.
const receiptTime = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString())
export const payPalReceiptRowSchema = z.object({
  id: z.string().uuid(),
  provider_reference: z.string(),
  last_event_at: receiptTime,
  received_at: receiptTime,
  donor_profile_id: z.string().uuid().nullable(),
  gross_amount_minor: z.number(),
  fee_amount_minor: z.number(),
  refunded_amount_minor: z.number(),
  net_amount_minor: z.number(),
  currency: z.string(),
  status: z.string(),
  cadence: z.string(),
})
