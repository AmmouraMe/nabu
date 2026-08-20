/**
 * Optional Discord sign-in for apps/namer.
 *
 * Sign-in only raises a rate limit here, so the security question is narrow but
 * real: can a caller mint themselves a session without going through Discord?
 * Most of what follows is about that — tampered payloads, swapped signatures,
 * expired cookies, and replayed OAuth state.
 */

import { describe, it, expect, vi } from 'vitest';
import {
	SESSION_COOKIE,
	authorizeUrl,
	b64url,
	clearCookieHeader,
	exchangeCode,
	newSession,
	randomToken,
	readCookie,
	sessionCookieHeader,
	signSession,
	verifySession
} from '../../apps/namer/src/auth';
import {
	handleStart,
	onRequest as discordStart,
	redirectUriFor
} from '../../apps/namer/functions/api/auth/discord/index';
import {
	handleCallback,
	onRequest as discordCallback
} from '../../apps/namer/functions/api/auth/discord/callback';
import { handleSession, onRequest as sessionRoute } from '../../apps/namer/functions/api/session';
import { onRequest as logoutRoute } from '../../apps/namer/functions/api/auth/logout';
import {
	ANON_HOURLY_LIMIT,
	SIGNED_IN_HOURLY_LIMIT,
	rateLimitIdentity
} from '../../apps/namer/src/rate-limit';

const SECRET = 'test-secret-value';

function store(initial: Record<string, string> = {}) {
	const map = new Map(Object.entries(initial));
	return {
		map,
		get: vi.fn(async (k: string) => map.get(k) ?? null),
		put: vi.fn(async (k: string, v: string) => void map.set(k, v))
	};
}

/**
 * `Cookie` is a forbidden header name, so the Request constructor silently drops
 * it in this environment — set it afterwards instead. Only a test concern: a
 * real request arriving at a Worker carries the header normally.
 */
function withRawCookie(header: string): Request {
	const request = new Request('https://namer.test/');
	request.headers.set('Cookie', header);
	return request;
}

function withCookie(value: string): Request {
	return withRawCookie(`${SESSION_COOKIE}=${value}`);
}

describe('b64url', () => {
	it('produces URL-safe output with no padding', () => {
		const encoded = b64url(new Uint8Array([251, 255, 190, 0]));
		expect(encoded).not.toMatch(/[+/=]/);
	});
});

describe('randomToken', () => {
	it('is URL-safe and does not repeat', () => {
		const a = randomToken();
		const b = randomToken();
		expect(a).not.toBe(b);
		expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(a.length).toBeGreaterThan(20);
	});
});

describe('session cookies', () => {
	it('round-trips a session it signed', async () => {
		const cookie = await signSession(newSession('123', 'davis'), SECRET);
		const session = await verifySession(cookie, SECRET);

		expect(session?.discordId).toBe('123');
		expect(session?.username).toBe('davis');
	});

	it('refuses a payload edited after signing', async () => {
		const cookie = await signSession(newSession('123', 'davis'), SECRET);
		const [, signature] = cookie.split('.');
		// Someone rewriting their own id into the cookie to mint quota.
		const forged = b64url(
			new TextEncoder().encode(
				JSON.stringify({ discordId: '999', username: 'davis', expiresAt: 9999999999 })
			)
		);
		expect(await verifySession(`${forged}.${signature}`, SECRET)).toBeNull();
	});

	it('refuses a signature made with a different secret', async () => {
		const cookie = await signSession(newSession('123', 'davis'), 'other-secret');
		expect(await verifySession(cookie, SECRET)).toBeNull();
	});

	it('refuses an expired session', async () => {
		const expired = { discordId: '123', username: 'davis', expiresAt: 1_000 };
		const cookie = await signSession(expired, SECRET);
		expect(await verifySession(cookie, SECRET)).toBeNull();
	});

	it('refuses anything malformed rather than throwing', async () => {
		expect(await verifySession(null, SECRET)).toBeNull();
		expect(await verifySession('', SECRET)).toBeNull();
		expect(await verifySession('no-dot', SECRET)).toBeNull();
		expect(await verifySession('.sig', SECRET)).toBeNull();
		expect(await verifySession('a.!!!not-base64!!!', SECRET)).toBeNull();
	});

	it('refuses a validly signed payload that is not a session', async () => {
		const payload = b64url(new TextEncoder().encode(JSON.stringify({ hello: 'world' })));
		const key = await crypto.subtle.importKey(
			'raw',
			new TextEncoder().encode(SECRET),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		);
		const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
		expect(await verifySession(`${payload}.${b64url(new Uint8Array(sig))}`, SECRET)).toBeNull();
	});

	it('refuses everything when no secret is configured', async () => {
		const cookie = await signSession(newSession('123', 'davis'), SECRET);
		expect(await verifySession(cookie, '')).toBeNull();
	});
});

describe('cookie headers', () => {
	it('sets HttpOnly, Secure and SameSite=Lax', () => {
		const header = sessionCookieHeader('abc');
		expect(header).toContain('HttpOnly');
		expect(header).toContain('Secure');
		// Lax, not Strict: Strict is dropped on the redirect back from Discord.
		expect(header).toContain('SameSite=Lax');
	});

	it('clears by expiring immediately', () => {
		expect(clearCookieHeader()).toContain('Max-Age=0');
	});
});

describe('readCookie', () => {
	it('finds a named cookie among others', () => {
		const request = withRawCookie(`other=1; ${SESSION_COOKIE}=wanted; last=2`);
		expect(readCookie(request, SESSION_COOKIE)).toBe('wanted');
	});

	it('returns null when absent, empty, or unparseable', () => {
		expect(readCookie(new Request('https://namer.test/'), SESSION_COOKIE)).toBeNull();
		expect(readCookie(withCookie(''), SESSION_COOKIE)).toBeNull();
		expect(readCookie(withRawCookie('junk'), SESSION_COOKIE)).toBeNull();
	});
});

describe('authorizeUrl', () => {
	it('asks only for identify, and carries the state', () => {
		const url = new URL(authorizeUrl('client-1', 'https://namer.test/cb', 'state-1'));
		expect(url.searchParams.get('scope')).toBe('identify');
		expect(url.searchParams.get('state')).toBe('state-1');
		expect(url.searchParams.get('client_id')).toBe('client-1');
		expect(url.searchParams.get('response_type')).toBe('code');
		// No email scope: nothing here has any use for it.
		expect(url.searchParams.get('scope')).not.toContain('email');
	});
});

describe('exchangeCode', () => {
	const params = {
		code: 'c',
		clientId: 'id',
		clientSecret: 'secret',
		redirectUri: 'https://namer.test/cb'
	};

	function fetchFor(token: unknown, me: unknown, tokenOk = true, meOk = true) {
		return vi.fn(async (input: RequestInfo | URL) =>
			String(input).includes('token')
				? new Response(JSON.stringify(token), { status: tokenOk ? 200 : 400 })
				: new Response(JSON.stringify(me), { status: meOk ? 200 : 401 })
		);
	}

	it('returns the identity, and never the token', async () => {
		const identity = await exchangeCode(
			fetchFor({ access_token: 't' }, { id: '42', username: 'davis' }) as never,
			params
		);
		expect(identity).toEqual({ id: '42', username: 'davis' });
		expect(JSON.stringify(identity)).not.toContain('t');
	});

	it('falls back to a placeholder username', async () => {
		const identity = await exchangeCode(
			fetchFor({ access_token: 't' }, { id: '42' }) as never,
			params
		);
		expect(identity).toEqual({ id: '42', username: 'you' });
	});

	it('returns null on every failure rather than throwing', async () => {
		expect(await exchangeCode(fetchFor({}, {}, false) as never, params)).toBeNull();
		expect(await exchangeCode(fetchFor({}, {}) as never, params)).toBeNull();
		expect(
			await exchangeCode(fetchFor({ access_token: 't' }, {}, true, false) as never, params)
		).toBeNull();
		expect(await exchangeCode(fetchFor({ access_token: 't' }, {}) as never, params)).toBeNull();
		const throwing = vi.fn(async () => {
			throw new Error('network');
		});
		expect(await exchangeCode(throwing as never, params)).toBeNull();
	});
});

describe('rateLimitIdentity', () => {
	const request = new Request('https://namer.test/', {
		headers: { 'CF-Connecting-IP': '203.0.113.7' }
	});

	it('keys an anonymous caller by IP, at the smaller limit', () => {
		expect(rateLimitIdentity(request)).toEqual({
			key: 'ip:203.0.113.7',
			limit: ANON_HOURLY_LIMIT
		});
	});

	it('keys a signed-in caller by account, at the larger limit', () => {
		expect(rateLimitIdentity(request, '42')).toEqual({
			key: 'u:42',
			limit: SIGNED_IN_HOURLY_LIMIT
		});
	});

	it('keeps account keys in a different space from IP keys', () => {
		// An account id that looks like an address must not collide with one.
		expect(rateLimitIdentity(request, '203.0.113.7').key).not.toBe(rateLimitIdentity(request).key);
	});
});

describe('GET /api/auth/discord', () => {
	const env = { RATE_LIMIT: store(), DISCORD_CLIENT_ID: 'id', DISCORD_CLIENT_SECRET: 'sec' };

	it('parks a single-use state and redirects to Discord', async () => {
		const kv = store();
		const response = await handleStart(new Request('https://namer.test/api/auth/discord'), {
			...env,
			RATE_LIMIT: kv
		});

		expect(response.status).toBe(302);
		const location = new URL(response.headers.get('Location')!);
		expect(location.host).toBe('discord.com');

		const state = location.searchParams.get('state')!;
		expect(kv.map.get(`oauth:${state}`)).toBe('1');
	});

	it('503s when Discord is not configured, rather than redirecting nowhere', async () => {
		expect((await handleStart(new Request('https://namer.test/api/auth/discord'), {})).status).toBe(
			503
		);
	});

	it('derives the callback from the request, so preview deploys work', () => {
		expect(redirectUriFor(new Request('https://preview.example/api/auth/discord'))).toBe(
			'https://preview.example/api/auth/discord/callback'
		);
	});
});

describe('GET /api/auth/discord/callback', () => {
	function env(kv = store({ 'oauth:s1': '1' })) {
		return {
			RATE_LIMIT: kv,
			DISCORD_CLIENT_ID: 'id',
			DISCORD_CLIENT_SECRET: 'sec',
			SESSION_SECRET: SECRET
		};
	}

	function callback(query: string) {
		return new Request(`https://namer.test/api/auth/discord/callback${query}`);
	}

	it('sets a signed session cookie on success', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) =>
				String(input).includes('token')
					? new Response(JSON.stringify({ access_token: 't' }), { status: 200 })
					: new Response(JSON.stringify({ id: '42', username: 'davis' }), { status: 200 })
			)
		);

		const response = await handleCallback(callback('?code=c&state=s1'), env());
		expect(response.status).toBe(302);
		expect(response.headers.get('Location')).toBe('/?signin=ok');

		const setCookie = response.headers.get('Set-Cookie')!;
		const value = setCookie.slice(setCookie.indexOf('=') + 1, setCookie.indexOf(';'));
		expect((await verifySession(value, SECRET))?.discordId).toBe('42');
		vi.unstubAllGlobals();
	});

	it('burns the state, so a replayed callback is refused', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) =>
				String(input).includes('token')
					? new Response(JSON.stringify({ access_token: 't' }), { status: 200 })
					: new Response(JSON.stringify({ id: '42', username: 'davis' }), { status: 200 })
			)
		);

		const kv = store({ 'oauth:s1': '1' });
		await handleCallback(callback('?code=c&state=s1'), env(kv));
		// Retired, not left usable.
		expect(kv.map.get('oauth:s1')).toBe('0');
		vi.unstubAllGlobals();
	});

	it('refuses an unknown state', async () => {
		const response = await handleCallback(callback('?code=c&state=never-issued'), env(store()));
		expect(response.headers.get('Location')).toBe('/?signin=expired');
		expect(response.headers.get('Set-Cookie')).toBeNull();
	});

	it('refuses a callback missing code or state', async () => {
		expect((await handleCallback(callback('?code=c'), env())).headers.get('Location')).toBe(
			'/?signin=failed'
		);
		expect((await handleCallback(callback('?state=s1'), env())).headers.get('Location')).toBe(
			'/?signin=failed'
		);
	});

	it('reports unavailable when the app is not configured', async () => {
		const response = await handleCallback(callback('?code=c&state=s1'), {});
		expect(response.headers.get('Location')).toBe('/?signin=unavailable');
	});

	it('sets no cookie when the Discord exchange fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 400 }))
		);
		const response = await handleCallback(callback('?code=c&state=s1'), env());

		expect(response.headers.get('Location')).toBe('/?signin=failed');
		expect(response.headers.get('Set-Cookie')).toBeNull();
		vi.unstubAllGlobals();
	});
});

describe('GET /api/session', () => {
	it('reports an anonymous caller and the offer', async () => {
		const response = await handleSession(new Request('https://namer.test/api/session'), {
			SESSION_SECRET: SECRET,
			DISCORD_CLIENT_ID: 'id',
			DISCORD_CLIENT_SECRET: 'sec'
		});
		const body = await response.json();

		expect(body.signedIn).toBe(false);
		expect(body.limit).toBe(ANON_HOURLY_LIMIT);
		expect(body.signedInLimit).toBe(SIGNED_IN_HOURLY_LIMIT);
		expect(body.signInAvailable).toBe(true);
	});

	it('reports a signed-in caller and their larger limit', async () => {
		const cookie = await signSession(newSession('42', 'davis'), SECRET);
		const response = await handleSession(withCookie(cookie), {
			SESSION_SECRET: SECRET,
			DISCORD_CLIENT_ID: 'id',
			DISCORD_CLIENT_SECRET: 'sec'
		});
		const body = await response.json();

		expect(body.signedIn).toBe(true);
		expect(body.username).toBe('davis');
		expect(body.limit).toBe(SIGNED_IN_HOURLY_LIMIT);
	});

	it('hides the offer when Discord is not configured', async () => {
		const response = await handleSession(new Request('https://namer.test/api/session'), {});
		expect((await response.json()).signInAvailable).toBe(false);
	});
});

describe('a session payload that parses but is not a session', () => {
	async function signRaw(value: unknown): Promise<string> {
		const payload = b64url(new TextEncoder().encode(JSON.stringify(value)));
		const key = await crypto.subtle.importKey(
			'raw',
			new TextEncoder().encode(SECRET),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		);
		const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
		return `${payload}.${b64url(new Uint8Array(sig))}`;
	}

	it('refuses a blank or non-string id even when correctly signed', async () => {
		expect(
			await verifySession(await signRaw({ discordId: '', expiresAt: 9e9 }), SECRET)
		).toBeNull();
		expect(await verifySession(await signRaw({ discordId: 7, expiresAt: 9e9 }), SECRET)).toBeNull();
	});

	it('refuses a correctly signed payload that is not JSON at all', async () => {
		const payload = b64url(new TextEncoder().encode('not json'));
		const key = await crypto.subtle.importKey(
			'raw',
			new TextEncoder().encode(SECRET),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		);
		const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
		expect(await verifySession(`${payload}.${b64url(new Uint8Array(sig))}`, SECRET)).toBeNull();
	});

	it('refuses a non-numeric expiry even when correctly signed', async () => {
		expect(
			await verifySession(await signRaw({ discordId: '1', expiresAt: 'soon' }), SECRET)
		).toBeNull();
	});
});

describe('route wrappers', () => {
	it('/api/auth/discord redirects', async () => {
		const response = await discordStart({
			request: new Request('https://namer.test/api/auth/discord'),
			env: { RATE_LIMIT: store(), DISCORD_CLIENT_ID: 'id', DISCORD_CLIENT_SECRET: 'sec' }
		});
		expect(response.status).toBe(302);
	});

	it('/api/auth/discord/callback redirects', async () => {
		const response = await discordCallback({
			request: new Request('https://namer.test/api/auth/discord/callback'),
			env: {}
		});
		expect(response.status).toBe(302);
	});

	it('/api/session answers', async () => {
		const response = await sessionRoute({
			request: new Request('https://namer.test/api/session'),
			env: {}
		});
		expect(response.status).toBe(200);
	});

	it('/api/auth/logout clears the cookie on POST and 405s otherwise', async () => {
		const post = logoutRoute({
			request: new Request('https://namer.test/api/auth/logout', { method: 'POST' })
		});
		expect(post.status).toBe(200);
		expect(post.headers.get('Set-Cookie')).toContain('Max-Age=0');

		const get = logoutRoute({ request: new Request('https://namer.test/api/auth/logout') });
		expect(get.status).toBe(405);
		expect(get.headers.get('Allow')).toBe('POST');
	});
});
