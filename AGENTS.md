# AGENTS.md

**Canonical agent guidance for this repo lives in [CLAUDE.md](CLAUDE.md)** — read it first. It contains the mandatory D1 migration rules (applied migrations are immutable), commands, and architecture notes.

Quick facts: Nabu is a content-creation automation platform — SvelteKit 2/Svelte 5 on Cloudflare Pages with D1. Package manager is npm; dev server is pinned to port **4239**.

```bash
npm install
npm run dev              # dev server on :4239
npm run build            # → .svelte-kit/cloudflare
npm run check            # svelte-check
npm run test             # vitest run
npm run test:e2e         # playwright
npm run db:migrate:local # apply migrations to local D1 before touching prod
npm run deploy           # build + wrangler pages deploy
```

Run a single test: `npx vitest run tests/<file>.test.ts` or `npx vitest run -t "<name>"`.

## Related projects

This repo is part of the multi-repo workspace at the parent directory (each sibling is its own git repo):

- [../CLAUDE.md](../CLAUDE.md) — workspace map of all sibling projects
- [../NebulaKit/AGENTS.md](../NebulaKit/AGENTS.md) — the SvelteKit+Cloudflare starter template Nabu derives from
- [../Guides/AGENTS.md](../Guides/AGENTS.md), [../sortalizer/AGENTS.md](../sortalizer/AGENTS.md) — sibling NebulaKit-derived apps sharing the same stack and migration conventions
