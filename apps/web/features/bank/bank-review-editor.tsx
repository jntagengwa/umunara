'use client'

import { useEffect, useRef, useState } from 'react'
import {
  bankClassifySchema,
  bankClassifyResultSchema,
  bankPayoutSchema,
  bankTransactionClassificationSchema,
  reconciliationLinkResultSchema,
  type BankReviewItem,
} from '@umunara/schemas'
import { bankAmount, classificationLabels } from './bank-review-values'
import styles from './bank-review.module.css'

export function BankReviewEditor({
  item,
  onSaved,
  onCancel,
  onBusy,
}: {
  item: BankReviewItem
  onSaved: () => void
  onCancel: () => void
  onBusy: (busy: boolean) => void
}) {
  const [action, setAction] = useState<string>(item.classification)
  const [donationIds, setDonationIds] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [])

  async function save(): Promise<void> {
    if (!confirmed || busy.current) return
    const input =
      action === 'reconcile'
        ? bankPayoutSchema.safeParse({ donationIds: donationIds.trim().split(/[\s,]+/) })
        : bankClassifySchema.safeParse({ classification: action })
    if (!input.success) {
      setError('Enter 1–500 unique donation UUIDs, separated by commas or new lines.')
      return
    }
    busy.current = true
    setPending(true)
    onBusy(true)
    setError('')
    try {
      const response = await fetch(
        `/api/v1/admin/bank/transactions/${item.id}/${action === 'reconcile' ? 'reconcile' : 'classify'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input.data),
        }
      )
      if (!response.ok) {
        setError(
          response.status === 409
            ? 'This transaction cannot be changed or matched. Refresh and check the classification, currency, amounts and existing links.'
            : 'The review could not be confirmed. Refresh transactions before trying again.'
        )
        return
      }
      const body: unknown = await response.json()
      if (action === 'reconcile') reconciliationLinkResultSchema.parse(body)
      else bankClassifyResultSchema.parse(body)
      onSaved()
    } catch {
      setError('The review could not be confirmed. Refresh transactions before trying again.')
    } finally {
      busy.current = false
      setPending(false)
      onBusy(false)
    }
  }
  return (
    <form
      className={styles.editor}
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
      aria-labelledby="bank-review-editor-title"
    >
      <h3 id="bank-review-editor-title" ref={heading} tabIndex={-1}>
        Review {item.description}
      </h3>
      <p>
        {item.bookedOn} · {bankAmount(item.amountMinor, item.currency)} · {item.accountName}
      </p>
      <fieldset disabled={pending}>
        <legend>Confirm classification or match</legend>
        <label>
          Review action
          <select
            value={action}
            onChange={(event) => {
              setAction(event.target.value)
              setConfirmed(false)
              setError('')
            }}
          >
            {bankTransactionClassificationSchema.options.map((value) => (
              <option
                key={value}
                value={value}
                disabled={
                  item.linkCount > 0 ||
                  (item.amountMinor <= 0 && ['donation', 'processor_payout'].includes(value))
                }
              >
                {classificationLabels[value]}
              </option>
            ))}
            <option
              value="reconcile"
              disabled={
                item.amountMinor <= 0 ||
                item.linkCount > 0 ||
                !['unreviewed', 'processor_payout'].includes(item.classification)
              }
            >
              Match processor payout
            </option>
          </select>
        </label>
        {action === 'reconcile' ? (
          <>
            <p>
              Use existing settled Stripe or PayPal gift IDs from one provider and currency. Their
              current net amounts must total {bankAmount(item.amountMinor, item.currency)}. Each
              gift can have only one active bank match. No new donation will be created.
            </p>
            <label>
              Donation IDs
              <textarea
                required
                value={donationIds}
                maxLength={19000}
                onChange={(event) => {
                  setDonationIds(event.target.value)
                  setConfirmed(false)
                }}
              />
            </label>
          </>
        ) : (
          <p>
            Classification is a review label. It does not create a donation or change donation
            totals. A processor payout still needs an explicit match.
          </p>
        )}
        <label className={styles.confirm}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />{' '}
          I confirm this review for {item.description}.
        </label>
        <div className={styles.actions}>
          <button type="submit" disabled={!confirmed || item.linkCount > 0}>
            Confirm review
          </button>
          <button type="button" onClick={onCancel}>
            Cancel review
          </button>
        </div>
      </fieldset>
      {pending && <p role="status">Saving review…</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
