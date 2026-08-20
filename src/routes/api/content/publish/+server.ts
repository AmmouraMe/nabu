/**
 * POST /api/content/publish
 * Publishes a content_item by ID to its configured platform.
 * Updates the item status, published_at, and external_url on success.
 *
 * Body: { itemId: string }
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { publishArticle, devtoKvKey } from '$lib/services/publishers/devto';
import { sharePost, linkedInKvKey } from '$lib/services/publishers/linkedin';

interface ContentItem {
	id: string;
	brand_id: string;
	type: string;
	platform: string;
	title: string | null;
	body: string | null;
	status: string;
}

interface Brand {
	id: string;
	user_id: string;
}

export const POST: RequestHandler = async ({ locals, platform, request }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const { itemId } = (await request.json()) as { itemId: string };
	if (!itemId) throw error(400, 'itemId is required');

	const db = platform!.env.DB;
	const kv = platform!.env.KV;

	// Load item and verify ownership via brand → user chain
	const item = await db
		.prepare('SELECT * FROM brand_content_items WHERE id = ?')
		.bind(itemId)
		.first<ContentItem>();
	if (!item) throw error(404, 'Content item not found');

	const brand = await db
		.prepare('SELECT * FROM brands WHERE id = ?')
		.bind(item.brand_id)
		.first<Brand>();
	if (!brand || brand.user_id !== locals.user.id) throw error(403, 'Forbidden');

	if (item.status === 'published') {
		throw error(409, 'Item already published');
	}

	let externalUrl: string | null = null;

	try {
		if (item.platform === 'devto') {
			const apiKey = await kv.get(devtoKvKey(locals.user.id));
			if (!apiKey) throw new Error('Dev.to API key not connected. Visit /brand/connect to add it.');

			const result = await publishArticle(apiKey, {
				title: item.title ?? '',
				body: item.body ?? '',
				tags: [],
				published: false
			});
			externalUrl = result.url;
		} else if (item.platform === 'linkedin') {
			const token = await kv.get(linkedInKvKey(locals.user.id));
			if (!token)
				throw new Error('LinkedIn not connected. Visit /brand/connect to link your account.');

			const tokenData = JSON.parse(token) as { access_token: string; author_urn: string };
			const result = await sharePost(tokenData.access_token, {
				text: item.body ?? '',
				authorUrn: tokenData.author_urn
			});
			externalUrl = result.shareUrl;
		} else {
			throw new Error(`Publishing to ${item.platform} is not yet implemented`);
		}

		await db
			.prepare(
				`UPDATE brand_content_items
         SET status = 'published', published_at = datetime('now'), external_url = ?
         WHERE id = ?`
			)
			.bind(externalUrl, itemId)
			.run();

		return json({ success: true, externalUrl, status: 'published' });
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);

		await db
			.prepare(`UPDATE brand_content_items SET status = 'failed', error_message = ? WHERE id = ?`)
			.bind(msg, itemId)
			.run();

		throw error(502, msg);
	}
};
