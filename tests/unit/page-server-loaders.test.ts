/**
 * Coverage for the brand/[id] and admin/brands/[id] +page.server.ts loaders.
 * These were shipped at 0% coverage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// A D1 mock whose prepare() routes .first()/.all()/.run() by SQL substring.
// routes: [{ match: 'FROM brand_profiles', first: {...} }, ...]
function makeDB(routes: Array<{ match: string; first?: any; all?: any; run?: any }>) {
	const run = vi.fn();
	const prepare = vi.fn((sql: string) => {
		const route: { match?: string; first?: any; all?: any; run?: any } =
			routes.find((r) => sql.includes(r.match)) || {};
		const bound = {
			first: vi.fn().mockResolvedValue(route.first ?? null),
			all: vi.fn().mockResolvedValue(route.all ?? { results: [] }),
			run: vi.fn().mockResolvedValue(route.run ?? { success: true })
		};
		run(sql);
		return { bind: vi.fn().mockReturnValue(bound), ...bound };
	});
	return { prepare, _sql: run };
}

const user = { id: 'u1' };

describe('brand/[id]/content/+page.server load', () => {
	let load: any;
	beforeEach(async () => {
		load = (await import('../../src/routes/brand/[id]/content/+page.server')).load;
	});

	it('redirects unauthenticated users', async () => {
		await expect(
			load({ platform: {}, locals: { user: null }, params: { id: 'bp1' } } as any)
		).rejects.toMatchObject({ status: 302 });
	});

	it('404s when the profile is not found', async () => {
		const db = makeDB([{ match: 'FROM brand_profiles', first: null }]);
		await expect(
			load({ platform: { env: { DB: db } }, locals: { user }, params: { id: 'bp1' } } as any)
		).rejects.toMatchObject({ status: 404 });
	});

	it('returns an existing content brand without inserting', async () => {
		const db = makeDB([
			{ match: 'FROM brand_profiles', first: { id: 'bp1', brand_name: 'Acme' } },
			{ match: 'FROM brands', first: { id: 'br1', name: 'Acme', auto_schedule: 1 } }
		]);
		const res = await load({
			platform: { env: { DB: db } },
			locals: { user },
			params: { id: 'bp1' }
		} as any);
		expect(res).toMatchObject({ brandId: 'br1', brandName: 'Acme', autoSchedule: true });
		// No INSERT issued
		expect(
			[...db._sql.mock.calls.flat()].some((s: string) => s.includes('INSERT INTO brands'))
		).toBe(false);
	});

	it('creates a content brand when none exists', async () => {
		const db = makeDB([
			{ match: 'FROM brand_profiles', first: { id: 'bp1', brand_name: null, tagline: 't' } },
			{ match: 'FROM brands', first: null }
		]);
		const res = await load({
			platform: { env: { DB: db } },
			locals: { user },
			params: { id: 'bp1' }
		} as any);
		expect(res.brandName).toBe('Untitled Brand');
		expect(res.autoSchedule).toBe(false);
		expect(
			[...db._sql.mock.calls.flat()].some((s: string) => s.includes('INSERT INTO brands'))
		).toBe(true);
	});
});

describe('brand/[id]/videos/+page.server load', () => {
	let load: any;
	beforeEach(async () => {
		load = (await import('../../src/routes/brand/[id]/videos/+page.server')).load;
	});

	it('redirects unauthenticated users', async () => {
		await expect(
			load({ platform: {}, locals: { user: null }, params: { id: 'bp1' } } as any)
		).rejects.toMatchObject({ status: 302 });
	});

	it('404s when the profile is not found', async () => {
		const db = makeDB([{ match: 'FROM brand_profiles', first: null }]);
		const kv = { get: vi.fn().mockResolvedValue(null) };
		await expect(
			load({
				platform: { env: { DB: db, KV: kv } },
				locals: { user },
				params: { id: 'bp1' }
			} as any)
		).rejects.toMatchObject({ status: 404 });
	});

	it('lists videos for an existing brand and reports google connection', async () => {
		const db = makeDB([
			{ match: 'FROM brand_profiles', first: { id: 'bp1', brand_name: 'Acme' } },
			{ match: 'FROM brands', first: { id: 'br1' } },
			{ match: 'FROM brand_content_items', all: { results: [{ id: 'v1', platform: 'youtube' }] } }
		]);
		const kv = { get: vi.fn().mockResolvedValue('token') };
		const res = await load({
			platform: { env: { DB: db, KV: kv } },
			locals: { user },
			params: { id: 'bp1' }
		} as any);
		expect(res.brandId).toBe('br1');
		expect(res.googleConnected).toBe(true);
		expect(res.videos).toHaveLength(1);
	});

	it('returns no videos and brandId null when there is no content brand', async () => {
		const db = makeDB([
			{ match: 'FROM brand_profiles', first: { id: 'bp1', brand_name: null } },
			{ match: 'FROM brands', first: null }
		]);
		const kv = { get: vi.fn().mockResolvedValue(null) };
		const res = await load({
			platform: { env: { DB: db, KV: kv } },
			locals: { user },
			params: { id: 'bp1' }
		} as any);
		expect(res.brandId).toBeNull();
		expect(res.googleConnected).toBe(false);
		expect(res.videos).toEqual([]);
		expect(res.brandName).toBe('Untitled Brand');
	});
});

describe('brand/[id]/connect/+page.server load', () => {
	let load: any;
	beforeEach(async () => {
		load = (await import('../../src/routes/brand/[id]/connect/+page.server')).load;
	});

	it('redirects unauthenticated users', async () => {
		await expect(
			load({ platform: {}, locals: { user: null }, params: { id: 'bp1' } } as any)
		).rejects.toMatchObject({ status: 302 });
	});

	it('404s when the profile is not found', async () => {
		const db = makeDB([{ match: 'FROM brand_profiles', first: null }]);
		const kv = { get: vi.fn().mockResolvedValue(null) };
		await expect(
			load({
				platform: { env: { DB: db, KV: kv } },
				locals: { user },
				params: { id: 'bp1' }
			} as any)
		).rejects.toMatchObject({ status: 404 });
	});

	it('reports per-provider connection state from KV', async () => {
		const db = makeDB([{ match: 'FROM brand_profiles', first: { id: 'bp1', brand_name: 'Acme' } }]);
		const kv = {
			get: vi.fn((key: string) => Promise.resolve(key.startsWith('devto') ? 'k' : null))
		};
		const res = await load({
			platform: { env: { DB: db, KV: kv } },
			locals: { user },
			params: { id: 'bp1' }
		} as any);
		expect(res).toMatchObject({
			devtoConnected: true,
			linkedinConnected: false,
			googleConnected: false,
			brandName: 'Acme'
		});
	});
});

describe('admin/brands/[id]/+page.server load', () => {
	let load: any;
	beforeEach(async () => {
		load = (await import('../../src/routes/admin/brands/[id]/+page.server')).load;
	});

	const ok = (body: any) => ({ ok: true, json: async () => body });

	it('assembles brand, access, logs and users from the APIs', async () => {
		const fetch = vi.fn((url: string) => {
			if (url === '/api/admin/brands') return Promise.resolve(ok({ brands: [{ id: 'b1' }] }));
			if (url.endsWith('/access')) return Promise.resolve(ok({ access: [{ userId: 'u2' }] }));
			if (url.includes('/logs')) return Promise.resolve(ok({ entries: [{ id: 'l1' }], total: 3 }));
			return Promise.resolve(ok({ users: [{ id: 'u1' }] }));
		});
		const res = await load({ fetch, params: { id: 'b1' } } as any);
		expect(res.brand).toEqual({ id: 'b1' });
		expect(res.access).toHaveLength(1);
		expect(res.logsTotal).toBe(3);
		expect(res.users).toHaveLength(1);
	});

	it('falls back to empty data when the APIs return non-ok', async () => {
		const fetch = vi.fn().mockResolvedValue({ ok: false });
		const res = await load({ fetch, params: { id: 'b1' } } as any);
		expect(res).toEqual({ brand: null, access: [], logs: [], logsTotal: 0, users: [] });
	});

	it('falls back to empty data when a fetch throws', async () => {
		const fetch = vi.fn().mockRejectedValue(new Error('network'));
		const res = await load({ fetch, params: { id: 'b1' } } as any);
		expect(res.brand).toBeNull();
		expect(res.users).toEqual([]);
	});
});
