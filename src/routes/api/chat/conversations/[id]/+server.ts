import type { RequestEvent } from '@sveltejs/kit';
import { error, json } from '@sveltejs/kit';

/**
 * GET /api/chat/conversations/[id]
 * Fetch a conversation with all its messages
 */
export async function GET({ params, platform, locals }: RequestEvent) {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		// Verify conversation belongs to user
		const conv = await platform!.env.DB.prepare(
			'SELECT id, title, created_at, updated_at FROM conversations WHERE id = ? AND user_id = ?'
		)
			.bind(params.id, locals.user.id)
			.first();

		if (!conv) {
			throw error(404, 'Conversation not found');
		}

		// Fetch all messages for this conversation
		const messagesResult = await platform!.env.DB.prepare(
			`SELECT id, role, content, created_at,
				input_tokens, output_tokens, total_cost, model, display_name,
				media_type, media_url, media_thumbnail_url, media_status,
				media_r2_key, media_duration, media_error, media_provider_job_id,
				attachments
			FROM chat_messages
			WHERE conversation_id = ?
			ORDER BY created_at ASC`
		)
			.bind(params.id)
			.all();

		const messages = messagesResult.results.map((row: any) => {
			const msg: any = {
				id: row.id,
				role: row.role,
				content: row.content,
				timestamp: row.created_at,
				cost:
					row.model || row.total_cost
						? {
								inputTokens: row.input_tokens || 0,
								outputTokens: row.output_tokens || 0,
								totalCost: row.total_cost || 0,
								model: row.model || '',
								displayName: row.display_name || row.model || ''
							}
						: undefined
			};

			// Include media if present
			if (row.media_type) {
				msg.media = {
					type: row.media_type,
					url: row.media_url,
					thumbnailUrl: row.media_thumbnail_url,
					status: row.media_status || 'complete',
					r2Key: row.media_r2_key,
					duration: row.media_duration,
					error: row.media_error,
					providerJobId: row.media_provider_job_id
				};
			}

			// Include attachments if present
			if (row.attachments) {
				try {
					msg.attachments = JSON.parse(row.attachments);
				} catch {
					// Ignore parse errors
				}
			}

			return msg;
		});

		return json({
			id: conv.id,
			title: conv.title,
			createdAt: conv.created_at,
			updatedAt: conv.updated_at,
			messages
		});
	} catch (err: any) {
		if (err.status) throw err;
		console.error('Failed to fetch conversation:', err);
		throw error(500, 'Failed to fetch conversation');
	}
}

/**
 * PATCH /api/chat/conversations/[id]
 * Rename a conversation
 */
export async function PATCH({ params, request, platform, locals }: RequestEvent) {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		const body = await request.json();
		const { title } = body;

		if (!title || typeof title !== 'string') {
			throw error(400, 'Title is required');
		}

		const now = new Date().toISOString();
		const result = await platform!.env.DB.prepare(
			'UPDATE conversations SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?'
		)
			.bind(title, now, params.id, locals.user.id)
			.run();

		if (!result.meta.changes) {
			throw error(404, 'Conversation not found');
		}

		return json({ success: true });
	} catch (err: any) {
		if (err.status) throw err;
		console.error('Failed to rename conversation:', err);
		throw error(500, 'Failed to rename conversation');
	}
}

/**
 * DELETE /api/chat/conversations/[id]
 * Delete a conversation and all its messages
 */
export async function DELETE({ params, platform, locals }: RequestEvent) {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		// Delete conversation (messages cascade via FK)
		const result = await platform!.env.DB.prepare(
			'DELETE FROM conversations WHERE id = ? AND user_id = ?'
		)
			.bind(params.id, locals.user.id)
			.run();

		if (!result.meta.changes) {
			throw error(404, 'Conversation not found');
		}

		return json({ success: true });
	} catch (err: any) {
		if (err.status) throw err;
		console.error('Failed to delete conversation:', err);
		throw error(500, 'Failed to delete conversation');
	}
}
