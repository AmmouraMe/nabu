import type { ServerLoad } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';

export const load: ServerLoad = async ({ platform, locals, url }) => {
	// Require authentication
	if (!locals.user) {
		throw redirect(302, '/auth/login?redirect=/onboarding/archive');
	}

	// Get brand profile ID — either from query param or find active profile
	let brandProfileId = url.searchParams.get('brand') || null;

	if (!brandProfileId && platform?.env?.DB) {
		try {
			const profile = await platform.env.DB.prepare(
				"SELECT id FROM brand_profiles WHERE user_id = ? AND status != 'archived' ORDER BY updated_at DESC LIMIT 1"
			)
				.bind(locals.user.id)
				.first<{ id: string }>();

			if (profile) {
				brandProfileId = profile.id;
			}
		} catch (err) {
			console.error('Failed to find brand profile:', err);
		}
	}

	return {
		brandProfileId
	};
};
