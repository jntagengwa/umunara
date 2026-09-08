import { z } from 'zod'
import {
  bankAccountDtoSchema,
  bankTransactionClassificationSchema,
  bankTransactionDtoSchema,
  reconciliationLinkInputSchema,
} from './bank'

export const bankReviewItemSchema = bankTransactionDtoSchema
  .extend({
    accountName: bankAccountDtoSchema.shape.name,
    accountMask: bankAccountDtoSchema.shape.mask,
    linkCount: z.number().int().min(0).max(500),
  })
  .strict()
export const bankReviewPageSchema = z
  .object({
    items: z.array(bankReviewItemSchema).max(100),
    hasMore: z.boolean(),
  })
  .strict()
export const bankClassifySchema = z
  .object({ classification: bankTransactionClassificationSchema })
  .strict()
export const bankClassifyInputSchema = bankClassifySchema
  .extend({
    actorId: z.string().uuid(),
    transactionId: z.string().uuid(),
  })
  .strict()
export const bankClassifyResultSchema = z
  .object({ outcome: z.enum(['applied', 'duplicate']) })
  .strict()
export const bankPayoutSchema = z
  .object({
    donationIds: z.array(z.string().uuid()).min(1).max(500),
  })
  .strict()
  .refine(
    (value) => new Set(value.donationIds).size === value.donationIds.length,
    'Donation IDs must be unique.'
  )
export const bankTransactionIdSchema = reconciliationLinkInputSchema.innerType().shape.transactionId

export type BankReviewItem = z.infer<typeof bankReviewItemSchema>
export type BankReviewPage = z.infer<typeof bankReviewPageSchema>
export type BankClassifyInput = z.infer<typeof bankClassifyInputSchema>
export type BankClassifyResult = z.infer<typeof bankClassifyResultSchema>
