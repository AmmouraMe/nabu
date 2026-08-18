import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAllBrandsForAdmin } from '$lib/services/brand-admin';

export const GET: RequestHandler = async ({ platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!locals.user.isOwner && !locals.user.isAdmin) {
		throw error(403, 'Forbidden');
	}

	try {
		const db = platform?.env?.DB;
		if (!db) {
			throw error(500, 'Database not available');
		}

		const brands = await getAllBrandsForAdmin(db);
		return json({ brands });
	} catch (err: any) {
		if (err.status) throw err;
		console.error('Failed to fetch brands:', err);
		throw error(500, 'Failed to fetch brands');
	}
};
