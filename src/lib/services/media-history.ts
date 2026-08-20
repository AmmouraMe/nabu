/**
 * Media History Service
 * Activity logging and revision control for brand media assets.
 * Provides a complete audit trail and version history.
 */

import type { D1Database } from '@cloudflare/workers-types';
import type {
	MediaActivityLog,
	CreateMediaActivityLogParams,
	MediaRevision,
	CreateMediaRevisionParams
} from '$lib/types/brand-assets';

// Re-export types for test imports
export type { MediaActivityLog, MediaRevision };

// ─── Row Mappers ─────────────────────────────────────────────────

function mapRowToActivityLog(row: Record<string, unknown>): MediaActivityLog {
	return {
		id: row.id as string,
		brandProfileId: row.brand_profile_id as string,
		brandMediaId: (row.brand_media_id as string) || undefined,
		userId: row.user_id as string,
		action: row.action as MediaActivityLog['action'],
		description: row.description as string,
		details: row.details ? JSON.parse(row.details as string) : undefined,
		source: row.source as MediaActivityLog['source'],
		createdAt: row.created_at as string
	};
}

function mapRowToRevision(row: Record<string, unknown>): MediaRevision {
	return {
		id: row.id as string,
		brandMediaId: row.brand_media_id as string,
		revisionNumber: row.revision_number as number,
		url: (row.url as string) || undefined,
		r2Key: (row.r2_key as string) || undefined,
		mimeType: (row.mime_type as string) || undefined,
		fileSize: (row.file_size as number) || undefined,
		width: (row.width as number) || undefined,
		height: (row.height as number) || undefined,
		durationSeconds: (row.duration_seconds as number) || undefined,
		source: row.source as MediaRevision['source'],
		userId: row.user_id as string,
		changeNote: (row.change_note as string) || undefined,
		isCurrent: (row.is_current as number) === 1,
		metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
		createdAt: row.created_at as string
	};
}

// ─── Activity Logging ────────────────────────────────────────────

/**
 * Log a media activity event.
 */
export async function logMediaActivity(
	db: D1Database,
	params: CreateMediaActivityLogParams
): Promise<MediaActivityLog> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	const detailsStr = params.details ? JSON.stringify(params.details) : null;

	await db
		.prepare(
			`INSERT INTO media_activity_log
       (id, brand_profile_id, brand_media_id, user_id, action, description, details, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			id,
			params.brandProfileId,
			params.brandMediaId ?? null,
			params.userId,
			params.action,
			params.description,
			detailsStr,
			params.source,
			now
		)
		.run();

	return {
		id,
		brandProfileId: params.brandProfileId,
		brandMediaId: params.brandMediaId,
		userId: params.userId,
		action: params.action,
		description: params.description,
		details: params.details,
		source: params.source,
		createdAt: now
	};
}

/**
 * Get activity log for a brand, ordered by most recent first.
 */
export async function getMediaActivityLog(
	db: D1Database,
	brandProfileId: string,
	options?: { limit?: number; offset?: number }
): Promise<MediaActivityLog[]> {
	const limit = options?.limit ?? 50;
	const offset = options?.offset ?? 0;

	const result = await db
		.prepare(
			`SELECT * FROM media_activity_log
       WHERE brand_profile_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
		)
		.bind(brandProfileId, limit, offset)
		.all();

	return (result.results || []).map((row) => mapRowToActivityLog(row as Record<string, unknown>));
}

/**
 * Get activity log for a specific media asset.
 */
export async function getMediaActivityLogForAsset(
	db: D1Database,
	brandMediaId: string
): Promise<MediaActivityLog[]> {
	const result = await db
		.prepare(
			`SELECT * FROM media_activity_log
       WHERE brand_media_id = ?
       ORDER BY created_at DESC`
		)
		.bind(brandMediaId)
		.all();

	return (result.results || []).map((row) => mapRowToActivityLog(row as Record<string, unknown>));
}

// ─── Revision Control ────────────────────────────────────────────

/**
 * Create a new revision for a media asset.
 * Automatically increments the revision number and marks previous revisions as not current.
 */
export async function createMediaRevision(
	db: D1Database,
	params: CreateMediaRevisionParams
): Promise<MediaRevision> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();

	// Get next revision number
	const countRow = await db
		.prepare('SELECT COUNT(*) as count FROM media_revisions WHERE brand_media_id = ?')
		.bind(params.brandMediaId)
		.first<{ count: number }>();

	const revisionNumber = (countRow?.count ?? 0) + 1;

	// Mark all previous revisions as not current
	await db
		.prepare('UPDATE media_revisions SET is_current = 0 WHERE brand_media_id = ?')
		.bind(params.brandMediaId)
		.run();

	const metadataStr = params.metadata ? JSON.stringify(params.metadata) : null;

	// Insert new revision as current
	await db
		.prepare(
			`INSERT INTO media_revisions
       (id, brand_media_id, revision_number, is_current, url, r2_key, mime_type, file_size,
        width, height, duration_seconds, source, user_id, change_note, metadata, created_at)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			id,
			params.brandMediaId,
			revisionNumber,
			params.url ?? null,
			params.r2Key ?? null,
			params.mimeType ?? null,
			params.fileSize ?? null,
			params.width ?? null,
			params.height ?? null,
			params.durationSeconds ?? null,
			params.source,
			params.userId,
			params.changeNote ?? null,
			metadataStr,
			now
		)
		.run();

	return {
		id,
		brandMediaId: params.brandMediaId,
		revisionNumber,
		url: params.url,
		r2Key: params.r2Key,
		mimeType: params.mimeType,
		fileSize: params.fileSize,
		width: params.width,
		height: params.height,
		durationSeconds: params.durationSeconds,
		source: params.source,
		userId: params.userId,
		changeNote: params.changeNote,
		isCurrent: true,
		metadata: params.metadata,
		createdAt: now
	};
}

/**
 * Get all revisions for a media asset, ordered by revision number.
 */
export async function getMediaRevisions(
	db: D1Database,
	brandMediaId: string
): Promise<MediaRevision[]> {
	const result = await db
		.prepare(
			`SELECT * FROM media_revisions
       WHERE brand_media_id = ?
       ORDER BY revision_number ASC`
		)
		.bind(brandMediaId)
		.all();

	return (result.results || []).map((row) => mapRowToRevision(row as Record<string, unknown>));
}

/**
 * Get the current (latest active) revision for a media asset.
 */
export async function getCurrentRevision(
	db: D1Database,
	brandMediaId: string
): Promise<MediaRevision | null> {
	const row = await db
		.prepare(
			`SELECT * FROM media_revisions
       WHERE brand_media_id = ? AND is_current = 1
       LIMIT 1`
		)
		.bind(brandMediaId)
		.first();

	if (!row) return null;
	return mapRowToRevision(row as Record<string, unknown>);
}

/**
 * Revert a media asset to a specific revision.
 * Creates a NEW revision that copies the content from the target revision.
 */
export async function revertToRevision(
	db: D1Database,
	revisionId: string,
	userId: string
): Promise<MediaRevision> {
	// Get the target revision
	const targetRow = await db
		.prepare('SELECT * FROM media_revisions WHERE id = ?')
		.bind(revisionId)
		.first();

	if (!targetRow) {
		throw new Error('Revision not found');
	}

	const target = mapRowToRevision(targetRow as Record<string, unknown>);

	// Create a new revision with the same content
	return createMediaRevision(db, {
		brandMediaId: target.brandMediaId,
		url: target.url,
		r2Key: target.r2Key,
		mimeType: target.mimeType,
		fileSize: target.fileSize,
		width: target.width,
		height: target.height,
		durationSeconds: target.durationSeconds,
		source: target.source,
		userId,
		changeNote: `Reverted to revision ${target.revisionNumber}`,
		metadata: target.metadata
	});
}

/**
 * Get the number of revisions for a media asset.
 */
export async function getRevisionCount(db: D1Database, brandMediaId: string): Promise<number> {
	const row = await db
		.prepare('SELECT COUNT(*) as count FROM media_revisions WHERE brand_media_id = ?')
		.bind(brandMediaId)
		.first<{ count: number }>();

	return row?.count ?? 0;
}
