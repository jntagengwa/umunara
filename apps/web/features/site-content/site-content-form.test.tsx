import '@testing-library/jest-dom'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SiteContentForm } from './site-content-form'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
const initialValue = { heading: 'Welcome To Umunara, Inc', introduction: 'Welcome, friends.' }

it('saves the home hero without requesting unrelated events or refreshing the route', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ key: 'home-hero', value: initialValue }))
  vi.stubGlobal('fetch', fetch)
  render(<SiteContentForm initialValue={initialValue} />)
  fireEvent.change(screen.getByLabelText('Hero heading'), {
    target: { value: 'Prayer for every nation' },
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save home content' }))
  })
  expect(screen.getByRole('status')).toHaveTextContent('Home content saved')
  expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/v1/site-settings/home-hero', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: { ...initialValue, heading: 'Prayer for every nation' } }),
  })
  expect(fetch.mock.calls.some(([url]) => String(url).includes('/events'))).toBe(false)
})

it('disables duplicate submits and preserves the draft after a failed save', async () => {
  let finish: (response: Response) => void = () => undefined
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
    ),
  )
  render(<SiteContentForm initialValue={initialValue} />)
  fireEvent.click(screen.getByRole('button', { name: 'Save home content' }))
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  await act(async () => {
    finish(Response.json({ error: 'Permission denied.' }, { status: 403 }))
  })
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to save home content')
  expect(screen.getByLabelText('Hero heading')).toHaveValue(initialValue.heading)
  expect(screen.getByRole('button', { name: 'Save home content' })).toBeEnabled()
})

it('rejects whitespace-only headings before requesting a save', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  render(<SiteContentForm initialValue={initialValue} />)
  fireEvent.change(screen.getByLabelText('Hero heading'), { target: { value: '   ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save home content' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a heading')
  expect(fetch).not.toHaveBeenCalled()
})
