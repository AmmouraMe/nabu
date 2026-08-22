/**
 * Account Merge Service
 *
 * Handles merging two user accounts together when a social account
 * that's already linked to one user is connected to another user.
 * Instead of showing an error, we seamlessly merge the accounts.
 */

interface D1Database {
	prepare(query: string): D1PreparedStatement;
	batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

interface D1PreparedStatement {
	bind(...values: unknown[]): D1PreparedStatement;
	first<T = unknown>(): Promise<T | null>;
	run(): Promise<D1Result>;
	all<T = unknown>(): Promise<D1Result<T>>;
}

interface D1Result<T = unknown> {
	success: boolean;
	results?: T[];
	error?: string;
}

const USER_ID_TRANSFER_TABLES = [
	'oauth_accounts',
	'chat_messages',
	'conversations',
	'brand_profiles',
	'onboarding_messages',
	'brand_field_versions',
	'video_generations',
	'video_schedules',
	'file_archive',
	'media_activity_log',
	'media_revisions',
	'brand_text_revisions',
	'brand_audit_log'
] as const;

/**
 * Merges the source user's data into the target user, then deletes the source user.
 *
 * This function:
 * 1. Checks if the source user is an admin (to preserve admin status)
 * 2. Transfers all oauth_accounts from source to target
 * 3. Transfers all chat_messages from source to target
 * 4. Revokes all sessions belonging to the source user
 * 5. Updates target user's admin status if source was admin
 * 6. Deletes the source user
 *
 * @param db - The D1 database instance
 * @param sourceUserId - The user ID being merged FROM (will be deleted)
 * @param targetUserId - The user ID being merged INTO (will remain)
 */
export async function mergeAccounts(
	db: D1Database,
	sourceUserId: string,
	targetUserId: string
): Promise<void> {
	console.log(`[Account Merge] Merging user ${sourceUserId} into ${targetUserId}`);

	// First, check if source user is an admin
	const sourceUser = await db
		.prepare('SELECT is_admin FROM users WHERE id = ?')
		.bind(sourceUserId)
		.first<{ is_admin: number }>();

	const sourceIsAdmin = sourceUser?.is_admin === 1;

	// Prepare batch statements for atomic transfer of all data
	const statements: D1PreparedStatement[] = [];

	for (const table of USER_ID_TRANSFER_TABLES) {
		statements.push(
			db
				.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id = ?`)
				.bind(targetUserId, sourceUserId)
		);
	}

	// A session authenticates the identity that created it. Reassigning it would let
	// a browser logged in as the source user inherit the target user's privileges.
	statements.push(db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(sourceUserId));

	// Avoid unique collisions when both users already have access to the same brand.
	statements.push(
		db
			.prepare(
				'DELETE FROM brand_access WHERE user_id = ? AND brand_profile_id IN (SELECT brand_profile_id FROM brand_access WHERE user_id = ?)'
			)
			.bind(sourceUserId, targetUserId)
	);

	statements.push(
		db
			.prepare('UPDATE brand_access SET user_id = ? WHERE user_id = ?')
			.bind(targetUserId, sourceUserId)
	);

	statements.push(
		db
			.prepare('UPDATE brand_access SET granted_by = ? WHERE granted_by = ?')
			.bind(targetUserId, sourceUserId)
	);

	// If source user was admin, make target user admin too
	if (sourceIsAdmin) {
		statements.push(db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').bind(targetUserId));
	}

	// Delete the source user (CASCADE will clean up any remaining references)
	statements.push(db.prepare('DELETE FROM users WHERE id = ?').bind(sourceUserId));

	// Execute all statements in a batch for atomicity
	await db.batch(statements);

	console.log(`[Account Merge] Successfully merged user ${sourceUserId} into ${targetUserId}`);
}
