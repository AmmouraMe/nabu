import type { PageServerLoad } from './$types';
import { requireOwner } from '$lib/server/auth-guards';

export const load: PageServerLoad = async ({ fetch, locals }) => {
	requireOwner(locals);
	try {
		const response = await fetch('/api/admin/users');
		if (response.ok) {
			const data = await response.json();
			return {
				users: data.users || []
			};
		}
	} catch (error) {
		console.error('Failed to load users:', error);
	}

	return {
		users: []
	};
};
