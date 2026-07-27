import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { mintApiKey, ALL_SCOPES, type ApiScope } from '$lib/server/api-keys';
import { resolveBrandRole } from '$lib/server/api-keys';

/**
 * Management for the caller's own public API keys.
 *
 * Session-authenticated, not key-authenticated, and deliberately so: a key must not
 * be able to mint another key, or a single leak escalates into permanent access that
 * revoking the original does not close.
 */

/** GET /api/keys — list the caller's keys. Never returns key material. */
export const GET: RequestHandler = async ({ locals, platform }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Database unavailable');

	const rows = await db
		.prepare(
			`SELECT id, name, key_prefix, scopes, brand_profile_id, revoked_at,
			        last_used_at, request_count, expires_at, created_at
			 FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`
		)
		.bind(locals.user.id)
		.all();

	return json({
		keys: (rows.results ?? []).map((r: Record<string, unknown>) => ({
			id: r.id,
			name: r.name,
			// Prefix only — the rest is unrecoverable by design.
			key_prefix: r.key_prefix,
			scopes: JSON.parse(String(r.scopes || '[]')),
			brand_profile_id: r.brand_profile_id,
			revoked: !!r.revoked_at,
			last_used_at: r.last_used_at,
			request_count: r.request_count,
			expires_at: r.expires_at,
			created_at: r.created_at
		}))
	});
};

/**
 * POST /api/keys — create a key.
 *
 * The response contains the only copy of the plaintext that will ever exist.
 */
export const POST: RequestHandler = async ({ request, locals, platform }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Database unavailable');

	const body = await request.json().catch(() => ({}));
	const name = typeof body.name === 'string' ? body.name.trim() : '';
	if (!name || name.length > 80) {
		throw error(400, 'A name is required, up to 80 characters.');
	}

	// Unknown scopes are rejected rather than filtered out: silently dropping one
	// hands back a key that does less than the caller asked for, and they find out
	// only when a later request 403s.
	const requested: unknown = body.scopes ?? ['brands:read'];
	if (!Array.isArray(requested) || requested.length === 0) {
		throw error(400, '`scopes` must be a non-empty array.');
	}
	const unknown = requested.filter((s) => !ALL_SCOPES.includes(s as ApiScope));
	if (unknown.length > 0) {
		throw error(400, `Unknown scopes: ${unknown.join(', ')}. Valid: ${ALL_SCOPES.join(', ')}`);
	}
	const scopes = requested as ApiScope[];

	// A brand-scoped key may only name a brand its creator can actually write to —
	// otherwise a key could be minted against someone else's brand id.
	let brandProfileId: string | null = null;
	if (typeof body.brand_profile_id === 'string' && body.brand_profile_id) {
		const role = await resolveBrandRole(
			db,
			{ keyId: '', userId: locals.user.id, scopes, brandProfileId: null },
			body.brand_profile_id
		);
		if (!role) throw error(404, 'Brand not found.');
		brandProfileId = body.brand_profile_id;
	}

	const expiresAt = typeof body.expires_at === 'string' && body.expires_at ? body.expires_at : null;

	const { plaintext, hash, prefix } = await mintApiKey();
	const id = crypto.randomUUID();

	await db
		.prepare(
			`INSERT INTO api_keys
			   (id, user_id, name, key_hash, key_prefix, scopes, brand_profile_id, expires_at, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			id,
			locals.user.id,
			name,
			hash,
			prefix,
			JSON.stringify(scopes),
			brandProfileId,
			expiresAt,
			new Date().toISOString()
		)
		.run();

	return json(
		{
			id,
			name,
			scopes,
			brand_profile_id: brandProfileId,
			expires_at: expiresAt,
			/** Shown once. There is no endpoint that can return it again. */
			key: plaintext,
			warning: 'Store this key now — it cannot be retrieved again.'
		},
		{ status: 201 }
	);
};
