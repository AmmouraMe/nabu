import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

/**
 * DELETE /api/keys/:id — revoke a key.
 *
 * Sets `revoked_at` rather than deleting the row, so the audit trail survives: after
 * a leak you want to know the key existed, what it could do, and when it was last
 * used. Verification treats a revoked key as invalid from the next request.
 */
export const DELETE: RequestHandler = async ({ params, locals, platform }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Database unavailable');

	// Scoped to the caller's own keys: without the user_id predicate this would revoke
	// anyone's key given its id.
	const result = await db
		.prepare(
			`UPDATE api_keys SET revoked_at = ?
			 WHERE id = ? AND user_id = ? AND revoked_at IS NULL`
		)
		.bind(new Date().toISOString(), params.id, locals.user.id)
		.run();

	// Already-revoked and belongs-to-someone-else both land here, which is the point:
	// the response must not reveal that an id exists.
	if (!result.meta?.changes) {
		throw error(404, 'Key not found.');
	}

	return json({ revoked: true, id: params.id });
};
