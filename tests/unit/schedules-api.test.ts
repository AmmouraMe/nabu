/**
 * Tests for video schedules CRUD API
 * - routes/api/video/schedules/+server.ts
 * - routes/api/video/schedules/[id]/+server.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Plans are not what this suite is about; see tests/fixtures/entitlements.ts.
vi.mock('$lib/server/entitlements', async () =>
	(await import('../fixtures/entitlements')).permissiveEntitlements()
);

function mockDB(overrides: Record<string, unknown> = {}) {
	return {
		prepare: vi.fn().mockReturnValue({
			bind: vi.fn().mockReturnValue({
				all: vi.fn().mockResolvedValue({ results: overrides.results ?? [] }),
				first: vi.fn().mockResolvedValue(overrides.first ?? null),
				run: vi.fn().mockResolvedValue({})
			})
		})
	};
}

// ─── /api/video/schedules ───
describe('GET /api/video/schedules', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
	});

	it('should return 401 for unauthenticated users', async () => {
		const { GET } = await import('../../src/routes/api/video/schedules/+server');
		try {
			await GET({ locals: { user: null }, platform: {} } as any);
			expect.fail('Should throw');
		} catch (e: any) {
			expect(e.status).toBe(401);
		}
	});

	it('should return 500 when platform.env is missing', async () => {
		const { GET } = await import('../../src/routes/api/video/schedules/+server');
		try {
			await GET({ locals: { user: { id: 'u1' } }, platform: null } as any);
			expect.fail('Should throw');
		} catch (e: any) {
			expect(e.status).toBe(500);
		}
	});

	it('should return empty schedules when DB is missing', async () => {
		const { GET } = await import('../../src/routes/api/video/schedules/+server');
		const res = await GET({
			locals: { user: { id: 'u1' } },
			platform: { env: {} }
		} as any);
		const data = await res.json();
		expect(data.schedules).toEqual([]);
	});

	it('should return schedules for user', async () => {
		const db = mockDB({
			results: [
				{
					id: 's1',
					name: 'Daily Video',
					prompt: 'Nature',
					provider: 'openai',
					model: 'sora',
					aspect_ratio: '16:9',
					frequency: 'daily',
					enabled: 1,
					last_run_at: null,
					next_run_at: '2025-01-01',
					total_runs: 0,
					max_runs: null,
					created_at: '2025-01-01',
					updated_at: '2025-01-01'
				}
			]
		});
		const { GET } = await import('../../src/routes/api/video/schedules/+server');
		const res = await GET({
			locals: { user: { id: 'u1' } },
			platform: { env: { DB: db } }
		} as any);
		const data = await res.json();
		expect(data.schedules).toHaveLength(1);
		expect(data.schedules[0].name).toBe('Daily Video');
		expect(data.schedules[0].enabled).toBe(true);
		expect(data.schedules[0].aspectRatio).toBe('16:9');
	});
});

describe('POST /api/video/schedules', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
	});

	it('should return 401 for unauthenticated', async () => {
		const { POST } = await import('../../src/routes/api/video/schedules/+server');
		try {
			await POST({
				locals: { user: null },
				platform: {},
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({})
				})
			} as any);
			expect.fail('Should throw');
		} catch (e: any) {
			expect(e.status).toBe(401);
		}
	});

	it('should return 500 when platform.env missing', async () => {
		const { POST } = await import('../../src/routes/api/video/schedules/+server');
		try {
			await POST({
				locals: { user: { id: 'u1' } },
				platform: null,
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({})
				})
			} as any);
			expect.fail('Should throw');
		} catch (e: any) {
			expect(e.status).toBe(500);
		}
	});

	it('should return 400 for missing name', async () => {
		const { POST } = await import('../../src/routes/api/video/schedules/+server');
		try {
			await POST({
				locals: { user: { id: 'u1' } },
				platform: { env: { DB: mockDB() } },
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ prompt: 'test' })
				})
			} as any);
			expect.fail('Should throw');
		} catch (e: any) {
			expect(e.status).toBe(400);
		}
	});

	it('should return 400 for missing prompt', async () => {
		const { POST } = await import('../../src/routes/api/video/schedules/+server');
		try {
			await POST({
				locals: { user: { id: 'u1' } },
				platform: { env: { DB: mockDB() } },
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ name: 'Test' })
				})
			} as any);
			expect.fail('Should throw');
		} catch (e: any) {
			expect(e.status).toBe(400);
		}
	});

	it('should return 400 for empty name', async () => {
		const { POST } = await import('../../src/routes/api/video/schedules/+server');
		try {
			await POST({
				locals: { user: { id: 'u1' } },
				platform: { env: { DB: mockDB() } },
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ name: '', prompt: 'test' })
				})
			} as any);
			expect.fail('Should throw');
		} catch (e: any) {
			expect(e.status).toBe(400);
		}
	});

	it('should return 400 for prompt over 4000 chars', async () => {
		const { POST } = await import('../../src/routes/api/video/schedules/+server');
		try {
			await POST({
				locals: { user: { id: 'u1' } },
				platform: { env: { DB: mockDB() } },
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ name: 'Test', prompt: 'x'.repeat(4001) })
				})
			} as any);
			expect.fail('Should throw');
		} catch (e: any) {
			expect(e.status).toBe(400);
		}
	});

	it('should return 400 for invalid frequency', async () => {
		const { POST } = await import('../../src/routes/api/video/schedules/+server');
		try {
			await POST({
				locals: { user: { id: 'u1' } },
				platform: { env: { DB: mockDB() } },
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ name: 'Test', prompt: 'test', frequency: 'yearly' })
				})
			} as any);
			expect.fail('Should throw');
		} catch (e: any) {
			expect(e.status).toBe(400);
		}
	});

	it('should create schedule with defaults', async () => {
		const db = mockDB();
		const { POST } = await import('../../src/routes/api/video/schedules/+server');
		const res = await POST({
			locals: { user: { id: 'u1' } },
			platform: { env: { DB: db } },
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ name: 'My Schedule', prompt: 'A nature video' })
			})
		} as any);
		const data = await res.json();
		expect(data.success).toBe(true);
		expect(data.schedule.name).toBe('My Schedule');
		expect(data.schedule.frequency).toBe('daily');
		expect(data.schedule.model).toBe('sora');
		expect(data.schedule.aspectRatio).toBe('16:9');
	});

	it('should create schedule with custom frequency and model', async () => {
		const db = mockDB();
		const { POST } = await import('../../src/routes/api/video/schedules/+server');
		const res = await POST({
			locals: { user: { id: 'u1' } },
			platform: { env: { DB: db } },
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					name: 'Weekly',
					prompt: 'A cityscape',
					frequency: 'weekly',
					model: 'custom-model',
					aspectRatio: '9:16',
					maxRuns: 10
				})
			})
		} as any);
		const data = await res.json();
		expect(data.schedule.frequency).toBe('weekly');
		expect(data.schedule.model).toBe('custom-model');
		expect(data.schedule.aspectRatio).toBe('9:16');
		expect(data.schedule.maxRuns).toBe(10);
	});

	it('should handle hourly frequency', async () => {
		const db = mockDB();
		const { POST } = await import('../../src/routes/api/video/schedules/+server');
		const res = await POST({
			locals: { user: { id: 'u1' } },
			platform: { env: { DB: db } },
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ name: 'Hourly', prompt: 'test', frequency: 'hourly' })
			})
		} as any);
		const data = await res.json();
		expect(data.schedule.frequency).toBe('hourly');
	});

	it('should handle monthly frequency', async () => {
		const db = mockDB();
		const { POST } = await import('../../src/routes/api/video/schedules/+server');
		const res = await POST({
			locals: { user: { id: 'u1' } },
			platform: { env: { DB: db } },
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ name: 'Monthly', prompt: 'test', frequency: 'monthly' })
			})
		} as any);
		const data = await res.json();
		expect(data.schedule.frequency).toBe('monthly');
	});
});

// ─── /api/video/schedules/[id] ───
describe('GET /api/video/schedules/[id]', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
	});

	it('should return 401 for unauthenticated', async () => {
		const { GET } = await import('../../src/routes/api/video/schedules/[id]/+server');
		try {
			await GET({ locals: { user: null }, params: { id: 's1' }, platform: {} } as any);
			expect.fail('Should throw');
		} catch (e: any) {
			expect(e.status).toBe(401);
		}
	});

	it('should return 500 when platform missing', async () => {
		const { GET } = await import('../../src/routes/api/video/schedules/[id]/+server');
		try {
			await GET({
				locals: { user: { id: 'u1' } },
				params: { id: 's1' },
				platform: null
			} as any);
			expect.fail('Should throw');
		} catch (e: any) {
			expect(e.status).toBe(500);
		}
	});

	it('should return 404 when schedule not found', async () => {
		const db = mockDB({ first: null });
		const { GET } = await import('../../src/routes/api/video/schedules/[id]/+server');
		try {
			await GET({
				locals: { user: { id: 'u1' } },
				params: { id: 'nonexistent' },
				platform: { env: { DB: db } }
			} as any);
			expect.fail('Should throw');
		} catch (e: any) {
			expect(e.status).toBe(404);
		}
	});

	it('should return schedule details', async () => {
		const db = mockDB({
			first: {
				id: 's1',
				name: 'Test',
				prompt: 'A video',
				provider: 'openai',
				model: 'sora',
				aspect_ratio: '16:9',
				frequency: 'daily',
				enabled: 1,
				last_run_at: null,
				next_run_at: '2025-01-01',
				total_runs: 5,
				max_runs: 10,
				created_at: '2025-01-01',
				updated_at: '2025-01-01'
			}
		});
		const { GET } = await import('../../src/routes/api/video/schedules/[id]/+server');
		const res = await GET({
			locals: { user: { id: 'u1' } },
			params: { id: 's1' },
			platform: { env: { DB: db } }
		} as any);
		const data = await res.json();
		expect(data.name).toBe('Test');
		expect(data.enabled).toBe(true);
		expect(data.totalRuns).toBe(5);
	});
});

describe('PATCH /api/video/schedules/[id]', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
	});

	function mockDBWithExisting() {
		return {
			prepare: vi.fn().mockReturnValue({
				bind: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue({ id: 's1' }),
					run: vi.fn().mockResolvedValue({})
				})
			})
		};
	}

	it('should return 401 for unauthenticated', async () => {
		const { PATCH } = await import('../../src/routes/api/video/schedules/[id]/+server');
		try {
			await PATCH({
				locals: { user: null },
				params: { id: 's1' },
				platform: {},
				request: new Request('http://localhost', {
					method: 'PATCH',
					body: JSON.stringify({})
				})
			} as any);
			expect.fail('Should throw');
		} catch (e: any) {
			expect(e.status).toBe(401);
		}
	});

	it('should return 500 when platform missing', async () => {
		const { PATCH } = await import('../../src/routes/api/video/schedules/[id]/+server');
		try {
			await PATCH({
				locals: { user: { id: 'u1' } },
				params: { id: 's1' },
				platform: null,
				request: new Request('http://localhost', {
					method: 'PATCH',
					body: JSON.stringify({})
				})
			} as any);
			expect.fail('Should throw');
		} catch (e: any) {
			expect(e.status).toBe(500);
		}
	});

	it('should return 404 when schedule not found', async () => {
		const db = mockDB({ first: null });
		const { PATCH } = await import('../../src/routes/api/video/schedules/[id]/+server');
		try {
			await PATCH({
				locals: { user: { id: 'u1' } },
				params: { id: 'nonexistent' },
				platform: { env: { DB: db } },
				request: new Request('http://localhost', {
					method: 'PATCH',
					body: JSON.stringify({ name: 'Updated' })
				})
			} as any);
			expect.fail('Should throw');
		} catch (e: any) {
			expect(e.status).toBe(404);
		}
	});

	it('should return 400 for empty update body', async () => {
		const { PATCH } = await import('../../src/routes/api/video/schedules/[id]/+server');
		try {
			await PATCH({
				locals: { user: { id: 'u1' } },
				params: { id: 's1' },
				platform: { env: { DB: mockDBWithExisting() } },
				request: new Request('http://localhost', {
					method: 'PATCH',
					body: JSON.stringify({})
				})
			} as any);
			expect.fail('Should throw');
		} catch (e: any) {
			expect(e.status).toBe(400);
		}
	});

	it('should return 400 for empty name', async () => {
		const { PATCH } = await import('../../src/routes/api/video/schedules/[id]/+server');
		try {
			await PATCH({
				locals: { user: { id: 'u1' } },
				params: { id: 's1' },
				platform: { env: { DB: mockDBWithExisting() } },
				request: new Request('http://localhost', {
					method: 'PATCH',
					body: JSON.stringify({ name: '' })
				})
			} as any);
			expect.fail('Should throw');
		} catch (e: any) {
			expect(e.status).toBe(400);
		}
	});

	it('should return 400 for empty prompt', async () => {
		const { PATCH } = await import('../../src/routes/api/video/schedules/[id]/+server');
		try {
			await PATCH({
				locals: { user: { id: 'u1' } },
				params: { id: 's1' },
				platform: { env: { DB: mockDBWithExisting() } },
				request: new Request('http://localhost', {
					method: 'PATCH',
					body: JSON.stringify({ prompt: '' })
				})
			} as any);
			expect.fail('Should throw');
		} catch (e: any) {
			expect(e.status).toBe(400);
		}
	});

	it('should return 400 for prompt over 4000', async () => {
		const { PATCH } = await import('../../src/routes/api/video/schedules/[id]/+server');
		try {
			await PATCH({
				locals: { user: { id: 'u1' } },
				params: { id: 's1' },
				platform: { env: { DB: mockDBWithExisting() } },
				request: new Request('http://localhost', {
					method: 'PATCH',
					body: JSON.stringify({ prompt: 'x'.repeat(4001) })
				})
			} as any);
			expect.fail('Should throw');
		} catch (e: any) {
			expect(e.status).toBe(400);
		}
	});

	it('should return 400 for invalid frequency', async () => {
		const { PATCH } = await import('../../src/routes/api/video/schedules/[id]/+server');
		try {
			await PATCH({
				locals: { user: { id: 'u1' } },
				params: { id: 's1' },
				platform: { env: { DB: mockDBWithExisting() } },
				request: new Request('http://localhost', {
					method: 'PATCH',
					body: JSON.stringify({ frequency: 'biweekly' })
				})
			} as any);
			expect.fail('Should throw');
		} catch (e: any) {
			expect(e.status).toBe(400);
		}
	});

	it('should update name only', async () => {
		const db = mockDBWithExisting();
		const { PATCH } = await import('../../src/routes/api/video/schedules/[id]/+server');
		const res = await PATCH({
			locals: { user: { id: 'u1' } },
			params: { id: 's1' },
			platform: { env: { DB: db } },
			request: new Request('http://localhost', {
				method: 'PATCH',
				body: JSON.stringify({ name: 'Updated Name' })
			})
		} as any);
		const data = await res.json();
		expect(data.success).toBe(true);
	});

	it('should update prompt only', async () => {
		const db = mockDBWithExisting();
		const { PATCH } = await import('../../src/routes/api/video/schedules/[id]/+server');
		const res = await PATCH({
			locals: { user: { id: 'u1' } },
			params: { id: 's1' },
			platform: { env: { DB: db } },
			request: new Request('http://localhost', {
				method: 'PATCH',
				body: JSON.stringify({ prompt: 'New prompt' })
			})
		} as any);
		const data = await res.json();
		expect(data.success).toBe(true);
	});

	it('should update frequency', async () => {
		const db = mockDBWithExisting();
		const { PATCH } = await import('../../src/routes/api/video/schedules/[id]/+server');
		const res = await PATCH({
			locals: { user: { id: 'u1' } },
			params: { id: 's1' },
			platform: { env: { DB: db } },
			request: new Request('http://localhost', {
				method: 'PATCH',
				body: JSON.stringify({ frequency: 'weekly' })
			})
		} as any);
		const data = await res.json();
		expect(data.success).toBe(true);
	});

	it('should update model', async () => {
		const db = mockDBWithExisting();
		const { PATCH } = await import('../../src/routes/api/video/schedules/[id]/+server');
		const res = await PATCH({
			locals: { user: { id: 'u1' } },
			params: { id: 's1' },
			platform: { env: { DB: db } },
			request: new Request('http://localhost', {
				method: 'PATCH',
				body: JSON.stringify({ model: 'new-model' })
			})
		} as any);
		const data = await res.json();
		expect(data.success).toBe(true);
	});

	it('should update aspectRatio', async () => {
		const db = mockDBWithExisting();
		const { PATCH } = await import('../../src/routes/api/video/schedules/[id]/+server');
		const res = await PATCH({
			locals: { user: { id: 'u1' } },
			params: { id: 's1' },
			platform: { env: { DB: db } },
			request: new Request('http://localhost', {
				method: 'PATCH',
				body: JSON.stringify({ aspectRatio: '9:16' })
			})
		} as any);
		const data = await res.json();
		expect(data.success).toBe(true);
	});

	it('should update enabled flag', async () => {
		const db = mockDBWithExisting();
		const { PATCH } = await import('../../src/routes/api/video/schedules/[id]/+server');
		const res = await PATCH({
			locals: { user: { id: 'u1' } },
			params: { id: 's1' },
			platform: { env: { DB: db } },
			request: new Request('http://localhost', {
				method: 'PATCH',
				body: JSON.stringify({ enabled: false })
			})
		} as any);
		const data = await res.json();
		expect(data.success).toBe(true);
	});

	it('should update maxRuns', async () => {
		const db = mockDBWithExisting();
		const { PATCH } = await import('../../src/routes/api/video/schedules/[id]/+server');
		const res = await PATCH({
			locals: { user: { id: 'u1' } },
			params: { id: 's1' },
			platform: { env: { DB: db } },
			request: new Request('http://localhost', {
				method: 'PATCH',
				body: JSON.stringify({ maxRuns: 50 })
			})
		} as any);
		const data = await res.json();
		expect(data.success).toBe(true);
	});

	it('should update multiple fields at once', async () => {
		const db = mockDBWithExisting();
		const { PATCH } = await import('../../src/routes/api/video/schedules/[id]/+server');
		const res = await PATCH({
			locals: { user: { id: 'u1' } },
			params: { id: 's1' },
			platform: { env: { DB: db } },
			request: new Request('http://localhost', {
				method: 'PATCH',
				body: JSON.stringify({
					name: 'Updated',
					prompt: 'New prompt',
					frequency: 'hourly',
					model: 'new-model',
					aspectRatio: '1:1',
					enabled: true,
					maxRuns: null
				})
			})
		} as any);
		const data = await res.json();
		expect(data.success).toBe(true);
	});
});

describe('DELETE /api/video/schedules/[id]', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
	});

	it('should return 401 for unauthenticated', async () => {
		const { DELETE } = await import('../../src/routes/api/video/schedules/[id]/+server');
		try {
			await DELETE({ locals: { user: null }, params: { id: 's1' }, platform: {} } as any);
			expect.fail('Should throw');
		} catch (e: any) {
			expect(e.status).toBe(401);
		}
	});

	it('should return 500 when platform missing', async () => {
		const { DELETE } = await import('../../src/routes/api/video/schedules/[id]/+server');
		try {
			await DELETE({
				locals: { user: { id: 'u1' } },
				params: { id: 's1' },
				platform: null
			} as any);
			expect.fail('Should throw');
		} catch (e: any) {
			expect(e.status).toBe(500);
		}
	});

	it('should return 404 when schedule not found', async () => {
		const db = mockDB({ first: null });
		const { DELETE } = await import('../../src/routes/api/video/schedules/[id]/+server');
		try {
			await DELETE({
				locals: { user: { id: 'u1' } },
				params: { id: 'nonexistent' },
				platform: { env: { DB: db } }
			} as any);
			expect.fail('Should throw');
		} catch (e: any) {
			expect(e.status).toBe(404);
		}
	});

	it('should delete schedule successfully', async () => {
		const db = {
			prepare: vi.fn().mockReturnValue({
				bind: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue({ id: 's1' }),
					run: vi.fn().mockResolvedValue({})
				})
			})
		};
		const { DELETE } = await import('../../src/routes/api/video/schedules/[id]/+server');
		const res = await DELETE({
			locals: { user: { id: 'u1' } },
			params: { id: 's1' },
			platform: { env: { DB: db } }
		} as any);
		const data = await res.json();
		expect(data.success).toBe(true);
		expect(data.id).toBe('s1');
	});
});
