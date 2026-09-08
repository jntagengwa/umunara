import 'server-only'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type {
  BankSyncClaim,
  BankSyncPage,
  BankSyncPageResult,
  BankSyncDisposition,
} from '@umunara/schemas'
import { ApiError } from '../errors'
import {
  itemFingerprint,
  normalizeSyncPage,
  PlaidSyncError,
  type PlaidSyncResponse,
} from './plaid-sync-contracts'

export interface BankSyncRepositoryContract {
  claim(connectionId: string, leaseId: string): Promise<BankSyncClaim>
  bindItem(connectionId: string, leaseId: string, fingerprint: string): Promise<void>
  savePage(page: BankSyncPage, leaseId: string, hasMore: boolean): Promise<BankSyncPageResult>
  restart(
    connectionId: string,
    leaseId: string
  ): Promise<{ cursor: string | null; cycleId: string }>
  release(connectionId: string, leaseId: string, disposition: BankSyncDisposition): Promise<void>
  enqueue(fingerprint: string, key: string, eventType: string): Promise<void>
}
export type VerifiedBankWebhook = {
  itemId: string
  deduplicationKey: string
  eventType: string
} | null
export type BankSyncResult = { added: number; modified: number; removed: number } & (
  { outcome: 'waiting'; retryAfterSeconds: 60 } | { outcome?: never; retryAfterSeconds?: never }
)
export class BankSyncService {
  constructor(
    private readonly provider: {
      syncTransactions(accessToken: string, cursor: string | null): Promise<PlaidSyncResponse>
    },
    private readonly secrets: {
      read(
        reference: string,
        identity: { connectionId: string; actorId: string }
      ): Promise<{ accessToken: string; itemId: string }>
    },
    private readonly repository: BankSyncRepositoryContract,
    private readonly verifier: {
      verify(headers: Headers, body: string): Promise<VerifiedBankWebhook>
    }
  ) {}

  async sync(connectionId: string): Promise<BankSyncResult> {
    z.string().uuid().parse(connectionId)
    const leaseId = randomUUID()
    const counts = { added: 0, modified: 0, removed: 0 }
    let claimed = false
    try {
      const context = await this.repository.claim(connectionId, leaseId)
      if (context.outcome === 'busy')
        throw new ApiError(409, 'Bank synchronization is already running.')
      if (context.outcome === 'idle') return counts
      claimed = true
      const secret = await this.secrets.read(context.secretReference, context)
      await this.repository.bindItem(connectionId, leaseId, itemFingerprint(secret.itemId))
      const started = Date.now()
      let restarted = false
      for (let pageNumber = 0; pageNumber < 20 && Date.now() - started < 40_000; pageNumber++) {
        let data: PlaidSyncResponse
        try {
          data = await this.provider.syncTransactions(secret.accessToken, context.cursor)
        } catch (error) {
          if (!(error instanceof PlaidSyncError) || error.reason !== 'restart' || restarted)
            throw error
          Object.assign(context, await this.repository.restart(connectionId, leaseId))
          restarted = true
          continue
        }
        if (
          data.next_cursor === '' &&
          !data.has_more &&
          data.added.length + data.modified.length + data.removed.length === 0
        ) {
          await this.repository.release(connectionId, leaseId, 'continue')
          return { ...counts, outcome: 'waiting', retryAfterSeconds: 60 }
        }
        const page = normalizeSyncPage(context, data)
        // Retry only the identical normalized page. Ambiguous commits are resolved by
        // the existing immutable receipt; no new provider fetch is made for this retry.
        let result: BankSyncPageResult
        try {
          result = await this.repository.savePage(page, leaseId, data.has_more)
        } catch {
          result = await this.repository.savePage(page, leaseId, data.has_more)
        }
        if (result.outcome === 'applied') {
          counts.added += result.added
          counts.modified += result.modified
          counts.removed += result.removed
        }
        context.cursor = page.cursor
        if (!data.has_more) return counts
      }
      await this.repository.release(connectionId, leaseId, 'continue')
      return counts
    } catch (error) {
      if (claimed) {
        const disposition =
          error instanceof PlaidSyncError &&
          (error.reason === 'disconnected' || error.reason === 'reauthorization_required')
            ? error.reason
            : 'retry'
        try {
          await this.repository.release(connectionId, leaseId, disposition)
        } catch {
          /* The expiring lease preserves pending work if recovery cannot be persisted. */
        }
      }
      if (error instanceof ApiError && error.status === 409) throw error
      throw new ApiError(503, 'Bank synchronization is temporarily unavailable.')
    }
  }

  async handleWebhook(headers: Headers, rawBody: string): Promise<void> {
    const event = await this.verifier.verify(headers, rawBody)
    if (!event) return
    try {
      await this.repository.enqueue(
        itemFingerprint(event.itemId),
        event.deduplicationKey,
        event.eventType
      )
    } catch {
      throw new ApiError(503, 'Bank webhook processing is temporarily unavailable.')
    }
  }
}
