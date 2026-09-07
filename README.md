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
