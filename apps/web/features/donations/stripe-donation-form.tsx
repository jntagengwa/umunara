'use client'

import { useState, type FormEvent } from 'react'
import { stripeCheckoutSchema, stripeCheckoutResultSchema } from '@umunara/schemas'
import { responseError } from '../../lib/request-error'

export function StripeDonationForm() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

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
    const input = stripeCheckoutSchema.safeParse({
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
      const response = await fetch('/api/v1/donations/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input.data),
        cache: 'no-store',
      })
      if (!response.ok) throw new Error(await responseError(response))
      const { checkoutUrl } = stripeCheckoutResultSchema.parse(await response.json())
      window.location.assign(checkoutUrl)
    } catch (cause) {
      setError(
        cause instanceof Error && cause.name !== 'ZodError'
          ? cause.message
          : 'Unable to open checkout. Please try again.'
      )
      setPending(false)
    }
  }

  return (
    <form className="content-form" onSubmit={submit}>
      <fieldset disabled={pending}>
        <legend>Give with Stripe</legend>
        <label htmlFor="donation-amount">Donation amount (USD)</label>
        <input
          id="donation-amount"
          name="amount"
          inputMode="decimal"
          required
          maxLength={10}
          defaultValue="25.00"
          aria-describedby="donation-amount-help"
        />
        <p id="donation-amount-help">Enter US dollars, for example 25.00. Minimum $0.50.</p>
        <label htmlFor="donation-cadence">Giving frequency</label>
        <select id="donation-cadence" name="cadence" defaultValue="one_time">
          <option value="one_time">One time</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
        <p>Recurring gifts are charged at your chosen frequency until cancelled.</p>
        <button type="submit">{pending ? 'Opening checkout…' : 'Continue to Stripe'}</button>
      </fieldset>
      <p role="status">{pending ? 'Opening secure Stripe checkout…' : ''}</p>
      {error && <p role="alert">{error}</p>}
      <p>
        Your donation is recorded after it is confirmed by the payment provider. Returning here from
        checkout does not confirm a payment.
      </p>
    </form>
  )
}
