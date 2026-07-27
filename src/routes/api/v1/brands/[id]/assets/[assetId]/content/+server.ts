import type { RequestHandler } from './$types';
import { requireApiKey, requireBrand } from '$lib/server/api-guard';
import { apiError } from '$lib/server/api-keys';

/**
 * GET /api/v1/brands/:id/assets/:assetId/content
 *
 * Stream an asset's bytes to an API client.
 *
 * This exists because the app's own file route (`/api/brand/assets/file?key=…`)
 * authenticates with a browser session, so a URL pointing at it is unusable to
 * anything holding an API key — an API that hands back links its callers cannot
 * fetch is not much of an API.
 *
 * The asset is looked up **scoped to the brand in the path**, so an id belonging to
 * another brand resolves to nothing even when the caller can read this one. Taking
 * the R2 key from the caller instead — which is what the session route does — would
 * turn this into a read-anything endpoint.
 */
export const GET: RequestHandler = async (event) => {
	const auth = await requireApiKey(event, 'assets:read');
	if (!auth.ok) return auth.response;
	const { principal, db } = auth.value;

	const access = await requireBrand(db, principal, event.params.id, 'read');
	if (!access.ok) return access.response;

	if (!event.platform?.env?.BUCKET) {
		return apiError(503, 'storage_unavailable', 'Asset storage is not available.');
	}

	const asset = await db
		.prepare(
			`SELECT r2_key, mime_type FROM brand_media
			 WHERE id = ? AND brand_profile_id = ?`
		)
		.bind(event.params.assetId, event.params.id)
		.first<{ r2_key: string; mime_type: string | null }>();

	if (!asset) {
		return apiError(404, 'asset_not_found', 'Asset not found.');
	}

	const object = await event.platform.env.BUCKET.get(asset.r2_key);
	if (!object) {
		// The row exists but the object does not — a real inconsistency, so say so
		// rather than reporting a missing asset and hiding it.
		return apiError(410, 'asset_content_missing', 'Asset record exists but its file is gone.');
	}

	return new Response(object.body as ReadableStream, {
		headers: {
			'content-type':
				object.httpMetadata?.contentType || asset.mime_type || 'application/octet-stream',
			// Assets are content-addressed by generation id and never rewritten.
			'cache-control': 'private, max-age=31536000, immutable'
		}
	});
};
