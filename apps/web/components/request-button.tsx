'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { responseError } from '../lib/request-error'

export function RequestButton({
  endpoint,
  label,
  pendingLabel,
  successMessage,
  refreshOnSuccess = false,
}: {
  endpoint: string
  label: string
  pendingLabel: string
  successMessage: string
  refreshOnSuccess?: boolean
}) {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')

  async function submit() {
    setStatus('pending')
    setError('')
    try {
      const response = await fetch(endpoint, { method: 'POST', cache: 'no-store' })
      if (!response.ok) {
        setError(await responseError(response))
        setStatus('error')
        return
      }
      setStatus('success')
      if (refreshOnSuccess) router.refresh()
    } catch {
      setError('Unable to complete the request. Please try again.')
      setStatus('error')
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={submit}
        disabled={status === 'pending' || status === 'success'}
      >
        {status === 'pending' ? pendingLabel : label}
      </button>
      <p role="status">{status === 'success' ? successMessage : ''}</p>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
