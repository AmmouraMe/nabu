import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listCorePrincipleQuestions } from '$lib/services/core-principle-questions';

function requireSuperAdmin(locals: App.Locals): void {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!locals.user.isOwner) {
		throw error(403, 'Superadmin access required');
	}
}

export const GET: RequestHandler = async ({ platform, locals }) => {
	requireSuperAdmin(locals);

	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	try {
		const questions = await listCorePrincipleQuestions(db);
		return json({ questions });
	} catch (err: any) {
		console.error('Failed to fetch core principles questions:', err);
		throw error(500, 'Failed to fetch core principles questions');
	}
};

export const POST: RequestHandler = async ({ platform, locals, request }) => {
	requireSuperAdmin(locals);

	const db = platform?.env?.DB;
	if (!db) {
		throw error(500, 'Database not available');
	}

	const body = await request.json();
	const question = typeof body.question === 'string' ? body.question.trim() : '';
	const isActive = body.isActive !== undefined ? !!body.isActive : true;

	if (!question) {
		throw error(400, 'Question is required');
	}

	if (question.length > 500) {
		throw error(400, 'Question must be 500 characters or fewer');
	}

	try {
		const maxSortResult = await db
			.prepare('SELECT COALESCE(MAX(sort_order), -1) as maxSortOrder FROM core_principle_questions')
			.first<{ maxSortOrder: number }>();

		const sortOrder = (maxSortResult?.maxSortOrder ?? -1) + 1;
		const id = crypto.randomUUID();
		const now = new Date().toISOString();

		await db
			.prepare(
				`INSERT INTO core_principle_questions (id, question, is_active, sort_order, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?)`
			)
			.bind(id, question, isActive ? 1 : 0, sortOrder, now, now)
			.run();

		return json({
			success: true,
			question: {
				id,
				question,
				is_active: isActive ? 1 : 0,
				sort_order: sortOrder,
				created_at: now,
				updated_at: now
			}
		});
	} catch (err: any) {
		if (err?.status) {
			throw err;
		}
		console.error('Failed to create core principle question:', err);
		throw error(500, 'Failed to create core principle question');
	}
};
