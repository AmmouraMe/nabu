import type { RequestEvent } from '@sveltejs/kit';
import { error, json } from '@sveltejs/kit';

/**
 * GET /api/chat/conversations
 * List user's conversations with last message preview
 */
export async function GET({ platform, locals, url }: RequestEvent) {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		const limit = parseInt(url.searchParams.get('limit') || '50');
		const offset = parseInt(url.searchParams.get('offset') || '0');

		const result = await platform!.env.DB.prepare(
			`SELECT c.id, c.title, c.created_at, c.updated_at,
				(SELECT content FROM chat_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
				(SELECT COUNT(*) FROM chat_messages WHERE conversation_id = c.id) as message_count
			FROM conversations c
			WHERE c.user_id = ?
			ORDER BY c.updated_at DESC
			LIMIT ? OFFSET ?`
		)
			.bind(locals.user.id, limit, offset)
			.all();

		return json({
			conversations: result.results.map((row: any) => ({
				id: row.id,
				title: row.title,
				createdAt: row.created_at,
				updatedAt: row.updated_at,
				lastMessage: row.last_message,
				messageCount: row.message_count
			}))
		});
	} catch (err) {
		console.error('Failed to list conversations:', err);
		throw error(500, 'Failed to list conversations');
	}
}

/**
 * POST /api/chat/conversations
 * Create a new conversation
 */
export async function POST({ request, platform, locals }: RequestEvent) {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		const body = await request.json().catch(() => ({}));
		const title = body.title || 'New conversation';
		const id = crypto.randomUUID();
		const now = new Date().toISOString();

		await platform!.env.DB.prepare(
			'INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
		)
			.bind(id, locals.user.id, title, now, now)
			.run();

		return json({
			id,
			title,
			createdAt: now,
			updatedAt: now,
			messages: [],
			messageCount: 0
		});
	} catch (err) {
		console.error('Failed to create conversation:', err);
		throw error(500, 'Failed to create conversation');
	}
}
