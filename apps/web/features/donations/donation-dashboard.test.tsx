import '@testing-library/jest-dom'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DonationDashboard } from './donation-dashboard'
import type { DonationSummaryDto } from '@umunara/schemas'

const range = { from: '2026-01-01', to: '2026-01-31', currency: 'USD' }
const total = {
  giftCount: 1,
  grossAmountMinor: 2500,
  refundedAmountMinor: 2500,
  feeAmountMinor: 100,
  netAmountMinor: -100,
}
const summary: DonationSummaryDto = {
  ...total,
  range,
  comparison: { from: '2025-12-01', to: '2025-12-31', netAmountMinor: 0, growthPercentage: null },
  monthly: [{ month: '2026-01', ...total }],
  providerMix: [{ provider: 'stripe', ...total }],
  cadenceMix: [{ cadence: 'one_time', ...total }],
}
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
it.each([
  ['USD', Number.MAX_SAFE_INTEGER, '$90,071,992,547,409.91'],
  ['JPY', 2500, '¥2,500'],
  ['BHD', -1, '-BHD\u00a00.001'],
] as const)(
  'formats %s minor units without rounding away the smallest unit',
  (currency, amount, expected) => {
    render(
      <DonationDashboard
        initialRange={{ ...range, currency }}
        initialSummary={{
          ...summary,
          range: { ...range, currency },
          netAmountMinor: amount,
        }}
      />
    )
    expect(screen.getByLabelText('Net giving').textContent).toBe(expected)
  }
)
it('renders negative net, receipt-period policy, monthly series and mix tables', () => {
  render(<DonationDashboard initialRange={range} initialSummary={summary} />)
  expect(screen.getByRole('heading', { name: 'Donation reporting' })).toBeVisible()
  expect(screen.getByLabelText('Net giving')).toHaveTextContent('-$1.00')
  expect(screen.getByText(/original UTC receipt date/)).toBeVisible()
  expect(screen.getByRole('table', { name: 'Monthly giving' })).toHaveTextContent('2026-01')
  expect(screen.getByRole('table', { name: 'Provider mix' })).toHaveTextContent('Stripe')
  expect(screen.getByText(/Not available/)).toBeVisible()
})
it('validates filters, shows pending state and requests only the aggregate API', async () => {
  let resolve!: (response: Response) => void
  const fetcher = vi.fn().mockImplementation(
    () =>
      new Promise<Response>((done) => {
        resolve = done
      })
  )
  vi.stubGlobal('fetch', fetcher)
  render(<DonationDashboard initialRange={range} initialSummary={summary} />)
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-02-01' } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
  expect(screen.getByRole('alert')).toHaveTextContent('366')
  expect(fetcher).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-01-01' } })
  fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'GBP' } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
  expect(screen.getByRole('button', { name: 'Loading report…' })).toBeDisabled()
  await act(async () => {
    resolve(
      Response.json({
        ...summary,
        range: { ...range, currency: 'GBP' },
        giftCount: 0,
        grossAmountMinor: 0,
        feeAmountMinor: 0,
        refundedAmountMinor: 0,
        netAmountMinor: 0,
      })
    )
  })
  expect(fetcher.mock.calls[0]?.[0]).toBe(
    '/api/v1/admin/donations/summary?from=2026-01-01&to=2026-01-31&currency=GBP'
  )
  expect(screen.getByText(/No settled gifts/)).toBeVisible()
})
it('supports retry after initial failure and does not present stale totals as current', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ error: 'private error' }, { status: 503 }))
  vi.stubGlobal('fetch', fetcher)
  render(<DonationDashboard initialRange={range} initialSummary={null} />)
  expect(screen.getByRole('alert')).toHaveTextContent('Try again')
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
  })
  expect(screen.getByRole('alert')).not.toHaveTextContent('private error')
  expect(screen.queryByLabelText('Net giving')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Apply filters' })).toBeEnabled()
})
