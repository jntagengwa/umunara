## Umunara

Umunara is an npm workspace with a deployable Next.js application in
`apps/web`. Configure Vercel with `apps/web` as the root directory.

The existing Create React App source and public assets remain at the repository
root while the application is migrated incrementally.

## Commands

Run these commands from the repository root:

- `npm run dev` starts the Next.js app.
- `npm run typecheck` type-checks all workspaces that define the command.
- `npm run lint` lints all workspaces that define the command.
- `npm test` runs tests in all workspaces that define the command.
- `npm run build` creates a production build of `@umunara/web`.

## Password accounts and email confirmation

The public navigation links to Account, which directs signed-out visitors to
`/sign-in`. New registrations use `/sign-up`. Auth forms call only application
`/api/v1/auth/*` handlers; the server uses the public Supabase key and cookie
sessions. New confirmed accounts remain pending until an administrator approves
their database profile. Sign out is available on the account page.

In Supabase Auth, enable email confirmation, set Site URL to the application
origin, and allow that origin's `/api/v1/auth/confirm` redirect URL. The default
confirmation link supports the PKCE code exchange when opened in the signup
browser. For confirmation across browsers/devices, set the Confirm signup email
template link to:

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email">Confirm your email</a>
```

The callback accepts only email verification tokens or PKCE codes and always
redirects to the application account page. Failed/expired links return to sign
in with an error. Email delivery and Auth rate limits remain configured in
Supabase. Do not disable email confirmation for production.

`apps/web/proxy.ts` renews sessions before rendering and persists refreshed
cookies to both the server request and browser response. Authorization still
validates the Auth user and current database profile on protected requests.

## Required managed authentication rate limits

Password sign-in and signup fail closed with HTTP 503 until managed protection
is configured. This intentionally includes a plain local `next dev` or
`next start`: there is no in-memory or header-based local bypass.

Before enabling these endpoints on Vercel:

1. Create and publish two Vercel Firewall rules with the `@vercel/firewall`
   condition. Use the exact Rate limit IDs `umunara-auth-sign-in` (10 requests
   per 60 seconds) and `umunara-auth-sign-up` (5 requests per 3600 seconds).
   Enable enforcement with the Rate Limit/429 action, not Log. These SDK rules
   must apply to preview and production and must not depend on extra
   client-header conditions.
2. Enable Vercel System Environment Variables. `VERCEL` and `VERCEL_URL` must
   come from the platform. Requests must enter through Vercel's ingress, which
   sets `x-vercel-forwarded-for`; do not emulate this trust on another host.
3. Set a random server-only `RATE_LIMIT_SECRET` of at least 32 characters
   (for example, generate 32 random bytes). Keep it stable across deployments
   so callers cannot reset their quota by moving between deployments.
4. If the system deployment URL is protected, including generated production
   deployment URLs or previews, configure Vercel Protection Bypass for
   Automation and its server-only `VERCEL_AUTOMATION_BYPASS_SECRET`. This
   enables the SDK's internal request; never add a broad Firewall bypass rule.
   Keep this secret stable across deployments too, as it also contributes to
   the SDK's bucket signature.
5. Set `AUTH_RATE_LIMIT_ENABLED=1` only after the rules are published. Verify
   in preview that repeated calls from one caller return 429 and another caller
   remains allowed, then enable production. Missing rules, blocked SDK
   requests, and service failures never fall through to Supabase Auth.

The official `@vercel/firewall` SDK is the only additional dependency. Counts
are managed by Vercel across function instances, on a **per-region** basis,
not globally; traffic through multiple regions can exceed one region's quota.
The application uses only the platform-controlled caller IP and a system
deployment host; raw Host, X-Forwarded-For, X-Real-IP, cookies, and credentials
are not forwarded to choose a bucket. Network address sharing can legitimately
share a quota. Keep Supabase Auth's rate limits and email safeguards enabled
as an additional layer.

The test suite simulates the platform ingress and managed service at the
external boundary. It does not create remote rules or certify their deployment.
The previous loopback-only real Auth smoke runner was removed because it
cannot verify this required deployment protection.

References: [Vercel rate-limiting SDK](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk),
[Vercel request headers](https://vercel.com/docs/headers/request-headers),
and [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).
