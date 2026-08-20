/**
 * GET /api/brand/profile - Get a brand profile with field summaries
 *
 * Query params:
 *   ?id=<profileId>  - Get a specific brand profile (verified ownership)
 *   (no id)          - Get the most recently updated active brand profile
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBrandProfileByUser } from '$lib/services/onboarding';
import { getBrandFieldsSummary, getBrandProfileForUser } from '$lib/services/brand';

export const GET: RequestHandler = async ({ locals, platform, url }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const profileId = url.searchParams.get('id');
	let profile;

	if (profileId) {
		// Fetch specific brand profile, verified to belong to user
		profile = await getBrandProfileForUser(platform!.env.DB, profileId, locals.user.id);
		if (!profile) {
			throw error(404, 'Profile not found');
		}
	} else {
		// Backward compatible: get the latest active profile
		profile = await getBrandProfileByUser(platform!.env.DB, locals.user.id);
	}

	if (!profile) {
		return json({ profile: null, sections: [] });
	}

	const sections = getBrandFieldsSummary(profile);

	return json({ profile, sections });
};
