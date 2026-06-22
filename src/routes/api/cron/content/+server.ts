/**
 * GET /api/cron/content
 * Weekly content generation cron endpoint.
 * Called by a Cloudflare Worker cron trigger (or any scheduler) with:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Generates a 4-week content calendar for every brand with auto_schedule=1
 * and saves all entries as draft content_items.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  generateContentCalendar,
  type ContentBrand
} from '$lib/services/content-generator';

interface BrandRow {
  id: string;
  user_id: string;
  name: string;
  tagline: string | null;
  voice_tone: string | null;
  target_audience: string | null;
  niche: string | null;
}

const PLATFORM_TO_TYPE: Record<string, string> = {
  devto: 'article',
  linkedin: 'update',
  twitter: 'update',
  email: 'post'
};

export const GET: RequestHandler = async ({ platform, request }) => {
  // Bearer token auth check
  const cronSecret = platform?.env?.CRON_SECRET;
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!cronSecret || token !== cronSecret) {
    throw error(401, 'Unauthorized');
  }

  const db = platform!.env.DB;
  const ai = platform!.env.AI;

  if (!ai) throw error(503, 'AI binding not configured');

  const { results: brands } = await db
    .prepare('SELECT * FROM brands WHERE auto_schedule = 1')
    .all<BrandRow>();

  const summary: { brandId: string; brandName: string; generated: number; failed: number }[] = [];

  for (const brand of brands ?? []) {
    let generated = 0;
    let failed = 0;

    try {
      const contentBrand: ContentBrand = {
        name: brand.name,
        tagline: brand.tagline,
        voice_tone: brand.voice_tone,
        target_audience: brand.target_audience,
        niche: brand.niche
      };

      const calendar = await generateContentCalendar(ai, contentBrand, 4);

      for (const entry of calendar) {
        for (const plt of entry.platforms) {
          try {
            const type = PLATFORM_TO_TYPE[plt] ?? 'post';
            const id = crypto.randomUUID();
            await db
              .prepare(
                `INSERT INTO content_items (id, brand_id, type, platform, title, body, status, created_at)
                 VALUES (?, ?, ?, ?, ?, '', 'draft', datetime('now'))`
              )
              .bind(id, brand.id, type, plt, entry.topic)
              .run();
            generated++;
          } catch {
            failed++;
          }
        }
      }
    } catch (err) {
      failed++;
      console.error(`Cron: failed to generate calendar for brand ${brand.id}:`, err);
    }

    summary.push({ brandId: brand.id, brandName: brand.name, generated, failed });
  }

  return json({ ok: true, brandsProcessed: brands?.length ?? 0, summary });
};
