'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { authResultSchema } from '@umunara/schemas'
import { responseError } from '../../lib/request-error'

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const signingUp = mode === 'sign-up'
  const label = signingUp ? 'Create account' : 'Sign in'

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    setError('')
    try {
      const response = await fetch(`/api/v1/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password'),
          ...(signingUp ? { fullName: form.get('fullName') } : {}),
        }),
        cache: 'no-store',
      })
      if (!response.ok) throw new Error(await responseError(response))
      const { redirectTo } = authResultSchema.parse(await response.json())
      router.replace(redirectTo)
      router.refresh()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to complete the request. Please try again.',
      )
      setPending(false)
    }
  }

  return (
    <form className="content-form" onSubmit={submit}>
      <fieldset disabled={pending}>
        <legend>{label}</legend>
        {signingUp && (
          <>
            <label htmlFor="fullName">Full name</label>
            <input id="fullName" name="fullName" autoComplete="name" required maxLength={120} />
          </>
        )}
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={signingUp ? 'new-password' : 'current-password'}
          required
          minLength={signingUp ? 8 : 1}
          maxLength={128}
          aria-describedby={signingUp ? 'password-help' : undefined}
        />
        {signingUp && <p id="password-help">Use at least 8 characters.</p>}
        <button type="submit">{pending ? 'Please wait…' : label}</button>
      </fieldset>
      <p role="status">{pending ? 'Submitting…' : ''}</p>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
