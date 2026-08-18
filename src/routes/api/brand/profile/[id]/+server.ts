/**
 * DELETE /api/brand/profile/[id] - Archive (soft-delete) a brand profile
 * PATCH  /api/brand/profile/[id] - Unarchive (restore) a brand profile
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getBrandProfile,
	archiveBrandProfile,
	unarchiveBrandProfile
} from '$lib/services/onboarding';

export const DELETE: RequestHandler = async ({ locals, platform, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const { id } = params;

	// Verify profile exists and belongs to user
	const profile = await getBrandProfile(platform!.env.DB, id);
	if (!profile) {
		throw error(404, 'Profile not found');
	}
	if (profile.userId !== locals.user.id) {
		throw error(403, 'Forbidden');
	}

	await archiveBrandProfile(platform!.env.DB, id);

	return json({ success: true });
};

export const PATCH: RequestHandler = async ({ locals, platform, params, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const { id } = params;

	// Verify profile exists and belongs to user
	const profile = await getBrandProfile(platform!.env.DB, id);
	if (!profile) {
		throw error(404, 'Profile not found');
	}
	if (profile.userId !== locals.user.id) {
		throw error(403, 'Forbidden');
	}

	const body = await request.json();

	if (body.action === 'unarchive') {
		if (profile.status !== 'archived') {
			throw error(400, 'Profile is not archived');
		}
		await unarchiveBrandProfile(platform!.env.DB, id);
		return json({ success: true });
	}

	throw error(400, 'Invalid action');
};
