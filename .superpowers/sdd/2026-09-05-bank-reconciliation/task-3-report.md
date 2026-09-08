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

## Review fix round 1

Addressed initial waiting state, decimal precision loss and webhook lookup availability. No migration, database, provider account, Vault configuration or deployment was changed in this round.

- The current Plaid reference documents `next_cursor: ""` while initial transactions are unavailable. The adapter accepts this only with empty added/modified/removed arrays and `has_more: false`. The service returns HTTP 200 counts plus `{ outcome: 'waiting', retryAfterSeconds: 60 }`, releases its lease through the existing continuation operation and keeps its null/current cursor and pending request intact. It neither saves an empty cursor nor restarts pagination. One waiting response ends the invocation immediately. The dispatcher must honor the 60-second retry hint (with jitter/backoff during prolonged initial preparation), retain pending work and avoid immediate retry loops. A realistic `NOT_READY` fixture now exercises waiting followed by initial/incremental data through the production route. Unit tests also cover an already populated cursor.
- Amount precision is checked against the original JSON number token using the Node 22 source-aware JSON reviver, verified on the repository's Node 22.22.1 runtime. A small decimal canonicalizer compares the source value with the parsed number's decimal representation before normalization can use it. A mismatch, missing source context, overflow or underflow fails closed. Thus `90071992547409.91` cannot silently become `90071992547409.9`, and `1.00000000000000001` cannot become `1`. Equivalent trailing zeros/exponents and normal/large exact amounts remain supported; no smaller business-amount cap was introduced. Existing currency-scale and safe-integer BigInt checks still apply afterward. No parsing dependency or runtime-version change was needed.
- Webhook token structure, canonical base64, signature size, claim age/expiry and body hash are checked before remote key lookup. These unverified claims can only reject; no event is accepted until the exact JWT signature is verified. Age/expiry are checked again after lookup. Public keys are cached server-side per Plaid environment across requests: at most eight entries, 60-second positive TTL, 10-second failure cooldown, four concurrent lookups and eight new lookups per minute per process. Concurrent requests for one key share their lookup. New key IDs support rotation; refresh rejects revoked/expired keys and never falls back to stale keys on failure. Newly revoked keys may remain usable within the bounded positive TTL until refresh, as with any local verification-key cache.
- Residual availability control belongs at the trusted gateway: per-process limits do not provide a deployment-wide traffic cap and cannot eliminate signature-verification CPU use or cold-instance fan-out. A flood can temporarily consume that process's uncached-key budget, including delaying a legitimate new rotation key until the window resets. Provider-compatible gateway limits and retry monitoring must account for that behavior. No browser mutation limiter, provider IP assumptions, firewall changes or external configuration was added.

Files changed: bank sync service/contracts/tests, Plaid adapter/tests, new `plaid-json.ts`/tests, new `plaid-webhook-key-cache.ts`/tests, verifier/tests/context, realistic sync fixture and browser fixture/test, and this report. Helpers remain focused; no existing database SQL or unrelated application behavior was refactored.

Verification in this round:

- Red: seven newly added assertions failed against the previous implementation, covering both waiting cursors, adapter waiting input, two rounded amounts, early rejection and key reuse.
- Green focused suite: **53 passed** across sync, adapter, verifier, cache and precision tests. Tests include real ES256 signatures, key rotation/TTL/revocation, failed lookup cooldown, concurrent lookup sharing and distinct-key request bounds.
- `npm test`: **365 passed** — web 105, API 185, repository 34, schemas 41.
- `npm run typecheck`, `npm run lint`, Prettier check for all changed/new TS/fixture files, and `git diff --check`: passed.
- `npm run build`: passed, compiled in 1040ms; **35/35 pages** generated.
- `npm exec -- playwright test`: **22/22 passed** in 16.0s, including the new waiting-then-import flow against the production build. Only approved loopback fixtures ran.

Database/pgTAP, real provider/Vault and deployment checks remain unrun for the previously recorded reasons. Existing warning categories remain nonfatal. All changed files and the diff were inspected before the focused local commit.

## Review fix round 2

Corrected the shared negative-cache/lookup-budget availability issue. Changes are limited to `plaid-webhook-key-cache.ts`, its tests, verifier regression tests and this report. Signature verification code is unchanged.

Positive provider keys and negative lookup results now occupy separate bounded stores: eight positive entries with the existing 60-second TTL and sixteen negative entries with the existing 10-second cooldown. Unknown-key failures cannot evict trusted entries. An expired positive entry retains its established-key identity so it can use the dedicated refresh path; stale key material is still never returned after expiry or a failed refresh.

Discovery and established-key refresh have independent budgets of eight requests per minute. Their in-flight limits are four and two respectively. Consequently unknown IDs cannot consume refresh requests or occupy reserved refresh slots. This supersedes the shared eight-request/four-slot limits documented in round 1. Concurrent requests for the same key still share one lookup. New-key rotation, TTL refresh, revoked-key rejection and safe failure behavior remain covered. A genuinely new rotation key can still be delayed by an exhausted discovery budget; gateway controls remain necessary for aggregate multi-instance traffic. Existing trusted keys retain their independent refresh path during that event.

The two reproduced failures were recorded before implementation: eight negative unknown IDs after a lookup-window reset caused an unexpired positive key to disappear, and the same sequence after positive TTL expiry prevented a correctly signed delivery from refreshing its trusted key. Both now pass. A third regression proves a trusted refresh succeeds while all four unknown-key discovery slots are occupied. The verifier regression signs real ES256 JWTs and requires the valid delivery to be accepted after all eight unknown IDs are rejected.

Verification:

- Focused cache/verifier suite passed after the two red regressions; final full run includes **22 passing cache/verifier tests** including the additional concurrency case.
- `npm test`: **368 passed** — web 105, API 188, repository 34, schemas 41.
- `npm run typecheck`, `npm run lint`, Prettier check for every changed TypeScript file and `git diff --check`: passed.
- `npm run build`: passed, compiled in 820ms; **35/35 pages** generated.
- `npm exec -- playwright test`: **22/22 passed** in 25.7s against the production build using only the approved local fixture servers.

All changed source/tests and the diff were inspected. No dependency, environment configuration, SQL, live database, Plaid account, Vault backend or deployment was touched. Previously recorded database/provider deployment verification gaps remain unchanged.
