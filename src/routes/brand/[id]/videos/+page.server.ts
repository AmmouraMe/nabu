import type { ServerLoad } from '@sveltejs/kit';
import { redirect, error } from '@sveltejs/kit';
import { googleKvKey } from '$lib/services/video/veo3';

interface VideoItem {
  id: string;
  title: string | null;
  body: string | null;
  platform: string;
  status: string;
  created_at: string;
  external_url: string | null;
  error_message: string | null;
}

export const load: ServerLoad = async ({ platform, locals, params }) => {
  if (!locals.user) {
    throw redirect(302, `/auth/login?redirect=/brand/${params.id}/videos`);
  }

  const db = platform!.env.DB;
  const kv = platform!.env.KV;

  const profile = await db
    .prepare('SELECT id, brand_name FROM brand_profiles WHERE id = ? AND user_id = ?')
    .bind(params.id, locals.user.id)
    .first<{ id: string; brand_name: string | null }>();

  if (!profile) throw error(404, 'Brand not found');

  const brand = await db
    .prepare('SELECT id FROM brands WHERE brand_profile_id = ? AND user_id = ?')
    .bind(params.id, locals.user.id)
    .first<{ id: string }>();

  const googleRaw = await kv.get(googleKvKey(locals.user.id));

  let videos: VideoItem[] = [];
  if (brand) {
    const result = await db
      .prepare(
        `SELECT id, title, body, platform, status, created_at, external_url, error_message
         FROM brand_content_items
         WHERE brand_id = ? AND type = 'video'
         ORDER BY created_at DESC
         LIMIT 50`
      )
      .bind(brand.id)
      .all<VideoItem>();
    videos = result.results ?? [];
  }

  return {
    brandProfileId: params.id,
    brandId: brand?.id ?? null,
    brandName: profile.brand_name ?? 'Untitled Brand',
    googleConnected: !!googleRaw,
    videos
  };
};
