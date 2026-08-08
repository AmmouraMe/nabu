import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOAuthDb } from '../fixtures/oauth';

const mergeAccounts = vi.fn();
vi.mock('$lib/services/account-merge', () => ({ mergeAccounts }));

describe('canonical OAuth account reconciliation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal('crypto', { randomUUID: () => 'oauth-link-id' });
	});

	it('uses an existing linked canonical user', async () => {
		const db = createOAuthDb((query) => ({
			first: query.includes('provider_account_id')
				? { user_id: 'canonical-user' }
				: query.includes('FROM users WHERE id')
					? { id: 'canonical-user' }
					: null
		}));
		const { reconcileOAuthAccount } = await import('../../src/lib/server/oauth-account');
		const result = await reconcileOAuthAccount({
			db: db as any,
			provider: 'github',
			providerAccountId: 'github-1',
			legacyUserId: 'github-1',
			createUser: vi.fn(),
			updateUser: vi.fn()
		});
		expect(result).toEqual({ userId: 'canonical-user' });
	});

	it('creates a canonical user and token-free provider link', async () => {
		const db = createOAuthDb();
		const createUser = vi.fn().mockResolvedValue(undefined);
		const { reconcileOAuthAccount } = await import('../../src/lib/server/oauth-account');
		await expect(
			reconcileOAuthAccount({
				db: db as any,
				provider: 'github',
				providerAccountId: 'github-1',
				legacyUserId: 'github-1',
				email: 'new@example.com',
				createUser,
				updateUser: vi.fn()
			})
		).resolves.toEqual({ userId: 'github-1' });
		expect(createUser).toHaveBeenCalledWith('github-1');
		const insert = db.calls.find((call) => call.query.includes('INSERT INTO oauth_accounts'));
		expect(insert?.bindings).toEqual(['oauth-link-id', 'github-1', 'github', 'github-1']);
		expect(insert?.query).not.toMatch(/access_token|refresh_token/);
	});

	it('reuses an email-matched user and updates provider profile fields', async () => {
		const updateUser = vi.fn().mockResolvedValue(undefined);
		const db = createOAuthDb((query) => ({
			first: query.includes('lower(email)') ? { id: 'email-user' } : null
		}));
		const { reconcileOAuthAccount } = await import('../../src/lib/server/oauth-account');
		await expect(
			reconcileOAuthAccount({
				db: db as any,
				provider: 'github',
				providerAccountId: 'github-1',
				legacyUserId: 'github-1',
				email: ' User@Example.com ',
				createUser: vi.fn(),
				updateUser
			})
		).resolves.toEqual({ userId: 'email-user' });
		expect(updateUser).toHaveBeenCalledWith('email-user', 'email');
	});

	it('links to the authenticated user and merges a conflicting account', async () => {
		const updateUser = vi.fn().mockResolvedValue(undefined);
		const db = createOAuthDb((query) => ({
			first: query.includes('provider_account_id') ? { user_id: 'old-user' } : null
		}));
		const { reconcileOAuthAccount } = await import('../../src/lib/server/oauth-account');
		await expect(
			reconcileOAuthAccount({
				db: db as any,
				provider: 'github',
				providerAccountId: 'github-1',
				legacyUserId: 'github-1',
				linkingUserId: 'current-user',
				createUser: vi.fn(),
				updateUser
			})
		).resolves.toEqual({ userId: 'current-user', linkedProvider: 'github' });
		expect(mergeAccounts).toHaveBeenCalledWith(db, 'old-user', 'current-user');
		expect(updateUser).toHaveBeenCalledWith('current-user', 'link');
	});

	it('creates a missing provider link for the authenticated user without merging', async () => {
		const updateUser = vi.fn().mockResolvedValue(undefined);
		const db = createOAuthDb();
		const { reconcileOAuthAccount } = await import('../../src/lib/server/oauth-account');
		await expect(
			reconcileOAuthAccount({
				db: db as any,
				provider: 'discord',
				providerAccountId: 'discord-1',
				legacyUserId: 'discord_discord-1',
				linkingUserId: 'current-user',
				createUser: vi.fn(),
				updateUser
			})
		).resolves.toEqual({ userId: 'current-user', linkedProvider: 'discord' });
		expect(mergeAccounts).not.toHaveBeenCalled();
		expect(db.calls.some((call) => call.query.includes('INSERT INTO oauth_accounts'))).toBe(true);
	});

	it('updates an existing legacy user and avoids duplicating its provider link', async () => {
		const updateUser = vi.fn().mockResolvedValue(undefined);
		const db = createOAuthDb((query) => ({
			first: query.includes('SELECT id FROM users WHERE id')
				? { id: 'legacy-user' }
				: query.includes('WHERE user_id = ? AND provider = ?')
					? { id: 'existing-link' }
					: null
		}));
		const { reconcileOAuthAccount } = await import('../../src/lib/server/oauth-account');
		await expect(
			reconcileOAuthAccount({
				db: db as any,
				provider: 'github',
				providerAccountId: 'legacy-user',
				legacyUserId: 'legacy-user',
				createUser: vi.fn(),
				updateUser
			})
		).resolves.toEqual({ userId: 'legacy-user' });
		expect(updateUser).toHaveBeenCalledWith('legacy-user', 'legacy');
		expect(db.calls.some((call) => call.query.includes('INSERT INTO oauth_accounts'))).toBe(false);
	});

	it('merges a distinct legacy account into an email-matched canonical user', async () => {
		const db = createOAuthDb((query) => ({
			first: query.includes('lower(email)')
				? { id: 'email-user' }
				: query.includes('SELECT id FROM users WHERE id')
					? { id: 'legacy-user' }
					: null
		}));
		const { reconcileOAuthAccount } = await import('../../src/lib/server/oauth-account');
		await reconcileOAuthAccount({
			db: db as any,
			provider: 'github',
			providerAccountId: 'github-1',
			legacyUserId: 'legacy-user',
			email: 'same@example.com',
			createUser: vi.fn(),
			updateUser: vi.fn()
		});
		expect(mergeAccounts).toHaveBeenCalledWith(db, 'legacy-user', 'email-user');
	});
});
