# Bank reconciliation — Task 3 report

Task 3 source and fixture verification are complete. No real database, Plaid account, Vault backend, or deployment was contacted or changed. The additive migration remains unapplied. The designated isolated database was not retried, started or reset.

## Implementation

- Server-only `BankSyncService.sync(connectionId)` claims one pending connection with an expiring lease, resolves its encrypted token bundle and requests only `/transactions/sync` with the stored cursor. Each provider page is bounded to 500 changes; a route invocation handles at most 20 requests and checks a 40-second processing budget. Timeouts/process termination leave recoverable durable pending work. Normal bounded continuation preserves the current pagination cursor.
- The new worker RPC wraps Task 1's unchanged atomic page function. Page changes, cursor, lease renewal and final-cycle bookkeeping commit together. UUIDs derive from cycle identity and normalized content; a lost database response retries the exact same page once. Final-page receipts remain replayable after completion. A new claimant cannot apply pages using a stale lease.
- Durable cycle state retains the original cursor until the final page. A pagination mutation, failed attempt or expired worker restarts only that connection at that cursor with a new cycle ID. Already committed snapshots are reapplied through Task 1's identity/expected-cursor checks. No full-cycle array or transaction is built. Counts describe applied page operations in the current invocation, not distinct lifetime imports. Consumers should treat an unfinished cycle as provisional; whole-cycle visibility is not atomic.
- Normalization imports only selected, active account identities; unsupported/unselected account rows are not persisted. Amounts reverse Plaid's debit-positive sign and use exact decimal/BigInt conversion with the runtime ISO currency scale, checked against safe integer limits and the selected account currency. Unknown currency, malformed dates, invalid precision or conflicting identities fail before persistence. Only safe transaction snapshot fields reach the database. Task 1 continues to own removal/reconciliation invalidation; no donation or review UI is created.
- Vault reads use the existing fixed HTTPS KV-v2 path, no-store/no-redirect/timeout controls, canonical base64 validation, version-1 envelope and nondeleted metadata. AES-256-GCM authenticates the UUID reference as AAD, then strict decrypted-field validation checks both connection and authorizing actor. Plaintext buffers are cleared after parsing; application strings remain ephemeral server memory. Authentication/decryption/backend failures produce safe errors without plaintext fallback.
- Plaid webhook verification accepts only the documented ES256/P-256 profile using Node/OpenSSL signature verification. It validates algorithm/key identity/key expiry, signature, issued-at age (at most five minutes), optional expiry/not-before claims, and a timing-safe SHA-256 comparison against the untouched bounded UTF-8 request body. No key URL from a request is followed. Unknown header fields are rejected. Only verified `TRANSACTIONS.SYNC_UPDATES_AVAILABLE` events schedule work.
- Item routing stores a SHA-256 fingerprint after authenticated Vault resolution, never the plaintext Item ID. Unknown Items are acknowledged without scheduling; initial jobs created in Task 2 remain pending until the worker indexes that Item. Webhook receipts contain a hash of authenticated issued-at/body-hash metadata, event type and timestamps, not raw bodies. Identical signed deliveries schedule once; later otherwise-identical events can schedule again. Different fresh signatures may cause an extra incremental check without duplicating bank rows.
- Request/completion versions preserve a webhook arriving during an older cycle. Browser roles retain no banking grants or function execution rights. Private definers use empty search paths behind service-only invoker wrappers. The internal POST route requires a separate server-only `BANK_SYNC_SECRET` and validates exactly one connection UUID before constructing dependencies. User/admin browser sessions confer no sync permission. Responses contain private/no-store counts or safe errors only.

## Files changed

- `packages/api/src/bank/`: sync service/tests, provider sync contracts, webhook verifier/tests, Vault read implementation/tests, Plaid adapter and shared server context.
- `packages/database/src/repositories/`: narrow sync repository/tests and server export; `database.types.ts` adds only the callable RPC surface.
- `packages/schemas/src/bank-sync.ts` and `index.ts`: strict worker contracts.
- `apps/web/app/api/v1/webhooks/plaid/route.ts`, `apps/web/app/api/v1/internal/bank/sync/route.ts`, `apps/web/app/api/plaid-webhook.test.ts`, `apps/web/lib/bank-sync-request.ts`.
- `apps/web/tests/fixtures/plaid-sync.json`, `apps/web/e2e/bank-sync.spec.ts`, `apps/web/e2e/fixtures/bank-sync.mjs`, fixture routing and Playwright environment configuration.
- `supabase/migrations/20260908011928_bank_sync_worker.sql`, `supabase/tests/bank_sync.test.sql`, and this report.

## Verification

Commands ran in the requested existing worktree on `feat/umunara-next-monorepo` with Node 22.22.1 through `PATH=/Users/JeanFidele/.nvm/versions/node/v22.22.1/bin:$PATH`.

- Red: `npm test --workspace @umunara/api -- bank-sync-service.test.ts` failed because the new module was absent.
- Focused sync/verifier tests: 25 passed, covering cursor pages, exact retry, restart, disconnection, invalid access, unsafe amounts, bounded continuation, real ES256 signatures and tampering/expiry/key failures. Additional Vault, route and repository tests passed in the full suite.
- `npm test`: **342 passed** (web 105, API 162, repository 34, schemas 41).
- `npm run typecheck`: all four workspaces passed.
- `npm run lint` and explicit ESLint for new database/schema implementation/tests passed.
- `npm run build`: passed, compiled in 1817ms; TypeScript completed; **35/35 pages** generated.
- `npm exec -- playwright test`: **22/22 passed** in 16.3s, covering the entire existing browser suite plus the new bank sync path against the production build. The new test runs actual routes, service, adapter, repository, signature crypto and Vault decryption; only external provider/Vault/PostgREST boundaries are loopback fixtures. It covers initial plus modified/removed pages, duplicate webhook scheduling, tampered-body rejection, secret authorization and safe responses. These fixtures do not execute PostgreSQL.
- Initial browser launch hit sandbox EPERM binding localhost; approved escalation allowed only the test's loopback servers. Cached Supabase CLI `migration new --help` and empty migration creation similarly needed approval for its local telemetry write. Neither CLI operation contacted a database.
- New/changed implementation and test files were formatted/checked with cached Prettier (`--single-quote --no-semi --trailing-comma es5 --print-width 100`). Existing database type formatting was preserved outside the added RPC entries. `git diff --check` passed. Source/diff/imports/exports and SQL were inspected. Existing Vite CJS, punycode and color-environment warnings are nonfatal.

## Unverified deployment prerequisites

No pgTAP/database execution, actual concurrency, query-plan inspection, provider acceptance test or live Vault test ran. SQL source tests cover browser denial, lease exclusion, duplicate scheduling, durable cursor restart, final-page replay, webhook-during-sync retention, continuation, stale/expired workers, disconnection and unchanged donation count. Runtime behavior remains a release gate. Once the designated stack is healthy and migrations are separately applied through the approved isolated workflow, run:

```sh
/Users/JeanFidele/.npm/_npx/aa8e5c70f9d8d161/node_modules/.bin/supabase test db --local --workdir /private/tmp/umunara-core-platform-task3.Lch2gq '/Users/JeanFidele/The Nexus Ecosystem/Projects/umunara/.worktrees/umunara-next-monorepo/supabase/tests/bank_sync.test.sql'
```

Rerun Task 1/2 and donation/core SQL tests against that same isolated stack. Verify concurrent workers/webhooks and crash/restart with representative transaction volume before rollout.

Deployment must configure a cryptographically random `BANK_SYNC_SECRET` (at least 32 characters), grant the configured Vault credential read access to its existing `bank/<uuid>` KV-v2 data paths, configure Plaid's webhook URL to `/api/v1/webhooks/plaid`, and run an authenticated server dispatcher. The dispatcher reads only pending `bank_sync_requests` IDs (`completed_version < requested_version`, excluding unexpired leases) and posts each connection ID to the internal route with the separate bearer secret, retrying failures with backoff. Pending rows are the durable queue, including initial import and bounded continuation. No hosted dispatcher, cron job, Vault policy or provider setup was provisioned; those remain deployment work. Keep keys and Item indexing intact during rotation/recovery.

References consulted: [Plaid Transactions Sync](https://plaid.com/docs/api/products/transactions/), [Plaid webhook verification](https://plaid.com/docs/api/webhooks/webhook-verification/), [Vault KV-v2 read contract](https://developer.hashicorp.com/vault/api-docs/secret/kv/kv-v2), [Supabase function security](https://supabase.com/docs/guides/database/functions). The Supabase changelog markdown URL could not be fetched by the web tool; the relevant current function reference was available. No new dependency was added. Karpathy, executing-plans, existing-worktree, Supabase and finishing guidance kept the implementation scoped, verified and committed locally without deployment or cleanup. No subagent was used.
