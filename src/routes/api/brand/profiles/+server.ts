/**
 * GET /api/brand/profiles - List all brand profiles for the current user
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAllBrandProfilesByUser } from '$lib/services/brand';

export const GET: RequestHandler = async ({ locals, platform }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const profiles = await getAllBrandProfilesByUser(platform!.env.DB, locals.user.id);

	return json({ profiles });
};
