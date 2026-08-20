/**
 * Availability checks for a generated name: domains, handles, trademarks.
 *
 * ── The rule that governs this whole file ───────────────────────────────────
 * There are three states, never two. A check is `taken`, `available`, or
 * `unchecked` — and anything that is not an unambiguous positive or negative
 * becomes `unchecked`. A timeout, a rate limit, a 500, an unrecognised body, a
 * TLD with no RDAP service: all `unchecked`.
 *
 * This matters more than it looks. The failure mode of a naive checker is
 * reporting a *registered* name as free, and someone builds a brand on it. That
 * is exactly what happens if a 404 is trusted blindly: `ardor.io` is registered
 * and parked, but every RDAP lookup for it 404s, because `.io` publishes no
 * RDAP service at all. Hence `RDAP_REGISTRIES` is an allowlist of TLDs verified
 * to answer 200-for-registered and 404-for-free — a TLD absent from it is never
 * guessed at.
 *
 * ── Why these sources ───────────────────────────────────────────────────────
 * Domains use RDAP, the protocol that replaced WHOIS: free, no key, and each
 * URL below is the authoritative registry for that TLD, taken from IANA's
 * bootstrap (https://data.iana.org/rdap/dns.json) and verified in both
 * directions. Going direct rather than through the rdap.org redirector avoids a
 * third-party dependency that was observed failing intermittently.
 *
 * Handles cover GitHub, Bluesky and npm because those three answer honestly
 * without authentication. Instagram and TikTok return 200 for a free handle and
 * a taken one alike — no signal — and X only distinguishes them from a
 * residential IP, so from a datacenter it is scraping that will be blocked.
 * None of those three are checked, and the page says so rather than implying
 * the name is clear on them.
 */

// ─── Shared types ─────────────────────────────────────────────────────────────

export type CheckState = 'taken' | 'available' | 'unchecked';

export interface Check {
	/** Stable id, e.g. `domain:com` or `handle:github`. */
	id: string;
	/** What the UI prints, e.g. `ardor.com`. */
	label: string;
	state: CheckState;
	/** Why it is unchecked, or a qualifier on the result. */
	note?: string;
	/** Somewhere the user can confirm for themselves. */
	url?: string;
}

/** A cache face; KV in production, a Map in tests. */
export interface CheckCache {
	get(key: string): Promise<string | null>;
	put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface CheckDeps {
	fetch: typeof fetch;
	cache?: CheckCache;
	/** Lifts GitHub's anonymous 60/hour-per-IP ceiling, which a Worker shares. */
	githubToken?: string;
	/** Trademark provider; absent means trademarks are reported unchecked. */
	trademark?: { url: string; key: string };
}

/** Registration state changes slowly, and a stale hour is far cheaper than a rate limit. */
const CACHE_TTL_SECONDS = 6 * 3600;

// ─── Name normalisation ───────────────────────────────────────────────────────

/**
 * A name reduced to what a registrar or a handle field would accept: lowercase
 * alphanumerics, nothing else. "Blue Bottle" becomes "bluebottle", which is the
 * domain someone would actually buy.
 */
export function slugify(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ─── Domains ──────────────────────────────────────────────────────────────────

/**
 * TLD → authoritative RDAP base URL. Every entry verified to return 200 for a
 * registered domain and 404 for a free one.
 *
 * Absent on purpose: **.io, .co, .me, .sh** publish no RDAP service whatsoever,
 * so a lookup cannot distinguish "free" from "unsupported". They are not
 * guessed at, and `checkDomain` reports them unchecked if ever asked.
 */
export const RDAP_REGISTRIES: Readonly<Record<string, string>> = {
	com: 'https://rdap.verisign.com/com/v1/',
	net: 'https://rdap.verisign.com/net/v1/',
	org: 'https://rdap.publicinterestregistry.org/rdap/',
	app: 'https://pubapi.registry.google/rdap/',
	dev: 'https://pubapi.registry.google/rdap/',
	ai: 'https://rdap.identitydigital.services/rdap/'
};

/** Checked for every name, in the order shown. */
export const CHECKED_TLDS = ['com', 'net', 'org', 'app', 'dev', 'ai'] as const;

/** TLDs worth naming as unverifiable, so their absence does not read as "clear". */
export const UNVERIFIABLE_TLDS = ['io', 'co', 'me', 'sh'] as const;

export async function checkDomain(deps: CheckDeps, name: string, tld: string): Promise<Check> {
	const slug = slugify(name);
	const id = `domain:${tld}`;
	const label = `${slug}.${tld}`;
	const url = `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(label)}`;

	if (!slug)
		return { id, label: `.${tld}`, state: 'unchecked', note: 'Name has no usable characters.' };

	const base = RDAP_REGISTRIES[tld];
	if (!base) {
		return { id, label, state: 'unchecked', note: `.${tld} publishes no RDAP service.`, url };
	}

	const state = await cached(deps, `rdap:${label}`, async () => {
		const response = await deps.fetch(`${base}domain/${encodeURIComponent(label)}`, {
			headers: { Accept: 'application/rdap+json' }
		});
		if (response.status === 200) return 'taken';
		if (response.status === 404) return 'available';
		// 429, 5xx, anything else: we do not know, and must not guess.
		return 'unchecked';
	});

	return {
		id,
		label,
		state,
		url,
		...(state === 'unchecked' ? { note: 'Registry did not answer.' } : {})
	};
}

// ─── Handles ──────────────────────────────────────────────────────────────────

export async function checkGithub(deps: CheckDeps, name: string): Promise<Check> {
	const slug = slugify(name);
	const id = 'handle:github';
	const label = `github.com/${slug}`;
	const url = `https://github.com/${slug}`;

	if (!slug)
		return { id, label: 'github.com', state: 'unchecked', note: 'Name has no usable characters.' };

	const state = await cached(deps, `gh:${slug}`, async () => {
		const headers: Record<string, string> = {
			// GitHub rejects requests without one.
			'User-Agent': 'nabu-namer',
			Accept: 'application/vnd.github+json'
		};
		if (deps.githubToken) headers.Authorization = `Bearer ${deps.githubToken}`;

		const response = await deps.fetch(`https://api.github.com/users/${encodeURIComponent(slug)}`, {
			headers
		});
		if (response.status === 200) return 'taken';
		if (response.status === 404) return 'available';
		// 403/429 mean the shared Worker IP hit the anonymous 60/hour ceiling.
		return 'unchecked';
	});

	const note =
		state === 'unchecked'
			? deps.githubToken
				? 'GitHub did not answer.'
				: 'GitHub rate limit — set GITHUB_TOKEN to check this.'
			: undefined;

	return { id, label, state, url, ...(note ? { note } : {}) };
}

export async function checkBluesky(deps: CheckDeps, name: string): Promise<Check> {
	const slug = slugify(name);
	const id = 'handle:bluesky';
	const handle = `${slug}.bsky.social`;
	const url = `https://bsky.app/profile/${handle}`;

	if (!slug)
		return { id, label: 'bsky.social', state: 'unchecked', note: 'Name has no usable characters.' };

	const state = await cached(deps, `bsky:${slug}`, async () => {
		const response = await deps.fetch(
			`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
		);
		if (response.status === 200) return 'taken';
		// The API answers an unresolvable handle with 400 InvalidRequest.
		if (response.status === 400) return 'available';
		return 'unchecked';
	});

	return {
		id,
		label: handle,
		state,
		url,
		...(state === 'unchecked' ? { note: 'Bluesky did not answer.' } : {})
	};
}

export async function checkNpm(deps: CheckDeps, name: string): Promise<Check> {
	const slug = slugify(name);
	const id = 'handle:npm';
	const label = `npm/${slug}`;
	const url = `https://www.npmjs.com/package/${slug}`;

	if (!slug)
		return { id, label: 'npm', state: 'unchecked', note: 'Name has no usable characters.' };

	const state = await cached(deps, `npm:${slug}`, async () => {
		const response = await deps.fetch(`https://registry.npmjs.org/${encodeURIComponent(slug)}`);
		if (response.status === 200) return 'taken';
		if (response.status === 404) return 'available';
		return 'unchecked';
	});

	return {
		id,
		label,
		state,
		url,
		...(state === 'unchecked' ? { note: 'npm did not answer.' } : {})
	};
}

// ─── Trademarks ───────────────────────────────────────────────────────────────

/** Prefilled USPTO search, always offered whatever the API says. */
export function usptoSearchUrl(name: string): string {
	return `https://tmsearch.uspto.gov/search/search-results?q=${encodeURIComponent(name)}`;
}

/** Prefilled TMview search, which covers the EUIPO and national EU registers. */
export function tmviewSearchUrl(name: string): string {
	return `https://www.tmdn.org/tmview/#/tmview/results?criteria=C&basicSearch=${encodeURIComponent(name)}`;
}

/**
 * Number of matching marks from a provider response, or null if the shape is
 * not recognised.
 *
 * Tolerant by design: this is the one integration here that could not be
 * verified against a live endpoint, because every USPTO API refuses
 * unauthenticated probes. Rather than hard-code one guessed field name, it
 * looks for the counts these APIs conventionally use, and returns null — which
 * becomes `unchecked` — for anything it does not recognise. A wrong guess must
 * degrade to "we did not check", never to "no match found".
 */
export function parseTrademarkCount(payload: unknown): number | null {
	if (typeof payload !== 'object' || payload === null) return null;
	const record = payload as Record<string, unknown>;

	const countKeys = ['count', 'total', 'totalResults', 'recordTotalQuantity', 'totalCount', 'hits'];
	for (const key of countKeys) {
		const value = record[key];
		if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
	}

	const arrayKeys = ['results', 'items', 'trademarks', 'records', 'docs'];
	for (const key of arrayKeys) {
		if (Array.isArray(record[key])) return (record[key] as unknown[]).length;
	}

	return null;
}

/**
 * Exact-match trademark lookup.
 *
 * **This is not a clearance search, and the UI must never present it as one.**
 * Trademark conflicts turn on likelihood of confusion within a class of goods
 * and services — phonetic and visual near-misses in a related class collide,
 * and none of them appear in an exact-string match. A name this reports as
 * having no exact match can still infringe. The caveat travels with the result
 * rather than living in a footnote, which is why `note` is set on every branch.
 */
export async function checkTrademark(deps: CheckDeps, name: string): Promise<Check> {
	const id = 'trademark:uspto';
	const label = name;
	const url = usptoSearchUrl(name);
	const caveat = 'Exact matches only — not a clearance search.';

	if (!deps.trademark?.url || !deps.trademark?.key) {
		return {
			id,
			label,
			state: 'unchecked',
			note: 'No trademark provider configured — search USPTO yourself.',
			url
		};
	}

	const count = await cached(
		deps,
		`tm:${slugify(name)}`,
		async () => {
			const response = await deps.fetch(deps.trademark!.url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-API-KEY': deps.trademark!.key
				},
				body: JSON.stringify({ query: name, searchText: name, q: name })
			});
			if (!response.ok) return 'unchecked';

			let payload: unknown;
			try {
				payload = await response.json();
			} catch {
				return 'unchecked';
			}

			const parsed = parseTrademarkCount(payload);
			if (parsed === null) return 'unchecked';
			return parsed > 0 ? 'taken' : 'available';
		},
		// Registrations move slowly; a day-old answer is still a fair answer.
		24 * 3600
	);

	return {
		id,
		label,
		state: count,
		url,
		note: count === 'unchecked' ? 'Trademark search did not answer — check USPTO yourself.' : caveat
	};
}

// ─── Orchestration ────────────────────────────────────────────────────────────

export interface Availability {
	domains: Check[];
	handles: Check[];
	trademark: Check;
	/** TLDs deliberately not checked, so their absence is not read as clear. */
	unverifiableTlds: string[];
}

/**
 * Every check for one name, concurrently.
 *
 * One name per call rather than all six at once: a Cloudflare Worker is capped
 * at 50 subrequests per request, and six names at ten checks apiece would blow
 * straight through it. The page calls this once per card, which also lets the
 * badges fill in as they land instead of the user waiting on the slowest.
 */
export async function checkAvailability(deps: CheckDeps, name: string): Promise<Availability> {
	const [domains, github, bluesky, npm, trademark] = await Promise.all([
		Promise.all(CHECKED_TLDS.map((tld) => checkDomain(deps, name, tld))),
		checkGithub(deps, name),
		checkBluesky(deps, name),
		checkNpm(deps, name),
		checkTrademark(deps, name)
	]);

	return {
		domains,
		handles: [github, bluesky, npm],
		trademark,
		unverifiableTlds: [...UNVERIFIABLE_TLDS]
	};
}

// ─── Caching ──────────────────────────────────────────────────────────────────

/**
 * Read-through cache around one lookup.
 *
 * Only definite answers are stored. Caching an `unchecked` would pin a
 * transient rate limit in place for hours, so a failure is retried next time.
 * Cache faults are swallowed entirely: the lookup still runs, and the caller
 * still gets a real answer.
 */
async function cached(
	deps: CheckDeps,
	key: string,
	lookup: () => Promise<CheckState>,
	ttl: number = CACHE_TTL_SECONDS
): Promise<CheckState> {
	if (deps.cache) {
		try {
			const hit = await deps.cache.get(key);
			if (hit === 'taken' || hit === 'available') return hit;
		} catch {
			// Fall through to the live lookup.
		}
	}

	let state: CheckState;
	try {
		state = await lookup();
	} catch {
		// A thrown fetch — DNS failure, timeout, aborted connection — is not evidence
		// that the name is free.
		return 'unchecked';
	}

	if (deps.cache && state !== 'unchecked') {
		try {
			await deps.cache.put(key, state, { expirationTtl: ttl });
		} catch {
			// A cache miss next time is not worth failing the request over.
		}
	}

	return state;
}
