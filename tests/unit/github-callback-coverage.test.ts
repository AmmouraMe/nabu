import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOAuthCookies, createOAuthDb, oauthTransaction } from '../fixtures/oauth';

const verifyOAuthState = vi.fn();
const verifyOAuthTransaction = vi.fn();
const consumeOAuthTransaction = vi.fn();
const reconcileOAuthAccount = vi.fn();
const finalizeOAuthLogin = vi.fn();

vi.mock('$lib/server/oauth-state', () => ({
	verifyOAuthState,
	verifyOAuthTransaction,
	consumeOAuthTransaction
}));
vi.mock('$lib/server/oauth-account', () => ({ reconcileOAuthAccount }));
vi.mock('$lib/server/oauth-finalization', () => ({ finalizeOAuthLogin }));

describe('GitHub OAuth callback', () => {
	const DB = createOAuthDb();
	const platform = {
		env: {
			DB,
			GITHUB_CLIENT_ID: 'client-id',
			GITHUB_CLIENT_SECRET: 'client-secret',
			SESSION_SECRET: 'session-secret'
		}
	} as any;

	beforeEach(() => {
		vi.clearAllMocks();
		verifyOAuthTransaction.mockResolvedValue(oauthTransaction('github'));
		consumeOAuthTransaction.mockResolvedValue(oauthTransaction('github'));
		reconcileOAuthAccount.mockResolvedValue({ userId: 'user-1' });
		finalizeOAuthLogin.mockResolvedValue(new Response(null, { status: 302 }));
		vi.stubGlobal('fetch', vi.fn());
	});

	function event(query: string, overrides: Record<string, unknown> = {}) {
		return {
			url: new URL(`http://localhost/api/auth/github/callback?${query}`),
			cookies: createOAuthCookies(),
			platform,
			locals: {},
			...overrides
		};
	}

	it('rejects a missing authorization code', async () => {
		const { GET } = await import('../../src/routes/api/auth/github/callback/+server');
		await expect(GET(event('state=login:test-state') as any)).rejects.toMatchObject({
			status: 302,
			location: '/auth/login?error=no_code'
		});
	});

	it('rejects missing, expired, replayed, or unbound state before token exchange', async () => {
		verifyOAuthTransaction.mockResolvedValueOnce(null);
		const { GET } = await import('../../src/routes/api/auth/github/callback/+server');
		await expect(GET(event('code=code&state=bad') as any)).rejects.toMatchObject({
			status: 302,
			location: '/auth/login?error=invalid_state'
		});
		expect(fetch).not.toHaveBeenCalled();
	});

	it('fails closed when transaction storage is unavailable', async () => {
		verifyOAuthState.mockResolvedValueOnce(oauthTransaction('github'));
		const { GET } = await import('../../src/routes/api/auth/github/callback/+server');
		await expect(
			GET(event('code=code&state=login:test-state', { platform: { env: {} } }) as any)
		).rejects.toMatchObject({ status: 302, location: '/auth/login?error=oauth_failed' });
	});

	it.each([
		[{ ok: false }, '/auth/login?error=token_exchange_failed'],
		[{ ok: true, json: vi.fn().mockResolvedValue({}) }, '/auth/login?error=no_access_token']
	])('handles token response failures', async (tokenResponse, location) => {
		vi.mocked(fetch).mockResolvedValueOnce(tokenResponse as any);
		const { GET } = await import('../../src/routes/api/auth/github/callback/+server');
		await expect(GET(event('code=code&state=login:test-state') as any)).rejects.toMatchObject({
			status: 302,
			location
		});
	});

	it('consumes state only after token exchange and rejects user fetch failures', async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: vi.fn().mockResolvedValue({ access_token: 'token' })
			} as any)
			.mockResolvedValueOnce({ ok: false } as any);
		const { GET } = await import('../../src/routes/api/auth/github/callback/+server');
		await expect(GET(event('code=code&state=login:test-state') as any)).rejects.toMatchObject({
			status: 302,
			location: '/auth/login?error=user_fetch_failed'
		});
		expect(consumeOAuthTransaction).toHaveBeenCalledOnce();
	});

	it('reconciles a canonical account and delegates session finalization', async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: vi.fn().mockResolvedValue({ access_token: 'token' })
			} as any)
			.mockResolvedValueOnce({
				ok: true,
				json: vi.fn().mockResolvedValue({
					id: 123,
					login: 'test-user',
					email: 'user@example.com',
					name: 'Test User',
					avatar_url: 'https://example.com/avatar.png'
				})
			} as any);
		const { GET } = await import('../../src/routes/api/auth/github/callback/+server');
		await GET(event('code=code&state=login:test-state') as any);
		expect(reconcileOAuthAccount).toHaveBeenCalledWith(
			expect.objectContaining({
				db: DB,
				provider: 'github',
				providerAccountId: '123',
				legacyUserId: '123'
			})
		);
		expect(finalizeOAuthLogin).toHaveBeenCalledWith(
			expect.objectContaining({ db: DB, userId: 'user-1' })
		);
		const reconciliation = reconcileOAuthAccount.mock.calls[0][0];
		await reconciliation.createUser('new-user');
		await reconciliation.updateUser('legacy-user', 'legacy');
		await reconciliation.updateUser('email-user', 'email');
		expect(DB.calls.some((call) => call.query.includes('INSERT INTO users'))).toBe(true);
		expect(
			DB.calls.filter((call) => call.query.includes('UPDATE users SET github_login'))
		).toHaveLength(2);
	});

	it('maps unexpected reconciliation errors to a generic OAuth failure', async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: vi.fn().mockResolvedValue({ access_token: 'token' })
			} as any)
			.mockResolvedValueOnce({
				ok: true,
				json: vi.fn().mockResolvedValue({ id: 123, login: 'user' })
			} as any);
		reconcileOAuthAccount.mockRejectedValueOnce(new Error('database unavailable'));
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { GET } = await import('../../src/routes/api/auth/github/callback/+server');
		await expect(GET(event('code=code&state=login:test-state') as any)).rejects.toMatchObject({
			status: 302,
			location: '/auth/login?error=oauth_failed'
		});
		expect(consoleSpy).toHaveBeenCalledWith('GitHub OAuth callback error');
		consoleSpy.mockRestore();
	});

	it('binds link completion to the initiating user', async () => {
		verifyOAuthTransaction.mockResolvedValueOnce(oauthTransaction('github', 'link', 'user-1'));
		const { GET } = await import('../../src/routes/api/auth/github/callback/+server');
		await expect(
			GET(
				event('code=code&state=link:test-state', {
					locals: { user: { id: 'different-user' } }
				}) as any
			)
		).rejects.toMatchObject({ status: 302, location: '/auth/login?error=invalid_state' });
		expect(fetch).not.toHaveBeenCalled();
	});
});
