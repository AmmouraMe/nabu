/**
 * Session cookie signing.
 *
 * The session cookie used to be bare URL-safe base64 of the session JSON, which
 * meant it was a *claim*, not a credential: `hooks.server.ts` decoded it straight
 * into `locals.user`, so anyone could mint `{"isOwner":true}` and pass every admin
 * guard in the app. Cookies are now `<payload>.<signature>`, where the signature is
 * an HMAC-SHA-256 over the payload keyed by `SESSION_SECRET`. A cookie that is
 * unsigned, tampered with, or signed by a different secret verifies as `null` and
 * the request proceeds anonymously.
 *
 * This authenticates the cookie's *contents* — it does not give revocation. A
 * signed cookie stays valid until `Max-Age` expires even if the user's rights are
 * later reduced. Server-side sessions (the unused `sessions` table + `createSession`
 * in `src/lib/utils/db.ts`) are the follow-up that fixes that.
 *
 * Uses Web Crypto only — no Node built-ins — so it runs on Workers.
 */

const encoder = new TextEncoder();

/**
 * Dev-only fallback secret, used when `SESSION_SECRET` is unset while running
 * `vite dev` / `wrangler pages dev`. `import.meta.env.DEV` is statically false in a
 * production build, so this branch is removed by the bundler and cannot ship — the
 * same mechanism that compiles out the virtual dev login. Without it, every local
 * dev session would need a secret in `.dev.vars` before the app would log anyone in.
 */
const DEV_FALLBACK_SECRET = 'nabu-dev-insecure-session-secret';

/** Resolve the signing secret, or `null` when none is available. */
export function resolveSessionSecret(secret: string | undefined | null): string | null {
	if (secret && secret.length > 0) {
		return secret;
	}
	if (import.meta.env.DEV) {
		console.warn(
			'[session] SESSION_SECRET is not set — falling back to the insecure dev secret. ' +
				'Set SESSION_SECRET in .dev.vars to silence this.'
		);
		return DEV_FALLBACK_SECRET;
	}
	return null;
}

function toUrlSafe(base64: string): string {
	return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromUrlSafe(value: string): string {
	let base64 = value;
	if (base64.includes('-') || base64.includes('_')) {
		base64 = base64.replace(/-/g, '+').replace(/_/g, '/');
	}
	while (base64.length % 4) {
		base64 += '=';
	}
	return base64;
}

/** URL-safe base64 of the session JSON — the unsigned half of the cookie. */
export function encodePayload(data: unknown): string {
	return toUrlSafe(btoa(JSON.stringify(data)));
}

function bytesToUrlSafeBase64(bytes: ArrayBuffer): string {
	const view = new Uint8Array(bytes);
	let binary = '';
	for (let i = 0; i < view.length; i++) {
		binary += String.fromCharCode(view[i]);
	}
	return toUrlSafe(btoa(binary));
}

function urlSafeBase64ToBytes(value: string): ArrayBuffer {
	const binary = atob(fromUrlSafe(value));
	const buffer = new ArrayBuffer(binary.length);
	const bytes = new Uint8Array(buffer);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return buffer;
}

async function importKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign', 'verify']
	);
}

/**
 * Sign session data into a `<payload>.<signature>` cookie value.
 *
 * Throws when no secret is available: a production deploy missing `SESSION_SECRET`
 * must fail loudly at login rather than silently issue unauthenticated cookies.
 */
export async function signSession(
	data: unknown,
	secret: string | undefined | null
): Promise<string> {
	const resolved = resolveSessionSecret(secret);
	if (!resolved) {
		throw new Error('SESSION_SECRET is not configured — refusing to issue an unsigned session');
	}
	const payload = encodePayload(data);
	const key = await importKey(resolved);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
	return `${payload}.${bytesToUrlSafeBase64(signature)}`;
}

/**
 * Verify a session cookie and return its payload, or `null` if it is missing,
 * malformed, unsigned, or carries a bad signature. Never throws — an unparseable
 * cookie is an anonymous request, not a 500.
 */
export async function verifySession<T = Record<string, unknown>>(
	cookie: string | undefined | null,
	secret: string | undefined | null
): Promise<T | null> {
	if (!cookie) {
		return null;
	}
	const resolved = resolveSessionSecret(secret);
	if (!resolved) {
		return null;
	}

	// Exactly one separator: a legacy unsigned cookie has none and is rejected here.
	const separator = cookie.lastIndexOf('.');
	if (separator <= 0 || separator === cookie.length - 1) {
		return null;
	}
	const payload = cookie.slice(0, separator);
	const signature = cookie.slice(separator + 1);

	try {
		const key = await importKey(resolved);
		const valid = await crypto.subtle.verify(
			'HMAC',
			key,
			urlSafeBase64ToBytes(signature),
			encoder.encode(payload)
		);
		if (!valid) {
			return null;
		}
		return JSON.parse(atob(fromUrlSafe(payload))) as T;
	} catch {
		return null;
	}
}

export async function decodeDatabaseSessionCookie(
	cookie: string | undefined | null,
	secret: string | undefined | null
): Promise<string | null> {
	const value = await verifySession<{ token?: unknown }>(cookie, secret);
	return value && typeof value.token === 'string' && value.token ? value.token : null;
}

export async function buildDatabaseSessionCookieHeader(
	token: string,
	url: URL,
	secret: string | undefined | null
): Promise<string> {
	if (!token) throw new Error('Refusing to issue an empty database session token');
	const value = await signSession({ token }, secret);
	const parts = [
		`session=${value}`,
		'Path=/',
		'HttpOnly',
		'SameSite=Lax',
		`Max-Age=${60 * 60 * 24 * 7}`
	];
	if (url.protocol === 'https:') parts.push('Secure');
	return parts.join('; ');
}
