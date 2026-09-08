import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { reconciliationLinkInputSchema, reconciliationLinkResultSchema } from '@umunara/schemas'
import type { ReconciliationLinkInput, ReconciliationLinkResult } from '@umunara/schemas'
import type { Database } from '../database.types'
import { databaseResult } from './result'

export class ReconciliationRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  /** The service supplies its authenticated admin actor; SQL also checks current approval. */
  async link(input: ReconciliationLinkInput): Promise<ReconciliationLinkResult> {
    const linkInput = reconciliationLinkInputSchema.parse(input)
    return reconciliationLinkResultSchema.parse(
      databaseResult(await this.client.rpc('link_bank_reconciliation', { link_input: linkInput }))
    )
  }
}
