import { error, redirect } from '@sveltejs/kit';
import { externalOrigin } from '$lib/server/origin';
import { getAuthProviderCredentials } from '$lib/server/auth-provider-config';
import {
	createOAuthTransaction,
	oauthStateCookieName,
	oauthStateCookieOptions
} from '$lib/server/oauth-state';
import { decodeDatabaseSessionCookie } from '$lib/server/session';
import type { RequestHandler } from './$types';

// GET - Redirect to GitHub OAuth
export const GET: RequestHandler = async ({ platform, url, cookies, locals }) => {
	const { clientId } = await getAuthProviderCredentials(platform, 'github');

	// Check if GitHub OAuth is configured
	if (!clientId) {
		throw redirect(302, '/setup?error=oauth_not_configured');
	}

	const linking = url.searchParams.get('mode') === 'link';
	if (linking && !locals.user) throw redirect(302, '/auth/login?error=authentication_required');
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'OAuth state storage is unavailable');
	const token = linking
		? await decodeDatabaseSessionCookie(cookies.get('session'), platform?.env?.SESSION_SECRET)
		: undefined;
	if (linking && !token) throw redirect(302, '/auth/login?error=authentication_required');
	const { state, cookie } = await createOAuthTransaction(
		db,
		'github',
		linking ? 'link' : 'login',
		linking ? locals.user?.id : undefined,
		token || undefined,
		platform?.env?.SESSION_SECRET
	);
	cookies.set(oauthStateCookieName('github'), cookie, oauthStateCookieOptions('github', url));

	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: `${externalOrigin(url)}/api/auth/github/callback`,
		scope: 'read:user user:email',
		state
	});

	throw redirect(302, `https://github.com/login/oauth/authorize?${params}`);
};
