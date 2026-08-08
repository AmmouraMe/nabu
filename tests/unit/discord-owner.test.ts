import { describe, expect, it, vi } from 'vitest';
import { resolveOwnerStatus } from '../../src/lib/server/auth-identity';
import { createOAuthDb } from '../fixtures/oauth';

describe('OAuth owner identity', () => {
	it('recognizes a directly configured numeric GitHub owner ID', async () => {
		const db = createOAuthDb();
		await expect(
			resolveOwnerStatus({ env: { DB: db, GITHUB_OWNER_ID: '12345' } } as any, {
				id: '12345',
				github_login: 'someone'
			})
		).resolves.toBe(true);
		expect(db.calls).toHaveLength(0);
	});

	it('treats a non-numeric GitHub owner setting as a case-insensitive username', async () => {
		const db = createOAuthDb();
		await expect(
			resolveOwnerStatus({ env: { DB: db, GITHUB_OWNER_ID: 'OwnerName' } } as any, {
				id: 'user-1',
				github_login: 'ownername'
			})
		).resolves.toBe(true);
	});

	it('recognizes a Discord owner through the canonical account link', async () => {
		const db = createOAuthDb((query) => ({
			first: query.includes('FROM oauth_accounts') ? { found: 1 } : null
		}));
		const owner = await resolveOwnerStatus(
			{ env: { DB: db, DISCORD_OWNER_ID: '293484886726279168' } } as any,
			{ id: 'user-1', github_login: null }
		);
		expect(owner).toBe(true);
		expect(db.calls[0]?.bindings).toEqual(['user-1', 'discord', '293484886726279168']);
	});

	it('fails closed when no owner identity matches', async () => {
		const db = createOAuthDb();
		await expect(
			resolveOwnerStatus({ env: { DB: db, DISCORD_OWNER_ID: 'other-account' } } as any, {
				id: 'user-1',
				github_login: null
			})
		).resolves.toBe(false);
	});

	it('uses KV owner configuration and preserves snowflakes as strings', async () => {
		const snowflake = '999999999999999999';
		const db = createOAuthDb((_query, bindings) => ({
			first: bindings.at(-1) === snowflake ? { found: 1 } : null
		}));
		const KV = {
			get: vi.fn((key: string) => Promise.resolve(key === 'discord_owner_id' ? snowflake : null))
		};
		await expect(
			resolveOwnerStatus({ env: { DB: db, KV } } as any, { id: 'user-1', github_login: null })
		).resolves.toBe(true);
	});

	it('uses KV GitHub ID and username fallbacks independently', async () => {
		const db = createOAuthDb((query, bindings) => ({
			first: query.includes('oauth_accounts') && bindings.at(-1) === '98765' ? { found: 1 } : null
		}));
		const KV = {
			get: vi.fn((key: string) => {
				if (key === 'github_owner_id') return Promise.resolve('98765');
				if (key === 'github_owner_username') return Promise.resolve('fallback-owner');
				return Promise.resolve(null);
			})
		};
		await expect(
			resolveOwnerStatus({ env: { DB: db, KV } } as any, { id: 'user-1', github_login: 'other' })
		).resolves.toBe(true);
		expect(KV.get).toHaveBeenCalledWith('github_owner_id');
		expect(KV.get).toHaveBeenCalledWith('github_owner_username');
	});

	it('returns false without a database binding', async () => {
		await expect(resolveOwnerStatus(undefined, { id: 'user-1', github_login: null })).resolves.toBe(
			false
		);
	});

	it('fails closed when owner configuration storage fails', async () => {
		const db = createOAuthDb();
		const KV = { get: vi.fn().mockRejectedValue(new Error('KV unavailable')) };
		await expect(
			resolveOwnerStatus({ env: { DB: db, KV } } as any, { id: 'user-1', github_login: null })
		).resolves.toBe(false);
	});
});
