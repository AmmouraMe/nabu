import { getAuthProviderCredentials } from '$lib/server/auth-provider-config';
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

function discordAvatarUrl(userId: string, avatar: unknown): string | null {
	if (typeof avatar !== 'string' || !avatar) return null;
	const extension = avatar.startsWith('a_') ? 'gif' : 'png';
	return `https://cdn.discordapp.com/avatars/${encodeURIComponent(userId)}/${encodeURIComponent(avatar)}.${extension}`;
}

export const GET: RequestHandler = async ({ url, cookies, platform, locals }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	if (!code) throw redirect(302, '/auth/login?error=no_code');
	const db = platform?.env?.DB;
	if (!db) {
		const browserState = await verifyOAuthState(
			'discord',
			state,
			cookies.get('oauth_state_discord'),
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
		'discord',
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
		const { clientId, clientSecret } = await getAuthProviderCredentials(platform, 'discord');
		if (!clientId || !clientSecret) throw redirect(302, '/auth/login?error=not_configured');
		const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				client_id: clientId,
				client_secret: clientSecret,
				code,
				grant_type: 'authorization_code',
				redirect_uri: `${externalOrigin(url)}/api/auth/discord/callback`
			})
		});
		if (!tokenResponse.ok) throw redirect(302, '/auth/login?error=token_exchange_failed');
		const accessToken = (await tokenResponse.json()).access_token;
		if (!accessToken) throw redirect(302, '/auth/login?error=no_access_token');
		const transaction = await consumeOAuthTransaction(
			db,
			'discord',
			state,
			cookies,
			platform.env.SESSION_SECRET,
			currentToken || undefined
		);
		if (!transaction) throw redirect(302, '/auth/login?error=invalid_state');
		const userResponse = await fetch('https://discord.com/api/users/@me', {
			headers: { Authorization: `Bearer ${accessToken}` }
		});
		if (!userResponse.ok) throw redirect(302, '/auth/login?error=user_fetch_failed');
		const discordUser = await userResponse.json();
		if (
			typeof discordUser.id !== 'string' ||
			!/^\d+$/.test(discordUser.id) ||
			typeof discordUser.username !== 'string' ||
			!discordUser.username
		)
			throw redirect(302, '/auth/login?error=user_fetch_failed');
		const displayName =
			typeof discordUser.global_name === 'string' && discordUser.global_name
				? discordUser.global_name
				: discordUser.username;
		const verifiedEmail =
			discordUser.verified === true && typeof discordUser.email === 'string'
				? discordUser.email.trim().toLowerCase() || null
				: null;
		const avatarUrl = discordAvatarUrl(discordUser.id, discordUser.avatar);
		const result = await reconcileOAuthAccount({
			db,
			provider: 'discord',
			providerAccountId: String(discordUser.id),
			legacyUserId: `discord_${discordUser.id}`,
			linkingUserId: transaction.intent === 'link' ? existingUser?.id : undefined,
			createUser: async (id) => {
				const providerLocalEmail = `${id}-${crypto.randomUUID()}@discord.invalid`;
				await db
					.prepare(
						`INSERT INTO users (id, email, name, profile_login, profile_avatar_url, created_at)
						 VALUES (?, CASE
							WHEN ? IS NOT NULL AND NOT EXISTS (
								SELECT 1 FROM users AS other WHERE lower(other.email) = lower(?)
							) THEN ? ELSE ? END, ?, ?, ?, CURRENT_TIMESTAMP)`
					)
					.bind(
						id,
						verifiedEmail,
						verifiedEmail,
						verifiedEmail,
						providerLocalEmail,
						displayName,
						discordUser.username,
						avatarUrl
					)
					.run();
			},
			updateUser: async (id, match) => {
				// Linking Discord into an account that already has an identity must not
				// rename it, replace its avatar, or move its email onto the Discord one.
				// The link itself is the whole change; `reconcileOAuthAccount` made it.
				if (match === 'link') return;
				await db
					.prepare(
						`UPDATE users SET name = ?, profile_login = ?, profile_avatar_url = ?,
						 email = CASE
							WHEN ? IS NOT NULL AND NOT EXISTS (
								SELECT 1 FROM users AS other
								WHERE lower(other.email) = lower(?) AND other.id <> ?
							) THEN ? ELSE email END,
						 updated_at = CURRENT_TIMESTAMP WHERE id = ?`
					)
					.bind(
						displayName,
						discordUser.username,
						avatarUrl,
						verifiedEmail,
						verifiedEmail,
						id,
						verifiedEmail,
						id
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
		console.error('Discord OAuth callback error');
		throw redirect(302, '/auth/login?error=oauth_failed');
	}
};
