import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { consumeUsage, resolvePlan } from '$lib/server/entitlements';

const VALID_FREQUENCIES = ['hourly', 'daily', 'weekly', 'monthly'];

/**
 * Compute next run time based on frequency from now
 */
function computeNextRun(frequency: string): string {
	const now = new Date();
	switch (frequency) {
		case 'hourly':
			now.setHours(now.getHours() + 1);
			break;
		case 'daily':
			now.setDate(now.getDate() + 1);
			break;
		case 'weekly':
			now.setDate(now.getDate() + 7);
			break;
		case 'monthly':
			now.setMonth(now.getMonth() + 1);
			break;
	}
	return now.toISOString();
}

/**
 * GET /api/video/schedules
 * List all video schedules for the current user
 */
export const GET: RequestHandler = async ({ platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env) {
		throw error(500, 'Platform not available');
	}

	if (!platform.env.DB) {
		return json({ schedules: [] });
	}

	const result = await platform.env.DB.prepare(
		`SELECT id, name, prompt, provider, model, aspect_ratio, frequency,
		        enabled, last_run_at, next_run_at, total_runs, max_runs,
		        created_at, updated_at
		 FROM video_schedules
		 WHERE user_id = ?
		 ORDER BY created_at DESC`
	)
		.bind(locals.user.id)
		.all();

	const schedules = (result.results || []).map((row: Record<string, unknown>) => ({
		id: row.id,
		name: row.name,
		prompt: row.prompt,
		provider: row.provider,
		model: row.model,
		aspectRatio: row.aspect_ratio,
		frequency: row.frequency,
		enabled: row.enabled === 1,
		lastRunAt: row.last_run_at,
		nextRunAt: row.next_run_at,
		totalRuns: row.total_runs,
		maxRuns: row.max_runs,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	}));

	return json({ schedules });
};

/**
 * POST /api/video/schedules
 * Create a new video schedule
 */
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env) {
		throw error(500, 'Platform not available');
	}

	const body = await request.json();
	const { name, prompt, frequency, model, aspectRatio, maxRuns } = body as {
		name?: string;
		prompt?: string;
		frequency?: string;
		model?: string;
		aspectRatio?: string;
		maxRuns?: number;
	};

	if (!name || typeof name !== 'string' || name.trim().length === 0) {
		throw error(400, 'Name is required');
	}

	if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
		throw error(400, 'Prompt is required');
	}

	if (prompt.length > 4000) {
		throw error(400, 'Prompt too long (max 4000 characters)');
	}

	const freq = frequency || 'daily';
	if (!VALID_FREQUENCIES.includes(freq)) {
		throw error(400, `Invalid frequency. Must be one of: ${VALID_FREQUENCIES.join(', ')}`);
	}

	// A recurring schedule is the "scheduled posts" allowance: 20 a month on Starter.
	// Charged when the schedule is created, since that is the act the plan sells —
	// each individual run then pays for its own video out of the video allowance.
	const plan = await resolvePlan(platform.env.DB, locals.user.id);
	await consumeUsage(platform.env.DB, locals.user.id, 'scheduledPosts', plan);

	const scheduleId = crypto.randomUUID();
	const nextRunAt = computeNextRun(freq);

	await platform.env.DB.prepare(
		`INSERT INTO video_schedules (id, user_id, name, prompt, provider, model, aspect_ratio, frequency, enabled, next_run_at, max_runs, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, datetime('now'), datetime('now'))`
	)
		.bind(
			scheduleId,
			locals.user.id,
			name.trim(),
			prompt.trim(),
			'openai',
			model || 'sora',
			aspectRatio || '16:9',
			freq,
			nextRunAt,
			maxRuns ?? null
		)
		.run();

	return json({
		success: true,
		schedule: {
			id: scheduleId,
			name: name.trim(),
			prompt: prompt.trim(),
			provider: 'openai',
			model: model || 'sora',
			aspectRatio: aspectRatio || '16:9',
			frequency: freq,
			enabled: true,
			nextRunAt,
			totalRuns: 0,
			maxRuns: maxRuns ?? null,
			lastRunAt: null
		}
	});
};
