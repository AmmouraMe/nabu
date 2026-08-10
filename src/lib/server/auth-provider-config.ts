import type { OAuthProvider } from './oauth-state';

export const AUTH_PROVIDERS = ['github', 'discord'] as const satisfies readonly OAuthProvider[];

export function isAuthProvider(value: unknown): value is OAuthProvider {
	return value === 'github' || value === 'discord';
}

export async function getAuthProviderCredentials(
	platform: App.Platform | undefined,
	provider: OAuthProvider
): Promise<{ clientId?: string; clientSecret?: string }> {
	const credentials =
		provider === 'github'
			? {
					clientId: platform?.env?.GITHUB_CLIENT_ID,
					clientSecret: platform?.env?.GITHUB_CLIENT_SECRET
				}
			: {
					clientId: platform?.env?.DISCORD_CLIENT_ID,
					clientSecret: platform?.env?.DISCORD_CLIENT_SECRET
				};
	if ((!credentials.clientId || !credentials.clientSecret) && platform?.env?.KV) {
		try {
			const stored = await platform.env.KV.get(`auth_config:${provider}`);
			if (stored) {
				const config = JSON.parse(stored) as typeof credentials;
				credentials.clientId ||= config.clientId;
				credentials.clientSecret ||= config.clientSecret;
			}
		} catch {
			// Missing provider configuration fails closed below.
		}
	}
	return credentials;
}
