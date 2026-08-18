/**
 * Text History Service
 * Revision control for brand text assets.
 * Every text edit creates a versioned revision, enabling full history and rollback.
 */

import type { D1Database } from '@cloudflare/workers-types';
import type { TextRevision, CreateTextRevisionParams } from '$lib/types/brand-assets';

// Re-export types for test imports
export type { TextRevision };

// ─── Row Mapper ──────────────────────────────────────────────────

function mapRowToTextRevision(row: Record<string, unknown>): TextRevision {
	return {
		id: row.id as string,
		brandTextId: row.brand_text_id as string,
		revisionNumber: row.revision_number as number,
		value: row.value as string,
		label: (row.label as string) || undefined,
		changeSource: row.change_source as TextRevision['changeSource'],
		userId: row.user_id as string,
		changeNote: (row.change_note as string) || undefined,
		isCurrent: (row.is_current as number) === 1,
		createdAt: row.created_at as string
	};
}

// ─── Revision Control ────────────────────────────────────────────

/**
 * Create a new revision for a text asset.
 * Automatically increments the revision number and marks previous revisions as not current.
 */
export async function createTextRevision(
	db: D1Database,
	params: CreateTextRevisionParams
): Promise<TextRevision> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();

	// Get next revision number
	const countRow = await db
		.prepare('SELECT COUNT(*) as count FROM brand_text_revisions WHERE brand_text_id = ?')
		.bind(params.brandTextId)
		.first<{ count: number }>();

	const revisionNumber = (countRow?.count ?? 0) + 1;

	// Mark all previous revisions as not current
	await db
		.prepare('UPDATE brand_text_revisions SET is_current = 0 WHERE brand_text_id = ?')
		.bind(params.brandTextId)
		.run();

	// Insert new revision as current
	await db
		.prepare(
			`INSERT INTO brand_text_revisions
       (id, brand_text_id, revision_number, is_current, value, label,
        change_source, user_id, change_note, created_at)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			id,
			params.brandTextId,
			revisionNumber,
			params.value,
			params.label ?? null,
			params.changeSource,
			params.userId,
			params.changeNote ?? null,
			now
		)
		.run();

	return {
		id,
		brandTextId: params.brandTextId,
		revisionNumber,
		value: params.value,
		label: params.label,
		changeSource: params.changeSource,
		userId: params.userId,
		changeNote: params.changeNote,
		isCurrent: true,
		createdAt: now
	};
}

/**
 * Get all revisions for a text asset, ordered by revision number.
 */
export async function getTextRevisions(
	db: D1Database,
	brandTextId: string
): Promise<TextRevision[]> {
	const result = await db
		.prepare(
			`SELECT * FROM brand_text_revisions
       WHERE brand_text_id = ?
       ORDER BY revision_number ASC`
		)
		.bind(brandTextId)
		.all();

	return (result.results || []).map((row) => mapRowToTextRevision(row as Record<string, unknown>));
}

/**
 * Get the current (latest active) revision for a text asset.
 */
export async function getCurrentTextRevision(
	db: D1Database,
	brandTextId: string
): Promise<TextRevision | null> {
	const row = await db
		.prepare(
			`SELECT * FROM brand_text_revisions
       WHERE brand_text_id = ? AND is_current = 1
       LIMIT 1`
		)
		.bind(brandTextId)
		.first();

	if (!row) return null;
	return mapRowToTextRevision(row as Record<string, unknown>);
}

/**
 * Revert a text asset to a specific revision.
 * Creates a NEW revision that copies the content from the target revision.
 */
export async function revertTextToRevision(
	db: D1Database,
	revisionId: string,
	userId: string
): Promise<TextRevision> {
	// Get the target revision
	const targetRow = await db
		.prepare('SELECT * FROM brand_text_revisions WHERE id = ?')
		.bind(revisionId)
		.first();

	if (!targetRow) {
		throw new Error('Revision not found');
	}

	const target = mapRowToTextRevision(targetRow as Record<string, unknown>);

	// Create a new revision with the same content
	return createTextRevision(db, {
		brandTextId: target.brandTextId,
		value: target.value,
		label: target.label,
		changeSource: 'revert',
		userId,
		changeNote: `Reverted to revision ${target.revisionNumber}`
	});
}

/**
 * Get a single revision by its ID.
 * Returns null if not found.
 */
export async function getRevisionById(
	db: D1Database,
	revisionId: string
): Promise<TextRevision | null> {
	const row = await db
		.prepare('SELECT * FROM brand_text_revisions WHERE id = ?')
		.bind(revisionId)
		.first();

	if (!row) return null;
	return mapRowToTextRevision(row as Record<string, unknown>);
}

/**
 * Get the number of revisions for a text asset.
 */
export async function getTextRevisionCount(db: D1Database, brandTextId: string): Promise<number> {
	const row = await db
		.prepare('SELECT COUNT(*) as count FROM brand_text_revisions WHERE brand_text_id = ?')
		.bind(brandTextId)
		.first<{ count: number }>();

	return row?.count ?? 0;
}
