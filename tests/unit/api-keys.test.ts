import { describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import {
	mintApiKey,
	hashApiKey,
	verifyApiKey,
	bearerFrom,
	hasScope,
	resolveBrandRole,
	roleCanWrite,
	ALL_SCOPES,
	type ApiPrincipal
} from '../../src/lib/server/api-keys';

/** Minimal D1 stand-in: a queue of `first()` results keyed by call order. */
function fakeDb(results: unknown[]) {
	const calls: string[] = [];
	let i = 0;
	return {
		calls,
		db: {
			prepare(sql: string) {
				calls.push(sql.replace(/\s+/g, ' ').trim());
				return {
					bind: () => ({
						first: async () => results[i++] ?? null,
						all: async () => ({ results: [] }),
						run: async () => ({ meta: { changes: 1 } })
					})
				};
			}
		} as unknown as D1Database
	};
}

const principal = (over: Partial<ApiPrincipal> = {}): ApiPrincipal => ({
	keyId: 'k1',
	userId: 'u1',
	scopes: ['brands:read'],
	brandProfileId: null,
	...over
});

describe('mintApiKey', () => {
	it('produces a prefixed key whose hash matches', async () => {
		const { plaintext, hash, prefix } = await mintApiKey();
		expect(plaintext.startsWith('nabu_sk_')).toBe(true);
		expect(await hashApiKey(plaintext)).toBe(hash);
		expect(plaintext.startsWith(prefix)).toBe(true);
	});

	it('does not put enough in the prefix to reconstruct the key', async () => {
		const { plaintext, prefix } = await mintApiKey();
		expect(prefix.length).toBeLessThan(plaintext.length / 2);
	});

	it('never repeats', async () => {
		const keys = new Set<string>();
		for (let i = 0; i < 40; i++) keys.add((await mintApiKey()).plaintext);
		expect(keys.size).toBe(40);
	});

	it('hashes deterministically but differs between keys', async () => {
		const a = await mintApiKey();
		const b = await mintApiKey();
		expect(await hashApiKey(a.plaintext)).toBe(a.hash);
		expect(a.hash).not.toBe(b.hash);
	});
});

describe('bearerFrom', () => {
	const req = (h?: string) =>
		new Request('https://x.dev', { headers: h ? { Authorization: h } : {} });

	it('reads a bearer token', () => {
		expect(bearerFrom(req('Bearer abc'))).toBe('abc');
	});

	it('rejects other schemes and empties', () => {
		expect(bearerFrom(req('Basic abc'))).toBeNull();
		expect(bearerFrom(req('Bearer   '))).toBeNull();
		expect(bearerFrom(req())).toBeNull();
	});
});

describe('verifyApiKey', () => {
	it('rejects anything without the key prefix without touching the database', async () => {
		const { db, calls } = fakeDb([]);
		expect(await verifyApiKey(db, 'not-a-nabu-key')).toBeNull();
		// No query at all: a malformed token must not cost a lookup.
		expect(calls).toHaveLength(0);
	});

	it('returns a principal for a live key', async () => {
		const { plaintext } = await mintApiKey();
		const { db } = fakeDb([
			{
				id: 'k1',
				user_id: 'u1',
				scopes: '["brands:read","assets:write"]',
				brand_profile_id: null,
				revoked_at: null,
				expires_at: null
			}
		]);
		const p = await verifyApiKey(db, plaintext);
		expect(p?.userId).toBe('u1');
		expect(p?.scopes).toEqual(['brands:read', 'assets:write']);
	});

	it('rejects a revoked key', async () => {
		const { plaintext } = await mintApiKey();
		const { db } = fakeDb([
			{
				id: 'k1',
				user_id: 'u1',
				scopes: '["brands:read"]',
				brand_profile_id: null,
				revoked_at: '2026-01-01T00:00:00.000Z',
				expires_at: null
			}
		]);
		expect(await verifyApiKey(db, plaintext)).toBeNull();
	});

	it('rejects an expired key', async () => {
		const { plaintext } = await mintApiKey();
		const { db } = fakeDb([
			{
				id: 'k1',
				user_id: 'u1',
				scopes: '["brands:read"]',
				brand_profile_id: null,
				revoked_at: null,
				expires_at: '2000-01-01T00:00:00.000Z'
			}
		]);
		expect(await verifyApiKey(db, plaintext)).toBeNull();
	});

	it('drops unrecognised scopes rather than trusting the column', async () => {
		const { plaintext } = await mintApiKey();
		const { db } = fakeDb([
			{
				id: 'k1',
				user_id: 'u1',
				scopes: '["brands:read","admin:everything"]',
				brand_profile_id: null,
				revoked_at: null,
				expires_at: null
			}
		]);
		const p = await verifyApiKey(db, plaintext);
		expect(p?.scopes).toEqual(['brands:read']);
	});

	it('treats malformed scope JSON as no scopes', async () => {
		const { plaintext } = await mintApiKey();
		const { db } = fakeDb([
			{
				id: 'k1',
				user_id: 'u1',
				scopes: 'not json',
				brand_profile_id: null,
				revoked_at: null,
				expires_at: null
			}
		]);
		expect((await verifyApiKey(db, plaintext))?.scopes).toEqual([]);
	});
});

describe('hasScope', () => {
	it('gates on the exact scope', () => {
		const p = principal({ scopes: ['brands:read'] });
		expect(hasScope(p, 'brands:read')).toBe(true);
		expect(hasScope(p, 'assets:write')).toBe(false);
	});

	it('has no implicit hierarchy — write does not imply read', () => {
		const p = principal({ scopes: ['assets:write'] });
		expect(hasScope(p, 'assets:read')).toBe(false);
	});
});

describe('resolveBrandRole', () => {
	it('reports owner when the brand belongs to the key holder', async () => {
		const { db } = fakeDb([{ user_id: 'u1' }]);
		expect(await resolveBrandRole(db, principal(), 'b1')).toBe('owner');
	});

	it('falls back to a brand_access grant', async () => {
		const { db } = fakeDb([{ user_id: 'someone-else' }, { role: 'editor' }]);
		expect(await resolveBrandRole(db, principal(), 'b1')).toBe('editor');
	});

	it('returns null with no ownership and no grant', async () => {
		const { db } = fakeDb([{ user_id: 'someone-else' }, null]);
		expect(await resolveBrandRole(db, principal(), 'b1')).toBeNull();
	});

	it('returns null for a brand that does not exist', async () => {
		const { db } = fakeDb([null]);
		expect(await resolveBrandRole(db, principal(), 'nope')).toBeNull();
	});

	it('refuses a brand outside a brand-scoped key, without querying', async () => {
		const { db, calls } = fakeDb([{ user_id: 'u1' }]);
		const scoped = principal({ brandProfileId: 'b1' });
		expect(await resolveBrandRole(db, scoped, 'b2')).toBeNull();
		// Short-circuits: the key's own scope settles it before any lookup.
		expect(calls).toHaveLength(0);
	});

	it('still allows a brand-scoped key its own brand', async () => {
		const { db } = fakeDb([{ user_id: 'u1' }]);
		const scoped = principal({ brandProfileId: 'b1' });
		expect(await resolveBrandRole(db, scoped, 'b1')).toBe('owner');
	});

	it('ignores an unrecognised role value', async () => {
		const { db } = fakeDb([{ user_id: 'other' }, { role: 'superuser' }]);
		expect(await resolveBrandRole(db, principal(), 'b1')).toBeNull();
	});
});

describe('roleCanWrite', () => {
	it('lets owner, manager and editor write', () => {
		expect(roleCanWrite('owner')).toBe(true);
		expect(roleCanWrite('manager')).toBe(true);
		expect(roleCanWrite('editor')).toBe(true);
	});

	it('keeps viewer read-only', () => {
		expect(roleCanWrite('viewer')).toBe(false);
	});
});

describe('scope surface', () => {
	it('exposes only the four intended scopes', () => {
		expect(ALL_SCOPES).toEqual(['brands:read', 'brands:write', 'assets:read', 'assets:write']);
	});
});
