import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

const VALID_FREQUENCIES = ['hourly', 'daily', 'weekly', 'monthly'];

/**
 * GET /api/video/schedules/[id]
 * Get a specific video schedule
 */
export const GET: RequestHandler = async ({ params, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env) {
		throw error(500, 'Platform not available');
	}

	const schedule = await platform.env.DB.prepare(
		`SELECT id, name, prompt, provider, model, aspect_ratio, frequency,
		        enabled, last_run_at, next_run_at, total_runs, max_runs,
		        created_at, updated_at
		 FROM video_schedules
		 WHERE id = ? AND user_id = ?`
	)
		.bind(params.id, locals.user.id)
		.first<Record<string, unknown>>();

	if (!schedule) {
		throw error(404, 'Schedule not found');
	}

	return json({
		id: schedule.id,
		name: schedule.name,
		prompt: schedule.prompt,
		provider: schedule.provider,
		model: schedule.model,
		aspectRatio: schedule.aspect_ratio,
		frequency: schedule.frequency,
		enabled: schedule.enabled === 1,
		lastRunAt: schedule.last_run_at,
		nextRunAt: schedule.next_run_at,
		totalRuns: schedule.total_runs,
		maxRuns: schedule.max_runs,
		createdAt: schedule.created_at,
		updatedAt: schedule.updated_at
	});
};

/**
 * PATCH /api/video/schedules/[id]
 * Update a video schedule
 */
export const PATCH: RequestHandler = async ({ params, request, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env) {
		throw error(500, 'Platform not available');
	}

	const existing = await platform.env.DB.prepare(
		'SELECT id FROM video_schedules WHERE id = ? AND user_id = ?'
	)
		.bind(params.id, locals.user.id)
		.first();

	if (!existing) {
		throw error(404, 'Schedule not found');
	}

	const body = await request.json();
	const { name, prompt, frequency, model, aspectRatio, enabled, maxRuns } = body as {
		name?: string;
		prompt?: string;
		frequency?: string;
		model?: string;
		aspectRatio?: string;
		enabled?: boolean;
		maxRuns?: number | null;
	};

	const updates: string[] = [];
	const values: (string | number | null)[] = [];

	if (name !== undefined) {
		if (typeof name !== 'string' || name.trim().length === 0) {
			throw error(400, 'Name must be a non-empty string');
		}
		updates.push('name = ?');
		values.push(name.trim());
	}

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

	if (frequency !== undefined) {
		if (!VALID_FREQUENCIES.includes(frequency)) {
			throw error(400, `Invalid frequency. Must be one of: ${VALID_FREQUENCIES.join(', ')}`);
		}
		updates.push('frequency = ?');
		values.push(frequency);
	}

	if (model !== undefined) {
		updates.push('model = ?');
		values.push(model);
	}

	if (aspectRatio !== undefined) {
		updates.push('aspect_ratio = ?');
		values.push(aspectRatio);
	}

	if (enabled !== undefined) {
		updates.push('enabled = ?');
		values.push(enabled ? 1 : 0);
	}

	if (maxRuns !== undefined) {
		updates.push('max_runs = ?');
		values.push(maxRuns);
	}

	if (updates.length === 0) {
		throw error(400, 'No valid fields to update');
	}

	updates.push("updated_at = datetime('now')");
	values.push(params.id, locals.user.id);

	await platform.env.DB.prepare(
		`UPDATE video_schedules SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`
	)
		.bind(...values)
		.run();

	return json({ success: true, id: params.id });
};

/**
 * DELETE /api/video/schedules/[id]
 * Delete a video schedule
 */
export const DELETE: RequestHandler = async ({ params, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env) {
		throw error(500, 'Platform not available');
	}

	const existing = await platform.env.DB.prepare(
		'SELECT id FROM video_schedules WHERE id = ? AND user_id = ?'
	)
		.bind(params.id, locals.user.id)
		.first();

	if (!existing) {
		throw error(404, 'Schedule not found');
	}

	await platform.env.DB.prepare('DELETE FROM video_schedules WHERE id = ? AND user_id = ?')
		.bind(params.id, locals.user.id)
		.run();

	return json({ success: true, id: params.id });
};
