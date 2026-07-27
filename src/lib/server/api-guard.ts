/**
 * Request guard for the public API.
 *
 * Every `/api/v1` route starts here. Returns a discriminated result rather than
 * throwing SvelteKit's `error()`, because the public API answers with its own JSON
 * envelope (`{ error: { code, message } }`) that clients can branch on, not
 * SvelteKit's HTML-or-JSON default.
 */

import type { D1Database } from '@cloudflare/workers-types';
import {
	apiError,
	bearerFrom,
	hasScope,
	resolveBrandRole,
	roleCanWrite,
	touchApiKey,
	verifyApiKey,
	type ApiPrincipal,
	type ApiScope,
	type BrandRole
} from './api-keys';

type Guarded<T> = { ok: true; value: T } | { ok: false; response: Response };

interface GuardEvent {
	request: Request;
	platform?: Readonly<App.Platform> | undefined;
}

/**
 * Authenticate a request and assert a scope.
 *
 * Usage is recorded through `waitUntil` where available so the metrics write never
 * delays the response, and never fails it.
 */
export async function requireApiKey(
	event: GuardEvent,
	scope: ApiScope
): Promise<Guarded<{ principal: ApiPrincipal; db: D1Database }>> {
	const db = event.platform?.env?.DB;
	if (!db) {
		return { ok: false, response: apiError(503, 'unavailable', 'Database is not available.') };
	}

	const token = bearerFrom(event.request);
	if (!token) {
		return {
			ok: false,
			response: apiError(
				401,
				'missing_credentials',
				'Provide an API key as `Authorization: Bearer nabu_sk_…`.'
			)
		};
	}

	const principal = await verifyApiKey(db, token);
	if (!principal) {
		// One message for unknown, revoked and expired alike — distinguishing them
		// would let a caller probe which keys exist.
		return { ok: false, response: apiError(401, 'invalid_key', 'API key is not valid.') };
	}

	if (!hasScope(principal, scope)) {
		return {
			ok: false,
			response: apiError(403, 'insufficient_scope', `This key is missing the \`${scope}\` scope.`)
		};
	}

	// Called through `context` on purpose. Pulling `waitUntil` out into a local loses
	// its `this` binding and throws on invocation — which 500s every request that gets
	// this far, i.e. every *authenticated* one, while unauthenticated requests keep
	// working because they return before reaching here.
	const record = touchApiKey(db, principal.keyId).catch(() => {});
	const ctx = event.platform?.context;
	if (ctx && typeof ctx.waitUntil === 'function') {
		ctx.waitUntil(record);
	}

	return { ok: true, value: { principal, db } };
}

/**
 * Assert the principal may act on a brand.
 *
 * A brand the key cannot reach answers **404, not 403**: a 403 would confirm the id
 * exists to someone with no business knowing that.
 */
export async function requireBrand(
	db: D1Database,
	principal: ApiPrincipal,
	brandProfileId: string,
	need: 'read' | 'write'
): Promise<Guarded<{ role: BrandRole }>> {
	const role = await resolveBrandRole(db, principal, brandProfileId);
	if (!role) {
		return { ok: false, response: apiError(404, 'brand_not_found', 'Brand not found.') };
	}
	if (need === 'write' && !roleCanWrite(role)) {
		return {
			ok: false,
			response: apiError(403, 'read_only_access', `Your access to this brand is \`${role}\`.`)
		};
	}
	return { ok: true, value: { role } };
}

/** Parse a JSON body, tolerating an empty one. */
export async function readJson(request: Request): Promise<Guarded<Record<string, unknown>>> {
	const raw = await request.text();
	if (!raw.trim()) return { ok: true, value: {} };
	try {
		const parsed = JSON.parse(raw);
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			return {
				ok: false,
				response: apiError(400, 'invalid_body', 'Body must be a JSON object.')
			};
		}
		return { ok: true, value: parsed as Record<string, unknown> };
	} catch {
		return { ok: false, response: apiError(400, 'invalid_json', 'Body is not valid JSON.') };
	}
}

/** JSON success response, so every route answers in the same shape. */
export function apiJson(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}
