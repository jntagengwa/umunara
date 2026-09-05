# Umunara Platform Design

## Purpose

Convert the existing Create React App frontend into a TypeScript monorepo with
one Next.js application deployed as one Vercel project. The application will
contain both the website and its API. Supabase supplies PostgreSQL, Auth, and
Storage; browsers do not query application tables directly.

The rebuilt platform supports public ministry content, approved-member content,
editorial administration, events, a fixed-content CMS, donations through Stripe
and PayPal, and read-only US business-bank transaction reporting through Plaid.

## Constraints

- Deploy one Next.js application and one domain from `apps/web` on Vercel.
- Preserve the current uncommitted visual redesign and migrate it rather than
  replacing it with a new design.
- Build the missing backend from scratch; no legacy backend source is available.
- Use strict TypeScript for all new or migrated application code.
- Keep database credentials, service-role credentials, payment secrets, and bank
  access tokens server-only.
- Treat Supabase as the database, Auth provider, and object storage provider;
  the application API owns all business logic and browser-facing data access.
- Store monetary values as integer minor units with ISO 4217 currency codes.
- Provide operational donation reporting, not formal accounting or tax advice.

## Monorepo Layout

```text
umunara/
├── apps/
│   └── web/                 Next.js UI and `/api/v1` route handlers
├── packages/
│   ├── api/                 services, authorization, webhook handlers
│   ├── database/            Supabase clients, typed repositories, generated types
│   ├── schemas/             shared request/response schemas and DTOs
│   ├── ui/                  accessible shared components and design tokens
│   └── config/              shared TypeScript, ESLint, and test configuration
└── supabase/
    ├── migrations/          reproducible database changes
    ├── seed.sql             local development seed data
    └── tests/               pgTAP RLS and permission tests
```

`apps/web` is the only deployed application. Route handlers are deliberately
thin: they authenticate a request, validate its input, call a service in
`packages/api`, and translate the result to an HTTP response. Domain services
enforce authorization, coordinate repositories, invalidate cache tags, and
write audit entries. Repositories in `packages/database` are the only code that
directly accesses Supabase data.

## Roles and Authorization

| Role | Access |
| --- | --- |
| `pending` | Signed in and email-verified; awaiting administrator approval. |
| `member` | Private posts, downloads, recordings, and member-only event registration. |
| `editor` | Member permissions plus posts, events, media, and fixed-site-content editing. |
| `admin` | Full access, including member approvals, roles, financial reporting, bank connections, and audit history. |

An account begins as `pending` after email verification. An administrator must
approve it before private content or member-event access is granted. Role and
approval changes are recorded in the audit log. Every API endpoint checks the
role on the server; hiding controls in the UI is never an authorization check.

Supabase Auth provides cookie-based sessions. A `profiles` record, keyed by
`auth.users.id`, stores the application role and approval state. Row Level
Security and explicit table grants provide a second permission boundary for all
exposed tables. Service-role access is used only in server-side repository code.

## Data Model

### Content and membership

- `profiles`: identity fields, role, approval state, and approval metadata.
- `posts`: title, slug, excerpt, content, author, category, publish state,
  visibility (`public` or `member`), and publication timestamps.
- `categories`: named post categories and presentation metadata.
- `events`: title, description, schedule, location or online link, capacity,
  visibility, and publishing state.
- `event_registrations`: event, member, status, and attendance metadata.
- `resources`: protected download, audio, and video metadata, visibility, and
  the associated Storage object.
- `media_assets`: Storage object metadata, alt text, dimensions, visibility,
  and ownership.
- `site_settings`: typed fixed setting records such as hero text, hero image,
  conference imagery, mission/contact details, and social links. This is not a
  page builder.
- `audit_log`: actor, action, target, timestamp, and safe structured metadata.

Private Storage buckets are used for member resources. The API issues short-lived
signed URLs only after it verifies the caller's role. Public media is served
through public assets or appropriately cached image delivery.

### Financial data

- `donations`: one normalized ledger row per gift or adjustment, including
  provider, provider reference, gross amount, fee amount, net amount, currency,
  status, cadence, received time, and optional donor identity.
- `donation_events`: immutable, deduplicated provider webhook/event records used
  for signature verification, replay protection, and forensic audit.
- `bank_connections`: administrator-authorized Plaid connection metadata,
  encrypted provider identifiers, connection state, and last sync cursor.
- `bank_accounts`: permitted account metadata without account numbers.
- `bank_transactions`: incrementally imported transaction rows, categorization,
  and reconciliation state.
- `reconciliation_links`: explicit links between imported payout/credit rows and
  Stripe, PayPal, manual, or bank-derived donation records.

The donation dashboard reports gross gifts, fees, refunds, net giving, provider
mix, recurring versus one-time gifts, monthly/yearly totals, growth rates, and
time-series trends. Plaid data is presented as imported bank activity until an
administrator classifies or reconciles it. A processor payout is never treated
as a second donation when it matches gifts already recorded through Stripe or
PayPal.

## API Design

All browser traffic uses versioned handlers under `/api/v1`. The initial API
surface covers:

- session and current-profile endpoints;
- public and member content reads;
- admin CRUD for posts, events, resources, media, and fixed site settings;
- membership applications, approval, and role management;
- member event registration;
- donation checkout initiation and donation-report reads;
- Stripe, PayPal, and Plaid webhook endpoints;
- Plaid connection, synchronization, classification, and reconciliation flows.

Request and response DTOs are defined once in `packages/schemas`. Every mutation
validates input at the API boundary, returns a typed success or safe error
response, and is authorized by the calling role. Table endpoints paginate,
filter, and sort on the server; the browser never downloads complete admin
tables merely to render one page.

## Payments and Bank Reporting

The application supports both payment providers behind the same donation domain
model:

- Stripe supports one-time and recurring giving with verified webhooks.
- PayPal uses a server-created checkout/subscription integration, not only the
  existing hosted form, so completed, failed, refunded, and reversed events can
  update the same ledger.
- Webhook handlers preserve the raw request body when required, verify the
  provider signature before parsing or acting, write an idempotency record, and
  process each provider event exactly once.
- Plaid is used only for read-only US business-bank account access. Its
  transaction synchronization uses stored cursors and provider webhooks rather
  than repeated full imports.
- An administrator connects a bank through the provider's consent flow.
  No bank credentials or account/routing numbers are stored by Umunara.
- A review queue lets administrators classify unknown credits as a donation,
  non-donation, or processor payout and explicitly match them to ledger rows.

Provider outages, delayed settlement, duplicate delivery, refunds, reversals,
and failed subscriptions must leave an auditable, recoverable state. A scheduled
reconciliation job is a safety net for missed webhook delivery; it must not
poll ordinary website content or re-fetch unrelated tables.

## Caching and Client State

Database state is cached on the server, not duplicated in a client global store.
Server-rendered public and member data is read through tagged data services:

- `posts:public`, `posts:member`, and `post:<slug>`;
- `events:public`, `events:member`, and `event:<id>`;
- `site-settings:<surface>`;
- `resources:member` and `resource:<id>`;
- narrow administrative report tags such as `donations:summary:<period>`.

After a successful write, the responsible domain service invalidates only the
tags representing changed data. Create, update, delete, publish, membership
approval, webhook processing, and bank synchronization therefore refresh their
affected views without expiring unrelated tables. Interactive writes use
read-your-writes invalidation so the author sees the saved state immediately.

Zustand stores only client-owned state: menus, filters, pagination preferences,
optimistic UI state, and short-lived draft interactions. It is not a copy of the
database. This division keeps client JavaScript small, eliminates conflicting
sources of truth, and avoids re-querying data that has not changed.

## Failure Handling and Security

- Input validation, role checks, and rate limits protect API endpoints.
- Webhook endpoints use provider-specific signature verification and idempotency
  keys; invalid signatures are rejected without data changes.
- Logs must not include passwords, sessions, API tokens, raw bank payloads, or
  unnecessary donor personally identifiable information.
- Administrative deletion uses confirmation and recoverable archival where the
  domain supports it; financial ledger events remain immutable adjustments.
- UI routes provide loading, empty, unauthorized, not-found, and recoverable
  error states.
- Database migrations enable RLS, set least-privilege grants, and include allow
  and deny tests for anonymous, pending, member, editor, and admin contexts.

## Migration and Rollout

1. Establish the workspace tooling and move the existing frontend into
   `apps/web` without losing its current redesign assets or behavior.
2. Introduce strict TypeScript and convert the route shell to Next.js App Router.
3. Create the Supabase schema, generated types, repositories, RLS policies, and
   local seed data.
4. Build the API domain services and migrate the legacy REST features one by
   one: authentication, posts/categories, members, registrations, and events.
5. Add approved-member access, private Storage resources, and the admin CMS.
6. Add Stripe/PayPal checkout, verified webhooks, normalized donation reporting,
   and provider reconciliation.
7. Add Plaid bank connection, incremental synchronization, review, and matching.
8. Configure Vercel environment variables and validate a single-project build
   and deployment.

The Supabase database begins clean because the old backend code and export are
unavailable. Migrations and import boundaries remain structured so a future
legacy-data export can be safely imported.

## Verification Criteria

- Workspace install, type check, lint, formatting check, test suite, and
  production build all pass.
- Unit tests cover validation, roles, cache tag selection, donation normalization,
  and reconciliation rules.
- API integration tests cover authorization, pagination, filtering, mutations,
  recoverable errors, and idempotent webhook delivery.
- pgTAP RLS tests prove both allowed and denied behavior for every role.
- Webhook fixtures cover success, duplicate delivery, retry, refund, reversal,
  failed renewal, and invalid signature handling for Stripe and PayPal.
- Plaid fixtures cover initial and incremental sync, duplicate transaction
  handling, disconnection, and reconciliation.
- End-to-end tests cover public browsing, signup and approval, member content,
  administration, event registration, donation flows, and bank reconciliation.
- Accessibility and responsive checks cover all new and migrated user flows.
- Cache tests prove unchanged data remains cached while the affected content
  refreshes after a mutation or provider event.
