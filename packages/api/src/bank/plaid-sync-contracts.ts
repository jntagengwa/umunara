import 'server-only'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { bankSyncPageSchema, type BankSyncPage, type BankSyncReady } from '@umunara/schemas'

const identifier = z.string().min(1).max(255)
const transaction = z.object({
  transaction_id: identifier,
  account_id: identifier,
  amount: z.number().finite(),
  iso_currency_code: z.string().nullable(),
  date: z.string(),
  name: z.string(),
  pending: z.boolean(),
})
export const plaidSyncResponseSchema = z
  .object({
    added: z.array(transaction).max(500),
    modified: z.array(transaction).max(500),
    removed: z
      .array(z.object({ transaction_id: identifier, account_id: identifier.optional() }))
      .max(500),
    next_cursor: z.string().min(1).max(4096),
    has_more: z.boolean(),
  })
  .refine((value) => value.added.length + value.modified.length + value.removed.length <= 500)
export type PlaidSyncResponse = z.infer<typeof plaidSyncResponseSchema>
export class PlaidSyncError extends Error {
  constructor(
    public readonly reason: 'restart' | 'reauthorization_required' | 'disconnected' | 'unavailable'
  ) {
    super('Bank provider unavailable.')
  }
}
export function itemFingerprint(itemId: string): string {
  return createHash('sha256').update(itemId).digest('hex')
}

export function normalizeSyncPage(context: BankSyncReady, data: PlaidSyncResponse): BankSyncPage {
  const accounts = new Map(context.accounts.map((account) => [account.providerAccountId, account]))
  const normalize = (row: z.infer<typeof transaction>) => {
    const account = accounts.get(row.account_id)
    if (!account) return []
    if (row.iso_currency_code !== account.currency) throw new Error('Currency mismatch.')
    const digits = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: account.currency,
    }).resolvedOptions().maximumFractionDigits
    if (digits === undefined) throw new Error('Unsupported currency.')
    const decimal = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(row.amount))
    if (!decimal || (decimal[3]?.length ?? 0) > digits)
      throw new Error('Invalid monetary precision.')
    const minor =
      BigInt(decimal[2]!) * 10n ** BigInt(digits) +
      BigInt((decimal[3] ?? '').padEnd(digits, '0') || '0')
    const signed = (decimal[1] ? 1n : -1n) * minor
    if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(-Number.MAX_SAFE_INTEGER))
      throw new Error('Unsafe amount.')
    return [
      {
        providerTransactionId: row.transaction_id,
        accountId: account.id,
        amountMinor: Number(signed),
        currency: account.currency,
        bookedOn: row.date,
        description: row.name.trim().slice(0, 300),
        pending: row.pending,
      },
    ]
  }
  const changes = {
    connectionId: context.connectionId,
    expectedCursor: context.cursor,
    cursor: data.next_cursor,
    added: data.added.flatMap(normalize),
    modified: data.modified.flatMap(normalize),
    removed: data.removed
      .filter((row) => !row.account_id || accounts.has(row.account_id))
      .map((row) => row.transaction_id),
  }
  if (data.has_more && data.next_cursor === context.cursor)
    throw new Error('Non-advancing pagination.')
  // Content + cycle identity keeps transport retries stable, while a provider restart
  // gets fresh receipts and can safely replay previously persisted snapshots.
  const hash = createHash('sha256')
    .update(JSON.stringify([context.cycleId, changes]))
    .digest('hex')
  const pageId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
  return bankSyncPageSchema.parse({ ...changes, pageId })
}
