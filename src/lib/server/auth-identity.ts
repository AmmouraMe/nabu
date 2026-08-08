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
	let githubOwnerId = platform.env.GITHUB_OWNER_ID;
	let githubOwnerUsername: string | null = null;
	let discordOwnerId = platform.env.DISCORD_OWNER_ID;
	if (githubOwnerId && Number.isNaN(Number.parseInt(githubOwnerId, 10))) {
		githubOwnerUsername = githubOwnerId;
		githubOwnerId = undefined;
	}
	if (platform.env.KV) {
		try {
			const values = await Promise.all([
				githubOwnerId ? null : platform.env.KV.get('github_owner_id'),
				githubOwnerUsername ? null : platform.env.KV.get('github_owner_username'),
				discordOwnerId ? null : platform.env.KV.get('discord_owner_id')
			]);
			githubOwnerId ||= values[0] || undefined;
			githubOwnerUsername ||= values[1];
			discordOwnerId ||= values[2] || undefined;
		} catch {
			return false;
		}
	}
	if (githubOwnerId && user.id === githubOwnerId) return true;
	if (githubOwnerUsername && user.github_login?.toLowerCase() === githubOwnerUsername.toLowerCase())
		return true;
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
	return false;
}
