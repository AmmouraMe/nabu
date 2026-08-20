/**
 * File Archive Service
 * Manages the file archive for all files exchanged with AI:
 * - User-uploaded attachments (images, videos, audio)
 * - AI-generated media outputs
 * Smart organization by brand, context, type, and virtual folders
 */

import type { D1Database } from '@cloudflare/workers-types';

export type FileType = 'image' | 'video' | 'audio' | 'document';
export type FileSource = 'user_upload' | 'ai_generated' | 'ai_referenced';
export type FileContext = 'onboarding' | 'chat' | 'brand_assets';

export interface FileArchiveEntry {
	id: string;
	brandProfileId: string;
	userId: string;
	fileName: string;
	mimeType: string;
	fileSize: number;
	r2Key: string;
	fileType: FileType;
	source: FileSource;
	context: FileContext;
	conversationId?: string;
	messageId?: string;
	onboardingStep?: string;
	aiPrompt?: string;
	aiModel?: string;
	aiGenerationId?: string;
	folder: string;
	tags: string[];
	description?: string;
	isStarred: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface CreateFileArchiveInput {
	brandProfileId: string;
	userId: string;
	fileName: string;
	mimeType: string;
	fileSize: number;
	r2Key: string;
	fileType: FileType;
	source: FileSource;
	context?: FileContext;
	conversationId?: string;
	messageId?: string;
	onboardingStep?: string;
	aiPrompt?: string;
	aiModel?: string;
	aiGenerationId?: string;
	folder?: string;
	tags?: string[];
	description?: string;
}

export interface FileArchiveFilter {
	brandProfileId: string;
	fileType?: FileType;
	source?: FileSource;
	context?: FileContext;
	folder?: string;
	search?: string;
	isStarred?: boolean;
	limit?: number;
	offset?: number;
}

export interface FolderInfo {
	path: string;
	name: string;
	fileCount: number;
}

// ─── Row → Model conversion ───────────────────────────────────────

function rowToEntry(row: Record<string, unknown>): FileArchiveEntry {
	let tags: string[] = [];
	try {
		tags = JSON.parse((row.tags as string) || '[]');
	} catch {
		tags = [];
	}
	return {
		id: row.id as string,
		brandProfileId: row.brand_profile_id as string,
		userId: row.user_id as string,
		fileName: row.file_name as string,
		mimeType: row.mime_type as string,
		fileSize: row.file_size as number,
		r2Key: row.r2_key as string,
		fileType: row.file_type as FileType,
		source: row.source as FileSource,
		context: row.context as FileContext,
		conversationId: row.conversation_id as string | undefined,
		messageId: row.message_id as string | undefined,
		onboardingStep: row.onboarding_step as string | undefined,
		aiPrompt: row.ai_prompt as string | undefined,
		aiModel: row.ai_model as string | undefined,
		aiGenerationId: row.ai_generation_id as string | undefined,
		folder: row.folder as string,
		tags,
		description: row.description as string | undefined,
		isStarred: (row.is_starred as number) === 1,
		createdAt: row.created_at as string,
		updatedAt: row.updated_at as string
	};
}

// ─── Smart Folder Assignment ───────────────────────────────────────

/**
 * Automatically determine a smart folder path based on file context and metadata
 */
export function determineFolder(input: CreateFileArchiveInput): string {
	const { context, fileType, source, onboardingStep } = input;

	if (context === 'onboarding') {
		const step = onboardingStep ? `/${onboardingStep.replace(/_/g, '-')}` : '';
		return `/onboarding${step}/${fileType}s`;
	}

	if (context === 'brand_assets') {
		return `/brand-assets/${fileType}s`;
	}

	// Chat context
	if (source === 'ai_generated') {
		return `/ai-generated/${fileType}s`;
	}

	return `/uploads/${fileType}s`;
}

// ─── CRUD Operations ───────────────────────────────────────────────

/**
 * Create a new file archive entry
 */
export async function createFileArchiveEntry(
	db: D1Database,
	input: CreateFileArchiveInput
): Promise<FileArchiveEntry> {
	const id = crypto.randomUUID().replace(/-/g, '');
	const folder = input.folder || determineFolder(input);
	const tags = JSON.stringify(input.tags || []);
	const context = input.context || 'chat';

	const result = await db
		.prepare(
			`INSERT INTO file_archive
			 (id, brand_profile_id, user_id, file_name, mime_type, file_size, r2_key,
			  file_type, source, context, conversation_id, message_id, onboarding_step,
			  ai_prompt, ai_model, ai_generation_id, folder, tags, description)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			 RETURNING *`
		)
		.bind(
			id,
			input.brandProfileId,
			input.userId,
			input.fileName,
			input.mimeType,
			input.fileSize,
			input.r2Key,
			input.fileType,
			input.source,
			context,
			input.conversationId || null,
			input.messageId || null,
			input.onboardingStep || null,
			input.aiPrompt || null,
			input.aiModel || null,
			input.aiGenerationId || null,
			folder,
			tags,
			input.description || null
		)
		.first();

	if (!result) {
		throw new Error('Failed to create file archive entry');
	}

	return rowToEntry(result as Record<string, unknown>);
}

/**
 * Get a single file archive entry by ID
 */
export async function getFileArchiveEntry(
	db: D1Database,
	id: string
): Promise<FileArchiveEntry | null> {
	const row = await db.prepare('SELECT * FROM file_archive WHERE id = ?').bind(id).first();

	return row ? rowToEntry(row as Record<string, unknown>) : null;
}

/**
 * List file archive entries with filters
 */
export async function listFileArchive(
	db: D1Database,
	filter: FileArchiveFilter
): Promise<{ files: FileArchiveEntry[]; total: number }> {
	const conditions: string[] = ['brand_profile_id = ?'];
	const params: unknown[] = [filter.brandProfileId];

	if (filter.fileType) {
		conditions.push('file_type = ?');
		params.push(filter.fileType);
	}
	if (filter.source) {
		conditions.push('source = ?');
		params.push(filter.source);
	}
	if (filter.context) {
		conditions.push('context = ?');
		params.push(filter.context);
	}
	if (filter.folder) {
		conditions.push('folder LIKE ?');
		params.push(filter.folder + '%');
	}
	if (filter.isStarred !== undefined) {
		conditions.push('is_starred = ?');
		params.push(filter.isStarred ? 1 : 0);
	}
	if (filter.search) {
		conditions.push('(file_name LIKE ? OR description LIKE ? OR tags LIKE ?)');
		const searchTerm = `%${filter.search}%`;
		params.push(searchTerm, searchTerm, searchTerm);
	}

	const where = conditions.join(' AND ');
	const limit = filter.limit || 50;
	const offset = filter.offset || 0;

	// Get total count
	const countResult = await db
		.prepare(`SELECT COUNT(*) as count FROM file_archive WHERE ${where}`)
		.bind(...params)
		.first<{ count: number }>();
	const total = countResult?.count || 0;

	// Get paginated results
	const rows = await db
		.prepare(`SELECT * FROM file_archive WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
		.bind(...params, limit, offset)
		.all();

	const files = (rows.results || []).map((r) => rowToEntry(r as Record<string, unknown>));

	return { files, total };
}

/**
 * Get virtual folder structure for a brand
 */
export async function getArchiveFolders(
	db: D1Database,
	brandProfileId: string
): Promise<FolderInfo[]> {
	const rows = await db
		.prepare(
			`SELECT folder, COUNT(*) as file_count
			 FROM file_archive
			 WHERE brand_profile_id = ?
			 GROUP BY folder
			 ORDER BY folder`
		)
		.bind(brandProfileId)
		.all();

	return (rows.results || []).map((r) => {
		const folder = r.folder as string;
		const parts = folder.split('/').filter(Boolean);
		return {
			path: folder,
			name: parts[parts.length - 1] || 'Root',
			fileCount: r.file_count as number
		};
	});
}

/**
 * Toggle star status on a file
 */
export async function toggleFileStar(db: D1Database, id: string): Promise<boolean> {
	const result = await db
		.prepare(
			`UPDATE file_archive
			 SET is_starred = CASE WHEN is_starred = 1 THEN 0 ELSE 1 END,
			     updated_at = datetime('now')
			 WHERE id = ?
			 RETURNING is_starred`
		)
		.bind(id)
		.first<{ is_starred: number }>();

	return result?.is_starred === 1;
}

/**
 * Update file metadata (tags, description, folder)
 */
export async function updateFileArchiveEntry(
	db: D1Database,
	id: string,
	updates: { tags?: string[]; description?: string; folder?: string; fileName?: string }
): Promise<FileArchiveEntry | null> {
	const sets: string[] = ["updated_at = datetime('now')"];
	const params: unknown[] = [];

	if (updates.tags !== undefined) {
		sets.push('tags = ?');
		params.push(JSON.stringify(updates.tags));
	}
	if (updates.description !== undefined) {
		sets.push('description = ?');
		params.push(updates.description);
	}
	if (updates.folder !== undefined) {
		sets.push('folder = ?');
		params.push(updates.folder);
	}
	if (updates.fileName !== undefined) {
		sets.push('file_name = ?');
		params.push(updates.fileName);
	}

	params.push(id);

	const row = await db
		.prepare(`UPDATE file_archive SET ${sets.join(', ')} WHERE id = ? RETURNING *`)
		.bind(...params)
		.first();

	return row ? rowToEntry(row as Record<string, unknown>) : null;
}

/**
 * Delete a file archive entry (does NOT delete from R2 — caller must handle that)
 */
export async function deleteFileArchiveEntry(db: D1Database, id: string): Promise<boolean> {
	const result = await db
		.prepare('DELETE FROM file_archive WHERE id = ? RETURNING id')
		.bind(id)
		.first();

	return !!result;
}

/**
 * Get archive stats for a brand
 */
export async function getArchiveStats(
	db: D1Database,
	brandProfileId: string
): Promise<{
	totalFiles: number;
	totalSize: number;
	byType: Record<string, number>;
	bySource: Record<string, number>;
	byContext: Record<string, number>;
}> {
	const [totalResult, typeResults, sourceResults, contextResults] = await Promise.all([
		db
			.prepare(
				'SELECT COUNT(*) as count, COALESCE(SUM(file_size), 0) as total_size FROM file_archive WHERE brand_profile_id = ?'
			)
			.bind(brandProfileId)
			.first<{ count: number; total_size: number }>(),
		db
			.prepare(
				'SELECT file_type, COUNT(*) as count FROM file_archive WHERE brand_profile_id = ? GROUP BY file_type'
			)
			.bind(brandProfileId)
			.all(),
		db
			.prepare(
				'SELECT source, COUNT(*) as count FROM file_archive WHERE brand_profile_id = ? GROUP BY source'
			)
			.bind(brandProfileId)
			.all(),
		db
			.prepare(
				'SELECT context, COUNT(*) as count FROM file_archive WHERE brand_profile_id = ? GROUP BY context'
			)
			.bind(brandProfileId)
			.all()
	]);

	const byType: Record<string, number> = {};
	for (const r of typeResults.results || []) {
		byType[r.file_type as string] = r.count as number;
	}

	const bySource: Record<string, number> = {};
	for (const r of sourceResults.results || []) {
		bySource[r.source as string] = r.count as number;
	}

	const byContext: Record<string, number> = {};
	for (const r of contextResults.results || []) {
		byContext[r.context as string] = r.count as number;
	}

	return {
		totalFiles: totalResult?.count || 0,
		totalSize: totalResult?.total_size || 0,
		byType,
		bySource,
		byContext
	};
}
