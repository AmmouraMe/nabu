# Public API

**The reference lives on the site: https://nabu.ammoura.me/docs/api**

Machine-readable: https://nabu.ammoura.me/api/v1/openapi.json

This file used to duplicate that reference in prose. It no longer does, on purpose —
two hand-maintained descriptions of one API is how documentation starts lying, which
is the problem the setup below exists to solve.

## How the docs stay true

`src/lib/api-spec.ts` is the single source of truth. Four things read it:

| Consumer                           | What it takes                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| `src/lib/server/api-keys.ts`       | `ALL_SCOPES` — the docs show the values the guard enforces, not a copy of them |
| `src/lib/server/logo-prompt.ts`    | `LOGO_STYLES`                                                                  |
| `src/routes/docs/api/+page.svelte` | Everything; the page renders the spec rather than restating it                 |
| `src/routes/api/v1/openapi.json`   | Everything; OpenAPI 3.1 generated from the same definitions                    |

`tests/unit/api-spec-drift.test.ts` is what makes it stick. It discovers routes through
Vite's module graph and fails the build when:

- a route exists under `/api/v1` with no spec entry
- a spec entry names a route that does not exist
- a route's **exported** handlers do not match the methods the spec declares
- a scope or logo style has no description
- a v1 data endpoint has no scope, or a key-management endpoint has one

Reading exports rather than grepping for `export const GET` means a handler that is
defined but never exported cannot slip through.

## Adding an endpoint

1. Write the route under `src/routes/api/v1/…`.
2. Add its entry to `V1_ENDPOINTS` in `src/lib/api-spec.ts`.

Skip step 2 and the test fails by name. The site page and the OpenAPI document both
pick it up with no further work.

Meta endpoints that describe the API rather than operating on data go in
`META_ENDPOINTS`, which is exempt from the scope requirement. Session-authenticated
key management goes in `KEY_ENDPOINTS`.
