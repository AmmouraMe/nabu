import { error, isRedirect, redirect } from '@sveltejs/kit';
import { externalOrigin } from '$lib/server/origin';
import { exchangeCode, getGcpConfig, storeTokens } from '$lib/server/gcp-provision';
import type { RequestHandler } from './$types';

// GET - Google Cloud consent callback. Stores the refresh token, then returns
// the operator to the picker so they can choose which project to mint against.
export const GET: RequestHandler = async ({ url, platform, locals, cookies }) => {
	if (!locals.user?.isOwner && !locals.user?.isAdmin) {
		throw error(403, 'Admin access required');
	}

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const expectedState = cookies.get('gcp_oauth_state');
	cookies.delete('gcp_oauth_state', { path: '/' });

	if (url.searchParams.get('error')) {
		throw redirect(302, '/admin/ai-keys?gcp_error=denied');
	}
	if (!code) {
		throw redirect(302, '/admin/ai-keys?gcp_error=no_code');
	}
	if (!state || !expectedState || state !== expectedState) {
		throw redirect(302, '/admin/ai-keys?gcp_error=bad_state');
	}

	try {
		const config = await getGcpConfig(platform);
		if (!config) {
			throw redirect(302, '/admin/ai-keys?gcp_error=not_configured');
		}

		const redirectUri = `${externalOrigin(url)}/api/admin/provision/google/callback`;
		const { accessToken, refreshToken } = await exchangeCode(config, code, redirectUri);

		if (!refreshToken) {
			// Without offline access we could not re-mint later; make the operator retry.
			throw redirect(302, '/admin/ai-keys?gcp_error=no_refresh_token');
		}

		// Best-effort: record which account consented, for display in the UI.
		let account: string | undefined;
		try {
			const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
				headers: { Authorization: `Bearer ${accessToken}` }
			});
			if (res.ok) account = ((await res.json()) as { email?: string }).email;
		} catch {
			// non-fatal
		}

		await storeTokens(platform, {
			refreshToken,
			account,
			obtainedAt: new Date().toISOString()
		});

		throw redirect(302, '/admin/ai-keys?gcp=connected');
	} catch (err) {
		if (isRedirect(err)) throw err;
		console.error('Google Cloud provisioning callback failed:', err);
		throw redirect(302, '/admin/ai-keys?gcp_error=exchange_failed');
	}
};
