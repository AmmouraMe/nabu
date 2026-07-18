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

**Current gap:** Nabu ships only `static/favicon.svg`. Before launch, generate from the Nabu logo and wire into `src/app.html`:

- `apple-touch-icon.png` (180×180) — solid background (transparent → black on iOS); match `theme-color`.
- Manifest icons `icon-192.png` + `icon-512.png` and a `site.webmanifest` (`name`/`short_name` = the app name, `display: standalone`, `theme_color`/`background_color`).
- Light + dark tab favicons via `<link rel="icon" media="(prefers-color-scheme: …)">`, with a no-media default (default to dark).
- `<link rel="apple-touch-icon">`, `<link rel="manifest">`, and `<meta name="apple-mobile-web-app-title">`.

Tiles/installed-app icons are static — they cannot switch on `prefers-color-scheme`; only the tab favicon can. Reference implementation: `davis9001.dev-sveltekit` `src/app.html` + `static/`.
