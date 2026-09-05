import { describe, expect, it, vi } from 'vitest'
import { EventService } from './event-service'
import { SiteSettingsService } from './site-settings-service'
import { MemberService } from './member-service'

vi.mock('server-only', () => ({}))
const actor = {
  id: '11111111-1111-4111-8111-111111111111',
  role: 'editor',
  approvedAt: '2026-01-01',
} as const
const cache = { invalidate: vi.fn() }
const audit = { write: vi.fn(async () => undefined) }

describe('domain mutations', () => {
  it('accepts zero capacity as a valid closed event', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(async (input) => ({ ...input, id: actor.id })),
    }
    const service = new EventService(repository, audit, cache)
    const event = await service.create(actor, {
      title: 'Closed',
      startsAt: '2026-09-06T10:00:00Z',
      capacity: 0,
    })
    expect(event.capacity).toBe(0)
  })
  it('validates event dates, publishes with author, and only invalidates events', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(async (input) => ({ ...input, id: actor.id })),
    }
    const service = new EventService(repository, audit, cache)
    await expect(
      service.create(actor, {
        title: 'Gathering',
        startsAt: '2026-09-06T10:00:00Z',
        endsAt: '2026-09-05T10:00:00Z',
      }),
    ).rejects.toThrow()
    expect(repository.create).not.toHaveBeenCalled()
    const event = await service.create(actor, {
      title: 'Gathering',
      startsAt: '2026-09-06T10:00:00Z',
      status: 'published',
    })
    expect(event.status).toBe('published')
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ author_id: actor.id, published_at: expect.any(String) }),
    )
    expect(cache.invalidate).toHaveBeenCalledWith(['events:public'])
  })
  it('allows editors to change a setting and derives the cache surface from its key', async () => {
    const repository = {
      getByKey: vi.fn(),
      upsert: vi.fn(async (key, value) => ({
        id: actor.id,
        key,
        value,
        created_at: '',
        updated_at: '',
      })),
    }
    const service = new SiteSettingsService(repository, audit, cache)
    await expect(
      service.update({ ...actor, role: 'member' }, 'home.hero', { value: 'Welcome' }),
    ).rejects.toMatchObject({ status: 403 })
    const result = await service.update(actor, 'home.hero', { value: 'Welcome' })
    expect(result).toEqual({ key: 'home.hero', value: 'Welcome' })
    expect(cache.invalidate).toHaveBeenCalledWith(['site-settings:home'])
    expect(audit.write).toHaveBeenCalledWith(actor, 'update', 'site-setting', actor.id, {
      key: 'home.hero',
    })
  })
  it('requires an admin for role changes and clears approval when returning to pending', async () => {
    const repository = {
      setRole: vi.fn(async (id, role, approvedAt) => ({ id, role, approved_at: approvedAt })),
    }
    const service = new MemberService(repository, audit)
    await expect(service.setRole(actor, actor.id, 'member')).rejects.toMatchObject({ status: 403 })
    const result = await service.setRole({ ...actor, role: 'admin' }, actor.id, 'pending')
    expect(result.approvedAt).toBeNull()
    expect(audit.write).toHaveBeenCalledWith(
      { ...actor, role: 'admin' },
      'set-role',
      'member',
      actor.id,
      { role: 'pending' },
    )
  })
})
