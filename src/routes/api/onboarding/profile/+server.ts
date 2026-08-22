/**
 * GET /api/onboarding/profile - Get current user's brand profile
 *   ?id=<profileId> - Get a specific brand profile (verified ownership)
 *   (no id)         - Get the most recently updated active profile
 * POST /api/onboarding/profile - Create a new brand profile
 * PATCH /api/onboarding/profile - Update brand profile
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createBrandProfile,
	getBrandProfile,
	getBrandProfileByUser,
	updateBrandProfile
} from '$lib/services/onboarding';
import { requireBrandAccess } from '$lib/server/brand-access';

export const GET: RequestHandler = async ({ locals, platform, url }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const profileId = url.searchParams.get('id');

	if (profileId) {
		const profile = await getBrandProfile(platform!.env.DB, profileId);
		if (!profile) {
			throw error(404, 'Profile not found');
		}
		if (profile.userId !== locals.user.id) {
			throw error(403, 'Forbidden');
		}
		return json({ profile });
	}

	const profile = await getBrandProfileByUser(platform!.env.DB, locals.user.id);
	return json({ profile });
};

export const POST: RequestHandler = async ({ locals, platform }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const profile = await createBrandProfile(platform!.env.DB, locals.user.id);
	return json({ profile });
};

export const PATCH: RequestHandler = async ({ locals, platform, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const body = await request.json();
	const { profileId, updates } = body;

	if (!profileId || !updates) {
		throw error(400, 'profileId and updates are required');
	}

	await requireBrandAccess(platform!.env.DB, locals.user.id, profileId, 'write');
	// When brand name is explicitly set, auto-confirm it
	if (updates.brandName !== undefined && updates.brandNameConfirmed === undefined) {
		updates.brandNameConfirmed = true;
	}
	await updateBrandProfile(platform!.env.DB, profileId, updates);
	const profile = await getBrandProfile(platform!.env.DB, profileId);

	return json({ profile });
};
