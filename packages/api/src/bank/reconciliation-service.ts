import 'server-only'
import { RepositoryError } from '@umunara/database/repositories'
import {
  bankClassifyInputSchema,
  bankTransactionQuerySchema,
  reconciliationLinkInputSchema,
  type BankClassifyInput,
  type BankClassifyResult,
  type BankReviewPage,
  type BankTransactionQuery,
  type ReconciliationLinkInput,
  type ReconciliationLinkResult,
} from '@umunara/schemas'
import type { Actor } from '../auth/require-user'
import { requireRole } from '../auth/require-role'
import type { CacheInvalidator } from '../cache/invalidation'
import { ApiError } from '../errors'

export class ReconciliationService {
  constructor(
    private readonly bank: {
      list(actorId: string, query: BankTransactionQuery): Promise<BankReviewPage>
      classify(input: BankClassifyInput): Promise<BankClassifyResult>
    },
    private readonly links: {
      link(input: ReconciliationLinkInput): Promise<ReconciliationLinkResult>
    },
    private readonly cache: CacheInvalidator
  ) {}

  async list(actor: Actor | null, input: unknown): Promise<BankReviewPage> {
    requireRole(actor, 'admin')
    return this.bank.list(actor.id, bankTransactionQuerySchema.parse(input))
  }

  async classify(
    actor: Actor | null,
    transactionId: string,
    classification: unknown
  ): Promise<BankClassifyResult> {
    requireRole(actor, 'admin')
    const input = bankClassifyInputSchema.parse({
      actorId: actor.id,
      transactionId,
      classification,
    })
    return this.mutate(() => this.bank.classify(input))
  }

  async linkPayout(
    actor: Actor | null,
    transactionId: string,
    donationIds: string[]
  ): Promise<ReconciliationLinkResult> {
    requireRole(actor, 'admin')
    const input = reconciliationLinkInputSchema.parse({
      actorId: actor.id,
      transactionId,
      donationIds,
      kind: 'processor_payout',
    })
    // The existing RPC locks, validates, links, classifies and audits atomically.
    // Neither path creates a gift or changes any donation amount.
    return this.mutate(() => this.links.link(input))
  }

  private async mutate<T>(write: () => Promise<T>): Promise<T> {
    let result: T
    try {
      result = await write()
    } catch (error) {
      if (error instanceof RepositoryError && error.code === 'P0002')
        throw new ApiError(404, 'Bank transaction not found.')
      if (error instanceof RepositoryError && ['22023', '23505', '23514'].includes(error.code))
        throw new ApiError(
          409,
          'This transaction cannot be changed or matched as requested. Refresh and check the classification, currency, amounts and existing links.'
        )
      throw error
    }
    // Donation summaries aggregate ledger rows, which neither operation changes.
    this.cache.invalidate(['bank:transactions'])
    return result
  }
}
