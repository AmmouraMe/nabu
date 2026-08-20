/**
 * Availability checks for apps/namer.
 *
 * The governing rule under test throughout: **nothing ambiguous is ever
 * reported as available**. A rate limit, a 500, a timeout, an unrecognised
 * body, a TLD with no RDAP service — all must land on `unchecked`. The failure
 * this guards against is someone building a brand on a name the tool wrongly
 * called free.
 */

import { describe, it, expect, vi } from 'vitest';
import {
	CHECKED_TLDS,
	RDAP_REGISTRIES,
	UNVERIFIABLE_TLDS,
	checkAvailability,
	checkBluesky,
	checkDomain,
	checkGithub,
	checkNpm,
	checkTrademark,
	parseTrademarkCount,
	slugify,
	tmviewSearchUrl,
	usptoSearchUrl,
	type CheckDeps
} from '../../apps/namer/src/availability';

/** A fetch stub driven by a URL-substring → status/body table. */
function fakeFetch(routes: Record<string, { status: number; body?: unknown }>) {
	// `init` is declared, though unused here, so `mock.calls` stays typed as a
	// two-argument fetch — the token test reads the headers off it.
	return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
		const url = String(input);
		for (const [fragment, spec] of Object.entries(routes)) {
			if (url.includes(fragment)) {
				return new Response(spec.body === undefined ? null : JSON.stringify(spec.body), {
					status: spec.status,
					headers: { 'Content-Type': 'application/json' }
				});
			}
		}
		return new Response(null, { status: 500 });
	});
}

function memoryCache() {
	const map = new Map<string, string>();
	return {
		map,
		get: vi.fn(async (k: string) => map.get(k) ?? null),
		put: vi.fn(async (k: string, v: string) => void map.set(k, v))
	};
}

function deps(overrides: Partial<CheckDeps> = {}): CheckDeps {
	return { fetch: fakeFetch({}) as unknown as typeof fetch, ...overrides };
}

describe('slugify', () => {
	it('reduces a name to what a registrar would accept', () => {
		expect(slugify('Blue Bottle')).toBe('bluebottle');
		expect(slugify('Café-Noir')).toBe('cafnoir');
		expect(slugify('Web3')).toBe('web3');
	});

	it('returns empty for a name with nothing usable in it', () => {
		expect(slugify('!!!')).toBe('');
	});
});

describe('the RDAP registry allowlist', () => {
	it('covers every TLD the tool actually checks', () => {
		for (const tld of CHECKED_TLDS) {
			expect(RDAP_REGISTRIES[tld]).toMatch(/^https:\/\//);
		}
	});

	it('excludes the TLDs that publish no RDAP service', () => {
		// This is the ardor.io trap: without RDAP a 404 means "unsupported", not
		// "free", so these must never be looked up.
		for (const tld of UNVERIFIABLE_TLDS) {
			expect(RDAP_REGISTRIES[tld]).toBeUndefined();
		}
	});
});

describe('checkDomain', () => {
	it('reads 200 as taken', async () => {
		const d = deps({ fetch: fakeFetch({ 'rdap.verisign.com': { status: 200 } }) as never });
		const result = await checkDomain(d, 'Ardor', 'com');
		expect(result).toMatchObject({ id: 'domain:com', label: 'ardor.com', state: 'taken' });
	});

	it('reads 404 as available', async () => {
		const d = deps({ fetch: fakeFetch({ 'rdap.verisign.com': { status: 404 } }) as never });
		expect((await checkDomain(d, 'Ardor', 'com')).state).toBe('available');
	});

	it.each([429, 500, 502, 403])('reads %i as unchecked, never available', async (status) => {
		const d = deps({ fetch: fakeFetch({ 'rdap.verisign.com': { status } }) as never });
		const result = await checkDomain(d, 'Ardor', 'com');
		expect(result.state).toBe('unchecked');
		expect(result.note).toBeTruthy();
	});

	it('refuses to guess at a TLD with no RDAP service', async () => {
		const fetchFn = fakeFetch({});
		const result = await checkDomain(deps({ fetch: fetchFn as never }), 'Ardor', 'io');

		expect(result.state).toBe('unchecked');
		expect(result.note).toMatch(/no RDAP/i);
		// And it must not have gone looking, since any answer would be misleading.
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('treats a thrown fetch as unchecked', async () => {
		const d = deps({
			fetch: vi.fn(async () => {
				throw new Error('network down');
			}) as never
		});
		expect((await checkDomain(d, 'Ardor', 'com')).state).toBe('unchecked');
	});

	it('is unchecked for a name with no usable characters', async () => {
		expect((await checkDomain(deps(), '!!!', 'com')).state).toBe('unchecked');
	});

	it('always offers a link to confirm', async () => {
		const d = deps({ fetch: fakeFetch({ 'rdap.verisign.com': { status: 200 } }) as never });
		expect((await checkDomain(d, 'Ardor', 'com')).url).toContain('ardor.com');
	});
});

describe('checkGithub', () => {
	it('reads 200 as taken and 404 as available', async () => {
		const taken = deps({ fetch: fakeFetch({ 'api.github.com': { status: 200 } }) as never });
		const free = deps({ fetch: fakeFetch({ 'api.github.com': { status: 404 } }) as never });
		expect((await checkGithub(taken, 'Ardor')).state).toBe('taken');
		expect((await checkGithub(free, 'Ardor')).state).toBe('available');
	});

	it('sends the token when there is one', async () => {
		const fetchFn = fakeFetch({ 'api.github.com': { status: 404 } });
		await checkGithub(deps({ fetch: fetchFn as never, githubToken: 'ghp_x' }), 'Ardor');

		const init = fetchFn.mock.calls[0][1] as RequestInit;
		expect((init.headers as Record<string, string>).Authorization).toBe('Bearer ghp_x');
	});

	it('explains the rate limit when there is no token', async () => {
		const d = deps({ fetch: fakeFetch({ 'api.github.com': { status: 403 } }) as never });
		const result = await checkGithub(d, 'Ardor');
		expect(result.state).toBe('unchecked');
		expect(result.note).toMatch(/GITHUB_TOKEN/);
	});

	it('reports a plain failure when a token is set', async () => {
		const d = deps({
			fetch: fakeFetch({ 'api.github.com': { status: 500 } }) as never,
			githubToken: 'ghp_x'
		});
		expect((await checkGithub(d, 'Ardor')).note).toBe('GitHub did not answer.');
	});

	it('is unchecked for an unusable name', async () => {
		expect((await checkGithub(deps(), '!!!')).state).toBe('unchecked');
	});
});

describe('checkBluesky', () => {
	it('reads 200 as taken and 400 as available', async () => {
		const taken = deps({ fetch: fakeFetch({ 'bsky.app': { status: 200 } }) as never });
		const free = deps({ fetch: fakeFetch({ 'bsky.app': { status: 400 } }) as never });
		expect((await checkBluesky(taken, 'Ardor')).state).toBe('taken');
		expect((await checkBluesky(free, 'Ardor')).state).toBe('available');
	});

	it('labels the full handle', async () => {
		const d = deps({ fetch: fakeFetch({ 'bsky.app': { status: 400 } }) as never });
		expect((await checkBluesky(d, 'Ardor')).label).toBe('ardor.bsky.social');
	});

	it('is unchecked on any other status', async () => {
		const d = deps({ fetch: fakeFetch({ 'bsky.app': { status: 503 } }) as never });
		expect((await checkBluesky(d, 'Ardor')).state).toBe('unchecked');
	});

	it('is unchecked for an unusable name', async () => {
		expect((await checkBluesky(deps(), '!!!')).state).toBe('unchecked');
	});
});

describe('checkNpm', () => {
	it('reads 200 as taken and 404 as available', async () => {
		const taken = deps({ fetch: fakeFetch({ 'registry.npmjs.org': { status: 200 } }) as never });
		const free = deps({ fetch: fakeFetch({ 'registry.npmjs.org': { status: 404 } }) as never });
		expect((await checkNpm(taken, 'Ardor')).state).toBe('taken');
		expect((await checkNpm(free, 'Ardor')).state).toBe('available');
	});

	it('is unchecked on any other status', async () => {
		const d = deps({ fetch: fakeFetch({ 'registry.npmjs.org': { status: 429 } }) as never });
		expect((await checkNpm(d, 'Ardor')).state).toBe('unchecked');
	});

	it('is unchecked for an unusable name', async () => {
		expect((await checkNpm(deps(), '!!!')).state).toBe('unchecked');
	});
});

describe('parseTrademarkCount', () => {
	it.each(['count', 'total', 'totalResults', 'recordTotalQuantity', 'totalCount', 'hits'])(
		'reads a numeric %s',
		(key) => {
			expect(parseTrademarkCount({ [key]: 3 })).toBe(3);
			expect(parseTrademarkCount({ [key]: 0 })).toBe(0);
		}
	);

	it.each(['results', 'items', 'trademarks', 'records', 'docs'])(
		'falls back to the length of %s',
		(key) => {
			expect(parseTrademarkCount({ [key]: [1, 2] })).toBe(2);
			expect(parseTrademarkCount({ [key]: [] })).toBe(0);
		}
	);

	it('returns null for a shape it does not recognise', () => {
		// Which becomes `unchecked` — the whole point. A guessed field name must
		// never silently become "no match found".
		expect(parseTrademarkCount({ somethingElse: true })).toBeNull();
		expect(parseTrademarkCount(null)).toBeNull();
		expect(parseTrademarkCount('a string')).toBeNull();
		expect(parseTrademarkCount({ count: -1 })).toBeNull();
		expect(parseTrademarkCount({ count: Number.NaN })).toBeNull();
	});
});

describe('checkTrademark', () => {
	const provider = { url: 'https://tm.example/search', key: 'k' };

	it('is unchecked, with a search link, when no provider is configured', async () => {
		const result = await checkTrademark(deps(), 'Ardor');
		expect(result.state).toBe('unchecked');
		expect(result.note).toMatch(/No trademark provider/);
		expect(result.url).toContain('tmsearch.uspto.gov');
	});

	it('reads a positive count as taken', async () => {
		const d = deps({
			fetch: fakeFetch({ 'tm.example': { status: 200, body: { count: 2 } } }) as never,
			trademark: provider
		});
		expect((await checkTrademark(d, 'Ardor')).state).toBe('taken');
	});

	it('reads a zero count as available — and still carries the caveat', async () => {
		const d = deps({
			fetch: fakeFetch({ 'tm.example': { status: 200, body: { count: 0 } } }) as never,
			trademark: provider
		});
		const result = await checkTrademark(d, 'Ardor');
		expect(result.state).toBe('available');
		// The caveat is on the result itself, not a footnote somewhere else.
		expect(result.note).toMatch(/not a clearance search/i);
	});

	it('is unchecked when the provider errors', async () => {
		const d = deps({
			fetch: fakeFetch({ 'tm.example': { status: 500 } }) as never,
			trademark: provider
		});
		expect((await checkTrademark(d, 'Ardor')).state).toBe('unchecked');
	});

	it('is unchecked when the body is not JSON', async () => {
		const d = deps({
			fetch: vi.fn(async () => new Response('<html>nope</html>', { status: 200 })) as never,
			trademark: provider
		});
		expect((await checkTrademark(d, 'Ardor')).state).toBe('unchecked');
	});

	it('is unchecked when the response shape is unrecognised', async () => {
		const d = deps({
			fetch: fakeFetch({ 'tm.example': { status: 200, body: { mystery: true } } }) as never,
			trademark: provider
		});
		const result = await checkTrademark(d, 'Ardor');
		expect(result.state).toBe('unchecked');
		expect(result.note).toMatch(/check USPTO yourself/i);
	});
});

describe('search links', () => {
	it('prefill the term and escape it', () => {
		expect(usptoSearchUrl('Blue Bottle')).toContain('Blue%20Bottle');
		expect(tmviewSearchUrl('Blue Bottle')).toContain('Blue%20Bottle');
	});
});

describe('caching', () => {
	it('stores a definite answer and reuses it', async () => {
		const cache = memoryCache();
		const fetchFn = fakeFetch({ 'rdap.verisign.com': { status: 200 } });
		const d = deps({ fetch: fetchFn as never, cache });

		await checkDomain(d, 'Ardor', 'com');
		await checkDomain(d, 'Ardor', 'com');

		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(cache.map.get('rdap:ardor.com')).toBe('taken');
	});

	it('never caches an unchecked, so a transient failure is retried', async () => {
		const cache = memoryCache();
		const fetchFn = fakeFetch({ 'rdap.verisign.com': { status: 500 } });
		const d = deps({ fetch: fetchFn as never, cache });

		await checkDomain(d, 'Ardor', 'com');
		await checkDomain(d, 'Ardor', 'com');

		expect(fetchFn).toHaveBeenCalledTimes(2);
		expect(cache.map.size).toBe(0);
	});

	it('ignores a junk cache value rather than trusting it', async () => {
		const cache = memoryCache();
		cache.map.set('rdap:ardor.com', 'probably?');
		const fetchFn = fakeFetch({ 'rdap.verisign.com': { status: 404 } });

		const result = await checkDomain(deps({ fetch: fetchFn as never, cache }), 'Ardor', 'com');
		expect(result.state).toBe('available');
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it('still answers when the cache read throws', async () => {
		const cache = {
			get: vi.fn(async () => {
				throw new Error('KV down');
			}),
			put: vi.fn(async () => {})
		};
		const d = deps({ fetch: fakeFetch({ 'rdap.verisign.com': { status: 404 } }) as never, cache });
		expect((await checkDomain(d, 'Ardor', 'com')).state).toBe('available');
	});

	it('still answers when the cache write throws', async () => {
		const cache = {
			get: vi.fn(async () => null),
			put: vi.fn(async () => {
				throw new Error('KV down');
			})
		};
		const d = deps({ fetch: fakeFetch({ 'rdap.verisign.com': { status: 404 } }) as never, cache });
		expect((await checkDomain(d, 'Ardor', 'com')).state).toBe('available');
	});
});

describe('checkAvailability', () => {
	it('returns every domain, every handle, the trademark, and what it skipped', async () => {
		const d = deps({
			fetch: fakeFetch({
				rdap: { status: 404 },
				'api.github.com': { status: 200 },
				'bsky.app': { status: 400 },
				'registry.npmjs.org': { status: 404 }
			}) as never
		});

		const result = await checkAvailability(d, 'Ardor');

		expect(result.domains).toHaveLength(CHECKED_TLDS.length);
		expect(result.domains.every((c) => c.state === 'available')).toBe(true);
		expect(result.handles.map((h) => h.id)).toEqual([
			'handle:github',
			'handle:bluesky',
			'handle:npm'
		]);
		expect(result.handles[0].state).toBe('taken');
		expect(result.trademark.state).toBe('unchecked');
		expect(result.unverifiableTlds).toEqual([...UNVERIFIABLE_TLDS]);
	});
});
