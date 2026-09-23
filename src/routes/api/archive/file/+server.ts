/**
 * GET /api/archive/file?key=archive/xxx/image.png
 * Serve a file from R2 bucket (used for archive file access).
 *
 * The key is caller-supplied, so it is authorised before anything is read, by
 * the same rule as `/api/brand/assets/file` (`canReadR2Key`). This route used to
 * serve any R2 key to any logged-in user — the hole that was closed on the brand
 * file route but left open here, exposing every brand's onboarding attachments
 * and AI archive to anyone with an account.
 *
 * A key the caller cannot reach answers 404, the same as one that does not exist.
 */
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { canReadR2Key } from '$lib/server/brand-access';

export const GET: RequestHandler = async ({ url, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.BUCKET || !platform?.env?.DB) throw error(500, 'Platform not available');

	const key = url.searchParams.get('key');
	if (!key) throw error(400, 'key required');

	if (!(await canReadR2Key(platform.env.DB, locals.user.id, key))) {
		throw error(404, 'File not found');
	}

	const object = await platform.env.BUCKET.get(key);
	if (!object) throw error(404, 'File not found');

	const headers = new Headers();
	headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
	// Private: the response is authorised per user, so a shared cache must never
	// hand it to the next caller asking for the same key.
	headers.set('Cache-Control', 'private, max-age=31536000, immutable');

	if (object.size) {
		headers.set('Content-Length', String(object.size));
	}

	return new Response(object.body as ReadableStream, { headers });
};
