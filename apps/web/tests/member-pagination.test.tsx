import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import MemberPage from '../app/(member)/member/page'

vi.mock('../lib/page-access', () => ({ requirePageRole: async () => ({}) }))
vi.mock('../lib/content-reads', () => ({
  readMemberPosts: async (page: number) => ({
    data: [
      {
        id: 'id',
        title: page === 2 ? 'Second page member post' : 'First page member post',
        content: 'Prayer notes',
        excerpt: null,
        slug: 'prayer-notes',
        authorId: 'author-id',
        categoryId: null,
        status: 'published',
        visibility: 'member',
        publishedAt: '2026-09-01',
      },
    ],
    page,
    pageSize: 6,
    total: 12,
  }),
}))

it('loads the requested page of member posts with a previous-page link', async () => {
  render(await MemberPage({ searchParams: Promise.resolve({ page: '2' }) }))
  expect(screen.getByRole('heading', { name: 'Second page member post' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Previous page' })).toHaveAttribute(
    'href',
    '/member?page=1',
  )
})
