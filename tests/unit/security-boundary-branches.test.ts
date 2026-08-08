import { describe, expect, it, vi } from 'vitest';
import {
	getAuthProviderCredentials,
	isAuthProvider
} from '../../src/lib/server/auth-provider-config';
import { externalOrigin, isSecureRequest } from '../../src/lib/server/origin';
import {
	addAuditLog,
	getAllBrandsForAdmin,
	getBrandAccess,
	getBrandAuditLog,
	revokeBrandAccess,
	updateBrandAccess
} from '../../src/lib/services/brand-admin';
import { createOAuthDb } from '../fixtures/oauth';

describe('external OAuth origin', () => {
	it.each([
		['http://localhost:4239/path', 'http://localhost:4239', false],
		['http://127.0.0.1:4239/path', 'http://127.0.0.1:4239', false],
		['http://nabu.example/path', 'https://nabu.example', true],
		['https://nabu.example/path', 'https://nabu.example', true]
	] as const)('normalizes %s', (input, origin, secure) => {
		const url = new URL(input);
		expect(externalOrigin(url)).toBe(origin);
		expect(isSecureRequest(url)).toBe(secure);
	});
});

describe('OAuth provider configuration', () => {
	it.each([
		['github', true],
		['discord', true],
		['gitlab', false],
		[null, false]
	] as const)('validates provider value %s', (value, expected) => {
		expect(isAuthProvider(value)).toBe(expected);
	});

	it('prefers complete environment credentials without reading KV', async () => {
		const KV = { get: vi.fn() };
		await expect(
			getAuthProviderCredentials(
				{
					env: {
						KV,
						GITHUB_CLIENT_ID: 'env-id',
						GITHUB_CLIENT_SECRET: 'env-secret'
					}
				} as any,
				'github'
			)
		).resolves.toEqual({ clientId: 'env-id', clientSecret: 'env-secret' });
		expect(KV.get).not.toHaveBeenCalled();
	});

	it('fills only missing Discord credentials from KV', async () => {
		const KV = {
			get: vi
				.fn()
				.mockResolvedValue(JSON.stringify({ clientId: 'stored-id', clientSecret: 'stored-secret' }))
		};
		await expect(
			getAuthProviderCredentials({ env: { KV, DISCORD_CLIENT_ID: 'env-id' } } as any, 'discord')
		).resolves.toEqual({ clientId: 'env-id', clientSecret: 'stored-secret' });
	});

	it.each([null, 'not-json'])('fails closed for unusable stored credentials', async (stored) => {
		const KV = { get: vi.fn().mockResolvedValue(stored) };
		await expect(getAuthProviderCredentials({ env: { KV } } as any, 'github')).resolves.toEqual({
			clientId: undefined,
			clientSecret: undefined
		});
	});

	it('fails closed when credential storage throws', async () => {
		const KV = { get: vi.fn().mockRejectedValue(new Error('KV unavailable')) };
		await expect(getAuthProviderCredentials({ env: { KV } } as any, 'discord')).resolves.toEqual({
			clientId: undefined,
			clientSecret: undefined
		});
	});
});

describe('brand admin fallback boundaries', () => {
	it('maps empty and populated brand/admin query results', async () => {
		const emptyDb = createOAuthDb((_query) => ({ all: { results: undefined } }));
		await expect(getAllBrandsForAdmin(emptyDb as any)).resolves.toEqual([]);
		await expect(getBrandAccess(emptyDb as any, 'brand-1')).resolves.toEqual([]);

		const db = createOAuthDb((query) => ({
			all: {
				results: query.includes('FROM brand_profiles')
					? [
							{
								id: 'brand-1',
								brand_name: 'Brand',
								owner_name: 'Owner',
								owner_login: 'owner',
								owner_email: 'owner@example.com',
								owner_avatar: null,
								status: 'active',
								collaborator_count: 2,
								created_at: 'created',
								updated_at: 'updated'
							}
						]
					: [
							{
								id: 'access-1',
								brand_profile_id: 'brand-1',
								user_id: 'user-1',
								granted_by: 'owner-1',
								role: 'viewer',
								created_at: 'created',
								updated_at: 'updated',
								user_name: null,
								user_email: 'user@example.com',
								user_avatar: null,
								user_login: null
							}
						]
			}
		}));
		await expect(getAllBrandsForAdmin(db as any)).resolves.toHaveLength(1);
		await expect(getBrandAccess(db as any, 'brand-1')).resolves.toHaveLength(1);
	});

	it('rejects updates and revocations for missing access records', async () => {
		const db = createOAuthDb();
		await expect(updateBrandAccess(db as any, 'missing', 'editor', 'owner')).rejects.toThrow(
			'Access record not found'
		);
		await expect(revokeBrandAccess(db as any, 'missing', 'owner')).rejects.toThrow(
			'Access record not found'
		);
	});

	it('stores optional audit fields as null or their supplied values', async () => {
		vi.stubGlobal('crypto', { randomUUID: () => 'audit-id' });
		const db = createOAuthDb();
		await addAuditLog(db as any, 'brand-1', 'user-1', 'created');
		await addAuditLog(
			db as any,
			'brand-1',
			'user-1',
			'updated',
			'asset',
			'asset-1',
			'{}',
			'203.0.113.1'
		);
		expect(db.calls[0]?.bindings.slice(4)).toEqual([null, null, null, null]);
		expect(db.calls[1]?.bindings.slice(4)).toEqual(['asset', 'asset-1', '{}', '203.0.113.1']);
	});

	it('handles empty and populated audit pages and count fallbacks', async () => {
		const emptyDb = createOAuthDb();
		emptyDb.batch.mockResolvedValueOnce([{ results: undefined }, { results: undefined }]);
		await expect(getBrandAuditLog(emptyDb as any, 'brand-1')).resolves.toEqual({
			entries: [],
			total: 0
		});

		const db = createOAuthDb();
		db.batch.mockResolvedValueOnce([
			{
				results: [
					{
						id: 'log-1',
						brand_profile_id: 'brand-1',
						user_id: 'user-1',
						action: 'updated',
						entity_type: null,
						entity_id: null,
						details: null,
						ip_address: null,
						created_at: 'created',
						user_name: null,
						user_login: null,
						user_avatar: null
					}
				]
			},
			{ results: [{ total: 1 }] }
		]);
		await expect(getBrandAuditLog(db as any, 'brand-1', 1, 2)).resolves.toMatchObject({
			total: 1,
			entries: [{ id: 'log-1' }]
		});
	});
});

describe('brand admin route boundaries', () => {
	it.each([
		[{}, 401],
		[{ user: { id: 'user-1', isOwner: false, isAdmin: false } }, 403]
	] as const)('enforces brand list authorization', async (locals, status) => {
		const { GET } = await import('../../src/routes/api/admin/brands/+server');
		await expect(GET({ locals, platform: {} } as any)).rejects.toMatchObject({ status });
	});

	it('fails brand listing closed without a database or after query failure', async () => {
		const { GET } = await import('../../src/routes/api/admin/brands/+server');
		const locals = { user: { id: 'owner', isOwner: true } };
		await expect(GET({ locals, platform: {} } as any)).rejects.toMatchObject({ status: 500 });
		const db = createOAuthDb(() => Promise.reject(new Error('DB unavailable')));
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(GET({ locals, platform: { env: { DB: db } } } as any)).rejects.toMatchObject({
			status: 500
		});
		expect(consoleSpy).toHaveBeenCalled();
		consoleSpy.mockRestore();
	});

	it.each([
		[{}, 401],
		[{ user: { id: 'user-1', isOwner: false, isAdmin: false } }, 403]
	] as const)('enforces audit-log authorization', async (locals, status) => {
		const { GET } = await import('../../src/routes/api/admin/brands/[id]/logs/+server');
		await expect(
			GET({
				locals,
				platform: {},
				params: { id: 'brand-1' },
				url: new URL('http://localhost/logs')
			} as any)
		).rejects.toMatchObject({ status });
	});

	it('clamps audit pagination and returns query results', async () => {
		const db = createOAuthDb();
		db.batch.mockResolvedValueOnce([{ results: [] }, { results: [{ total: 0 }] }]);
		const { GET } = await import('../../src/routes/api/admin/brands/[id]/logs/+server');
		const response = await GET({
			locals: { user: { id: 'admin', isAdmin: true } },
			platform: { env: { DB: db } },
			params: { id: 'brand-1' },
			url: new URL('http://localhost/logs?limit=500&offset=-10')
		} as any);
		expect(await response.json()).toEqual({ entries: [], total: 0 });
		expect(db.prepare.mock.calls.some(([query]) => query.includes('LIMIT ? OFFSET ?'))).toBe(true);
	});

	it('fails audit listing closed without a database or after query failure', async () => {
		const { GET } = await import('../../src/routes/api/admin/brands/[id]/logs/+server');
		const base = {
			locals: { user: { id: 'owner', isOwner: true } },
			params: { id: 'brand-1' },
			url: new URL('http://localhost/logs')
		};
		await expect(GET({ ...base, platform: {} } as any)).rejects.toMatchObject({ status: 500 });
		const db = createOAuthDb();
		db.batch.mockRejectedValueOnce(new Error('DB unavailable'));
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(GET({ ...base, platform: { env: { DB: db } } } as any)).rejects.toMatchObject({
			status: 500
		});
		expect(consoleSpy).toHaveBeenCalled();
		consoleSpy.mockRestore();
	});
});

describe('admin page loader fallbacks', () => {
	it.each([
		['../../src/routes/admin/brands/+page.server', 'brands'],
		['../../src/routes/admin/core-principle-questions/+page.server', 'questions']
	] as const)(
		'handles successful, empty, failed, and rejected responses for %s',
		async (path, key) => {
			const module = path.includes('core-principle')
				? await import('../../src/routes/admin/core-principle-questions/+page.server')
				: await import('../../src/routes/admin/brands/+page.server');
			const fetch = vi
				.fn()
				.mockResolvedValueOnce({ ok: true, json: async () => ({ [key]: ['value'] }) })
				.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
				.mockResolvedValueOnce({ ok: false })
				.mockRejectedValueOnce(new Error('network'));
			await expect(module.load({ fetch } as any)).resolves.toEqual({ [key]: ['value'] });
			await expect(module.load({ fetch } as any)).resolves.toEqual({ [key]: [] });
			await expect(module.load({ fetch } as any)).resolves.toEqual({ [key]: [] });
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			await expect(module.load({ fetch } as any)).resolves.toEqual({ [key]: [] });
			expect(consoleSpy).toHaveBeenCalled();
			consoleSpy.mockRestore();
		}
	);
});
