/**
 * Tests for Chat Conversations API
 * Covers: GET/POST /api/chat/conversations,
 *         GET/PATCH/DELETE /api/chat/conversations/[id],
 *         POST /api/chat/conversations/[id]/messages
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockDB: any;
let mockPlatform: any;
let mockLocals: any;

function createMockDB() {
	const chain: any = {
		prepare: vi.fn().mockReturnThis(),
		bind: vi.fn().mockReturnThis(),
		first: vi.fn().mockResolvedValue(null),
		all: vi.fn().mockResolvedValue({ results: [] }),
		run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } })
	};
	return chain;
}

beforeEach(() => {
	vi.resetModules();
	vi.restoreAllMocks();

	mockDB = createMockDB();
	mockPlatform = { env: { DB: mockDB } };
	mockLocals = { user: { id: 'user-123', login: 'testuser' } };
});

// ─────────────────────────────────────
// GET /api/chat/conversations
// ─────────────────────────────────────
describe('GET /api/chat/conversations', () => {
	it('should return 401 when not authenticated', async () => {
		const { GET } = await import('../../src/routes/api/chat/conversations/+server');
		try {
			await GET({
				platform: mockPlatform,
				locals: { user: null },
				url: new URL('http://localhost/api/chat/conversations')
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return conversations list', async () => {
		const { GET } = await import('../../src/routes/api/chat/conversations/+server');
		mockDB.all.mockResolvedValueOnce({
			results: [
				{
					id: 'conv-1',
					title: 'Test Conv',
					created_at: '2025-01-01',
					updated_at: '2025-01-02',
					last_message: 'Hello',
					message_count: 5
				}
			]
		});

		const response = await GET({
			platform: mockPlatform,
			locals: mockLocals,
			url: new URL('http://localhost/api/chat/conversations?limit=10&offset=0')
		} as any);

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.conversations).toHaveLength(1);
		expect(data.conversations[0].id).toBe('conv-1');
		expect(data.conversations[0].title).toBe('Test Conv');
		expect(data.conversations[0].lastMessage).toBe('Hello');
		expect(data.conversations[0].messageCount).toBe(5);
	});

	it('should use default limit and offset', async () => {
		const { GET } = await import('../../src/routes/api/chat/conversations/+server');
		mockDB.all.mockResolvedValueOnce({ results: [] });

		const response = await GET({
			platform: mockPlatform,
			locals: mockLocals,
			url: new URL('http://localhost/api/chat/conversations')
		} as any);

		expect(response.status).toBe(200);
	});

	it('should handle DB errors gracefully', async () => {
		const { GET } = await import('../../src/routes/api/chat/conversations/+server');
		mockDB.all.mockRejectedValueOnce(new Error('DB error'));

		try {
			await GET({
				platform: mockPlatform,
				locals: mockLocals,
				url: new URL('http://localhost/api/chat/conversations')
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});
});

// ─────────────────────────────────────
// POST /api/chat/conversations
// ─────────────────────────────────────
describe('POST /api/chat/conversations', () => {
	it('should return 401 when not authenticated', async () => {
		const { POST } = await import('../../src/routes/api/chat/conversations/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({})
				}),
				platform: mockPlatform,
				locals: { user: null }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should create a new conversation with title', async () => {
		const { POST } = await import('../../src/routes/api/chat/conversations/+server');
		const response = await POST({
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: 'My Chat' })
			}),
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.title).toBe('My Chat');
		expect(data.id).toBeDefined();
		expect(data.messages).toEqual([]);
		expect(data.messageCount).toBe(0);
	});

	it('should use default title when none provided', async () => {
		const { POST } = await import('../../src/routes/api/chat/conversations/+server');
		const response = await POST({
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			}),
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const data = await response.json();
		expect(data.title).toBe('New conversation');
	});

	it('should handle invalid JSON body gracefully', async () => {
		const { POST } = await import('../../src/routes/api/chat/conversations/+server');
		const response = await POST({
			request: new Request('http://localhost', {
				method: 'POST',
				body: 'invalid json'
			}),
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const data = await response.json();
		expect(data.title).toBe('New conversation');
	});

	it('should handle DB errors', async () => {
		const { POST } = await import('../../src/routes/api/chat/conversations/+server');
		mockDB.run.mockRejectedValueOnce(new Error('DB error'));

		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ title: 'Test' })
				}),
				platform: mockPlatform,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});
});

// ─────────────────────────────────────
// GET /api/chat/conversations/[id]
// ─────────────────────────────────────
describe('GET /api/chat/conversations/[id]', () => {
	it('should return 401 when not authenticated', async () => {
		const { GET } = await import('../../src/routes/api/chat/conversations/[id]/+server');
		try {
			await GET({
				params: { id: 'conv-1' },
				platform: mockPlatform,
				locals: { user: null }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 404 when conversation not found', async () => {
		const { GET } = await import('../../src/routes/api/chat/conversations/[id]/+server');
		mockDB.first.mockResolvedValueOnce(null);

		try {
			await GET({
				params: { id: 'nonexistent' },
				platform: mockPlatform,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});

	it('should return conversation with messages', async () => {
		const { GET } = await import('../../src/routes/api/chat/conversations/[id]/+server');
		mockDB.first.mockResolvedValueOnce({
			id: 'conv-1',
			title: 'Test',
			created_at: '2025-01-01',
			updated_at: '2025-01-02'
		});
		mockDB.all.mockResolvedValueOnce({
			results: [
				{
					id: 'msg-1',
					role: 'user',
					content: 'Hello',
					created_at: '2025-01-01',
					model: null,
					total_cost: null,
					input_tokens: null,
					output_tokens: null,
					display_name: null,
					media_type: null,
					media_url: null,
					media_thumbnail_url: null,
					media_status: null,
					media_r2_key: null,
					media_duration: null,
					media_error: null,
					media_provider_job_id: null
				},
				{
					id: 'msg-2',
					role: 'assistant',
					content: 'Hi there',
					created_at: '2025-01-01',
					model: 'gpt-4o',
					total_cost: 0.01,
					input_tokens: 10,
					output_tokens: 20,
					display_name: 'GPT-4o',
					media_type: 'video',
					media_url: 'http://example.com/video.mp4',
					media_thumbnail_url: 'http://example.com/thumb.jpg',
					media_status: 'complete',
					media_r2_key: 'videos/user/file.mp4',
					media_duration: 10,
					media_error: null,
					media_provider_job_id: 'job-123'
				}
			]
		});

		const response = await GET({
			params: { id: 'conv-1' },
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.id).toBe('conv-1');
		expect(data.messages).toHaveLength(2);
		// First message — no cost
		expect(data.messages[0].cost).toBeUndefined();
		// Second message — has cost and media
		expect(data.messages[1].cost.model).toBe('gpt-4o');
		expect(data.messages[1].media.type).toBe('video');
	});

	it('should handle DB errors with generic error', async () => {
		const { GET } = await import('../../src/routes/api/chat/conversations/[id]/+server');
		mockDB.first.mockRejectedValueOnce(new Error('DB error'));

		try {
			await GET({
				params: { id: 'conv-1' },
				platform: mockPlatform,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});
});

// ─────────────────────────────────────
// PATCH /api/chat/conversations/[id]
// ─────────────────────────────────────
describe('PATCH /api/chat/conversations/[id]', () => {
	it('should return 401 when not authenticated', async () => {
		const { PATCH } = await import('../../src/routes/api/chat/conversations/[id]/+server');
		try {
			await PATCH({
				params: { id: 'conv-1' },
				request: new Request('http://localhost', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ title: 'New Title' })
				}),
				platform: mockPlatform,
				locals: { user: null }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 400 when title is missing', async () => {
		const { PATCH } = await import('../../src/routes/api/chat/conversations/[id]/+server');
		try {
			await PATCH({
				params: { id: 'conv-1' },
				request: new Request('http://localhost', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({})
				}),
				platform: mockPlatform,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return 400 when title is not a string', async () => {
		const { PATCH } = await import('../../src/routes/api/chat/conversations/[id]/+server');
		try {
			await PATCH({
				params: { id: 'conv-1' },
				request: new Request('http://localhost', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ title: 123 })
				}),
				platform: mockPlatform,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should rename conversation successfully', async () => {
		const { PATCH } = await import('../../src/routes/api/chat/conversations/[id]/+server');
		mockDB.run.mockResolvedValueOnce({ success: true, meta: { changes: 1 } });

		const response = await PATCH({
			params: { id: 'conv-1' },
			request: new Request('http://localhost', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: 'Updated Title' })
			}),
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.success).toBe(true);
	});

	it('should return 404 when conversation not found', async () => {
		const { PATCH } = await import('../../src/routes/api/chat/conversations/[id]/+server');
		mockDB.run.mockResolvedValueOnce({ success: true, meta: { changes: 0 } });

		try {
			await PATCH({
				params: { id: 'nonexistent' },
				request: new Request('http://localhost', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ title: 'Updated' })
				}),
				platform: mockPlatform,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});

	it('should handle DB errors', async () => {
		const { PATCH } = await import('../../src/routes/api/chat/conversations/[id]/+server');
		mockDB.run.mockRejectedValueOnce(new Error('DB error'));

		try {
			await PATCH({
				params: { id: 'conv-1' },
				request: new Request('http://localhost', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ title: 'Updated' })
				}),
				platform: mockPlatform,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});
});

// ─────────────────────────────────────
// DELETE /api/chat/conversations/[id]
// ─────────────────────────────────────
describe('DELETE /api/chat/conversations/[id]', () => {
	it('should return 401 when not authenticated', async () => {
		const { DELETE } = await import('../../src/routes/api/chat/conversations/[id]/+server');
		try {
			await DELETE({
				params: { id: 'conv-1' },
				platform: mockPlatform,
				locals: { user: null }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should delete conversation successfully', async () => {
		const { DELETE } = await import('../../src/routes/api/chat/conversations/[id]/+server');
		mockDB.run.mockResolvedValueOnce({ success: true, meta: { changes: 1 } });

		const response = await DELETE({
			params: { id: 'conv-1' },
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.success).toBe(true);
	});

	it('should return 404 when conversation not found', async () => {
		const { DELETE } = await import('../../src/routes/api/chat/conversations/[id]/+server');
		mockDB.run.mockResolvedValueOnce({ success: true, meta: { changes: 0 } });

		try {
			await DELETE({
				params: { id: 'nonexistent' },
				platform: mockPlatform,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});

	it('should handle DB errors', async () => {
		const { DELETE } = await import('../../src/routes/api/chat/conversations/[id]/+server');
		mockDB.run.mockRejectedValueOnce(new Error('DB error'));

		try {
			await DELETE({
				params: { id: 'conv-1' },
				platform: mockPlatform,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});
});

// ─────────────────────────────────────
// POST /api/chat/conversations/[id]/messages
// ─────────────────────────────────────
describe('POST /api/chat/conversations/[id]/messages', () => {
	it('should return 401 when not authenticated', async () => {
		const { POST } = await import('../../src/routes/api/chat/conversations/[id]/messages/+server');
		try {
			await POST({
				params: { id: 'conv-1' },
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ role: 'user', content: 'Hello' })
				}),
				platform: mockPlatform,
				locals: { user: null }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 404 when conversation not found', async () => {
		const { POST } = await import('../../src/routes/api/chat/conversations/[id]/messages/+server');
		mockDB.first.mockResolvedValueOnce(null);

		try {
			await POST({
				params: { id: 'nonexistent' },
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ role: 'user', content: 'Hello' })
				}),
				platform: mockPlatform,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});

	it('should return 400 when role or content missing', async () => {
		const { POST } = await import('../../src/routes/api/chat/conversations/[id]/messages/+server');
		mockDB.first.mockResolvedValueOnce({ id: 'conv-1' });

		try {
			await POST({
				params: { id: 'conv-1' },
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ role: 'user' })
				}),
				platform: mockPlatform,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return 400 when role is invalid', async () => {
		const { POST } = await import('../../src/routes/api/chat/conversations/[id]/messages/+server');
		mockDB.first.mockResolvedValueOnce({ id: 'conv-1' });

		try {
			await POST({
				params: { id: 'conv-1' },
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ role: 'invalid', content: 'Hello' })
				}),
				platform: mockPlatform,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should add a user message and update title if first message', async () => {
		const { POST } = await import('../../src/routes/api/chat/conversations/[id]/messages/+server');
		// First call: verify conversation
		mockDB.first.mockResolvedValueOnce({ id: 'conv-1' });
		// Second call: message count
		mockDB.first.mockResolvedValueOnce({ count: 1 });

		const response = await POST({
			params: { id: 'conv-1' },
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					role: 'user',
					content: 'Hello world this is a test message'
				})
			}),
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.role).toBe('user');
		expect(data.content).toBe('Hello world this is a test message');
	});

	it('should add message with cost data', async () => {
		const { POST } = await import('../../src/routes/api/chat/conversations/[id]/messages/+server');
		mockDB.first.mockResolvedValueOnce({ id: 'conv-1' });
		mockDB.first.mockResolvedValueOnce({ count: 5 });

		const cost = {
			inputTokens: 100,
			outputTokens: 50,
			totalCost: 0.01,
			model: 'gpt-4o',
			displayName: 'GPT-4o'
		};

		const response = await POST({
			params: { id: 'conv-1' },
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role: 'assistant', content: 'Response', cost })
			}),
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const data = await response.json();
		expect(data.cost).toEqual(cost);
	});

	it('should add message with media data', async () => {
		const { POST } = await import('../../src/routes/api/chat/conversations/[id]/messages/+server');
		mockDB.first.mockResolvedValueOnce({ id: 'conv-1' });
		mockDB.first.mockResolvedValueOnce({ count: 5 });

		const media = {
			type: 'video',
			url: 'http://example.com/video.mp4',
			status: 'complete'
		};

		const response = await POST({
			params: { id: 'conv-1' },
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role: 'assistant', content: 'Video ready', media })
			}),
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const data = await response.json();
		expect(data.media).toEqual(media);
	});

	it('should handle updateTitle=false', async () => {
		const { POST } = await import('../../src/routes/api/chat/conversations/[id]/messages/+server');
		mockDB.first.mockResolvedValueOnce({ id: 'conv-1' });

		const response = await POST({
			params: { id: 'conv-1' },
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					role: 'user',
					content: 'Hello',
					updateTitle: false
				})
			}),
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		expect(response.status).toBe(200);
	});

	it('should use provided message id', async () => {
		const { POST } = await import('../../src/routes/api/chat/conversations/[id]/messages/+server');
		mockDB.first.mockResolvedValueOnce({ id: 'conv-1' });
		mockDB.first.mockResolvedValueOnce({ count: 3 });

		const response = await POST({
			params: { id: 'conv-1' },
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: 'custom-msg-id',
					role: 'user',
					content: 'Hello'
				})
			}),
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const data = await response.json();
		expect(data.id).toBe('custom-msg-id');
	});

	it('should truncate long content for title', async () => {
		const { POST } = await import('../../src/routes/api/chat/conversations/[id]/messages/+server');
		mockDB.first.mockResolvedValueOnce({ id: 'conv-1' });
		mockDB.first.mockResolvedValueOnce({ count: 1 }); // first message

		const longContent = 'A'.repeat(100);
		const response = await POST({
			params: { id: 'conv-1' },
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role: 'user', content: longContent })
			}),
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		expect(response.status).toBe(200);
	});

	it('should add assistant message (non-user, no title update)', async () => {
		const { POST } = await import('../../src/routes/api/chat/conversations/[id]/messages/+server');
		mockDB.first.mockResolvedValueOnce({ id: 'conv-1' });

		const response = await POST({
			params: { id: 'conv-1' },
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role: 'assistant', content: 'AI response' })
			}),
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		expect(response.status).toBe(200);
	});

	it('should handle DB errors', async () => {
		const { POST } = await import('../../src/routes/api/chat/conversations/[id]/messages/+server');
		mockDB.first.mockRejectedValueOnce(new Error('DB error'));

		try {
			await POST({
				params: { id: 'conv-1' },
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ role: 'user', content: 'Hello' })
				}),
				platform: mockPlatform,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});
});
