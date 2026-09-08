import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ConnectBankAccount } from './connect-bank-account'
import { loadPlaidLink } from './plaid-link'

vi.mock('./plaid-link', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./plaid-link')>()),
  loadPlaidLink: vi.fn(),
}))
let options: Parameters<Awaited<ReturnType<typeof loadPlaidLink>>['create']>[0]
const destroy = vi.fn()
const fetch = vi.fn<typeof globalThis.fetch>()
beforeEach(() => {
  vi.clearAllMocks()
  fetch.mockReset()
  vi.stubGlobal('fetch', fetch)
  vi.stubGlobal('AbortSignal', { timeout: () => undefined })
  fetch.mockResolvedValueOnce(Response.json({ linkToken: 'link-private' }))
  vi.mocked(loadPlaidLink).mockResolvedValue({
    create: (input) => {
      options = input
      return { open: vi.fn(), destroy }
    },
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
it.each(['member', 'pending', 'editor'] as const)('has no connect action for %s', (role) => {
  render(<ConnectBankAccount role={role} />)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()
})
async function selectAccount() {
  render(<ConnectBankAccount role="admin" />)
  expect(screen.getByRole('button', { name: 'Connect bank account' })).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox'))
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Connect bank account' }))
  })
  expect(loadPlaidLink).toHaveBeenCalled()
  act(() =>
    options.onSuccess('public-private', {
      accounts: [
        {
          id: 'a1',
          name: 'Business checking',
          mask: '1234',
          type: 'depository',
          subtype: 'checking',
        },
      ],
    })
  )
  fireEvent.click(screen.getByRole('checkbox', { name: /Business checking/ }))
}
it('requires explicit consent and selection, then sends a public token only to the exchange route', async () => {
  fetch.mockResolvedValueOnce(
    Response.json({
      id: '11111111-1111-4111-8111-111111111111',
      institutionName: 'Fixture Bank',
      status: 'active',
      lastSyncedAt: null,
    })
  )
  await selectAccount()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Connect selected accounts' }))
  })
  expect(screen.getByText(/Fixture Bank connected/)).toHaveAttribute('role', 'status')
  expect(fetch.mock.calls[1]?.[0]).toBe('/api/v1/admin/bank/exchange-token')
  expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({
    businessAccountConsent: true,
    publicToken: 'public-private',
    selectedAccountIds: ['a1'],
  })
  expect(document.body.textContent).not.toMatch(/public-private|link-private|access-/)
  expect(destroy).toHaveBeenCalled()
})
it('does not render raw exchange errors and does not retry a consumed public token', async () => {
  fetch.mockResolvedValueOnce(Response.json({ error: 'access-private' }, { status: 503 }))
  await selectAccount()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Connect selected accounts' }))
  })
  expect(screen.getByRole('alert')).toHaveTextContent('Contact an administrator')
  expect(document.body.textContent).not.toContain('access-private')
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
