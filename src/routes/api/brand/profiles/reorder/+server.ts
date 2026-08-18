/**
 * POST /api/brand/profiles/reorder - Update sort order of brand profiles
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals, platform }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const { orderedIds } = await request.json();

	if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
		throw error(400, 'orderedIds must be a non-empty array');
	}

	const db = platform!.env.DB;
	const userId = locals.user.id;

	// Build batch of update statements - only update profiles owned by this user
	const statements = orderedIds.map((id: string, index: number) =>
		db
			.prepare(`UPDATE brand_profiles SET sort_order = ? WHERE id = ? AND user_id = ?`)
			.bind(index, id, userId)
	);

	await db.batch(statements);

	return json({ success: true });
};
