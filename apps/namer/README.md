# Namer — Nabu's public brand-name generator

A single free page where anyone can generate brand names against Nabu's own
naming guidelines. No account, no key, no database.

It exists as a way in: someone who names their brand here has already done step
one of onboarding, and the page points at Nabu for the rest.

## What it does

Takes a description of what you are building (plus, optionally, an audience and
one of Jung's twelve archetypes) and returns six names. Each comes back with its
meaning, how it sounds, how it fares on the radio test, any translation
collision, and a domain to try.

## The guidelines

The nine heuristics are David's, from the planning repo's
`design/brand/naming.md`. They are duplicated as a literal in `src/naming.ts`
because the planning repo is a separate git repo that this one deliberately
ignores — there is no import path between them. **If that file changes, change
`NAMING_HEURISTICS` to match**; its wording is what the model is actually told.

The psychology layered on top — phonaesthetics, the Von Restorff effect, the
twelve archetypes — is the same framing the Brand Architect uses in
`src/lib/services/onboarding.ts`, so a name from this tool survives the
conversation the full product would have about it.

### Computed, not claimed

Three of the nine are arithmetic, and this repo answers them itself rather than
asking the model: **syllable count**, **alphabetical rank**, and **typability**.
An LLM scoring its own output against a checklist grades itself generously. The
model is asked only for what needs language sense — meaning, sound, translation
risk — and its answers to the other three are discarded if it offers them.

## Availability checks

Every name is then checked for real, by `POST /api/check` — one request per
name, so a slow registry holds up its own card and nothing else. That split also
keeps each request under Cloudflare's 50-subrequest limit, which six names at ten
lookups apiece would otherwise blow straight through.

**One rule governs the whole thing: there are three states, never two.** A check
is `taken`, `available`, or `unchecked` — and anything that is not an
unambiguous positive or negative becomes `unchecked`. Timeouts, rate limits,
500s, unrecognised bodies: all unchecked. The failure worth designing against is
telling someone a registered name is free.

### Domains

RDAP, the protocol that replaced WHOIS — free, no key. The URLs in
`RDAP_REGISTRIES` are the authoritative registry for each TLD, taken from
[IANA's bootstrap](https://data.iana.org/rdap/dns.json) and verified in both
directions (200 for a registered domain, 404 for a free one). Checked: `.com`,
`.net`, `.org`, `.app`, `.dev`, `.ai`.

**`.io`, `.co`, `.me` and `.sh` are deliberately absent** — they publish no RDAP
service at all, so a lookup cannot tell "free" from "unsupported". This is not
hypothetical: `ardor.io` is registered and parked, yet every RDAP lookup for it
404s. Guessing there would report a for-sale domain as available. The page names
these TLDs as unchecked rather than staying silent, so their absence is not read
as a clean bill.

Going direct to each registry rather than through the `rdap.org` redirector
avoids a third-party dependency that was observed failing intermittently during
testing.

### Handles

GitHub, Bluesky and npm, because those three answer honestly without
authentication.

Instagram and TikTok are **not** checked and cannot be: both return 200 for a
free handle and a taken one alike, so there is no signal to read. X does
distinguish them, but only from a residential IP — from a datacenter it is
scraping that will be blocked, and it is against their terms. Reddit blocks
datacenter IPs outright. Rather than ship a check that silently rots, the page
simply does not claim anything about them.

GitHub needs `GITHUB_TOKEN` set. Anonymously it allows 60 requests/hour per IP,
and a Pages Function shares its egress IP with every other Worker on that edge,
so without a token GitHub reports unchecked and says why.

### Trademarks

⚠️ **The trademark check finds exact matches only. It is not a clearance
search, and the UI must never present it as one.** Conflicts turn on likelihood
of confusion within a class of goods and services — phonetic and visual
near-misses in a related class collide, and none of them appear in an
exact-string match. A name this reports as having no exact match can still
infringe. That caveat is attached to the result itself rather than living in a
footnote, and the "available" state is relabelled _"No exact match"_ in the UI
for the same reason.

The provider is configuration (`TRADEMARK_API_URL`, `TRADEMARK_API_KEY`), not a
hard-coded endpoint. Every USPTO API refuses unauthenticated probes — `api.uspto.gov`
answers `Missing Authentication Token`, TSDR 401s, and their docs are
JS-rendered — so the exact endpoint and response shape could not be verified
from here. `parseTrademarkCount` therefore accepts the count shapes these APIs
conventionally use (`count`, `total`, `totalResults`, `recordTotalQuantity`,
`totalCount`, `hits`, or the length of `results`/`items`/`trademarks`/`records`/`docs`)
and returns null for anything else, which becomes `unchecked`. **A wrong
endpoint degrades to "not checked", never to a false all-clear.**

Until it is configured, trademarks report unchecked with a prefilled USPTO
search link. To finish the integration properly, get an API key from the [USPTO
Open Data Portal](https://data.uspto.gov/) and send one real request through it
— then the parser can be pinned to the actual shape instead of accepting six.

Results are cached in KV: 6 hours for domains and handles, 24 for trademarks.
Only definite answers are cached, so a transient rate limit is retried rather
than pinned in place for hours.

## Layout

| Path                        | What                                                          |
| --------------------------- | ------------------------------------------------------------- |
| `public/index.html`         | The whole page — no build step, no framework, no dependencies |
| `functions/api/generate.ts` | Generates the names                                           |
| `functions/api/check.ts`    | Availability for one name                                     |
| `src/naming.ts`             | Guidelines, prompt, computed checks, response parsing         |
| `src/availability.ts`       | Domain, handle and trademark lookups                          |
| `src/rate-limit.ts`         | Per-IP hourly window over KV                                  |

Tests live in the parent project at `tests/unit/namer-*.test.ts`, not here. The
root vitest config measures coverage across the whole repo — `apps/` included —
against 95% thresholds, so untested code in this directory fails CI for
everyone. Run them with the rest: `npm test` from `nabu/`.

## Deploying

Every command needs the Ammoura account pinned, since a Pages config cannot
carry `account_id`:

```bash
export CLOUDFLARE_ACCOUNT_ID=756e4c695a0301d24f0440b9dd3741f7
```

**1. Create the KV namespace** (once). The endpoint returns 503 until this
exists — deliberately, because the alternative is a public unmetered AI
endpoint:

```bash
wrangler kv namespace create NAMER_RATE_LIMIT
wrangler kv namespace create NAMER_RATE_LIMIT --preview
```

Paste both ids over the placeholders in `wrangler.toml`. Do **not** point it at
the parent project's KV namespace — that one holds the setup lock and owner ids,
and a public endpoint has no business writing to it.

**2. Deploy** from this directory:

```bash
cd apps/namer && wrangler pages deploy
```

That gives a public `nabu-namer.pages.dev`. A custom domain
(`names.ammoura.me`) can be attached afterwards in the dashboard — the same
cross-account arrangement as `nabu.ammoura.me`, since the `ammoura.me` zone
lives on the personal account rather than Ammoura.

Pages rather than a plain Worker because a Pages project gets its public URL on
deploy, while a Worker first needs the account's workers.dev subdomain, which
the Ammoura account has never registered (API code 10063).

## Local dev

```bash
cd apps/namer && wrangler pages dev
```

Workers AI runs against the real Cloudflare API even locally, so this needs the
account id exported and a wrangler login.

## Limits

- **12 generations per IP per hour** (`HOURLY_LIMIT`), and **120 availability
  checks** (`CHECK_HOURLY_LIMIT`) — one generation legitimately produces six of
  the latter.
- KV is eventually consistent, so a simultaneous burst from one IP can slip a
  few calls past the window edge. Accepted: the limit is there to stop sustained
  scraping, and the exact fix (a Durable Object per IP) is a lot of machinery for
  a name generator.
- No Turnstile. If the rate limit turns out not to be enough, that is the next
  thing to add — the parent project already has `TURNSTILE_SECRET_KEY` wired.
