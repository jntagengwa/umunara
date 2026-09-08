import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { BankReviewTable } from './bank-review-table'

const id = '11111111-1111-4111-8111-111111111111'
const item = {
  id,
  accountId: id,
  accountName: 'Checking',
  accountMask: '1234',
  amountMinor: 9700,
  currency: 'USD',
  bookedOn: '2026-09-07',
  description: 'Stripe payout',
  pending: false,
  classification: 'unreviewed',
  removedAt: null,
  linkCount: 0,
}
const fetchMock = vi.fn<typeof fetch>()
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => Response.json({ items: [item], hasMore: true }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('does not render or request banking data for members', () => {
  render(<BankReviewTable role="member" />)
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalled()
})
it('loads a bounded page and applies server-side signed amount and account filters', async () => {
  await act(async () => {
    render(<BankReviewTable role="admin" />)
  })
  expect(screen.getByText('Stripe payout')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Minimum amount (minor units)'), {
    target: { value: '-500' },
  })
  fireEvent.change(screen.getByLabelText('Account ID'), { target: { value: id } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
  })
  expect(fetchMock).toHaveBeenLastCalledWith(
    expect.stringContaining('minAmountMinor=-500'),
    expect.objectContaining({ cache: 'no-store' })
  )
  expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain(`accountId=${id}`)
  expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain('pageSize=25')
})
it('requires explicit confirmation and links a payout using only gift IDs', async () => {
  await act(async () => {
    render(<BankReviewTable role="admin" />)
  })
  fireEvent.click(screen.getByRole('button', { name: 'Review Stripe payout' }))
  fireEvent.change(screen.getByLabelText('Review action'), { target: { value: 'reconcile' } })
  fireEvent.change(screen.getByLabelText('Donation IDs'), { target: { value: id } })
  expect(screen.getByRole('button', { name: 'Confirm review' })).toBeDisabled()
  fireEvent.click(screen.getByLabelText(/I confirm/))
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ outcome: 'applied', linkIds: [id] }))
  )
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Confirm review' }))
  })
  expect(screen.getByText(/Review saved/)).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledWith(
    `/api/v1/admin/bank/transactions/${id}/reconcile`,
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ donationIds: [id] }) })
  )
})
it('shows safe errors and permits refreshing an unavailable list', async () => {
  fetchMock.mockResolvedValueOnce(new Response('private provider payload', { status: 503 }))
  await act(async () => {
    render(<BankReviewTable role="admin" />)
  })
  expect(screen.getByText('Unable to load bank transactions. Please refresh.')).toBeInTheDocument()
  expect(screen.queryByText('private provider payload')).not.toBeInTheDocument()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Refresh transactions' }))
  })
  expect(screen.getByText('Stripe payout')).toBeInTheDocument()
})
