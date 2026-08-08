import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

/**
 * GET /api/video/file/[...key]
 * Serve video files from R2 storage
 */
export const GET: RequestHandler = async ({ params, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env?.BUCKET) {
		throw error(500, 'Storage not available');
	}

	const key = params.key;
	if (!key) {
		throw error(400, 'File key is required');
	}

	// Security: Only allow serving videos from the user's own directory
	if (!key.startsWith(`videos/${locals.user.id}/`)) {
		throw error(403, 'Access denied');
	}

	const object = await platform.env.BUCKET.get(key);
	if (!object) {
		throw error(404, 'Video not found');
	}

	const headers = new Headers();
	headers.set('Content-Type', object.httpMetadata?.contentType || 'video/mp4');
	headers.set('Cache-Control', 'public, max-age=31536000, immutable');
	headers.set('Accept-Ranges', 'bytes');

	if (object.size) {
		headers.set('Content-Length', object.size.toString());
	}

	return new Response(object.body as ReadableStream, { headers });
};
