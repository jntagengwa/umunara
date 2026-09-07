# Core final-review remediation report

Implemented on `feat/umunara-next-monorepo` in the existing isolated worktree.

## Changes and decisions

- Added password signup, sign-in, and local-session sign-out through `/api/v1/auth/*`. Thin handlers validate strict shared DTOs, preserve same-origin protections, and use a server-only session service/repository. Passwords and provider messages are not logged or returned. No dependencies were added.
- Registration preserves Supabase email confirmation. A signup without a session goes to an honest check-email page; confirmed sessions go to `/account`, which reads the current authorized profile and displays pending approval or approved access. Signup metadata does not grant roles. Full name is stored in Auth metadata; the existing profile trigger continues to copy only identity/email.
- Added the Next 16 `proxy.ts` convention and a server-only SSR refresh helper. The installed SDK's `getUser()` validates identity and renews expired sessions. Cookie changes are applied to the downstream request and returned `NextResponse`, preserving cookie attributes and avoiding shared caching of authenticated/refreshed responses. The server-component comment now names the real proxy.
- The confirmation handler supports a PKCE code exchange and email token-hash verification, with fixed local destinations, no-store responses, and no-referrer policy. README documents the Auth redirect allowlist and the cross-device confirmation email template. Production email/SMTP configuration was not changed.
- Anonymous protected-page access redirects to `/sign-in`. Existing authorization/profile failures remain closed. Member/editor/admin access continues to depend on database profiles and the existing RLS policies.
- Out-of-range pagination retains a link directly to the last valid page, including when zero/one pages remain. Approval queue empty text now checks the total count, so approving the last row on page 2 does not hide remaining approvals.

## Files

- `README.md`: account and confirmation setup.
- `packages/schemas/src/auth.ts`, `packages/schemas/src/index.ts`: credentials and response contracts.
- `packages/database/src/repositories/auth-repository.ts`, `packages/database/src/server.ts`, `packages/database/src/server-config.ts`, `packages/database/src/proxy.ts`, `packages/database/package.json`: Auth methods and SSR cookie refresh.
- `packages/api/src/services/session-service.ts`, `packages/api/src/index.ts`: safe session operations.
- `apps/web/proxy.ts`, `apps/web/lib/page-access.ts`: proxy registration and anonymous redirect.
- `apps/web/app/api/v1/auth/service.ts`, `apps/web/app/api/v1/auth/sign-in/route.ts`, `apps/web/app/api/v1/auth/sign-up/route.ts`, `apps/web/app/api/v1/auth/sign-out/route.ts`, `apps/web/app/api/v1/auth/confirm/route.ts`: application auth endpoints.
- `apps/web/features/auth/auth-form.tsx`, `apps/web/features/auth/sign-out-button.tsx`: accessible forms and sign-out feedback.
- `apps/web/app/(public)/sign-in/page.tsx`, `apps/web/app/(public)/sign-up/page.tsx`, `apps/web/app/(public)/check-email/page.tsx`, `apps/web/app/(public)/account/page.tsx`: account journey.
- `apps/web/components/site-navigation.tsx`, `apps/web/app/(admin)/layout.tsx`: account navigation.
- `apps/web/components/pagination.tsx`, `apps/web/app/(admin)/admin/members/page.tsx`: page recovery and accurate queue display.
- `apps/web/app/api/auth.test.ts`, `apps/web/features/auth/auth-form.test.tsx`, `apps/web/tests/session-refresh.test.ts`, `apps/web/tests/page-access.test.tsx`, `apps/web/tests/pagination-recovery.test.tsx`: focused behavior coverage.
- `apps/web/e2e/auth.spec.ts`, `apps/web/e2e/pagination.spec.ts`, `apps/web/e2e/public-and-cms.spec.ts`, `apps/web/e2e/fixtures/auth.mjs`, `apps/web/e2e/fixtures/supabase.mjs`: browser journeys and external-service fixtures.
- `scripts/test-password-auth.mjs`: optional real Auth smoke restricted to the exact named isolated stack, with fixture cleanup.
- This remediation report.

## Verification evidence

Red evidence before implementation: `npm test --workspace @umunara/web -- tests/page-access.test.tsx tests/pagination-recovery.test.tsx` produced 5 failures. Anonymous access threw `NOT_FOUND` instead of redirecting; page 9 with 0/25 records had no recovery link; page 9 with 50 records linked to another invalid page; page 2 after approval falsely claimed the queue was empty. These cases now pass.

Final JavaScript checks used Node 22.22.1 through `PATH=/Users/JeanFidele/.nvm/versions/node/v22.22.1/bin:$PATH`:

- `npm run typecheck`: passed across all workspaces.
- `npm run lint`: passed without lint warnings.
- `npm test`: passed, 85 tests (49 web, 30 API, 4 database, 2 schemas).
- `npm run build`: passed; the build lists the new auth routes and `Proxy (Middleware)` for the actual `proxy.ts` entry.
- `./node_modules/.bin/playwright test --project=chromium`: all 7 passed. Includes signup with/without confirmation, confirmation callback, password failure/retry, cookie sign-out, pending denial, approval pagination after mutation, existing member approval/resource/event flows, CMS cache behavior, and axe accessibility checks.
- Installed Supabase CLI `test db --local --workdir /private/tmp/umunara-core-platform-task3.Lch2gq '<worktree>/supabase/tests/core_rls.test.sql'`: all 48 pgTAP checks passed.
- Prettier 3.9.6 check with `--single-quote --no-semi --print-width 100` on every changed source/document file: passed. `git diff --check` and `node --check scripts/test-password-auth.mjs`: passed.
- Browser static bundle search found no `SUPABASE_SERVICE_ROLE_KEY` or fixture service key. Browser auth tests observed no requests to the external Supabase fixture origin. Every changed file and the diff were re-inspected.

The SDK behavior tests use the real installed Supabase Auth/SSR implementation with controlled external HTTP responses. They verify credential validation, cross-origin denial, provider error redaction, confirmation cookies, PKCE verifier use, and refresh-token rotation propagating to both the request and response cookies. Browser tests run the production app with a loopback external-service fixture.

## Remaining verification limit

The optional real-Auth smoke was attempted but did not complete. Its first attempt using a `127.0.0.1` application origin received a 403 before signup; the test was aligned to the `localhost` origin used by the passing browser suite. The subsequent attempt stopped before creating fixtures because the isolated CLI reported `supabase_db_umunara-core-platform-task3 container is not ready: unhealthy`. No database restart/reset was attempted and no auth user was created by either attempt. The earlier isolated pgTAP run had passed.

After that isolated stack is healthy, run:

```sh
PATH=/Users/JeanFidele/.nvm/versions/node/v22.22.1/bin:$PATH SUPABASE_CLI=/Users/JeanFidele/.npm/_npx/b96a6bd565c470ce/node_modules/@supabase/cli-darwin-arm64/bin/supabase node scripts/test-password-auth.mjs /private/tmp/umunara-core-platform-task3.Lch2gq
```

Production SMTP delivery is not verified here. Configure email confirmation and redirect/template settings as documented before deployment. No applied migration, RLS policy, normal local Supabase stack, unrelated legacy source, remote project, deployment, or push was changed. The Karpathy and Supabase skill guidance informed the focused changes, real SDK usage, regression evidence, and isolated verification. The requested worktree was already isolated; the supplied AGENTS instructions were followed because no on-disk AGENTS.md exists in this checkout or its repository root.
