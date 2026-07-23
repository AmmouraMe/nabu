# CLAUDE.md - Instructions for Claude Code and AI Assistants

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
