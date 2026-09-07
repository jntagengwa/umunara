import { z } from 'zod'
import { donationCadenceSchema } from './donations'

// The existing giving surface is USD. Expanding currencies also requires a
// currency-aware amount input and settlement-fee conversion policy.
export const stripeCheckoutSchema = z
  .object({
    amountMinor: z.number().int().min(50).max(99_999_999),
    currency: z.literal('USD'),
    cadence: donationCadenceSchema,
  })
  .strict()

export const stripeCheckoutResultSchema = z
  .object({
    checkoutUrl: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value)
        return (
          url.protocol === 'https:' &&
          url.hostname === 'checkout.stripe.com' &&
          !url.username &&
          !url.password &&
          !url.port
        )
      }, 'Expected a Stripe-hosted checkout URL.'),
  })
  .strict()

export type StripeCheckoutInput = z.infer<typeof stripeCheckoutSchema>
export type StripeCheckoutResult = z.infer<typeof stripeCheckoutResultSchema>
