import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import {
	createMediaVariant,
	getMediaVariants,
	deleteMediaVariant
} from '$lib/services/brand-assets';

/**
 * GET /api/brand/assets/variants
 * List variants for a media asset
 */
export const GET: RequestHandler = async ({ url, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB) throw error(500, 'Platform not available');

	const brandMediaId = url.searchParams.get('brandMediaId');
	if (!brandMediaId) throw error(400, 'brandMediaId required');

	const variants = await getMediaVariants(platform.env.DB, brandMediaId);
	return json({ variants });
};

/**
 * POST /api/brand/assets/variants
 * Create a variant for a media asset
 */
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB) throw error(500, 'Platform not available');

	const body = await request.json();
	const { brandMediaId, variantType, label } = body;

	if (!brandMediaId || !variantType || !label) {
		throw error(400, 'Missing required fields');
	}

	const variant = await createMediaVariant(platform.env.DB, body);
	return json({ variant }, { status: 201 });
};

/**
 * DELETE /api/brand/assets/variants
 * Delete a specific variant
 */
export const DELETE: RequestHandler = async ({ url, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB) throw error(500, 'Platform not available');

	const id = url.searchParams.get('id');
	if (!id) throw error(400, 'id required');

	await deleteMediaVariant(platform.env.DB, id);
	return json({ success: true });
};
