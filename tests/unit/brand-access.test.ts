/**
 * Tests for the shared session-side brand guard.
 *
 * These cover the rule that closed two IDORs: `/api/brand/assets/generate` accepted
 * any `brandProfileId` from any logged-in user, and `/api/brand/assets/file` served
 * any R2 key. The interesting cases here are the *denials* — and that a denial says
 * 404, not 403, so neither route can be used to discover which ids exist.
 */
import { describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import {
	ownerOfR2Key,
	requireBrandAccess,
	resolveUserBrandRole,
	roleCanWrite
} from '../../src/lib/server/brand-access';

/** D1 stand-in that answers by query, so call order does not matter. */
function fakeDb(rows: { owner?: { user_id: string } | null; grant?: { role: string } | null }) {
	return {
		prepare(sql: string) {
			const isOwnerLookup = sql.includes('FROM brand_profiles');
			return {
				bind: () => ({
					first: async () => (isOwnerLookup ? (rows.owner ?? null) : (rows.grant ?? null))
				})
			};
		}
	} as unknown as D1Database;
}

describe('resolveUserBrandRole', () => {
	it('resolves the brand owner as owner', async () => {
		const role = await resolveUserBrandRole(fakeDb({ owner: { user_id: 'u1' } }), 'u1', 'b1');
		expect(role).toBe('owner');
	});

	it('returns null for a brand that does not exist', async () => {
		expect(await resolveUserBrandRole(fakeDb({ owner: null }), 'u1', 'b1')).toBeNull();
	});

	it('returns null for a stranger — the case that was the IDOR', async () => {
		const db = fakeDb({ owner: { user_id: 'someone-else' }, grant: null });
		expect(await resolveUserBrandRole(db, 'attacker', 'b1')).toBeNull();
	});

	it('honours a brand_access grant', async () => {
		const db = fakeDb({ owner: { user_id: 'someone-else' }, grant: { role: 'editor' } });
		expect(await resolveUserBrandRole(db, 'u2', 'b1')).toBe('editor');
	});

	it('rejects a role string the schema does not define', async () => {
		const db = fakeDb({ owner: { user_id: 'someone-else' }, grant: { role: 'superuser' } });
		expect(await resolveUserBrandRole(db, 'u2', 'b1')).toBeNull();
	});
});

describe('roleCanWrite', () => {
	it('lets owner, manager and editor write', () => {
		expect(roleCanWrite('owner')).toBe(true);
		expect(roleCanWrite('manager')).toBe(true);
		expect(roleCanWrite('editor')).toBe(true);
	});

	it('keeps a viewer read-only', () => {
		expect(roleCanWrite('viewer')).toBe(false);
	});
});

describe('requireBrandAccess', () => {
	it('returns the role when access is allowed', async () => {
		const db = fakeDb({ owner: { user_id: 'u1' } });
		expect(await requireBrandAccess(db, 'u1', 'b1', 'write')).toBe('owner');
	});

	it('throws 404 — not 403 — when the brand is unreachable', async () => {
		const db = fakeDb({ owner: { user_id: 'someone-else' }, grant: null });
		await expect(requireBrandAccess(db, 'attacker', 'b1', 'read')).rejects.toMatchObject({
			status: 404
		});
	});

	it('throws 403 when a viewer attempts a write', async () => {
		const db = fakeDb({ owner: { user_id: 'someone-else' }, grant: { role: 'viewer' } });
		await expect(requireBrandAccess(db, 'u2', 'b1', 'write')).rejects.toMatchObject({
			status: 403
		});
	});

	it('lets a viewer read', async () => {
		const db = fakeDb({ owner: { user_id: 'someone-else' }, grant: { role: 'viewer' } });
		expect(await requireBrandAccess(db, 'u2', 'b1', 'read')).toBe('viewer');
	});
});

describe('ownerOfR2Key', () => {
	it('maps the three prefixes the app actually writes', () => {
		expect(ownerOfR2Key('brands/b1/image/x.png')).toEqual({ kind: 'brand', brandProfileId: 'b1' });
		expect(ownerOfR2Key('archive/b1/onboarding/images/x.png')).toEqual({
			kind: 'brand',
			brandProfileId: 'b1'
		});
		expect(ownerOfR2Key('videos/u1/gen.mp4')).toEqual({ kind: 'user', userId: 'u1' });
	});

	it('denies an unknown prefix rather than guessing an owner', () => {
		expect(ownerOfR2Key('secrets/dump.sql')).toBeNull();
		expect(ownerOfR2Key('brand/b1/image/x.png')).toBeNull();
	});

	it('denies keys that try to climb out of their namespace', () => {
		expect(ownerOfR2Key('brands/../videos/u2/gen.mp4')).toBeNull();
		expect(ownerOfR2Key('brands//image/x.png')).toBeNull();
		expect(ownerOfR2Key('brands/./image/x.png')).toBeNull();
	});

	it('denies a key too short to carry an owner', () => {
		expect(ownerOfR2Key('brands/b1')).toBeNull();
		expect(ownerOfR2Key('')).toBeNull();
	});
});
