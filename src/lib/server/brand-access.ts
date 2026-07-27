/**
 * Brand authorisation for **session-authenticated** routes.
 *
 * This is the same rule the public API enforces in `api-guard.ts`, hoisted so both
 * sides share one implementation. It exists because the session routes originally
 * had no rule at all: `/api/brand/assets/generate` accepted any `brandProfileId`
 * from any logged-in user (reading and writing other people's brands, and spending
 * their AI quota), and `/api/brand/assets/file` served any R2 key to any logged-in
 * user. Being logged in is not authorisation.
 *
 * Two conventions carried over from the public API:
 *
 * - **Unreachable answers 404, not 403.** A 403 confirms the id exists to someone
 *   with no business knowing that, which turns the route into an enumeration oracle.
 * - **No admin bypass.** Admins reach other people's brands through the `/api/admin`
 *   surface, which is gated and audited. Widening these routes for admins would put
 *   an untracked back door on the same paths users hit.
 */

import type { D1Database } from '@cloudflare/workers-types';
import { error } from '@sveltejs/kit';

export type BrandRole = 'owner' | 'manager' | 'editor' | 'viewer';

/** Roles that may change a brand or its assets. */
const WRITE_ROLES: BrandRole[] = ['owner', 'manager', 'editor'];

export function roleCanWrite(role: BrandRole): boolean {
	return WRITE_ROLES.includes(role);
}

/**
 * Resolve what a user may do with a brand: direct ownership first, then a
 * `brand_access` grant. Null means no relationship at all — callers treat that as
 * 404, never 403.
 */
export async function resolveUserBrandRole(
	db: D1Database,
	userId: string,
	brandProfileId: string
): Promise<BrandRole | null> {
	const owned = await db
		.prepare('SELECT user_id FROM brand_profiles WHERE id = ?')
		.bind(brandProfileId)
		.first<{ user_id: string }>();

	if (!owned) return null;
	if (owned.user_id === userId) return 'owner';

	const grant = await db
		.prepare('SELECT role FROM brand_access WHERE brand_profile_id = ? AND user_id = ?')
		.bind(brandProfileId, userId)
		.first<{ role: string }>();

	if (!grant) return null;
	if (grant.role === 'manager' || grant.role === 'editor' || grant.role === 'viewer') {
		return grant.role;
	}
	return null;
}

/**
 * Assert the user may act on a brand, or throw the SvelteKit error the route should
 * answer with. Returns the role so callers can branch further if they need to.
 */
export async function requireBrandAccess(
	db: D1Database,
	userId: string,
	brandProfileId: string,
	need: 'read' | 'write'
): Promise<BrandRole> {
	const role = await resolveUserBrandRole(db, userId, brandProfileId);
	if (!role) throw error(404, 'Brand not found');
	if (need === 'write' && !roleCanWrite(role)) {
		throw error(403, `Your access to this brand is ${role}`);
	}
	return role;
}

/** What an R2 key belongs to, derived from its prefix. */
export type R2Owner = { kind: 'brand'; brandProfileId: string } | { kind: 'user'; userId: string };

/**
 * Work out who owns an R2 object from its key.
 *
 * Every writer in this codebase namespaces by brand or by user:
 *
 *   brands/<brandProfileId>/<mediaType>/<file>     — brand media, AI images/audio, logos
 *   archive/<brandProfileId>/<...>/<file>          — onboarding attachments, AI archive
 *   videos/<userId>/<generationId>.mp4             — generated video
 *
 * Anything else — including a key that tries to climb out with `..`, an empty
 * segment, or an unknown prefix — returns null and must be **denied**, not served.
 * Allow-list by design: a new writer that invents a prefix fails closed and shows up
 * as a broken link, rather than silently serving objects nobody is checked against.
 */
export function ownerOfR2Key(key: string): R2Owner | null {
	const segments = key.split('/');
	if (segments.length < 3) return null;
	if (segments.some((s) => s === '' || s === '.' || s === '..')) return null;

	const [prefix, id] = segments;
	if (prefix === 'brands' || prefix === 'archive') {
		return { kind: 'brand', brandProfileId: id };
	}
	if (prefix === 'videos') {
		return { kind: 'user', userId: id };
	}
	return null;
}
