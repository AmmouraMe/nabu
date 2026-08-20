import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

/**
 * GET /api/video/[id]
 * Get the status of a specific video generation
 */
export const GET: RequestHandler = async ({ params, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env) {
		throw error(500, 'Platform not available');
	}

	const generation = await platform.env.DB.prepare(
		`SELECT id, prompt, provider, provider_job_id, model, status, video_url, thumbnail_url,
		        r2_key, duration_seconds, aspect_ratio, resolution, cost,
		        error, created_at, completed_at, conversation_id, message_id
		 FROM video_generations
		 WHERE id = ? AND user_id = ?`
	)
		.bind(params.id, locals.user.id)
		.first();

	if (!generation) {
		throw error(404, 'Video generation not found');
	}

	return json({
		id: generation.id,
		prompt: generation.prompt,
		provider: generation.provider,
		providerJobId: generation.provider_job_id,
		model: generation.model,
		status: generation.status,
		videoUrl: generation.video_url,
		thumbnailUrl: generation.thumbnail_url,
		r2Key: generation.r2_key,
		duration: generation.duration_seconds,
		aspectRatio: generation.aspect_ratio,
		resolution: generation.resolution,
		cost: generation.cost,
		error: generation.error,
		createdAt: generation.created_at,
		completedAt: generation.completed_at,
		conversationId: generation.conversation_id ?? null,
		messageId: generation.message_id ?? null
	});
};

/**
 * PATCH /api/video/[id]
 * Update video generation metadata (prompt/label)
 */
export const PATCH: RequestHandler = async ({ params, request, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env) {
		throw error(500, 'Platform not available');
	}

	// Verify the video belongs to this user
	const existing = await platform.env.DB.prepare(
		'SELECT id FROM video_generations WHERE id = ? AND user_id = ?'
	)
		.bind(params.id, locals.user.id)
		.first();

	if (!existing) {
		throw error(404, 'Video generation not found');
	}

	const body = await request.json();
	const { prompt } = body as { prompt?: string };

	// Build dynamic update
	const updates: string[] = [];
	const values: (string | number)[] = [];

	if (prompt !== undefined) {
		if (typeof prompt !== 'string' || prompt.trim().length === 0) {
			throw error(400, 'Prompt must be a non-empty string');
		}
		if (prompt.length > 4000) {
			throw error(400, 'Prompt too long (max 4000 characters)');
		}
		updates.push('prompt = ?');
		values.push(prompt.trim());
	}

	if (updates.length === 0) {
		throw error(400, 'No valid fields to update');
	}

	values.push(params.id, locals.user.id);

	await platform.env.DB.prepare(
		`UPDATE video_generations SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`
	)
		.bind(...values)
		.run();

	return json({ success: true, id: params.id });
};

/**
 * DELETE /api/video/[id]
 * Delete a video generation and its associated R2 object
 */
export const DELETE: RequestHandler = async ({ params, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env) {
		throw error(500, 'Platform not available');
	}

	// Get the video record to check ownership and R2 key
	const generation = await platform.env.DB.prepare(
		'SELECT id, r2_key FROM video_generations WHERE id = ? AND user_id = ?'
	)
		.bind(params.id, locals.user.id)
		.first<{ id: string; r2_key: string | null }>();

	if (!generation) {
		throw error(404, 'Video generation not found');
	}

	// Delete R2 object if it exists
	if (generation.r2_key && platform.env.BUCKET) {
		try {
			await platform.env.BUCKET.delete(generation.r2_key);
		} catch (r2Err) {
			console.error('Failed to delete R2 object:', r2Err);
			// Continue with DB deletion even if R2 fails
		}
	}

	// Delete the database record
	await platform.env.DB.prepare('DELETE FROM video_generations WHERE id = ? AND user_id = ?')
		.bind(params.id, locals.user.id)
		.run();

	return json({ success: true, id: params.id });
};
