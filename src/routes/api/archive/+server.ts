/**
 * GET /api/archive?brandProfileId=xxx&fileType=image&source=user_upload&...
 * List file archive entries with filters.
 *
 * DELETE /api/archive?id=xxx
 * Delete a file archive entry and its R2 object.
 */
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import {
	listFileArchive,
	getFileArchiveEntry,
	deleteFileArchiveEntry,
	getArchiveFolders,
	getArchiveStats,
	toggleFileStar,
	updateFileArchiveEntry
} from '$lib/services/file-archive';
import type { FileType, FileSource, FileContext } from '$lib/services/file-archive';

export const GET: RequestHandler = async ({ url, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB) throw error(500, 'Platform not available');

	const brandProfileId = url.searchParams.get('brandProfileId');
	if (!brandProfileId) throw error(400, 'brandProfileId required');

	const action = url.searchParams.get('action');

	// Special actions
	if (action === 'folders') {
		const folders = await getArchiveFolders(platform.env.DB, brandProfileId);
		return json({ folders });
	}

	if (action === 'stats') {
		const stats = await getArchiveStats(platform.env.DB, brandProfileId);
		return json({ stats });
	}

	// List files
	const fileType = url.searchParams.get('fileType') as FileType | null;
	const source = url.searchParams.get('source') as FileSource | null;
	const context = url.searchParams.get('context') as FileContext | null;
	const folder = url.searchParams.get('folder');
	const search = url.searchParams.get('search');
	const starred = url.searchParams.get('starred');
	const limit = parseInt(url.searchParams.get('limit') || '50', 10);
	const offset = parseInt(url.searchParams.get('offset') || '0', 10);

	const result = await listFileArchive(platform.env.DB, {
		brandProfileId,
		fileType: fileType || undefined,
		source: source || undefined,
		context: context || undefined,
		folder: folder || undefined,
		search: search || undefined,
		isStarred: starred === 'true' ? true : starred === 'false' ? false : undefined,
		limit,
		offset
	});

	// Add serve URLs
	const files = result.files.map((f) => ({
		...f,
		url: `/api/archive/file?key=${encodeURIComponent(f.r2Key)}`
	}));

	return json({ files, total: result.total });
};

export const PATCH: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB) throw error(500, 'Platform not available');

	const body = await request.json();
	const { id, action: patchAction, ...updates } = body;

	if (!id) throw error(400, 'id required');

	if (patchAction === 'star') {
		const isStarred = await toggleFileStar(platform.env.DB, id);
		return json({ isStarred });
	}

	const entry = await updateFileArchiveEntry(platform.env.DB, id, updates);
	if (!entry) throw error(404, 'File not found');

	return json({
		file: { ...entry, url: `/api/archive/file?key=${encodeURIComponent(entry.r2Key)}` }
	});
};

export const DELETE: RequestHandler = async ({ url, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB || !platform?.env?.BUCKET) throw error(500, 'Platform not available');

	const id = url.searchParams.get('id');
	if (!id) throw error(400, 'id required');

	// Get the entry to find R2 key
	const entry = await getFileArchiveEntry(platform.env.DB, id);
	if (!entry) throw error(404, 'File not found');

	// Verify ownership
	if (entry.userId !== locals.user.id) {
		throw error(403, 'Forbidden');
	}

	// Delete from R2
	try {
		await platform.env.BUCKET.delete(entry.r2Key);
	} catch {
		// R2 deletion failure is non-fatal
		console.error('Failed to delete R2 object:', entry.r2Key);
	}

	// Delete DB record
	await deleteFileArchiveEntry(platform.env.DB, id);

	return json({ success: true });
};
