import { getAuthProviderCredentials } from '$lib/server/auth-provider-config';
import { resolveOwnerStatus } from '$lib/server/auth-identity';
import { reconcileOAuthAccount } from '$lib/server/oauth-account';
import { finalizeOAuthLogin } from '$lib/server/oauth-finalization';
import {
	consumeOAuthTransaction,
	verifyOAuthState,
	verifyOAuthTransaction
} from '$lib/server/oauth-state';
import { decodeDatabaseSessionCookie } from '$lib/server/session';
import { externalOrigin } from '$lib/server/origin';
import { isRedirect, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies, platform, locals }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	if (!code) throw redirect(302, '/auth/login?error=no_code');
	const db = platform?.env?.DB;
	if (!db) {
		const browserState = await verifyOAuthState(
			'github',
			state,
			cookies.get('oauth_state_github'),
			platform?.env?.SESSION_SECRET
		);
		throw redirect(
			302,
			browserState ? '/auth/login?error=oauth_failed' : '/auth/login?error=invalid_state'
		);
	}
	const currentToken = await decodeDatabaseSessionCookie(
		cookies.get('session'),
		platform.env.SESSION_SECRET
	);
	const pending = await verifyOAuthTransaction(
		db,
		'github',
		state,
		cookies,
		platform.env.SESSION_SECRET,
		currentToken || undefined
	);
	if (!pending) throw redirect(302, '/auth/login?error=invalid_state');
	const existingUser = pending.intent === 'link' ? locals.user : null;
	if (pending.intent === 'link' && existingUser?.id !== pending.userId)
		throw redirect(302, '/auth/login?error=invalid_state');

	try {
		const { clientId, clientSecret } = await getAuthProviderCredentials(platform, 'github');
		if (!clientId || !clientSecret) throw redirect(302, '/auth/login?error=not_configured');
		const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify({
				client_id: clientId,
				client_secret: clientSecret,
				code,
				redirect_uri: `${externalOrigin(url)}/api/auth/github/callback`
			})
		});
		if (!tokenResponse.ok) throw redirect(302, '/auth/login?error=token_exchange_failed');
		const accessToken = (await tokenResponse.json()).access_token;
		if (!accessToken) throw redirect(302, '/auth/login?error=no_access_token');
		const transaction = await consumeOAuthTransaction(
			db,
			'github',
			state,
			cookies,
			platform.env.SESSION_SECRET,
			currentToken || undefined
		);
		if (!transaction) throw redirect(302, '/auth/login?error=invalid_state');
		const userResponse = await fetch('https://api.github.com/user', {
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: 'application/vnd.github.v3+json',
				'User-Agent': 'Nabu'
			}
		});
		if (!userResponse.ok) throw redirect(302, '/auth/login?error=user_fetch_failed');
		const githubUser = await userResponse.json();
		const providerAccountId = String(githubUser.id);
		const result = await reconcileOAuthAccount({
			db,
			provider: 'github',
			providerAccountId,
			legacyUserId: providerAccountId,
			email: githubUser.email,
			linkingUserId: transaction.intent === 'link' ? existingUser?.id : undefined,
			createUser: async (id) => {
				const isOwner = await resolveOwnerStatus(platform, { id, github_login: githubUser.login });
				await db
					.prepare(
						`INSERT INTO users (id, email, name, github_login, github_avatar_url, is_admin, created_at)
					VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
					)
					.bind(
						id,
						githubUser.email || `${githubUser.login}@github.local`,
						githubUser.name,
						githubUser.login,
						githubUser.avatar_url,
						isOwner ? 1 : 0
					)
					.run();
			},
			updateUser: async (id, match) => {
				await db
					.prepare(
						`UPDATE users SET github_login = ?, github_avatar_url = ?,
					${match === 'legacy' ? 'name = ?,' : ''} updated_at = CURRENT_TIMESTAMP WHERE id = ?`
					)
					.bind(
						...(match === 'legacy'
							? [githubUser.login, githubUser.avatar_url, githubUser.name, id]
							: [githubUser.login, githubUser.avatar_url, id])
					)
					.run();
			}
		});
		return finalizeOAuthLogin({
			db,
			platform,
			url,
			userId: result.userId,
			currentSessionToken: result.linkedProvider ? currentToken || undefined : undefined,
			linkedProvider: result.linkedProvider
		});
	} catch (error) {
		if (isRedirect(error)) throw error;
		console.error('GitHub OAuth callback error');
		throw redirect(302, '/auth/login?error=oauth_failed');
	}
};
