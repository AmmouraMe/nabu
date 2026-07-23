/**
 * Coverage for the admin provisioning routes (all shipped at 0%):
 *   api/admin/provision/workers-ai and .../google{,/start,/callback}.
 * gcp-provision and the workers-ai deps are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/gcp-provision', () => {
	class GcpError extends Error {
		status?: number;
		constructor(m: string, s?: number) {
			super(m);
			this.status = s;
		}
	}
	return {
		GcpError,
		GCP_SCOPE: 'cloud-platform',
		getGcpConfig: vi.fn(),
		getStoredTokens: vi.fn(),
		getAccessToken: vi.fn(),
		listProjects: vi.fn(),
		provisionApiKey: vi.fn(),
		exchangeCode: vi.fn(),
		storeTokens: vi.fn()
	};
});
vi.mock('$lib/server/origin', () => ({
	externalOrigin: () => 'https://app.test',
	isSecureRequest: () => true
}));
vi.mock('$lib/services/ai-media-generation', () => ({
	WORKERS_AI_IMAGE_MODELS: [{ id: '@cf/flux' }],
	runWorkersAIImage: vi.fn()
}));
vi.mock('$lib/services/openai-chat', () => ({
	WORKERS_AI_TEXT_MODELS: ['@cf/llama']
}));

const admin = { user: { isAdmin: true } };
const notAdmin = { user: {} };

function kvWith(store: Record<string, string> = {}) {
	return {
		get: vi.fn((k: string) => Promise.resolve(store[k] ?? null)),
		put: vi.fn((k: string, v: string) => {
			store[k] = v;
			return Promise.resolve();
		}),
		_store: store
	};
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('provision/workers-ai', () => {
	let mod: any;
	beforeEach(async () => {
		mod = await import('../../src/routes/api/admin/provision/workers-ai/+server');
	});

	it('GET requires admin', async () => {
		await expect(mod.GET({ platform: {}, locals: notAdmin } as any)).rejects.toMatchObject({
			status: 403
		});
	});

	it('GET reports availability without KV', async () => {
		const res = await mod.GET({ platform: { env: { AI: {} } }, locals: admin } as any);
		expect(await res.json()).toMatchObject({ available: true, connected: false });
	});

	it('GET reports connected when a workers-ai key exists', async () => {
		const kv = kvWith({
			ai_keys_list: JSON.stringify(['k1']),
			'ai_key:k1': JSON.stringify({ id: 'k1', provider: 'workers-ai', enabled: true })
		});
		const res = await mod.GET({ platform: { env: { AI: {}, KV: kv } }, locals: admin } as any);
		expect(await res.json()).toMatchObject({ available: true, connected: true, enabled: true });
	});

	it('POST 400 without the AI binding, 500 without KV', async () => {
		await expect(
			mod.POST({ url: new URL('https://x/'), platform: { env: {} }, locals: admin } as any)
		).rejects.toMatchObject({ status: 400 });
		await expect(
			mod.POST({ url: new URL('https://x/'), platform: { env: { AI: {} } }, locals: admin } as any)
		).rejects.toMatchObject({ status: 500 });
	});

	it('POST ?test=1 returns ok on a successful probe and ok:false on failure', async () => {
		const media = await import('$lib/services/ai-media-generation');
		vi.mocked(media.runWorkersAIImage).mockResolvedValueOnce({ image: 'AAAA' } as any);
		const okRes = await mod.POST({
			url: new URL('https://x/?test=1'),
			platform: { env: { AI: {} } },
			locals: admin
		} as any);
		expect((await okRes.json()).ok).toBe(true);

		vi.mocked(media.runWorkersAIImage).mockRejectedValueOnce(new Error('nsfw'));
		const failRes = await mod.POST({
			url: new URL('https://x/?test=1'),
			platform: { env: { AI: {} } },
			locals: admin
		} as any);
		expect(await failRes.json()).toMatchObject({ ok: false, message: 'nsfw' });
	});

	it('POST connects fresh, then is idempotent', async () => {
		const kv = kvWith();
		const res = await mod.POST({
			url: new URL('https://x/'),
			platform: { env: { AI: {}, KV: kv } },
			locals: admin
		} as any);
		const body = await res.json();
		expect(body.success).toBe(true);
		expect(body.key.provider).toBe('workers-ai');
		// list now holds the new id
		expect(JSON.parse(kv._store['ai_keys_list'])).toHaveLength(1);

		// Second connect finds the existing record → alreadyConnected
		const res2 = await mod.POST({
			url: new URL('https://x/'),
			platform: { env: { AI: {}, KV: kv } },
			locals: admin
		} as any);
		expect((await res2.json()).alreadyConnected).toBe(true);
	});

	it('POST self-heals a legacy record whose models held image ids', async () => {
		const kv = kvWith({
			ai_keys_list: JSON.stringify(['k1']),
			'ai_key:k1': JSON.stringify({ id: 'k1', provider: 'workers-ai', models: ['@cf/flux'] })
		});
		const res = await mod.POST({
			url: new URL('https://x/'),
			platform: { env: { AI: {}, KV: kv } },
			locals: admin
		} as any);
		const body = await res.json();
		expect(body.upgraded).toBe(true);
		expect(body.key.models).toEqual(['@cf/llama']);
	});
});

describe('provision/google GET & POST', () => {
	let mod: any;
	let gcp: any;
	beforeEach(async () => {
		mod = await import('../../src/routes/api/admin/provision/google/+server');
		gcp = await import('$lib/server/gcp-provision');
	});

	it('GET requires admin', async () => {
		await expect(mod.GET({ platform: {}, locals: notAdmin } as any)).rejects.toMatchObject({
			status: 403
		});
	});

	it('GET reports not configured / not connected / connected / error', async () => {
		vi.mocked(gcp.getGcpConfig).mockResolvedValueOnce(null);
		expect(await (await mod.GET({ platform: {}, locals: admin } as any)).json()).toMatchObject({
			configured: false
		});

		vi.mocked(gcp.getGcpConfig).mockResolvedValue({ clientId: 'c', clientSecret: 's' });
		vi.mocked(gcp.getStoredTokens).mockResolvedValueOnce(null);
		expect(await (await mod.GET({ platform: {}, locals: admin } as any)).json()).toMatchObject({
			connected: false
		});

		vi.mocked(gcp.getStoredTokens).mockResolvedValue({ refreshToken: 'r', account: 'a@b.com' });
		vi.mocked(gcp.getAccessToken).mockResolvedValueOnce('at');
		vi.mocked(gcp.listProjects).mockResolvedValueOnce([
			{ projectId: 'p', name: 'P', billingEnabled: true }
		]);
		expect(await (await mod.GET({ platform: {}, locals: admin } as any)).json()).toMatchObject({
			connected: true,
			account: 'a@b.com'
		});

		vi.mocked(gcp.getAccessToken).mockRejectedValueOnce(new gcp.GcpError('boom'));
		expect(await (await mod.GET({ platform: {}, locals: admin } as any)).json()).toMatchObject({
			connected: false,
			error: 'boom'
		});
	});

	const post = (body: any, platform: any = { env: { KV: kvWith() } }) =>
		mod.POST({ request: { json: async () => body }, platform, locals: admin } as any);

	it('POST guards KV, projectId, config and tokens', async () => {
		await expect(
			mod.POST({ request: { json: async () => ({}) }, platform: { env: {} }, locals: admin } as any)
		).rejects.toMatchObject({ status: 500 });
		await expect(post({})).rejects.toMatchObject({ status: 400 });
		vi.mocked(gcp.getGcpConfig).mockResolvedValueOnce(null);
		await expect(post({ projectId: 'p' })).rejects.toMatchObject({ status: 400 });
		vi.mocked(gcp.getGcpConfig).mockResolvedValue({ clientId: 'c', clientSecret: 's' });
		vi.mocked(gcp.getStoredTokens).mockResolvedValueOnce(null);
		await expect(post({ projectId: 'p' })).rejects.toMatchObject({ status: 400 });
	});

	it('POST provisions a key and stores it', async () => {
		vi.mocked(gcp.getGcpConfig).mockResolvedValue({ clientId: 'c', clientSecret: 's' });
		vi.mocked(gcp.getStoredTokens).mockResolvedValue({ refreshToken: 'r' });
		vi.mocked(gcp.getAccessToken).mockResolvedValue('at');
		vi.mocked(gcp.provisionApiKey).mockResolvedValue({
			keyString: 'AIza',
			keyName: 'projects/p/keys/k',
			projectId: 'p',
			reused: false
		});
		const kv = kvWith();
		const res = await post({ projectId: 'p', name: 'MyKey', models: ['m'] }, { env: { KV: kv } });
		const body = await res.json();
		expect(body.success).toBe(true);
		expect(body.key.apiKey).toBeUndefined(); // secret stripped
		expect(JSON.parse(kv._store['ai_keys_list'])).toHaveLength(1);
	});

	it('POST maps GcpError (<500 → 400, ≥500 → 502) and generic → 500', async () => {
		vi.mocked(gcp.getGcpConfig).mockResolvedValue({ clientId: 'c', clientSecret: 's' });
		vi.mocked(gcp.getStoredTokens).mockResolvedValue({ refreshToken: 'r' });
		vi.mocked(gcp.getAccessToken).mockResolvedValue('at');

		vi.mocked(gcp.provisionApiKey).mockRejectedValueOnce(new gcp.GcpError('bad request', 400));
		await expect(post({ projectId: 'p' })).rejects.toMatchObject({ status: 400 });

		vi.mocked(gcp.provisionApiKey).mockRejectedValueOnce(new gcp.GcpError('upstream', 503));
		await expect(post({ projectId: 'p' })).rejects.toMatchObject({ status: 502 });

		vi.mocked(gcp.provisionApiKey).mockRejectedValueOnce(new Error('weird'));
		await expect(post({ projectId: 'p' })).rejects.toMatchObject({ status: 500 });
	});
});

describe('provision/google/start', () => {
	let GET: any;
	let gcp: any;
	beforeEach(async () => {
		GET = (await import('../../src/routes/api/admin/provision/google/start/+server')).GET;
		gcp = await import('$lib/server/gcp-provision');
	});
	const ctx = (over: any = {}) => ({
		url: new URL('https://app.test/api/admin/provision/google/start'),
		platform: {},
		locals: admin,
		cookies: { set: vi.fn(), get: vi.fn(), delete: vi.fn() },
		...over
	});

	it('requires admin', async () => {
		await expect(GET(ctx({ locals: notAdmin }))).rejects.toMatchObject({ status: 403 });
	});

	it('redirects to the error page when GCP is not configured', async () => {
		vi.mocked(gcp.getGcpConfig).mockResolvedValueOnce(null);
		await expect(GET(ctx())).rejects.toMatchObject({
			status: 302,
			location: '/admin/ai-keys?gcp_error=not_configured'
		});
	});

	it('sets a state cookie and redirects to Google consent', async () => {
		vi.mocked(gcp.getGcpConfig).mockResolvedValueOnce({ clientId: 'cid', clientSecret: 's' });
		const c = ctx();
		await expect(GET(c)).rejects.toMatchObject({ status: 302 });
		expect(c.cookies.set).toHaveBeenCalledWith(
			'gcp_oauth_state',
			expect.any(String),
			expect.any(Object)
		);
	});
});

describe('provision/google/callback', () => {
	let GET: any;
	let gcp: any;
	beforeEach(async () => {
		GET = (await import('../../src/routes/api/admin/provision/google/callback/+server')).GET;
		gcp = await import('$lib/server/gcp-provision');
	});
	const ctx = (search: string, cookieState = 'st', over: any = {}) => ({
		url: new URL(`https://app.test/cb${search}`),
		platform: {},
		locals: admin,
		cookies: { get: vi.fn().mockReturnValue(cookieState), delete: vi.fn() },
		...over
	});

	it('requires admin', async () => {
		await expect(GET(ctx('?code=c&state=st', 'st', { locals: notAdmin }))).rejects.toMatchObject({
			status: 403
		});
	});

	it('redirects on denial, missing code, and bad state', async () => {
		await expect(GET(ctx('?error=access_denied'))).rejects.toMatchObject({
			location: '/admin/ai-keys?gcp_error=denied'
		});
		await expect(GET(ctx('?state=st'))).rejects.toMatchObject({
			location: '/admin/ai-keys?gcp_error=no_code'
		});
		await expect(GET(ctx('?code=c&state=nope', 'st'))).rejects.toMatchObject({
			location: '/admin/ai-keys?gcp_error=bad_state'
		});
	});

	it('exchanges the code, records the account, stores tokens and redirects connected', async () => {
		vi.mocked(gcp.getGcpConfig).mockResolvedValue({ clientId: 'c', clientSecret: 's' });
		vi.mocked(gcp.exchangeCode).mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue({ ok: true, json: async () => ({ email: 'a@b.com' }) }) as any;
		await expect(GET(ctx('?code=c&state=st'))).rejects.toMatchObject({
			location: '/admin/ai-keys?gcp=connected'
		});
		expect(gcp.storeTokens).toHaveBeenCalledWith(
			{},
			expect.objectContaining({ refreshToken: 'rt', account: 'a@b.com' })
		);
	});

	it('redirects with no_refresh_token when Google omits the refresh token', async () => {
		vi.mocked(gcp.getGcpConfig).mockResolvedValue({ clientId: 'c', clientSecret: 's' });
		vi.mocked(gcp.exchangeCode).mockResolvedValue({ accessToken: 'at' });
		await expect(GET(ctx('?code=c&state=st'))).rejects.toMatchObject({
			location: '/admin/ai-keys?gcp_error=no_refresh_token'
		});
	});

	it('redirects with exchange_failed when the exchange throws', async () => {
		vi.mocked(gcp.getGcpConfig).mockResolvedValue({ clientId: 'c', clientSecret: 's' });
		vi.mocked(gcp.exchangeCode).mockRejectedValue(new Error('bad code'));
		await expect(GET(ctx('?code=c&state=st'))).rejects.toMatchObject({
			location: '/admin/ai-keys?gcp_error=exchange_failed'
		});
	});
});
