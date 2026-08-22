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
		const readFallback = async (key: string, enabled: boolean): Promise<string | null> => {
			if (!enabled) return null;
			try {
				return await platform.env.KV!.get(key);
			} catch {
				return null;
			}
		};
		const values = await Promise.all([
			readFallback('github_owner_id', !githubOwnerId),
			readFallback('github_owner_username', !githubOwnerId && !githubOwnerUsername),
			readFallback('discord_owner_id', !discordOwnerId)
		]);
		const storedId = values[0]?.trim();
		if (storedId && /^\d+$/.test(storedId)) {
			githubOwnerId = storedId;
			githubOwnerUsername = null;
		} else if (!githubOwnerUsername) githubOwnerUsername = values[1]?.trim() || null;
		discordOwnerId ||= values[2]?.trim() || undefined;
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
