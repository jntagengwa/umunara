'use client'

import { useEffect, useRef, useState } from 'react'
import {
  bankReviewPageSchema,
  type BankReviewItem,
  type BankReviewPage,
  type BankTransactionQuery,
  type Role,
} from '@umunara/schemas'
import { BankReviewFilters } from './bank-review-filters'
import { BankReviewEditor } from './bank-review-editor'
import { bankAmount, classificationLabels } from './bank-review-values'
import styles from './bank-review.module.css'

function initialQuery(): BankTransactionQuery {
  const now = new Date()
  return {
    from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
    page: 1,
    pageSize: 25,
  }
}

export function BankReviewTable({ role }: { role: Role }) {
  const [query, setQuery] = useState(initialQuery)
  const [page, setPage] = useState<BankReviewPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [selected, setSelected] = useState<BankReviewItem | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (role !== 'admin') return
    const controller = new AbortController()
    async function load(): Promise<void> {
      setLoading(true)
      setError('')
      setPage(null)
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(query))
        if (value !== undefined) params.set(key, String(value))
      try {
        const response = await fetch(`/api/v1/admin/bank/transactions?${params}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Bank read failed')
        const result = bankReviewPageSchema.parse(await response.json())
        if (!controller.signal.aborted) setPage(result)
      } catch {
        if (!controller.signal.aborted)
          setError('Unable to load bank transactions. Please refresh.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [query, refresh, role])

  function closeEditor(): void {
    setSelected(null)
    heading.current?.focus()
  }
  if (role !== 'admin') return null
  return (
    <section className={styles.review} aria-labelledby="bank-review-title">
      <h2 id="bank-review-title" ref={heading} tabIndex={-1}>
        Bank transaction review
      </h2>
      <p>
        Review imported activity and match processor payouts to existing gifts. Pending transactions
        are read-only. Removed transactions are excluded.
      </p>
      <BankReviewFilters
        query={query}
        disabled={loading || saving}
        onApply={(value) => {
          closeEditor()
          setNotice('')
          setQuery(value)
        }}
      />
      <button
        type="button"
        disabled={loading || saving}
        onClick={() => {
          closeEditor()
          setRefresh((value) => value + 1)
        }}
      >
        Refresh transactions
      </button>
      {loading && <p role="status">Loading bank transactions…</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {page && (
        <>
          {page.items.length === 0 ? (
            <p>No transactions match these filters.</p>
          ) : (
            <div
              className={styles.tableScroll}
              role="region"
              aria-label="Bank transactions"
              tabIndex={0}
            >
              <table>
                <caption>Imported bank transactions · page {query.page}</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Description</th>
                    <th scope="col">Account</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Review status</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.bookedOn}</td>
                      <td>{item.description}</td>
                      <td>
                        {item.accountName}
                        {item.accountMask ? ` ••${item.accountMask}` : ''}
                        <small>{item.accountId}</small>
                      </td>
                      <td>{bankAmount(item.amountMinor, item.currency)}</td>
                      <td>
                        {item.pending ? 'Pending' : classificationLabels[item.classification]}
                        {item.linkCount > 0 ? ` · Matched to ${item.linkCount} gifts` : ''}
                      </td>
                      <td>
                        <button
                          type="button"
                          disabled={saving || item.pending || item.linkCount > 0}
                          aria-label={`Review ${item.description}`}
                          onClick={() => {
                            setNotice('')
                            setSelected(item)
                          }}
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <nav aria-label="Bank transaction pages" className={styles.actions}>
            <button
              disabled={saving || query.page === 1}
              onClick={() => {
                closeEditor()
                setQuery((value) => ({ ...value, page: value.page - 1 }))
              }}
            >
              Previous page
            </button>
            <span>Page {query.page}</span>
            <button
              disabled={saving || !page.hasMore || query.page >= 10000}
              onClick={() => {
                closeEditor()
                setQuery((value) => ({ ...value, page: value.page + 1 }))
              }}
            >
              Next page
            </button>
          </nav>
        </>
      )}
      {selected && (
        <BankReviewEditor
          key={selected.id}
          item={selected}
          onBusy={setSaving}
          onCancel={closeEditor}
          onSaved={() => {
            closeEditor()
            setNotice('Review saved. Donation totals are unchanged.')
            setRefresh((value) => value + 1)
          }}
        />
      )}
    </section>
  )
}
