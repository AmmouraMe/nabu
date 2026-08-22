# CLAUDE.md - Instructions for Claude Code and AI Assistants

## Contribution Workflow

Every repository in the **AmmouraMe** organization follows the same four steps —
`Ammoura-Svelte`, `nabu`, `teaser`, and anything added later. Humans and AI
agents work the same way.

1. **Start from an issue, and claim it.** Work is tracked in GitHub Issues.
   Before writing code, take the issue: assign yourself, or comment that you
   are picking it up. This is what stops two people — or two agents — landing
   on the same work.
2. **Work on a branch.** Never commit to `main`. Cut `feature/<short-name>` for
   new work or `fix/<short-name>` for a bug. Include the issue number when it
   helps: `fix/12-uspto-trademark-check`.
3. **Open a draft PR early.** As soon as there is a first commit, open the pull
   request **as a draft**. Do not wait until the work is done. An early draft
   shows what is in flight, gives CI somewhere to run, and lets reviewers
   comment before the design hardens. Link the issue in the body (`Closes #12`)
   so it closes on merge.
4. **Finish, then mark ready for review.** When the feature or fix is complete
   and the quality gates are green, update the PR description to say what
   actually landed, then take it out of draft and mark it **Ready for review**.

In short: the issue says _what_, the branch holds _how_, the draft PR shows
_progress_, and "ready for review" means _done_.

## Database Migrations - MANDATORY RULES

**NEVER modify migration files that have already been committed to `main`.**

Migration files in `migrations/` are immutable once applied. Cloudflare D1 tracks applied migrations by filename in a `d1_migrations` table. Editing an applied migration will cause checksum mismatches, deployment failures, and potential data loss.

### When you need to change the database schema:

1. Find the highest-numbered migration in `migrations/`
2. Create a NEW file: `migrations/NNNN_description.sql` (next number in sequence)
3. Use `ALTER TABLE` to modify existing tables
4. Test with `npm run db:migrate:local`

### Never do this:

- Edit `migrations/0001_initial_schema.sql` or any other existing migration
- Delete or rename migration files
- Reorder migrations
- Drop tables without explicit user approval

See `migrations/README.md` for the full migration guide.

## Web App Icons — Full Set Required (IMPORTANT)

Nabu is built on NebulaKit; this is a NebulaKit standard (see NebulaKit `AGENTS.md` §6 and `docs/INITIAL_CUSTOMIZATION.md`) and applies here too.

**A tab favicon alone is not enough.** Phone home-screen tiles and PWA installs ignore `<link rel="icon">` — they read `apple-touch-icon` and the web manifest. Without them, phones show a generated letter-monogram tile instead of the Nabu logo (this is exactly what happened on davis9001.dev before it was fixed).

**Shipped (2026-07-23).** The full set now lives in `static/` and is wired into `src/app.html`:

- Tiles/PWA: `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`, and `site.webmanifest` — teal N on a solid `#0a0a0a` background (the app's dark `--color-background`, which is also `theme_color`/`background_color` and the `<meta name="theme-color">`).
- Tab favicon: `favicon.svg` stays the primary scalable icon; `favicon.ico` (16/32/48) is the legacy fallback; `favicon-light.png` / `favicon-dark.png` switch on `prefers-color-scheme` (dark brightens the darker teal shape so the N stays legible on a near-black tab strip).

**Regenerate after any logo change:** `node scripts/generate-icons.mjs` (rasterizes `static/logo.svg`'s mark via `sharp`; packs the `.ico` via ImageMagick's `magick`). The script is the source of truth for backgrounds/sizes — edit it, don't hand-edit the PNGs. Tiles/installed-app icons are static and cannot switch on `prefers-color-scheme`; only the tab favicon can. Reference implementation this was modeled on: `davis9001.dev-sveltekit` `src/app.html` + `static/`.

## Social Share Cards — Regenerate After Copy or Logo Changes

A link with no `og:image` renders on every platform as a grey box with a URL in
it, which is a worse advertisement than not being shared. `src/lib/components/Seo.svelte`
emits the full set — Open Graph, Twitter, canonical — and every **public** page
renders it.

- **Images** live in `static/og/` (`default.png`, `name.png`, `pricing.png`) at
  1200×630. Regenerate with `node scripts/generate-og-images.mjs` after changing
  the logo or a card's copy. The script is the source of truth for layout and
  wording — edit it, don't hand-edit the PNGs. Needs `sharp` installed ad hoc,
  same as `generate-icons.mjs`; neither CI nor the deploy needs it, because the
  output is committed.
- **They are static on purpose.** Rendering per request means shipping satori +
  resvg WASM into a Worker with no other image pipeline, for images that change
  roughly never, while a crawler fetching a committed PNG from the CDN gets it in
  one hop with no cold start.
- **Private pages must not get a card.** `src/routes/+layout.svelte` emits
  `noindex, nofollow` for everything under `PRIVATE_PREFIXES` (`/admin`, `/auth`,
  `/brand`, `/chat`, `/onboarding`, `/profile`, `/reset`, `/setup`, `/videos`).
  A link to somebody's brand dashboard should not unfurl into a rich preview in
  whatever chat it lands in. Add new private routes to that list, or under an
  existing prefix.
- `og:image` **must be absolute** — crawlers drop relative paths and fall back to
  the grey box. `Seo.svelte` builds it from `$page.url.origin`, so previews work
  on production, preview deploys and localhost alike. `tests/unit/seo.test.ts`
  pins this, along with the noindex behaviour.
