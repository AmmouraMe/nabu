import { hashSessionToken } from '$lib/utils/db';
import { signSession, verifySession } from './session';
import type { D1Database } from '@cloudflare/workers-types';

export type OAuthProvider = 'github' | 'discord';
export type OAuthIntent = 'login' | 'link';
export interface OAuthStatePayload {
	provider: OAuthProvider;
	state: string;
	intent: OAuthIntent;
	userId?: string;
	issuedAt: number;
}

const MAX_AGE_SECONDS = 10 * 60;

export function oauthStateCookieName(provider: OAuthProvider): string {
	return `oauth_state_${provider}`;
}
export function oauthStateCookiePath(provider: OAuthProvider): string {
	return `/api/auth/${provider}/callback`;
}
export const oauthStateCookieOptions = (provider: OAuthProvider, url: URL) => ({
	path: oauthStateCookiePath(provider),
	httpOnly: true,
	sameSite: 'lax' as const,
	secure: url.protocol === 'https:',
	maxAge: MAX_AGE_SECONDS
});

function opaqueState(intent: OAuthIntent): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return `${intent}:${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

export async function createOAuthTransaction(
	db: D1Database,
	provider: OAuthProvider,
	intent: OAuthIntent,
	userId: string | undefined,
	boundSessionToken: string | undefined,
	secret?: string | null
): Promise<{ state: string; cookie: string }> {
	if (intent === 'link' && (!userId || !boundSessionToken)) {
		throw new Error('OAuth link transactions require an authenticated user and session');
	}
	const state = opaqueState(intent);
	const payload: OAuthStatePayload = {
		provider,
		state,
		intent,
		issuedAt: Date.now(),
		...(userId ? { userId } : {})
	};
	const stateId = await hashSessionToken(state);
	const sessionId = boundSessionToken ? await hashSessionToken(boundSessionToken) : null;
	await db
		.prepare(
			`INSERT INTO oauth_transactions (id, provider, intent, user_id, session_id, expires_at)
			VALUES (?, ?, ?, ?, ?, ?)`
		)
		.bind(
			stateId,
			provider,
			intent,
			intent === 'link' ? userId : null,
			intent === 'link' ? sessionId : null,
			new Date(Date.now() + MAX_AGE_SECONDS * 1000).toISOString()
		)
		.run();
	return { state, cookie: await signSession(payload, secret) };
}

export async function verifyOAuthState(
	provider: OAuthProvider,
	state: string | null,
	cookie: string | undefined,
	secret?: string | null
): Promise<OAuthStatePayload | null> {
	if (!state) return null;
	const payload = await verifySession<OAuthStatePayload>(cookie, secret);
	if (
		!payload ||
		payload.provider !== provider ||
		payload.state !== state ||
		(payload.intent !== 'login' && payload.intent !== 'link') ||
		typeof payload.issuedAt !== 'number' ||
		Date.now() - payload.issuedAt > MAX_AGE_SECONDS * 1000 ||
		payload.issuedAt > Date.now() + 60_000 ||
		(payload.intent === 'link' && !payload.userId)
	)
		return null;
	return payload;
}

interface OAuthCookies {
	get(name: string): string | undefined;
	delete(name: string, options: { path: string }): void;
}

async function validateBinding(
	payload: OAuthStatePayload,
	stored: { intent: OAuthIntent; user_id: string | null; session_id: string | null } | null,
	boundSessionToken?: string
): Promise<OAuthStatePayload | null> {
	if (!stored || stored.intent !== payload.intent) return null;
	if (payload.intent === 'login')
		return stored.user_id === null && stored.session_id === null ? payload : null;
	if (!payload.userId || !boundSessionToken) return null;
	return stored.user_id === payload.userId &&
		stored.session_id === (await hashSessionToken(boundSessionToken))
		? payload
		: null;
}

export async function verifyOAuthTransaction(
	db: D1Database,
	provider: OAuthProvider,
	state: string | null,
	cookies: OAuthCookies,
	secret?: string | null,
	boundSessionToken?: string
): Promise<OAuthStatePayload | null> {
	const payload = await verifyOAuthState(
		provider,
		state,
		cookies.get(oauthStateCookieName(provider)),
		secret
	);
	if (!payload) return null;
	const stored = await db
		.prepare(
			`SELECT intent, user_id, session_id FROM oauth_transactions
		WHERE id = ? AND provider = ? AND consumed_at IS NULL AND datetime(expires_at) > CURRENT_TIMESTAMP`
		)
		.bind(await hashSessionToken(payload.state), provider)
		.first<{ intent: OAuthIntent; user_id: string | null; session_id: string | null }>();
	return validateBinding(payload, stored, boundSessionToken);
}

export async function consumeOAuthTransaction(
	db: D1Database,
	provider: OAuthProvider,
	state: string | null,
	cookies: OAuthCookies,
	secret?: string | null,
	boundSessionToken?: string
): Promise<OAuthStatePayload | null> {
	const payload = await verifyOAuthState(
		provider,
		state,
		cookies.get(oauthStateCookieName(provider)),
		secret
	);
	if (!payload) return null;
	const stored = await db
		.prepare(
			`UPDATE oauth_transactions SET consumed_at = CURRENT_TIMESTAMP
		WHERE id = ? AND provider = ? AND consumed_at IS NULL AND datetime(expires_at) > CURRENT_TIMESTAMP
		RETURNING intent, user_id, session_id`
		)
		.bind(await hashSessionToken(payload.state), provider)
		.first<{ intent: OAuthIntent; user_id: string | null; session_id: string | null }>();
	cookies.delete(oauthStateCookieName(provider), { path: oauthStateCookiePath(provider) });
	return validateBinding(payload, stored, boundSessionToken);
}
