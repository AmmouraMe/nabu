/**
 * The gates, on the routes, against the real `$lib/server/entitlements`.
 *
 * `entitlements.test.ts` proves the rules; this proves they are actually wired in.
 * Every case here is written from the position of a brand-new free account — the one
 * the pricing page calls Starter — and asserts either that it is turned away, or that
 * the same request succeeds one tier up. That difference is the whole feature: before
 * this, every one of these requests succeeded for everybody.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { planWorld, refusalOf } from '../fixtures/plan-db';

vi.mock('$lib/services/openai-chat', () => ({
	createRealtimeSession: vi.fn(async () => ({ token: 'ephemeral', model: 'gpt-4o-realtime' })),
	getEnabledOpenAIKey: vi.fn(async () => ({
		apiKey: 'sk-test',
		voiceEnabled: true,
		voiceModel: 'gpt-4o-realtime'
	}))
}));

vi.mock('$lib/services/brand-book', () => ({
	generateBrandBookHtml: vi.fn(() => '<html>book</html>'),
	brandBookR2Key: vi.fn((id: string, mode: string) => `brands/${id}/book-${mode}.html`)
}));

vi.mock('$lib/services/video-registry', () => ({
	getEnabledVideoKey: vi.fn(async () => ({ provider: 'openai', apiKey: 'sk-test' })),
	getVideoProvider: vi.fn(() => ({
		getAvailableModels: () => [{ id: 'sora-2', pricing: null }],
		generateVideo: vi.fn(async () => ({ status: 'queued', jobId: 'job-1' }))
	}))
}));

vi.mock('$lib/services/brand-admin', () => ({
	getBrandAccess: vi.fn(async () => []),
	grantBrandAccess: vi.fn(async () => 'access-1'),
	updateBrandAccess: vi.fn(async () => undefined),
	revokeBrandAccess: vi.fn(async () => undefined)
}));

const freeUser = { id: 'u1', login: 'ada', email: 'ada@example.com', isOwner: false };

/** The thrown SvelteKit error, or null when the call succeeded. */
async function caught(fn: () => unknown) {
	try {
		await fn();
		return null;
	} catch (err) {
		return err as { status: number; body: Record<string, unknown> };
	}
}

beforeEach(() => {
	vi.clearAllMocks();
});

// ─── Voice chat: refused outright, not metered ───────────────────────

describe('POST /api/chat/voice/session', () => {
	async function call(plan: string | null) {
		const { POST } = await import('../../src/routes/api/chat/voice/session/+server');
		const world = planWorld({ plan });
		return {
			world,
			result: await caught(() =>
				POST({
					request: new Request('https://nabu.test', { method: 'POST' }),
					platform: { env: { DB: world.db, KV: {} } },
					locals: { user: freeUser }
				} as never)
			)
		};
	}

	it('refuses a free account with 402 and an upgrade link', async () => {
		const { result } = await call('starter');
		expect(result?.status).toBe(402);
		expect(refusalOf(result)).toMatchObject({
			code: 'plan_feature_locked',
			feature: 'voiceChat',
			plan: 'starter',
			upgradeUrl: '/pricing'
		});
	});

	it('refuses an account whose plan cannot be read', async () => {
		// Fails closed: a row with no plan is a free account, not an unlimited one.
		expect((await call(null)).result?.status).toBe(402);
	});

	it('lets a Pro account through', async () => {
		expect((await call('pro')).result).toBeNull();
	});
});

// ─── Brand export ────────────────────────────────────────────────────

describe('POST /api/brand/[id]/brand-book', () => {
	async function call(plan: string | null) {
		const { POST } = await import('../../src/routes/api/brand/[id]/brand-book/+server');
		const world = planWorld({
			plan,
			handlers: {
				'FROM brand_profiles WHERE id = ? AND user_id = ?': () => ({ id: 'b1' })
			}
		});
		const bucket = { put: vi.fn(async () => ({})), get: vi.fn(async () => null) };

		return {
			bucket,
			result: await caught(() =>
				POST({
					request: new Request('https://nabu.test', {
						method: 'POST',
						body: JSON.stringify({ mode: 'light' })
					}),
					platform: { env: { DB: world.db, BUCKET: bucket } },
					params: { id: 'b1' },
					locals: { user: freeUser }
				} as never)
			)
		};
	}

	it('refuses a free account before anything is written', async () => {
		const { result, bucket } = await call('starter');
		expect(result?.status).toBe(402);
		expect(refusalOf(result)).toMatchObject({ feature: 'brandExport' });
		expect(bucket.put).not.toHaveBeenCalled();
	});

	it('generates for a paid account', async () => {
		const { result, bucket } = await call('business');
		expect(result).toBeNull();
		expect(bucket.put).toHaveBeenCalled();
	});
});

// ─── Model selection ─────────────────────────────────────────────────

describe('GET /api/chat/models', () => {
	const KEYS = {
		ai_keys_list: JSON.stringify(['k1']),
		'ai_key:k1': JSON.stringify({
			provider: 'openai',
			enabled: true,
			models: ['gpt-4o', 'gpt-4o-mini', 'o3']
		})
	} as Record<string, string>;

	async function call(plan: string) {
		const { GET } = await import('../../src/routes/api/chat/models/+server');
		const world = planWorld({ plan });
		const response = await GET({
			platform: {
				env: { DB: world.db, KV: { get: vi.fn(async (k: string) => KEYS[k] ?? null) } }
			},
			locals: { user: freeUser }
		} as never);
		return response.json();
	}

	it('offers a free account only the default model', async () => {
		const payload = await call('starter');
		expect(payload.modelSelection).toBe(false);
		expect(payload.models).toHaveLength(1);
		expect(payload.models[0].id).toBe(payload.defaultModel);
	});

	it('offers a paid account every enabled model', async () => {
		const payload = await call('pro');
		expect(payload.modelSelection).toBe(true);
		expect(payload.models.length).toBeGreaterThan(1);
	});
});

// ─── Video: the metered case ─────────────────────────────────────────

describe('POST /api/video/generate', () => {
	async function call(plan: string, counters: Record<string, number> = {}) {
		const { POST } = await import('../../src/routes/api/video/generate/+server');
		const world = planWorld({ plan, counters });
		const result = await caught(() =>
			POST({
				request: new Request('https://nabu.test', {
					method: 'POST',
					body: JSON.stringify({ prompt: 'a cat, tastefully lit' })
				}),
				platform: { env: { DB: world.db, KV: {} } },
				locals: { user: freeUser }
			} as never)
		);
		return { world, result };
	}

	it('allows the free tier its two videos', async () => {
		const first = await call('starter');
		expect(first.result).toBeNull();
		expect(first.world.counters.get('aiVideoGenerations')).toBe(1);

		const second = await call('starter', { aiVideoGenerations: 1 });
		expect(second.result).toBeNull();
		expect(second.world.counters.get('aiVideoGenerations')).toBe(2);
	});

	it('refuses the third, with the numbers attached', async () => {
		const { result, world } = await call('starter', { aiVideoGenerations: 2 });
		expect(result?.status).toBe(402);
		expect(refusalOf(result)).toMatchObject({
			code: 'plan_limit_reached',
			metric: 'aiVideoGenerations',
			limit: 2,
			used: 2
		});
		// Nothing was spent by the attempt that failed.
		expect(world.counters.get('aiVideoGenerations')).toBe(2);
	});

	it('lets a Pro account past the free ceiling', async () => {
		const { result } = await call('pro', { aiVideoGenerations: 2 });
		expect(result).toBeNull();
	});

	it('hands the unit back when the provider errors', async () => {
		const registry = await import('$lib/services/video-registry');
		vi.mocked(registry.getVideoProvider).mockReturnValueOnce({
			getAvailableModels: () => [{ id: 'sora-2', pricing: null }],
			generateVideo: vi.fn(async () => ({ status: 'error', error: 'provider exploded' }))
		} as never);

		const { world, result } = await call('starter');
		expect(result?.status).toBe(502);
		// A provider outage must not cost someone one of their two monthly videos.
		expect(world.counters.get('aiVideoGenerations')).toBe(0);
	});
});

// ─── AI logo generation: upload-only on the free tier ────────────────

describe('POST /api/brand/assets/generate (logo)', () => {
	async function call(plan: string) {
		vi.doMock('$lib/services/ai-media-generation', () => ({
			generateImage: vi.fn(async () => ({ id: 'gen-1' })),
			generateAudio: vi.fn(),
			requestAIVideoGeneration: vi.fn(),
			getAIGeneration: vi.fn(),
			getAIGenerationsByBrand: vi.fn(),
			updateAIGenerationStatus: vi.fn(),
			AI_IMAGE_MODELS: [],
			AI_AUDIO_MODELS: [],
			isWorkersAIModel: vi.fn(() => false),
			runWorkersAIImage: vi.fn()
		}));

		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');
		const world = planWorld({
			plan,
			handlers: { 'SELECT user_id FROM brand_profiles': () => ({ user_id: 'u1' }) }
		});

		const result = await caught(() =>
			POST({
				request: new Request('https://nabu.test', {
					method: 'POST',
					body: JSON.stringify({ type: 'image', brandProfileId: 'b1', category: 'logo' })
				}),
				platform: { env: { DB: world.db, KV: { get: vi.fn(async () => null) } } },
				locals: { user: freeUser }
			} as never)
		);

		return { world, result };
	}

	it('refuses to generate a logo on the free tier, and spends nothing doing so', async () => {
		const { result, world } = await call('starter');
		expect(refusalOf(result)).toMatchObject({ feature: 'aiLogoGeneration' });
		// The feature check comes before the allowance, so a refusal is free.
		expect(world.counters.get('aiImageGenerations')).toBeUndefined();
	});

	it('gets past the feature check on a paid plan', async () => {
		const { result } = await call('pro');
		// It fails later, for want of a configured OpenAI key — but not for the plan.
		expect(refusalOf(result)).toBeNull();
		expect(result?.status).toBe(400);
	});
});

// ─── Storage ─────────────────────────────────────────────────────────

describe('POST /api/brand/assets/upload', () => {
	const GB = 1024 ** 3;

	async function call(plan: string, storageBytes: number, fileSize: number) {
		const { POST } = await import('../../src/routes/api/brand/assets/upload/+server');
		const world = planWorld({
			plan,
			storageBytes,
			handlers: { 'SELECT user_id FROM brand_profiles': () => ({ user_id: 'u1' }) }
		});
		const bucket = { put: vi.fn(async () => ({})) };

		const form = new FormData();
		form.set('file', new File(['x'.repeat(fileSize)], 'logo.png', { type: 'image/png' }));
		form.set('brandProfileId', 'b1');
		form.set('mediaType', 'image');
		form.set('category', 'logo');

		const result = await caught(() =>
			POST({
				request: new Request('https://nabu.test', { method: 'POST', body: form }),
				platform: { env: { DB: world.db, BUCKET: bucket } },
				locals: { user: freeUser }
			} as never)
		);

		return { bucket, result };
	}

	it('refuses an upload that would cross the free tier’s 1 GB, before writing it', async () => {
		const { result, bucket } = await call('starter', GB - 10, 100);
		expect(refusalOf(result)).toMatchObject({ code: 'plan_storage_exceeded', metric: 'storage' });
		// R2 has no undo that leaves the quota consistent, so the object must not land.
		expect(bucket.put).not.toHaveBeenCalled();
	});

	it('accepts the same upload with room to spare', async () => {
		const { bucket } = await call('starter', 1024, 100);
		expect(bucket.put).toHaveBeenCalled();
	});

	it('accepts it on a plan with a bigger ceiling', async () => {
		const { bucket } = await call('pro', GB - 10, 100);
		expect(bucket.put).toHaveBeenCalled();
	});
});

// ─── Seats ───────────────────────────────────────────────────────────

describe('POST /api/admin/brands/[id]/access', () => {
	async function call(ownerPlan: string, grantees: string[] = []) {
		const { POST } = await import('../../src/routes/api/admin/brands/[id]/access/+server');
		const world = planWorld({
			plan: ownerPlan,
			grantees,
			handlers: {
				'SELECT user_id FROM brand_profiles WHERE id = ?': () => ({ user_id: 'owner-1' })
			}
		});

		return caught(() =>
			POST({
				platform: { env: { DB: world.db } },
				locals: { user: { ...freeUser, isAdmin: true } },
				params: { id: 'b1' },
				request: new Request('https://nabu.test', {
					method: 'POST',
					body: JSON.stringify({ userId: 'friend', role: 'editor' })
				})
			} as never)
		);
	}

	it('refuses a second seat when the owner is on the single-user plan', async () => {
		// Counted against the brand owner, not the admin doing the granting.
		const result = await call('starter');
		expect(refusalOf(result)).toMatchObject({
			code: 'plan_seats_exceeded',
			metric: 'teamMembers',
			limit: 1
		});
	});

	it('allows it when the owner pays for seats', async () => {
		expect(await call('pro')).toBeNull();
	});

	it('refuses once a paid plan’s seats are taken', async () => {
		expect(refusalOf(await call('pro', ['a', 'b']))).toMatchObject({ code: 'plan_seats_exceeded' });
	});
});

// ─── The public API is bound by the same limits ──────────────────────

describe('POST /api/v1/brands/[id]/logos', () => {
	async function call(plan: string, counters: Record<string, number> = {}) {
		// Reset first: the logo suite above doMocks ai-media-generation with
		// `isWorkersAIModel: () => false`, which would make this route bail at model
		// validation long before reaching the plan check it is here to exercise.
		vi.resetModules();

		const world = planWorld({ plan, counters });

		vi.doMock('$lib/server/api-guard', () => ({
			requireApiKey: vi.fn(async () => ({
				ok: true,
				value: { principal: { userId: 'u1', keyId: 'k1' }, db: world.db }
			})),
			requireBrand: vi.fn(async () => ({ ok: true, value: 'owner' })),
			readJson: vi.fn(async () => ({ ok: true, value: {} })),
			apiJson: vi.fn(
				(body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
			)
		}));

		vi.doMock('$lib/services/ai-media-generation', () => ({
			generateImage: vi.fn(async () => ({ id: 'gen-1' })),
			isWorkersAIModel: vi.fn(() => true),
			runWorkersAIImage: vi.fn(async () => ({ image: btoa('image-bytes') })),
			updateAIGenerationStatus: vi.fn()
		}));

		vi.doMock('$lib/services/brand-assets', () => ({
			createBrandMedia: vi.fn(async () => ({ id: 'media-1' }))
		}));

		const { POST } = await import('../../src/routes/api/v1/brands/[id]/logos/+server');

		return POST({
			request: new Request('https://nabu.test', { method: 'POST' }),
			params: { id: 'b1' },
			platform: { env: { DB: world.db, AI: {}, BUCKET: { put: vi.fn() } } }
		} as never);
	}

	it('answers a free account in the v1 error envelope, not a thrown page', async () => {
		const response = await call('starter');
		expect(response.status).toBe(402);
		const payload = await response.json();
		expect(payload.error.code).toBe('plan_feature_locked');
	});

	it('reports an exhausted image allowance the same way', async () => {
		const response = await call('pro', { aiImageGenerations: 100 });
		expect(response.status).toBe(402);
		expect((await response.json()).error.code).toBe('plan_limit_reached');
	});
});

// ─── Reporting ───────────────────────────────────────────────────────

describe('GET /api/account/usage', () => {
	it('reports the free tier’s allowances and what is left', async () => {
		const { GET } = await import('../../src/routes/api/account/usage/+server');
		const world = planWorld({
			plan: 'starter',
			counters: { aiVideoGenerations: 1 },
			storageBytes: 2048
		});

		const response = await GET({
			platform: { env: { DB: world.db } },
			locals: { user: freeUser }
		} as never);

		const payload = await response.json();
		expect(payload.plan).toBe('starter');
		expect(payload.planName).toBe('Starter');
		expect(payload.metrics.aiVideoGenerations).toEqual({ used: 1, limit: 2, remaining: 1 });
		expect(payload.storage.usedBytes).toBe(2048);
		expect(payload.features.voiceChat).toBe(false);
	});

	it('requires a session', async () => {
		const { GET } = await import('../../src/routes/api/account/usage/+server');
		const result = await caught(() =>
			GET({ platform: { env: { DB: planWorld().db } }, locals: {} } as never)
		);
		expect(result?.status).toBe(401);
	});

	it('answers 503 without a database', async () => {
		const { GET } = await import('../../src/routes/api/account/usage/+server');
		const result = await caught(() =>
			GET({ platform: { env: {} }, locals: { user: freeUser } } as never)
		);
		expect(result?.status).toBe(503);
	});
});
