import { z } from 'zod'
import { donationCurrencySchema } from './donations'

export const bankTransactionClassificationSchema = z.enum([
  'unreviewed',
  'donation',
  'non_donation',
  'processor_payout',
])
export const bankConnectionStatusSchema = z.enum([
  'active',
  'reauthorization_required',
  'disconnected',
])
const uuid = z.string().uuid()
const identifier = z.string().trim().min(1).max(255)
const cursor = z.string().min(1).max(4096)
const minorUnits = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)
const calendarDate = z
  .string()
  .date()
  .refine((value) => value >= '2000-01-01' && value <= '9998-12-31')
const timestamp = z.string().datetime({ offset: true })

// These browser DTOs deliberately omit provider IDs, cursors and secret references.
export const bankConnectionDtoSchema = z
  .object({
    id: uuid,
    institutionName: z.string().trim().min(1).max(200),
    status: bankConnectionStatusSchema,
    lastSyncedAt: timestamp.nullable(),
  })
  .strict()
export const bankAccountDtoSchema = z
  .object({
    id: uuid,
    connectionId: uuid,
    name: z.string().trim().min(1).max(200),
    mask: z
      .string()
      .regex(/^[0-9]{2,4}$/)
      .nullable(),
    type: z.literal('depository'),
    subtype: z.enum(['checking', 'savings']),
    currency: donationCurrencySchema,
    archivedAt: timestamp.nullable(),
  })
  .strict()
export const bankTransactionDtoSchema = z
  .object({
    id: uuid,
    accountId: uuid,
    amountMinor: minorUnits,
    currency: donationCurrencySchema,
    bookedOn: calendarDate,
    description: z.string().trim().min(1).max(300),
    pending: z.boolean(),
    classification: bankTransactionClassificationSchema,
    removedAt: timestamp.nullable(),
  })
  .strict()

// Server persistence contract. Positive amounts are credits; adapters convert provider signs.
export const bankTransactionSnapshotSchema = bankTransactionDtoSchema
  .omit({ id: true, classification: true, removedAt: true })
  .extend({ providerTransactionId: identifier })
  .strict()
export const bankSyncPageSchema = z
  .object({
    connectionId: uuid,
    pageId: uuid,
    expectedCursor: cursor.nullable(),
    cursor,
    added: z.array(bankTransactionSnapshotSchema).max(500),
    modified: z.array(bankTransactionSnapshotSchema).max(500),
    removed: z.array(identifier).max(500),
  })
  .strict()
  .superRefine((page, ctx) => {
    const ids = [...page.added, ...page.modified]
      .map((row) => row.providerTransactionId)
      .concat(page.removed)
    if (
      ids.length > 500 ||
      new Set(ids).size !== ids.length ||
      (ids.length > 0 && page.expectedCursor === page.cursor)
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'A sync page requires unique identities and an advancing cursor when changes exist (maximum 500).',
      })
    }
  })
export const bankSyncPageResultSchema = z
  .object({
    outcome: z.enum(['applied', 'duplicate']),
    added: z.number().int().min(0).max(500),
    modified: z.number().int().min(0).max(500),
    removed: z.number().int().min(0).max(500),
  })
  .strict()

export const bankTransactionQuerySchema = z
  .object({
    from: calendarDate,
    to: calendarDate,
    accountId: uuid.optional(),
    classification: bankTransactionClassificationSchema.optional(),
    currency: donationCurrencySchema.optional(),
    minAmountMinor: minorUnits.optional(),
    maxAmountMinor: minorUnits.optional(),
    page: z.number().int().min(1).max(10000).default(1),
    pageSize: z.number().int().min(1).max(100).default(50),
  })
  .strict()
  .superRefine((query, ctx) => {
    const days = (Date.parse(query.to) - Date.parse(query.from)) / 86400000
    if (
      days < 0 ||
      days > 365 ||
      (query.minAmountMinor !== undefined &&
        query.maxAmountMinor !== undefined &&
        query.minAmountMinor > query.maxAmountMinor)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Expected ordered amounts and a date range of at most 366 days.',
      })
    }
  })
export const reconciliationLinkInputSchema = z
  .object({
    transactionId: uuid,
    actorId: uuid,
    kind: z.enum(['donation', 'processor_payout']),
    donationIds: z.array(uuid).min(1).max(500),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.donationIds).size === value.donationIds.length &&
      (value.kind !== 'donation' || value.donationIds.length === 1),
    'Expected unique compatible donation targets.'
  )
export const reconciliationLinkResultSchema = z
  .object({
    outcome: z.enum(['applied', 'duplicate']),
    linkIds: z.array(uuid).min(1).max(500),
  })
  .strict()

export type BankTransactionClassification = z.infer<typeof bankTransactionClassificationSchema>
export type BankConnectionStatus = z.infer<typeof bankConnectionStatusSchema>
export type BankConnectionDto = z.infer<typeof bankConnectionDtoSchema>
export type BankAccountDto = z.infer<typeof bankAccountDtoSchema>
export type BankTransactionDto = z.infer<typeof bankTransactionDtoSchema>
export type BankSyncPage = z.infer<typeof bankSyncPageSchema>
export type BankSyncPageResult = z.infer<typeof bankSyncPageResultSchema>
export type BankTransactionQuery = z.infer<typeof bankTransactionQuerySchema>
export type ReconciliationLinkInput = z.infer<typeof reconciliationLinkInputSchema>
export type ReconciliationLinkResult = z.infer<typeof reconciliationLinkResultSchema>
