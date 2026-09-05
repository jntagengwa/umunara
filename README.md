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
