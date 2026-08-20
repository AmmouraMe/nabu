/**
 * POST /api/check — the availability endpoint for apps/namer.
 *
 * Mostly a test of what it refuses, since it is public and makes outbound
 * requests on a caller's behalf: no store, no body, no name, quota spent.
 */

import { describe, it, expect, vi } from 'vitest';
import { handleCheck, onRequest, type Env } from '../../apps/namer/functions/api/check';
import { windowKey } from '../../apps/namer/src/rate-limit';

const NOW = 1_700_000_000_000;
const IP = '203.0.113.7';

function store(initial: Record<string, string> = {}) {
	const map = new Map(Object.entries(initial));
	return {
		map,
		get: vi.fn(async (k: string) => map.get(k) ?? null),
		put: vi.fn(async (k: string, v: string) => void map.set(k, v))
	};
}

function post(body: unknown): Request {
	return new Request('https://namer.test/api/check', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': IP },
		body: typeof body === 'string' ? body : JSON.stringify(body)
	});
}

/** Everything answers 404 — i.e. available everywhere. */
function allFree() {
	return vi.fn(async () => new Response(null, { status: 404 }));
}

describe('handleCheck', () => {
	it('returns the full availability set for a name', async () => {
		vi.stubGlobal('fetch', allFree());
		const response = await handleCheck(post({ name: 'Ardor' }), { RATE_LIMIT: store() }, NOW);

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.name).toBe('Ardor');
		expect(body.domains.length).toBeGreaterThan(0);
		expect(body.handles).toHaveLength(3);
		expect(body.trademark.state).toBe('unchecked');
		expect(body.unverifiableTlds).toContain('io');
		vi.unstubAllGlobals();
	});

	it('fails closed with no rate-limit store', async () => {
		const response = await handleCheck(post({ name: 'Ardor' }), {} as Env, NOW);
		expect(response.status).toBe(503);
	});

	it('400s on a body that is not JSON', async () => {
		const response = await handleCheck(post('{ not json'), { RATE_LIMIT: store() }, NOW);
		expect(response.status).toBe(400);
	});

	it('400s when no name is given', async () => {
		const kv = { RATE_LIMIT: store() };
		expect((await handleCheck(post({}), kv, NOW)).status).toBe(400);
		expect((await handleCheck(post({ name: '   ' }), kv, NOW)).status).toBe(400);
		expect((await handleCheck(post({ name: 42 }), kv, NOW)).status).toBe(400);
	});

	it('400s on valid JSON that is not an object', async () => {
		// `7` and `"Ardor"` parse fine but carry no name field.
		const kv = { RATE_LIMIT: store() };
		expect((await handleCheck(post('7'), kv, NOW)).status).toBe(400);
		expect((await handleCheck(post('"Ardor"'), kv, NOW)).status).toBe(400);
	});

	it('does not spend quota on an invalid request', async () => {
		const kv = store();
		await handleCheck(post({}), { RATE_LIMIT: kv }, NOW);
		expect(kv.put).not.toHaveBeenCalled();
	});

	it('429s once the hourly check quota is spent', async () => {
		const kv = store({ [windowKey(IP, NOW)]: '120' });
		const response = await handleCheck(post({ name: 'Ardor' }), { RATE_LIMIT: kv }, NOW);

		expect(response.status).toBe(429);
		expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
	});

	it('passes a configured trademark provider through', async () => {
		const fetchFn = vi.fn(async (input: RequestInfo | URL) =>
			String(input).includes('tm.example')
				? new Response(JSON.stringify({ count: 0 }), { status: 200 })
				: new Response(null, { status: 404 })
		);
		vi.stubGlobal('fetch', fetchFn);

		const response = await handleCheck(
			post({ name: 'Ardor' }),
			{
				RATE_LIMIT: store(),
				TRADEMARK_API_URL: 'https://tm.example/search',
				TRADEMARK_API_KEY: 'k'
			},
			NOW
		);

		expect((await response.json()).trademark.state).toBe('available');
		vi.unstubAllGlobals();
	});

	it('leaves trademarks unchecked when only half the provider config is set', async () => {
		vi.stubGlobal('fetch', allFree());
		const response = await handleCheck(
			post({ name: 'Ardor' }),
			{ RATE_LIMIT: store(), TRADEMARK_API_URL: 'https://tm.example/search' },
			NOW
		);

		expect((await response.json()).trademark.state).toBe('unchecked');
		vi.unstubAllGlobals();
	});
});

describe('onRequest', () => {
	it('405s anything that is not a POST', async () => {
		const request = new Request('https://namer.test/api/check', { method: 'GET' });
		const response = await onRequest({ request, env: {} as Env });

		expect(response.status).toBe(405);
		expect(response.headers.get('Allow')).toBe('POST');
	});

	it('hands a POST to the handler', async () => {
		vi.stubGlobal('fetch', allFree());
		const response = await onRequest({
			request: post({ name: 'Ardor' }),
			env: { RATE_LIMIT: store() }
		});

		expect(response.status).toBe(200);
		vi.unstubAllGlobals();
	});
});
