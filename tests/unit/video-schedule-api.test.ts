import { describe, it, expect, beforeEach, vi } from 'vitest';

// Plans are not what this suite is about; see tests/fixtures/entitlements.ts.
vi.mock('$lib/server/entitlements', async () =>
	(await import('../fixtures/entitlements')).permissiveEntitlements()
);

/**
 * Tests for Video Schedule CRUD API routes
 * Covers: GET, POST, PATCH, DELETE /api/video/schedules
 */

vi.mock('$lib/services/video-registry', () => ({
	getEnabledVideoKey: vi.fn(),
	getVideoProvider: vi.fn(),
	getModelsForKey: vi.fn(),
	getAllVideoModels: vi.fn()
}));

let mockDB: any;
let mockPlatform: any;
let mockLocals: any;

function createMockDB() {
	const chain: any = {
		prepare: vi.fn().mockReturnThis(),
		bind: vi.fn().mockReturnThis(),
		first: vi.fn().mockResolvedValue(null),
		all: vi.fn().mockResolvedValue({ results: [] }),
		run: vi.fn().mockResolvedValue({ success: true }),
		batch: vi.fn().mockResolvedValue([])
	};
	return chain;
}

beforeEach(() => {
	vi.resetModules();
	vi.restoreAllMocks();

	mockDB = createMockDB();
	mockPlatform = {
		env: {
			DB: mockDB,
			KV: { get: vi.fn(), put: vi.fn() }
		}
	};
	mockLocals = {
		user: {
			id: 'user-1',
			login: 'testuser',
			email: 'test@example.com',
			isOwner: false,
			isAdmin: false
		}
	};
});

// ─────────────────────────────────────
// GET /api/video/schedules - List schedules
// ─────────────────────────────────────
describe('GET /api/video/schedules - List schedules', () => {
	it('should return 401 when not authenticated', async () => {
		const { GET } = await import('../../src/routes/api/video/schedules/+server.js');
		try {
			await GET({
				url: new URL('http://localhost/api/video/schedules'),
				platform: mockPlatform,
				locals: { user: null }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 500 when platform not available', async () => {
		const { GET } = await import('../../src/routes/api/video/schedules/+server.js');
		try {
			await GET({
				url: new URL('http://localhost/api/video/schedules'),
				platform: null,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('should return empty schedule list', async () => {
		const { GET } = await import('../../src/routes/api/video/schedules/+server.js');
		mockDB.all.mockResolvedValueOnce({ results: [] });

		const response = await GET({
			url: new URL('http://localhost/api/video/schedules'),
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const data = await response.json();
		expect(data.schedules).toEqual([]);
	});

	it('should return user schedules', async () => {
		const { GET } = await import('../../src/routes/api/video/schedules/+server.js');
		mockDB.all.mockResolvedValueOnce({
			results: [
				{
					id: 'sched-1',
					user_id: 'user-1',
					name: 'Daily Promo',
					prompt: 'Create a product promo video',
					provider: 'openai',
					model: 'sora',
					aspect_ratio: '16:9',
					frequency: 'daily',
					enabled: 1,
					last_run_at: null,
					next_run_at: '2026-02-19T00:00:00Z',
					total_runs: 0,
					max_runs: null,
					created_at: '2026-02-18T00:00:00Z',
					updated_at: '2026-02-18T00:00:00Z'
				}
			]
		});

		const response = await GET({
			url: new URL('http://localhost/api/video/schedules'),
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const data = await response.json();
		expect(data.schedules).toHaveLength(1);
		expect(data.schedules[0].id).toBe('sched-1');
		expect(data.schedules[0].name).toBe('Daily Promo');
		expect(data.schedules[0].frequency).toBe('daily');
		expect(data.schedules[0].enabled).toBe(true);
	});
});

// ─────────────────────────────────────
// POST /api/video/schedules - Create schedule
// ─────────────────────────────────────
describe('POST /api/video/schedules - Create schedule', () => {
	it('should return 401 when not authenticated', async () => {
		const { POST } = await import('../../src/routes/api/video/schedules/+server.js');
		try {
			await POST({
				platform: mockPlatform,
				locals: { user: null },
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name: 'Test', prompt: 'test', frequency: 'daily' })
				})
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 400 when name is missing', async () => {
		const { POST } = await import('../../src/routes/api/video/schedules/+server.js');
		try {
			await POST({
				platform: mockPlatform,
				locals: mockLocals,
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ prompt: 'Make a video', frequency: 'daily' })
				})
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return 400 when prompt is missing', async () => {
		const { POST } = await import('../../src/routes/api/video/schedules/+server.js');
		try {
			await POST({
				platform: mockPlatform,
				locals: mockLocals,
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name: 'My Schedule', frequency: 'daily' })
				})
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return 400 for invalid frequency', async () => {
		const { POST } = await import('../../src/routes/api/video/schedules/+server.js');
		try {
			await POST({
				platform: mockPlatform,
				locals: mockLocals,
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name: 'Test',
						prompt: 'Make a video',
						frequency: 'every-5-minutes'
					})
				})
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should create schedule successfully', async () => {
		const { POST } = await import('../../src/routes/api/video/schedules/+server.js');
		mockDB.run.mockResolvedValueOnce({ success: true });

		const response = await POST({
			platform: mockPlatform,
			locals: mockLocals,
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: 'Daily Product Video',
					prompt: 'Generate a promotional video for our product',
					frequency: 'daily',
					aspectRatio: '16:9',
					model: 'sora'
				})
			})
		} as any);

		const data = await response.json();
		expect(data.success).toBe(true);
		expect(data.schedule.id).toBeDefined();
		expect(data.schedule.name).toBe('Daily Product Video');
		expect(data.schedule.frequency).toBe('daily');
		expect(data.schedule.enabled).toBe(true);
	});

	it('should accept optional maxRuns', async () => {
		const { POST } = await import('../../src/routes/api/video/schedules/+server.js');
		mockDB.run.mockResolvedValueOnce({ success: true });

		const response = await POST({
			platform: mockPlatform,
			locals: mockLocals,
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: 'Limited Run',
					prompt: 'Make a seasonal ad',
					frequency: 'weekly',
					maxRuns: 4
				})
			})
		} as any);

		const data = await response.json();
		expect(data.success).toBe(true);
		expect(data.schedule.maxRuns).toBe(4);
	});
});

// ──────────────────────────────────────────
// PATCH /api/video/schedules/[id] - Update
// ──────────────────────────────────────────
describe('PATCH /api/video/schedules/[id] - Update schedule', () => {
	it('should return 401 when not authenticated', async () => {
		const { PATCH } = await import('../../src/routes/api/video/schedules/[id]/+server.js');
		try {
			await PATCH({
				params: { id: 'sched-1' },
				platform: mockPlatform,
				locals: { user: null },
				request: new Request('http://localhost', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name: 'Updated' })
				})
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 404 when schedule does not exist', async () => {
		const { PATCH } = await import('../../src/routes/api/video/schedules/[id]/+server.js');
		mockDB.first.mockResolvedValueOnce(null);

		try {
			await PATCH({
				params: { id: 'nonexistent' },
				platform: mockPlatform,
				locals: mockLocals,
				request: new Request('http://localhost', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name: 'Updated' })
				})
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});

	it('should return 400 when no valid fields provided', async () => {
		const { PATCH } = await import('../../src/routes/api/video/schedules/[id]/+server.js');
		mockDB.first.mockResolvedValueOnce({ id: 'sched-1', user_id: 'user-1' });

		try {
			await PATCH({
				params: { id: 'sched-1' },
				platform: mockPlatform,
				locals: mockLocals,
				request: new Request('http://localhost', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({})
				})
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should update schedule name', async () => {
		const { PATCH } = await import('../../src/routes/api/video/schedules/[id]/+server.js');
		mockDB.first.mockResolvedValueOnce({ id: 'sched-1', user_id: 'user-1' });
		mockDB.run.mockResolvedValueOnce({ success: true });

		const response = await PATCH({
			params: { id: 'sched-1' },
			platform: mockPlatform,
			locals: mockLocals,
			request: new Request('http://localhost', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'Updated Schedule Name' })
			})
		} as any);

		const data = await response.json();
		expect(data.success).toBe(true);
		expect(data.id).toBe('sched-1');
	});

	it('should toggle enabled state', async () => {
		const { PATCH } = await import('../../src/routes/api/video/schedules/[id]/+server.js');
		mockDB.first.mockResolvedValueOnce({ id: 'sched-1', user_id: 'user-1' });
		mockDB.run.mockResolvedValueOnce({ success: true });

		const response = await PATCH({
			params: { id: 'sched-1' },
			platform: mockPlatform,
			locals: mockLocals,
			request: new Request('http://localhost', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ enabled: false })
			})
		} as any);

		const data = await response.json();
		expect(data.success).toBe(true);
	});

	it('should reject invalid frequency', async () => {
		const { PATCH } = await import('../../src/routes/api/video/schedules/[id]/+server.js');
		mockDB.first.mockResolvedValueOnce({ id: 'sched-1', user_id: 'user-1' });

		try {
			await PATCH({
				params: { id: 'sched-1' },
				platform: mockPlatform,
				locals: mockLocals,
				request: new Request('http://localhost', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ frequency: 'every-second' })
				})
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});
});

// ──────────────────────────────────────────
// DELETE /api/video/schedules/[id] - Delete
// ──────────────────────────────────────────
describe('DELETE /api/video/schedules/[id] - Delete schedule', () => {
	it('should return 401 when not authenticated', async () => {
		const { DELETE } = await import('../../src/routes/api/video/schedules/[id]/+server.js');
		try {
			await DELETE({
				params: { id: 'sched-1' },
				platform: mockPlatform,
				locals: { user: null }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 404 when schedule does not exist', async () => {
		const { DELETE } = await import('../../src/routes/api/video/schedules/[id]/+server.js');
		mockDB.first.mockResolvedValueOnce(null);

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

	it('should delete a schedule', async () => {
		const { DELETE } = await import('../../src/routes/api/video/schedules/[id]/+server.js');
		mockDB.first.mockResolvedValueOnce({ id: 'sched-1', user_id: 'user-1' });
		mockDB.run.mockResolvedValueOnce({ success: true });

		const response = await DELETE({
			params: { id: 'sched-1' },
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const data = await response.json();
		expect(data.success).toBe(true);
		expect(data.id).toBe('sched-1');
	});
});

// ──────────────────────────────────────────
// GET /api/video/schedules/[id] - Get single
// ──────────────────────────────────────────
describe('GET /api/video/schedules/[id] - Get schedule', () => {
	it('should return 401 when not authenticated', async () => {
		const { GET } = await import('../../src/routes/api/video/schedules/[id]/+server.js');
		try {
			await GET({
				params: { id: 'sched-1' },
				platform: mockPlatform,
				locals: { user: null }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 404 for non-existent schedule', async () => {
		const { GET } = await import('../../src/routes/api/video/schedules/[id]/+server.js');
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

	it('should return schedule details', async () => {
		const { GET } = await import('../../src/routes/api/video/schedules/[id]/+server.js');
		mockDB.first.mockResolvedValueOnce({
			id: 'sched-1',
			user_id: 'user-1',
			name: 'Daily Promo',
			prompt: 'Create a promo video',
			provider: 'openai',
			model: 'sora',
			aspect_ratio: '16:9',
			frequency: 'daily',
			enabled: 1,
			last_run_at: null,
			next_run_at: '2026-02-19T00:00:00Z',
			total_runs: 5,
			max_runs: 30,
			created_at: '2026-02-01T00:00:00Z',
			updated_at: '2026-02-18T00:00:00Z'
		});

		const response = await GET({
			params: { id: 'sched-1' },
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const data = await response.json();
		expect(data.id).toBe('sched-1');
		expect(data.name).toBe('Daily Promo');
		expect(data.prompt).toBe('Create a promo video');
		expect(data.frequency).toBe('daily');
		expect(data.enabled).toBe(true);
		expect(data.totalRuns).toBe(5);
		expect(data.maxRuns).toBe(30);
	});
});
