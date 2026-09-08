import { describe, expect, it, vi } from 'vitest'
import { requireUser, optionalUser } from './require-user'
import { requireRole } from './require-role'

vi.mock('server-only', () => ({}))

const id = '11111111-1111-4111-8111-111111111111'
function source(overrides = {}) {
  return {
    getUser: async () => ({ id, emailConfirmedAt: '2026-01-01', ...overrides }),
    getProfile: async () => ({ id, role: 'editor', approvedAt: '2026-01-02' }),
  }
}

describe('authorization', () => {
  it('loads an approved role from the profile after verifying the user', async () => {
    expect(await requireUser(source())).toEqual({ id, role: 'editor', approvedAt: '2026-01-02' })
  })
  it('rejects unauthenticated and unverified users', async () => {
    const anonymous = { ...source(), getUser: async () => null }
    expect(await optionalUser(anonymous)).toBeNull()
    await expect(requireUser(anonymous)).rejects.toMatchObject({ status: 401 })
    await expect(requireUser(source({ emailConfirmedAt: null }))).rejects.toMatchObject({
      status: 403,
    })
  })
  it.each([
    null,
    { id, role: 'owner', approvedAt: '2026-01-02' },
    { id, role: 'editor', approvedAt: null },
    { id: 'another-user', role: 'admin', approvedAt: '2026-01-02' },
  ])('fails closed for missing or inconsistent profile %j', async (profile) => {
    await expect(
      requireUser({ ...source(), getProfile: async () => profile }),
    ).rejects.toMatchObject({ status: 403 })
  })
  it('does not turn an auth provider failure into anonymous access', async () => {
    await expect(
      optionalUser({
        ...source(),
        getUser: async () => {
          throw new Error('offline')
        },
      }),
    ).rejects.toThrow('offline')
  })
  it('enforces the approval boundary independently in services', () => {
    expect(() => requireRole({ id, role: 'admin', approvedAt: null }, 'member')).toThrow()
    expect(() => requireRole(null, 'member')).toThrow()
    expect(() => requireRole({ id, role: 'editor', approvedAt: '2026-01-01' }, 'admin')).toThrow()
  })
})
