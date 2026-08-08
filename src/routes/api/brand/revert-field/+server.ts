/**
 * POST /api/brand/revert-field - Revert a brand field to a specific version
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBrandProfile } from '$lib/services/onboarding';
import { revertFieldToVersion } from '$lib/services/brand';

export const POST: RequestHandler = async ({ locals, platform, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const body = await request.json();
	const { profileId, fieldName, versionId } = body;

	if (!profileId || !fieldName || !versionId) {
		throw error(400, 'profileId, fieldName, and versionId are required');
	}

	// Verify profile belongs to user
	const profile = await getBrandProfile(platform!.env.DB, profileId);
	if (!profile) {
		throw error(404, 'Profile not found');
	}
	if (profile.userId !== locals.user.id) {
		throw error(403, 'Forbidden');
	}

	try {
		await revertFieldToVersion(platform!.env.DB, {
			profileId,
			userId: locals.user.id,
			fieldName,
			versionId
		});
	} catch (err) {
		if (err instanceof Error && err.message === 'Version not found') {
			throw error(404, 'Version not found');
		}
		throw err;
	}

	// Return updated profile
	const updatedProfile = await getBrandProfile(platform!.env.DB, profileId);
	return json({ profile: updatedProfile });
};
