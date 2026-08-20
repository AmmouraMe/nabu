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

| Path                           | What                                                          |
| ------------------------------ | ------------------------------------------------------------- |
| `public/index.html`            | The whole page — no build step, no framework, no dependencies |
| `functions/api/generate.ts`    | Generates the names                                           |
| `functions/api/check.ts`       | Availability for one name                                     |
| `functions/api/session.ts`     | Who the caller is and what they're allowed                    |
| `functions/api/auth/discord/`  | Optional Discord sign-in (start + callback)                   |
| `functions/api/auth/logout.ts` | Drops the session cookie                                      |
| `src/naming.ts`                | Guidelines, prompt, computed checks, response parsing         |
| `src/availability.ts`          | Domain, handle and trademark lookups                          |
| `src/auth.ts`                  | Session signing, cookies, Discord OAuth                       |
| `src/rate-limit.ts`            | Hourly window over KV, keyed by IP or account                 |

Tests live in the parent project at `tests/unit/namer-*.test.ts`, not here. The
root vitest config measures coverage across the whole repo — `apps/` included —
against 95% thresholds, so untested code in this directory fails CI for
everyone. Run them with the rest: `npm test` from `nabu/`.

## The form

The description accepts **4,000 characters**, not 400. The page asks for as much
detail as you can give it, and the old cap contradicted that in the same breath
— and truncated silently. The counter stays blank until the last quarter, so the
limit is invisible until it is nearly relevant.

Below it, **three checkboxes decide what gets looked up**: domains, handles,
trademarks. Each is a live lookup, and plenty of people naming a brand want a
.com and nothing else. A group turned off is never dispatched — turning off
handles and trademarks takes a name from ten outbound requests to six.

A declined group comes back **absent**, not present-and-unchecked. That
distinction carries weight: `unchecked` means "we looked and could not tell", and
rendering a group nobody asked for as unchecked would drain the meaning out of
every genuine one on the page.

## The results

Names arrive as a **shortlist of closed cards** — just the name. Clicking one
opens it to the reasoning and the availability, and an open card takes the full
row so its prose is not squeezed into a column. They are `<details>` elements, so
Enter and Space work, the expanded state is announced, and browser in-page search
finds closed text, none of which needed code.

**Availability is fetched the first time a card is opened**, not when the six
arrive. Nobody reads ten lookups for a name they rejected on sight. This also
removed a real bug: firing 36 RDAP lookups at once tripped Verisign's rate limit,
and `.app`/`.dev` were coming back unchecked purely from the burst. The client
used to stagger by 450ms to soften that; opening one card at a time means the
burst cannot form at all, so the stagger is gone.

## Signing in

Optional, and only ever raises a limit: **12 generations an hour anonymously, 60
signed in with Discord**. Nothing else changes — same names, same checks.

Anonymous callers are counted by IP, which is a poor identity: a shared office or
a phone network puts many people behind one address, and they currently split
those twelve. A signed-in caller is counted by Discord account, so their quota
follows them, and a runaway caller is identifiable rather than anonymous — which
is why the bigger allowance is a smaller risk than it looks.

**No tokens are stored.** The Discord access token is used once, at the callback,
to read the account id, then discarded. There is no user table: the cookie
carries the Discord id and an expiry, HMAC-signed, and that is the whole account
model. The signature is what stops someone writing their own id into the cookie
to mint quota — there is a test for exactly that.

A DB-backed session would be revocable, which is better, and is where the main
Nabu app is heading. Here the only thing a session buys is a higher rate limit,
so the worst case for a stolen cookie is somebody else's larger quota. That does
not justify a sessions table on an app whose selling point is having no account.

**Sign-in is off until configured, and the page hides the offer** rather than
showing a button that 503s. To turn it on: create a Discord application, add
`https://<your-domain>/api/auth/discord/callback` as a redirect URI, then

```bash
wrangler pages secret put DISCORD_CLIENT_ID
wrangler pages secret put DISCORD_CLIENT_SECRET
wrangler pages secret put SESSION_SECRET   # any long random string
```

The OAuth `state` is stored in KV for ten minutes and burned on use, so a
replayed callback is refused. Only the `identify` scope is requested — `email` is
not, because nothing here has a use for it.

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

- **12 generations an hour anonymously** (`ANON_HOURLY_LIMIT`, keyed by IP),
  **60 signed in** (`SIGNED_IN_HOURLY_LIMIT`, keyed by Discord account).
- Availability checks get their own window at ten per generation
  (`CHECKS_PER_GENERATION`), so opening a lot of cards never eats into the
  allowance for asking for more names.
- KV is eventually consistent, so a simultaneous burst from one IP can slip a
  few calls past the window edge. Accepted: the limit is there to stop sustained
  scraping, and the exact fix (a Durable Object per IP) is a lot of machinery for
  a name generator.
- No Turnstile. If the rate limit turns out not to be enough, that is the next
  thing to add — the parent project already has `TURNSTILE_SECRET_KEY` wired.
