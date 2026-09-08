import '@testing-library/jest-dom'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AuthForm } from './auth-form'
import { SignOutButton } from './sign-out-button'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('submits signup only to the application API and shows recoverable server errors', async () => {
  let respond: (response: Response) => void = () => undefined
  const pending = new Promise<Response>((resolve) => {
    respond = resolve
  })
  const fetcher = vi.fn().mockReturnValue(pending)
  vi.stubGlobal('fetch', fetcher)
  render(<AuthForm mode="sign-up" />)
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'New member' } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.test' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'long-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
  expect(screen.getByRole('button', { name: 'Please wait…' })).toBeDisabled()
  expect(fetcher).toHaveBeenCalledWith(
    '/api/v1/auth/sign-up',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        email: 'new@example.test',
        password: 'long-password',
        fullName: 'New member',
      }),
    }),
  )
  await act(async () => {
    respond(Response.json({ error: 'Please try again.' }, { status: 400 }))
  })
  expect(screen.getByRole('alert')).toHaveTextContent('Please try again.')
  expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled()
})

it('submits password sign-in and allows retry after a network failure', async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error('Connection unavailable.'))
  vi.stubGlobal('fetch', fetcher)
  render(<AuthForm mode="sign-in" />)
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.test' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'long-password' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  })
  expect(screen.getByRole('alert')).toHaveTextContent('Connection unavailable.')
  expect(fetcher).toHaveBeenCalledWith(
    '/api/v1/auth/sign-in',
    expect.objectContaining({ method: 'POST' }),
  )
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
})

it('reports failed sign-out without falsely navigating away from the account', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ error: 'Please retry sign out.' }, { status: 503 }))
  vi.stubGlobal('fetch', fetcher)
  render(<SignOutButton />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  })
  expect(screen.getByRole('alert')).toHaveTextContent('Please retry sign out.')
  expect(fetcher).toHaveBeenCalledWith(
    '/api/v1/auth/sign-out',
    expect.objectContaining({ method: 'POST' }),
  )
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled()
})
