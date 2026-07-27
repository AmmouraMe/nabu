/**
 * Public API key handling: minting, hashing, verification, and authorisation.
 *
 * Two rules shape everything here.
 *
 * 1. **Only hashes are stored.** The plaintext is shown once at creation and never
 *    again. A dump of `api_keys` must not yield usable credentials.
 * 2. **Every brand access is checked.** The session-authenticated routes this API
 *    sits beside do *not* do that — `/api/brand/assets/generate` accepts any
 *    `brandProfileId` from any logged-in user, which both leaks other people's
 *    assets and spends their AI quota. A key handed to a third-party application is
 *    a far wider blast radius, so authorisation is resolved on every request here.
 *
 * Uses Web Crypto only, so it runs on Workers.
 */

import type { D1Database } from '@cloudflare/workers-types';

const encoder = new TextEncoder();

/** Visible prefix, so a key is recognisable in logs and lists as ours. */
const KEY_PREFIX = 'nabu_sk_';

/** Bytes of entropy in a key. 32 bytes = 256 bits. */
const KEY_BYTES = 32;

export type ApiScope = 'brands:read' | 'brands:write' | 'assets:read' | 'assets:write';

export const ALL_SCOPES: ApiScope[] = [
	'brands:read',
	'brands:write',
	'assets:read',
	'assets:write'
];

export interface ApiKeyRecord {
	id: string;
	userId: string;
	name: string;
	keyPrefix: string;
	scopes: ApiScope[];
	brandProfileId: string | null;
	revokedAt: string | null;
	lastUsedAt: string | null;
	requestCount: number;
	expiresAt: string | null;
	createdAt: string;
}

/** The caller behind a verified key. */
export interface ApiPrincipal {
	keyId: string;
	userId: string;
	scopes: ApiScope[];
	/** When set, the key may only touch this brand. */
	brandProfileId: string | null;
}

/** Base64url without padding: safe in headers, URLs and shell copy-paste. */
function toBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** SHA-256, hex encoded. */
export async function hashApiKey(plaintext: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(plaintext));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a new key. Returns the plaintext — the only time it exists — alongside
 * the hash and prefix to persist.
 */
export async function mintApiKey(): Promise<{
	plaintext: string;
	hash: string;
	prefix: string;
}> {
	const bytes = new Uint8Array(KEY_BYTES);
	crypto.getRandomValues(bytes);
	const plaintext = KEY_PREFIX + toBase64Url(bytes);
	return {
		plaintext,
		hash: await hashApiKey(plaintext),
		// Enough to tell two keys apart in a list, far too little to reconstruct one.
		prefix: plaintext.slice(0, KEY_PREFIX.length + 6)
	};
}

function parseScopes(raw: unknown): ApiScope[] {
	if (typeof raw !== 'string') return [];
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		// Drop anything unrecognised rather than trusting the column: an unknown scope
		// must never widen access.
		return parsed.filter((s): s is ApiScope => ALL_SCOPES.includes(s as ApiScope));
	} catch {
		return [];
	}
}

/** Read the bearer token from a request, or null when absent/malformed. */
export function bearerFrom(request: Request): string | null {
	const header = request.headers.get('Authorization') ?? '';
	if (!header.startsWith('Bearer ')) return null;
	const token = header.slice(7).trim();
	return token.length > 0 ? token : null;
}

/**
 * Verify a plaintext key and return its principal, or null.
 *
 * Null covers every failure — unknown, revoked, expired — deliberately: telling a
 * caller *which* of those applies distinguishes "no such key" from "revoked key",
 * which is a probing oracle.
 */
export async function verifyApiKey(
	db: D1Database,
	plaintext: string
): Promise<ApiPrincipal | null> {
	if (!plaintext.startsWith(KEY_PREFIX)) return null;

	const hash = await hashApiKey(plaintext);
	const row = await db
		.prepare(
			`SELECT id, user_id, scopes, brand_profile_id, revoked_at, expires_at
			 FROM api_keys WHERE key_hash = ?`
		)
		.bind(hash)
		.first<{
			id: string;
			user_id: string;
			scopes: string;
			brand_profile_id: string | null;
			revoked_at: string | null;
			expires_at: string | null;
		}>();

	if (!row) return null;
	if (row.revoked_at) return null;
	if (row.expires_at && row.expires_at <= new Date().toISOString()) return null;

	return {
		keyId: row.id,
		userId: row.user_id,
		scopes: parseScopes(row.scopes),
		brandProfileId: row.brand_profile_id
	};
}

/**
 * Record usage. Deliberately fire-and-forget at the call site: a failed metrics
 * write must not fail an otherwise valid request.
 */
export async function touchApiKey(db: D1Database, keyId: string): Promise<void> {
	await db
		.prepare(
			`UPDATE api_keys
			 SET last_used_at = ?, request_count = request_count + 1
			 WHERE id = ?`
		)
		.bind(new Date().toISOString(), keyId)
		.run();
}

export function hasScope(principal: ApiPrincipal, scope: ApiScope): boolean {
	return principal.scopes.includes(scope);
}

export type BrandRole = 'owner' | 'manager' | 'editor' | 'viewer';

/** Roles that may change a brand or its assets. */
const WRITE_ROLES: BrandRole[] = ['owner', 'manager', 'editor'];

/**
 * Resolve what this principal may do with a brand.
 *
 * Checks direct ownership first, then a `brand_access` grant. Returns null when the
 * key has no relationship to the brand at all — callers must treat that as 404
 * rather than 403, so the API does not confirm that an id exists to someone with no
 * business knowing.
 */
export async function resolveBrandRole(
	db: D1Database,
	principal: ApiPrincipal,
	brandProfileId: string
): Promise<BrandRole | null> {
	// A brand-scoped key cannot reach past its brand, whatever its owner can see.
	if (principal.brandProfileId && principal.brandProfileId !== brandProfileId) {
		return null;
	}

	const owned = await db
		.prepare('SELECT user_id FROM brand_profiles WHERE id = ?')
		.bind(brandProfileId)
		.first<{ user_id: string }>();

	if (!owned) return null;
	if (owned.user_id === principal.userId) return 'owner';

	const grant = await db
		.prepare('SELECT role FROM brand_access WHERE brand_profile_id = ? AND user_id = ?')
		.bind(brandProfileId, principal.userId)
		.first<{ role: string }>();

	if (!grant) return null;
	if (grant.role === 'manager' || grant.role === 'editor' || grant.role === 'viewer') {
		return grant.role;
	}
	return null;
}

export function roleCanWrite(role: BrandRole): boolean {
	return WRITE_ROLES.includes(role);
}

/** Shape every API error the same way, so clients can branch on `code`. */
export function apiError(status: number, code: string, message: string): Response {
	return new Response(JSON.stringify({ error: { code, message } }), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}
