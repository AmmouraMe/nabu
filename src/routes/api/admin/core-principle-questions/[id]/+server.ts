import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

function requireSuperAdmin(locals: App.Locals): void {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!locals.user.isOwner) {
		throw error(403, 'Superadmin access required');
	}
}

export const PATCH: RequestHandler = async ({ platform, locals, params, request }) => {
	requireSuperAdmin(locals);

	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const body = await request.json();
	const updates: string[] = [];
	const values: unknown[] = [];

	if (typeof body.question === 'string') {
		const question = body.question.trim();
		if (!question) {
			throw error(400, 'Question cannot be empty');
		}
		if (question.length > 500) {
			throw error(400, 'Question must be 500 characters or fewer');
		}
		updates.push('question = ?');
		values.push(question);
	}

	if (typeof body.isActive === 'boolean') {
		updates.push('is_active = ?');
		values.push(body.isActive ? 1 : 0);
	}

	if (
		typeof body.sortOrder === 'number' &&
		Number.isInteger(body.sortOrder) &&
		body.sortOrder >= 0
	) {
		updates.push('sort_order = ?');
		values.push(body.sortOrder);
	} else if (body.sortOrder !== undefined) {
		throw error(400, 'sortOrder must be a non-negative integer');
	}

	if (updates.length === 0) {
		throw error(400, 'No valid fields to update');
	}

	updates.push('updated_at = ?');
	values.push(new Date().toISOString());
	values.push(params.id);

	try {
		await db
			.prepare(`UPDATE core_principle_questions SET ${updates.join(', ')} WHERE id = ?`)
			.bind(...values)
			.run();

		return json({ success: true });
	} catch (err: any) {
		if (err?.status) {
			throw err;
		}
		console.error('Failed to update core principle question:', err);
		throw error(500, 'Failed to update core principle question');
	}
};

export const DELETE: RequestHandler = async ({ platform, locals, params }) => {
	requireSuperAdmin(locals);

	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	try {
		await db.prepare('DELETE FROM core_principle_questions WHERE id = ?').bind(params.id).run();

		return json({ success: true });
	} catch (err: any) {
		if (err?.status) {
			throw err;
		}
		console.error('Failed to delete core principle question:', err);
		throw error(500, 'Failed to delete core principle question');
	}
};
