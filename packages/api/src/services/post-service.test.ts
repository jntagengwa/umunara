import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PostRow } from '@umunara/database'
import { PostService } from './post-service'
import { serverActionCache, routeCache, backgroundCache } from '../cache/invalidation'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ updateTag: vi.fn(), revalidateTag: vi.fn() }))
import { updateTag, revalidateTag } from 'next/cache'

const editor = {
  id: '11111111-1111-4111-8111-111111111111',
  role: 'editor',
  approvedAt: '2026-01-01',
} as const
const draft: PostRow = {
  id: '22222222-2222-4222-8222-222222222222',
  title: 'Welcome',
  slug: 'welcome',
  content: 'Hello',
  excerpt: null,
  author_id: editor.id,
  category_id: null,
  status: 'draft',
  visibility: 'public',
  published_at: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
}

function setup(cache = serverActionCache) {
  let row = { ...draft }
  const repository = {
    getById: vi.fn(async (): Promise<PostRow | null> => row),
    create: vi.fn(async () => row),
    update: vi.fn(async (_id: string, patch: Partial<PostRow>) => (row = { ...row, ...patch })),
    remove: vi.fn(async () => row),
    list: vi.fn(async () => ({ data: [row], total: 1, page: 1, pageSize: 25 })),
  }
  const audit = { write: vi.fn(async () => undefined) }
  return { service: new PostService(repository, audit, cache), repository, audit }
}

describe('PostService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('publishes a draft and expires only the public list and its slug for a Server Action', async () => {
    const { service, audit } = setup()
    const result = await service.publish(editor, draft.id)
    expect(result.status).toBe('published')
    expect(result.publishedAt).toEqual(expect.any(String))
    expect(updateTag).toHaveBeenCalledWith('posts:public')
    expect(updateTag).toHaveBeenCalledWith('post:welcome')
    expect(updateTag).toHaveBeenCalledTimes(2)
    expect(audit.write).toHaveBeenCalledWith(editor, 'publish', 'post', draft.id)
  })

  it('rejects members before writes or cache invalidation', async () => {
    const { service, repository, audit } = setup()
    await expect(service.publish({ ...editor, role: 'member' }, draft.id)).rejects.toMatchObject({
      status: 403,
    })
    expect(repository.update).not.toHaveBeenCalled()
    expect(audit.write).not.toHaveBeenCalled()
    expect(updateTag).not.toHaveBeenCalled()
  })

  it('invalidates the old and new slug and visibility after moving published content', async () => {
    const { service } = setup()
    await service.publish(editor, draft.id)
    vi.clearAllMocks()
    await service.update(editor, draft.id, { slug: 'new-slug', visibility: 'member' })
    expect(vi.mocked(updateTag).mock.calls.flat().sort()).toEqual([
      'post:new-slug',
      'post:welcome',
      'posts:member',
      'posts:public',
    ])
  })

  it('uses immediate route expiration without calling the Server Action API', async () => {
    await setup(routeCache).service.publish(editor, draft.id)
    expect(updateTag).not.toHaveBeenCalled()
    expect(revalidateTag).toHaveBeenCalledWith('posts:public', { expire: 0 })
  })

  it('marks published content stale for background refresh', async () => {
    await setup(backgroundCache).service.publish(editor, draft.id)
    expect(revalidateTag).toHaveBeenCalledWith('posts:public', 'max')
    expect(updateTag).not.toHaveBeenCalled()
  })

  it('expires changed data but surfaces an audit failure after the write', async () => {
    const { service, audit } = setup()
    audit.write.mockRejectedValueOnce(new Error('Audit unavailable'))
    await expect(service.publish(editor, draft.id)).rejects.toThrow('Audit unavailable')
    expect(updateTag).toHaveBeenCalledWith('posts:public')
  })

  it('rejects invalid input and missing posts without mutation', async () => {
    const { service, repository } = setup()
    await expect(service.update(editor, draft.id, { title: '' })).rejects.toThrow()
    expect(repository.update).not.toHaveBeenCalled()
    repository.getById.mockResolvedValueOnce(null)
    await expect(service.publish(editor, draft.id)).rejects.toMatchObject({ status: 404 })
  })
})
