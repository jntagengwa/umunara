import { expectTypeOf } from 'vitest'
import type { z } from 'zod'
import type {
  contentQuerySchema,
  eventCreateSchema,
  postCreateSchema,
  postUpdateSchema,
  roleSchema,
  siteSettingUpdateSchema,
} from '@umunara/schemas'
import type { EventService } from './event-service'
import type { MemberService } from './member-service'
import type { PostService } from './post-service'
import type { SiteSettingsService } from './site-settings-service'

// Compiled by the API workspace typecheck; these assertions catch signatures widened to unknown.
type PostCreate = Parameters<PostService['create']>[1]
type PostUpdate = Parameters<PostService['update']>[2]
type EventCreate = Parameters<EventService['create']>[1]
type SettingUpdate = Parameters<SiteSettingsService['update']>[2]
type MemberRole = Parameters<MemberService['setRole']>[2]
type PostQuery = Parameters<PostService['list']>[1]
type EventQuery = Parameters<EventService['list']>[1]

expectTypeOf<PostCreate>().toEqualTypeOf<z.input<typeof postCreateSchema>>()
expectTypeOf<PostUpdate>().toEqualTypeOf<z.input<typeof postUpdateSchema>>()
expectTypeOf<EventCreate>().toEqualTypeOf<z.input<typeof eventCreateSchema>>()
expectTypeOf<SettingUpdate>().toEqualTypeOf<z.input<typeof siteSettingUpdateSchema>>()
expectTypeOf<MemberRole>().toEqualTypeOf<z.input<typeof roleSchema>>()
expectTypeOf<PostQuery>().toEqualTypeOf<z.input<typeof contentQuerySchema>>()
expectTypeOf<EventQuery>().toEqualTypeOf<z.input<typeof contentQuerySchema>>()

// Defaults stay optional for callers, even though parsed repository inputs are complete.
expectTypeOf<{ title: string; slug: string }>().toMatchTypeOf<PostCreate>()
expectTypeOf<{ title: string; startsAt: string }>().toMatchTypeOf<EventCreate>()
expectTypeOf<{}>().toMatchTypeOf<PostQuery>()
expectTypeOf<{}>().toMatchTypeOf<EventQuery>()

// Malformed service arguments must not be assignable, without suppressing compiler errors.
expectTypeOf<
  { title: number; slug: string } extends PostCreate ? true : false
>().toEqualTypeOf<false>()
expectTypeOf<{ visibility: 'staff' } extends PostUpdate ? true : false>().toEqualTypeOf<false>()
expectTypeOf<{ title: string } extends EventCreate ? true : false>().toEqualTypeOf<false>()
expectTypeOf<{ value: undefined } extends SettingUpdate ? true : false>().toEqualTypeOf<false>()
expectTypeOf<'owner' extends MemberRole ? true : false>().toEqualTypeOf<false>()
expectTypeOf<{ scope: 'staff' } extends PostQuery ? true : false>().toEqualTypeOf<false>()
expectTypeOf<{ pageSize: string } extends EventQuery ? true : false>().toEqualTypeOf<false>()
