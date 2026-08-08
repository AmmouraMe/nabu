import type { ServerLoad } from '@sveltejs/kit';
import { redirect, error } from '@sveltejs/kit';

export const load: ServerLoad = async ({ platform, locals, params }) => {
	if (!locals.user) {
		throw redirect(302, `/auth/login?redirect=/brand/${params.id}/content`);
	}

	const db = platform!.env.DB;

	// Verify the brand_profile belongs to this user
	const profile = await db
		.prepare(
			'SELECT id, brand_name, tagline, tone_of_voice, target_audience, industry FROM brand_profiles WHERE id = ? AND user_id = ?'
		)
		.bind(params.id, locals.user.id)
		.first<{
			id: string;
			brand_name: string | null;
			tagline: string | null;
			tone_of_voice: string | null;
			target_audience: string | null;
			industry: string | null;
		}>();

	if (!profile) throw error(404, 'Brand not found');

	// Find or create a content-automation brands entry for this profile
	let brand = await db
		.prepare('SELECT * FROM brands WHERE brand_profile_id = ? AND user_id = ?')
		.bind(params.id, locals.user.id)
		.first<{ id: string; name: string; auto_schedule: number }>();

	if (!brand) {
		const brandId = crypto.randomUUID();
		await db
			.prepare(
				`INSERT INTO brands (id, user_id, brand_profile_id, name, tagline, voice_tone, target_audience, niche, auto_schedule, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))`
			)
			.bind(
				brandId,
				locals.user.id,
				params.id,
				profile.brand_name ?? 'Untitled Brand',
				profile.tagline ?? null,
				profile.tone_of_voice ?? null,
				profile.target_audience ?? null,
				profile.industry ?? null
			)
			.run();

		brand = { id: brandId, name: profile.brand_name ?? 'Untitled Brand', auto_schedule: 0 };
	}

	return {
		userId: locals.user.id,
		brandProfileId: params.id,
		brandId: brand.id,
		brandName: brand.name,
		autoSchedule: brand.auto_schedule === 1
	};
};
