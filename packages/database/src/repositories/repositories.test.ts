import { describe, expect, it, vi } from 'vitest'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, PostRow, ProfileRow, SiteSettingRow } from '../database.types'
import { ContentRepository } from './content-repository'
import { ProfileRepository } from './profile-repository'
import { SiteSettingsRepository } from './site-settings-repository'

function createListClient<T>(response: { count: number | null; data: T[] | null; error: null | { message: string } }) {
  const range = vi.fn().mockResolvedValue(response)
  const query = {
    order: vi.fn(),
    range,
  }
  query.order.mockReturnValue(query)
  const select = vi.fn().mockReturnValue(query)
  const from = vi.fn().mockReturnValue({ select })

  return {
    client: { from } as unknown as SupabaseClient<Database>,
    from,
    range,
  }
}

function createSingleClient<T>(response: { data: T | null; error: null | { message: string } }) {
  const maybeSingle = vi.fn().mockResolvedValue(response)
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })

  return {
    client: { from } as unknown as SupabaseClient<Database>,
    eq,
  }
}

describe('database repositories', () => {
  it('loads a profile by its user ID', async () => {
    const profile: ProfileRow = {
      approved_at: null,
      avatar_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
      email: 'member@example.com',
      full_name: null,
      id: 'user-id',
      role: 'pending',
      updated_at: '2026-01-01T00:00:00.000Z',
    }
    const { client, eq } = createSingleClient({ data: profile, error: null })

    await expect(new ProfileRepository(client).getById('user-id')).resolves.toEqual(profile)
    expect(eq).toHaveBeenCalledWith('id', 'user-id')
  })

  it('uses a stable range for paginated posts', async () => {
    const post: PostRow = {
      author_id: 'author-id',
      category_id: null,
      content: '',
      created_at: '2026-01-01T00:00:00.000Z',
      excerpt: null,
      id: 'post-id',
      published_at: null,
      slug: 'post',
      status: 'draft',
      title: 'Post',
      updated_at: '2026-01-01T00:00:00.000Z',
      visibility: 'public',
    }
    const { client, from, range } = createListClient({ count: 5, data: [post], error: null })

    await expect(new ContentRepository(client).listPosts({ page: 2, pageSize: 2 })).resolves.toEqual({
      data: [post],
      page: 2,
      pageSize: 2,
      total: 5,
    })
    expect(from).toHaveBeenCalledWith('posts')
    expect(range).toHaveBeenCalledWith(2, 3)
  })

  it('returns an empty page when a settings query has no rows', async () => {
    const { client } = createListClient<SiteSettingRow>({ count: null, data: null, error: null })

    await expect(new SiteSettingsRepository(client).list({ page: 1, pageSize: 25 })).resolves.toEqual({
      data: [],
      page: 1,
      pageSize: 25,
      total: 0,
    })
  })

  it('throws the Supabase error message for failed repository queries', async () => {
    const { client } = createSingleClient<ProfileRow>({
      data: null,
      error: { message: 'permission denied' },
    })

    await expect(new ProfileRepository(client).getById('user-id')).rejects.toThrow('Unable to load profile: permission denied')
  })
})
