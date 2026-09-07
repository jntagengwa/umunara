import 'server-only'
import { unstable_cache } from 'next/cache'
import { AuditService, PostService, EventService, cacheTags, routeCache } from '@umunara/api'
import { PublicSiteContentService } from '@umunara/api/services/public-site-content'
import { createPublicClient } from '@umunara/database/public'
import type { PaginatedResult } from '@umunara/database'
import type { PostDto } from '@umunara/schemas'
import {
  AuditRepository,
  PostRepository,
  EventRepository,
  PublicSiteContentRepository,
} from '@umunara/database/repositories'
import { requirePageRole } from './page-access'

export const readHomeHero = unstable_cache(
  () => new PublicSiteContentService(new PublicSiteContentRepository()).getHomeHero(),
  ['home-hero'],
  { tags: [cacheTags.siteSettings('home-hero')], revalidate: 3600 },
)

export const readPublicPosts = unstable_cache(
  async (page: number) => {
    const service = new PostService(
      new PostRepository(createPublicClient()),
      new AuditService(new AuditRepository()),
      routeCache,
    )
    return service.list(null, { scope: 'public', page, pageSize: 6 })
  },
  ['public-posts'],
  { tags: [cacheTags.posts('public')], revalidate: 3600 },
)

export const readPublicEvents = unstable_cache(
  async (page: number) => {
    const service = new EventService(
      new EventRepository(createPublicClient()),
      new AuditService(new AuditRepository()),
      routeCache,
    )
    return service.list(null, { scope: 'public', page, pageSize: 12 })
  },
  ['public-events'],
  { tags: [cacheTags.events('public')], revalidate: 3600 },
)

export async function readMemberPosts(page: number): Promise<PaginatedResult<PostDto>> {
  // Authentication stays outside the persistent cache, including on every cache hit.
  const { actor, services } = await requirePageRole('member')
  return unstable_cache(
    () => services.posts.list(actor, { scope: 'member', page, pageSize: 6 }),
    ['member-posts', actor.id, actor.role, actor.approvedAt ?? '', String(page)],
    { tags: [cacheTags.posts('member')], revalidate: 300 },
  )()
}
