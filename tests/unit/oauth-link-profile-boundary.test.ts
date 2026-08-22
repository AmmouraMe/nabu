/**
 * What a second provider is allowed to overwrite.
 *
 * `reconcileOAuthAccount` calls `updateUser` with the match that produced the
 * user: `linked` and `legacy` mean the provider IS this account's identity, so
 * its profile is the profile. `link` is different — an already-authenticated
 * user is attaching a second provider, and that account already has a name, an
 * avatar and an email of its own. Letting the linked provider write those means
 * connecting Discord silently renames a GitHub-primary account and can move its
 * login address onto the Discord one, which no user asked for by clicking
 * "link".
 *
 * The provider's own columns are the exception. `github_login` is where owner
 * resolution looks, so a link still records it.
 */

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

const DB = createOAuthDb();
const platform = {
	env: {
		DB,
		GITHUB_CLIENT_ID: 'client-id',
		GITHUB_CLIENT_SECRET: 'client-secret',
		DISCORD_CLIENT_ID: 'client-id',
		DISCORD_CLIENT_SECRET: 'client-secret',
		SESSION_SECRET: 'session-secret'
	}
} as any;

/** Drive a callback far enough to capture the reconciliation callbacks it passes. */
async function reconciliationFor(provider: 'github' | 'discord', profile: unknown) {
	const transaction = oauthTransaction(provider, 'link', 'user-1');
	verifyOAuthTransaction.mockResolvedValueOnce(transaction);
	consumeOAuthTransaction.mockResolvedValueOnce(transaction);
	vi.mocked(fetch)
		.mockResolvedValueOnce({
			ok: true,
			json: vi.fn().mockResolvedValue({ access_token: 'token' })
		} as any)
		.mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(profile) } as any);
	reconcileOAuthAccount.mockResolvedValueOnce({ userId: 'user-1', linkedProvider: provider });
	const { GET } = await import(`../../src/routes/api/auth/${provider}/callback/+server`);
	await GET({
		url: new URL(`http://localhost/api/auth/${provider}/callback?code=code&state=link:test-state`),
		cookies: createOAuthCookies(),
		platform,
		locals: { user: { id: 'user-1' } }
	} as any);
	return reconcileOAuthAccount.mock.calls[0][0];
}

describe('linking a second provider does not overwrite the account profile', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		DB.calls.length = 0;
		finalizeOAuthLogin.mockResolvedValue(new Response(null, { status: 302 }));
		vi.stubGlobal('fetch', vi.fn());
	});

	it('writes nothing when Discord is linked into an existing account', async () => {
		const reconciliation = await reconciliationFor('discord', {
			id: '123',
			username: 'tester',
			global_name: 'Discord Name',
			email: 'discord@example.com',
			verified: true,
			avatar: 'avatar-hash'
		});
		DB.calls.length = 0;
		await reconciliation.updateUser('user-1', 'link');
		expect(DB.calls).toEqual([]);
	});

	it('still writes the profile when Discord IS the account identity', async () => {
		const reconciliation = await reconciliationFor('discord', {
			id: '123',
			username: 'tester',
			global_name: 'Discord Name',
			email: 'discord@example.com',
			verified: true,
			avatar: 'avatar-hash'
		});
		for (const match of ['linked', 'legacy'] as const) {
			DB.calls.length = 0;
			await reconciliation.updateUser('discord_123', match);
			expect(DB.calls).toHaveLength(1);
			expect(DB.calls[0].query).toContain('profile_login');
			expect(DB.calls[0].query).toContain('email = CASE');
		}
	});

	it('records the GitHub identity on a link but leaves the neutral profile alone', async () => {
		const reconciliation = await reconciliationFor('github', {
			id: 987,
			login: 'gh-tester',
			name: 'GitHub Name',
			email: 'gh@example.com',
			avatar_url: 'https://example.com/gh.png'
		});
		DB.calls.length = 0;
		await reconciliation.updateUser('user-1', 'link');
		expect(DB.calls).toHaveLength(1);
		const [update] = DB.calls;
		expect(update.query).toContain('github_login');
		expect(update.query).not.toContain('profile_login');
		expect(update.query).not.toContain('name = ?');
		expect(update.bindings).toEqual(['gh-tester', 'https://example.com/gh.png', 'user-1']);
	});

	it('writes the neutral profile when GitHub IS the account identity', async () => {
		const reconciliation = await reconciliationFor('github', {
			id: 987,
			login: 'gh-tester',
			name: 'GitHub Name',
			email: 'gh@example.com',
			avatar_url: 'https://example.com/gh.png'
		});

		DB.calls.length = 0;
		await reconciliation.updateUser('987', 'linked');
		expect(DB.calls[0].query).toContain('profile_login');
		expect(DB.calls[0].query).not.toContain('name = ?');
		expect(DB.calls[0].bindings).toEqual([
			'gh-tester',
			'https://example.com/gh.png',
			'gh-tester',
			'https://example.com/gh.png',
			'987'
		]);

		DB.calls.length = 0;
		await reconciliation.updateUser('987', 'legacy');
		expect(DB.calls[0].query).toContain('name = ?');
		expect(DB.calls[0].bindings).toEqual([
			'gh-tester',
			'https://example.com/gh.png',
			'gh-tester',
			'https://example.com/gh.png',
			'GitHub Name',
			'987'
		]);
	});
});
