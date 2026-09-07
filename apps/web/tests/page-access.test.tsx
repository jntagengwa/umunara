// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { requirePageRole } from '../lib/page-access'
import MemberPage from '../app/(member)/member/page'
import AdminContentPage from '../app/(admin)/admin/content/page'
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`)
  },
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), updateTag: vi.fn() }))
const state = vi.hoisted(() => ({
  role: 'pending',
  authenticated: true,
  approved: false,
  verified: true,
}))
vi.mock('@umunara/api/context', () => ({
  createServiceContext: async () => ({
    auth: {
      getUser: async () =>
        state.authenticated
          ? { id: 'user', emailConfirmedAt: state.verified ? '2026-01-01' : null }
          : null,
      getProfile: async () => ({
        id: 'user',
        role: state.role,
        approvedAt: state.approved ? '2026-01-01' : null,
      }),
    },
  }),
}))
vi.mock('../lib/content-reads', () => ({ readHomeHero: vi.fn(), readMemberPosts: vi.fn() }))
beforeEach(() => {
  Object.assign(state, {
    role: 'pending',
    authenticated: true,
    approved: false,
    verified: true,
  })
})

it.each([
  { role: 'pending', approved: false, authenticated: true, verified: true },
  { role: 'admin', approved: false, authenticated: true, verified: true },
  { role: 'admin', approved: true, authenticated: true, verified: false },
  { role: 'unknown', approved: true, authenticated: true, verified: true },
])('fails closed before returning member content for $role', async (fixture) => {
  Object.assign(state, fixture)
  await expect(MemberPage()).rejects.toThrow('NOT_FOUND')
})

it('directs anonymous visitors to sign in', async () => {
  state.authenticated = false
  await expect(MemberPage()).rejects.toThrow('REDIRECT:/sign-in')
})

it('rejects approved members from the content CMS', async () => {
  Object.assign(state, { role: 'member', approved: true })
  await expect(AdminContentPage()).rejects.toThrow('NOT_FOUND')
})

it('allows approved editors and rechecks authorization after revocation', async () => {
  Object.assign(state, { role: 'editor', approved: true })
  expect((await requirePageRole('editor')).actor.role).toBe('editor')
  Object.assign(state, { role: 'pending', approved: false })
  await expect(requirePageRole('editor')).rejects.toThrow('NOT_FOUND')
})
