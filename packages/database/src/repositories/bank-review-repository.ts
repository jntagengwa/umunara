import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  bankClassifyInputSchema,
  bankClassifyResultSchema,
  bankReviewPageSchema,
  bankTransactionIdSchema,
  bankTransactionQuerySchema,
  type BankClassifyInput,
  type BankClassifyResult,
  type BankReviewPage,
  type BankTransactionQuery,
} from '@umunara/schemas'
import type { Database } from '../database.types'
import { databaseResult } from './result'

export class BankReviewRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async list(actorId: string, query: BankTransactionQuery): Promise<BankReviewPage> {
    const input = bankTransactionQuerySchema.parse(query)
    const actor = bankTransactionIdSchema.parse(actorId)
    return bankReviewPageSchema.parse(
      databaseResult(
        await this.client.rpc('list_bank_transactions', { actor_id: actor, query_input: input })
      )
    )
  }

  async classify(input: BankClassifyInput): Promise<BankClassifyResult> {
    const value = bankClassifyInputSchema.parse(input)
    return bankClassifyResultSchema.parse(
      databaseResult(
        await this.client.rpc('classify_bank_transaction', { classification_input: value })
      )
    )
  }
}
