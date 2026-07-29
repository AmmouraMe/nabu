/**
 * The two places that meter *per item* rather than per request.
 *
 * Bulk operations are where a naive gate does the most damage: charging the whole
 * batch up front means an account with eight text generations left and twenty empty
 * fields gets nothing at all, rather than the eight it is owed. Both routes here
 * count as they go and report what they had to skip, and that is what these tests
 * pin down — along with the cron job, which is the one AI spender with no user
 * request behind it to attach a plan to.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { planWorld } from '../fixtures/plan-db';

const user = { id: 'u1', login: 'ada', email: 'ada@example.com', isOwner: false };

vi.mock('$lib/services/brand', () => ({
	getBrandProfileForUser: vi.fn(async () => ({ id: 'b1', brandName: 'Nabu' })),
	updateBrandFieldWithVersion: vi.fn(async () => undefined),
	BRAND_FIELD_LABELS: {} as Record<string, string>
}));

vi.mock('$lib/services/brand-ai-fill', () => ({
	getEmptyTextFields: vi.fn(() => ['tagline', 'missionStatement', 'visionStatement']),
	AI_FILLABLE_FIELDS: [
		{ fieldKey: 'tagline', label: 'Tagline', promptTemplate: 'a tagline' },
		{ fieldKey: 'missionStatement', label: 'Mission', promptTemplate: 'a mission' },
		{ fieldKey: 'visionStatement', label: 'Vision', promptTemplate: 'a vision' }
	]
}));

vi.mock('$lib/services/ai-text-generation', () => ({
	buildBrandContextPrompt: vi.fn(() => 'system prompt')
}));

vi.mock('$lib/services/brand-assets', () => ({
	getBrandTexts: vi.fn(async () => []),
	syncFieldToTextAsset: vi.fn(async () => undefined)
}));

vi.mock('$lib/services/openai-chat', () => ({
	getFirstEnabledAIKey: vi.fn(async () => ({ provider: 'openai', apiKey: 'sk', model: 'gpt-4o' })),
	chatCompletionWithKey: vi.fn(async () => 'generated text')
}));

vi.mock('$lib/services/content-generator', () => ({
	generateContentCalendar: vi.fn(async () => [{ topic: 'Launch week', platforms: ['devto'] }]),
	generateDevToPost: vi.fn(async () => ({ title: 'A post', body: 'Body' })),
	generateLinkedInUpdate: vi.fn(async () => ({ text: 'An update' })),
	generateVideoScript: vi.fn(async () => ({ title: 'A script', script: '…', durationSeconds: 8 }))
}));

beforeEach(() => {
	vi.clearAllMocks();
});

// ─── Filling a brand's empty fields ──────────────────────────────────

describe('POST /api/brand/assets/fill-empty-fields', () => {
	async function call(plan: string, counters: Record<string, number> = {}) {
		const { POST } = await import('../../src/routes/api/brand/assets/fill-empty-fields/+server');
		const world = planWorld({ plan, counters });

		const response = await POST({
			request: new Request('https://nabu.test', {
				method: 'POST',
				body: JSON.stringify({ brandProfileId: 'b1' })
			}),
			platform: { env: { DB: world.db, KV: {} } },
			locals: { user }
		} as never);

		return { world, payload: await response.json() };
	}

	it('fills every field when the allowance covers them', async () => {
		const { payload, world } = await call('starter');

		expect(payload.totalFilled).toBe(3);
		expect(payload.totalSkipped).toBe(0);
		expect(payload.limitReached).toBeNull();
		expect(world.counters.get('aiTextGenerations')).toBe(3);
	});

	it('fills what it can and skips the rest when the allowance runs out mid-batch', async () => {
		// 50 a month on Starter, 49 already spent: one field gets filled, two do not.
		const { payload, world } = await call('starter', { aiTextGenerations: 49 });

		expect(payload.totalFilled).toBe(1);
		expect(payload.totalSkipped).toBe(2);
		expect(payload.limitReached).toContain('AI text generations');
		expect(world.counters.get('aiTextGenerations')).toBe(50);

		const skipped = payload.results.filter((r: { status: string }) => r.status === 'skipped');
		expect(skipped).toHaveLength(2);
		// Skipped, not failed — nothing went wrong, the plan simply ran out.
		expect(payload.results.some((r: { status: string }) => r.status === 'error')).toBe(false);
	});

	it('skips everything, and generates nothing, when there is no allowance left', async () => {
		const chat = await import('$lib/services/openai-chat');
		const { payload } = await call('starter', { aiTextGenerations: 50 });

		expect(payload.totalFilled).toBe(0);
		expect(payload.totalSkipped).toBe(3);
		expect(vi.mocked(chat.chatCompletionWithKey)).not.toHaveBeenCalled();
	});

	it('hands the unit back for a field the model returned nothing for', async () => {
		const chat = await import('$lib/services/openai-chat');
		vi.mocked(chat.chatCompletionWithKey)
			.mockResolvedValueOnce('')
			.mockResolvedValue('generated text');

		const { payload, world } = await call('starter');

		expect(payload.totalFailed).toBe(1);
		expect(payload.totalFilled).toBe(2);
		// Two useful generations, two units — the empty one was refunded.
		expect(world.counters.get('aiTextGenerations')).toBe(2);
	});

	it('hands the unit back when a generation throws', async () => {
		const chat = await import('$lib/services/openai-chat');
		vi.mocked(chat.chatCompletionWithKey)
			.mockRejectedValueOnce(new Error('provider exploded'))
			.mockResolvedValue('generated text');

		const { payload, world } = await call('starter');

		expect(payload.totalFailed).toBe(1);
		expect(world.counters.get('aiTextGenerations')).toBe(2);
	});

	it('gives a paid plan more room for the same batch', async () => {
		// Starter would be exhausted at 50; Pro has 500.
		const { payload } = await call('pro', { aiTextGenerations: 60 });
		expect(payload.totalFilled).toBe(3);
	});
});

// ─── Content generation across platforms ─────────────────────────────

describe('POST /api/content/generate', () => {
	async function call(plan: string, counters: Record<string, number>, platforms: string[]) {
		vi.doMock('$lib/services/video/veo3', () => ({
			generateVideo: vi.fn(),
			googleKvKey: (id: string) => `google:apikey:${id}`
		}));

		const { POST } = await import('../../src/routes/api/content/generate/+server');
		const world = planWorld({
			plan,
			counters,
			handlers: {
				'SELECT * FROM brands WHERE id = ? AND user_id = ?': () => ({
					id: 'br1',
					user_id: 'u1',
					name: 'Nabu'
				})
			}
		});

		const response = await POST({
			request: new Request('https://nabu.test', {
				method: 'POST',
				body: JSON.stringify({ brandId: 'br1', topic: 'launch', platforms })
			}),
			platform: { env: { DB: world.db, AI: {}, KV: { get: vi.fn(async () => null) } } },
			locals: { user }
		} as never);

		return { world, payload: await response.json() };
	}

	it('skips the platforms it cannot pay for, and says so', async () => {
		const { payload } = await call('starter', { aiTextGenerations: 49 }, [
			'devto',
			'linkedin',
			'devto'
		]);

		expect(payload.created).toHaveLength(1);
		expect(payload.skipped).toHaveLength(2);
		expect(payload.limitReached).toContain('AI text generations');
	});

	it('does not charge for a platform it cannot generate for', async () => {
		const { world, payload } = await call('starter', {}, ['myspace']);

		expect(payload.failures).toHaveLength(1);
		expect(world.counters.get('aiTextGenerations')).toBe(0);
	});
});

// ─── The cron job: AI spending with nobody's request behind it ────────

describe('GET /api/cron/content', () => {
	async function call(brands: Array<{ id: string; user_id: string; name: string }>, plan: string) {
		const { GET } = await import('../../src/routes/api/cron/content/+server');
		const world = planWorld({
			plan,
			handlers: {
				'SELECT * FROM brands WHERE auto_schedule = 1': () => brands
			}
		});

		const response = await GET({
			request: new Request('https://nabu.test', {
				headers: { Authorization: 'Bearer cron-secret' }
			}),
			platform: { env: { DB: world.db, AI: {}, CRON_SECRET: 'cron-secret' } }
		} as never);

		return { world, payload: await response.json() };
	}

	const brand = { id: 'br1', user_id: 'owner-1', name: 'Nabu' };

	it('skips brands whose owner has no content calendar', async () => {
		const generator = await import('$lib/services/content-generator');
		const { payload, world } = await call([brand], 'starter');

		expect(payload.summary[0].skipped).toBe('plan_feature_locked');
		// Nothing generated, nothing charged: the free tier never reaches the model.
		expect(vi.mocked(generator.generateContentCalendar)).not.toHaveBeenCalled();
		expect(world.counters.get('aiTextGenerations')).toBeUndefined();
	});

	it('generates for a paid owner and charges one text generation', async () => {
		const { payload, world } = await call([brand], 'pro');

		expect(payload.summary[0].skipped).toBeUndefined();
		expect(payload.summary[0].generated).toBe(1);
		expect(world.counters.get('aiTextGenerations')).toBe(1);
	});

	it('skips a paid owner who has spent the month’s allowance', async () => {
		const { GET } = await import('../../src/routes/api/cron/content/+server');
		const world = planWorld({
			plan: 'pro',
			counters: { aiTextGenerations: 500 },
			handlers: { 'SELECT * FROM brands WHERE auto_schedule = 1': () => [brand] }
		});

		const response = await GET({
			request: new Request('https://nabu.test', {
				headers: { Authorization: 'Bearer cron-secret' }
			}),
			platform: { env: { DB: world.db, AI: {}, CRON_SECRET: 'cron-secret' } }
		} as never);

		expect((await response.json()).summary[0].skipped).toBe('plan_limit_reached');
	});

	it('resolves each owner’s plan once, however many brands they have', async () => {
		const { world } = await call(
			[brand, { ...brand, id: 'br2' }, { ...brand, id: 'br3' }],
			'business'
		);

		const planLookups = world.statements.filter((s) => s.startsWith('SELECT plan FROM users'));
		expect(planLookups).toHaveLength(1);
	});
});
