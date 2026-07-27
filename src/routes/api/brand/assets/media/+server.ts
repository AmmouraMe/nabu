import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import {
	createBrandMedia,
	getBrandMedia,
	getBrandMediaByType,
	getBrandMediaByCategory,
	updateBrandMedia,
	deleteBrandMedia,
	getLogoAssets
} from '$lib/services/brand-assets';
import { brandOfMedia, requireAssetAccess, requireBrandAccess } from '$lib/server/brand-access';

/**
 * GET /api/brand/assets/media
 * List media assets for a brand profile
 */
export const GET: RequestHandler = async ({ url, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB) throw error(500, 'Platform not available');

	const brandProfileId = url.searchParams.get('brandProfileId');
	if (!brandProfileId) throw error(400, 'brandProfileId required');

	await requireBrandAccess(platform.env.DB, locals.user.id, brandProfileId, 'read');

	const mediaType = url.searchParams.get('mediaType');
	const category = url.searchParams.get('category');

	// Special endpoint for logos with variants
	if (url.searchParams.get('logos') === 'true') {
		const logos = await getLogoAssets(platform.env.DB, brandProfileId);
		return json({ logos });
	}

	let media;
	if (mediaType && category) {
		media = await getBrandMediaByCategory(platform.env.DB, brandProfileId, mediaType, category);
	} else if (mediaType) {
		media = await getBrandMediaByType(platform.env.DB, brandProfileId, mediaType);
	} else {
		media = await getBrandMedia(platform.env.DB, brandProfileId);
	}

	return json({ media });
};

/**
 * POST /api/brand/assets/media
 * Create a media asset
 */
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB) throw error(500, 'Platform not available');

	const body = await request.json();
	const { brandProfileId, mediaType, category, name } = body;

	if (!brandProfileId || !mediaType || !category || !name) {
		throw error(400, 'Missing required fields');
	}

	await requireBrandAccess(platform.env.DB, locals.user.id, brandProfileId, 'write');

	const media = await createBrandMedia(platform.env.DB, body);
	return json({ media }, { status: 201 });
};

/**
 * PATCH /api/brand/assets/media
 * Update a media asset
 */
export const PATCH: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB) throw error(500, 'Platform not available');

	const body = await request.json();
	const { id, ...updates } = body;

	if (!id) throw error(400, 'id required');

	// Addressed by asset id, so the brand comes from the row rather than the caller —
	// a `brandProfileId` in the body would be the caller's claim, not a fact.
	await requireAssetAccess(
		platform.env.DB,
		locals.user.id,
		await brandOfMedia(platform.env.DB, id),
		'write'
	);

	await updateBrandMedia(platform.env.DB, id, updates);
	return json({ success: true });
};

/**
 * DELETE /api/brand/assets/media
 * Delete a media asset and its variants
 */
export const DELETE: RequestHandler = async ({ url, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB) throw error(500, 'Platform not available');

	const id = url.searchParams.get('id');
	if (!id) throw error(400, 'id required');

	await requireAssetAccess(
		platform.env.DB,
		locals.user.id,
		await brandOfMedia(platform.env.DB, id),
		'write'
	);

	await deleteBrandMedia(platform.env.DB, id);
	return json({ success: true });
};
