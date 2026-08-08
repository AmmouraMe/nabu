import type { RequestEvent } from '@sveltejs/kit';
import { error, json } from '@sveltejs/kit';

/**
 * POST /api/chat/conversations/[id]/messages
 * Add a message to a conversation
 */
export async function POST({ params, request, platform, locals }: RequestEvent) {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		// Verify conversation belongs to user
		const conv = await platform!.env.DB.prepare(
			'SELECT id FROM conversations WHERE id = ? AND user_id = ?'
		)
			.bind(params.id, locals.user.id)
			.first();

		if (!conv) {
			throw error(404, 'Conversation not found');
		}

		const body = await request.json();
		const { role, content, cost, media, attachments, id: messageId } = body;

		if (!role || !content) {
			throw error(400, 'Role and content are required');
		}

		if (!['user', 'assistant', 'system'].includes(role)) {
			throw error(400, 'Invalid role');
		}

		const id = messageId || crypto.randomUUID();
		const now = new Date().toISOString();

		await platform!.env.DB.prepare(
			`INSERT INTO chat_messages (
				id, user_id, conversation_id, role, content, created_at,
				input_tokens, output_tokens, total_cost, model, display_name,
				media_type, media_url, media_thumbnail_url, media_status,
				media_r2_key, media_duration, media_error, media_provider_job_id,
				attachments
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
			.bind(
				id,
				locals.user.id,
				params.id,
				role,
				content,
				now,
				cost?.inputTokens || 0,
				cost?.outputTokens || 0,
				cost?.totalCost || 0,
				cost?.model || null,
				cost?.displayName || null,
				media?.type || null,
				media?.url || null,
				media?.thumbnailUrl || null,
				media?.status || null,
				media?.r2Key || null,
				media?.duration || null,
				media?.error || null,
				media?.providerJobId || null,
				attachments ? JSON.stringify(attachments) : null
			)
			.run();

		// Update conversation's updated_at and title if first user message
		const updateTitle = role === 'user' && body.updateTitle !== false;

		if (updateTitle) {
			// Check if this is the first message in the conversation
			const msgCount = await platform!.env.DB.prepare(
				'SELECT COUNT(*) as count FROM chat_messages WHERE conversation_id = ?'
			)
				.bind(params.id)
				.first<{ count: number }>();

			if (msgCount && msgCount.count <= 1) {
				// First message — update title
				const title = content.length > 50 ? content.substring(0, 50) + '...' : content;
				await platform!.env.DB.prepare(
					'UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?'
				)
					.bind(title, now, params.id)
					.run();
			} else {
				await platform!.env.DB.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
					.bind(now, params.id)
					.run();
			}
		} else {
			await platform!.env.DB.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
				.bind(now, params.id)
				.run();
		}

		const message: any = {
			id,
			role,
			content,
			timestamp: now,
			cost: cost || undefined
		};

		if (media) {
			message.media = media;
		}

		if (attachments) {
			message.attachments = attachments;
		}

		return json(message);
	} catch (err: any) {
		if (err.status) throw err;
		console.error('Failed to add message:', err);
		throw error(500, 'Failed to add message');
	}
}
