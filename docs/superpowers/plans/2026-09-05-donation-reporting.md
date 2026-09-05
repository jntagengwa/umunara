# Umunara Donation Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure Stripe and PayPal one-time/recurring donation flows, a normalized immutable ledger, and an admin reporting dashboard.

**Architecture:** Payment providers are adapters behind one donation service. Verified idempotent webhooks append provider events and upsert normalized donation state; the UI consumes narrow aggregate endpoints and cache tags rather than raw payment data.

**Tech Stack:** Next.js Route Handlers, Supabase/Postgres, Zod, Stripe SDK, PayPal REST APIs, Vitest, Playwright, provider webhook fixtures.

**Spec:** `docs/superpowers/specs/2026-09-05-umunara-platform-design.md`

## Global Constraints

- Amounts are integer minor units with ISO 4217 currency codes.
- Never trust a browser redirect as payment success; verified provider webhooks are authoritative.
- Persist idempotency before applying an event and never log provider secrets or raw card/bank data.
- Financial records are immutable adjustments; no hard deletion of donations or webhook events.
- Only admins may read donor-level reports or manage finance configuration.

---

### Task 1: Add immutable donation schema and normalization contracts

**Files:**
- Create: `supabase/migrations/<timestamp>_donations.sql`, `supabase/tests/donations_rls.test.sql`, `packages/schemas/src/donations.ts`, `packages/schemas/src/donations.test.ts`, `packages/database/src/repositories/donation-repository.ts`, `packages/api/src/donations/types.ts`
- Modify: `packages/schemas/src/index.ts`, `packages/database/src/index.ts`

**Interfaces:**
- Produces `DonationProvider = 'stripe' | 'paypal' | 'manual' | 'bank'` and `DonationStatus = 'pending' | 'succeeded' | 'failed' | 'refunded' | 'reversed'`.
- Produces `DonationRepository.recordEvent(event)` and `DonationRepository.upsertDonation(input)`.

- [ ] **Step 1: Write a failing normalization test**

```ts
it('normalizes a provider amount without floating point values', () => {
  expect(normalizeDonation({ provider: 'stripe', amountMinor: 2500, currency: 'usd' })).toMatchObject({
    grossAmountMinor: 2500,
    currency: 'USD',
    status: 'succeeded',
  })
})
```

- [ ] **Step 2: Run the contract test**

Run: `npm test --workspace @umunara/schemas -- donations.test.ts`

Expected: FAIL because donation contracts are absent.

- [ ] **Step 3: Implement tables, indexes, and RLS**

Create `donations`, `donation_events`, and `donation_adjustments` with unique
`(provider, provider_event_id)` and `(provider, provider_reference)` constraints.
Grant donor-level access to admins only; expose no direct browser table access.
Add indexes on `(received_at desc)`, `(provider, status)`, and month aggregation
expressions used by reporting. Ensure event insertion and donation upsert execute
in one transaction.

- [ ] **Step 4: Run database and contract tests**

Run: `supabase test db --local && npm test --workspace @umunara/schemas -- donations.test.ts`

Expected: PASS; duplicate provider events violate the unique constraint and non-admin reads are denied.

- [ ] **Step 5: Commit**

```bash
git add supabase packages/schemas packages/database packages/api
git commit -m "feat: add donation ledger schema"
```

### Task 2: Implement Stripe checkout and verified webhook ingestion

**Files:**
- Create: `packages/api/src/donations/stripe-adapter.ts`, `packages/api/src/donations/donation-service.ts`, `packages/api/src/donations/stripe-adapter.test.ts`, `apps/web/app/api/v1/donations/stripe/checkout/route.ts`, `apps/web/app/api/v1/webhooks/stripe/route.ts`, `apps/web/features/donations/stripe-donation-form.tsx`, `apps/web/e2e/stripe-donation.spec.ts`

**Interfaces:**
- Produces `DonationService.createStripeCheckout(input): Promise<{ checkoutUrl: string }>`.
- Produces `DonationService.handleStripeEvent(rawBody, signature): Promise<void>`.

- [ ] **Step 1: Write a failing duplicate-webhook test**

```ts
it('records a Stripe checkout completion only once', async () => {
  await service.handleStripeEvent(fixture.rawBody, fixture.signature)
  await service.handleStripeEvent(fixture.rawBody, fixture.signature)
  expect(donationRepository.upsertDonation).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run the adapter test**

Run: `npm test --workspace @umunara/api -- stripe-adapter.test.ts`

Expected: FAIL because Stripe ingestion is absent.

- [ ] **Step 3: Implement checkout and raw-body webhook verification**

Create Checkout Sessions for `payment` or `subscription` based on a validated
cadence enum. Set provider metadata to the internal donation intent ID. The
webhook route reads `await request.text()`, verifies `Stripe-Signature`, records
the event id atomically, normalizes completed/refunded/failed events, and
invalidates only `donations:summary:<period>` tags after committed changes.

- [ ] **Step 4: Run webhook and browser tests**

Run: `npm test --workspace @umunara/api -- stripe-adapter.test.ts && npx playwright test apps/web/e2e/stripe-donation.spec.ts`

Expected: PASS for valid completion, invalid signature, duplicate event, refund,
and recurring-payment success fixtures.

- [ ] **Step 5: Commit**

```bash
git add packages/api apps/web
git commit -m "feat: add Stripe donation flow"
```

### Task 3: Implement PayPal checkout, subscriptions, and webhook ingestion

**Files:**
- Create: `packages/api/src/donations/paypal-adapter.ts`, `packages/api/src/donations/paypal-adapter.test.ts`, `apps/web/app/api/v1/donations/paypal/order/route.ts`, `apps/web/app/api/v1/donations/paypal/order/[id]/capture/route.ts`, `apps/web/app/api/v1/webhooks/paypal/route.ts`, `apps/web/features/donations/paypal-donation-button.tsx`, `apps/web/e2e/paypal-donation.spec.ts`

**Interfaces:**
- Produces `DonationService.createPayPalOrder(input)` and `capturePayPalOrder(orderId)`.
- Produces `DonationService.handlePayPalEvent(rawBody, headers)`.

- [ ] **Step 1: Write a failing PayPal reversal test**

```ts
it('changes a completed PayPal donation to reversed from a verified event', async () => {
  await service.handlePayPalEvent(reversalFixture.rawBody, reversalFixture.headers)
  expect(donationRepository.upsertDonation).toHaveBeenCalledWith(expect.objectContaining({ status: 'reversed' }))
})
```

- [ ] **Step 2: Run the PayPal adapter test**

Run: `npm test --workspace @umunara/api -- paypal-adapter.test.ts`

Expected: FAIL because PayPal integration is absent.

- [ ] **Step 3: Implement server-owned PayPal calls**

The client receives only a public PayPal SDK configuration and order ID. Server
routes create/capture orders and create subscriptions using PayPal credentials.
The webhook route preserves exactly the received payload for PayPal verification,
deduplicates event IDs, and maps captures, refunds, reversals, successful
subscription payments, and failed subscription payments into the shared ledger.

- [ ] **Step 4: Run provider fixtures and end-to-end tests**

Run: `npm test --workspace @umunara/api -- paypal-adapter.test.ts && npx playwright test apps/web/e2e/paypal-donation.spec.ts`

Expected: PASS for payment completion, refund, reversal, duplicate delivery,
failed renewal, and invalid signature.

- [ ] **Step 5: Commit**

```bash
git add packages/api apps/web
git commit -m "feat: add PayPal donation flow"
```

### Task 4: Build cache-aware donation reporting

**Files:**
- Create: `packages/api/src/donations/reporting-service.ts`, `packages/api/src/donations/reporting-service.test.ts`, `apps/web/app/api/v1/admin/donations/summary/route.ts`, `apps/web/app/(admin)/admin/donations/page.tsx`, `apps/web/features/donations/donation-dashboard.tsx`, `apps/web/features/donations/donation-dashboard.test.tsx`, `apps/web/e2e/donation-dashboard.spec.ts`

**Interfaces:**
- Produces `ReportingService.getSummary(actor, range): Promise<DonationSummaryDto>`.
- `DonationSummaryDto` includes gross/net/refunds/fees, provider mix, cadence mix, monthly series, and comparison growth percentage.

- [ ] **Step 1: Write a failing aggregate test**

```ts
it('does not count a refunded donation in net giving', async () => {
  const summary = await reportingService.getSummary(adminActor, { from: '2026-01-01', to: '2026-01-31' })
  expect(summary.netAmountMinor).toBe(7500)
  expect(summary.refundedAmountMinor).toBe(2500)
})
```

- [ ] **Step 2: Run reporting tests**

Run: `npm test --workspace @umunara/api -- reporting-service.test.ts`

Expected: FAIL because aggregate queries are absent.

- [ ] **Step 3: Implement server aggregation and narrowly invalidated dashboard cache**

Aggregate only normalized ledger records through parameterized repository queries.
Require `admin` before returning donor-level lists; default dashboard totals do
not expose donor identity. Cache each requested period with
`donations:summary:<from>:<to>` and invalidate matching active summary tags after
ledger mutations. Render charts from aggregate DTOs, not provider raw payloads.

- [ ] **Step 4: Run dashboard tests and full production checks**

Run: `npm test --workspace @umunara/web -- donation-dashboard.test.tsx && npx playwright test apps/web/e2e/donation-dashboard.spec.ts && npm run typecheck && npm run build`

Expected: PASS; non-admins receive 403 and admin totals refresh after a verified webhook.

- [ ] **Step 5: Commit**

```bash
git add packages/api apps/web
git commit -m "feat: add donation reporting dashboard"
```
