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
	email?: string | null;
	linkingUserId?: string;
	createUser(userId: string): Promise<void>;
	updateUser(userId: string, match: 'link' | 'email' | 'legacy'): Promise<void>;
}): Promise<{ userId: string; linkedProvider?: OAuthProvider }> {
	const { db, provider, providerAccountId, legacyUserId, email, linkingUserId } = options;
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
		if (user) return { userId: user.id };
	}
	const normalizedEmail = email?.trim().toLowerCase();
	const emailUser = normalizedEmail
		? await db
				.prepare('SELECT id FROM users WHERE lower(email) = lower(?) LIMIT 2')
				.bind(normalizedEmail)
				.first<{ id: string }>()
		: null;
	const legacy = await db
		.prepare('SELECT id FROM users WHERE id = ?')
		.bind(legacyUserId)
		.first<{ id: string }>();
	if (emailUser) {
		if (legacy && legacy.id !== emailUser.id) await mergeAccounts(db, legacy.id, emailUser.id);
		await ensureOAuthAccount(db, emailUser.id, provider, providerAccountId);
		await options.updateUser(emailUser.id, 'email');
		return { userId: emailUser.id };
	}
	if (legacy) {
		await ensureOAuthAccount(db, legacy.id, provider, providerAccountId);
		await options.updateUser(legacy.id, 'legacy');
		return { userId: legacy.id };
	}
	await options.createUser(legacyUserId);
	await ensureOAuthAccount(db, legacyUserId, provider, providerAccountId);
	return { userId: legacyUserId };
}
