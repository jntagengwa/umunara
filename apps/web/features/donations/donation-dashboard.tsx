'use client'

import { useState, type FormEvent } from 'react'
import { donationReportRangeSchema, donationSummarySchema } from '@umunara/schemas'
import type { DonationReportRange, DonationSummaryDto } from '@umunara/schemas'
import { DonationReportResults } from './donation-report-results'
import styles from './donation-dashboard.module.css'

export function DonationDashboard({
  initialRange,
  initialSummary,
}: {
  initialRange: DonationReportRange
  initialSummary: DonationSummaryDto | null
}) {
  const [filters, setFilters] = useState(initialRange)
  const [summary, setSummary] = useState(initialSummary)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(
    initialSummary ? '' : 'Unable to load donation reporting. Try again.'
  )

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (pending) return
    const range = donationReportRangeSchema.safeParse(filters)
    if (!range.success) {
      setError('Choose valid dates covering 1 to 366 days and an uppercase ISO currency code.')
      return
    }
    setPending(true)
    setError('')
    setSummary(null)
    try {
      const response = await fetch(
        `/api/v1/admin/donations/summary?${new URLSearchParams(range.data)}`,
        { cache: 'no-store' }
      )
      if (!response.ok) throw new Error('Report unavailable')
      setSummary(donationSummarySchema.parse(await response.json()))
    } catch {
      setError('Unable to load donation reporting. Try again. If access changed, sign in again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className={`page-content ${styles.dashboard}`} id="main-content">
      <h1>Donation reporting</h1>
      <p>
        Settled giving by original UTC receipt date. Each report uses one currency; no currency
        conversion is applied.
      </p>
      <form onSubmit={submit}>
        <fieldset className={styles.filters} disabled={pending}>
          <legend>Report filters</legend>
          <label>
            From
            <input
              type="date"
              required
              value={filters.from}
              min="2000-01-01"
              max="9998-12-31"
              onChange={(event) => setFilters({ ...filters, from: event.target.value })}
            />
          </label>
          <label>
            To
            <input
              type="date"
              required
              value={filters.to}
              min="2000-01-01"
              max="9998-12-31"
              onChange={(event) => setFilters({ ...filters, to: event.target.value })}
            />
          </label>
          <label>
            Currency
            <input
              required
              value={filters.currency}
              maxLength={3}
              aria-describedby="currency-help"
              onChange={(event) =>
                setFilters({ ...filters, currency: event.target.value.toUpperCase() })
              }
            />
          </label>
          <button type="submit">{pending ? 'Loading report…' : 'Apply filters'}</button>
        </fieldset>
        <p id="currency-help">
          Use an ISO code such as USD, GBP, EUR or RWF. Both dates are included.
        </p>
      </form>
      <p role="status">{pending ? 'Loading donation report…' : ''}</p>
      {error && <p role="alert">{error}</p>}
      {summary && <DonationReportResults summary={summary} />}
      <details className={styles.policy}>
        <summary>How these totals are calculated</summary>
        <p>
          Gross and gift counts include succeeded, refunded and reversed receipts. Pending and
          failed attempts are excluded. Refunds include cumulative partial refunds and reversals.
          Net equals gross less refunds and fees, and may be negative.
        </p>
        <p>
          Later refunds, fee changes and verified reinstatements restate the original receipt
          period. These are current operational totals, not historical snapshots or a cash-flow
          statement. Provider and cadence shares use gross giving. Monthly and yearly describe gift
          cadence, not active subscriptions.
        </p>
        <p>
          Growth compares net giving with the immediately preceding equal number of days. It is
          unavailable when previous net is zero or negative. Unresolved provider exceptions,
          including failed or cancelled refunds and dispute fee reconciliation, may leave totals
          incomplete until reconciled.
        </p>
      </details>
    </main>
  )
}
