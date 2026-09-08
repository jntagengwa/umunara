# Bank reconciliation — Task 2 report

Task 2 source and fixture verification are complete. No real database, Plaid account, Vault backend, or deployment was contacted or changed. The additive migration is unapplied. The designated temporary database was not retried, reset, or started.

## Implementation

- Approved administrators can create Link tokens and exchange one-time public tokens through `/api/v1/admin/bank/link-token` and `/exchange-token`. Existing authenticated-profile, same-origin, private/no-store response, and fail-closed Vercel rate-limit patterns are reused. Strict schemas reject absent consent, empty/duplicate selections, unknown fields and client-selected actor IDs.
- A server-only Plaid HTTP client follows the existing PayPal client pattern without adding dependencies. Fixed sandbox/production hosts, no redirects, no-store fetches, timeouts, transactions-only product, US country, and checking/savings filters constrain access. The server fetches and validates selected account metadata and US institution information; browser-provided account names, types, masks and balances are never persisted. Unsupported mask formats become null. Business ownership is an explicit admin attestation; Plaid's account type alone does not prove it.
- The admin page and navigation include consent, explicit account selection, disabled duplicate submissions, cancellation, pending, success and safe error states. Link is loaded directly from Plaid's documented CDN. Public and Link tokens remain ephemeral; public tokens are cleared before exchange and never automatically retried. No access token, provider payload, account/routing number, or raw error is rendered or logged.
- The external Vault KV-v2 adapter encrypts item/access identifiers and recovery context with AES-256-GCM before transmission. It uses a random 12-byte nonce, a 16-byte authentication tag, and the opaque UUID reference as authenticated associated data. Database inputs contain only the UUID reference plus safe metadata. The external write is create-only (`cas: 0`). No external backend is assumed to exist or provisioned by this work.
- Task 1 deliberately provided only sync/reconciliation RPCs, so Task 2 adds `create_bank_connection` to `BankRepository` and a new migration. A service-only invoker wrapper calls a private definer with empty search path. It checks and locks current approved-admin status, validates inputs and commits the connection, accounts, opaque secret reference, consent audit and one durable connection-specific initial sync request atomically. Browser grants remain absent. No donation is created. `bank_sync_requests` is RLS-enabled with service SELECT only. Its consumer/claim/completion implementation remains Task 3.
- On verification or secret-store failure after exchange, the service attempts Item removal. Revocation failure produces a specific safe escalation message. Once the database RPC starts, a failed/ambiguous response preserves the external encrypted bundle and Item because the database may have committed. The UI requests administrator investigation before reconnecting. Cross-provider/database transactions cannot be atomic: process termination or an ambiguous exchange response still requires provider-side operational recovery. No silent retry or plaintext fallback is introduced.

## Required deployment configuration (not configured here)

All variables below are server-only and must never be prefixed `NEXT_PUBLIC_`:

- `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENVIRONMENT` (`sandbox` or `production`). Configure an approved Plaid account for US Transactions. Link Account Select can be enabled in Plaid's dashboard; the application additionally requires explicit account selection. Actual bank OAuth/app-to-app redirects and production consent configuration need provider acceptance testing before release; redirect-return handling is not implemented here.
- `BANK_SECRET_VAULT_URL`: an HTTPS origin without credentials, path, query or fragment; `BANK_SECRET_VAULT_MOUNT`: a single KV-v2 mount segment; `BANK_SECRET_VAULT_TOKEN`: credential authorized to create `bank/<uuid>` secrets in that mount; `BANK_SECRET_ENCRYPTION_KEY`: canonical base64 of exactly 32 cryptographically random bytes. Missing/invalid configuration fails closed before Link creation. Keep encryption keys separate from Vault credentials and retain the key required to decrypt existing bundles during rotation.
- Vault contract: `POST <origin>/v1/<mount>/data/bank/<reference>` with `X-Vault-Token`, JSON `{ options: { cas: 0 }, data: { version: 1, nonce, tag, ciphertext } }`; binary fields are base64. The decrypted JSON contains `connectionId`, `actorId`, `itemId`, `accessToken`. Successful HTTP status confirms storage. Task 3 must read/decrypt via the corresponding documented KV-v2 read endpoint, authenticate the UUID as AAD, and validate decrypted fields. Operational recovery can enumerate this restricted prefix, decrypt bundles with the separate key and reconcile connection IDs against database records; no recovery endpoint is exposed to browsers.
- `BANK_RATE_LIMIT_ENABLED=1`, the existing trusted Vercel ingress/rate-limit configuration and `RATE_LIMIT_SECRET`, plus a configured `umunara-bank-connection` firewall rule are required. The existing Supabase service-role/server environment remains required. No provider, firewall, Vault, secret or environment setup was performed.

## Files changed

- `packages/api/src/bank/`: connection service, Plaid adapter, encrypted Vault adapter, server context, and three test files.
- `packages/schemas/src/bank-connection.ts`, `index.ts`.
- `packages/database/src/repositories/bank-repository.ts`, `bank-repository.test.ts`, and `database.types.ts`.
- `apps/web/app/api/v1/admin/bank/`: two handlers; `apps/web/app/api/bank-connection.test.ts`; `apps/web/lib/bank-request.ts`.
- `apps/web/features/bank/`: connect component/test and Link loader; `apps/web/app/(admin)/admin/bank/page.tsx`; admin layout navigation.
- `apps/web/e2e/bank-connection.spec.ts`, `fixtures/bank.mjs`, the existing fixture server/preload and `playwright.config.ts`.
- `supabase/migrations/20260908005736_bank_connection_flow.sql`, `supabase/tests/bank_connection.test.sql`, and this report.

## Verification

Commands ran in the requested worktree with Node 22.22.1 via `PATH=/Users/JeanFidele/.nvm/versions/node/v22.22.1/bin:$PATH`.

- Red: `npm test --workspace @umunara/api -- bank-connection-service.test.ts` failed because the service module did not exist.
- Green: focused bank API tests **21 passed**; component tests **5 passed**; route tests **6 passed**; repository suite **30 passed**, including the one-RPC connection write, invalid-input rejection and secret-bearing response rejection.
- `npm run typecheck`: all four workspaces passed.
- `npm run lint`: passed. Explicit ESLint for added schema/repository files also passed.
- `npm test`: **305 passed** — web 98, API 136, database 30, schemas 41.
- `npm run build`: passed; compiled successfully in 1183ms, TypeScript completed, **33/33 pages** generated.
- `npm exec -- playwright test apps/web/e2e/bank-connection.spec.ts`: **3 passed** against the production build. Actual pages/routes/services/repositories ran; only Auth/PostgREST, Plaid API/CDN, Vault and firewall boundaries used loopback fixtures. Covered nonadmin denial, admin consent/selection, success, exchange error, secret-free responses/rendering, no page JavaScript errors, mobile overflow, and zero axe violations in the connection section. The first launch was blocked by sandbox loopback binding; approved escalation ran fixture servers. An initial failure-path assertion stalled reading an unconsumed browser error body; the UI had shown the correct safe error. The final test verifies that error body through the request client and scopes alerts to the connection section. All three passed on rerun.
- Prettier write/check for new TS/TSX/test files passed using cached Prettier with `--single-quote --no-semi --trailing-comma es5 --print-width 100`. After the browser-test-only correction, web typecheck and test-file lint passed again. `git diff --check` passed. Changed source, imports/exports, schema, and SQL were re-read. Existing Vite CJS, punycode and color-environment warnings are nonfatal.

No pgTAP/database integration or concurrency test was run: the designated isolated stack remains unavailable and the instruction forbids retry/start/reset. The test SQL covers function/table ACLs, RLS, nonadmin actors, secret rejection, invalid-mask rollback, safe output, account/audit/sync persistence, duplicate identity and unchanged donation count; those assertions are not runtime-verified. No full existing browser suite or live provider/OAuth tests ran. Before rollout, apply migrations through the separately authorized isolated workflow and run:

```sh
/Users/JeanFidele/.npm/_npx/aa8e5c70f9d8d161/node_modules/.bin/supabase test db --local --workdir /private/tmp/umunara-core-platform-task3.Lch2gq '/Users/JeanFidele/The Nexus Ecosystem/Projects/umunara/.worktrees/umunara-next-monorepo/supabase/tests/bank_connection.test.sql'
```

Also rerun Task 1 bank RLS and existing donation/core SQL suites on that same isolated stack. SQL grants, actual atomic rollback, concurrent approval changes and scheduling runtime remain release verification gaps. No sync handler, webhook handler, transaction review or reconciliation UI was implemented in Task 2.

## References and workflow

Official documentation consulted: [Plaid Link tokens](https://plaid.com/docs/api/link/), [Item token exchange/removal](https://plaid.com/docs/api/items/), [Accounts](https://plaid.com/docs/api/accounts/), [Web Link SDK](https://plaid.com/docs/link/web/), [Vault KV-v2 HTTP API](https://developer.hashicorp.com/vault/api-docs/secret/kv/kv-v2), and [Supabase functions](https://supabase.com/docs/guides/database/functions). Supabase's markdown changelog fetch was unsupported by the browser tool; no dependency upgrades were made.

Karpathy kept implementation scoped and tests explicit. Executing-plans/using-git-worktrees preserved the supplied isolated branch; Supabase guidance informed explicit service-only grants and CLI migration-file creation. CLI help and `migration new bank_connection_flow` required escalation solely for local CLI telemetry and file creation, never database access. Finishing guidance uses the already authorized local commit and preserves the worktree. No subagents, push, deployment or cleanup.
