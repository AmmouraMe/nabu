/**
 * Which OAuth providers are usable right now.
 *
 * Lifted out of `auth/login/+page.server.ts` so the signup page can ask the same
 * question and get the same answer. It used to be private to the login page, which
 * is why signup offered a hardcoded "Continue with Google" button — a provider this
 * app has no login route for — while hiding Discord, which it does.
 *
 * Credentials may live in env vars or in KV (the admin Auth Keys screen writes
 * there), so both are checked, env first.
 */

export type OAuthProvider = 'github' | 'discord';

const ENV_KEYS: Record<OAuthProvider, { id: string; secret: string }> = {
	github: { id: 'GITHUB_CLIENT_ID', secret: 'GITHUB_CLIENT_SECRET' },
	discord: { id: 'DISCORD_CLIENT_ID', secret: 'DISCORD_CLIENT_SECRET' }
};

export async function isProviderConfigured(
	platform: App.Platform | undefined,
	provider: OAuthProvider
): Promise<boolean> {
	const env = platform?.env as Record<string, string | undefined> | undefined;
	const keys = ENV_KEYS[provider];

	if (env?.[keys.id] && env?.[keys.secret]) {
		return true;
	}

	if (platform?.env?.KV) {
		try {
			const stored = await platform.env.KV.get(`auth_config:${provider}`);
			if (stored) {
				const config = JSON.parse(stored);
				return !!(config.clientId && config.clientSecret);
			}
		} catch {
			// A malformed or unreachable KV entry means "not configured", not a crash.
		}
	}

	return false;
}

/** Both providers at once, for the login and signup pages. */
export async function configuredProviders(
	platform: App.Platform | undefined
): Promise<Record<OAuthProvider, boolean>> {
	const [github, discord] = await Promise.all([
		isProviderConfigured(platform, 'github'),
		isProviderConfigured(platform, 'discord')
	]);
	return { github, discord };
}
