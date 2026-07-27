import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { getBrandAssetSummary } from '$lib/services/brand-assets';

/**
 * GET /api/brand/assets/summary
 * Get counts of all asset types for a brand
 */
export const GET: RequestHandler = async ({ url, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB) throw error(500, 'Platform not available');

	const brandProfileId = url.searchParams.get('brandProfileId');
	if (!brandProfileId) throw error(400, 'brandProfileId required');

	const summary = await getBrandAssetSummary(platform.env.DB, brandProfileId);
	return json({ summary });
};
