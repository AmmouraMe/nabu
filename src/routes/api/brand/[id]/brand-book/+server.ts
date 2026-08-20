/**
 * GET /api/brand/[id]/brand-book?mode=light|dark
 * Serves the stored brand book HTML from R2.
 *
 * POST /api/brand/[id]/brand-book
 * Body: { mode: 'light' | 'dark' }
 * Generates brand book HTML, stores it in R2, and updates brand_book_generated_at.
 */
import { error } from '@sveltejs/kit';
import { requireFeature, resolvePlan } from '$lib/server/entitlements';
import type { RequestHandler } from './$types';
import {
	generateBrandBookHtml,
	brandBookR2Key,
	type BrandBookProfile
} from '$lib/services/brand-book';

const PROFILE_QUERY = `
  SELECT
    id, brand_name, tagline, mission_statement,
    primary_color, secondary_color, accent_color, color_palette,
    background_color, surface_color, text_color, text_secondary_color, border_color,
    typography_heading, typography_body, typography_logo,
    logo_url, logo_horizontal_url,
    tone_of_voice, communication_style, brand_personality_traits,
    target_audience, value_proposition, unique_selling_points,
    brand_values, brand_archetype, industry
  FROM brand_profiles
  WHERE id = ? AND user_id = ?
`;

function parseMode(raw: string | null): 'light' | 'dark' {
	return raw === 'dark' ? 'dark' : 'light';
}

export const GET: RequestHandler = async ({ locals, platform, params, url }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const mode = parseMode(url.searchParams.get('mode'));
	const db = platform!.env.DB;
	const bucket = platform!.env.BUCKET;

	const profile = await db
		.prepare('SELECT id FROM brand_profiles WHERE id = ? AND user_id = ?')
		.bind(params.id, locals.user.id)
		.first<{ id: string }>();

	if (!profile) throw error(404, 'Brand not found');

	const key = brandBookR2Key(params.id, mode);
	const obj = await bucket.get(key);
	if (!obj) throw error(404, 'Brand book not yet generated. POST to generate it first.');

	const html = await obj.text();
	return new Response(html, {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Content-Disposition': `attachment; filename="${encodeURIComponent(profile.id)}-brand-book-${mode}.html"`
		}
	});
};

export const POST: RequestHandler = async ({ locals, platform, params, request }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = (await request.json().catch(() => ({}))) as { mode?: string };
	const mode = parseMode(body.mode ?? null);

	const db = platform!.env.DB;
	const bucket = platform!.env.BUCKET;

	const profile = await db
		.prepare(PROFILE_QUERY)
		.bind(params.id, locals.user.id)
		.first<BrandBookProfile>();

	if (!profile) throw error(404, 'Brand not found');

	// "Brand export & guidelines PDF" — Pro and above. Checked on generation only:
	// the GET below still serves a brand book generated while the account was on a
	// paid plan, because taking away something already produced is a different and
	// much ruder thing than declining to produce a new one.
	const plan = await resolvePlan(db, locals.user.id);
	requireFeature(plan, 'brandExport');

	const html = generateBrandBookHtml(profile, mode);
	const key = brandBookR2Key(params.id, mode);

	await bucket.put(key, html, {
		httpMetadata: { contentType: 'text/html; charset=utf-8' }
	});

	await db
		.prepare(`UPDATE brand_profiles SET brand_book_generated_at = datetime('now') WHERE id = ?`)
		.bind(params.id)
		.run();

	return new Response(
		JSON.stringify({
			key,
			mode,
			downloadPath: `/api/brand/${params.id}/brand-book?mode=${mode}`
		}),
		{ headers: { 'Content-Type': 'application/json' } }
	);
};
