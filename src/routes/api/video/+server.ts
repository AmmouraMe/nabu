import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

/**
 * GET /api/video
 * List user's video generations (for gallery view)
 */
export const GET: RequestHandler = async ({ url, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env) {
		throw error(500, 'Platform not available');
	}

	const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
	const offset = parseInt(url.searchParams.get('offset') || '0');
	const status = url.searchParams.get('status'); // 'complete', 'error', 'processing'
	const brandProfileId = url.searchParams.get('brandProfileId');

	let query = `SELECT id, prompt, provider, provider_job_id, model, status, video_url, thumbnail_url,
	                    r2_key, duration_seconds, aspect_ratio, resolution, cost, error,
	                    created_at, completed_at, conversation_id, message_id
	             FROM video_generations
	             WHERE user_id = ?`;
	const params: (string | number)[] = [locals.user.id];

	if (status) {
		query += ' AND status = ?';
		params.push(status);
	}

	if (brandProfileId) {
		query += ' AND brand_profile_id = ?';
		params.push(brandProfileId);
	}

	query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
	params.push(limit, offset);

	const result = await platform.env.DB.prepare(query)
		.bind(...params)
		.all();

	const videos = (result.results || []).map((row) => ({
		id: row.id,
		prompt: row.prompt,
		provider: row.provider,
		providerJobId: row.provider_job_id,
		model: row.model,
		status: row.status,
		videoUrl: row.video_url,
		thumbnailUrl: row.thumbnail_url,
		r2Key: row.r2_key,
		duration: row.duration_seconds,
		aspectRatio: row.aspect_ratio,
		resolution: row.resolution,
		cost: row.cost,
		error: row.error,
		createdAt: row.created_at,
		completedAt: row.completed_at,
		conversationId: row.conversation_id ?? null,
		messageId: row.message_id ?? null
	}));

	// Get total count
	let countQuery = 'SELECT COUNT(*) as total FROM video_generations WHERE user_id = ?';
	const countParams: (string | number)[] = [locals.user.id];
	if (status) {
		countQuery += ' AND status = ?';
		countParams.push(status);
	}
	if (brandProfileId) {
		countQuery += ' AND brand_profile_id = ?';
		countParams.push(brandProfileId);
	}
	const countResult = await platform.env.DB.prepare(countQuery)
		.bind(...countParams)
		.first<{ total: number }>();

	return json({
		videos,
		total: countResult?.total ?? 0,
		limit,
		offset
	});
};
