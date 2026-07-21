import { error, redirect } from '@sveltejs/kit';
import { externalOrigin, isSecureRequest } from '$lib/server/origin';
import { GCP_SCOPE, getGcpConfig } from '$lib/server/gcp-provision';
import type { RequestHandler } from './$types';

// GET - Begin the Google Cloud consent flow for API-key provisioning.
export const GET: RequestHandler = async ({ url, platform, locals, cookies }) => {
	if (!locals.user?.isOwner && !locals.user?.isAdmin) {
		throw error(403, 'Admin access required');
	}

	const config = await getGcpConfig(platform);
	if (!config) {
		throw redirect(302, '/admin/ai-keys?gcp_error=not_configured');
	}

	// CSRF: hand the state to the browser as a cookie and compare on return.
	const state = crypto.randomUUID();
	cookies.set('gcp_oauth_state', state, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: isSecureRequest(url),
		maxAge: 600
	});

	const params = new URLSearchParams({
		client_id: config.clientId,
		redirect_uri: `${externalOrigin(url)}/api/admin/provision/google/callback`,
		response_type: 'code',
		scope: GCP_SCOPE,
		// offline + consent so we actually receive a refresh token; Google omits
		// it on repeat authorisations otherwise.
		access_type: 'offline',
		prompt: 'consent',
		state
	});

	throw redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
};
