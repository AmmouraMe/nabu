/**
 * POST /api/connect/devto  — save Dev.to API key to KV
 * DELETE /api/connect/devto — remove Dev.to API key from KV
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { devtoKvKey, getArticles } from '$lib/services/publishers/devto';

export const POST: RequestHandler = async ({ locals, platform, request }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const { apiKey } = (await request.json()) as { apiKey: string };
  if (!apiKey?.trim()) throw error(400, 'apiKey is required');

  // Validate the key works before storing
  try {
    await getArticles(apiKey.trim());
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid API key';
    throw error(400, `Dev.to validation failed: ${msg}`);
  }

  const kv = platform!.env.KV;
  const db = platform!.env.DB;
  const kvKey = devtoKvKey(locals.user.id);

  await kv.put(kvKey, apiKey.trim());

  // Track the connection in publishing_accounts
  const existing = await db
    .prepare('SELECT id FROM publishing_accounts WHERE user_id = ? AND platform = ?')
    .bind(locals.user.id, 'devto')
    .first<{ id: string }>();

  if (!existing) {
    await db
      .prepare(
        `INSERT INTO publishing_accounts (id, user_id, platform, kv_key, connected_at)
         VALUES (?, ?, 'devto', ?, datetime('now'))`
      )
      .bind(crypto.randomUUID(), locals.user.id, kvKey)
      .run();
  } else {
    await db
      .prepare(
        `UPDATE publishing_accounts SET kv_key = ?, connected_at = datetime('now') WHERE user_id = ? AND platform = 'devto'`
      )
      .bind(kvKey, locals.user.id)
      .run();
  }

  return json({ success: true });
};

export const DELETE: RequestHandler = async ({ locals, platform }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const kv = platform!.env.KV;
  const db = platform!.env.DB;

  await kv.delete(devtoKvKey(locals.user.id));
  await db
    .prepare("DELETE FROM publishing_accounts WHERE user_id = ? AND platform = 'devto'")
    .bind(locals.user.id)
    .run();

  return json({ success: true });
};
