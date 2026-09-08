import { z } from 'zod'
import { bankSyncPageSchema } from './bank'
import { donationCurrencySchema } from './donations'

export const bankSyncClaimSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('idle') }).strict(),
  z.object({ outcome: z.literal('busy') }).strict(),
  z
    .object({
      outcome: z.literal('ready'),
      connectionId: z.string().uuid(),
      actorId: z.string().uuid(),
      secretReference: z.string().uuid(),
      cursor: z.string().min(1).max(4096).nullable(),
      cycleId: z.string().uuid(),
      accounts: z
        .array(
          z
            .object({
              id: z.string().uuid(),
              providerAccountId: z.string().min(1).max(255),
              currency: donationCurrencySchema,
            })
            .strict()
        )
        .max(100),
    })
    .strict(),
])
export const bankSyncRestartSchema = z
  .object({
    cursor: z.string().min(1).max(4096).nullable(),
    cycleId: z.string().uuid(),
  })
  .strict()
export const bankWorkerPageSchema = z
  .object({
    page: bankSyncPageSchema,
    leaseId: z.string().uuid(),
    hasMore: z.boolean(),
  })
  .strict()
export const bankSyncDispositionSchema = z.enum([
  'continue',
  'retry',
  'reauthorization_required',
  'disconnected',
])
export type BankSyncClaim = z.infer<typeof bankSyncClaimSchema>
export type BankSyncReady = Extract<BankSyncClaim, { outcome: 'ready' }>
export type BankSyncDisposition = z.infer<typeof bankSyncDispositionSchema>
