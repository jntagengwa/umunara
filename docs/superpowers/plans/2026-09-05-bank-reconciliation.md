# Umunara Bank Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only Plaid bank connectivity, incremental transaction synchronization, review, and payout reconciliation without double-counting online donations.

**Architecture:** Plaid is a server-only adapter. Connection tokens and synchronization cursors are persisted securely, provider webhook events schedule incremental sync, and admins classify imported bank credits through explicit reconciliation records.

**Tech Stack:** Next.js Route Handlers, Supabase/Postgres, Plaid SDK, Zod, Vitest, pgTAP, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-05-umunara-platform-design.md`

## Global Constraints

- Plaid access is read-only and restricted to administrator-authorized US business-bank accounts.
- Do not store bank credentials, full account/routing numbers, or raw provider secrets.
- Use cursor-based incremental synchronization and idempotent webhook handling; never schedule broad repeated full imports.
- Imported processor payouts are bank transactions, not donations; reconciliation prevents double-counting.
- Only administrators can connect accounts, inspect bank transactions, classify credits, or change reconciliation links.

---

### Task 1: Define bank contracts, tables, and RLS boundaries

**Files:**
- Create: `packages/schemas/src/bank.ts`, `packages/schemas/src/bank.test.ts`, `supabase/migrations/<timestamp>_bank_reconciliation.sql`, `supabase/tests/bank_rls.test.sql`, `packages/database/src/repositories/bank-repository.ts`, `packages/database/src/repositories/reconciliation-repository.ts`
- Modify: `packages/schemas/src/index.ts`, `packages/database/src/index.ts`

**Interfaces:**
- Produces `BankTransactionClassification = 'unreviewed' | 'donation' | 'non_donation' | 'processor_payout'`.
- Produces `BankRepository.saveSyncPage(page)` and `ReconciliationRepository.link(input)`.

- [ ] **Step 1: Write failing contract and policy tests**

```ts
it('rejects an unknown bank transaction classification', () => {
  expect(() => bankTransactionClassificationSchema.parse('income')).toThrow()
})
```

```sql
select throws_ok(
  $$ select * from public.bank_transactions $$,
  '42501',
  'members cannot read bank transactions'
);
```

- [ ] **Step 2: Run the failing tests**

Run: `npm test --workspace @umunara/schemas -- bank.test.ts && supabase test db --local`

Expected: FAIL because bank contracts and policies are absent.

- [ ] **Step 3: Implement constrained storage and policies**

Create `bank_connections`, `bank_accounts`, `bank_transactions`, and
`reconciliation_links`. Store Plaid item/access references encrypted or in a
server-only secrets store; persist only safe account mask/name/type metadata.
Enforce unique `(connection_id, provider_transaction_id)` and a foreign-keyed
one-to-one restriction for each reconciliation source/target where applicable.
Enable RLS and grant no browser role access to banking tables.

- [ ] **Step 4: Run RLS and contract tests**

Run: `npm test --workspace @umunara/schemas -- bank.test.ts && supabase test db --local`

Expected: PASS; all non-admin database contexts are denied.

- [ ] **Step 5: Commit**

```bash
git add packages/schemas packages/database supabase
git commit -m "feat: add bank reconciliation schema"
```

### Task 2: Build Plaid Link and account connection endpoints

**Files:**
- Create: `packages/api/src/bank/plaid-adapter.ts`, `packages/api/src/bank/bank-connection-service.ts`, `packages/api/src/bank/bank-connection-service.test.ts`, `apps/web/app/api/v1/admin/bank/link-token/route.ts`, `apps/web/app/api/v1/admin/bank/exchange-token/route.ts`, `apps/web/features/bank/connect-bank-account.tsx`, `apps/web/features/bank/connect-bank-account.test.tsx`

**Interfaces:**
- Produces `BankConnectionService.createLinkToken(admin): Promise<{ linkToken: string }>`.
- Produces `BankConnectionService.exchangePublicToken(admin, publicToken): Promise<BankConnectionDto>`.

- [ ] **Step 1: Write a failing authorization test**

```ts
it('allows only admins to create a Plaid Link token', async () => {
  await expect(service.createLinkToken(memberActor)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  await expect(service.createLinkToken(adminActor)).resolves.toMatchObject({ linkToken: expect.any(String) })
})
```

- [ ] **Step 2: Run the service test**

Run: `npm test --workspace @umunara/api -- bank-connection-service.test.ts`

Expected: FAIL because connection service is absent.

- [ ] **Step 3: Implement admin-only consent and token exchange**

Create a Link token with `transactions` product and US country code. The browser
passes its short-lived public token only to the exchange route. The server
exchanges it, stores protected connection references, persists selected account
metadata, creates an audit entry, and schedules initial incremental sync. Never
return an access token to the browser or write it into logs.

- [ ] **Step 4: Run service and component tests**

Run: `npm test --workspace @umunara/api -- bank-connection-service.test.ts && npm test --workspace @umunara/web -- connect-bank-account.test.tsx`

Expected: PASS; members see no connect action and access-token values never appear in rendered output.

- [ ] **Step 5: Commit**

```bash
git add packages/api apps/web
git commit -m "feat: add Plaid bank connection flow"
```

### Task 3: Implement incremental transaction sync and provider webhook handling

**Files:**
- Create: `packages/api/src/bank/bank-sync-service.ts`, `packages/api/src/bank/bank-sync-service.test.ts`, `apps/web/app/api/v1/webhooks/plaid/route.ts`, `apps/web/app/api/v1/internal/bank/sync/route.ts`, `apps/web/tests/fixtures/plaid-sync.json`

**Interfaces:**
- Produces `BankSyncService.sync(connectionId): Promise<{ added: number; modified: number; removed: number }>`.
- Produces `BankSyncService.handleWebhook(headers, rawBody): Promise<void>`.

- [ ] **Step 1: Write a failing incremental-sync test**

```ts
it('persists only added and modified transactions and advances the cursor', async () => {
  await service.sync(connection.id)
  expect(bankRepository.saveSyncPage).toHaveBeenCalledWith(expect.objectContaining({ cursor: 'next-cursor' }))
  expect(bankRepository.saveTransaction).toHaveBeenCalledTimes(2)
})
```

- [ ] **Step 2: Run the sync test**

Run: `npm test --workspace @umunara/api -- bank-sync-service.test.ts`

Expected: FAIL because synchronization is absent.

- [ ] **Step 3: Implement cursor-based sync and idempotent webhooks**

The sync service must call the provider's cursor endpoint until `has_more` is
false, process added/modified/removed arrays in database transactions, and store
the returned cursor only after the transaction succeeds. The webhook route
verifies the provider request according to its current documented method, records
deduplication metadata, and enqueues/schedules a connection-specific sync. Protect
the internal sync route with a separate server-only secret.

- [ ] **Step 4: Run sync and API tests**

Run: `npm test --workspace @umunara/api -- bank-sync-service.test.ts && npm test --workspace @umunara/web -- plaid-webhook`

Expected: PASS for initial import, incremental modification, removal, duplicate webhook, and disconnected account fixtures.

- [ ] **Step 5: Commit**

```bash
git add packages/api apps/web
git commit -m "feat: add incremental bank synchronization"
```

### Task 4: Build review and reconciliation workflows

**Files:**
- Create: `packages/api/src/bank/reconciliation-service.ts`, `packages/api/src/bank/reconciliation-service.test.ts`, `apps/web/app/api/v1/admin/bank/transactions/route.ts`, `apps/web/app/api/v1/admin/bank/transactions/[id]/classify/route.ts`, `apps/web/app/api/v1/admin/bank/transactions/[id]/reconcile/route.ts`, `apps/web/app/(admin)/admin/bank/page.tsx`, `apps/web/features/bank/bank-review-table.tsx`, `apps/web/features/bank/bank-review-table.test.tsx`, `apps/web/e2e/bank-reconciliation.spec.ts`

**Interfaces:**
- Produces `ReconciliationService.classify(admin, transactionId, classification)`.
- Produces `ReconciliationService.linkPayout(admin, transactionId, donationIds)`.

- [ ] **Step 1: Write a failing double-counting test**

```ts
it('marks a matched Stripe payout without creating another donation', async () => {
  await reconciliationService.linkPayout(adminActor, payoutTransaction.id, [stripeDonation.id])
  expect(donationRepository.create).not.toHaveBeenCalled()
  expect(bankRepository.updateClassification).toHaveBeenCalledWith(payoutTransaction.id, 'processor_payout')
})
```

- [ ] **Step 2: Run the reconciliation test**

Run: `npm test --workspace @umunara/api -- reconciliation-service.test.ts`

Expected: FAIL because review and linking services are absent.

- [ ] **Step 3: Implement admin review screens and transactional reconciliation**

List only paginated transactions with server-side date, amount, account, and
classification filters. The classification route requires `admin`, writes an
audit record, and invalidates only bank/relevant finance summary tags. Linking a
processor payout records `reconciliation_links` in one transaction, prevents a
transaction or donation from being linked incompatibly, and never writes a new
`donations` row. Explicitly classified offline gifts may create a `bank` donation
row that links back to the source transaction.

- [ ] **Step 4: Run end-to-end and full verification**

Run: `npm test --workspace @umunara/api -- reconciliation-service.test.ts && npx playwright test apps/web/e2e/bank-reconciliation.spec.ts && supabase test db --local && npm run typecheck && npm run build`

Expected: PASS; only admins can review data and a matched processor payout does not change donation total.

- [ ] **Step 5: Commit**

```bash
git add packages/api apps/web supabase
git commit -m "feat: add bank reconciliation dashboard"
```
