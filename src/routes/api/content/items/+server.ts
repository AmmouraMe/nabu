/**
 * GET /api/content/items?brandId=<id>
 * Lists brand_content_items for a brand, verified to belong to the authenticated user.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, platform, url }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const brandId = url.searchParams.get('brandId');
	if (!brandId) throw error(400, 'brandId is required');

	const db = platform!.env.DB;

	// Verify ownership
	const brand = await db
		.prepare('SELECT id FROM brands WHERE id = ? AND user_id = ?')
		.bind(brandId, locals.user.id)
		.first<{ id: string }>();
	if (!brand) throw error(404, 'Brand not found');

	const { results: items } = await db
		.prepare(
			`SELECT * FROM brand_content_items WHERE brand_id = ? ORDER BY created_at DESC LIMIT 100`
		)
		.bind(brandId)
		.all();

	return json({ items: items ?? [] });
};
