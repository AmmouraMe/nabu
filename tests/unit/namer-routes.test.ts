/**
 * The public name generator's endpoints, now that it lives inside the app.
 *
 * The thing most worth pinning is that this is the one AI endpoint reachable
 * without an account, so it carries its own ceiling instead of the entitlements
 * gate — and must never spend a signed-in user's metered allowance on names.
 */

import { describe, it, expect, vi } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import { POST as generate } from '../../src/routes/api/namer/generate/+server';
import { POST as check } from '../../src/routes/api/namer/check/+server';
import { responseText } from '../../src/lib/server/namer/ai';
import {
	ANON_HOURLY_LIMIT,
	SIGNED_IN_HOURLY_LIMIT,
	consume,
	rateLimitIdentity,
	windowKey
} from '../../src/lib/server/namer/rate-limit';

const NOW = 1_700_000_000_000;
const IP = '203.0.113.7';

const ONE_NAME = JSON.stringify([
	{
		name: 'Apex',
		meaning: 'The summit.',
		sound: 'Hard and quick.',
		radio: 'Spells itself.',
		translation: 'No collisions found in major languages.',
		domain: 'apex.com'
	}
]);

function fakeKv(initial: Record<string, string> = {}) {
	const map = new Map(Object.entries(initial));
	return {
		map,
		kv: {
			get: vi.fn(async (k: string) => map.get(k) ?? null),
			put: vi.fn(async (k: string, v: string) => void map.set(k, v))
		} as unknown as KVNamespace
	};
}

/** Workers AI's real shape for this model: an OpenAI-style completion. */
function fakeAi(content: string) {
	return { run: vi.fn(async () => ({ choices: [{ message: { content } }] })) };
}

function event(body: unknown, over: Record<string, unknown> = {}) {
	const { kv } = fakeKv();
	return {
		request: new Request('https://nabu.test/api/namer/generate', {
			method: 'POST',
			body: typeof body === 'string' ? body : JSON.stringify(body)
		}),
		platform: { env: { KV: kv, AI: fakeAi(ONE_NAME) } },
		locals: {},
		getClientAddress: () => IP,
		...over
	};
}

const VALID = { description: 'A coffee subscription box for home grinders' };

describe('rateLimitIdentity', () => {
	it('keys an anonymous visitor by IP at the smaller limit', () => {
		expect(rateLimitIdentity(undefined, IP)).toEqual({
			key: `ip:${IP}`,
			limit: ANON_HOURLY_LIMIT,
			signedIn: false
		});
	});

	it('keys a signed-in user by id at the larger limit', () => {
		expect(rateLimitIdentity('user-1', IP)).toEqual({
			key: 'u:user-1',
			limit: SIGNED_IN_HOURLY_LIMIT,
			signedIn: true
		});
	});

	it('keeps user keys and IP keys in separate spaces', () => {
		// A user id that looks like an address must not collide with one.
		expect(rateLimitIdentity(IP, IP).key).not.toBe(rateLimitIdentity(undefined, IP).key);
	});
});

describe('consume', () => {
	it('counts up and reports what is left', async () => {
		const { kv } = fakeKv();
		expect(await consume(kv, 'ip:x', NOW, 3)).toMatchObject({ allowed: true, remaining: 2 });
		expect(await consume(kv, 'ip:x', NOW, 3)).toMatchObject({ allowed: true, remaining: 1 });
	});

	it('refuses once spent, without writing again', async () => {
		const { kv, map } = fakeKv({ [windowKey('ip:x', NOW)]: '3' });
		const result = await consume(kv, 'ip:x', NOW, 3);
		expect(result.allowed).toBe(false);
		expect(result.resetSeconds).toBeGreaterThan(0);
		expect(map.get(windowKey('ip:x', NOW))).toBe('3');
	});

	it('still allows the call when the KV write throws', async () => {
		// The read said there was room; losing one count is not worth a refusal.
		const kv = {
			get: vi.fn(async () => '0'),
			put: vi.fn(async () => {
				throw new Error('KV down');
			})
		} as unknown as KVNamespace;
		expect(await consume(kv, 'ip:x', NOW, 3)).toMatchObject({ allowed: true });
	});

	it('fails open when KV throws, rather than taking the tool down', async () => {
		const kv = {
			get: vi.fn(async () => {
				throw new Error('KV down');
			}),
			put: vi.fn()
		} as unknown as KVNamespace;
		expect(await consume(kv, 'ip:x', NOW, 3)).toMatchObject({ allowed: true });
	});

	it('treats a corrupt counter as zero rather than locking the caller out', async () => {
		const { kv } = fakeKv({ [windowKey('ip:x', NOW)]: 'not-a-number' });
		expect(await consume(kv, 'ip:x', NOW, 3)).toMatchObject({ allowed: true });
	});
});

describe('responseText', () => {
	it('reads the OpenAI-style shape Workers AI actually returns', () => {
		expect(responseText({ choices: [{ message: { content: 'hi' } }] })).toBe('hi');
	});

	it('still reads { response } and a bare string', () => {
		expect(responseText({ response: 'hi' })).toBe('hi');
		expect(responseText('hi')).toBe('hi');
	});

	it('returns empty for anything unrecognised, so the caller 502s', () => {
		expect(responseText({})).toBe('');
		expect(responseText({ choices: [] })).toBe('');
	});
});

describe('POST /api/namer/generate', () => {
	it('names a brand for a visitor with no account', async () => {
		const response = (await generate(event(VALID) as never)) as Response;
		expect(response.status).toBe(200);

		const body = await response.json();
		expect(body.names[0].name).toBe('Apex');
		// Computed here, not taken from the model.
		expect(body.names[0].checks).toEqual({
			syllables: 2,
			alphabeticalRank: 1,
			initial: 'A',
			typable: true
		});
		expect(body.remaining).toBe(ANON_HOURLY_LIMIT - 1);
	});

	it('never touches the metered allowance', async () => {
		// The entitlements gate has no plan to consult for a stranger, and a
		// visitor naming a brand must not spend a paying user's AI generations.
		const { kv, map } = fakeKv();
		const ev = event(VALID, {
			platform: { env: { KV: kv, AI: fakeAi(ONE_NAME) } },
			locals: { user: { id: 'user-1' } }
		});
		await generate(ev as never);

		const keys = [...map.keys()];
		expect(keys.every((k) => k.startsWith('namer:rl:'))).toBe(true);
		expect(keys.some((k) => k.includes('usage'))).toBe(false);
	});

	it('gives a signed-in user the larger ceiling, keyed by id', async () => {
		const { kv, map } = fakeKv();
		const ev = event(VALID, {
			platform: { env: { KV: kv, AI: fakeAi(ONE_NAME) } },
			locals: { user: { id: 'user-1' } }
		});
		const response = (await generate(ev as never)) as Response;

		expect((await response.json()).remaining).toBe(SIGNED_IN_HOURLY_LIMIT - 1);
		expect([...map.keys()][0]).toContain('u:user-1');
	});

	it('suggests signing in only to someone who is not', async () => {
		const { kv } = fakeKv({ [windowKey(`ip:${IP}`, NOW)]: String(ANON_HOURLY_LIMIT) });
		vi.spyOn(Date, 'now').mockReturnValue(NOW);

		const response = (await generate(
			event(VALID, { platform: { env: { KV: kv, AI: fakeAi(ONE_NAME) } } }) as never
		)) as Response;

		expect(response.status).toBe(429);
		const body = await response.json();
		expect(body.signInHelps).toBe(true);
		expect(body.error).toMatch(/Sign in/);
		vi.restoreAllMocks();
	});

	it('does not suggest signing in to someone already signed in', async () => {
		vi.spyOn(Date, 'now').mockReturnValue(NOW);
		const { kv } = fakeKv({ [windowKey('u:user-1', NOW)]: String(SIGNED_IN_HOURLY_LIMIT) });

		const response = (await generate(
			event(VALID, {
				platform: { env: { KV: kv, AI: fakeAi(ONE_NAME) } },
				locals: { user: { id: 'user-1' } }
			}) as never
		)) as Response;

		expect(response.status).toBe(429);
		const body = await response.json();
		expect(body.signInHelps).toBe(false);
		expect(body.error).not.toMatch(/Sign in/);
		vi.restoreAllMocks();
	});

	it('does not spend a model call on an invalid request', async () => {
		const ai = fakeAi(ONE_NAME);
		const { kv } = fakeKv();
		const response = (await generate(
			event({ description: 'hi' }, { platform: { env: { KV: kv, AI: ai } } }) as never
		)) as Response;

		expect(response.status).toBe(400);
		expect(ai.run).not.toHaveBeenCalled();
	});

	it('400s on a body that is not JSON', async () => {
		expect(((await generate(event('{ not json') as never)) as Response).status).toBe(400);
	});

	it('fails closed without KV, rather than serving an unmetered AI endpoint', async () => {
		const response = (await generate(
			event(VALID, { platform: { env: { AI: fakeAi(ONE_NAME) } } }) as never
		)) as Response;
		expect(response.status).toBe(503);
	});

	it('503s without the AI binding', async () => {
		const { kv } = fakeKv();
		const response = (await generate(
			event(VALID, { platform: { env: { KV: kv } } }) as never
		)) as Response;
		expect(response.status).toBe(503);
	});

	it('502s when the model answers with prose', async () => {
		const { kv } = fakeKv();
		const response = (await generate(
			event(VALID, { platform: { env: { KV: kv, AI: fakeAi('I cannot help.') } } }) as never
		)) as Response;
		expect(response.status).toBe(502);
	});

	it('502s when the model throws', async () => {
		const { kv } = fakeKv();
		const ai = {
			run: vi.fn(async () => {
				throw new Error('inference failed');
			})
		};
		const response = (await generate(
			event(VALID, { platform: { env: { KV: kv, AI: ai } } }) as never
		)) as Response;
		expect(response.status).toBe(502);
	});
});

describe('POST /api/namer/check', () => {
	function checkEvent(body: unknown, over: Record<string, unknown> = {}) {
		const { kv } = fakeKv();
		return {
			request: new Request('https://nabu.test/api/namer/check', {
				method: 'POST',
				body: JSON.stringify(body)
			}),
			platform: { env: { KV: kv } },
			locals: {},
			getClientAddress: () => IP,
			...over
		};
	}

	it('returns only the groups that were asked for', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 404 }))
		);

		const response = (await check(
			checkEvent({
				name: 'Apex',
				checks: { domains: true, handles: false, trademark: false }
			}) as never
		)) as Response;
		const body = await response.json();

		expect(body.domains.length).toBeGreaterThan(0);
		// Absent, not present-and-unchecked: "you did not ask" is a different
		// claim from "we looked and could not tell".
		expect('handles' in body).toBe(false);
		expect('trademark' in body).toBe(false);
		vi.unstubAllGlobals();
	});

	it('uses a configured trademark provider when both halves are set', async () => {
		const fetchFn = vi.fn(async (input: RequestInfo | URL) =>
			String(input).includes('tm.example')
				? new Response(JSON.stringify({ count: 0 }), { status: 200 })
				: new Response(null, { status: 404 })
		);
		vi.stubGlobal('fetch', fetchFn);
		const { kv } = fakeKv();

		const response = (await check(
			checkEvent(
				{ name: 'Apex', checks: { domains: false, handles: false, trademark: true } },
				{
					platform: {
						env: {
							KV: kv,
							TRADEMARK_API_URL: 'https://tm.example/search',
							TRADEMARK_API_KEY: 'k'
						}
					}
				}
			) as never
		)) as Response;

		expect((await response.json()).trademark.state).toBe('available');
		vi.unstubAllGlobals();
	});

	it('leaves trademarks unchecked when only half the provider config is set', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 404 }))
		);
		const { kv } = fakeKv();

		const response = (await check(
			checkEvent(
				{ name: 'Apex', checks: { domains: false, handles: false, trademark: true } },
				{ platform: { env: { KV: kv, TRADEMARK_API_URL: 'https://tm.example/search' } } }
			) as never
		)) as Response;

		// A wrong or partial configuration must degrade to "not checked", never to
		// a false all-clear.
		expect((await response.json()).trademark.state).toBe('unchecked');
		vi.unstubAllGlobals();
	});

	it('passes a GitHub token through when one is set', async () => {
		// Parameters declared, though unused, so `mock.calls` stays typed as a real
		// two-argument fetch — this test reads the headers off the second.
		const fetchFn = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 404 })
		);
		vi.stubGlobal('fetch', fetchFn);
		const { kv } = fakeKv();

		await check(
			checkEvent(
				{ name: 'Apex', checks: { domains: false, handles: true, trademark: false } },
				{ platform: { env: { KV: kv, GITHUB_TOKEN: 'ghp_x' } } }
			) as never
		);

		const githubCall = fetchFn.mock.calls.find((c) => String(c[0]).includes('api.github.com'));
		const headers = (githubCall?.[1] as RequestInit)?.headers as Record<string, string>;
		expect(headers.Authorization).toBe('Bearer ghp_x');
		vi.unstubAllGlobals();
	});

	it('400s without a usable name', async () => {
		expect(((await check(checkEvent({}) as never)) as Response).status).toBe(400);
		// Valid JSON that is not an object, and a non-string name, both carry none.
		expect(((await check(checkEvent(7) as never)) as Response).status).toBe(400);
		expect(((await check(checkEvent({ name: 42 }) as never)) as Response).status).toBe(400);
		expect(((await check(checkEvent({ name: '   ' }) as never)) as Response).status).toBe(400);
	});

	it('counts a signed-in user against their own check window', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 404 }))
		);
		const { kv, map } = fakeKv();

		await check(
			checkEvent(
				{ name: 'Apex', checks: { domains: false, handles: false, trademark: false } },
				{ platform: { env: { KV: kv } }, locals: { user: { id: 'user-1' } } }
			) as never
		);

		expect([...map.keys()].some((k) => k.includes('check:u:user-1'))).toBe(true);
		vi.unstubAllGlobals();
	});

	it('400s on a body that is not JSON', async () => {
		const ev = checkEvent({});
		ev.request = new Request('https://nabu.test/api/namer/check', {
			method: 'POST',
			body: '{ not json'
		});
		expect(((await check(ev as never)) as Response).status).toBe(400);
	});

	it('fails closed without KV', async () => {
		const response = (await check(
			checkEvent({ name: 'Apex' }, { platform: { env: {} } }) as never
		)) as Response;
		expect(response.status).toBe(503);
	});

	it('429s once the check window is spent', async () => {
		vi.spyOn(Date, 'now').mockReturnValue(NOW);
		const { kv } = fakeKv({
			[windowKey(`check:ip:${IP}`, NOW)]: String(ANON_HOURLY_LIMIT * 10)
		});

		const response = (await check(
			checkEvent({ name: 'Apex' }, { platform: { env: { KV: kv } } }) as never
		)) as Response;

		expect(response.status).toBe(429);
		vi.restoreAllMocks();
	});
});
