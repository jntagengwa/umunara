import { expect, it, vi } from 'vitest'
import { PublicSiteContentService } from './public-site-content'
import { SiteSettingsService } from './site-settings-service'
vi.mock('server-only', () => ({}))

it('projects only valid home hero fields and uses original copy when the row is absent', async () => {
  const reader = { getHomeHero: vi.fn().mockResolvedValue(null) }
  const service = new PublicSiteContentService(reader)
  expect(await service.getHomeHero()).toEqual({
    heading: 'Welcome To Umunara, Inc',
    introduction: 'We are glad you took some time out of your busy schedule to check on us.',
  })
  reader.getHomeHero.mockResolvedValue({ heading: 'Prayer', introduction: 'Welcome' })
  expect(await service.getHomeHero()).toEqual({ heading: 'Prayer', introduction: 'Welcome' })
  reader.getHomeHero.mockResolvedValue({
    heading: 'Prayer',
    introduction: 'Welcome',
    secret: 'hidden',
  })
  await expect(service.getHomeHero()).rejects.toThrow()
})

it('validates fixed home-hero writes before persistence and invalidates only that setting', async () => {
  const store = {
    getByKey: vi.fn(),
    upsert: vi.fn().mockResolvedValue({
      id: 'id',
      key: 'home-hero',
      value: { heading: 'Prayer', introduction: 'Welcome' },
    }),
  }
  const cache = { invalidate: vi.fn() }
  const service = new SiteSettingsService(store, { write: vi.fn() }, cache)
  const actor = { id: 'id', role: 'editor' as const, approvedAt: '2026-01-01' }
  await expect(service.update(actor, 'home-hero', { value: { heading: '' } })).rejects.toThrow()
  expect(store.upsert).not.toHaveBeenCalled()
  await service.update(actor, 'home-hero', {
    value: { heading: 'Prayer', introduction: 'Welcome' },
  })
  expect(cache.invalidate).toHaveBeenCalledExactlyOnceWith(['site-settings:home-hero'])
})
