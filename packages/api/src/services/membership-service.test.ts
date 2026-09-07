import { describe, expect, it, vi } from 'vitest'
import type { ProfileRow, ResourceRow } from '@umunara/database'
import { MembershipService } from './membership-service'
import { ResourceService } from './resource-service'
import { EventRegistrationService } from './event-registration-service'
import { RepositoryError } from '@umunara/database/repositories'

vi.mock('server-only', () => ({}))
const id = '11111111-1111-4111-8111-111111111111'
const member = { id, role: 'member', approvedAt: '2026-09-01' } as const
const pending = { ...member, role: 'pending', approvedAt: null } as const
const admin = { ...member, role: 'admin' } as const
const profile: ProfileRow = {
  id,
  role: 'member',
  approved_at: '2026-09-07',
  email: 'member@example.test',
  full_name: 'New member',
  avatar_url: null,
  created_at: '2026-09-01',
  updated_at: '2026-09-07',
}
const resource: ResourceRow = {
  id,
  title: 'Prayer guide',
  description: null,
  storage_path: 'guides/prayer.pdf',
  status: 'published',
  visibility: 'member',
  author_id: id,
  published_at: '2026-09-01',
  created_at: '2026-09-01',
  updated_at: '2026-09-01',
}

describe('member approval', () => {
  function setup() {
    const store = { approvePending: vi.fn(async () => profile), listPending: vi.fn() }
    const audit = { write: vi.fn(async () => undefined) }
    const cache = { invalidate: vi.fn() }
    return { store, audit, cache, service: new MembershipService(store, audit, cache) }
  }

  it('restricts approval to approved admins and validates the target', async () => {
    const { service, store } = setup()
    for (const actor of [pending, member, { ...admin, approvedAt: null }]) {
      await expect(service.approve(actor, id)).rejects.toMatchObject({ status: 403 })
    }
    await expect(service.approve(admin, 'invalid')).rejects.toThrow()
    expect(store.approvePending).not.toHaveBeenCalled()
  })

  it('approves a pending profile, audits it and invalidates its authorization view', async () => {
    const { service, store, audit, cache } = setup()
    await expect(service.approve(admin, id)).resolves.toMatchObject({
      id,
      role: 'member',
      approvedAt: '2026-09-07',
      fullName: 'New member',
    })
    expect(store.approvePending).toHaveBeenCalledWith(id)
    expect(audit.write).toHaveBeenCalledWith(admin, 'approve', 'member', id)
    expect(cache.invalidate).toHaveBeenCalledWith([`profile:${id}`])
  })

  it('does not silently overwrite an already approved role', async () => {
    const store = { approvePending: async () => null, listPending: vi.fn() }
    const audit = { write: vi.fn() }
    const service = new MembershipService(store, audit, { invalidate: vi.fn() })
    await expect(service.approve(admin, id)).rejects.toMatchObject({ status: 409 })
    expect(audit.write).not.toHaveBeenCalled()
  })

  it('propagates audit failure but still invalidates after the saved approval', async () => {
    const { service, audit, cache } = setup()
    audit.write.mockRejectedValueOnce(new Error('audit unavailable'))
    await expect(service.approve(admin, id)).rejects.toThrow('audit unavailable')
    expect(cache.invalidate).toHaveBeenCalledWith([`profile:${id}`])
  })
})

describe('private downloads', () => {
  it('restricts resource listings to approved members and omits storage paths', async () => {
    const service = new ResourceService({
      getById: vi.fn(),
      sign: vi.fn(),
      list: async () => ({ data: [resource], page: 1, pageSize: 12, total: 1 }),
    })
    await expect(service.list(pending, { page: 1, pageSize: 12 })).rejects.toMatchObject({
      status: 403,
    })
    await expect(service.list(member, { page: 1, pageSize: 12 })).resolves.toEqual({
      data: [{ id, title: 'Prayer guide', description: null }],
      page: 1,
      pageSize: 12,
      total: 1,
    })
  })

  it('refuses pending users and signs a published resource for an approved member', async () => {
    const store = {
      getById: vi.fn(async () => resource),
      list: vi.fn(),
      sign: vi.fn(
        async () => 'https://storage.test/object/sign/resources/guides/prayer.pdf?token=secret',
      ),
    }
    const service = new ResourceService(store)
    await expect(service.createDownloadUrl(pending, id)).rejects.toMatchObject({ status: 403 })
    expect(store.sign).not.toHaveBeenCalled()
    const before = Date.now()
    const result = await service.createDownloadUrl(member, id)
    expect(result.url).toContain('token=')
    expect(Date.parse(result.expiresAt)).toBeGreaterThan(before)
    expect(Date.parse(result.expiresAt)).toBeLessThanOrEqual(Date.now() + 60_000)
    expect(store.sign).toHaveBeenCalledWith('guides/prayer.pdf', 60)
  })

  it('does not sign missing or draft resources, including for admins', async () => {
    const store = {
      getById: vi.fn(async (): Promise<ResourceRow | null> => null),
      list: vi.fn(),
      sign: vi.fn(),
    }
    const service = new ResourceService(store)
    await expect(service.createDownloadUrl(member, id)).rejects.toMatchObject({ status: 404 })
    store.getById.mockResolvedValue({ ...resource, status: 'draft' })
    await expect(service.createDownloadUrl(admin, id)).rejects.toMatchObject({ status: 404 })
    expect(store.sign).not.toHaveBeenCalled()
  })
})

describe('event registration', () => {
  it('requires an approved member and passes only a validated event to the transaction', async () => {
    const store = {
      register: vi.fn(async () => ({
        id,
        event_id: id,
        profile_id: member.id,
        status: 'registered' as const,
        registered_at: '2026-09-07',
        created_at: '2026-09-07',
        updated_at: '2026-09-07',
      })),
    }
    const service = new EventRegistrationService(store)
    await expect(service.register(pending, id)).rejects.toMatchObject({ status: 403 })
    await expect(service.register(member, 'bad')).rejects.toThrow()
    expect(store.register).not.toHaveBeenCalled()
    await expect(service.register(member, id)).resolves.toMatchObject({
      eventId: id,
      profileId: member.id,
      status: 'registered',
    })
    expect(store.register).toHaveBeenCalledWith(id)
  })

  it('reports full events as conflicts without leaking database errors', async () => {
    const service = new EventRegistrationService({
      register: async () => {
        throw new RepositoryError('P0001')
      },
    })
    await expect(service.register(member, id)).rejects.toMatchObject({ status: 409 })
  })
})
