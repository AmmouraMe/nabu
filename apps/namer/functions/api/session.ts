/**
 * GET /api/session — who the caller is and what they are allowed.
 *
 * The page asks on load so it can show the right header without guessing, and
 * so the sign-in offer disappears when the app has no Discord credentials
 * configured rather than leading somewhere that 503s.
 */

import { SESSION_COOKIE, readCookie, verifySession } from '../../src/auth';
import { ANON_HOURLY_LIMIT, SIGNED_IN_HOURLY_LIMIT } from '../../src/rate-limit';

export interface Env {
	SESSION_SECRET?: string;
	DISCORD_CLIENT_ID?: string;
	DISCORD_CLIENT_SECRET?: string;
}

export async function handleSession(request: Request, env: Env): Promise<Response> {
	const session = await verifySession(
		readCookie(request, SESSION_COOKIE),
		env.SESSION_SECRET ?? ''
	);

	const signInAvailable = Boolean(
		env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.SESSION_SECRET
	);

	return new Response(
		JSON.stringify({
			signedIn: Boolean(session),
			username: session?.username ?? null,
			limit: session ? SIGNED_IN_HOURLY_LIMIT : ANON_HOURLY_LIMIT,
			anonLimit: ANON_HOURLY_LIMIT,
			signedInLimit: SIGNED_IN_HOURLY_LIMIT,
			signInAvailable
		}),
		{ status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
	);
}

export const onRequest: (context: { request: Request; env: Env }) => Promise<Response> = ({
	request,
	env
}) => handleSession(request, env);
