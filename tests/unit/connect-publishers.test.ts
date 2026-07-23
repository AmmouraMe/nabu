/**
 * Coverage for the api/connect/* routes and the devto/linkedin publisher
 * services — all shipped at 0%.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const user = { id: 'u1' };

// D1 mock: prepare().bind().first()/run(); `firstResult` controls the
// "existing account?" lookup so we hit both INSERT and UPDATE branches.
function makeDB(firstResult: any = null) {
	const run = vi.fn().mockResolvedValue({ success: true });
	const first = vi.fn().mockResolvedValue(firstResult);
	const prepare = vi.fn((sql: string) => ({
		bind: vi.fn().mockReturnValue({ run, first }),
		_sql: sql
	}));
	return { prepare, _run: run, _first: first };
}
function makeKV() {
	return {
		put: vi.fn().mockResolvedValue(undefined),
		delete: vi.fn().mockResolvedValue(undefined)
	};
}
const req = (body: any) => ({ json: async () => body });

describe('api/connect/devto', () => {
	let mod: any;
	beforeEach(async () => {
		mod = await import('../../src/routes/api/connect/devto/+server');
		globalThis.fetch = vi.fn();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('POST 401 without a user', async () => {
		await expect(
			mod.POST({ locals: { user: null }, platform: {}, request: req({}) } as any)
		).rejects.toMatchObject({ status: 401 });
	});

	it('POST 400 without an apiKey', async () => {
		await expect(
			mod.POST({ locals: { user }, platform: {}, request: req({ apiKey: '  ' }) } as any)
		).rejects.toMatchObject({ status: 400 });
	});

	it('POST 400 when validation against Dev.to fails', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValue({
			ok: false,
			status: 401,
			text: async () => 'nope'
		} as any);
		await expect(
			mod.POST({ locals: { user }, platform: {}, request: req({ apiKey: 'k' }) } as any)
		).rejects.toMatchObject({ status: 400 });
	});

	it('POST inserts a publishing account on first connect', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValue({ ok: true, json: async () => [] } as any);
		const db = makeDB(null);
		const kv = makeKV();
		const res = await mod.POST({
			locals: { user },
			platform: { env: { KV: kv, DB: db } },
			request: req({ apiKey: 'k' })
		} as any);
		expect(await res.json()).toEqual({ success: true });
		expect(kv.put).toHaveBeenCalledWith('devto:apikey:u1', 'k');
		expect(
			db.prepare.mock.calls.some((c: any[]) => c[0].includes('INSERT INTO publishing_accounts'))
		).toBe(true);
	});

	it('POST updates an existing publishing account', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValue({ ok: true, json: async () => [] } as any);
		const db = makeDB({ id: 'pa1' });
		const res = await mod.POST({
			locals: { user },
			platform: { env: { KV: makeKV(), DB: db } },
			request: req({ apiKey: 'k' })
		} as any);
		expect(await res.json()).toEqual({ success: true });
		expect(
			db.prepare.mock.calls.some((c: any[]) => c[0].includes('UPDATE publishing_accounts'))
		).toBe(true);
	});

	it('DELETE removes the key and account', async () => {
		const db = makeDB();
		const kv = makeKV();
		const res = await mod.DELETE({
			locals: { user },
			platform: { env: { KV: kv, DB: db } }
		} as any);
		expect(await res.json()).toEqual({ success: true });
		expect(kv.delete).toHaveBeenCalledWith('devto:apikey:u1');
	});

	it('DELETE 401 without a user', async () => {
		await expect(mod.DELETE({ locals: { user: null }, platform: {} } as any)).rejects.toMatchObject(
			{ status: 401 }
		);
	});
});

describe('api/connect/linkedin', () => {
	let mod: any;
	beforeEach(async () => {
		mod = await import('../../src/routes/api/connect/linkedin/+server');
	});

	it('POST 401 / 400 validation', async () => {
		await expect(
			mod.POST({ locals: { user: null }, platform: {}, request: req({}) } as any)
		).rejects.toMatchObject({ status: 401 });
		await expect(
			mod.POST({
				locals: { user },
				platform: {},
				request: req({ accessToken: '', authorUrn: 'urn' })
			} as any)
		).rejects.toMatchObject({ status: 400 });
		await expect(
			mod.POST({
				locals: { user },
				platform: {},
				request: req({ accessToken: 't', authorUrn: '' })
			} as any)
		).rejects.toMatchObject({ status: 400 });
	});

	it('POST inserts then updates', async () => {
		const kv = makeKV();
		const insDb = makeDB(null);
		await mod.POST({
			locals: { user },
			platform: { env: { KV: kv, DB: insDb } },
			request: req({ accessToken: 't', authorUrn: 'urn:li:person:1' })
		} as any);
		expect(kv.put).toHaveBeenCalled();
		expect(
			insDb.prepare.mock.calls.some((c: any[]) => c[0].includes('INSERT INTO publishing_accounts'))
		).toBe(true);

		const updDb = makeDB({ id: 'pa1' });
		await mod.POST({
			locals: { user },
			platform: { env: { KV: makeKV(), DB: updDb } },
			request: req({ accessToken: 't', authorUrn: 'urn' })
		} as any);
		expect(
			updDb.prepare.mock.calls.some((c: any[]) => c[0].includes('UPDATE publishing_accounts'))
		).toBe(true);
	});

	it('DELETE removes token + 401 guard', async () => {
		const kv = makeKV();
		const res = await mod.DELETE({
			locals: { user },
			platform: { env: { KV: kv, DB: makeDB() } }
		} as any);
		expect(await res.json()).toEqual({ success: true });
		expect(kv.delete).toHaveBeenCalledWith('linkedin:token:u1');
		await expect(mod.DELETE({ locals: { user: null }, platform: {} } as any)).rejects.toMatchObject(
			{ status: 401 }
		);
	});
});

describe('api/connect/google', () => {
	let mod: any;
	beforeEach(async () => {
		mod = await import('../../src/routes/api/connect/google/+server');
	});

	it('POST guards and upserts', async () => {
		await expect(
			mod.POST({ locals: { user: null }, platform: {}, request: req({}) } as any)
		).rejects.toMatchObject({ status: 401 });
		await expect(
			mod.POST({ locals: { user }, platform: {}, request: req({ apiKey: '' }) } as any)
		).rejects.toMatchObject({ status: 400 });

		const kv = makeKV();
		const db = makeDB();
		const res = await mod.POST({
			locals: { user },
			platform: { env: { KV: kv, DB: db } },
			request: req({ apiKey: 'gk' })
		} as any);
		expect(await res.json()).toEqual({ connected: true });
		expect(kv.put).toHaveBeenCalledWith('google:apikey:u1', 'gk');
		expect(db.prepare.mock.calls.some((c: any[]) => c[0].includes('ON CONFLICT'))).toBe(true);
	});

	it('DELETE removes key + 401 guard', async () => {
		const kv = makeKV();
		const res = await mod.DELETE({
			locals: { user },
			platform: { env: { KV: kv, DB: makeDB() } }
		} as any);
		expect(await res.json()).toEqual({ connected: false });
		expect(kv.delete).toHaveBeenCalledWith('google:apikey:u1');
		await expect(mod.DELETE({ locals: { user: null }, platform: {} } as any)).rejects.toMatchObject(
			{ status: 401 }
		);
	});
});

describe('publishers/devto service', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('devtoKvKey builds the namespaced key', async () => {
		const { devtoKvKey } = await import('../../src/lib/services/publishers/devto');
		expect(devtoKvKey('u9')).toBe('devto:apikey:u9');
	});

	it('publishArticle posts and maps the result', async () => {
		const { publishArticle } = await import('../../src/lib/services/publishers/devto');
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ id: 7, url: 'https://dev.to/a/7', published: true })
		}) as any;
		const r = await publishArticle('k', { title: 'T', body: 'B', tags: ['x'], published: true });
		expect(r).toEqual({ id: 7, url: 'https://dev.to/a/7', published: true });
	});

	it('publishArticle throws on API error', async () => {
		const { publishArticle } = await import('../../src/lib/services/publishers/devto');
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue({ ok: false, status: 422, text: async () => 'bad' }) as any;
		await expect(publishArticle('k', { title: 'T', body: 'B' })).rejects.toThrow('422');
	});

	it('getArticles returns the list and throws on error', async () => {
		const { getArticles } = await import('../../src/lib/services/publishers/devto');
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue({ ok: true, json: async () => [{ id: 1 }] }) as any;
		expect(await getArticles('k')).toHaveLength(1);
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue({ ok: false, status: 401, text: async () => 'no' }) as any;
		await expect(getArticles('k')).rejects.toThrow('401');
	});
});

describe('publishers/linkedin service', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('linkedInKvKey builds the namespaced key', async () => {
		const { linkedInKvKey } = await import('../../src/lib/services/publishers/linkedin');
		expect(linkedInKvKey('u9')).toBe('linkedin:token:u9');
	});

	it('sharePost posts and builds the share URL', async () => {
		const { sharePost } = await import('../../src/lib/services/publishers/linkedin');
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue({ ok: true, json: async () => ({ id: 'urn:li:share:99' }) }) as any;
		const r = await sharePost('tok', { text: 'hi', authorUrn: 'urn:li:person:1' });
		expect(r.id).toBe('urn:li:share:99');
		expect(r.shareUrl).toContain(encodeURIComponent('urn:li:share:99'));
	});

	it('sharePost throws on API error', async () => {
		const { sharePost } = await import('../../src/lib/services/publishers/linkedin');
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue({ ok: false, status: 403, text: async () => 'forbidden' }) as any;
		await expect(sharePost('tok', { text: 'hi', authorUrn: 'urn' })).rejects.toThrow('403');
	});
});
