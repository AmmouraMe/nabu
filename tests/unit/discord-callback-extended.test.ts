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

describe('Discord OAuth callback boundaries', () => {
	const DB = createOAuthDb();
	const platform = {
		env: {
			DB,
			DISCORD_CLIENT_ID: 'client-id',
			DISCORD_CLIENT_SECRET: 'client-secret',
			SESSION_SECRET: 'session-secret'
		}
	} as any;

	beforeEach(() => {
		vi.clearAllMocks();
		verifyOAuthTransaction.mockResolvedValue(oauthTransaction('discord'));
		consumeOAuthTransaction.mockResolvedValue(oauthTransaction('discord'));
		reconcileOAuthAccount.mockResolvedValue({ userId: 'user-1' });
		finalizeOAuthLogin.mockResolvedValue(new Response(null, { status: 302 }));
		vi.stubGlobal('fetch', vi.fn());
	});

	function event(intent: 'login' | 'link' = 'login') {
		return {
			url: new URL(
				`http://localhost/api/auth/discord/callback?code=code&state=${intent}:test-state`
			),
			cookies: createOAuthCookies(),
			platform,
			locals: {}
		};
	}

	it('rejects a transaction that cannot be consumed', async () => {
		consumeOAuthTransaction.mockResolvedValueOnce(null);
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: vi.fn().mockResolvedValue({ access_token: 'token' })
		} as any);
		const { GET } = await import('../../src/routes/api/auth/discord/callback/+server');
		await expect(GET(event() as any)).rejects.toMatchObject({
			status: 302,
			location: '/auth/login?error=invalid_state'
		});
	});

	it('fails closed without transaction storage', async () => {
		verifyOAuthState.mockResolvedValueOnce(null);
		const { GET } = await import('../../src/routes/api/auth/discord/callback/+server');
		await expect(GET({ ...event(), platform: { env: {} } } as any)).rejects.toMatchObject({
			status: 302,
			location: '/auth/login?error=invalid_state'
		});
	});

	it('uses the authenticated canonical user for a bound link transaction', async () => {
		const transaction = oauthTransaction('discord', 'link', 'user-1');
		verifyOAuthTransaction.mockResolvedValueOnce(transaction);
		consumeOAuthTransaction.mockResolvedValueOnce(transaction);
		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: vi.fn().mockResolvedValue({ access_token: 'token' })
			} as any)
			.mockResolvedValueOnce({
				ok: true,
				json: vi.fn().mockResolvedValue({
					id: 'discord-1',
					username: 'tester',
					email: 'tester@example.com'
				})
			} as any);
		reconcileOAuthAccount.mockResolvedValueOnce({
			userId: 'user-1',
			linkedProvider: 'discord'
		});
		const request = event('link');
		request.locals = { user: { id: 'user-1' } } as any;
		const { GET } = await import('../../src/routes/api/auth/discord/callback/+server');
		await GET(request as any);
		expect(reconcileOAuthAccount).toHaveBeenCalledWith(
			expect.objectContaining({ linkingUserId: 'user-1', legacyUserId: 'discord_discord-1' })
		);
		expect(finalizeOAuthLogin).toHaveBeenCalledWith(
			expect.objectContaining({ linkedProvider: 'discord', userId: 'user-1' })
		);
		const reconciliation = reconcileOAuthAccount.mock.calls[0][0];
		await reconciliation.createUser('discord_discord-1');
		await reconciliation.updateUser('discord_discord-1', 'legacy');
		await reconciliation.updateUser('user-1', 'link');
		expect(DB.calls.some((call) => call.query.includes('INSERT INTO users'))).toBe(true);
		expect(DB.calls.some((call) => call.query.includes('UPDATE users SET name'))).toBe(true);
	});

	it.each([
		[true, 'tester@example.com'],
		[false, null]
	] as const)('uses Discord email only when verified is %s', async (verified, email) => {
		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: vi.fn().mockResolvedValue({ access_token: 'token' })
			} as any)
			.mockResolvedValueOnce({
				ok: true,
				json: vi.fn().mockResolvedValue({
					id: 'discord-1',
					username: 'tester',
					email: 'tester@example.com',
					verified
				})
			} as any);
		const { GET } = await import('../../src/routes/api/auth/discord/callback/+server');
		await GET(event() as any);
		expect(reconcileOAuthAccount).toHaveBeenCalledWith(expect.objectContaining({ email }));
	});

	it('maps unexpected provider reconciliation errors to a generic failure', async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: vi.fn().mockResolvedValue({ access_token: 'token' })
			} as any)
			.mockResolvedValueOnce({
				ok: true,
				json: vi.fn().mockResolvedValue({ id: 'discord-1', username: 'tester' })
			} as any);
		reconcileOAuthAccount.mockRejectedValueOnce(new Error('database unavailable'));
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { GET } = await import('../../src/routes/api/auth/discord/callback/+server');
		await expect(GET(event() as any)).rejects.toMatchObject({
			status: 302,
			location: '/auth/login?error=oauth_failed'
		});
		expect(consoleSpy).toHaveBeenCalledWith('Discord OAuth callback error');
		consoleSpy.mockRestore();
	});
});
