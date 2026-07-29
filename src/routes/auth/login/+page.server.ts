import { redirect } from '@sveltejs/kit';
import { configuredProviders } from '$lib/server/oauth-config';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, platform }) => {
	// If user is already logged in
	if (locals.user) {
		// If they were redirected here with unauthorized error, it means they lack permissions
		// This can happen if they're logged in but not the owner trying to access /admin
		const errorCode = url.searchParams.get('error');
		if (errorCode === 'unauthorized') {
			// They're logged in but tried to access a page they don't have permission for
			// This is actually a "forbidden" scenario, not "unauthorized"
			// Redirect to home with a more accurate message
			throw redirect(302, '/?error=forbidden');
		}

		// Otherwise, redirect logged-in users to home
		throw redirect(302, '/');
	}

	// Dev-only virtual login: available under `vite dev` (import.meta.env.DEV),
	// or on a deployed dev/staging Worker that opts in with ALLOW_DEV_LOGIN=true.
	const devLoginEnabled = import.meta.env.DEV || platform?.env?.ALLOW_DEV_LOGIN === 'true';

	return {
		configuredProviders: await configuredProviders(platform),
		devLoginEnabled
	};
};
