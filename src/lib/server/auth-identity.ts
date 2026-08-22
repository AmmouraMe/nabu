export interface AuthIdentityRecord {
	id: string;
	email: string;
	name: string | null;
	github_login: string | null;
	github_avatar_url: string | null;
	is_admin: number;
}

export async function resolveOwnerStatus(
	platform: App.Platform | undefined,
	user: Pick<AuthIdentityRecord, 'id' | 'github_login'>
): Promise<boolean> {
	if (!platform?.env?.DB) return false;
	const githubOwnerSetting = platform.env.GITHUB_OWNER_ID?.trim();
	let githubOwnerId =
		githubOwnerSetting && /^\d+$/.test(githubOwnerSetting) ? githubOwnerSetting : undefined;
	let githubOwnerUsername = githubOwnerId ? null : githubOwnerSetting || null;
	let discordOwnerId = platform.env.DISCORD_OWNER_ID?.trim() || undefined;
	if (platform.env.KV) {
		try {
			const githubOwnerConfigured = Boolean(githubOwnerId || githubOwnerUsername);
			const values = await Promise.all([
				githubOwnerConfigured ? null : platform.env.KV.get('github_owner_id'),
				githubOwnerConfigured ? null : platform.env.KV.get('github_owner_username'),
				discordOwnerId ? null : platform.env.KV.get('discord_owner_id')
			]);
			if (!githubOwnerConfigured) {
				const storedId = values[0]?.trim();
				githubOwnerId = storedId && /^\d+$/.test(storedId) ? storedId : undefined;
				githubOwnerUsername = githubOwnerId ? null : values[1]?.trim() || null;
			}
			discordOwnerId ||= values[2]?.trim() || undefined;
		} catch {
			// KV is only a fallback. Definitive environment IDs remain usable during
			// a transient KV outage; missing fallback configuration still fails closed.
		}
	}
	if (githubOwnerId && user.id === githubOwnerId) return true;
	const ownerLinks = [
		githubOwnerId ? { provider: 'github', id: githubOwnerId } : null,
		discordOwnerId ? { provider: 'discord', id: discordOwnerId } : null
	].filter((entry): entry is { provider: string; id: string } => Boolean(entry));
	for (const owner of ownerLinks) {
		const link = await platform.env.DB.prepare(
			'SELECT 1 AS found FROM oauth_accounts WHERE user_id = ? AND provider = ? AND provider_account_id = ?'
		)
			.bind(user.id, owner.provider, owner.id)
			.first<{ found: number }>();
		if (link) return true;
	}
	// A mutable username is a legacy fallback only. Once an immutable GitHub
	// account ID exists, a recycled username must never be able to grant ownership.
	if (!githubOwnerId && githubOwnerUsername) {
		return user.github_login?.toLowerCase() === githubOwnerUsername.toLowerCase();
	}
	return false;
}
