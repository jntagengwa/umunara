# Bank reconciliation — Task 4 report

Task 4 source and fixture verification are complete. No real database, provider account, Vault backend, dispatcher or deployment was contacted or changed. The new migration remains unapplied. The designated isolated database was not retried, reset or started.

## Implementation and boundaries

- Added approved-admin review at `/admin/bank` and GET `/api/v1/admin/bank/transactions`, POST `/transactions/[id]/classify`, and POST `/transactions/[id]/reconcile`. Existing server session/profile, role, same-origin, fail-closed bank rate-limit and private/no-store response controls are reused. Actor IDs come only from authenticated context. Review dependencies do not require Plaid/Vault credentials.
- Strict shared contracts and read parsing validate required dates, signed safe integer minor units, optional account/currency/classification, bounded pagination and unique payout targets. Unknown keys, duplicate query keys, client actor IDs and malformed IDs are rejected. Queries span at most 366 days; UI pages contain 25 rows and the server caps pages at 100 rows.
- `BankReviewRepository` uses narrowly typed service-only RPCs. `list_bank_transactions` selects one page plus a lookahead, orders by booked date and UUID, filters in SQL, excludes removed activity and returns safe account names/masks plus active link counts. It never returns provider IDs, secrets, full account numbers or raw payloads. Existing indexes support date/account/classification reads; actual plans and concurrent-page behavior remain unverified.
- The additive migration supplies public invoker wrappers and private definer implementations with empty search paths, explicit service-only EXECUTE ACLs, and current approved-admin checks. Browser table grants remain absent. Classification locks the source using the same locking boundary as Task 1 linking/sync, rejects pending/removed activity, prevents debit-as-gift/payout labels and incompatible reclassification of active matches, and commits the changed label plus audit record atomically. Exact repeats are no-ops.
- Payout matching reuses unchanged Task 1 `ReconciliationRepository.link`. It does not separately classify, create donations, adjust gifts or replace links. Task 1 retains sorted target/source locks, one active source per gift, compatible posted credit/provider/currency/status/current-net-sum rules, idempotent exact matches and an atomic audit record. Service conflicts become safe HTTP 409 feedback.
- Offline `donation` is explicitly a review label only. No bank gift creation or offline matching UI is invented: existing repositories do not offer atomic new offline gift creation and source linkage. The UI explains that classification never changes donation totals. Administrators supply known existing donation UUIDs for manual payout matching; a searchable donation candidate picker and exceptional settlement allocation workflow are outside this task.
- Both successful operations invalidate only `bank:transactions`. Donation report tags remain valid because neither operation changes ledger rows or summary amounts. Review reads are private/no-store and the UI refreshes its bounded page after save.
- Filters, table, editor and presentation helpers are focused modules. The UI includes loading/empty/safe error feedback, cancellation, explicit confirmation, pending controls, aborted stale reads, currency-aware integer amount rendering, keyboard focus handling and a horizontally scrollable table on mobile. Pending and actively matched rows cannot be edited through the UI. No dependency was added.

## Files changed

- `packages/schemas/src/bank-review.ts`, `index.ts`.
- `packages/database/src/repositories/bank-review-repository.ts`, its test, `server.ts`, and `database.types.ts` (RPC signatures only).
- `packages/api/src/bank/reconciliation-service.ts`, its test, and `reconciliation-context.ts`.
- `apps/web/app/api/v1/admin/bank/transactions/` (three handlers), `apps/web/app/api/bank-review.test.ts`, `apps/web/lib/bank-review-request.ts`.
- `apps/web/features/bank/bank-review-{table,editor,filters}.tsx`, `bank-review-values.ts`, `bank-review.module.css`, table test, and existing bank page.
- `apps/web/e2e/bank-reconciliation.spec.ts`, `fixtures/bank-review.mjs`, and fixture server routing.
- `supabase/migrations/20260908021440_bank_review.sql`, `supabase/tests/bank_review.test.sql`, and this ignored handoff report.

## Verification

Commands ran in the requested worktree with Node 22.22.1 via `PATH=/Users/JeanFidele/.nvm/versions/node/v22.22.1/bin:$PATH`.

- Red: reconciliation service tests failed with the missing service module; component tests failed with the missing review component.
- Focused green: 11 service tests, 4 component tests, 7 route tests and 4 repository tests. Role denial, pagination/filter parsing, classification/audit RPC boundaries, narrow cache invalidation, payout linking, safe conflicts, strict input and output, and confirmation are covered. Repository tests use the real Supabase client against intercepted HTTP boundaries, not PostgreSQL.
- `npm test`: **398 passed** — web 116, API 203, database 38, schemas 41.
- `npm run typecheck`: all four workspaces passed; final run includes all implementation and test files.
- `npm run lint`: passed. Explicit ESLint for the new schema/repository files and final browser test also passed.
- `npm run build`: passed; compiled successfully in 1622ms, TypeScript completed, **36/36 pages** generated.
- `npm exec -- playwright test`: final **24/24 passed** in 18.0s against the production build. Actual routes, services, repositories and client components run; Auth/PostgREST/provider boundaries use loopback fixtures. The new workflow covers page 2, signed/account/classification filtering, explicit confirmation, safe incompatible-match recovery, successful processor payout matching, unchanged donation summaries, active-match reclassification denial, zero axe violations in the review section, no page JavaScript errors and mobile overflow.
- Initial browser invocation was blocked by sandbox loopback binding; approved escalation enabled fixture servers only. The first full run passed 23/24; the new test timed out on an overly exact label locator while its combobox was visibly present. Correcting the locator to its accessible role/name produced a focused 2/2 pass and then the full 24/24 pass. This was a test locator correction, not a product change.
- Component tests initially exposed the existing test environment's missing MutationObserver and FormData behavior. Tests follow the repository's async `act` convention; filter drafts use controlled inputs. The final component suite has no unhandled errors.
- New TS/TSX/MJS/CSS files and the bank page were formatted with cached Prettier (`--single-quote --no-semi --trailing-comma es5 --print-width 100`); formatting check and `git diff --check` passed. All changed implementation/tests and SQL were re-opened and reviewed. Existing CJS, punycode and color-environment warnings remain nonfatal.

## Unverified release gates

No pgTAP, SQL runtime, advisor, actual concurrent-writer, query-plan or live provider test was run. The user explicitly forbids using/retrying the unavailable isolated database. SQL source tests cover function/table ACLs, current-admin denial, bounded filtered reads, safe DTOs, classification audit/no-op behavior, pending/debit/removed rejection, unchanged donation amounts and compatibility with Task 1 links; these are not database-verified assertions.

Once the named stack is healthy and migrations are separately applied through the authorized isolated workflow, run:

```sh
/Users/JeanFidele/.npm/_npx/aa8e5c70f9d8d161/node_modules/.bin/supabase test db --local --workdir /private/tmp/umunara-core-platform-task3.Lch2gq '/Users/JeanFidele/The Nexus Ecosystem/Projects/umunara/.worktrees/umunara-next-monorepo/supabase/tests/bank_review.test.sql'
```

Rerun the Task 1–3 and existing core/donation SQL suites on that same isolated stack. Validate classification/link/sync concurrency and representative-volume filtered query plans before rollout. Offset pages can shift during concurrent imports; refresh establishes a new current view. Existing Task 2 rate-limit configuration remains required; no firewall/provider/secrets configuration was changed.

The Supabase CLI help and `migration new bank_review` created only an empty source migration, with approved local telemetry-write escalation. No database command was executed. Current [Supabase function security documentation](https://supabase.com/docs/guides/database/functions) informed the service-only invoker/definer boundaries. Karpathy, execution, existing-worktree, Supabase and finishing guidance kept scope surgical and preserved the authorized local-commit workflow. No subagent, push, merge, deployment or cleanup was performed.
