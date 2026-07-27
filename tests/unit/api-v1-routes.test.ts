/**
 * Route-level tests for the public v1 API and the session-authenticated key
 * management beside it.
 *
 * The units underneath (`api-keys`, `api-guard`, `logo-prompt`) have their own tests;
 * these drive the handlers themselves, which is where the authorisation is actually
 * wired up — a guard that is correct but never called protects nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/services/ai-media-generation', () => ({
	generateImage: vi.fn(),
	isWorkersAIModel: vi.fn((m: string) => String(m).startsWith('@cf/')),
	runWorkersAIImage: vi.fn(),
	updateAIGenerationStatus: vi.fn()
}));
vi.mock('$lib/services/brand-assets', () => ({ createBrandMedia: vi.fn() }));

import {
	generateImage,
	runWorkersAIImage,
	updateAIGenerationStatus
} from '$lib/services/ai-media-generation';
import { createBrandMedia } from '$lib/services/brand-assets';
import { hashApiKey, mintApiKey } from '../../src/lib/server/api-keys';

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * A D1 fake that answers by matching the SQL, so handlers can be driven without
 * caring what order they query in. `answers` maps a substring of the statement to
 * the row (`first`) or rows (`all`) it should return.
 */
function fakeDb(
	answers: Array<{ match: string; first?: unknown; all?: unknown[]; changes?: number }>
) {
	const statements: string[] = [];
	const db = {
		prepare(sql: string) {
			const flat = sql.replace(/\s+/g, ' ').trim();
			statements.push(flat);
			const hit = answers.find((a) => flat.includes(a.match));
			return {
				bind: (...binds: unknown[]) => {
					(db as any).lastBinds = binds;
					return {
						first: async () => hit?.first ?? null,
						all: async () => ({ results: hit?.all ?? [] }),
						run: async () => ({ meta: { changes: hit?.changes ?? 0 } })
					};
				}
			};
		},
		statements
	};
	return db;
}

const KEY_HASH_FOR = (plaintext: string) => hashApiKey(plaintext);

/** A working key whose row grants the given scopes. */
async function keyedRequest(
	scopes: string[],
	opts: {
		brandProfileId?: string | null;
		revokedAt?: string | null;
		expiresAt?: string | null;
	} = {}
) {
	const { plaintext } = await mintApiKey();
	const keyRow = {
		id: 'key-1',
		user_id: 'owner-1',
		scopes: JSON.stringify(scopes),
		brand_profile_id: opts.brandProfileId ?? null,
		revoked_at: opts.revokedAt ?? null,
		expires_at: opts.expiresAt ?? null
	};
	const request = new Request('http://x/api/v1/brands', {
		headers: { Authorization: `Bearer ${plaintext}` }
	});
	return { plaintext, keyRow, request };
}

const KEY_LOOKUP = 'FROM api_keys WHERE key_hash';
const OWNERSHIP = 'SELECT user_id FROM brand_profiles';
const GRANT = 'FROM brand_access';

function platformWith(db: unknown, extra: Record<string, unknown> = {}) {
	return {
		env: { DB: db, ...extra },
		context: { waitUntil: vi.fn() }
	} as any;
}

beforeEach(() => {
	vi.clearAllMocks();
});

// ─── GET /api/v1/brands ──────────────────────────────────────────

describe('GET /api/v1/brands', () => {
	it('refuses a request with no bearer token', async () => {
		const { GET } = await import('../../src/routes/api/v1/brands/+server');
		const res = await GET({
			request: new Request('http://x/api/v1/brands'),
			platform: platformWith(fakeDb([]))
		} as any);

		expect(res.status).toBe(401);
		expect((await res.json()).error.code).toBe('missing_credentials');
	});

	it('answers 503 when the database is absent', async () => {
		const { GET } = await import('../../src/routes/api/v1/brands/+server');
		const res = await GET({
			request: new Request('http://x/api/v1/brands'),
			platform: { env: {} }
		} as any);

		expect(res.status).toBe(503);
	});

	it('gives unknown, revoked and expired keys the same answer', async () => {
		const { GET } = await import('../../src/routes/api/v1/brands/+server');

		const unknown = await keyedRequest(['brands:read']);
		const unknownRes = await GET({
			request: unknown.request,
			platform: platformWith(fakeDb([{ match: KEY_LOOKUP, first: null }]))
		} as any);

		const revoked = await keyedRequest(['brands:read'], { revokedAt: '2020-01-01T00:00:00.000Z' });
		const revokedRes = await GET({
			request: revoked.request,
			platform: platformWith(
				fakeDb([
					{
						match: KEY_LOOKUP,
						first: { ...revoked.keyRow, key_hash: await KEY_HASH_FOR(revoked.plaintext) }
					}
				])
			)
		} as any);

		const expired = await keyedRequest(['brands:read'], { expiresAt: '2020-01-01T00:00:00.000Z' });
		const expiredRes = await GET({
			request: expired.request,
			platform: platformWith(fakeDb([{ match: KEY_LOOKUP, first: expired.keyRow }]))
		} as any);

		for (const res of [unknownRes, revokedRes, expiredRes]) {
			expect(res.status).toBe(401);
			expect((await res.json()).error.code).toBe('invalid_key');
		}
	});

	it('refuses a key that lacks the scope', async () => {
		const { GET } = await import('../../src/routes/api/v1/brands/+server');
		const { request, keyRow } = await keyedRequest(['assets:read']);

		const res = await GET({
			request,
			platform: platformWith(fakeDb([{ match: KEY_LOOKUP, first: keyRow }]))
		} as any);

		expect(res.status).toBe(403);
		expect((await res.json()).error.code).toBe('insufficient_scope');
	});

	it('returns the caller’s brands, shaped for the API', async () => {
		const { GET } = await import('../../src/routes/api/v1/brands/+server');
		const { request, keyRow } = await keyedRequest(['brands:read']);
		const db = fakeDb([
			{ match: KEY_LOOKUP, first: keyRow },
			{
				match: 'FROM brand_profiles bp',
				all: [
					{
						id: 'b1',
						brand_name: 'Acme',
						tagline: 'We make things',
						status: 'active',
						primary_color: '#ff0000',
						secondary_color: '#00ff00',
						accent_color: '#0000ff',
						logo_url: '/logo.png',
						industry: 'widgets',
						created_at: 'then',
						updated_at: 'now',
						role: 'owner'
					}
				]
			}
		]);

		const res = await GET({ request, platform: platformWith(db) } as any);
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.data[0]).toMatchObject({
			id: 'b1',
			name: 'Acme',
			role: 'owner',
			colors: { primary: '#ff0000', secondary: '#00ff00', accent: '#0000ff' }
		});
	});

	it('returns an empty list when the driver hands back no results at all', async () => {
		const { GET } = await import('../../src/routes/api/v1/brands/+server');
		const { request, keyRow } = await keyedRequest(['brands:read']);
		const db = {
			prepare: () => ({ bind: () => ({ first: async () => keyRow, all: async () => ({}) }) })
		};

		const res = await GET({ request, platform: platformWith(db) } as any);
		expect((await res.json()).data).toEqual([]);
	});

	it('scopes the query to one brand when the key is brand-scoped', async () => {
		const { GET } = await import('../../src/routes/api/v1/brands/+server');
		const { request, keyRow } = await keyedRequest(['brands:read'], { brandProfileId: 'b1' });
		const db = fakeDb([
			{ match: KEY_LOOKUP, first: keyRow },
			{ match: 'FROM brand_profiles bp', all: [] }
		]);

		await GET({ request, platform: platformWith(db) } as any);

		// The restriction is in the SQL, not applied to the results afterwards.
		expect(db.statements.some((s) => s.includes('AND bp.id = ?'))).toBe(true);
	});
});

// ─── GET /api/v1/brands/:id/logos ────────────────────────────────

describe('GET /api/v1/brands/:id/logos', () => {
	it('answers 404 for a brand the key cannot reach — never 403', async () => {
		const { GET } = await import('../../src/routes/api/v1/brands/[id]/logos/+server');
		const { request, keyRow } = await keyedRequest(['assets:read']);
		const db = fakeDb([
			{ match: KEY_LOOKUP, first: keyRow },
			{ match: OWNERSHIP, first: { user_id: 'someone-else' } },
			{ match: GRANT, first: null }
		]);

		const res = await GET({ request, platform: platformWith(db), params: { id: 'b1' } } as any);

		expect(res.status).toBe(404);
		expect((await res.json()).error.code).toBe('brand_not_found');
	});

	it('lists logos with key-fetchable URLs and the current logo', async () => {
		const { GET } = await import('../../src/routes/api/v1/brands/[id]/logos/+server');
		const { request, keyRow } = await keyedRequest(['assets:read']);
		const db = fakeDb([
			{ match: KEY_LOOKUP, first: keyRow },
			{ match: OWNERSHIP, first: { user_id: 'owner-1' } },
			{
				match: 'FROM brand_media',
				all: [
					{
						id: 'm1',
						name: 'abstract logo',
						r2_key: 'brands/b1/logo/m1.jpg',
						mime_type: 'image/jpeg',
						width: 1024,
						height: 1024,
						created_at: 'now'
					}
				]
			},
			{ match: 'SELECT logo_url FROM brand_profiles', first: { logo_url: '/app/logo' } }
		]);

		const res = await GET({ request, platform: platformWith(db), params: { id: 'b1' } } as any);
		const body = await res.json();

		expect(body.data[0].url).toBe('/api/v1/brands/b1/assets/m1/content');
		// Not the raw R2 key: handing that back is what made the session route a
		// read-anything endpoint.
		expect(JSON.stringify(body.data[0])).not.toContain('brands/b1/logo/m1.jpg');
		expect(body.current_logo_url).toBe('/app/logo');
	});
});

// ─── POST /api/v1/brands/:id/logos ───────────────────────────────

describe('POST /api/v1/brands/:id/logos', () => {
	async function postLogo(
		body: unknown,
		{
			role = 'owner',
			answers = [] as Array<{ match: string; first?: unknown; all?: unknown[] }>,
			env = {} as Record<string, unknown>,
			scopes = ['assets:write']
		} = {}
	) {
		const { POST } = await import('../../src/routes/api/v1/brands/[id]/logos/+server');
		const { keyRow } = await keyedRequest(scopes);
		const request = new Request('http://x/api/v1/brands/b1/logos', {
			method: 'POST',
			headers: { Authorization: 'Bearer nabu_sk_test' },
			body: typeof body === 'string' ? body : JSON.stringify(body)
		});
		const db = fakeDb([
			{ match: KEY_LOOKUP, first: keyRow },
			{
				match: OWNERSHIP,
				first: role === 'owner' ? { user_id: 'owner-1' } : { user_id: 'someone-else' }
			},
			{ match: GRANT, first: role === 'owner' ? null : { role } },
			...answers
		]);
		const res = await POST({
			request,
			platform: platformWith(db, { AI: {}, BUCKET: { put: vi.fn() }, ...env }),
			params: { id: 'b1' }
		} as any);
		return { res, db };
	}

	it('rejects a body that is not JSON', async () => {
		const { res } = await postLogo('{oops');
		expect(res.status).toBe(400);
		expect((await res.json()).error.code).toBe('invalid_json');
	});

	it('rejects a body that is not an object', async () => {
		const { res } = await postLogo('[1,2,3]');
		expect(res.status).toBe(400);
		expect((await res.json()).error.code).toBe('invalid_body');
	});

	it('rejects an unknown style', async () => {
		const { res } = await postLogo({ style: 'holographic' });
		expect(res.status).toBe(400);
		expect((await res.json()).error.code).toBe('invalid_style');
	});

	it('rejects an over-long instruction', async () => {
		const { res } = await postLogo({ instruction: 'x'.repeat(501) });
		expect(res.status).toBe(400);
		expect((await res.json()).error.code).toBe('instruction_too_long');
	});

	it('rejects a non-Workers-AI model', async () => {
		const { res } = await postLogo({ model: 'dall-e-3' });
		expect(res.status).toBe(400);
		expect((await res.json()).error.code).toBe('unsupported_model');
	});

	it('refuses a viewer, who may read but not write', async () => {
		const { res } = await postLogo({}, { role: 'viewer' });
		expect(res.status).toBe(403);
		expect((await res.json()).error.code).toBe('read_only_access');
	});

	it('answers 503 when the AI binding is missing', async () => {
		const { POST } = await import('../../src/routes/api/v1/brands/[id]/logos/+server');
		const { keyRow } = await keyedRequest(['assets:write']);
		const db = fakeDb([
			{ match: KEY_LOOKUP, first: keyRow },
			{ match: OWNERSHIP, first: { user_id: 'owner-1' } }
		]);
		const res = await POST({
			request: new Request('http://x/l', {
				method: 'POST',
				headers: { Authorization: 'Bearer nabu_sk_test' },
				body: '{}'
			}),
			platform: platformWith(db, { BUCKET: {} }),
			params: { id: 'b1' }
		} as any);

		expect(res.status).toBe(503);
		expect((await res.json()).error.code).toBe('ai_unavailable');
	});

	it('answers 503 when storage is missing', async () => {
		const { POST } = await import('../../src/routes/api/v1/brands/[id]/logos/+server');
		const { keyRow } = await keyedRequest(['assets:write']);
		const db = fakeDb([
			{ match: KEY_LOOKUP, first: keyRow },
			{ match: OWNERSHIP, first: { user_id: 'owner-1' } }
		]);
		const res = await POST({
			request: new Request('http://x/l', {
				method: 'POST',
				headers: { Authorization: 'Bearer nabu_sk_test' },
				body: '{}'
			}),
			platform: platformWith(db, { AI: {} }),
			params: { id: 'b1' }
		} as any);

		expect(res.status).toBe(503);
		expect((await res.json()).error.code).toBe('storage_unavailable');
	});

	it('generates a logo, stores it, and returns a key-fetchable URL', async () => {
		vi.mocked(generateImage).mockResolvedValue({ id: 'gen-1' } as any);
		// One black pixel's worth of base64 — enough to exercise the decode.
		vi.mocked(runWorkersAIImage).mockResolvedValue({ image: btoa('imagebytes') } as any);
		vi.mocked(createBrandMedia).mockResolvedValue({ id: 'media-1' } as any);

		const { res } = await postLogo({ style: 'wordmark', instruction: 'make it bold' });
		const body = await res.json();

		expect(res.status).toBe(201);
		expect(body.data).toMatchObject({
			id: 'media-1',
			generation_id: 'gen-1',
			url: '/api/v1/brands/b1/assets/media-1/content',
			style: 'wordmark',
			set_as_logo: false
		});
		expect(updateAIGenerationStatus).toHaveBeenCalledWith(expect.anything(), 'gen-1', {
			status: 'complete'
		});
	});

	it('feeds the brand’s own context into the prompt when the profile has any', async () => {
		vi.mocked(generateImage).mockResolvedValue({ id: 'gen-5' } as any);
		vi.mocked(runWorkersAIImage).mockResolvedValue({ image: btoa('bytes') } as any);
		vi.mocked(createBrandMedia).mockResolvedValue({ id: 'media-5' } as any);

		const { res } = await postLogo(
			{},
			{
				answers: [
					{
						match: 'SELECT brand_name, industry',
						first: {
							brand_name: 'Acme',
							industry: 'widgets',
							brand_personality_traits: 'bold, spare',
							primary_color: '#3498db',
							secondary_color: '#f1c40f',
							logo_concept: 'a rising arc'
						}
					}
				]
			}
		);
		const { prompt } = (await res.json()).data;

		expect(prompt).toContain('Acme');
		expect(prompt).toContain('widgets');
		expect(prompt).toContain('#3498db');
		expect(prompt).toContain('a rising arc');
	});

	it('assigns the brand logo only when asked', async () => {
		vi.mocked(generateImage).mockResolvedValue({ id: 'gen-2' } as any);
		vi.mocked(runWorkersAIImage).mockResolvedValue({ image: btoa('bytes') } as any);
		vi.mocked(createBrandMedia).mockResolvedValue({ id: 'media-2' } as any);

		const { res, db } = await postLogo({ set_as_logo: true });

		expect((await res.json()).data.set_as_logo).toBe(true);
		expect(db.statements.some((s) => s.includes('UPDATE brand_profiles SET logo_url'))).toBe(true);
	});

	it('records a failure on the generation row when the model returns nothing', async () => {
		vi.mocked(generateImage).mockResolvedValue({ id: 'gen-3' } as any);
		vi.mocked(runWorkersAIImage).mockResolvedValue({} as any);

		const { res } = await postLogo({});

		expect(res.status).toBe(502);
		expect((await res.json()).error.code).toBe('generation_failed');
		expect(updateAIGenerationStatus).toHaveBeenCalledWith(expect.anything(), 'gen-3', {
			status: 'failed',
			errorMessage: 'Model returned no image'
		});
	});

	it('names the generation id when generation throws, so a caller can correlate it', async () => {
		vi.mocked(generateImage).mockResolvedValue({ id: 'gen-4' } as any);
		vi.mocked(runWorkersAIImage).mockRejectedValue(new Error('model exploded'));

		const { res } = await postLogo({});
		const body = await res.json();

		expect(res.status).toBe(502);
		expect(body.error.message).toContain('gen-4');
		expect(updateAIGenerationStatus).toHaveBeenCalledWith(expect.anything(), 'gen-4', {
			status: 'failed',
			errorMessage: 'model exploded'
		});
	});
});

// ─── GET /api/v1/brands/:id/assets/:assetId/content ──────────────

describe('GET /api/v1/brands/:id/assets/:assetId/content', () => {
	async function getContent(
		answers: Array<{ match: string; first?: unknown }>,
		env: Record<string, unknown> = { BUCKET: { get: vi.fn().mockResolvedValue(null) } }
	) {
		const { GET } = await import(
			'../../src/routes/api/v1/brands/[id]/assets/[assetId]/content/+server'
		);
		const { keyRow } = await keyedRequest(['assets:read']);
		const db = fakeDb([
			{ match: KEY_LOOKUP, first: keyRow },
			{ match: OWNERSHIP, first: { user_id: 'owner-1' } },
			...answers
		]);
		return GET({
			request: new Request('http://x/c', { headers: { Authorization: 'Bearer nabu_sk_test' } }),
			platform: platformWith(db, env),
			params: { id: 'b1', assetId: 'a1' }
		} as any);
	}

	it('answers 503 without storage', async () => {
		const res = await getContent([], {});
		expect(res.status).toBe(503);
	});

	it('refuses a key with no assets:read scope', async () => {
		const { GET } = await import(
			'../../src/routes/api/v1/brands/[id]/assets/[assetId]/content/+server'
		);
		const { keyRow } = await keyedRequest(['brands:read']);
		const res = await GET({
			request: new Request('http://x/c', { headers: { Authorization: 'Bearer nabu_sk_test' } }),
			platform: platformWith(fakeDb([{ match: KEY_LOOKUP, first: keyRow }])),
			params: { id: 'b1', assetId: 'a1' }
		} as any);

		expect(res.status).toBe(403);
	});

	it('answers 404 for a brand the key cannot reach', async () => {
		const { GET } = await import(
			'../../src/routes/api/v1/brands/[id]/assets/[assetId]/content/+server'
		);
		const { keyRow } = await keyedRequest(['assets:read']);
		const res = await GET({
			request: new Request('http://x/c', { headers: { Authorization: 'Bearer nabu_sk_test' } }),
			platform: platformWith(
				fakeDb([
					{ match: KEY_LOOKUP, first: keyRow },
					{ match: OWNERSHIP, first: { user_id: 'someone-else' } },
					{ match: GRANT, first: null }
				]),
				{ BUCKET: {} }
			),
			params: { id: 'b1', assetId: 'a1' }
		} as any);

		expect(res.status).toBe(404);
		expect((await res.json()).error.code).toBe('brand_not_found');
	});

	it('falls back to octet-stream when neither R2 nor the row knows the type', async () => {
		const res = await getContent(
			[{ match: 'FROM brand_media', first: { r2_key: 'k', mime_type: null } }],
			{
				BUCKET: {
					get: vi.fn().mockResolvedValue({ body: new ReadableStream(), httpMetadata: undefined })
				}
			}
		);

		expect(res.headers.get('content-type')).toBe('application/octet-stream');
	});

	it('answers 404 for an asset id that is not in this brand', async () => {
		const res = await getContent([{ match: 'FROM brand_media', first: null }]);
		expect(res.status).toBe(404);
		expect((await res.json()).error.code).toBe('asset_not_found');
	});

	it('answers 410 when the row exists but the object is gone', async () => {
		const res = await getContent([
			{ match: 'FROM brand_media', first: { r2_key: 'brands/b1/logo/a1.jpg', mime_type: null } }
		]);
		expect(res.status).toBe(410);
		expect((await res.json()).error.code).toBe('asset_content_missing');
	});

	it('streams the object with a private cache header', async () => {
		const res = await getContent(
			[{ match: 'FROM brand_media', first: { r2_key: 'k', mime_type: 'image/jpeg' } }],
			{
				BUCKET: {
					get: vi.fn().mockResolvedValue({ body: new ReadableStream(), httpMetadata: {} })
				}
			}
		);

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('image/jpeg');
		expect(res.headers.get('cache-control')).toContain('private');
	});
});

// ─── /api/keys (session-authenticated) ───────────────────────────

describe('GET /api/keys', () => {
	it('requires a session', async () => {
		const { GET } = await import('../../src/routes/api/keys/+server');
		await expect(
			GET({ locals: {}, platform: platformWith(fakeDb([])) } as any)
		).rejects.toMatchObject({ status: 401 });
	});

	it('answers 503 without a database', async () => {
		const { GET } = await import('../../src/routes/api/keys/+server');
		await expect(
			GET({ locals: { user: { id: 'u1' } }, platform: { env: {} } } as any)
		).rejects.toMatchObject({ status: 503 });
	});

	it('marks a revoked key as revoked, and survives an empty scopes column', async () => {
		const { GET } = await import('../../src/routes/api/keys/+server');
		const db = fakeDb([
			{
				match: 'FROM api_keys WHERE user_id',
				all: [
					{
						id: 'k2',
						name: 'old',
						key_prefix: 'nabu_sk_xyz',
						scopes: null,
						brand_profile_id: 'b1',
						revoked_at: '2026-01-01T00:00:00.000Z',
						last_used_at: 'then',
						request_count: 0,
						expires_at: null,
						created_at: 'then'
					}
				]
			}
		]);

		const body = await (
			await GET({ locals: { user: { id: 'u1' } }, platform: platformWith(db) } as any)
		).json();

		expect(body.keys[0].revoked).toBe(true);
		expect(body.keys[0].scopes).toEqual([]);
	});

	it('lists keys without ever returning key material', async () => {
		const { GET } = await import('../../src/routes/api/keys/+server');
		const db = fakeDb([
			{
				match: 'FROM api_keys WHERE user_id',
				all: [
					{
						id: 'k1',
						name: 'CI',
						key_prefix: 'nabu_sk_abc',
						scopes: '["brands:read"]',
						brand_profile_id: null,
						revoked_at: null,
						last_used_at: null,
						request_count: 3,
						expires_at: null,
						created_at: 'now'
					}
				]
			}
		]);

		const res = await GET({ locals: { user: { id: 'u1' } }, platform: platformWith(db) } as any);
		const body = await res.json();

		expect(body.keys[0]).toMatchObject({ id: 'k1', key_prefix: 'nabu_sk_abc', revoked: false });
		expect(JSON.stringify(body)).not.toContain('key_hash');
	});
});

describe('POST /api/keys', () => {
	async function createKey(body: unknown, answers: Array<{ match: string; first?: unknown }> = []) {
		const { POST } = await import('../../src/routes/api/keys/+server');
		const db = fakeDb(answers);
		const call = POST({
			request: new Request('http://x/api/keys', {
				method: 'POST',
				body: typeof body === 'string' ? body : JSON.stringify(body)
			}),
			locals: { user: { id: 'u1' } },
			platform: platformWith(db)
		} as any);
		return { call, db };
	}

	it('requires a name', async () => {
		const { call } = await createKey({});
		await expect(call).rejects.toMatchObject({ status: 400 });
	});

	it('rejects a name over 80 characters', async () => {
		const { call } = await createKey({ name: 'x'.repeat(81) });
		await expect(call).rejects.toMatchObject({ status: 400 });
	});

	it('rejects an empty scope list', async () => {
		const { call } = await createKey({ name: 'CI', scopes: [] });
		await expect(call).rejects.toMatchObject({ status: 400 });
	});

	it('rejects unknown scopes rather than silently dropping them', async () => {
		const { call } = await createKey({ name: 'CI', scopes: ['brands:read', 'everything:write'] });
		await expect(call).rejects.toMatchObject({ status: 400 });
	});

	it('refuses to scope a key to a brand the creator cannot write', async () => {
		const { call } = await createKey({ name: 'CI', brand_profile_id: 'not-mine' }, [
			{ match: OWNERSHIP, first: { user_id: 'someone-else' } },
			{ match: GRANT, first: null }
		]);
		await expect(call).rejects.toMatchObject({ status: 404 });
	});

	it('returns the plaintext exactly once, with a warning', async () => {
		const { call } = await createKey({ name: 'CI', scopes: ['brands:read'] });
		const res = await call;
		const body = await res.json();

		expect(res.status).toBe(201);
		expect(body.key.startsWith('nabu_sk_')).toBe(true);
		expect(body.warning).toMatch(/cannot be retrieved again/i);
	});

	it('stores only a hash — the plaintext is never written to the row', async () => {
		const { call, db } = await createKey({ name: 'CI' });
		const body = await (await call).json();

		const insert = db.statements.find((s) => s.includes('INSERT INTO api_keys'));
		expect(insert).toBeDefined();
		expect((db as any).lastBinds).not.toContain(body.key);
		expect((db as any).lastBinds).toContain(await hashApiKey(body.key));
	});

	it('requires a session', async () => {
		const { POST } = await import('../../src/routes/api/keys/+server');
		await expect(
			POST({
				request: new Request('http://x/api/keys', { method: 'POST', body: '{}' }),
				locals: {},
				platform: platformWith(fakeDb([]))
			} as any)
		).rejects.toMatchObject({ status: 401 });
	});

	it('answers 503 without a database', async () => {
		const { POST } = await import('../../src/routes/api/keys/+server');
		await expect(
			POST({
				request: new Request('http://x/api/keys', { method: 'POST', body: '{}' }),
				locals: { user: { id: 'u1' } },
				platform: { env: {} }
			} as any)
		).rejects.toMatchObject({ status: 503 });
	});

	it('treats an unparseable body as empty rather than throwing', async () => {
		const { call } = await createKey('{not json');
		// No name survives, so it fails validation — not a 500.
		await expect(call).rejects.toMatchObject({ status: 400 });
	});

	it('carries an expiry through when one is given', async () => {
		const { call } = await createKey({ name: 'CI', expires_at: '2027-01-01T00:00:00.000Z' });
		const body = await (await call).json();
		expect(body.expires_at).toBe('2027-01-01T00:00:00.000Z');
	});

	it('accepts a brand scope the creator owns', async () => {
		const { call } = await createKey({ name: 'CI', brand_profile_id: 'b1' }, [
			{ match: OWNERSHIP, first: { user_id: 'u1' } }
		]);
		const body = await (await call).json();
		expect(body.brand_profile_id).toBe('b1');
	});
});

describe('DELETE /api/keys/:id', () => {
	it('requires a session', async () => {
		const { DELETE } = await import('../../src/routes/api/keys/[id]/+server');
		await expect(
			DELETE({ locals: {}, params: { id: 'k1' }, platform: platformWith(fakeDb([])) } as any)
		).rejects.toMatchObject({ status: 401 });
	});

	it('answers 503 without a database', async () => {
		const { DELETE } = await import('../../src/routes/api/keys/[id]/+server');
		await expect(
			DELETE({
				locals: { user: { id: 'u1' } },
				params: { id: 'k1' },
				platform: { env: {} }
			} as any)
		).rejects.toMatchObject({ status: 503 });
	});

	it('answers 404 when nothing was revoked — someone else’s key, or already revoked', async () => {
		const { DELETE } = await import('../../src/routes/api/keys/[id]/+server');
		await expect(
			DELETE({
				locals: { user: { id: 'u1' } },
				params: { id: 'k1' },
				platform: platformWith(fakeDb([{ match: 'UPDATE api_keys', changes: 0 }]))
			} as any)
		).rejects.toMatchObject({ status: 404 });
	});

	it('revokes by timestamp rather than deleting the row', async () => {
		const { DELETE } = await import('../../src/routes/api/keys/[id]/+server');
		const db = fakeDb([{ match: 'UPDATE api_keys', changes: 1 }]);
		const res = await DELETE({
			locals: { user: { id: 'u1' } },
			params: { id: 'k1' },
			platform: platformWith(db)
		} as any);

		expect((await res.json()).revoked).toBe(true);
		expect(db.statements.some((s) => s.includes('DELETE FROM api_keys'))).toBe(false);
		// Scoped to the caller: without this predicate the id alone would revoke
		// anyone's key.
		expect(db.statements[0]).toContain('user_id = ?');
	});
});

// ─── GET /api/v1/openapi.json ────────────────────────────────────

describe('GET /api/v1/openapi.json', () => {
	it('generates a document from the running spec', async () => {
		const { GET } = await import('../../src/routes/api/v1/openapi.json/+server');
		const res = await GET({} as any);
		const doc = await res.json();

		expect(doc.openapi).toBe('3.1.0');
		expect(Object.keys(doc.paths).length).toBeGreaterThan(0);
		expect(doc.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
		expect(res.headers.get('cache-control')).toContain('max-age');
	});

	it('writes SvelteKit’s [id] params in OpenAPI’s {id} form', async () => {
		const { GET } = await import('../../src/routes/api/v1/openapi.json/+server');
		const doc = await (await GET({} as any)).json();

		const paths = Object.keys(doc.paths);
		expect(paths.some((p) => p.includes('{id}'))).toBe(true);
		expect(paths.every((p) => !p.includes('['))).toBe(true);
	});

	it('describes path params and request bodies for the endpoints that take them', async () => {
		const { GET } = await import('../../src/routes/api/v1/openapi.json/+server');
		const doc = await (await GET({} as any)).json();

		const logos = doc.paths['/api/v1/brands/{id}/logos'];
		expect(logos.get.parameters[0]).toMatchObject({ name: 'id', in: 'path', required: true });
		expect(logos.post.requestBody.content['application/json'].schema.type).toBe('object');
		// `style` is an enum in the spec, so it must arrive as one here.
		expect(
			logos.post.requestBody.content['application/json'].schema.properties.style.enum
		).toBeDefined();
	});
});
