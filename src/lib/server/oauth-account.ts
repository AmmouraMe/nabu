import { mergeAccounts } from '$lib/services/account-merge';
import type { OAuthProvider } from './oauth-state';
import type { D1Database } from '@cloudflare/workers-types';

async function ensureOAuthAccount(
	db: D1Database,
	userId: string,
	provider: OAuthProvider,
	accountId: string
) {
	const existing = await db
		.prepare('SELECT id FROM oauth_accounts WHERE user_id = ? AND provider = ?')
		.bind(userId, provider)
		.first<{ id: string }>();
	if (!existing) {
		await db
			.prepare(
				`INSERT INTO oauth_accounts (id, user_id, provider, provider_account_id, created_at)
			VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
			)
			.bind(crypto.randomUUID(), userId, provider, accountId)
			.run();
	}
}

export async function reconcileOAuthAccount(options: {
	db: D1Database;
	provider: OAuthProvider;
	providerAccountId: string;
	legacyUserId: string;
	linkingUserId?: string;
	createUser(userId: string): Promise<void>;
	updateUser(userId: string, match: 'link' | 'linked' | 'legacy'): Promise<void>;
}): Promise<{ userId: string; linkedProvider?: OAuthProvider }> {
	const { db, provider, providerAccountId, legacyUserId, linkingUserId } = options;
	const linked = await db
		.prepare('SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_account_id = ?')
		.bind(provider, providerAccountId)
		.first<{ user_id: string }>();
	if (linkingUserId) {
		if (linked && linked.user_id !== linkingUserId)
			await mergeAccounts(db, linked.user_id, linkingUserId);
		else if (!linked) await ensureOAuthAccount(db, linkingUserId, provider, providerAccountId);
		await options.updateUser(linkingUserId, 'link');
		return { userId: linkingUserId, linkedProvider: provider };
	}
	if (linked) {
		const user = await db
			.prepare('SELECT id FROM users WHERE id = ?')
			.bind(linked.user_id)
			.first<{ id: string }>();
		if (user) {
			// Provider profile data can change independently of the canonical link.
			// Refresh it on every login, including accounts created before the
			// provider-neutral profile columns were introduced.
			await options.updateUser(user.id, 'linked');
			return { userId: user.id };
		}
	}
	// Never infer account ownership from email alone. Password signup does not
	// verify email ownership, so automatic email matching would let an attacker
	// pre-register a victim's address and capture the victim's OAuth identity.
	// Cross-provider consolidation must use the authenticated linking flow above.
	const legacy = await db
		.prepare('SELECT id FROM users WHERE id = ?')
		.bind(legacyUserId)
		.first<{ id: string }>();
	if (legacy) {
		await ensureOAuthAccount(db, legacy.id, provider, providerAccountId);
		await options.updateUser(legacy.id, 'legacy');
		return { userId: legacy.id };
	}
	await options.createUser(legacyUserId);
	await ensureOAuthAccount(db, legacyUserId, provider, providerAccountId);
	return { userId: legacyUserId };
}
