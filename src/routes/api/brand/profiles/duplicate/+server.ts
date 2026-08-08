/**
 * POST /api/brand/profiles/duplicate - Duplicate an existing brand profile
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { duplicateBrandProfile } from '$lib/services/brand';

export const POST: RequestHandler = async ({ locals, platform, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const body = await request.json();
	const { sourceProfileId } = body;

	if (!sourceProfileId) {
		throw error(400, 'sourceProfileId is required');
	}

	try {
		const newProfile = await duplicateBrandProfile(
			platform!.env.DB,
			sourceProfileId,
			locals.user.id
		);

		return json({ profile: newProfile }, { status: 201 });
	} catch (err) {
		if (err instanceof Error && err.message === 'Source profile not found') {
			throw error(404, 'Source profile not found');
		}
		throw err;
	}
};
