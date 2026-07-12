import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Helper to check if an OAuth provider is configured
async function isProviderConfigured(
	platform: App.Platform | undefined,
	provider: 'github' | 'discord'
): Promise<boolean> {
	if (provider === 'github') {
		// Check env vars first
		if (platform?.env?.GITHUB_CLIENT_ID && platform?.env?.GITHUB_CLIENT_SECRET) {
			return true;
		}
		// Check KV storage
		if (platform?.env?.KV) {
			try {
				const stored = await platform.env.KV.get('auth_config:github');
				if (stored) {
					const config = JSON.parse(stored);
					return !!(config.clientId && config.clientSecret);
				}
			} catch {
				// Ignore errors
			}
		}
	} else if (provider === 'discord') {
		// Check env vars first
		if (platform?.env?.DISCORD_CLIENT_ID && platform?.env?.DISCORD_CLIENT_SECRET) {
			return true;
		}
		// Check KV storage
		if (platform?.env?.KV) {
			try {
				const stored = await platform.env.KV.get('auth_config:discord');
				if (stored) {
					const config = JSON.parse(stored);
					return !!(config.clientId && config.clientSecret);
				}
			} catch {
				// Ignore errors
			}
		}
	}
	return false;
}

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

	// Check which OAuth providers are configured
	const [githubConfigured, discordConfigured] = await Promise.all([
		isProviderConfigured(platform, 'github'),
		isProviderConfigured(platform, 'discord')
	]);

	// Dev-only virtual login: available under `vite dev` (import.meta.env.DEV),
	// or on a deployed dev/staging Worker that opts in with ALLOW_DEV_LOGIN=true.
	const devLoginEnabled = import.meta.env.DEV || platform?.env?.ALLOW_DEV_LOGIN === 'true';

	return {
		configuredProviders: {
			github: githubConfigured,
			discord: discordConfigured
		},
		devLoginEnabled
	};
};
