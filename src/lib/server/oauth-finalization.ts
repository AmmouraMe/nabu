import { createSession, replaceSession } from '$lib/utils/db';
import { buildDatabaseSessionCookieHeader } from './session';
import { resolveOwnerStatus } from './auth-identity';
import { externalOrigin } from './origin';
import type { OAuthProvider } from './oauth-state';
import type { D1Database } from '@cloudflare/workers-types';

export async function finalizeOAuthLogin(options: {
	db: D1Database;
	platform: App.Platform;
	url: URL;
	userId: string;
	currentSessionToken?: string;
	linkedProvider?: OAuthProvider;
}): Promise<Response> {
	const user = await options.db
		.prepare(
			'SELECT id, email, name, github_login, github_avatar_url, is_admin FROM users WHERE id = ?'
		)
		.bind(options.userId)
		.first<{
			id: string;
			email: string;
			name: string | null;
			github_login: string | null;
			github_avatar_url: string | null;
			is_admin: number;
		}>();
	if (!user) throw new Error('OAuth user disappeared before session finalization');
	const isOwner = await resolveOwnerStatus(options.platform, user);
	const session = options.currentSessionToken
		? await replaceSession(options.db, user.id, options.currentSessionToken, 7)
		: await createSession(options.db, user.id, 7);
	if (isOwner && options.platform.env.KV) {
		const marker = await options.platform.env.KV.get('admin_first_login_completed');
		if (!marker) await options.platform.env.KV.put('admin_first_login_completed', 'true');
	}
	const destination = options.linkedProvider
		? `/profile?linked=${options.linkedProvider}`
		: isOwner || user.is_admin === 1
			? '/admin'
			: '/';
	const origin = externalOrigin(options.url);
	return new Response(null, {
		status: 302,
		headers: {
			Location: new URL(destination, origin).toString(),
			'Set-Cookie': await buildDatabaseSessionCookieHeader(
				session.token,
				new URL(origin),
				options.platform.env.SESSION_SECRET
			)
		}
	});
}
