/**
 * GET /api/video/veo3/status?operationName=operations%2Fxyz&itemId=...
 * Polls the status of a Veo 3 long-running operation.
 * If done, updates the content_item body with the video URL.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pollOperation, googleKvKey } from '$lib/services/video/veo3';

export const GET: RequestHandler = async ({ locals, platform, url }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const operationName = url.searchParams.get('operationName');
  const itemId = url.searchParams.get('itemId');

  if (!operationName) throw error(400, 'operationName is required');

  const kv = platform!.env.KV;
  const db = platform!.env.DB;

  const apiKey = await kv.get(googleKvKey(locals.user.id));
  if (!apiKey) throw error(400, 'Google AI API key not configured');

  const result = await pollOperation(apiKey, operationName);

  if (result.done && result.videoUrl && itemId) {
    await db
      .prepare(
        `UPDATE content_items SET body = ?, status = 'published', published_at = datetime('now'), external_url = ?
         WHERE id = ? AND brand_id IN (SELECT id FROM brands WHERE user_id = ?)`
      )
      .bind(result.videoUrl, result.videoUrl, itemId, locals.user.id)
      .run();
  } else if (result.done && result.error && itemId) {
    await db
      .prepare(
        `UPDATE content_items SET status = 'failed', error_message = ?
         WHERE id = ? AND brand_id IN (SELECT id FROM brands WHERE user_id = ?)`
      )
      .bind(result.error, itemId, locals.user.id)
      .run();
  }

  return json(result);
};
