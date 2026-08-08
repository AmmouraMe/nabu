import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Admin Core Principle Questions API', () => {
	let mockPlatform: any;
	let mockLocals: any;

	beforeEach(() => {
		const mockDB = {
			prepare: vi.fn().mockReturnThis(),
			bind: vi.fn().mockReturnThis(),
			all: vi.fn(),
			first: vi.fn(),
			run: vi.fn()
		};

		mockPlatform = {
			env: {
				DB: mockDB
			}
		};

		mockLocals = {
			user: {
				id: 'owner-1',
				login: 'owner',
				isOwner: true,
				isAdmin: true
			}
		};
	});

	describe('GET /api/admin/core-principle-questions', () => {
		it('requires authentication', async () => {
			mockLocals.user = null;
			const { GET } = await import(
				'../../src/routes/api/admin/core-principle-questions/+server.js'
			);

			try {
				await GET({ platform: mockPlatform, locals: mockLocals } as any);
				expect.fail('Should have thrown error');
			} catch (err: any) {
				expect(err.status).toBe(401);
			}
		});

		it('requires superadmin access', async () => {
			mockLocals.user.isOwner = false;
			mockLocals.user.isAdmin = true;
			const { GET } = await import(
				'../../src/routes/api/admin/core-principle-questions/+server.js'
			);

			try {
				await GET({ platform: mockPlatform, locals: mockLocals } as any);
				expect.fail('Should have thrown error');
			} catch (err: any) {
				expect(err.status).toBe(403);
			}
		});

		it('returns ordered questions', async () => {
			const mockQuestions = [
				{ id: 'q1', question: 'What does your brand stand for?', is_active: 1, sort_order: 0 },
				{ id: 'q2', question: 'What principles are non-negotiable?', is_active: 1, sort_order: 1 }
			];
			mockPlatform.env.DB.all.mockResolvedValueOnce({ results: mockQuestions });

			const { GET } = await import(
				'../../src/routes/api/admin/core-principle-questions/+server.js'
			);
			const response = await GET({ platform: mockPlatform, locals: mockLocals } as any);
			const data = await response.json();

			expect(data.questions).toEqual(mockQuestions);
			expect(mockPlatform.env.DB.prepare).toHaveBeenCalled();
		});
	});

	describe('POST /api/admin/core-principle-questions', () => {
		it('validates question text', async () => {
			const { POST } = await import(
				'../../src/routes/api/admin/core-principle-questions/+server.js'
			);

			try {
				await POST({
					platform: mockPlatform,
					locals: mockLocals,
					request: { json: async () => ({ question: '   ' }) }
				} as any);
				expect.fail('Should have thrown error');
			} catch (err: any) {
				expect(err.status).toBe(400);
			}
		});

		it('creates a question', async () => {
			mockPlatform.env.DB.first.mockResolvedValueOnce({ maxSortOrder: 3 });
			mockPlatform.env.DB.run.mockResolvedValueOnce({ success: true });

			const { POST } = await import(
				'../../src/routes/api/admin/core-principle-questions/+server.js'
			);
			const response = await POST({
				platform: mockPlatform,
				locals: mockLocals,
				request: {
					json: async () => ({
						question: 'What values will you never compromise on?',
						isActive: true
					})
				}
			} as any);

			const data = await response.json();
			expect(data.success).toBe(true);
			expect(data.question.question).toBe('What values will you never compromise on?');
			expect(data.question.sort_order).toBe(4);
		});
	});

	describe('PATCH /api/admin/core-principle-questions/:id', () => {
		it('updates question fields', async () => {
			mockPlatform.env.DB.run.mockResolvedValueOnce({ success: true });
			const { PATCH } = await import(
				'../../src/routes/api/admin/core-principle-questions/[id]/+server.js'
			);

			const response = await PATCH({
				platform: mockPlatform,
				locals: mockLocals,
				params: { id: 'q1' },
				request: {
					json: async () => ({ question: 'Updated question', isActive: false, sortOrder: 2 })
				}
			} as any);

			const data = await response.json();
			expect(data.success).toBe(true);
		});
	});

	describe('DELETE /api/admin/core-principle-questions/:id', () => {
		it('deletes a question', async () => {
			mockPlatform.env.DB.run.mockResolvedValueOnce({ success: true });
			const { DELETE } = await import(
				'../../src/routes/api/admin/core-principle-questions/[id]/+server.js'
			);

			const response = await DELETE({
				platform: mockPlatform,
				locals: mockLocals,
				params: { id: 'q1' }
			} as any);

			const data = await response.json();
			expect(data.success).toBe(true);
		});
	});
});
