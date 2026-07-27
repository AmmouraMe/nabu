/**
 * Regression tests for the two IDORs on the session-authenticated asset routes.
 *
 * Before this, being logged in was treated as authorisation:
 *  - `POST /api/brand/assets/generate` accepted any `brandProfileId`, so any account
 *    could write assets into any brand and spend its AI quota; `GET ?id=` returned
 *    any generation.
 *  - `GET /api/brand/assets/file?key=…` served any R2 key to any account.
 *
 * Each test below is a stranger attempting exactly that, and expecting to be refused
 * with a 404 — not a 403, which would confirm the id exists.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/services/ai-media-generation', () => ({
	generateImage: vi.fn(),
	generateAudio: vi.fn(),
	requestAIVideoGeneration: vi.fn(),
	getAIGeneration: vi.fn(async () => ({ id: 'gen-1', brandProfileId: 'brand-of-victim' })),
	getAIGenerationsByBrand: vi.fn(async () => []),
	updateAIGenerationStatus: vi.fn(),
	AI_IMAGE_MODELS: [],
	AI_AUDIO_MODELS: [],
	isWorkersAIModel: vi.fn(() => false),
	runWorkersAIImage: vi.fn()
}));
vi.mock('$lib/services/brand-assets', () => ({ createBrandMedia: vi.fn() }));
vi.mock('$lib/services/media-history', () => ({
	logMediaActivity: vi.fn(),
	createMediaRevision: vi.fn()
}));
vi.mock('$lib/services/video-registry', () => ({ getEnabledVideoKey: vi.fn() }));

const VICTIM_BRAND = 'brand-of-victim';

/**
 * A database where `brand-of-victim` belongs to someone else and the caller holds no
 * `brand_access` grant.
 */
function dbWhereCallerIsAStranger() {
	return {
		prepare: vi.fn().mockImplementation((sql: string) => ({
			bind: vi.fn().mockReturnValue({
				first: vi
					.fn()
					.mockResolvedValue(sql.includes('FROM brand_profiles') ? { user_id: 'victim' } : null),
				all: vi.fn().mockResolvedValue({ results: [] }),
				run: vi.fn().mockResolvedValue({ success: true })
			})
		}))
	};
}

function strangerPlatform(bucket: Record<string, unknown> = {}) {
	return {
		env: {
			DB: dbWhereCallerIsAStranger(),
			KV: { get: vi.fn().mockResolvedValue(null) },
			BUCKET: {
				get: vi.fn().mockResolvedValue({
					body: new ReadableStream(),
					size: 10,
					httpMetadata: { contentType: 'image/png' }
				}),
				put: vi.fn(),
				...bucket
			},
			AI: {}
		},
		context: { waitUntil: vi.fn() }
	} as unknown as App.Platform;
}

const stranger = {
	id: 'attacker',
	login: 'attacker',
	email: 'a@b.c',
	isOwner: false,
	isAdmin: false
};

describe('POST /api/brand/assets/generate', () => {
	it('refuses to generate into a brand the caller cannot reach', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');
		const platform = strangerPlatform();

		await expect(
			POST({
				request: new Request('http://x/api/brand/assets/generate', {
					method: 'POST',
					body: JSON.stringify({ type: 'image', brandProfileId: VICTIM_BRAND, prompt: 'hi' })
				}),
				platform,
				locals: { user: stranger }
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any)
		).rejects.toMatchObject({ status: 404 });

		// The refusal has to land before any spend: nothing was written to R2.
		expect(platform.env.BUCKET.put).not.toHaveBeenCalled();
	});

	it('refuses an admin the same way — admins use the audited /api/admin surface', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');

		await expect(
			POST({
				request: new Request('http://x/api/brand/assets/generate', {
					method: 'POST',
					body: JSON.stringify({ type: 'image', brandProfileId: VICTIM_BRAND, prompt: 'hi' })
				}),
				platform: strangerPlatform(),
				locals: { user: { ...stranger, isAdmin: true } }
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any)
		).rejects.toMatchObject({ status: 404 });
	});
});

describe('GET /api/brand/assets/generate', () => {
	it('will not return another brand’s generation by id', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/generate/+server');

		await expect(
			GET({
				url: new URL('http://x/api/brand/assets/generate?id=gen-1'),
				platform: strangerPlatform(),
				locals: { user: stranger }
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any)
		).rejects.toMatchObject({ status: 404 });
	});

	it('will not list another brand’s generations', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/generate/+server');

		await expect(
			GET({
				url: new URL(`http://x/api/brand/assets/generate?brandProfileId=${VICTIM_BRAND}`),
				platform: strangerPlatform(),
				locals: { user: stranger }
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any)
		).rejects.toMatchObject({ status: 404 });
	});
});

describe('GET /api/brand/assets/file', () => {
	async function fetchKey(key: string, user = stranger) {
		const { GET } = await import('../../src/routes/api/brand/assets/file/+server');
		const platform = strangerPlatform();
		const call = GET({
			url: new URL(`http://x/api/brand/assets/file?key=${encodeURIComponent(key)}`),
			platform,
			locals: { user }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any);
		return { call, platform };
	}

	it('will not serve an object belonging to another brand', async () => {
		const { call, platform } = await fetchKey(`brands/${VICTIM_BRAND}/image/secret.png`);
		await expect(call).rejects.toMatchObject({ status: 404 });
		// Denied before the read, so the bucket is never touched.
		expect(platform.env.BUCKET.get).not.toHaveBeenCalled();
	});

	it('will not serve another brand’s onboarding attachments', async () => {
		const { call } = await fetchKey(`archive/${VICTIM_BRAND}/onboarding/images/x.png`);
		await expect(call).rejects.toMatchObject({ status: 404 });
	});

	it('will not serve another user’s video', async () => {
		const { call } = await fetchKey('videos/victim/gen-1.mp4');
		await expect(call).rejects.toMatchObject({ status: 404 });
	});

	it('will not serve a key whose prefix maps to no owner', async () => {
		const { call } = await fetchKey('some-other-place/backup.sql');
		await expect(call).rejects.toMatchObject({ status: 404 });
	});

	it('serves the caller their own video', async () => {
		const { call } = await fetchKey('videos/attacker/mine.mp4');
		const response = (await call) as Response;
		expect(response.status).toBe(200);
		// Authorised per user, so it must never be stored in a shared cache.
		expect(response.headers.get('Cache-Control')).toContain('private');
	});
});
