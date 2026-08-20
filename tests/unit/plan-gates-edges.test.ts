/**
 * The corners of the plan work: the signup page's load, the second video door
 * (Veo 3), and the model-resolution helpers both the chat list and the stream now
 * share.
 *
 * Split from `plan-gates.test.ts` because these need different module mocks, and
 * mixing `vi.doMock` graphs in one file makes the order of tests significant.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { planWorld, refusalOf } from '../fixtures/plan-db';

const user = { id: 'u1', login: 'ada', email: 'ada@example.com', isOwner: false };

async function caught(fn: () => unknown) {
	try {
		await fn();
		return null;
	} catch (err) {
		return err as { status: number; body: Record<string, unknown> };
	}
}

// ─── The signup page tells people what they are signing up for ───────

describe('auth/signup load', () => {
	it('carries the free plan’s limits so the page can show them', async () => {
		const { load } = await import('../../src/routes/auth/signup/+page.server');

		// The load's return type is a union with void (redirect branch); the tests below
		// only run the branch that returns data.
		const data = (await load({ locals: {}, platform: { env: {} } } as never))!;

		expect(data.freePlan.name).toBe('Starter');
		expect(data.freePlan.limits.aiVideoGenerations).toBe(2);
		expect(data.freePlan.limits.aiTextGenerations).toBe(50);
	});

	it('reports which OAuth providers actually exist', async () => {
		const { load } = await import('../../src/routes/auth/signup/+page.server');

		const none = (await load({ locals: {}, platform: { env: {} } } as never))!;
		expect(none.configuredProviders).toEqual({ github: false, discord: false });

		const some = (await load({
			locals: {},
			platform: { env: { GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret' } }
		} as never))!;
		expect(some.configuredProviders.github).toBe(true);
		expect(some.configuredProviders.discord).toBe(false);
	});

	it('sends an already-signed-in visitor away', async () => {
		const { load } = await import('../../src/routes/auth/signup/+page.server');
		const result = await caught(() => load({ locals: { user }, platform: {} } as never));
		expect(result?.status).toBe(302);
	});
});

// ─── Provider detection, including the KV-configured path ────────────

describe('configuredProviders', () => {
	it('reads credentials stored in KV by the admin screen', async () => {
		const { configuredProviders } = await import('../../src/lib/server/oauth-config');

		const kv = {
			get: vi.fn(async (key: string) =>
				key === 'auth_config:discord'
					? JSON.stringify({ clientId: 'id', clientSecret: 'secret' })
					: null
			)
		};

		expect(await configuredProviders({ env: { KV: kv } } as never)).toEqual({
			github: false,
			discord: true
		});
	});

	it('treats a half-configured entry as not configured', async () => {
		const { configuredProviders } = await import('../../src/lib/server/oauth-config');
		const kv = { get: vi.fn(async () => JSON.stringify({ clientId: 'id' })) };
		expect(await configuredProviders({ env: { KV: kv } } as never)).toEqual({
			github: false,
			discord: false
		});
	});

	it('treats unreadable KV as not configured rather than crashing the page', async () => {
		const { configuredProviders } = await import('../../src/lib/server/oauth-config');
		const kv = {
			get: vi.fn(async () => {
				throw new Error('kv down');
			})
		};
		expect(await configuredProviders({ env: { KV: kv } } as never)).toEqual({
			github: false,
			discord: false
		});
	});

	it('handles malformed JSON in KV', async () => {
		const { configuredProviders } = await import('../../src/lib/server/oauth-config');
		const kv = { get: vi.fn(async () => 'not json') };
		expect(await configuredProviders({ env: { KV: kv } } as never)).toEqual({
			github: false,
			discord: false
		});
	});
});

// ─── Model resolution shared by the list and the stream ──────────────

describe('chat model resolution', () => {
	it('prefers the cheapest capable default', async () => {
		const { resolveDefaultModel } = await import('../../src/lib/server/chat-models');

		expect(resolveDefaultModel([{ id: 'gpt-4o', displayName: 'x' }])).toBe('gpt-4o');
		expect(
			resolveDefaultModel([
				{ id: 'gpt-4o', displayName: 'x' },
				{ id: 'gpt-4o-mini', displayName: 'y' }
			])
		).toBe('gpt-4o-mini');
	});

	it('falls back to whatever is first, then to nothing', async () => {
		const { resolveDefaultModel } = await import('../../src/lib/server/chat-models');
		expect(resolveDefaultModel([{ id: 'o3', displayName: 'o3' }])).toBe('o3');
		expect(resolveDefaultModel([])).toBeNull();
	});

	it('sorts known models and drops unknown ones', async () => {
		const { toSortedModels } = await import('../../src/lib/server/chat-models');

		const sorted = toSortedModels(['gpt-3.5-turbo', 'made-up-model', 'gpt-4o']);
		expect(sorted.map((m) => m.id)).toEqual(['gpt-4o', 'gpt-3.5-turbo']);
	});

	it('pins a locked plan to a real model even with no KV', async () => {
		const { defaultModelFor, FALLBACK_CHAT_MODEL } = await import(
			'../../src/lib/server/chat-models'
		);

		expect(await defaultModelFor(undefined)).toBe(FALLBACK_CHAT_MODEL);
		expect(await defaultModelFor({ env: {} } as never)).toBe(FALLBACK_CHAT_MODEL);
	});

	it('falls back when no key advertises a usable model', async () => {
		const { defaultModelFor, FALLBACK_CHAT_MODEL } = await import(
			'../../src/lib/server/chat-models'
		);

		const kv = { get: vi.fn(async () => null) };
		expect(await defaultModelFor({ env: { KV: kv } } as never)).toBe(FALLBACK_CHAT_MODEL);
	});

	it('reads models off a legacy single-model key', async () => {
		const { getEnabledModels } = await import('../../src/lib/server/chat-models');

		const store: Record<string, string> = {
			ai_keys_list: JSON.stringify(['k1', 'k2', 'k3']),
			'ai_key:k1': JSON.stringify({ provider: 'openai', enabled: true, model: 'gpt-4o' }),
			// Disabled and non-chat keys contribute nothing.
			'ai_key:k2': JSON.stringify({ provider: 'openai', enabled: false, models: ['o3'] }),
			'ai_key:k3': JSON.stringify({ provider: 'anthropic', enabled: true, models: ['claude'] })
		};

		const kv = { get: vi.fn(async (key: string) => store[key] ?? null) };
		expect(await getEnabledModels({ env: { KV: kv } } as never)).toEqual(['gpt-4o']);
	});

	it('reports no models when KV cannot be read', async () => {
		const { getEnabledModels } = await import('../../src/lib/server/chat-models');
		const kv = {
			get: vi.fn(async () => {
				throw new Error('kv down');
			})
		};
		expect(await getEnabledModels({ env: { KV: kv } } as never)).toEqual([]);
	});
});

// ─── Veo 3: the other way to spend the video allowance ───────────────

describe('POST /api/video/veo3/generate', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	async function call(plan: string, counters: Record<string, number> = {}, generate?: unknown) {
		vi.doMock('$lib/services/video/veo3', () => ({
			googleKvKey: (userId: string) => `google:apikey:${userId}`,
			generateVideo: generate ?? vi.fn(async () => ({ operationName: 'op-1', status: 'queued' }))
		}));

		const world = planWorld({
			plan,
			counters,
			handlers: { 'SELECT id FROM brands WHERE id = ? AND user_id = ?': () => ({ id: 'br1' }) }
		});

		const { POST } = await import('../../src/routes/api/video/veo3/generate/+server');

		const result = await caught(() =>
			POST({
				request: new Request('https://nabu.test', {
					method: 'POST',
					body: JSON.stringify({ brandId: 'br1', prompt: 'a cat' })
				}),
				platform: { env: { DB: world.db, KV: { get: vi.fn(async () => 'google-key') } } },
				locals: { user }
			} as never)
		);

		return { world, result };
	}

	it('spends the same allowance as /api/video/generate', async () => {
		const { world, result } = await call('starter');
		expect(result).toBeNull();
		expect(world.counters.get('aiVideoGenerations')).toBe(1);
	});

	it('is not a way around the free tier’s two videos', async () => {
		// Gating only the other endpoint would leave this one wide open.
		const { result } = await call('starter', { aiVideoGenerations: 2 });
		expect(refusalOf(result)).toMatchObject({
			code: 'plan_limit_reached',
			metric: 'aiVideoGenerations'
		});
	});

	it('hands the unit back when generation throws', async () => {
		const { world, result } = await call(
			'starter',
			{},
			vi.fn(async () => {
				throw new Error('veo exploded');
			})
		);

		expect(result).toBeInstanceOf(Error);
		expect(world.counters.get('aiVideoGenerations')).toBe(0);
	});

	it('still refuses a request with no prompt before charging for it', async () => {
		vi.doMock('$lib/services/video/veo3', () => ({
			googleKvKey: (userId: string) => `google:apikey:${userId}`,
			generateVideo: vi.fn()
		}));

		const world = planWorld({ plan: 'starter' });
		const { POST } = await import('../../src/routes/api/video/veo3/generate/+server');

		const result = await caught(() =>
			POST({
				request: new Request('https://nabu.test', {
					method: 'POST',
					body: JSON.stringify({ brandId: 'br1' })
				}),
				platform: { env: { DB: world.db, KV: { get: vi.fn() } } },
				locals: { user }
			} as never)
		);

		expect(result?.status).toBe(400);
		expect(world.counters.get('aiVideoGenerations')).toBeUndefined();
	});
});
