import { describe, expect, it } from 'vitest'
import {
  bankConnectionDtoSchema,
  bankSyncPageSchema,
  bankTransactionClassificationSchema,
  bankTransactionQuerySchema,
  bankTransactionSnapshotSchema,
  reconciliationLinkInputSchema,
} from './bank'

const id = '11111111-1111-4111-8111-111111111111'
const transaction = {
  providerTransactionId: 'txn_1',
  accountId: id,
  amountMinor: 2400,
  currency: 'USD',
  bookedOn: '2026-09-07',
  description: 'Deposit',
  pending: false,
}
const page = {
  connectionId: id,
  pageId: id,
  expectedCursor: null,
  cursor: 'next',
  added: [transaction],
  modified: [],
  removed: [],
}

describe('bank contracts', () => {
  it('rejects an unknown classification', () => {
    expect(() => bankTransactionClassificationSchema.parse('income')).toThrow()
  })
  it.each([1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN])(
    'rejects unsafe money %s',
    (amountMinor) => {
      expect(bankTransactionSnapshotSchema.safeParse({ ...transaction, amountMinor }).success).toBe(
        false
      )
    }
  )
  it('accepts signed safe integer credits and debits', () => {
    expect(
      bankTransactionSnapshotSchema.parse({ ...transaction, amountMinor: -2400 }).amountMinor
    ).toBe(-2400)
  })
  it.each(['2026-02-30', '2026-13-01', '2026-09-07T00:00:00Z'])(
    'rejects invalid date %s',
    (bookedOn) => {
      expect(bankTransactionSnapshotSchema.safeParse({ ...transaction, bookedOn }).success).toBe(
        false
      )
    }
  )
  it.each(['accessToken', 'routingNumber', 'accountNumber', 'payload'])(
    'rejects unallowlisted field %s',
    (key) => {
      expect(
        bankTransactionSnapshotSchema.safeParse({ ...transaction, [key]: 'secret' }).success
      ).toBe(false)
    }
  )
  it('rejects secrets in connection DTOs', () => {
    expect(
      bankConnectionDtoSchema.safeParse({
        id,
        institutionName: 'Bank',
        status: 'active',
        lastSyncedAt: null,
        secretReference: id,
      }).success
    ).toBe(false)
  })
  it('validates a bounded page and rejects overlapping identities', () => {
    expect(bankSyncPageSchema.parse(page)).toEqual(page)
    expect(bankSyncPageSchema.safeParse({ ...page, removed: ['txn_1'] }).success).toBe(false)
    expect(bankSyncPageSchema.safeParse({ ...page, modified: [transaction] }).success).toBe(false)
    expect(bankSyncPageSchema.safeParse({ ...page, expectedCursor: 'next' }).success).toBe(false)
    expect(
      bankSyncPageSchema.safeParse({ ...page, added: [], expectedCursor: 'next' }).success
    ).toBe(true)
  })
  it('requires bounded, ordered filters with known keys', () => {
    expect(
      bankTransactionQuerySchema.parse({ from: '2026-09-01', to: '2026-09-07' }).pageSize
    ).toBe(50)
    for (const extra of [
      { from: '2026-10-01' },
      { pageSize: 101 },
      { minAmountMinor: 3, maxAmountMinor: 2 },
      { raw: true },
    ]) {
      expect(
        bankTransactionQuerySchema.safeParse({ from: '2026-09-01', to: '2026-09-07', ...extra })
          .success
      ).toBe(false)
    }
  })
  it('requires unique donation targets and one target for offline gifts', () => {
    const input = { transactionId: id, actorId: id, kind: 'processor_payout', donationIds: [id] }
    expect(reconciliationLinkInputSchema.parse(input)).toEqual(input)
    expect(
      reconciliationLinkInputSchema.safeParse({ ...input, donationIds: [id, id] }).success
    ).toBe(false)
    expect(reconciliationLinkInputSchema.safeParse({ ...input, donationIds: [] }).success).toBe(
      false
    )
    expect(
      reconciliationLinkInputSchema.safeParse({ ...input, kind: 'non_donation' }).success
    ).toBe(false)
  })
})
