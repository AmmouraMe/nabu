/**
 * GET /api/brand/field-history/[profileId]/[fieldName] - Get version history for a field
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBrandProfile } from '$lib/services/onboarding';
import { getFieldHistory } from '$lib/services/brand';

export const GET: RequestHandler = async ({ locals, platform, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const { profileId, fieldName } = params;

	// Verify profile belongs to user
	const profile = await getBrandProfile(platform!.env.DB, profileId);
	if (!profile) {
		throw error(404, 'Profile not found');
	}
	if (profile.userId !== locals.user.id) {
		throw error(403, 'Forbidden');
	}

	const history = await getFieldHistory(platform!.env.DB, profileId, fieldName);

	return json({ history });
};
