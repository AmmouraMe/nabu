/**
 * GET /api/auth/discord — start the sign-in.
 *
 * Mints a random state, parks it in KV for ten minutes, and redirects to
 * Discord. The state lives server-side rather than in a cookie so the callback
 * can consume it exactly once: a replayed callback finds nothing and is refused.
 */

import { STATE_TTL_SECONDS, authorizeUrl, randomToken } from '../../../../src/auth';
import type { RateLimitStore } from '../../../../src/rate-limit';

export interface Env {
	RATE_LIMIT?: RateLimitStore;
	DISCORD_CLIENT_ID?: string;
	DISCORD_CLIENT_SECRET?: string;
}

/** The callback URL, derived from the request so preview deploys work too. */
export function redirectUriFor(request: Request): string {
	return new URL('/api/auth/discord/callback', request.url).toString();
}

export async function handleStart(request: Request, env: Env): Promise<Response> {
	// Sign-in is optional, so an unconfigured app is not broken — it just has
	// nothing to offer here.
	if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.RATE_LIMIT) {
		return new Response('Discord sign-in is not configured.', { status: 503 });
	}

	const state = randomToken();
	await env.RATE_LIMIT.put(`oauth:${state}`, '1', { expirationTtl: STATE_TTL_SECONDS });

	return new Response(null, {
		status: 302,
		headers: { Location: authorizeUrl(env.DISCORD_CLIENT_ID, redirectUriFor(request), state) }
	});
}

export const onRequest: (context: { request: Request; env: Env }) => Promise<Response> = ({
	request,
	env
}) => handleStart(request, env);
