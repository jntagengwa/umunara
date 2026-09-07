import '@testing-library/jest-dom'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PayPalDonationButton } from './paypal-donation-button'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
it('validates amounts locally and shows recoverable API errors', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      Response.json({ error: 'PayPal is temporarily unavailable.' }, { status: 503 })
    )
  vi.stubGlobal('fetch', fetcher)
  render(<PayPalDonationButton />)
  fireEvent.change(screen.getByLabelText('PayPal amount (USD)'), { target: { value: '2.345' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue to PayPal' }))
  expect(screen.getByRole('alert')).toHaveTextContent('two decimal places')
  expect(fetcher).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('PayPal amount (USD)'), { target: { value: '25.00' } })
  fireEvent.change(screen.getByLabelText('PayPal giving frequency'), {
    target: { value: 'monthly' },
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Continue to PayPal' }))
  })
  expect(screen.getByRole('alert')).toHaveTextContent('temporarily unavailable')
  expect(fetcher).toHaveBeenCalledWith(
    '/api/v1/donations/paypal/subscription',
    expect.objectContaining({
      method: 'POST',
      body: '{"amountMinor":2500,"currency":"USD","cadence":"monthly"}',
    })
  )
  expect(screen.getByRole('button', { name: 'Continue to PayPal' })).toBeEnabled()
})
it('requires explicit capture after approval and never treats a redirect as settlement', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ received: true }))
  vi.stubGlobal('fetch', fetcher)
  render(<PayPalDonationButton returnState="approved" orderId="ORDER123" />)
  expect(fetcher).not.toHaveBeenCalled()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Complete PayPal donation' }))
  })
  expect(screen.getByRole('status')).toHaveTextContent('submitted')
  expect(fetcher).toHaveBeenCalledWith(
    '/api/v1/donations/paypal/order/ORDER123/capture',
    expect.objectContaining({ method: 'POST', body: '{}' })
  )
  expect(screen.getByText(/recorded after PayPal confirms/)).toBeVisible()
})
