# Donation reporting — Task 1 implementation report

Implemented Task 1 only. Source checks pass; database execution remains unverified because the named isolated temporary PostgreSQL service cannot be reached. No migrations were applied to any database, and no stack was started, reset, or reconfigured.

## Changed files

- `supabase/migrations/20260907222703_donations.sql`
- `supabase/tests/donations_rls.test.sql`
- `packages/schemas/src/donations.ts`
- `packages/schemas/src/donations.test.ts`
- `packages/schemas/src/donation-currencies.ts`
- `packages/schemas/src/index.ts`
- `packages/database/src/repositories/donation-repository.ts`
- `packages/database/src/repositories/donation-repository.test.ts`
- `packages/database/src/repositories/server.ts`
- `packages/database/src/donation.types.ts`
- `packages/database/src/database.types.ts`
- `packages/database/src/index.ts`
- `packages/database/package.json`
- `package-lock.json`
- `packages/api/src/donations/types.ts`
- This report.

## Design decisions

- Immutable gift identity and original gross amounts live in `donations`; only the ingestion transaction updates the current status, fee/refund projection, and event timestamp. Events and financial adjustments are append-only. Triggers reject historical edits/deletes and original gift identity edits. No browser or application service role receives direct INSERT, UPDATE, DELETE, or TRUNCATE grants.
- One public SECURITY INVOKER RPC calls a private SECURITY DEFINER function with an empty search path. Both are executable only by `service_role`. A transaction advisory lock serializes each provider/reference, including first ingestion; a unique event reservation precedes the projection update and adjustment insert. Failed processing rolls back the reservation. Duplicate results return the original event/donation IDs without applying money again.
- `recordEvent` and `upsertDonation` both require a complete event envelope and perform the same single atomic RPC. This intentionally prevents later adapters from splitting event reservation and projection updates into separate requests. Consumers should call either method once per verified event; both return `applied`, `duplicate`, or `stale`.
- Event snapshots contain only normalized fields. There is no raw payload or unrestricted metadata column. Optional donor identity is a profile UUID with a restrictive FK. Provider authenticity verification remains the responsibility of the later adapters.
- `refundedAmountMinor` is cumulative. Partial refunds retain `succeeded`; `refunded` and `reversed` require a full refund. Fees may remain after a refund, producing negative net giving. Pending/failed gifts produce zero recognized gross in the adjustment history; later reports must filter unsettled donation projections appropriately. Old or regressive events remain auditable but do not undo refunds, reversals, or successful settlement.
- Every adapter must preserve the gift's original provider reference, currency, gross amount, cadence, received time, and donor profile across updates. Corrections to identity require a later explicitly designed correction workflow, not an overwrite. Equal-timestamp independent events retain processing order, subject to the terminal-state/refund regression checks; provider-specific ordering/reconciliation belongs to the later adapters.
- Integer amounts are restricted to JavaScript's safe range, mirrored by bigint domains/checks; net values are derived and verified. Uppercase ISO 4217 codes use the current SIX maintenance-agency list retrieved on 2026-09-07. Future currency-list updates require a new migration and matching schema change. No floating-point storage or calculations are introduced.
- Browser table grants are revoked even for admin sessions, matching the platform's server-owned API boundary. Admin-only SELECT policies provide defense in depth. pgTAP first checks the real ACL denial, then grants SELECT only inside its rolled-back test transaction to exercise pending/member/editor denial and admin allowance. Later reporting must enforce admin authorization before using the server service-role repository.
- Repository implementation is exported from the existing server-only `@umunara/database/repositories` entry point; the root barrel exports its type only. Database row interfaces follow the repository's existing maintained type pattern. Direct table Insert/Update types are `never`. The only dependency addition is the existing internal schemas workspace so validation/types remain shared; no external dependency was added.

## Verification and exact result excerpts

Commands used Node 22.22.1 via `PATH=/Users/JeanFidele/.nvm/versions/node/v22.22.1/bin:$PATH` in the requested isolated worktree.

1. Red: `npm test --workspace @umunara/schemas -- donations.test.ts` exited 1 before contracts existed:

   ```text
   FAIL  src/donations.test.ts [ src/donations.test.ts ]
   Error: Cannot find module './donations' imported from '/Users/JeanFidele/The Nexus Ecosystem/Projects/umunara/.worktrees/umunara-next-monorepo/packages/schemas/src/donations.test.ts'
   Test Files  1 failed (1)
   Tests  no tests
   ```

2. Green: the same focused command exited 0. Final output:

   ```text
   ✓ src/donations.test.ts (20 tests) 8ms
   Test Files  1 passed (1)
   Tests  20 passed (20)
   ```

3. `npm test --workspace @umunara/database` exited 0: `Test Files 3 passed (3)`, `Tests 13 passed (13)`, including 7 new repository tests. These intercept fetch through the real Supabase client and verify one RPC, envelope validation, duplicate/stale results, and safe errors.
4. Final `npm test` exited 0: web `59 passed (59)`, API `30 passed (30)`, database `13 passed (13)`, schemas `22 passed (22)` — 124 tests total.
5. `npm run typecheck` exited 0 for web, API, database, and schemas, including the final source/test state.
6. `npm run lint` exited 0. Explicit ESLint invocation with `--config apps/web/eslint.config.mjs` also checked every new TypeScript implementation/test file in schemas, database, and API and exited 0.
7. `npm run build` exited 0:

   ```text
   ▲ Next.js 16.3.4 (Turbopack)
   ✓ Compiled successfully in 941ms
   Finished TypeScript in 1620ms
   ✓ Generating static pages using 11 workers (23/23) in 255ms
   ```

8. `npm install --package-lock-only --ignore-scripts --offline` exited 0 and updated only the internal database-to-schemas dependency entries: `up to date, audited 574 packages`, `found 0 vulnerabilities`. This offline output is not a claim of a fresh online security audit.
9. `git diff --check` exited 0. No formatter command/config is present; formatting, imports, exports, the complete changed-file contents, and the diff were manually reviewed. Existing Vite CJS and Node punycode deprecation warnings remain non-fatal.

Migration creation used the installed Supabase CLI after reading `migration new --help`:

```sh
/Users/JeanFidele/.npm/_npx/aa8e5c70f9d8d161/node_modules/.bin/supabase migration new donations
```

Exact result:

```json
{"path":"/Users/JeanFidele/The Nexus Ecosystem/Projects/umunara/.worktrees/umunara-next-monorepo/supabase/migrations/20260907222703_donations.sql","message":"Migration created"}
```

Initial `npx --yes supabase` attempted an unavailable registry lookup (`ENOTFOUND registry.npmjs.org`), so the already installed cached CLI was used. Its local telemetry write required sandbox escalation; this did not connect to or change a database. Prior migrations are unchanged.

## Database verification gap

Only `/private/tmp/umunara-core-platform-task3.Lch2gq` (`project_id = umunara-core-platform-task3`, database port 55322) was targeted. Reading Docker health for `supabase_db_umunara-core-platform-task3` also stalled and was interrupted; no Docker mutation was issued.

After reading `test db --help`, the exact test arguments were:

```sh
/Users/JeanFidele/.npm/_npx/aa8e5c70f9d8d161/node_modules/.bin/supabase test db --local --workdir /private/tmp/umunara-core-platform-task3.Lch2gq '/Users/JeanFidele/The Nexus Ecosystem/Projects/umunara/.worktrees/umunara-next-monorepo/supabase/tests/donations_rls.test.sql'
```

This ran under Node `execFile` with a 20-second timeout and exited 1 before timeout termination. Exact output:

```text
{"_tag":"Error","error":{"code":"LegacyDbConnectError","message":"failed to connect to postgres: failed to connect to `host=127.0.0.1 user=postgres database=postgres`: Connection timed out"}}
Connecting to local database...
Database test did not complete: 1 null killed=false
```

The SQL suite covers ACLs/RLS, admin allowance/non-admin denial, service ingestion, duplicate replay, rollback/retry after failed projection insertion, integer/currency checks, raw payload rejection, immutable history/identity, refunds/reversals, unsettled gifts, and stale delivery. None of those pgTAP assertions executed in this environment. SQL application, PostgreSQL type/domain behavior, runtime permissions, atomicity, and concurrent delivery therefore require verification once the named isolated stack is healthy and has the new migration applied through its approved local test workflow. Then rerun the exact command above and the existing core suite with its absolute path. No reset/start workaround was attempted. Type interfaces were not regenerated from a running database because it was unavailable.

No provider, checkout, webhook, UI, live account, deployment, push, or external payment configuration work was performed. Browser/e2e checks are not applicable to this schema/contracts-only task.

## Current references consulted

- Supabase official documentation search for function permissions/RLS and [database functions](https://supabase.com/docs/guides/database/functions).
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and [Data API hardening](https://supabase.com/docs/guides/database/hardening-data-api), including current explicit-grant guidance.
- [PostgreSQL INSERT / ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html).
- [SIX ISO 4217 current list](https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml), fetched directly and parsed as XML for the currency allowlist.

Karpathy guidance kept changes scoped to Task 1; Supabase guidance drove current documentation checks, CLI migration creation, private privileged functions, explicit grants, and the recorded database verification gap. The requested existing worktree/branch is preserved.
