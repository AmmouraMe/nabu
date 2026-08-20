/**
 * Optional Discord sign-in, for a larger hourly allowance.
 *
 * The whole point of this app is that it needs no account, so this is strictly
 * an upgrade path: anonymous callers keep working exactly as before, and signing
 * in only raises the ceiling. Nothing about a name or a check changes.
 *
 * ── What is deliberately not stored ─────────────────────────────────────────
 * The Discord access token is used once, at the callback, to read the account
 * id — then discarded. It is never persisted and never put in a cookie. There is
 * no user table here at all: the session cookie carries the Discord id and an
 * expiry, signed, and that is the entire account model. A public toy that keeps
 * no third-party tokens cannot leak any.
 *
 * ── Why the cookie is signed rather than opaque ─────────────────────────────
 * A DB-backed session would be revocable, which is better, and is the direction
 * the main Nabu app is moving. Here the only thing a session buys is a higher
 * rate limit, so the worst case for a stolen cookie is somebody else's larger
 * quota. That does not justify a sessions table on an app whose selling point is
 * having no account. The signature is what stops a caller from simply writing
 * their own id into the cookie and minting quota.
 */

/** How long a sign-in lasts. Long enough to be useful, short enough to lapse. */
const SESSION_TTL_SECONDS = 30 * 24 * 3600;

/** CSRF state lives only as long as a redirect round-trip reasonably takes. */
export const STATE_TTL_SECONDS = 600;

export const SESSION_COOKIE = 'namer_session';
export const DISCORD_AUTHORIZE = 'https://discord.com/oauth2/authorize';
export const DISCORD_TOKEN = 'https://discord.com/api/oauth2/token';
export const DISCORD_ME = 'https://discord.com/api/users/@me';

export interface Session {
	/** Discord account id. The rate-limit key when present. */
	discordId: string;
	/** Display name, shown in the header. Never trusted for anything else. */
	username: string;
	/** Unix seconds. */
	expiresAt: number;
}

// ─── Encoding ─────────────────────────────────────────────────────────────────

/** URL-safe base64, so a value can sit in a cookie or a query string unescaped. */
export function b64url(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(value: string): Uint8Array {
	const padded = value.replace(/-/g, '+').replace(/_/g, '/');
	const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
	return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Cryptographically random, URL-safe. Used for the OAuth state parameter. */
export function randomToken(): string {
	return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

// ─── Signing ──────────────────────────────────────────────────────────────────

async function hmacKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign', 'verify']
	);
}

/** `<payload>.<signature>`, both URL-safe base64. */
export async function signSession(session: Session, secret: string): Promise<string> {
	const payload = b64url(new TextEncoder().encode(JSON.stringify(session)));
	const key = await hmacKey(secret);
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
	return `${payload}.${b64url(new Uint8Array(sig))}`;
}

/**
 * The session a cookie proves, or null.
 *
 * Null on every failure mode there is — wrong shape, bad signature, expired,
 * unparseable, missing secret. A caller that cannot tell these apart cannot
 * accidentally treat one as a valid session, and the only consequence of a null
 * here is the anonymous rate limit.
 */
export async function verifySession(
	cookie: string | null,
	secret: string
): Promise<Session | null> {
	if (!cookie || !secret) return null;

	const dot = cookie.indexOf('.');
	if (dot <= 0) return null;

	const payload = cookie.slice(0, dot);
	const signature = cookie.slice(dot + 1);

	let expected: Uint8Array;
	try {
		expected = fromB64url(signature);
	} catch {
		return null;
	}

	const key = await hmacKey(secret);
	// crypto.subtle.verify is constant-time, so this does not leak the signature
	// a byte at a time the way a string comparison would.
	const ok = await crypto.subtle
		// `expected as BufferSource`: TS types Uint8Array as generic over
		// ArrayBufferLike while BufferSource wants a concrete view. The value is
		// already the right thing at runtime.
		.verify('HMAC', key, expected as BufferSource, new TextEncoder().encode(payload))
		.catch(() => false);
	if (!ok) return null;

	let session: Session;
	try {
		session = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
	} catch {
		return null;
	}

	if (typeof session?.discordId !== 'string' || !session.discordId) return null;
	if (typeof session.expiresAt !== 'number' || session.expiresAt * 1000 < Date.now()) return null;

	return session;
}

export function newSession(discordId: string, username: string): Session {
	return {
		discordId,
		username,
		expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
	};
}

// ─── Cookies ──────────────────────────────────────────────────────────────────

/**
 * HttpOnly so script cannot read it, Secure so it never crosses plain HTTP, and
 * SameSite=Lax — which still arrives on the top-level redirect back from
 * Discord, where Strict would drop it and lose the sign-in.
 */
export function sessionCookieHeader(value: string, maxAge: number = SESSION_TTL_SECONDS): string {
	return `${SESSION_COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function clearCookieHeader(): string {
	return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

/** One named cookie out of a request's Cookie header. */
export function readCookie(request: Request, name: string): string | null {
	const header = request.headers.get('Cookie');
	if (!header) return null;

	for (const part of header.split(';')) {
		const eq = part.indexOf('=');
		if (eq === -1) continue;
		if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim() || null;
	}
	return null;
}

// ─── Discord ──────────────────────────────────────────────────────────────────

export function authorizeUrl(clientId: string, redirectUri: string, state: string): string {
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri,
		response_type: 'code',
		// The narrowest scope Discord offers that yields an account id. `email` is
		// not requested: nothing here has any use for it.
		scope: 'identify',
		state,
		prompt: 'none'
	});
	return `${DISCORD_AUTHORIZE}?${params}`;
}

export interface DiscordIdentity {
	id: string;
	username: string;
}

/**
 * Code → identity, in two calls, keeping neither token.
 *
 * Returns null rather than throwing on any failure: a botched sign-in should
 * land the user back on the page as an anonymous visitor, not on an error.
 */
export async function exchangeCode(
	fetchFn: typeof fetch,
	params: { code: string; clientId: string; clientSecret: string; redirectUri: string }
): Promise<DiscordIdentity | null> {
	try {
		const tokenResponse = await fetchFn(DISCORD_TOKEN, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				client_id: params.clientId,
				client_secret: params.clientSecret,
				grant_type: 'authorization_code',
				code: params.code,
				redirect_uri: params.redirectUri
			})
		});
		if (!tokenResponse.ok) return null;

		const token = (await tokenResponse.json()) as { access_token?: string };
		if (!token?.access_token) return null;

		const meResponse = await fetchFn(DISCORD_ME, {
			headers: { Authorization: `Bearer ${token.access_token}` }
		});
		if (!meResponse.ok) return null;

		const me = (await meResponse.json()) as { id?: string; username?: string };
		if (!me?.id) return null;

		// The token goes out of scope here and is never written anywhere.
		return { id: me.id, username: typeof me.username === 'string' ? me.username : 'you' };
	} catch {
		return null;
	}
}
