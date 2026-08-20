import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getBrandAccess,
	grantBrandAccess,
	updateBrandAccess,
	revokeBrandAccess
} from '$lib/services/brand-admin';
import { requireSeat, resolvePlan } from '$lib/server/entitlements';

const VALID_ROLES = ['viewer', 'editor', 'manager'] as const;

export const GET: RequestHandler = async ({ platform, locals, params }) => {
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

		const access = await getBrandAccess(db, params.id);
		return json({ access });
	} catch (err: any) {
		if (err.status) throw err;
		console.error('Failed to fetch brand access:', err);
		throw error(500, 'Failed to fetch brand access');
	}
};

export const POST: RequestHandler = async ({ platform, locals, params, request }) => {
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

		const body = await request.json();
		const { userId, role } = body;

		if (!userId) {
			throw error(400, 'User ID is required');
		}

		if (role && !VALID_ROLES.includes(role)) {
			throw error(400, 'Invalid role. Must be viewer, editor, or manager');
		}

		// Seats are counted against the brand *owner's* plan, not the admin doing the
		// granting: the owner is who the "1 team member" on Starter describes, and an
		// admin-only route would otherwise be a way to hand out seats nobody paid for.
		const brand = await db
			.prepare('SELECT user_id FROM brand_profiles WHERE id = ?')
			.bind(params.id)
			.first<{ user_id: string }>();
		if (!brand) {
			throw error(404, 'Brand not found');
		}

		const ownerPlan = await resolvePlan(db, brand.user_id);
		await requireSeat(db, brand.user_id, ownerPlan, userId);

		const accessId = await grantBrandAccess(
			db,
			params.id,
			userId,
			locals.user.id,
			role || 'viewer'
		);

		return json({ success: true, accessId });
	} catch (err: any) {
		if (err.status) throw err;
		if (err.message?.includes('UNIQUE constraint')) {
			throw error(400, 'User already has access to this brand');
		}
		console.error('Failed to grant brand access:', err);
		throw error(500, 'Failed to grant brand access');
	}
};

export const PATCH: RequestHandler = async ({ platform, locals, request }) => {
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

		const body = await request.json();
		const { accessId, role } = body;

		if (!accessId) {
			throw error(400, 'Access ID is required');
		}

		if (!role || !VALID_ROLES.includes(role)) {
			throw error(400, 'Invalid role. Must be viewer, editor, or manager');
		}

		await updateBrandAccess(db, accessId, role, locals.user.id);
		return json({ success: true });
	} catch (err: any) {
		if (err.status) throw err;
		console.error('Failed to update brand access:', err);
		throw error(500, 'Failed to update brand access');
	}
};

export const DELETE: RequestHandler = async ({ platform, locals, request }) => {
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

		const body = await request.json();
		const { accessId } = body;

		if (!accessId) {
			throw error(400, 'Access ID is required');
		}

		await revokeBrandAccess(db, accessId, locals.user.id);
		return json({ success: true });
	} catch (err: any) {
		if (err.status) throw err;
		console.error('Failed to revoke brand access:', err);
		throw error(500, 'Failed to revoke brand access');
	}
};
