import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bankSyncPageSchema, bankSyncPageResultSchema } from '@umunara/schemas'
import type { BankSyncPage, BankSyncPageResult } from '@umunara/schemas'
import type { Database } from '../database.types'
import { databaseResult } from './result'

export class BankRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  /** Verified server input only; cursor and changes persist in one database transaction. */
  async saveSyncPage(page: BankSyncPage): Promise<BankSyncPageResult> {
    const pageInput = bankSyncPageSchema.parse(page)
    return bankSyncPageResultSchema.parse(
      databaseResult(await this.client.rpc('save_bank_sync_page', { page_input: pageInput }))
    )
  }
}
