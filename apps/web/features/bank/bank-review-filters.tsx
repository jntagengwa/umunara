'use client'

import { useState } from 'react'
import {
  bankTransactionClassificationSchema,
  bankTransactionQuerySchema,
  type BankTransactionQuery,
} from '@umunara/schemas'
import { classificationLabels } from './bank-review-values'
import styles from './bank-review.module.css'

export function BankReviewFilters({
  query,
  disabled,
  onApply,
}: {
  query: BankTransactionQuery
  disabled: boolean
  onApply: (query: BankTransactionQuery) => void
}) {
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<Record<string, string>>({
    from: query.from,
    to: query.to,
    accountId: query.accountId ?? '',
    classification: query.classification ?? '',
    currency: query.currency ?? '',
    minAmountMinor: query.minAmountMinor?.toString() ?? '',
    maxAmountMinor: query.maxAmountMinor?.toString() ?? '',
  })
  function field(name: string) {
    return {
      name,
      value: draft[name] ?? '',
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setDraft((value) => ({ ...value, [name]: event.target.value })),
    }
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const input: Record<string, unknown> = { page: 1, pageSize: 25 }
        for (const [key, value] of Object.entries(draft)) {
          if (value.trim())
            input[key] = ['minAmountMinor', 'maxAmountMinor'].includes(key)
              ? Number(value)
              : value.trim()
        }
        const parsed = bankTransactionQuerySchema.safeParse(input)
        if (!parsed.success) {
          setError(
            'Use valid dates within 366 days, an account UUID, and ordered whole-number amounts.'
          )
          return
        }
        setError('')
        onApply(parsed.data)
      }}
    >
      <fieldset className={styles.filters} disabled={disabled}>
        <legend>Filter bank transactions</legend>
        <label>
          From
          <input type="date" {...field('from')} required />
        </label>
        <label>
          To
          <input type="date" {...field('to')} required />
        </label>
        <label>
          Account ID
          <input {...field('accountId')} placeholder="All accounts" />
        </label>
        <label>
          Classification
          <select {...field('classification')}>
            <option value="">All classifications</option>
            {bankTransactionClassificationSchema.options.map((value) => (
              <option key={value} value={value}>
                {classificationLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Currency
          <input {...field('currency')} placeholder="All currencies" maxLength={3} />
        </label>
        <label>
          Minimum amount (minor units)
          <input {...field('minAmountMinor')} type="number" step="1" />
        </label>
        <label>
          Maximum amount (minor units)
          <input {...field('maxAmountMinor')} type="number" step="1" />
        </label>
        <button type="submit">Apply filters</button>
      </fieldset>
      <p>
        Positive amounts are credits; negative amounts are debits. For USD, 100 minor units = $1.00.
        Account IDs appear beside the transactions.
      </p>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
