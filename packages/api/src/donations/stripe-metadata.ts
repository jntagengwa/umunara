import 'server-only'
import { z } from 'zod'
import { donationCadenceSchema, donationCurrencySchema } from '@umunara/schemas'

const metadataSchema = z.object({
  purpose: z.literal('umunara_donation'),
  donation_intent_id: z.string().uuid(),
  amount_minor: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().positive().max(99_999_999)),
  currency: donationCurrencySchema,
  cadence: donationCadenceSchema,
})

export function readDonationMetadata(input: unknown): z.infer<typeof metadataSchema> | null {
  if (
    !input ||
    typeof input !== 'object' ||
    !('purpose' in input) ||
    input.purpose !== 'umunara_donation'
  )
    return null
  return metadataSchema.parse(input)
}

export function stripeId(value: string | { id: string } | null | undefined): string {
  const id = typeof value === 'string' ? value : value?.id
  if (!id) throw new Error('Missing provider reference.')
  return id
}
