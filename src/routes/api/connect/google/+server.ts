/**
 * POST /api/connect/google
 * Body: { apiKey: string }
 * Saves a Google AI API key to KV for Veo 3 video generation.
 *
 * DELETE /api/connect/google
 * Removes the Google AI API key.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { googleKvKey } from '$lib/services/video/veo3';

export const POST: RequestHandler = async ({ locals, platform, request }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = (await request.json()) as { apiKey?: string };
	const apiKey = body.apiKey?.trim();
	if (!apiKey) throw error(400, 'apiKey is required');

	const kv = platform!.env.KV;
	const db = platform!.env.DB;

	await kv.put(googleKvKey(locals.user.id), apiKey);

	await db
		.prepare(
			`INSERT INTO publishing_accounts (id, user_id, platform, kv_key, connected_at)
       VALUES (?, ?, 'google', ?, datetime('now'))
       ON CONFLICT (user_id, platform) DO UPDATE SET kv_key = excluded.kv_key, connected_at = excluded.connected_at`
		)
		.bind(crypto.randomUUID(), locals.user.id, googleKvKey(locals.user.id))
		.run();

	return json({ connected: true });
};

export const DELETE: RequestHandler = async ({ locals, platform }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const kv = platform!.env.KV;
	const db = platform!.env.DB;

	await kv.delete(googleKvKey(locals.user.id));

	await db
		.prepare(`DELETE FROM publishing_accounts WHERE user_id = ? AND platform = 'google'`)
		.bind(locals.user.id)
		.run();

	return json({ connected: false });
};
