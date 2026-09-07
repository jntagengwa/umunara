import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import HomePage from '../app/(public)/page'
import PublicLayout from '../app/(public)/layout'
import BlogPage from '../app/(public)/blog/page'
import EventsPage from '../app/(public)/events/page'
import GivePage from '../app/(public)/give/page'
import { defaultHomeHero } from '@umunara/schemas'

vi.mock('next/server', () => ({ connection: async () => undefined }))
vi.mock('../lib/content-reads', () => ({
  readHomeHero: async () => defaultHomeHero,
  readPublicPosts: async () => ({ data: [], page: 1, pageSize: 6, total: 0 }),
  readPublicEvents: async () => ({ data: [], page: 1, pageSize: 12, total: 0 }),
}))

it('renders the Umunara home page', async () => {
  render(await HomePage())
  expect(screen.getByRole('main')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Welcome To Umunara, Inc' })).toBeInTheDocument()
})

it('links the migrated public routes from the shared shell', async () => {
  render(<PublicLayout>{await HomePage()}</PublicLayout>)
  expect(screen.getByRole('link', { name: 'Blog' })).toHaveAttribute('href', '/blog')
  expect(screen.getByRole('link', { name: 'Calendar' })).toHaveAttribute('href', '/events')
  expect(screen.getByRole('link', { name: 'Donate' })).toHaveAttribute('href', '/give')
  expect(screen.getByRole('contentinfo')).toBeInTheDocument()
})

it('renders useful public content empty states', async () => {
  const { unmount } = render(await BlogPage({ searchParams: Promise.resolve({}) }))
  expect(screen.getByText('There are no published posts yet.')).toBeInTheDocument()
  unmount()
  render(await EventsPage({ searchParams: Promise.resolve({}) }))
  expect(screen.getByText('There are no scheduled events yet.')).toBeInTheDocument()
})

it('preserves the existing giving options', () => {
  render(<GivePage />)
  expect(
    screen.getByRole('button', { name: 'Donate with PayPal' }).closest('form'),
  ).toHaveAttribute('action', 'https://www.paypal.com/donate')
  expect(screen.getByText(/Sending a check or money order/)).toBeInTheDocument()
})
