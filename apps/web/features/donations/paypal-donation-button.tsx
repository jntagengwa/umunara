'use client'

import { useState, type FormEvent } from 'react'
import { payPalApprovalSchema, payPalCheckoutSchema, payPalOrderIdSchema } from '@umunara/schemas'
import { responseError } from '../../lib/request-error'

interface PayPalDonationProps {
  returnState?: string
  orderId?: string
}

export function PayPalDonationButton({ returnState, orderId }: PayPalDonationProps) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const canCapture = returnState === 'approved' && payPalOrderIdSchema.safeParse(orderId).success

  async function post(path: string, input: unknown): Promise<unknown> {
    const response = await fetch(`/api/v1/donations/paypal/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(await responseError(response))
    return response.json()
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (pending) return
    setError('')
    const form = new FormData(event.currentTarget)
    const amount = String(form.get('amount') ?? '')
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
      setError('Enter a US dollar amount with no more than two decimal places.')
      return
    }
    const [whole, fraction = ''] = amount.split('.')
    const input = payPalCheckoutSchema.safeParse({
      amountMinor: Number(whole) * 100 + Number(fraction.padEnd(2, '0')),
      currency: 'USD',
      cadence: form.get('cadence'),
    })
    if (!input.success) {
      setError('Enter an amount from $0.50 to $999,999.99 and choose a giving frequency.')
      return
    }
    setPending(true)
    try {
      const approval = payPalApprovalSchema.parse(
        await post(input.data.cadence === 'one_time' ? 'order' : 'subscription', input.data)
      )
      window.location.assign(approval.approvalUrl)
    } catch (cause) {
      setError(
        cause instanceof Error && cause.name !== 'ZodError'
          ? cause.message
          : 'Unable to open PayPal. Please try again.'
      )
      setPending(false)
    }
  }

  async function capture(): Promise<void> {
    if (pending || !canCapture || submitted) return
    setError('')
    setPending(true)
    try {
      await post(`order/${orderId}/capture`, {})
      setSubmitted(true)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to submit your donation. Please try again.'
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <section aria-label="PayPal giving">
      {returnState === 'cancelled' && (
        <p>PayPal checkout was cancelled. You can start again below.</p>
      )}
      {returnState === 'returned' && (
        <p>You returned from PayPal. Your recurring gift is awaiting provider confirmation.</p>
      )}
      {canCapture && !submitted && (
        <p>
          <button type="button" disabled={pending} onClick={capture}>
            Complete PayPal donation
          </button>
        </p>
      )}
      <form className="content-form" onSubmit={submit}>
        <fieldset disabled={pending}>
          <legend>Give with PayPal</legend>
          <label htmlFor="paypal-amount">PayPal amount (USD)</label>
          <input
            id="paypal-amount"
            name="amount"
            inputMode="decimal"
            required
            maxLength={10}
            defaultValue="25.00"
            aria-describedby="paypal-amount-help"
          />
          <p id="paypal-amount-help">Enter US dollars, for example 25.00. Minimum $0.50.</p>
          <label htmlFor="paypal-cadence">PayPal giving frequency</label>
          <select id="paypal-cadence" name="cadence" defaultValue="one_time">
            <option value="one_time">One time</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
          <p>
            Recurring gifts are charged at your chosen frequency until cancelled in your PayPal
            account.
          </p>
          <button type="submit">{pending ? 'Connecting to PayPal…' : 'Continue to PayPal'}</button>
        </fieldset>
      </form>
      <p role="status">
        {submitted
          ? 'Your capture request was submitted. Awaiting PayPal confirmation.'
          : pending
            ? 'Connecting securely to PayPal…'
            : ''}
      </p>
      {error && <p role="alert">{error}</p>}
      <p>
        Your donation is recorded after PayPal confirms the payment. Returning from checkout does
        not confirm a payment.
      </p>
    </section>
  )
}
