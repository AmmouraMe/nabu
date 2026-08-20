/**
 * GET /api/archive/file?key=archive/xxx/image.png
 * Serve a file from R2 bucket (used for archive file access).
 */
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.BUCKET) throw error(500, 'Platform not available');

	const key = url.searchParams.get('key');
	if (!key) throw error(400, 'key required');

	const object = await platform.env.BUCKET.get(key);
	if (!object) throw error(404, 'File not found');

	const headers = new Headers();
	headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
	headers.set('Cache-Control', 'public, max-age=31536000, immutable');

	if (object.size) {
		headers.set('Content-Length', String(object.size));
	}

	return new Response(object.body as ReadableStream, { headers });
};
