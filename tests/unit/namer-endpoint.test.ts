/**
 * The public generate endpoint and its rate limiter (apps/namer).
 *
 * The endpoint is unauthenticated, so most of what is worth testing here is what
 * it refuses: no rate-limit store, a bad body, a spent quota, a model that
 * answers with prose. The happy path is the short part.
 */

import { describe, it, expect, vi } from 'vitest';
import {
	handleGenerate,
	onRequest,
	responseText,
	type Env
} from '../../apps/namer/functions/api/generate';
import { clientIp, consume, HOURLY_LIMIT, windowKey } from '../../apps/namer/src/rate-limit';

/** An in-memory stand-in for the KV namespace. */
function fakeStore(initial: Record<string, string> = {}) {
	const data = new Map(Object.entries(initial));
	return {
		data,
		get: vi.fn(async (key: string) => data.get(key) ?? null),
		put: vi.fn(async (key: string, value: string) => {
			data.set(key, value);
		})
	};
}

function post(body: unknown, ip = '203.0.113.7'): Request {
	return new Request('https://namer.test/api/generate', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
		body: typeof body === 'string' ? body : JSON.stringify(body)
	});
}

/**
 * A model that returns one well-formed name. The parameters are declared even
 * though the fake ignores them, so `run.mock.calls` stays typed as a real call.
 */
function fakeAi(response: string) {
	// The shape production actually returns, so the happy path exercises it.
	return {
		run: vi.fn(async (_model: string, _inputs: Record<string, unknown>) => ({
			choices: [{ message: { content: response } }]
		}))
	};
}

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

const VALID_BODY = { description: 'A coffee subscription box for home baristas' };
const NOW = 1_700_000_000_000;

describe('windowKey', () => {
	it('buckets by the hour, per IP', () => {
		const hour = 3600 * 1000;
		// Aligned to a window boundary: NOW itself sits partway through one, so
		// NOW + hour - 1 would already be in the next bucket.
		const base = Math.floor(NOW / hour) * hour;
		expect(windowKey('1.2.3.4', base)).toBe(windowKey('1.2.3.4', base + hour - 1));
		expect(windowKey('1.2.3.4', base)).not.toBe(windowKey('1.2.3.4', base + hour));
		expect(windowKey('1.2.3.4', base)).not.toBe(windowKey('5.6.7.8', base));
	});
});

describe('clientIp', () => {
	it('reads the edge header, which a client cannot forge', () => {
		expect(clientIp(post(VALID_BODY, '198.51.100.9'))).toBe('198.51.100.9');
	});

	it('ignores X-Forwarded-For, which a client can', () => {
		const request = new Request('https://namer.test/api/generate', {
			method: 'POST',
			headers: { 'X-Forwarded-For': '9.9.9.9' }
		});
		expect(clientIp(request)).toBe('unknown');
	});
});

describe('consume', () => {
	it('counts up and reports what is left', async () => {
		const store = fakeStore();
		expect(await consume(store, '1.2.3.4', NOW)).toMatchObject({
			allowed: true,
			remaining: HOURLY_LIMIT - 1
		});
		expect(await consume(store, '1.2.3.4', NOW)).toMatchObject({
			allowed: true,
			remaining: HOURLY_LIMIT - 2
		});
	});

	it('refuses once the window is spent, and says when it resets', async () => {
		const store = fakeStore({ [windowKey('1.2.3.4', NOW)]: String(HOURLY_LIMIT) });
		const result = await consume(store, '1.2.3.4', NOW);
		expect(result.allowed).toBe(false);
		expect(result.remaining).toBe(0);
		expect(result.resetSeconds).toBeGreaterThan(0);
		expect(result.resetSeconds).toBeLessThanOrEqual(3600);
		// Refusing must not write — otherwise a blocked caller extends their own key.
		expect(store.put).not.toHaveBeenCalled();
	});

	it('treats a corrupt counter as zero rather than locking the IP out', async () => {
		const store = fakeStore({ [windowKey('1.2.3.4', NOW)]: 'not-a-number' });
		expect(await consume(store, '1.2.3.4', NOW)).toMatchObject({ allowed: true });
	});

	it('fails open when the store read throws', async () => {
		const store = {
			get: vi.fn(async () => {
				throw new Error('KV down');
			}),
			put: vi.fn(async () => {})
		};
		expect(await consume(store, '1.2.3.4', NOW)).toMatchObject({ allowed: true });
	});

	it('still allows the call when the write throws', async () => {
		const store = {
			get: vi.fn(async () => '0'),
			put: vi.fn(async () => {
				throw new Error('KV down');
			})
		};
		expect(await consume(store, '1.2.3.4', NOW)).toMatchObject({ allowed: true });
	});

	it('honours a caller-supplied limit', async () => {
		const store = fakeStore({ [windowKey('1.2.3.4', NOW)]: '2' });
		expect(await consume(store, '1.2.3.4', NOW, 2)).toMatchObject({ allowed: false });
	});
});

describe('handleGenerate', () => {
	it('returns names and the remaining quota on the happy path', async () => {
		const env: Env = { AI: fakeAi(ONE_NAME), RATE_LIMIT: fakeStore() };
		const response = await handleGenerate(post(VALID_BODY), env, NOW);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.names).toHaveLength(1);
		expect(body.names[0].name).toBe('Apex');
		// Checks are computed server-side, not taken from the model.
		expect(body.names[0].checks).toEqual({
			syllables: 2,
			alphabeticalRank: 1,
			initial: 'A',
			typable: true
		});
		expect(body.remaining).toBe(HOURLY_LIMIT - 1);
		expect(response.headers.get('X-RateLimit-Remaining')).toBe(String(HOURLY_LIMIT - 1));
	});

	it('passes the brief to the model', async () => {
		const ai = fakeAi(ONE_NAME);
		await handleGenerate(post(VALID_BODY), { AI: ai, RATE_LIMIT: fakeStore() }, NOW);

		const [, inputs] = ai.run.mock.calls[0];
		const messages = inputs.messages as { role: string; content: string }[];
		expect(messages[0].role).toBe('system');
		expect(messages[0].content).toContain('radio test');
		expect(messages[1].content).toContain('coffee subscription box');
	});

	it('fails closed when the rate-limit store is not bound', async () => {
		// A missing namespace is a deployment mistake; serving an unmetered public
		// AI endpoint is the one outcome worth refusing outright.
		const response = await handleGenerate(post(VALID_BODY), { AI: fakeAi(ONE_NAME) } as Env, NOW);
		expect(response.status).toBe(503);
	});

	it('503s when the AI binding is missing', async () => {
		const env = { RATE_LIMIT: fakeStore() } as unknown as Env;
		const response = await handleGenerate(post(VALID_BODY), env, NOW);
		expect(response.status).toBe(503);
	});

	it('400s on a body that is not JSON', async () => {
		const env: Env = { AI: fakeAi(ONE_NAME), RATE_LIMIT: fakeStore() };
		const response = await handleGenerate(post('{ not json'), env, NOW);
		expect(response.status).toBe(400);
	});

	it('400s on a description too short to name anything from', async () => {
		const env: Env = { AI: fakeAi(ONE_NAME), RATE_LIMIT: fakeStore() };
		const response = await handleGenerate(post({ description: 'hi' }), env, NOW);
		expect(response.status).toBe(400);
		expect((await response.json()).error).toMatch(/at least/);
	});

	it('does not spend a model call on an invalid request', async () => {
		const ai = fakeAi(ONE_NAME);
		await handleGenerate(post({ description: 'hi' }), { AI: ai, RATE_LIMIT: fakeStore() }, NOW);
		expect(ai.run).not.toHaveBeenCalled();
	});

	it('429s with a Retry-After once the hourly quota is spent', async () => {
		const store = fakeStore({ [windowKey('203.0.113.7', NOW)]: String(HOURLY_LIMIT) });
		const ai = fakeAi(ONE_NAME);
		const response = await handleGenerate(post(VALID_BODY), { AI: ai, RATE_LIMIT: store }, NOW);

		expect(response.status).toBe(429);
		expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
		expect(ai.run).not.toHaveBeenCalled();
	});

	it('502s when the model throws', async () => {
		const env: Env = {
			AI: {
				run: vi.fn(async () => {
					throw new Error('inference failed');
				})
			},
			RATE_LIMIT: fakeStore()
		};
		const response = await handleGenerate(post(VALID_BODY), env, NOW);
		expect(response.status).toBe(502);
	});

	it('502s when the model answers with prose instead of JSON', async () => {
		const env: Env = { AI: fakeAi('I cannot help with that.'), RATE_LIMIT: fakeStore() };
		const response = await handleGenerate(post(VALID_BODY), env, NOW);
		expect(response.status).toBe(502);
		expect((await response.json()).error).toMatch(/unreadable/);
	});

	it('accepts a bare string from the binding, not just { response }', async () => {
		const env: Env = { AI: { run: vi.fn(async () => ONE_NAME) }, RATE_LIMIT: fakeStore() };
		const response = await handleGenerate(post(VALID_BODY), env, NOW);
		expect(response.status).toBe(200);
	});

	it('502s rather than throwing when the binding returns an unexpected shape', async () => {
		const env: Env = {
			AI: { run: vi.fn(async () => ({}) as { response?: string }) },
			RATE_LIMIT: fakeStore()
		};
		const response = await handleGenerate(post(VALID_BODY), env, NOW);
		expect(response.status).toBe(502);
	});
});

describe('responseText', () => {
	// The shape that caused a production 502: llama-3.3-70b via the Workers AI
	// binding answers OpenAI-style, and reading only `.response` gave '' every time.
	it('reads the OpenAI-style completion shape', () => {
		expect(responseText({ choices: [{ message: { content: 'hello' } }] })).toBe('hello');
	});

	it('still reads the plain { response } shape', () => {
		expect(responseText({ response: 'hello' })).toBe('hello');
	});

	it('still reads a bare string', () => {
		expect(responseText('hello')).toBe('hello');
	});

	it('prefers response when a reply somehow carries both', () => {
		expect(responseText({ response: 'first', choices: [{ message: { content: 'second' } }] })).toBe(
			'first'
		);
	});

	it('returns empty for shapes it does not recognise, so the caller 502s', () => {
		expect(responseText({})).toBe('');
		expect(responseText({ choices: [] })).toBe('');
		expect(responseText({ choices: [{}] })).toBe('');
		expect(responseText({ choices: [{ message: {} }] })).toBe('');
	});
});

describe('onRequest', () => {
	it('405s anything that is not a POST, and says what to use', async () => {
		const request = new Request('https://namer.test/api/generate', { method: 'GET' });
		const response = await onRequest({ request, env: {} as Env });

		expect(response.status).toBe(405);
		expect(response.headers.get('Allow')).toBe('POST');
	});

	it('hands a POST to the handler', async () => {
		const env: Env = { AI: fakeAi(ONE_NAME), RATE_LIMIT: fakeStore() };
		const response = await onRequest({ request: post(VALID_BODY), env });

		expect(response.status).toBe(200);
		expect((await response.json()).names[0].name).toBe('Apex');
	});
});
