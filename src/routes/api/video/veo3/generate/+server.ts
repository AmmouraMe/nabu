/**
 * POST /api/video/veo3/generate
 * Body: { brandId: string, prompt: string, platform?: string, aspectRatio?: string, durationSeconds?: number }
 * Returns: { itemId, operationName, status }
 *
 * Requires Google AI API key stored in KV as google:apikey:{userId}
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateVideo, googleKvKey, type Veo3Options } from '$lib/services/video/veo3';
import { consumeUsage, releaseUsage, resolvePlan } from '$lib/server/entitlements';

interface RequestBody {
	brandId: string;
	prompt: string;
	platform?: string;
	aspectRatio?: string;
	durationSeconds?: number;
	fps?: number;
}

export const POST: RequestHandler = async ({ locals, platform, request }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = (await request.json()) as RequestBody;
	const { brandId, prompt } = body;
	const videoPlatform = body.platform ?? 'generic';

	if (!brandId || !prompt?.trim()) {
		throw error(400, 'brandId and prompt are required');
	}

	const db = platform!.env.DB;
	const kv = platform!.env.KV;

	const brand = await db
		.prepare('SELECT id FROM brands WHERE id = ? AND user_id = ?')
		.bind(brandId, locals.user.id)
		.first<{ id: string }>();

	if (!brand) throw error(404, 'Brand not found');

	const apiKey = await kv.get(googleKvKey(locals.user.id));
	if (!apiKey) throw error(400, 'Google AI API key not configured. Add it in Connect Accounts.');

	const opts: Veo3Options = {
		aspectRatio: body.aspectRatio ?? '16:9',
		durationSeconds: body.durationSeconds ?? 5,
		fps: body.fps ?? 24
	};

	// Veo 3 is a second door onto the same allowance as /api/video/generate. Gating
	// only the other one would leave this as a way around the free tier's two videos
	// a month, so it is charged here too.
	const plan = await resolvePlan(db, locals.user.id);
	await consumeUsage(db, locals.user.id, 'aiVideoGenerations', plan);

	let result;
	try {
		result = await generateVideo(apiKey, prompt.trim(), opts);
	} catch (err) {
		await releaseUsage(db, locals.user.id, 'aiVideoGenerations');
		throw err;
	}

	const itemId = crypto.randomUUID();
	await db
		.prepare(
			`INSERT INTO brand_content_items (id, brand_id, type, platform, title, body, status, created_at)
       VALUES (?, ?, 'video', ?, ?, ?, 'draft', datetime('now'))`
		)
		.bind(
			itemId,
			brandId,
			videoPlatform,
			prompt.slice(0, 200),
			result.operationName ?? result.videoUrl ?? ''
		)
		.run();

	return json({
		itemId,
		operationName: result.operationName,
		videoUrl: result.videoUrl,
		status: result.status
	});
};
