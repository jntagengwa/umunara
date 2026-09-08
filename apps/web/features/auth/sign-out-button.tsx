'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { responseError } from '../../lib/request-error'

export function SignOutButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function signOut(): Promise<void> {
    setPending(true)
    setError('')
    try {
      const response = await fetch('/api/v1/auth/sign-out', {
        method: 'POST',
        cache: 'no-store',
      })
      if (!response.ok) throw new Error(await responseError(response))
      router.replace('/sign-in')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign out. Please try again.')
      setPending(false)
    }
  }

  return (
    <div>
      <button type="button" disabled={pending} onClick={signOut}>
        {pending ? 'Signing out…' : 'Sign out'}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
