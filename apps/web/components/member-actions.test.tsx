import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RequestButton } from './request-button'
import { ResourceDownload } from './resource-download'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('shows registration conflicts and allows retry', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ error: 'This event is fully booked.' }, { status: 409 })),
  )
  render(
    <RequestButton
      endpoint="/api/register"
      label="Register for event"
      pendingLabel="Registering…"
      successMessage="Registered."
    />,
  )
  await act(async () => {
    fireEvent.click(screen.getByRole('button'))
  })
  expect(screen.getByRole('alert').textContent).toBe('This event is fully booked.')
  expect(screen.getByRole('button').hasAttribute('disabled')).toBe(false)
})

it('reports network failures without exposing a stale download link', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('network')
    }),
  )
  render(<ResourceDownload resourceId="test" />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button'))
  })
  expect(screen.getByRole('alert').textContent).toBe(
    'Unable to complete the request. Please try again.',
  )
  expect(screen.queryByRole('link')).toBeNull()
})
