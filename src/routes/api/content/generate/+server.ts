/**
 * POST /api/content/generate
 * Generates content for one or more platforms using Workers AI,
 * saves each piece as a draft content_item in D1.
 *
 * Body: { brandId: string, topic: string, platforms: string[] }
 * Supported platforms: devto | linkedin
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  generateDevToPost,
  generateLinkedInUpdate,
  generateVideoScript,
  type ContentBrand
} from '$lib/services/content-generator';
import { generateVideo, googleKvKey } from '$lib/services/video/veo3';

interface RequestBody {
  brandId: string;
  topic: string;
  platforms: string[];
}

export const POST: RequestHandler = async ({ locals, platform, request }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const body = (await request.json()) as RequestBody;
  const { brandId, topic, platforms } = body;

  if (!brandId || !topic || !Array.isArray(platforms) || platforms.length === 0) {
    throw error(400, 'brandId, topic, and platforms are required');
  }

  const db = platform!.env.DB;
  const ai = platform!.env.AI;

  if (!ai) throw error(503, 'AI binding not configured');

  // Verify brand belongs to user
  const brand = await db
    .prepare('SELECT * FROM brands WHERE id = ? AND user_id = ?')
    .bind(brandId, locals.user.id)
    .first<ContentBrand & { id: string; user_id: string }>();

  if (!brand) throw error(404, 'Brand not found');

  const contentBrand: ContentBrand = {
    name: brand.name,
    tagline: brand.tagline,
    voice_tone: brand.voice_tone,
    target_audience: brand.target_audience,
    niche: brand.niche
  };

  const created: { id: string; platform: string; status: string }[] = [];
  const failures: { platform: string; error: string }[] = [];

  for (const plt of platforms) {
    try {
      let title: string | null = null;
      let body_text: string | null = null;
      let type: string;

      if (plt === 'devto') {
        const post = await generateDevToPost(ai, contentBrand, topic);
        title = post.title;
        body_text = post.body;
        type = 'article';
      } else if (plt === 'linkedin') {
        const update = await generateLinkedInUpdate(ai, contentBrand, topic);
        body_text = update.text;
        title = topic;
        type = 'update';
      } else if (plt === 'youtube' || plt === 'tiktok' || plt === 'generic') {
        const scriptResult = await generateVideoScript(ai, contentBrand, topic);
        title = scriptResult.title;
        body_text = scriptResult.script;
        type = 'video';

        // Optionally kick off Veo 3 if a Google API key is configured
        const googleKey = await platform!.env.KV.get(googleKvKey(locals.user.id));
        if (googleKey) {
          const veoResult = await generateVideo(googleKey, scriptResult.script, {
            durationSeconds: scriptResult.durationSeconds
          }).catch(() => null);
          if (veoResult?.operationName) {
            body_text = veoResult.operationName;
          } else if (veoResult?.videoUrl) {
            body_text = veoResult.videoUrl;
          }
        }
      } else {
        failures.push({ platform: plt, error: 'Unsupported platform' });
        continue;
      }

      const id = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO brand_content_items (id, brand_id, type, platform, title, body, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'draft', datetime('now'))`
        )
        .bind(id, brandId, type, plt, title, body_text)
        .run();

      created.push({ id, platform: plt, status: 'draft' });
    } catch (err) {
      failures.push({
        platform: plt,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  return json({ created, failures });
};
