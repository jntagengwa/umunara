# Umunara Core Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Create React App frontend and missing legacy API with a one-project Vercel Next.js monorepo that provides secure public, member, editor, and admin content features backed by Supabase.

**Architecture:** `apps/web` is the sole deployable Next.js App Router application and hosts `/api/v1` route handlers. Workspace packages isolate API services, Supabase repositories, DTO validation, and shared UI. Server-rendered data is tag-cached; Zustand owns only browser UI state.

**Tech Stack:** npm workspaces, Next.js App Router, React, strict TypeScript, Supabase Auth/Postgres/Storage, Zod, Zustand, Vitest, Playwright, pgTAP.

**Spec:** `docs/superpowers/specs/2026-09-05-umunara-platform-design.md`

## Global Constraints

- Deploy exactly one Next.js application and one domain from `apps/web` on Vercel.
- Preserve all existing uncommitted visual redesign assets and copy while moving the legacy CRA source.
- Browsers call only `/api/v1`; only `packages/database` accesses application tables in Supabase.
- Keep Supabase service-role credentials and all provider secrets server-only.
- Enforce `pending`, `member`, `editor`, and `admin` roles at the API boundary and by RLS.
- Use tagged server caching for database state and Zustand only for client-owned UI state.
- All admin tables must use server-side pagination, filtering, and sorting.
- Use explicit grants and RLS policies with allow and deny tests for every role.

---

## Locked File Structure

| Path | Responsibility |
| --- | --- |
| `apps/web/app` | App Router layouts, pages, route handlers, loading/error boundaries. |
| `apps/web/features/*` | Page-specific client components and Zustand UI stores. |
| `packages/schemas/src` | Zod DTOs, shared response types, role constants. |
| `packages/database/src` | Browser/server Supabase clients, generated DB types, repositories. |
| `packages/api/src` | Authorization, domain services, tag names, route-handler adapters. |
| `packages/ui/src` | Reusable accessible presentation components. |
| `supabase/migrations` | Tables, grants, RLS policies, indexes, and triggers. |
| `supabase/tests` | pgTAP authorization and policy tests. |

### Task 1: Establish the one-app npm workspace and preserve the current site

**Files:**
- Modify: `package.json`, `.gitignore`, `README.md`
- Create: `apps/web/package.json`, `apps/web/next.config.ts`, `apps/web/tsconfig.json`, `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`, `apps/web/app/globals.css`, `apps/web/vitest.config.ts`, `apps/web/tests/smoke.test.tsx`, `packages/config/package.json`, `packages/config/tsconfig.base.json`
- Move: `src/**` and `public/**` into `apps/web/legacy/**` and `apps/web/public/**` only after the new route shell renders the legacy home-page design.

**Interfaces:**
- Produces workspace scripts: `npm run dev`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
- Produces `@umunara/web` as the single Vercel root directory.

- [ ] **Step 1: Write the failing application smoke test**

```tsx
// apps/web/tests/smoke.test.tsx
import { render, screen } from '@testing-library/react'
import HomePage from '../app/page'

it('renders the Umunara home page', async () => {
  render(await HomePage())
  expect(screen.getByRole('main')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the test to prove the Next.js shell is absent**

Run: `npm test --workspace @umunara/web -- smoke.test.tsx`

Expected: FAIL because `apps/web/app/page.tsx` does not exist.

- [ ] **Step 3: Add npm workspace configuration and the minimal App Router shell**

```json
{
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "npm run dev --workspace @umunara/web",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "build": "npm run build --workspace @umunara/web"
  }
}
```

```tsx
// apps/web/app/page.tsx
export default async function HomePage() {
  return <main aria-label="Umunara home" />
}
```

Move existing assets and redesign components incrementally into `apps/web`; do
not delete a legacy asset until its imported Next.js replacement has been
verified in the browser.

- [ ] **Step 4: Run workspace checks**

Run: `npm test --workspace @umunara/web -- smoke.test.tsx && npm run typecheck && npm run build`

Expected: PASS; Vercel can use `apps/web` as its root directory.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore README.md apps/web packages/config
git commit -m "feat: establish Next.js workspace"
```

### Task 2: Define shared contracts and Supabase clients

**Files:**
- Create: `packages/schemas/package.json`, `packages/schemas/src/roles.ts`, `packages/schemas/src/content.ts`, `packages/schemas/src/pagination.ts`, `packages/schemas/src/index.ts`, `packages/schemas/src/roles.test.ts`, `packages/database/package.json`, `packages/database/src/client.ts`, `packages/database/src/server.ts`, `packages/database/src/admin.ts`, `packages/database/src/database.types.ts`, `packages/database/src/index.ts`
- Modify: `apps/web/.env.example`, `apps/web/tsconfig.json`

**Interfaces:**
- Produces `Role`, `roleSchema`, `requireRole`, `pageQuerySchema`, and typed content DTOs.
- Produces `createBrowserClient()`, `createServerClient()`, and `createAdminClient()`.

- [ ] **Step 1: Write failing role and pagination contract tests**

```ts
import { pageQuerySchema, roleSchema } from './index'

it('accepts a bounded table query and rejects an unknown role', () => {
  expect(pageQuerySchema.parse({ page: '2', pageSize: '25' })).toEqual({ page: 2, pageSize: 25 })
  expect(() => roleSchema.parse('owner')).toThrow()
})
```

- [ ] **Step 2: Run the contract test**

Run: `npm test --workspace @umunara/schemas -- roles.test.ts`

Expected: FAIL because the contracts do not exist.

- [ ] **Step 3: Implement exact shared contracts and client separation**

```ts
export const roleSchema = z.enum(['pending', 'member', 'editor', 'admin'])
export type Role = z.infer<typeof roleSchema>

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})
```

`createAdminClient()` must throw when invoked in browser code and read only
`SUPABASE_SERVICE_ROLE_KEY`; only `NEXT_PUBLIC_SUPABASE_URL` and the public key
may appear in browser bundles. Add every environment variable name, without its
value, to `.env.example`.

- [ ] **Step 4: Run contract and type checks**

Run: `npm test --workspace @umunara/schemas -- roles.test.ts && npm run typecheck`

Expected: PASS with no secret imported by browser modules.

- [ ] **Step 5: Commit**

```bash
git add apps/web/.env.example packages/schemas packages/database
git commit -m "feat: add shared contracts and Supabase clients"
```

### Task 3: Create the core Supabase schema, profiles, and RLS tests

**Files:**
- Create: `supabase/config.toml`, `supabase/migrations/<timestamp>_core_platform.sql`, `supabase/seed.sql`, `supabase/tests/core_rls.test.sql`, `packages/database/src/repositories/profile-repository.ts`, `packages/database/src/repositories/content-repository.ts`, `packages/database/src/repositories/site-settings-repository.ts`
- Modify: `packages/database/src/index.ts`

**Interfaces:**
- Produces tables `profiles`, `categories`, `posts`, `events`, `event_registrations`, `media_assets`, `resources`, `site_settings`, and `audit_log`.
- Produces `ProfileRepository.getById(userId)` and paginated content repository methods.

- [ ] **Step 1: Write failing pgTAP policy tests**

```sql
select plan(4);
select tests.create_supabase_user('pending@example.com');
select tests.authenticate_as('pending@example.com');
select throws_ok(
  $$ insert into public.posts (title, slug, visibility, status) values ('No', 'no', 'public', 'published') $$,
  '42501',
  'pending users cannot publish posts'
);
select finish();
```

- [ ] **Step 2: Run the policy test**

Run: `supabase test db --local`

Expected: FAIL because the schema and policies are absent.

- [ ] **Step 3: Create the migration from the Supabase CLI and implement policies**

Run: `supabase migration new core_platform`

Use that generated migration file to create UUID primary keys, `created_at` and
`updated_at` timestamps, foreign keys, status/visibility check constraints, and
indexes for `posts(status, visibility, published_at desc)`,
`events(status, visibility, starts_at)`, and paginated admin list queries.
Enable RLS and explicitly revoke broad default grants. Add policies that allow
public reads only of published public content; allow approved members to read
member content; allow editors to manage content; and allow admins to manage
profiles/settings/audit data. Add a trigger that creates a pending `profiles`
row for each new Auth user.

- [ ] **Step 4: Run database and repository tests**

Run: `supabase test db --local && npm test --workspace @umunara/database`

Expected: PASS for anonymous, pending, member, editor, and admin allow/deny cases.

- [ ] **Step 5: Commit**

```bash
git add supabase packages/database/src/repositories
git commit -m "feat: add core content schema and RLS"
```

### Task 4: Build authorization, services, and cache-aware API routes

**Files:**
- Create: `packages/api/package.json`, `packages/api/src/auth/require-user.ts`, `packages/api/src/auth/require-role.ts`, `packages/api/src/cache/tags.ts`, `packages/api/src/services/post-service.ts`, `packages/api/src/services/event-service.ts`, `packages/api/src/services/site-settings-service.ts`, `packages/api/src/services/member-service.ts`, `packages/api/src/services/audit-service.ts`, `packages/api/src/index.ts`, `packages/api/src/services/post-service.test.ts`, `apps/web/app/api/v1/posts/route.ts`, `apps/web/app/api/v1/posts/[id]/route.ts`, `apps/web/app/api/v1/events/route.ts`, `apps/web/app/api/v1/site-settings/[key]/route.ts`

**Interfaces:**
- Produces `cacheTags.posts(scope)`, `cacheTags.post(slug)`, `cacheTags.events(scope)`, and `cacheTags.siteSettings(surface)`.
- Produces `PostService.create(actor, input)`, `update`, `remove`, `publish`; each returns a typed post DTO.

- [ ] **Step 1: Write a failing cache invalidation unit test**

```ts
it('invalidates only public post tags when an editor publishes a post', async () => {
  await postService.publish(editorActor, draftPost.id)
  expect(updateTag).toHaveBeenCalledWith('posts:public')
  expect(updateTag).toHaveBeenCalledWith(`post:${draftPost.slug}`)
  expect(updateTag).not.toHaveBeenCalledWith('events:public')
})
```

- [ ] **Step 2: Run the service test**

Run: `npm test --workspace @umunara/api -- post-service.test.ts`

Expected: FAIL because the service and tags are absent.

- [ ] **Step 3: Implement thin handlers and domain-level cache invalidation**

```ts
export const cacheTags = {
  posts: (scope: 'public' | 'member') => `posts:${scope}`,
  post: (slug: string) => `post:${slug}`,
  events: (scope: 'public' | 'member') => `events:${scope}`,
  siteSettings: (surface: string) => `site-settings:${surface}`,
} as const
```

Handlers must parse Zod inputs, call a service, and return JSON; they must not
contain SQL or role branching. Services call `updateTag` for read-your-writes
mutations and `revalidateTag(tag, 'max')` for non-interactive published-content
refreshes. Every admin mutation writes an audit entry.

- [ ] **Step 4: Run unit and API integration tests**

Run: `npm test --workspace @umunara/api && npm test --workspace @umunara/web -- api`

Expected: PASS for role rejection, validation rejection, success, pagination,
and narrow cache invalidation.

- [ ] **Step 5: Commit**

```bash
git add packages/api apps/web/app/api
git commit -m "feat: add cache-aware content API"
```

### Task 5: Migrate public pages and add the fixed-content admin CMS

**Files:**
- Create: `apps/web/app/(public)/layout.tsx`, `apps/web/app/(public)/page.tsx`, `apps/web/app/(public)/blog/page.tsx`, `apps/web/app/(public)/events/page.tsx`, `apps/web/app/(public)/give/page.tsx`, `apps/web/app/(member)/member/page.tsx`, `apps/web/app/(admin)/admin/page.tsx`, `apps/web/app/(admin)/admin/content/page.tsx`, `apps/web/features/site-content/site-content-form.tsx`, `apps/web/features/site-content/site-content-store.ts`, `apps/web/features/site-content/site-content-form.test.tsx`, `apps/web/app/loading.tsx`, `apps/web/app/error.tsx`, `apps/web/app/not-found.tsx`
- Modify: migrated legacy home/blog/events/navigation/footer components and styles under `apps/web`.

**Interfaces:**
- Consumes cached read services for public/member content and `/api/v1/site-settings/<key>` for administrative mutation.
- Produces typed `SiteContentForm` with fields selected from named settings only; no arbitrary section/reordering controls.

- [ ] **Step 1: Write a failing form behavior test**

```tsx
it('updates the home hero and leaves unrelated admin table data untouched', async () => {
  render(<SiteContentForm initialValue={heroSetting} />)
  await userEvent.type(screen.getByLabelText('Hero heading'), 'Prayer for every nation')
  await userEvent.click(screen.getByRole('button', { name: 'Save home content' }))
  expect(mockFetch).toHaveBeenCalledWith('/api/v1/site-settings/home-hero', expect.any(Object))
  expect(queryClient.invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ['events'] })
})
```

- [ ] **Step 2: Run the UI test**

Run: `npm test --workspace @umunara/web -- site-content-form.test.tsx`

Expected: FAIL because the route and form do not exist.

- [ ] **Step 3: Implement cached pages, protected route groups, and a small Zustand store**

Use Server Components for page reads. Wrap each data service in the Next cache
mechanism with the tag names from Task 4. Use a Zustand store only for drawer
state, selected filters, page size, and optimistic submit state:

```ts
type ContentUiState = {
  selectedCategory: string | null
  setSelectedCategory: (value: string | null) => void
}
```

Do not place `Post[]`, `Event[]`, or settings rows in Zustand. Preserve the
current redesign's imagery, typography, responsive behavior, alt text, and
navigation while moving its pages to App Router routes.

- [ ] **Step 4: Run UI, accessibility, and build checks**

Run: `npm test --workspace @umunara/web && npm run build && npx playwright test --project=chromium`

Expected: PASS for public page rendering, admin role gates, responsive navigation,
and CMS save feedback.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat: migrate public pages and admin content CMS"
```

### Task 6: Add member approval, private resources, and event registration

**Files:**
- Create: `packages/api/src/services/membership-service.ts`, `packages/api/src/services/resource-service.ts`, `packages/api/src/services/event-registration-service.ts`, `packages/api/src/services/membership-service.test.ts`, `apps/web/app/api/v1/admin/members/[id]/approve/route.ts`, `apps/web/app/api/v1/resources/[id]/download/route.ts`, `apps/web/app/api/v1/events/[id]/registrations/route.ts`, `apps/web/app/(admin)/admin/members/page.tsx`, `apps/web/app/(member)/member/resources/page.tsx`, `apps/web/app/(member)/member/events/page.tsx`, `apps/web/e2e/member-access.spec.ts`
- Modify: `supabase/migrations/<timestamp>_core_platform.sql`, `supabase/tests/core_rls.test.sql`

**Interfaces:**
- Produces `MembershipService.approve(admin, profileId): Promise<ProfileDto>`.
- Produces `ResourceService.createDownloadUrl(actor, resourceId): Promise<{ url: string; expiresAt: string }>`.
- Produces `EventRegistrationService.register(member, eventId): Promise<EventRegistrationDto>`.

- [ ] **Step 1: Write failing approval and private-resource tests**

```ts
it('refuses a pending user but gives an approved member a signed resource URL', async () => {
  await expect(resourceService.createDownloadUrl(pendingActor, resource.id)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  await expect(resourceService.createDownloadUrl(memberActor, resource.id)).resolves.toMatchObject({ url: expect.stringContaining('token=') })
})
```

- [ ] **Step 2: Run the service and end-to-end tests**

Run: `npm test --workspace @umunara/api -- membership-service.test.ts && npx playwright test apps/web/e2e/member-access.spec.ts`

Expected: FAIL because approval and private content handlers do not exist.

- [ ] **Step 3: Implement approval and signed URL flows**

`MembershipService.approve` must require `admin`, update the profile role from
`pending` to `member`, write an audit row, and invalidate the target profile's
authorization/session view. The download route must require a member or higher,
verify resource visibility, generate a short-lived private-bucket URL, and set
`Cache-Control: no-store`. Event registration must enforce visibility and capacity
inside a transaction.

- [ ] **Step 4: Run full core verification**

Run: `supabase test db --local && npm run typecheck && npm run lint && npm test && npm run build && npx playwright test`

Expected: PASS; pending users cannot access member content, and approved members
can register for member-only events.

- [ ] **Step 5: Commit**

```bash
git add supabase packages/api apps/web
git commit -m "feat: add approved member access"
```
