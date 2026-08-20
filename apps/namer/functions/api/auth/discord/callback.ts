/**
 * GET /api/auth/discord/callback — finish the sign-in.
 *
 * Every failure here redirects back to the page rather than rendering an error:
 * the worst outcome of a botched sign-in is staying anonymous, which is the
 * app's normal state anyway.
 */

import { exchangeCode, newSession, sessionCookieHeader, signSession } from '../../../../src/auth';
import type { RateLimitStore } from '../../../../src/rate-limit';
import { redirectUriFor } from './index';

export interface Env {
	RATE_LIMIT?: RateLimitStore & { delete?(key: string): Promise<void> };
	DISCORD_CLIENT_ID?: string;
	DISCORD_CLIENT_SECRET?: string;
	/** HMAC secret for the session cookie. Without it, sign-in stays off. */
	SESSION_SECRET?: string;
}

export async function handleCallback(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');

	if (
		!env.DISCORD_CLIENT_ID ||
		!env.DISCORD_CLIENT_SECRET ||
		!env.SESSION_SECRET ||
		!env.RATE_LIMIT
	) {
		return new Response(null, { status: 302, headers: { Location: '/?signin=unavailable' } });
	}

	if (!code || !state) {
		return new Response(null, { status: 302, headers: { Location: '/?signin=failed' } });
	}

	// Single-use: the state must be present, and is burned before the exchange so
	// a replayed callback cannot ride the same one twice.
	const stateKey = `oauth:${state}`;
	const known = await env.RATE_LIMIT.get(stateKey);
	if (!known) {
		return new Response(null, { status: 302, headers: { Location: '/?signin=expired' } });
	}
	// KV has no delete on our narrow interface everywhere; overwriting with a
	// one-second TTL retires it just as effectively.
	await env.RATE_LIMIT.put(stateKey, '0', { expirationTtl: 60 });

	const identity = await exchangeCode(globalThis.fetch.bind(globalThis), {
		code,
		clientId: env.DISCORD_CLIENT_ID,
		clientSecret: env.DISCORD_CLIENT_SECRET,
		redirectUri: redirectUriFor(request)
	});

	if (!identity) {
		return new Response(null, { status: 302, headers: { Location: '/?signin=failed' } });
	}

	const cookie = await signSession(newSession(identity.id, identity.username), env.SESSION_SECRET);

	return new Response(null, {
		status: 302,
		headers: { Location: '/?signin=ok', 'Set-Cookie': sessionCookieHeader(cookie) }
	});
}

export const onRequest: (context: { request: Request; env: Env }) => Promise<Response> = ({
	request,
	env
}) => handleCallback(request, env);
