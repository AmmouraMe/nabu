/**
 * POST /api/auth/logout — drop the session cookie.
 *
 * POST rather than GET so a link or an image on another site cannot sign someone
 * out by being loaded.
 */

import { clearCookieHeader } from '../../../src/auth';

export const onRequest: (context: { request: Request }) => Response = ({ request }) => {
	if (request.method !== 'POST') {
		return new Response(JSON.stringify({ error: 'Use POST.' }), {
			status: 405,
			headers: { 'Content-Type': 'application/json', Allow: 'POST' }
		});
	}

	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearCookieHeader() }
	});
};
