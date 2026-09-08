import 'server-only'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  bankSyncClaimSchema,
  bankSyncPageResultSchema,
  bankSyncRestartSchema,
  bankWorkerPageSchema,
  bankSyncDispositionSchema,
  type BankSyncClaim,
  type BankSyncDisposition,
  type BankSyncPage,
  type BankSyncPageResult,
} from '@umunara/schemas'
import type { Database } from '../database.types'
import { databaseResult } from './result'

const uuid = z.string().uuid()
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const acknowledged = z.object({ ok: z.literal(true) }).strict()
export class BankSyncRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}
  async claim(connectionId: string, leaseId: string): Promise<BankSyncClaim> {
    return bankSyncClaimSchema.parse(
      databaseResult(
        await this.client.rpc('claim_bank_sync', {
          connection: uuid.parse(connectionId),
          lease: uuid.parse(leaseId),
        })
      )
    )
  }
  async bindItem(connectionId: string, leaseId: string, fingerprint: string): Promise<void> {
    acknowledged.parse(
      databaseResult(
        await this.client.rpc('bind_bank_sync_item', {
          connection: uuid.parse(connectionId),
          lease: uuid.parse(leaseId),
          fingerprint: hash.parse(fingerprint),
        })
      )
    )
  }
  async savePage(
    page: BankSyncPage,
    leaseId: string,
    hasMore: boolean
  ): Promise<BankSyncPageResult> {
    return bankSyncPageResultSchema.parse(
      databaseResult(
        await this.client.rpc('save_bank_worker_page', {
          worker_input: bankWorkerPageSchema.parse({ page, leaseId, hasMore }),
        })
      )
    )
  }
  async restart(
    connectionId: string,
    leaseId: string
  ): Promise<{ cursor: string | null; cycleId: string }> {
    return bankSyncRestartSchema.parse(
      databaseResult(
        await this.client.rpc('restart_bank_sync', {
          connection: uuid.parse(connectionId),
          lease: uuid.parse(leaseId),
        })
      )
    )
  }
  async release(
    connectionId: string,
    leaseId: string,
    disposition: BankSyncDisposition
  ): Promise<void> {
    acknowledged.parse(
      databaseResult(
        await this.client.rpc('release_bank_sync', {
          connection: uuid.parse(connectionId),
          lease: uuid.parse(leaseId),
          disposition: bankSyncDispositionSchema.parse(disposition),
        })
      )
    )
  }
  async enqueue(fingerprint: string, key: string, eventType: string): Promise<void> {
    acknowledged.parse(
      databaseResult(
        await this.client.rpc('enqueue_bank_webhook', {
          fingerprint: hash.parse(fingerprint),
          deduplication_key: hash.parse(key),
          event_type: z.literal('TRANSACTIONS.SYNC_UPDATES_AVAILABLE').parse(eventType),
        })
      )
    )
  }
}
