# AGENTS.md — Nabu

SvelteKit 2 marketing automation platform on Cloudflare Workers/Pages. Built on
[NebulaKit](https://github.com/starspacegroup/NebulaKit).

## Quick commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Dev server on **port 4239** (not 4277 as some docs say) |
| `npm run check` | `svelte-kit sync && svelte-check` |
| `npm run test` | Vitest (happy-dom, `pool: 'forks'`, single-thread) |
| `npm run test:e2e` | Playwright on `localhost:4239` |
| `npm run test:coverage` | Enforces **95%** threshold (vite.config.ts, not 90%) |
| `npm run validate:contrast` | WCAG AA theme contrast check |
| `npm run deploy` | `vite build && wrangler pages deploy .svelte-kit/cloudflare` |

## Pre-commit order

`npm run check` → `npm run test:coverage` → `npm run validate:contrast`

CI runs check + coverage + contrast in one job, then e2e separately.

## Local testing & package manager notes

- Use **npm** (package-lock.json committed and canonical). bun/yarn/pnpm locks are gitignored (see `.gitignore`).
- E2E: first `npx playwright install chromium` (or full `npx playwright install`).
- This machine's Playwright cache is partially corrupted (missing Framework dylibs for headless_shell). Workaround (no source change): set env var before running E2E:
  ```
  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Users/donaldfilimon/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' npm run test:e2e
  ```
- Alternative: `rm -rf ~/Library/Caches/ms-playwright && npx playwright install` (re-downloads; may require network + time).
- **Never** commit machine-specific paths, symlinks, or `launchOptions`/`executablePath` to `playwright.config.ts`. Use `PLAYWRIGHT_*_EXECUTABLE_PATH` env vars or external symlinks for local dev only.
- `npm run test:e2e` may fail locally due to browser setup; acceptable if documented. CI uses clean Linux images (see `.github/workflows/ci.yml`).

## Database (D1)

**Migrations are immutable once committed to `main`.** Create new numbered files only:

```
migrations/0003_description.sql
```

| Command | What it does |
|---------|-------------|
| `npm run db:migrate:local` | Apply pending to local D1 |
| `npm run db:migrate` | Apply pending to remote D1 |
| `npm run db:migrate` applies **production only**; preview DB needs `--remote --preview` |

See `CLAUDE.md` and `migrations/README.md` for full rules.

## Cloudflare account quirks

- **Ammoura account** (`756e4c695a0301d24f0440b9dd3741f7`). Must set
  `CLOUDFLARE_ACCOUNT_ID` in env (wrangler sees 4 accounts; `wrangler.toml` cannot
  pin one for Pages projects).
- **R2 bucket** (`nabu-files`) is **not yet created** (API not enabled on account).
  Call sites exist; they fail at runtime.
- **Queues** are disabled (Pages can't run consumers).
- **Cron trigger** lives in a separate Worker at `workers/content-cron/` (Pages
  rejects `[triggers]`). Deploys independently.

## Auth

- Local dev: `/api/auth/dev` — no OAuth keys needed (gated by `import.meta.env.DEV`).
  Targets: `/api/auth/dev` (admin), `?admin=0` (regular), `?email=&name=&redirect=` (custom).
- Production: GitHub, Google, Discord OAuth via `@auth/sveltekit`.
- Owner IDs: `GITHUB_OWNER_ID=72961` (davis9001), `DISCORD_OWNER_ID=293484886726279168`.

## Code style

- **Prettier**: tabs, single quotes, no trailing commas, printWidth 100
- **TypeScript**: strict, explicit types (no `any`), `moduleResolution: bundler`
- **Colors**: always use CSS variables (`var(--color-*)`), never hex/rgb literals
- **Testing**: `vitest` globals, `@testing-library/svelte`, `happy-dom`
- **Components**: PascalCase; files: kebab-case

## Icon regeneration

After logo changes: `node scripts/generate-icons.mjs` (requires `sharp` + ImageMagick `magick`).
Don't hand-edit PNGs. See `CLAUDE.md` for the full set in `static/`.

## Key env vars

`.env.example` lists all required vars. `AUTH_SECRET` (openssl rand -base64 32) and
OAuth keys are the main ones for local dev.

## Local testing & package manager notes

- Use **npm** (package-lock.json committed and canonical). bun/yarn/pnpm locks are gitignored (see `.gitignore`).
- E2E browser setup: `npx playwright install chromium` (or full `npx playwright install`).
- This machine's Playwright cache is partially corrupted (missing Framework dylibs for headless_shell). Workaround (no source change):
  ```
  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Users/donaldfilimon/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' npm run test:e2e
  ```
- Alternative: `rm -rf ~/Library/Caches/ms-playwright && npx playwright install` (re-downloads; may require network + time).
- **Never** commit machine-specific paths, symlinks, or `launchOptions`/`executablePath` to `playwright.config.ts`. Use `PLAYWRIGHT_*_EXECUTABLE_PATH` env vars or external symlinks for local dev only.
- `npm run test:e2e` may fail locally due to browser setup; acceptable if documented. CI uses clean Linux images (see `.github/workflows/ci.yml`).

## Key files

- `CLAUDE.md` — migration and icon rules (authoritative)
- `migrations/README.md` — full migration guide
- `wrangler.toml` — Cloudflare bindings (DB, KV, R2, AI)
- `workers/content-cron/wrangler.toml` — cron scheduler config
- `vite.config.ts` — test config (coverage, pool, setup)