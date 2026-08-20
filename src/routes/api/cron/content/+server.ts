/**
 * GET /api/cron/content
 * Weekly content generation cron endpoint.
 * Called by a Cloudflare Worker cron trigger (or any scheduler) with:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Generates a 4-week content calendar for every brand with auto_schedule=1
 * and saves all entries as draft brand_content_items.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateContentCalendar, type ContentBrand } from '$lib/services/content-generator';
import {
	consumeUsage,
	entitlementRefusal,
	hasFeature,
	resolvePlan
} from '$lib/server/entitlements';

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

	const summary: {
		brandId: string;
		brandName: string;
		generated: number;
		failed: number;
		skipped?: string;
	}[] = [];

	// Plans are resolved per brand owner, not per request: this endpoint runs on a
	// schedule with a shared secret and no session, so it is the one place where AI
	// spending is not already attached to somebody's request. Left ungated it would
	// generate a four-week calendar for every free account that ever ticked
	// auto-schedule — which is exactly the "Content calendar ✗" row on the free tier.
	const planCache = new Map<string, Awaited<ReturnType<typeof resolvePlan>>>();
	async function planFor(userId: string) {
		const cached = planCache.get(userId);
		if (cached) return cached;
		const resolved = await resolvePlan(db, userId);
		planCache.set(userId, resolved);
		return resolved;
	}

	for (const brand of brands ?? []) {
		let generated = 0;
		let failed = 0;

		const plan = await planFor(brand.user_id);
		if (!hasFeature(plan, 'contentCalendar')) {
			summary.push({
				brandId: brand.id,
				brandName: brand.name,
				generated: 0,
				failed: 0,
				skipped: 'plan_feature_locked'
			});
			continue;
		}

		// The calendar is one AI call, charged as one text generation. An owner who has
		// spent the month's allowance is skipped rather than failed — nothing is wrong.
		try {
			await consumeUsage(db, brand.user_id, 'aiTextGenerations', plan);
		} catch (err) {
			if (!entitlementRefusal(err)) throw err;
			summary.push({
				brandId: brand.id,
				brandName: brand.name,
				generated: 0,
				failed: 0,
				skipped: 'plan_limit_reached'
			});
			continue;
		}

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
								`INSERT INTO brand_content_items (id, brand_id, type, platform, title, body, status, created_at)
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
