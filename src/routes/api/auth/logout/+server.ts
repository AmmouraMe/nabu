import { redirect } from '@sveltejs/kit';
import { deleteSession } from '$lib/utils/db';
import { decodeDatabaseSessionCookie } from '$lib/server/session';
import type { RequestHandler } from './$types';

// POST - Logout user
async function logout(
	cookies: Parameters<RequestHandler>[0]['cookies'],
	platform: App.Platform | undefined
): Promise<never> {
	const token = await decodeDatabaseSessionCookie(
		cookies.get('session'),
		platform?.env?.SESSION_SECRET
	);
	// Clear the browser credential before attempting server-side revocation. If D1
	// rejects the delete, the error remains visible but this browser is still logged out.
	cookies.delete('session', { path: '/' });
	if (token && platform?.env?.DB) await deleteSession(platform.env.DB, token);
	throw redirect(302, '/auth/login');
}

export const POST: RequestHandler = async ({ cookies, platform }) => {
	return logout(cookies, platform);
};

// GET - Logout user (for convenience)
export const GET: RequestHandler = async ({ cookies, platform }) => {
	return logout(cookies, platform);
};
