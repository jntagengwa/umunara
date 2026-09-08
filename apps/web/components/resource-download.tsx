'use client'

import { useEffect, useState } from 'react'
import { z } from 'zod'
import { responseError } from '../lib/request-error'

const downloadSchema = z.object({ url: z.string().url(), expiresAt: z.string().datetime() })

export function ResourceDownload({ resourceId }: { resourceId: string }) {
  const [download, setDownload] = useState<z.infer<typeof downloadSchema> | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!download) return
    const timer = setTimeout(
      () => setDownload(null),
      Math.max(0, Date.parse(download.expiresAt) - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [download])

  async function getDownload() {
    setPending(true)
    setError('')
    setDownload(null)
    try {
      const response = await fetch(`/api/v1/resources/${resourceId}/download`, {
        cache: 'no-store',
      })
      if (!response.ok) {
        setError(await responseError(response))
        return
      }
      setDownload(downloadSchema.parse(await response.json()))
    } catch {
      setError('Unable to complete the request. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div>
      <button type="button" onClick={getDownload} disabled={pending}>
        {pending ? 'Preparing download…' : 'Get download link'}
      </button>
      <p role="status">
        {download && (
          <>
            <a href={download.url} rel="noreferrer" referrerPolicy="no-referrer">
              Download file
            </a>{' '}
            — this link expires in one minute.
          </>
        )}
      </p>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
