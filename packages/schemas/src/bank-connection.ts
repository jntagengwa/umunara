import { z } from 'zod'
import { bankAccountDtoSchema } from './bank'

export const bankConnectionConsentSchema = z
  .object({ businessAccountConsent: z.literal(true) })
  .strict()
export const bankSelectedAccountIdsSchema = z
  .array(z.string().min(1).max(255))
  .min(1)
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length, 'Select distinct accounts.')
export const bankExchangeTokenSchema = bankConnectionConsentSchema
  .extend({
    publicToken: z
      .string()
      .regex(/^public-[A-Za-z0-9-]+$/)
      .max(500),
    selectedAccountIds: bankSelectedAccountIdsSchema,
  })
  .strict()
export const bankLinkTokenSchema = z.object({ linkToken: z.string().min(1).max(500) }).strict()
export const bankConnectionAccountSchema = bankAccountDtoSchema
  .omit({ id: true, connectionId: true, archivedAt: true })
  .extend({ providerAccountId: z.string().trim().min(1).max(255) })
  .strict()
export const bankCreateConnectionSchema = z
  .object({
    connectionId: z.string().uuid(),
    actorId: z.string().uuid(),
    secretReference: z.string().uuid(),
    institutionName: z.string().trim().min(1).max(200),
    accounts: z.array(bankConnectionAccountSchema).min(1).max(100),
  })
  .strict()
  .refine(
    (input) =>
      new Set(input.accounts.map((account) => account.providerAccountId)).size ===
      input.accounts.length,
    'Select distinct accounts.'
  )
export type BankConnectionAccount = z.infer<typeof bankConnectionAccountSchema>
export type BankCreateConnection = z.infer<typeof bankCreateConnectionSchema>
