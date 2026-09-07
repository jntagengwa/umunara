# Task 6 — Approved member access

Status: implemented and verified in the isolated monorepo worktree.

## Changes

- Added `MembershipService.approve(admin, profileId): Promise<ProfileDto>`. Approval requires an approved admin and uses a conditional `pending` update, so a stale approval request cannot overwrite an existing member/editor/admin role. It writes an audit row and invalidates `profile:<id>` in `finally`, including when audit persistence fails after the saved change.
- Existing authentication/profile reads remain request-scoped. New requests read the current profile rather than trusting a stale role in session claims. The browser test proves an unchanged pending session gains access after approval; pgTAP proves revocation removes storage access immediately for new requests.
- Added `ResourceService.createDownloadUrl`. Only approved members or higher can request published resources. URLs use the authenticated Storage client, the private `resources` bucket, a 60-second lifetime, and attachment downloads. Resource list DTOs omit storage paths. API success and error responses use `Cache-Control: private, no-store`; download links are created on demand and removed from the UI at expiry.
- Added `EventRegistrationService.register` and the typed `register_for_event` database RPC. The public RPC is security-invoker and derives profile identity from `auth.uid()`. A private security-definer trigger checks membership/publication and locks the event row before counting registrations, covering RPC calls and direct inserts/updates. Duplicate registration is idempotent; zero/full capacity produces a conflict.
- Added admin approval, member resources, and member event pages; navigation links; paginated lists; reusable mutation controls; download controls; pending/error/success/empty feedback.
- Added migration `20260907205752_approved_member_access.sql`. Neither earlier migration was edited. No payment/bank work or dependencies were added.

## Files

- `packages/api/src/services/{membership-service,resource-service,event-registration-service}.ts`, service tests, context, exports, and profile cache tag.
- `packages/database/src/repositories/{profile-repository,resource-repository,event-registration-repository}.ts`, repository exports, database RPC type, and registration row export.
- `packages/schemas/src/membership.ts` and schema exports.
- `apps/web/app/api/v1/admin/members/[id]/approve/route.ts`, `resources/[id]/download/route.ts`, `events/[id]/registrations/route.ts`, HTTP response headers, and member API integration tests.
- `apps/web/app/(admin)/admin/members/page.tsx`, both member pages, member/admin layouts, reusable action/download components, component tests, and response error helper.
- `apps/web/e2e/member-access.spec.ts`, shared session fixture, Supabase fixture, and the existing E2E suite's shared-fixture import.
- `supabase/migrations/20260907205752_approved_member_access.sql`, `supabase/tests/core_rls.test.sql`, and `scripts/test-event-capacity.mjs`.

## Verification

JS checks used Node 22.22.1 via `PATH=/Users/JeanFidele/.nvm/versions/node/v22.22.1/bin:$PATH`.

- TDD red evidence: the focused service and route tests failed because their implementations were absent; the browser test failed with the missing download route's 404 instead of 403; new SQL tests failed on the absent registration RPC/private bucket and the existing capacity bypass. Implementations were added after these failures.
- `npm run typecheck` — passed across all workspaces.
- `npm run lint` — passed.
- `npm test` — passed: 33 web, 30 API, 4 database, 2 schema tests (69 total).
- `npm run build` — passed; all new member/admin/API routes appear in the production build.
- `npx playwright test` — passed, 4 tests. Includes the end-to-end approval/download/registration flow and accessibility checks for approvals/resources, plus existing public/CMS regressions.
- Cached Prettier `--check --no-semi --single-quote --print-width 100` — passed for changed TS/TSX/MJS files other than `database.types.ts`, whose original surrounding formatting was preserved and whose new RPC type was manually reviewed. `git diff --check` passed.
- `node --check scripts/test-event-capacity.mjs` — passed.

Database verification used only `/private/tmp/umunara-core-platform-task3.Lch2gq`, the pre-existing isolated test stack. The user's normal local stack was not changed.

```sh
npx --yes supabase test db --local --workdir /private/tmp/umunara-core-platform-task3.Lch2gq '/Users/JeanFidele/The Nexus Ecosystem/Projects/umunara/.worktrees/umunara-next-monorepo/supabase/tests/core_rls.test.sql'
npx --yes supabase db lint --local --schema public,private --fail-on warning --workdir /private/tmp/umunara-core-platform-task3.Lch2gq
npx --yes supabase db advisors --local --type security --level warn --fail-on error --workdir /private/tmp/umunara-core-platform-task3.Lch2gq
node scripts/test-event-capacity.mjs postgresql://postgres:postgres@127.0.0.1:55322/postgres
```

- pgTAP: 43 checks passed. Database lint and security advisors reported no issues.
- Concurrency test: observed the second PostgreSQL session waiting on a lock held by the first; after the first commits, the second gets the capacity error; exactly one registration persists. Temporary records are cleaned up.
- Additional real Supabase smoke verification: created temporary confirmed user/event/resource, registered using the authenticated RPC, confirmed its composite JSON result shape, uploaded a private test file, created a 60-second signed URL, and downloaded the expected bytes. Temporary user/event/resource/file were removed.

## Review and limits

- Reopened/reviewed all changed files for imports, types, authorization boundaries, publication checks, SQL privileges, cache behavior, and UI feedback. Business logic stays in focused services/repositories; routes and pages remain thin. Karpathy guidelines guided the additive migration and preservation of the existing authorization/audit architecture.
- The existing generic Task 4 `MemberService` remains available for role management. The new approval route exclusively uses the conditional `MembershipService` operation.
- Apply the additive migration before deploying these routes. Resource object names must match `public.resources.storage_path` in the private `resources` bucket. A resource upload/admin editor is outside Task 6.
- Previously issued bearer download URLs remain usable until their 60-second expiry; approval revocation blocks new signing immediately. This is normal signed-URL behavior.
- All requested check categories ran. Browser tests use the external-service fixture; pgTAP, contention testing, and the additional Storage/RPC smoke test exercised the real isolated Supabase stack. No remote deployment was performed.
- Existing toolchain warnings remain (Vite CJS deprecation, Node `punycode`, Playwright color environment); checks exited successfully.
