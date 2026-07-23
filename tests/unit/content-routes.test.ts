/**
 * Coverage for the content-automation routes (all shipped at 0%):
 *   api/content/{generate,items,publish}/+server.ts and api/cron/content.
 * The content-generator, veo3 and publisher services are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/services/content-generator', () => ({
	generateDevToPost: vi.fn().mockResolvedValue({ title: 'DT', body: 'db' }),
	generateLinkedInUpdate: vi.fn().mockResolvedValue({ text: 'li' }),
	generateVideoScript: vi.fn().mockResolvedValue({ title: 'V', script: 'scr', durationSeconds: 8 }),
	generateContentCalendar: vi
		.fn()
		.mockResolvedValue([{ topic: 'Topic', platforms: ['devto', 'linkedin'] }])
}));

vi.mock('$lib/services/video/veo3', () => ({
	generateVideo: vi.fn().mockResolvedValue({ operationName: 'op/123' }),
	googleKvKey: (u: string) => `google:apikey:${u}`
}));

vi.mock('$lib/services/publishers/devto', () => ({
	publishArticle: vi.fn().mockResolvedValue({ id: 1, url: 'https://dev.to/a/1', published: false }),
	devtoKvKey: (u: string) => `devto:apikey:${u}`
}));

vi.mock('$lib/services/publishers/linkedin', () => ({
	sharePost: vi.fn().mockResolvedValue({ id: 'urn:1', shareUrl: 'https://li/1' }),
	linkedInKvKey: (u: string) => `linkedin:token:${u}`
}));

const user = { id: 'u1' };

// D1 mock routing .first()/.all()/.run() by SQL substring.
function makeDB(routes: Array<{ match: string; first?: any; all?: any }>) {
	const run = vi.fn().mockResolvedValue({ success: true });
	const prepare = vi.fn((sql: string) => {
		const r = routes.find((x) => sql.includes(x.match)) || {};
		// Methods live on both the prepared statement and the bound one, since
		// some routes call .all()/.first() directly and others go through .bind().
		const methods = {
			first: vi.fn().mockResolvedValue((r as any).first ?? null),
			all: vi.fn().mockResolvedValue((r as any).all ?? { results: [] }),
			run
		};
		return { bind: vi.fn().mockReturnValue(methods), ...methods };
	});
	return { prepare, _run: run };
}
const req = (body: any) => ({ json: async () => body });
const brandRow = {
	id: 'br1',
	user_id: 'u1',
	name: 'Acme',
	tagline: null,
	voice_tone: null,
	target_audience: null,
	niche: null
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe('POST /api/content/generate', () => {
	let POST: any;
	beforeEach(async () => {
		POST = (await import('../../src/routes/api/content/generate/+server')).POST;
	});

	const call = (opts: any) =>
		POST({
			locals: opts.locals ?? { user },
			platform: opts.platform,
			request: req(opts.body ?? { brandId: 'br1', topic: 'T', platforms: ['devto'] })
		} as any);

	it('guards auth, body and the AI binding', async () => {
		await expect(call({ locals: { user: null }, platform: {} })).rejects.toMatchObject({
			status: 401
		});
		await expect(
			call({ platform: {}, body: { brandId: '', topic: '', platforms: [] } })
		).rejects.toMatchObject({ status: 400 });
		await expect(call({ platform: { env: { DB: makeDB([]) } } })).rejects.toMatchObject({
			status: 503
		});
	});

	it('404s when the brand is not found', async () => {
		const db = makeDB([{ match: 'FROM brands', first: null }]);
		await expect(call({ platform: { env: { DB: db, AI: {} } } })).rejects.toMatchObject({
			status: 404
		});
	});

	it('generates for devto and linkedin', async () => {
		const db = makeDB([{ match: 'FROM brands', first: brandRow }]);
		const res = await call({
			platform: { env: { DB: db, AI: {}, KV: { get: vi.fn() } } },
			body: { brandId: 'br1', topic: 'T', platforms: ['devto', 'linkedin'] }
		});
		const data = await res.json();
		expect(data.created).toHaveLength(2);
		expect(data.failures).toHaveLength(0);
	});

	it('generates a video and uses the Veo operation name when a Google key exists', async () => {
		const db = makeDB([{ match: 'FROM brands', first: brandRow }]);
		const res = await call({
			platform: { env: { DB: db, AI: {}, KV: { get: vi.fn().mockResolvedValue('gkey') } } },
			body: { brandId: 'br1', topic: 'T', platforms: ['youtube'] }
		});
		const data = await res.json();
		expect(data.created).toHaveLength(1);
		expect(data.created[0].platform).toBe('youtube');
	});

	it('records unsupported platforms and generation errors as failures', async () => {
		const gen = await import('$lib/services/content-generator');
		vi.mocked(gen.generateDevToPost).mockRejectedValueOnce(new Error('boom'));
		const db = makeDB([{ match: 'FROM brands', first: brandRow }]);
		const res = await call({
			platform: { env: { DB: db, AI: {}, KV: { get: vi.fn() } } },
			body: { brandId: 'br1', topic: 'T', platforms: ['nope', 'devto'] }
		});
		const data = await res.json();
		expect(data.failures.map((f: any) => f.platform)).toEqual(
			expect.arrayContaining(['nope', 'devto'])
		);
	});
});

describe('GET /api/content/items', () => {
	let GET: any;
	beforeEach(async () => {
		GET = (await import('../../src/routes/api/content/items/+server')).GET;
	});
	const url = (qs: string) => new URL(`http://x/api/content/items${qs}`);

	it('guards auth and brandId', async () => {
		await expect(
			GET({ locals: { user: null }, platform: {}, url: url('') } as any)
		).rejects.toMatchObject({ status: 401 });
		await expect(
			GET({ locals: { user }, platform: {}, url: url('') } as any)
		).rejects.toMatchObject({ status: 400 });
	});

	it('404s for a brand the user does not own', async () => {
		const db = makeDB([{ match: 'FROM brands', first: null }]);
		await expect(
			GET({ locals: { user }, platform: { env: { DB: db } }, url: url('?brandId=br1') } as any)
		).rejects.toMatchObject({ status: 404 });
	});

	it('returns the content items', async () => {
		const db = makeDB([
			{ match: 'FROM brands', first: { id: 'br1' } },
			{ match: 'FROM content_items', all: { results: [{ id: 'c1' }] } }
		]);
		const res = await GET({
			locals: { user },
			platform: { env: { DB: db } },
			url: url('?brandId=br1')
		} as any);
		expect((await res.json()).items).toHaveLength(1);
	});
});

describe('POST /api/content/publish', () => {
	let POST: any;
	beforeEach(async () => {
		POST = (await import('../../src/routes/api/content/publish/+server')).POST;
	});
	const call = (opts: any) =>
		POST({
			locals: opts.locals ?? { user },
			platform: opts.platform,
			request: req(opts.body ?? { itemId: 'c1' })
		} as any);

	const itemRoute = (over: any = {}) => ({
		match: 'FROM content_items',
		first: {
			id: 'c1',
			brand_id: 'br1',
			platform: 'devto',
			title: 'T',
			body: 'B',
			status: 'draft',
			...over
		}
	});
	const brandOK = { match: 'FROM brands', first: { id: 'br1', user_id: 'u1' } };
	const kv = (val: any) => ({ get: vi.fn().mockResolvedValue(val) });

	it('guards auth, body, item, ownership and already-published', async () => {
		await expect(call({ locals: { user: null }, platform: {} })).rejects.toMatchObject({
			status: 401
		});
		await expect(call({ platform: {}, body: {} })).rejects.toMatchObject({ status: 400 });
		await expect(
			call({
				platform: {
					env: { DB: makeDB([{ match: 'FROM content_items', first: null }]), KV: kv(null) }
				}
			})
		).rejects.toMatchObject({ status: 404 });
		await expect(
			call({
				platform: {
					env: {
						DB: makeDB([
							itemRoute(),
							{ match: 'FROM brands', first: { id: 'br1', user_id: 'other' } }
						]),
						KV: kv(null)
					}
				}
			})
		).rejects.toMatchObject({ status: 403 });
		await expect(
			call({
				platform: {
					env: { DB: makeDB([itemRoute({ status: 'published' }), brandOK]), KV: kv(null) }
				}
			})
		).rejects.toMatchObject({ status: 409 });
	});

	it('publishes a devto article', async () => {
		const db = makeDB([itemRoute(), brandOK]);
		const res = await call({ platform: { env: { DB: db, KV: kv('devto-key') } } });
		expect(await res.json()).toMatchObject({ success: true, status: 'published' });
	});

	it('publishes a linkedin post', async () => {
		const db = makeDB([itemRoute({ platform: 'linkedin' }), brandOK]);
		const res = await call({
			platform: {
				env: { DB: db, KV: kv(JSON.stringify({ access_token: 't', author_urn: 'urn' })) }
			}
		});
		expect((await res.json()).externalUrl).toBe('https://li/1');
	});

	it('502s and marks the item failed when the platform key is missing', async () => {
		const db = makeDB([itemRoute(), brandOK]);
		await expect(call({ platform: { env: { DB: db, KV: kv(null) } } })).rejects.toMatchObject({
			status: 502
		});
		expect(db._run).toHaveBeenCalled();
	});
});

describe('GET /api/cron/content', () => {
	let GET: any;
	beforeEach(async () => {
		GET = (await import('../../src/routes/api/cron/content/+server')).GET;
	});
	const headers = (auth: string) => ({ get: (k: string) => (k === 'Authorization' ? auth : null) });

	it('401s without the correct bearer token', async () => {
		await expect(
			GET({
				platform: { env: { CRON_SECRET: 's' } },
				request: { headers: headers('Bearer wrong') }
			} as any)
		).rejects.toMatchObject({ status: 401 });
		await expect(
			GET({ platform: { env: {} }, request: { headers: headers('') } } as any)
		).rejects.toMatchObject({ status: 401 });
	});

	it('503s without the AI binding', async () => {
		await expect(
			GET({
				platform: { env: { CRON_SECRET: 's', DB: makeDB([]) } },
				request: { headers: headers('Bearer s') }
			} as any)
		).rejects.toMatchObject({ status: 503 });
	});

	it('generates a calendar for auto-scheduled brands', async () => {
		const db = makeDB([{ match: 'FROM brands', all: { results: [brandRow] } }]);
		const res = await GET({
			platform: { env: { CRON_SECRET: 's', DB: db, AI: {} } },
			request: { headers: headers('Bearer s') }
		} as any);
		const data = await res.json();
		expect(data.ok).toBe(true);
		expect(data.brandsProcessed).toBe(1);
		expect(data.summary[0].generated).toBe(2);
	});

	it('counts a calendar-generation error as failed', async () => {
		const gen = await import('$lib/services/content-generator');
		vi.mocked(gen.generateContentCalendar).mockRejectedValueOnce(new Error('nope'));
		const db = makeDB([{ match: 'FROM brands', all: { results: [brandRow] } }]);
		const res = await GET({
			platform: { env: { CRON_SECRET: 's', DB: db, AI: {} } },
			request: { headers: headers('Bearer s') }
		} as any);
		expect((await res.json()).summary[0].failed).toBe(1);
	});
});
