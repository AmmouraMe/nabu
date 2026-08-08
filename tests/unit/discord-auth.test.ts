import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirect = vi.fn((status: number, location: string) => {
	throw Object.assign(new Error('Redirect'), { status, location });
});
const createOAuthTransaction = vi.fn();
const verifyOAuthTransaction = vi.fn();
const consumeOAuthTransaction = vi.fn();
const reconcileOAuthAccount = vi.fn();
const finalizeOAuthLogin = vi.fn();

vi.mock('@sveltejs/kit', () => ({
	error: (status: number, message: string) => {
		throw Object.assign(new Error(message), { status });
	},
	redirect,
	isRedirect: (value: unknown) => value instanceof Error && 'location' in value
}));

vi.mock('$lib/server/oauth-state', () => ({
	createOAuthTransaction,
	verifyOAuthTransaction,
	consumeOAuthTransaction,
	verifyOAuthState: vi.fn(),
	oauthStateCookieName: () => 'oauth_state_discord',
	oauthStateCookieOptions: () => ({ path: '/api/auth/discord/callback' })
}));

vi.mock('$lib/server/oauth-account', () => ({ reconcileOAuthAccount }));
vi.mock('$lib/server/oauth-finalization', () => ({ finalizeOAuthLogin }));

const DB = {};
const cookies = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };

describe('Discord OAuth', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		createOAuthTransaction.mockResolvedValue({ state: 'login:test-state', cookie: 'signed-state' });
		verifyOAuthTransaction.mockResolvedValue({
			provider: 'discord',
			state: 'login:test-state',
			intent: 'login',
			issuedAt: Date.now()
		});
		consumeOAuthTransaction.mockResolvedValue({
			provider: 'discord',
			state: 'login:test-state',
			intent: 'login',
			issuedAt: Date.now()
		});
		reconcileOAuthAccount.mockResolvedValue({ userId: 'user-1', linkedProvider: false });
		finalizeOAuthLogin.mockResolvedValue(
			new Response(null, { status: 302, headers: { Location: 'http://localhost/' } })
		);
		vi.stubGlobal('fetch', vi.fn());
	});

	it('redirects to setup when Discord OAuth is not configured', async () => {
		const { GET } = await import('../../src/routes/api/auth/discord/+server');
		await expect(
			GET({
				url: new URL('http://localhost/api/auth/discord'),
				platform: { env: { DB, KV: { get: vi.fn().mockResolvedValue(null) } } },
				cookies,
				locals: {}
			} as any)
		).rejects.toMatchObject({ status: 302, location: '/setup?error=oauth_not_configured' });
	});

	it('persists login state and redirects to Discord', async () => {
		const { GET } = await import('../../src/routes/api/auth/discord/+server');
		await expect(
			GET({
				url: new URL('http://localhost/api/auth/discord'),
				platform: { env: { DB, DISCORD_CLIENT_ID: 'client-id' } },
				cookies,
				locals: {}
			} as any)
		).rejects.toMatchObject({ status: 302 });
		expect(createOAuthTransaction).toHaveBeenCalledWith(
			DB,
			'discord',
			'login',
			undefined,
			undefined,
			undefined
		);
		expect(cookies.set).toHaveBeenCalledWith(
			'oauth_state_discord',
			'signed-state',
			expect.any(Object)
		);
		expect(redirect.mock.calls.at(-1)?.[1]).toContain('state=login%3Atest-state');
	});

	it('rejects link mode without an authenticated user', async () => {
		const { GET } = await import('../../src/routes/api/auth/discord/+server');
		await expect(
			GET({
				url: new URL('http://localhost/api/auth/discord?mode=link'),
				platform: { env: { DB, DISCORD_CLIENT_ID: 'client-id' } },
				cookies,
				locals: {}
			} as any)
		).rejects.toMatchObject({
			status: 302,
			location: '/auth/login?error=authentication_required'
		});
	});

	it('rejects callback requests without a code', async () => {
		const { GET } = await import('../../src/routes/api/auth/discord/callback/+server');
		await expect(
			GET({
				url: new URL('http://localhost/api/auth/discord/callback'),
				platform: { env: { DB } },
				cookies,
				locals: {}
			} as any)
		).rejects.toMatchObject({ status: 302, location: '/auth/login?error=no_code' });
	});

	it('rejects callbacks without a valid persisted state transaction', async () => {
		verifyOAuthTransaction.mockResolvedValueOnce(null);
		const { GET } = await import('../../src/routes/api/auth/discord/callback/+server');
		await expect(
			GET({
				url: new URL('http://localhost/api/auth/discord/callback?code=code&state=bad'),
				platform: { env: { DB } },
				cookies,
				locals: {}
			} as any)
		).rejects.toMatchObject({ status: 302, location: '/auth/login?error=invalid_state' });
	});

	it('reports token exchange failures after state validation', async () => {
		vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);
		const { GET } = await import('../../src/routes/api/auth/discord/callback/+server');
		await expect(
			GET({
				url: new URL('http://localhost/api/auth/discord/callback?code=code&state=login:test-state'),
				platform: {
					env: { DB, DISCORD_CLIENT_ID: 'client-id', DISCORD_CLIENT_SECRET: 'secret' }
				},
				cookies,
				locals: {}
			} as any)
		).rejects.toMatchObject({
			status: 302,
			location: '/auth/login?error=token_exchange_failed'
		});
	});

	it('reconciles the provider account and finalizes a successful login', async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: vi.fn().mockResolvedValue({ access_token: 'access-token' })
			} as any)
			.mockResolvedValueOnce({
				ok: true,
				json: vi.fn().mockResolvedValue({
					id: 'discord-1',
					username: 'tester',
					email: 'tester@example.com'
				})
			} as any);
		const { GET } = await import('../../src/routes/api/auth/discord/callback/+server');
		const response = await GET({
			url: new URL('http://localhost/api/auth/discord/callback?code=code&state=login:test-state'),
			platform: {
				env: { DB, DISCORD_CLIENT_ID: 'client-id', DISCORD_CLIENT_SECRET: 'secret' }
			},
			cookies,
			locals: {}
		} as any);
		expect(response.status).toBe(302);
		expect(consumeOAuthTransaction).toHaveBeenCalled();
		expect(reconcileOAuthAccount).toHaveBeenCalledWith(
			expect.objectContaining({ provider: 'discord', providerAccountId: 'discord-1' })
		);
		expect(finalizeOAuthLogin).toHaveBeenCalledWith(
			expect.objectContaining({ db: DB, userId: 'user-1' })
		);
	});
});
