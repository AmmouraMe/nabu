import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBrandAuditLog } from '$lib/services/brand-admin';

export const GET: RequestHandler = async ({ platform, locals, params, url }) => {
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

		const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
		const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);

		const { entries, total } = await getBrandAuditLog(db, params.id, limit, offset);
		return json({ entries, total });
	} catch (err: any) {
		if (err.status) throw err;
		console.error('Failed to fetch audit log:', err);
		throw error(500, 'Failed to fetch audit log');
	}
};
