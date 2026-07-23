/**
 * Coverage for lib/server/gcp-provision.ts — the Worker-safe Google Cloud
 * provisioning REST client (shipped at 0%). All HTTP is mocked.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	getGcpConfig,
	getStoredTokens,
	storeTokens,
	exchangeCode,
	getAccessToken,
	listProjects,
	provisionApiKey,
	GcpError,
	KV_GCP_CONFIG,
	KV_GCP_TOKENS
} from '../../src/lib/server/gcp-provision';

// Response shaped for both callers: exchangeCode/getAccessToken use res.json();
// gapi() uses res.text() then JSON.parse.
function resp(status: number, body: unknown) {
	const text = typeof body === 'string' ? body : JSON.stringify(body ?? {});
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => (typeof body === 'string' ? {} : (body ?? {})),
		text: async () => text
	};
}

const config = { clientId: 'cid', clientSecret: 'sec' };

afterEach(() => {
	vi.restoreAllMocks();
});

describe('getGcpConfig', () => {
	it('prefers env vars', async () => {
		const cfg = await getGcpConfig({ env: { GCP_CLIENT_ID: 'e', GCP_CLIENT_SECRET: 's' } } as any);
		expect(cfg).toEqual({ clientId: 'e', clientSecret: 's' });
	});

	it('falls back to KV', async () => {
		const kv = { get: vi.fn().mockResolvedValue(JSON.stringify(config)) };
		const cfg = await getGcpConfig({ env: { KV: kv } } as any);
		expect(cfg).toEqual(config);
		expect(kv.get).toHaveBeenCalledWith(KV_GCP_CONFIG);
	});

	it('returns null without KV, on empty KV, on bad JSON, and on missing fields', async () => {
		expect(await getGcpConfig({ env: {} } as any)).toBeNull();
		expect(await getGcpConfig(undefined)).toBeNull();
		expect(
			await getGcpConfig({ env: { KV: { get: vi.fn().mockResolvedValue(null) } } } as any)
		).toBeNull();
		expect(
			await getGcpConfig({ env: { KV: { get: vi.fn().mockResolvedValue('{bad') } } } as any)
		).toBeNull();
		expect(
			await getGcpConfig({
				env: { KV: { get: vi.fn().mockResolvedValue('{"clientId":"x"}') } }
			} as any)
		).toBeNull();
	});
});

describe('token storage', () => {
	it('getStoredTokens: null without KV, parses stored, tolerates bad JSON', async () => {
		expect(await getStoredTokens({ env: {} } as any)).toBeNull();
		const good = {
			get: vi.fn().mockResolvedValue(JSON.stringify({ refreshToken: 'r', obtainedAt: 'now' }))
		};
		expect(await getStoredTokens({ env: { KV: good } } as any)).toMatchObject({
			refreshToken: 'r'
		});
		const bad = { get: vi.fn().mockResolvedValue('{bad') };
		expect(await getStoredTokens({ env: { KV: bad } } as any)).toBeNull();
	});

	it('storeTokens: throws without KV, otherwise puts', async () => {
		await expect(
			storeTokens({ env: {} } as any, { refreshToken: 'r', obtainedAt: 'n' })
		).rejects.toBeInstanceOf(GcpError);
		const kv = { put: vi.fn().mockResolvedValue(undefined) };
		await storeTokens({ env: { KV: kv } } as any, { refreshToken: 'r', obtainedAt: 'n' });
		expect(kv.put).toHaveBeenCalledWith(KV_GCP_TOKENS, expect.any(String));
	});
});

describe('exchangeCode / getAccessToken', () => {
	it('exchangeCode returns tokens on success', async () => {
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue(resp(200, { access_token: 'a', refresh_token: 'r' })) as any;
		expect(await exchangeCode(config, 'code', 'uri')).toEqual({
			accessToken: 'a',
			refreshToken: 'r'
		});
	});

	it('exchangeCode throws on error', async () => {
		globalThis.fetch = vi.fn().mockResolvedValue(resp(400, { error: 'invalid_grant' })) as any;
		await expect(exchangeCode(config, 'code', 'uri')).rejects.toBeInstanceOf(GcpError);
	});

	it('getAccessToken returns a token on success and throws on failure', async () => {
		globalThis.fetch = vi.fn().mockResolvedValue(resp(200, { access_token: 'at' })) as any;
		expect(await getAccessToken(config, 'refresh')).toBe('at');
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue(resp(401, { error_description: 'expired' })) as any;
		await expect(getAccessToken(config, 'refresh')).rejects.toBeInstanceOf(GcpError);
	});
});

describe('listProjects', () => {
	it('keeps ACTIVE projects, annotates billing, and sorts billed-first', async () => {
		globalThis.fetch = vi.fn((url: string) => {
			if (url.includes('cloudresourcemanager')) {
				return Promise.resolve(
					resp(200, {
						projects: [
							{ projectId: 'zzz', name: 'Z', lifecycleState: 'ACTIVE' },
							{ projectId: 'aaa', name: 'A', lifecycleState: 'ACTIVE' },
							{ projectId: 'gone', name: 'G', lifecycleState: 'DELETE_REQUESTED' }
						]
					})
				);
			}
			if (url.includes('/aaa/billingInfo'))
				return Promise.resolve(resp(200, { billingEnabled: true }));
			// zzz billing lookup fails — must not hide the project
			return Promise.resolve(resp(403, { error: { message: 'no perm' } }));
		}) as any;

		const projects = await listProjects('at');
		expect(projects.map((p) => p.projectId)).toEqual(['aaa', 'zzz']); // billed first
		expect(projects.find((p) => p.projectId === 'aaa')!.billingEnabled).toBe(true);
		expect(projects.find((p) => p.projectId === 'zzz')!.billingEnabled).toBe(false);
	});
});

describe('provisionApiKey', () => {
	// Router covering the whole provisioning flow.
	function router(opts: { saStatus: number; existingKeys?: any[]; opDone?: any }) {
		return (url: string, init: any = {}) => {
			const method = init.method || 'GET';
			if (url.includes(':enable')) return Promise.resolve(resp(200, {}));
			if (url.includes('/serviceAccounts/'))
				return Promise.resolve(
					resp(opts.saStatus, opts.saStatus === 200 ? {} : { error: { message: 'not found' } })
				);
			if (url.includes('/serviceAccounts') && method === 'POST')
				return Promise.resolve(resp(200, {}));
			if (url.endsWith('/keys') && method === 'GET')
				return Promise.resolve(resp(200, { keys: opts.existingKeys ?? [] }));
			if (url.endsWith('/keys') && method === 'POST')
				return Promise.resolve(resp(200, { name: 'operations/op1' }));
			if (url.includes('/operations/op1'))
				return Promise.resolve(
					resp(200, opts.opDone ?? { done: true, response: { name: 'projects/p/keys/k1' } })
				);
			if (url.includes('/keyString'))
				return Promise.resolve(resp(200, { keyString: 'AIzaSECRET' }));
			return Promise.resolve(resp(404, { error: { message: 'unrouted ' + url } }));
		};
	}

	it('creates a new key when the service account is missing and none exists', async () => {
		globalThis.fetch = vi.fn(router({ saStatus: 404 })) as any;
		const r = await provisionApiKey('p', 'at');
		expect(r).toMatchObject({ keyString: 'AIzaSECRET', reused: false, projectId: 'p' });
	});

	it('reuses an existing key with the same display name', async () => {
		globalThis.fetch = vi.fn(
			router({
				saStatus: 200,
				existingKeys: [{ name: 'projects/p/keys/k9', displayName: 'nabu-admin-provisioned' }]
			})
		) as any;
		const r = await provisionApiKey('p', 'at');
		expect(r).toMatchObject({ keyName: 'projects/p/keys/k9', reused: true });
	});

	it('throws when the create operation reports an error', async () => {
		globalThis.fetch = vi.fn(
			router({ saStatus: 200, opDone: { done: true, error: { message: 'quota' } } })
		) as any;
		await expect(provisionApiKey('p', 'at')).rejects.toThrow('quota');
	});

	it('throws when Google returns an empty key string', async () => {
		globalThis.fetch = vi.fn((url: string, init: any = {}) => {
			const base = router({ saStatus: 200 });
			if (url.includes('/keyString')) return Promise.resolve(resp(200, { keyString: '' }));
			return base(url, init);
		}) as any;
		await expect(provisionApiKey('p', 'at')).rejects.toThrow('empty key string');
	});

	it('surfaces a non-400 error from enableServices', async () => {
		globalThis.fetch = vi.fn((url: string) => {
			if (url.includes(':enable'))
				return Promise.resolve(resp(500, { error: { message: 'server' } }));
			return Promise.resolve(resp(200, {}));
		}) as any;
		await expect(provisionApiKey('p', 'at')).rejects.toBeInstanceOf(GcpError);
	});

	it('continues when a service is already enabled (400)', async () => {
		globalThis.fetch = vi.fn((url: string, init: any = {}) => {
			if (url.includes(':enable'))
				return Promise.resolve(resp(400, { error: { message: 'already enabled' } }));
			return router({
				saStatus: 200,
				existingKeys: [{ name: 'projects/p/keys/k9', displayName: 'nabu-admin-provisioned' }]
			})(url, init);
		}) as any;
		const r = await provisionApiKey('p', 'at');
		expect(r.reused).toBe(true);
	});
});
