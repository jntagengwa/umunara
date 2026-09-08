# Bank reconciliation — Task 1 report

Task 1 source implementation is complete. Database execution remains unverified because the designated isolated database is unavailable. No database was contacted, retried, started, reset or changed. Prior migrations remain untouched; the new migration has not been applied.

## Files changed

- `packages/schemas/src/bank.ts`, `bank.test.ts`, and `index.ts`.
- `packages/database/src/repositories/bank-repository.ts`, `reconciliation-repository.ts`, `bank-repository.test.ts`, and `server.ts`.
- `packages/database/src/database.types.ts` and `index.ts`.
- `supabase/migrations/20260908003435_bank_reconciliation.sql`.
- `supabase/tests/bank_rls.test.sql`.
- This report.

## Boundaries and decisions

- Strict shared schemas cover classifications, safe connection/account/transaction DTOs, bounded date/amount/page filters, normalized sync pages and reconciliation inputs/results. Amounts are signed safe integer minor units: positive credits, negative debits. Dates are calendar dates from 2000 through 9998; queries span at most 366 days. Existing ISO currency validation/domain is reused. Unknown fields, unsafe money, invalid dates, duplicate identities/targets and conflicting page changes are rejected.
- Browser DTOs omit provider identifiers, cursors and secret references. A private, RLS-enabled `bank_connection_secrets` table contains only an opaque UUID reference to an external server secret bundle for encrypted item/access identifiers. No token, credential, full account/routing number or raw provider payload column exists. Secret-store provisioning/encryption/resolution and connection writes belong to Task 2; no placeholder plaintext storage was introduced.
- All seven new tables enable RLS. PUBLIC, anon and authenticated receive zero grants, including admin browser sessions. No browser RLS policies exist, so an accidental future table grant still fails closed. Service roles receive SELECT only; writes go through narrow public SECURITY INVOKER wrappers into private SECURITY DEFINER functions with empty search paths and service-only EXECUTE ACLs. Existing private schema usage comes from the donation migration.
- `BankRepository.saveSyncPage` validates input and sends one atomic RPC. The database locks the connection, checks the expected cursor, validates account/connection/currency boundaries, upserts added/modified identities, marks removals, reserves a page receipt and advances the cursor in one transaction. Receipts retain SHA-256 input fingerprints and counts, allowing exact replay without rewinding state and rejecting page-ID reuse for different content. Empty pages may retain their cursor. Unknown removals are consumed without inventing incomplete transaction rows. The future adapter must retain a page UUID across retries and supply normalized, verified input.
- Financial changes or removals revoke active reconciliation links with a reason and return the source to unreviewed. Original bank row identity and historical links remain. Delete triggers and absence of service DML/TRUNCATE grants prevent hard-deletion through application access. Sync-page receipts are immutable.
- `ReconciliationRepository.link` sends one atomic RPC. SQL verifies the supplied actor is a currently approved admin, locks the source and sorted donation targets, validates positive posted/nonremoved credit, compatible kind/provider/currency/status and amount totals, inserts all links, classifies the source and records an audit entry. No donation row is created or changed. The future service must derive actorId from authenticated server context; browser input must never choose it.
- A donation can have only one active bank source. Processor payouts can group several gifts from the same Stripe or PayPal provider; offline `donation` matches require one manual/bank gift. Exact source/target replay is idempotent; incompatible rematching is rejected. Payout amounts currently require the sum of current ledger net values; offline credits require the gift's original gross. Per-link matched amount/currency snapshots preserve the historical match after later refunds. Exceptional settlement allocations that do not satisfy these conservative rules need a later explicitly designed workflow.
- Webhook storage supplies only deduplication metadata and processing timestamps. No webhook handler, scheduler, Plaid adapter, connection flow, sync service, classification service, query implementation or UI was added. Existing server-only repository exports are reused; root exports are type-only. Database typing adds only the callable RPC surface, without speculative direct bank-table APIs or generated-type claims. No dependency was added.

## Verification

Commands ran in the requested worktree using Node 22.22.1 via `PATH=/Users/JeanFidele/.nvm/versions/node/v22.22.1/bin:$PATH`.

- Red: `npm test --workspace @umunara/schemas -- bank.test.ts` failed with `Cannot find module './bank'` before implementation.
- Green focused contracts: **17/17 passed**. Repository suite: **29/29 passed**, including nine bank/reconciliation tests using the real Supabase client against intercepted HTTP responses. Tests cover one RPC, invalid-input rejection before network, duplicate results, safe errors and malformed responses. They do not execute PostgreSQL.
- `npm test`: **272 passed** — web 87, API 115, database 29, schemas 41.
- `npm run typecheck`: all four workspaces passed; repeated after the final empty-page validation correction.
- `npm run lint` plus explicit ESLint for every new TypeScript implementation/test file passed.
- `npm run build`: passed; `Compiled successfully in 870ms`, TypeScript completed, **30/30 pages** generated. No new runtime route was introduced.
- New TypeScript files were formatted and checked using the cached Prettier with `--single-quote --no-semi --trailing-comma es5 --print-width 100`. Changed files, imports/exports and the full SQL source were re-read. `git diff --check` passed. Existing Vite CJS and punycode warnings remain nonfatal.
- After the final no-op-page correction, focused contracts passed **17/17** again. Full-suite/build results above precede that narrow correction; typecheck and formatting were rerun afterward.

The cached Supabase CLI package is version 2.117.0. After reading `migration new --help`, the command was:

```sh
/Users/JeanFidele/.npm/_npx/aa8e5c70f9d8d161/node_modules/.bin/supabase migration new bank_reconciliation
```

It created `20260908003435_bank_reconciliation.sql`. The CLI's local telemetry write initially hit sandbox EPERM; approved escalation allowed help and empty-file creation only. Neither command contacted a database.

## Database verification gap

No pgTAP assertion ran. SQL syntax/runtime behavior, grants, RLS, atomic rollback, concurrency, query plans and integration with prior migrations remain unverified by a database. The pgTAP source covers browser ACL denial for all roles including admin, defense-in-depth RLS, service-only functions, safe money/date/currency, account isolation, duplicate pages, stale cursors, mid-page rollback, soft removal/restoration, revoked links, duplicate/incompatible linking, offline one-to-one links, multi-gift payouts and unchanged donation counts. Actual concurrent-writer tests and representative-volume plans must also be checked before rollout.

Once the named isolated stack is healthy and migrations have been applied through the separately approved isolated workflow, run:

```sh
/Users/JeanFidele/.npm/_npx/aa8e5c70f9d8d161/node_modules/.bin/supabase test db --local --workdir /private/tmp/umunara-core-platform-task3.Lch2gq '/Users/JeanFidele/The Nexus Ecosystem/Projects/umunara/.worktrees/umunara-next-monorepo/supabase/tests/bank_rls.test.sql'
```

Rerun the existing donation/core suites against that same approved isolated stack. Browser/e2e and provider-account tests were not run because this task introduces no UI/provider flow. No push, deployment, external account configuration or worktree cleanup was performed.

## References and workflow

Current official references consulted: [Supabase API grants and RLS](https://supabase.com/docs/guides/api/securing-your-api), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [database functions](https://supabase.com/docs/guides/database/functions), [CLI releases](https://github.com/supabase/cli/releases), and [PostgreSQL SHA-256](https://www.postgresql.org/docs/current/functions-binarystring.html). Supabase documentation search also confirmed service-only function ACLs and private privileged functions.

Karpathy guidance kept the change scoped; executing-plans and worktree guidance preserved the existing isolated branch; Supabase guidance drove documentation checks, CLI creation and explicit grants. Finishing guidance used the already authorized focused local commit without a new integration-choice prompt. No subagent was used.
