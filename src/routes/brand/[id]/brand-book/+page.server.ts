import type { PageServerLoad } from './$types';
import { redirect, error } from '@sveltejs/kit';
import { brandBookR2Key } from '$lib/services/brand-book';

export const load: PageServerLoad = async ({ platform, locals, params }) => {
	if (!locals.user) {
		throw redirect(302, `/auth/login?redirect=/brand/${params.id}/brand-book`);
	}

	const db = platform!.env.DB;
	const bucket = platform!.env.BUCKET;

	const profile = await db
		.prepare(
			`SELECT id, brand_name, tagline, primary_color, secondary_color, accent_color,
              logo_url, typography_heading, tone_of_voice, brand_book_generated_at
       FROM brand_profiles WHERE id = ? AND user_id = ?`
		)
		.bind(params.id, locals.user.id)
		.first<{
			id: string;
			brand_name: string | null;
			tagline: string | null;
			primary_color: string | null;
			secondary_color: string | null;
			accent_color: string | null;
			logo_url: string | null;
			typography_heading: string | null;
			tone_of_voice: string | null;
			brand_book_generated_at: string | null;
		}>();

	if (!profile) throw error(404, 'Brand not found');

	// Check which modes have been generated in R2
	const [lightObj, darkObj] = await Promise.all([
		bucket.head(brandBookR2Key(params.id, 'light')),
		bucket.head(brandBookR2Key(params.id, 'dark'))
	]);

	return {
		brandProfileId: params.id,
		brandName: profile.brand_name ?? 'Untitled Brand',
		tagline: profile.tagline,
		primaryColor: profile.primary_color,
		secondaryColor: profile.secondary_color,
		accentColor: profile.accent_color,
		logoUrl: profile.logo_url,
		headingFont: profile.typography_heading,
		toneOfVoice: profile.tone_of_voice,
		generatedAt: profile.brand_book_generated_at,
		lightAvailable: !!lightObj,
		darkAvailable: !!darkObj
	};
};
