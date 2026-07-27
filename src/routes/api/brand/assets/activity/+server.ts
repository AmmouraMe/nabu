import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { getMediaActivityLog, getMediaActivityLogForAsset } from '$lib/services/media-history';
import { brandOfMedia, requireAssetAccess, requireBrandAccess } from '$lib/server/brand-access';

/**
 * GET /api/brand/assets/activity
 * Get the activity log for a brand or a specific media asset.
 */
export const GET: RequestHandler = async ({ url, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB) throw error(500, 'Platform not available');

	const brandMediaId = url.searchParams.get('brandMediaId');
	if (brandMediaId) {
		// Addressed by asset, so the owning brand is resolved before its history is read.
		await requireAssetAccess(
			platform.env.DB,
			locals.user.id,
			await brandOfMedia(platform.env.DB, brandMediaId),
			'read'
		);
		const logs = await getMediaActivityLogForAsset(platform.env.DB, brandMediaId);
		return json({ logs });
	}

	const brandProfileId = url.searchParams.get('brandProfileId');
	if (!brandProfileId) throw error(400, 'brandProfileId or brandMediaId required');

	await requireBrandAccess(platform.env.DB, locals.user.id, brandProfileId, 'read');

	const limit = parseInt(url.searchParams.get('limit') || '50');
	const offset = parseInt(url.searchParams.get('offset') || '0');

	const logs = await getMediaActivityLog(platform.env.DB, brandProfileId, { limit, offset });
	return json({ logs });
};
