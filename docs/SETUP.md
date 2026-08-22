# Nabu Setup Guide

Consolidated setup guide for local development and deployment. Supersedes the
old root `SETUP.md` and `docs/LOCAL_SETUP.md`.

## Prerequisites

- Node.js 18+ and npm 9+ (npm is canonical — `package-lock.json` is committed;
  bun/yarn/pnpm locks are gitignored)
- Cloudflare account (for deployment)
- Wrangler CLI: `npm install -g wrangler` (or use `npx wrangler`)

## Installation

```bash
git clone https://github.com/AmmouraMe/nabu.git
cd nabu
npm install
```

## Database Migrations

**Run this before starting development** — apply pending migrations to the
local D1 database:

```bash
npm run db:migrate:local
```

Migrations live in `migrations/` as immutable numbered files
(`0001_initial_schema.sql` …). D1 tracks applied migrations by filename and
skips them on later runs. See `migrations/README.md` for the full rules
(never edit an applied migration — always add a new numbered file).

Other migration commands:

```bash
npm run db:migrate        # Apply pending migrations to remote D1 (production)
npm run db:migrate:list   # Check which migrations have been applied
npx wrangler d1 migrations apply nabu-db --remote --preview  # Pages preview DB
```

Verify tables were created locally:

```bash
wrangler d1 execute nabu-db --local --command="SELECT name FROM sqlite_master WHERE type='table';"
```

## Development Server

```bash
npm run dev
```

The app runs at `http://localhost:4239` (port 4239 — some older docs said
4277; that is wrong).

## Dev Login (no OAuth keys needed)

For local/dev work you can sign in without configuring OAuth:

- On `/auth/login` click **⚡ Virtual login (no keys)** (button only shows in dev).
- Or hit the endpoint directly:
  - `/api/auth/dev` — log in as an **admin** dev user (lands on `/admin`)
  - `/api/auth/dev?admin=0` — log in as a regular (non-admin) user
  - `/api/auth/dev?email=a@b.co&name=Ann&redirect=/brand` — custom identity/landing

Gated by `import.meta.env.DEV`, so it's compiled out (404) in production
builds. A deployed dev/staging Worker can opt in with `ALLOW_DEV_LOGIN=true`
(never set in prod).

## KV Namespace Setup (persistent local storage)

For local development with persistent KV storage (used by the `/setup`
zero-config flow, sessions, caching), create a preview KV namespace:

```bash
# Production KV namespace
wrangler kv:namespace create "KV"

# Preview KV namespace for local dev
wrangler kv:namespace create "KV" --preview
```

The commands print IDs; add them to `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "KV"
id = "abc123..."           # Your production KV ID
preview_id = "xyz789..."   # Your preview KV ID for local dev
```

With the preview namespace in place, credentials saved via `/setup` persist
across dev server restarts. See
[ZERO_ENV_SETUP.md](./ZERO_ENV_SETUP.md) for the full web-based setup flow.

## Security-Critical Configuration

`.env.example` and `.dev.vars.example` list the supported variables. Production
requires a `SESSION_SECRET`; without it the app refuses to issue or accept
sessions. Local development alone can use the compiled-in insecure fallback.
Generate a production value with `openssl rand -base64 32`.

Initial web setup also requires a separate `SETUP_SECRET`. Enter that bootstrap
secret on `/setup`; the API compares it with the bearer credential before it
stores OAuth configuration. Do not reuse `SESSION_SECRET`. Once an owner or
configuration exists, setup is locked and reset is owner-only.

Turnstile is optional, but configure `TURNSTILE_SITE_KEY` and
`TURNSTILE_SECRET_KEY` together or leave both unset. A partial configuration
fails closed.

```env
SESSION_SECRET=generate-with-openssl-rand-base64-32
SETUP_SECRET=generate-a-different-random-value
TURNSTILE_SITE_KEY=your-turnstile-site-key
TURNSTILE_SECRET_KEY=your-turnstile-secret-key
```

OAuth login and account linking use expiring, one-time D1 transactions. Linking
is bound to the authenticated user and current session. Login sessions are
opaque, revocable D1 records; account merges revoke the source account's
sessions.

## OAuth Provider Configuration

If you prefer env vars over the KV-backed `/setup` flow, create `.dev.vars`
in the project root:

```env
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_OWNER_ID=your_github_user_id
```

The app checks environment variables first, then falls back to KV storage.
See [GITHUB_AUTH.md](./GITHUB_AUTH.md) for the full OAuth configuration guide.

## Building & Preview

```bash
npm run build     # Build for production
npm run preview   # Preview the production build (also port 4239)
```

## Deployment to Cloudflare Pages

1. Authenticate: `wrangler login`
2. Deploy: `npm run deploy` (`db:migrate && vite build && wrangler pages deploy
.svelte-kit/cloudflare`)

Migrations run first, and deliberately. The server reads columns the migrations
add — `hooks.server.ts` selects `profile_login` and `profile_avatar_url`, and
the OAuth callbacks write them — so code deployed ahead of its schema does not
fail loudly. The hook treats any error as a bad session, clears the cookie and
carries on, and the callbacks that would let you back in write the same columns.
The symptom is every user logged out and unable to log back in, with nothing in
the logs that looks like an outage.

**This is the caveat for the Pages GitHub integration.** Connecting the
repository gives you automatic deployments that never run `npm run deploy`, so
they never run migrations. If you deploy that way, apply migrations yourself
before merging anything that adds one:

```bash
npm run db:migrate:list   # confirm what is pending
npm run db:migrate
```

Account quirks (details in `AGENTS.md`):

- Set `CLOUDFLARE_ACCOUNT_ID` in env — wrangler sees multiple accounts and
  `wrangler.toml` cannot pin one for Pages projects.
- The R2 bucket (`nabu-files`) is **not yet created** (API not enabled on the
  account); call sites exist but fail at runtime.
- Queues are disabled (Pages can't run consumers) — background work uses the
  cron Worker at `workers/content-cron/` plus `waitUntil`.

For production Pages secrets, use `wrangler pages secret put` (or Cloudflare
Pages settings) rather than the Worker-only `wrangler secret put` command:

```bash
wrangler pages secret put GITHUB_CLIENT_ID
wrangler pages secret put GITHUB_CLIENT_SECRET
wrangler pages secret put GITHUB_OWNER_ID
wrangler pages secret put SESSION_SECRET
wrangler pages secret put SETUP_SECRET
wrangler pages secret put TURNSTILE_SITE_KEY
wrangler pages secret put TURNSTILE_SECRET_KEY
```

Alternatively, use the `/setup` page in production — credentials are saved to
the production KV namespace (see [ZERO_ENV_SETUP.md](./ZERO_ENV_SETUP.md)).

### Deploy the content cron Worker

`npm run deploy` publishes the Pages application only. Weekly content automation
also requires the separate Worker under `workers/content-cron/`. Give the Pages
app and Worker the same independently generated `CRON_SECRET`, then deploy it:

```bash
wrangler pages secret put CRON_SECRET
cd workers/content-cron
wrangler secret put CRON_SECRET
wrangler deploy
```

## Related Documentation

- `AGENTS.md` — command reference, pre-commit gate, Cloudflare account quirks
- `CONTRIBUTING.md` — TDD workflow and contributor guidelines
- [ZERO_ENV_SETUP.md](./ZERO_ENV_SETUP.md) — KV-backed OAuth setup (`/setup`, `/reset`)
- [GITHUB_AUTH.md](./GITHUB_AUTH.md) — GitHub OAuth configuration
- `migrations/README.md` — migration rules and history
