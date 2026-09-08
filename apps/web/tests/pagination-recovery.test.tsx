import '@testing-library/jest-dom'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Pagination } from '../components/pagination'
import MemberApprovalsPage from '../app/(admin)/admin/members/page'

const queue = vi.hoisted(() => ({ total: 25, page: 2, pageSize: 25, data: [] }))
vi.mock('../lib/page-access', () => ({
  requirePageRole: async () => ({
    actor: {},
    services: { membership: { listPending: async () => queue } },
  }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
afterEach(cleanup)

it.each([0, 25, 50])('provides recovery from a page beyond %i remaining records', (total) => {
  render(<Pagination page={9} pageSize={25} total={total} path="/admin/members" />)
  expect(screen.getByRole('link', { name: 'Previous page' })).toHaveAttribute(
    'href',
    `/admin/members?page=${Math.max(1, Math.ceil(total / 25))}`,
  )
})

it('does not claim the approval queue is empty after approving the last member on page 2', async () => {
  render(await MemberApprovalsPage({ searchParams: Promise.resolve({ page: '2' }) }))
  expect(screen.queryByText('No members are awaiting approval.')).not.toBeInTheDocument()
  expect(
    screen.getByText(
      'No members on this page. Return to a previous page to see remaining approvals.',
    ),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Previous page' })).toHaveAttribute(
    'href',
    '/admin/members?page=1',
  )
})
