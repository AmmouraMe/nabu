/**
 * POST /api/connect/linkedin  — save LinkedIn token to KV
 * DELETE /api/connect/linkedin — remove LinkedIn token from KV
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { linkedInKvKey } from '$lib/services/publishers/linkedin';

export const POST: RequestHandler = async ({ locals, platform, request }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const { accessToken, authorUrn } = (await request.json()) as {
    accessToken: string;
    authorUrn: string;
  };
  if (!accessToken?.trim()) throw error(400, 'accessToken is required');
  if (!authorUrn?.trim()) throw error(400, 'authorUrn is required');

  const kv = platform!.env.KV;
  const db = platform!.env.DB;
  const kvKey = linkedInKvKey(locals.user.id);

  await kv.put(kvKey, JSON.stringify({ access_token: accessToken.trim(), author_urn: authorUrn.trim() }));

  const existing = await db
    .prepare('SELECT id FROM publishing_accounts WHERE user_id = ? AND platform = ?')
    .bind(locals.user.id, 'linkedin')
    .first<{ id: string }>();

  if (!existing) {
    await db
      .prepare(
        `INSERT INTO publishing_accounts (id, user_id, platform, kv_key, connected_at)
         VALUES (?, ?, 'linkedin', ?, datetime('now'))`
      )
      .bind(crypto.randomUUID(), locals.user.id, kvKey)
      .run();
  } else {
    await db
      .prepare(
        `UPDATE publishing_accounts SET kv_key = ?, connected_at = datetime('now') WHERE user_id = ? AND platform = 'linkedin'`
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

  await kv.delete(linkedInKvKey(locals.user.id));
  await db
    .prepare("DELETE FROM publishing_accounts WHERE user_id = ? AND platform = 'linkedin'")
    .bind(locals.user.id)
    .run();

  return json({ success: true });
};
