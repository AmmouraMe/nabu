import type { ServerLoad } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';

export const load: ServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/login?redirect=/chat/videos');
	}

	return {
		userId: locals.user.id
	};
};
