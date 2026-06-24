import type { ServerLoad } from '@sveltejs/kit';
import { redirect, error } from '@sveltejs/kit';

export const load: ServerLoad = async ({ platform, locals, params }) => {
  if (!locals.user) {
    throw redirect(302, `/auth/login?redirect=/brand/${params.id}/connect`);
  }

  const db = platform!.env.DB;
  const kv = platform!.env.KV;

  // Verify the brand_profile belongs to this user
  const profile = await db
    .prepare('SELECT id, brand_name FROM brand_profiles WHERE id = ? AND user_id = ?')
    .bind(params.id, locals.user.id)
    .first<{ id: string; brand_name: string | null }>();

  if (!profile) throw error(404, 'Brand not found');

  const devtoKey = `devto:apikey:${locals.user.id}`;
  const linkedinKey = `linkedin:token:${locals.user.id}`;
  const googleKey = `google:apikey:${locals.user.id}`;

  const [devtoRaw, linkedinRaw, googleRaw] = await Promise.all([
    kv.get(devtoKey),
    kv.get(linkedinKey),
    kv.get(googleKey)
  ]);

  return {
    userId: locals.user.id,
    brandProfileId: params.id,
    brandName: profile.brand_name ?? 'Untitled Brand',
    devtoConnected: !!devtoRaw,
    linkedinConnected: !!linkedinRaw,
    googleConnected: !!googleRaw
  };
};
