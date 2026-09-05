import 'server-only'
import { createServerClient } from '@umunara/database/server'
import {
  AuthRepository,
  AuditRepository,
  PostRepository,
  EventRepository,
} from '@umunara/database/repositories'
import { ProfileRepository, SiteSettingsRepository } from '@umunara/database'
import { AuditService } from './services/audit-service'
import { PostService } from './services/post-service'
import { EventService } from './services/event-service'
import { SiteSettingsService } from './services/site-settings-service'
import { MemberService } from './services/member-service'
import type { CacheInvalidator } from './cache/invalidation'

export interface ServiceContext {
  auth: AuthRepository
  posts: PostService
  events: EventService
  siteSettings: SiteSettingsService
  members: MemberService
}

export async function createServiceContext(cache: CacheInvalidator): Promise<ServiceContext> {
  const client = await createServerClient()
  const audit = new AuditService(new AuditRepository())
  return {
    auth: new AuthRepository(client),
    posts: new PostService(new PostRepository(client), audit, cache),
    events: new EventService(new EventRepository(client), audit, cache),
    siteSettings: new SiteSettingsService(new SiteSettingsRepository(client), audit, cache),
    members: new MemberService(new ProfileRepository(client), audit),
  }
}
