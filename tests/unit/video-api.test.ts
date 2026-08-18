import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Tests for Video Generation CRUD API routes
 * Covers: GET /api/video, GET /api/video/[id], POST /api/video/generate,
 *         PATCH /api/video/[id], DELETE /api/video/[id], GET /api/video/models
 */

// Mock the video-registry module before imports
vi.mock('$lib/services/video-registry', () => ({
	getEnabledVideoKey: vi.fn(),
	getVideoProvider: vi.fn(),
	getModelsForKey: vi.fn(),
	getAllVideoModels: vi.fn(),
	getAllEnabledVideoKeys: vi.fn()
}));

let mockDB: any;
let mockKV: any;
let mockBucket: any;
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
	mockKV = {
		get: vi.fn().mockResolvedValue(null),
		put: vi.fn().mockResolvedValue(undefined),
		delete: vi.fn().mockResolvedValue(undefined)
	};
	mockBucket = {
		put: vi.fn().mockResolvedValue(undefined),
		get: vi.fn().mockResolvedValue(null),
		delete: vi.fn().mockResolvedValue(undefined)
	};
	mockPlatform = { env: { DB: mockDB, KV: mockKV, BUCKET: mockBucket } };
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
// GET /api/video - List video generations
// ─────────────────────────────────────
describe('GET /api/video - List video generations', () => {
	it('should return 401 when not authenticated', async () => {
		const { GET } = await import('../../src/routes/api/video/+server.js');
		try {
			await GET({
				url: new URL('http://localhost/api/video'),
				platform: mockPlatform,
				locals: { user: null }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 500 when platform not available', async () => {
		const { GET } = await import('../../src/routes/api/video/+server.js');
		try {
			await GET({
				url: new URL('http://localhost/api/video'),
				platform: null,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('should return empty video list', async () => {
		const { GET } = await import('../../src/routes/api/video/+server.js');
		mockDB.all.mockResolvedValueOnce({ results: [] });
		mockDB.first.mockResolvedValueOnce({ total: 0 });

		const response = await GET({
			url: new URL('http://localhost/api/video'),
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const data = await response.json();
		expect(data.videos).toEqual([]);
		expect(data.total).toBe(0);
	});

	it('should return paginated videos', async () => {
		const { GET } = await import('../../src/routes/api/video/+server.js');
		mockDB.all.mockResolvedValueOnce({
			results: [
				{
					id: 'vid-1',
					prompt: 'A sunset',
					provider: 'openai',
					model: 'sora',
					status: 'complete',
					video_url: 'https://example.com/video.mp4',
					thumbnail_url: null,
					r2_key: null,
					duration_seconds: 10,
					aspect_ratio: '16:9',
					cost: 0.5,
					error: null,
					created_at: '2026-01-01T00:00:00Z',
					completed_at: '2026-01-01T00:01:00Z'
				}
			]
		});
		mockDB.first.mockResolvedValueOnce({ total: 1 });

		const response = await GET({
			url: new URL('http://localhost/api/video?limit=10&offset=0'),
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const data = await response.json();
		expect(data.videos).toHaveLength(1);
		expect(data.videos[0].id).toBe('vid-1');
		expect(data.videos[0].prompt).toBe('A sunset');
		expect(data.videos[0].videoUrl).toBe('https://example.com/video.mp4');
		expect(data.total).toBe(1);
		expect(data.limit).toBe(10);
		expect(data.offset).toBe(0);
	});

	it('should filter by status', async () => {
		const { GET } = await import('../../src/routes/api/video/+server.js');
		mockDB.all.mockResolvedValueOnce({ results: [] });
		mockDB.first.mockResolvedValueOnce({ total: 0 });

		await GET({
			url: new URL('http://localhost/api/video?status=complete'),
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		// Verify status filter was bound in the query
		expect(mockDB.bind).toHaveBeenCalled();
	});

	it('should cap limit at 50', async () => {
		const { GET } = await import('../../src/routes/api/video/+server.js');
		mockDB.all.mockResolvedValueOnce({ results: [] });
		mockDB.first.mockResolvedValueOnce({ total: 0 });

		const response = await GET({
			url: new URL('http://localhost/api/video?limit=100'),
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const data = await response.json();
		expect(data.limit).toBe(50);
	});
});

// ─────────────────────────────────────
// GET /api/video/[id] - Get single video
// ─────────────────────────────────────
describe('GET /api/video/[id] - Get single video', () => {
	it('should return 401 when not authenticated', async () => {
		const { GET } = await import('../../src/routes/api/video/[id]/+server.js');
		try {
			await GET({
				params: { id: 'vid-1' },
				platform: mockPlatform,
				locals: { user: null }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 404 for non-existent video', async () => {
		const { GET } = await import('../../src/routes/api/video/[id]/+server.js');
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

	it('should return video generation details', async () => {
		const { GET } = await import('../../src/routes/api/video/[id]/+server.js');
		mockDB.first.mockResolvedValueOnce({
			id: 'vid-1',
			prompt: 'A sunset over the ocean',
			provider: 'openai',
			model: 'sora',
			status: 'complete',
			video_url: 'https://example.com/video.mp4',
			thumbnail_url: 'https://example.com/thumb.jpg',
			r2_key: 'videos/user-1/vid-1.mp4',
			duration_seconds: 15,
			aspect_ratio: '16:9',
			resolution: '1080p',
			cost: 0.5,
			error: null,
			created_at: '2026-01-01T00:00:00Z',
			completed_at: '2026-01-01T00:01:00Z'
		});

		const response = await GET({
			params: { id: 'vid-1' },
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const data = await response.json();
		expect(data.id).toBe('vid-1');
		expect(data.prompt).toBe('A sunset over the ocean');
		expect(data.status).toBe('complete');
		expect(data.videoUrl).toBe('https://example.com/video.mp4');
		expect(data.thumbnailUrl).toBe('https://example.com/thumb.jpg');
		expect(data.duration).toBe(15);
		expect(data.aspectRatio).toBe('16:9');
		expect(data.resolution).toBe('1080p');
	});
});

// ─────────────────────────────────────
// PATCH /api/video/[id] - Update video
// ─────────────────────────────────────
describe('PATCH /api/video/[id] - Update video metadata', () => {
	it('should return 401 when not authenticated', async () => {
		const { PATCH } = await import('../../src/routes/api/video/[id]/+server.js');
		try {
			await PATCH({
				params: { id: 'vid-1' },
				platform: mockPlatform,
				locals: { user: null },
				request: new Request('http://localhost', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ prompt: 'Updated prompt' })
				})
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 500 when platform not available', async () => {
		const { PATCH } = await import('../../src/routes/api/video/[id]/+server.js');
		try {
			await PATCH({
				params: { id: 'vid-1' },
				platform: null,
				locals: mockLocals,
				request: new Request('http://localhost', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ prompt: 'Updated' })
				})
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('should return 404 when video does not exist', async () => {
		const { PATCH } = await import('../../src/routes/api/video/[id]/+server.js');
		mockDB.first.mockResolvedValueOnce(null);

		try {
			await PATCH({
				params: { id: 'nonexistent' },
				platform: mockPlatform,
				locals: mockLocals,
				request: new Request('http://localhost', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ prompt: 'Updated' })
				})
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});

	it('should return 400 when no valid fields to update', async () => {
		const { PATCH } = await import('../../src/routes/api/video/[id]/+server.js');
		mockDB.first.mockResolvedValueOnce({ id: 'vid-1', user_id: 'user-1' });

		try {
			await PATCH({
				params: { id: 'vid-1' },
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

	it('should update the prompt/label', async () => {
		const { PATCH } = await import('../../src/routes/api/video/[id]/+server.js');
		mockDB.first.mockResolvedValueOnce({
			id: 'vid-1',
			user_id: 'user-1',
			prompt: 'Old prompt',
			status: 'complete'
		});
		mockDB.run.mockResolvedValueOnce({ success: true });

		const response = await PATCH({
			params: { id: 'vid-1' },
			platform: mockPlatform,
			locals: mockLocals,
			request: new Request('http://localhost', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ prompt: 'Updated prompt description' })
			})
		} as any);

		const data = await response.json();
		expect(data.success).toBe(true);
		expect(data.id).toBe('vid-1');
		expect(mockDB.prepare).toHaveBeenCalled();
		expect(mockDB.run).toHaveBeenCalled();
	});

	it('should reject prompt longer than 4000 characters', async () => {
		const { PATCH } = await import('../../src/routes/api/video/[id]/+server.js');
		mockDB.first.mockResolvedValueOnce({ id: 'vid-1', user_id: 'user-1' });

		try {
			await PATCH({
				params: { id: 'vid-1' },
				platform: mockPlatform,
				locals: mockLocals,
				request: new Request('http://localhost', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ prompt: 'x'.repeat(4001) })
				})
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});
});

// ─────────────────────────────────────
// DELETE /api/video/[id] - Delete video
// ─────────────────────────────────────
describe('DELETE /api/video/[id] - Delete video generation', () => {
	it('should return 401 when not authenticated', async () => {
		const { DELETE } = await import('../../src/routes/api/video/[id]/+server.js');
		try {
			await DELETE({
				params: { id: 'vid-1' },
				platform: mockPlatform,
				locals: { user: null }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 500 when platform not available', async () => {
		const { DELETE } = await import('../../src/routes/api/video/[id]/+server.js');
		try {
			await DELETE({
				params: { id: 'vid-1' },
				platform: null,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('should return 404 when video does not exist', async () => {
		const { DELETE } = await import('../../src/routes/api/video/[id]/+server.js');
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

	it('should delete a video generation record', async () => {
		const { DELETE } = await import('../../src/routes/api/video/[id]/+server.js');
		mockDB.first.mockResolvedValueOnce({
			id: 'vid-1',
			user_id: 'user-1',
			r2_key: null,
			status: 'complete'
		});
		mockDB.run.mockResolvedValueOnce({ success: true });

		const response = await DELETE({
			params: { id: 'vid-1' },
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const data = await response.json();
		expect(data.success).toBe(true);
		expect(data.id).toBe('vid-1');
	});

	it('should delete R2 object when r2_key exists', async () => {
		const { DELETE } = await import('../../src/routes/api/video/[id]/+server.js');
		mockDB.first.mockResolvedValueOnce({
			id: 'vid-1',
			user_id: 'user-1',
			r2_key: 'videos/user-1/vid-1.mp4',
			status: 'complete'
		});
		mockDB.run.mockResolvedValueOnce({ success: true });

		const response = await DELETE({
			params: { id: 'vid-1' },
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const data = await response.json();
		expect(data.success).toBe(true);
		expect(mockBucket.delete).toHaveBeenCalledWith('videos/user-1/vid-1.mp4');
	});

	it('should still succeed if R2 deletion fails', async () => {
		const { DELETE } = await import('../../src/routes/api/video/[id]/+server.js');
		mockDB.first.mockResolvedValueOnce({
			id: 'vid-1',
			user_id: 'user-1',
			r2_key: 'videos/user-1/vid-1.mp4',
			status: 'complete'
		});
		mockDB.run.mockResolvedValueOnce({ success: true });
		mockBucket.delete.mockRejectedValueOnce(new Error('R2 failure'));

		const response = await DELETE({
			params: { id: 'vid-1' },
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const data = await response.json();
		expect(data.success).toBe(true);
	});
});

// ─────────────────────────────────────
// POST /api/video/generate - Generate video
// ─────────────────────────────────────
describe('POST /api/video/generate - Generate video', () => {
	it('should return 401 when not authenticated', async () => {
		const { POST } = await import('../../src/routes/api/video/generate/+server.js');
		try {
			await POST({
				platform: mockPlatform,
				locals: { user: null },
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ prompt: 'test' })
				})
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 400 when prompt is missing', async () => {
		const { POST } = await import('../../src/routes/api/video/generate/+server.js');
		try {
			await POST({
				platform: mockPlatform,
				locals: mockLocals,
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({})
				})
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return 400 when prompt is empty', async () => {
		const { POST } = await import('../../src/routes/api/video/generate/+server.js');
		try {
			await POST({
				platform: mockPlatform,
				locals: mockLocals,
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ prompt: '   ' })
				})
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return 400 when prompt exceeds 4000 characters', async () => {
		const { POST } = await import('../../src/routes/api/video/generate/+server.js');
		try {
			await POST({
				platform: mockPlatform,
				locals: mockLocals,
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ prompt: 'x'.repeat(4001) })
				})
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return 503 when no video provider available', async () => {
		const { getEnabledVideoKey } = await import('$lib/services/video-registry');
		(getEnabledVideoKey as any).mockResolvedValue(null);

		const { POST } = await import('../../src/routes/api/video/generate/+server.js');
		try {
			await POST({
				platform: mockPlatform,
				locals: mockLocals,
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ prompt: 'A beautiful sunset' })
				})
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(503);
		}
	});

	it('should generate video successfully', async () => {
		const { getEnabledVideoKey, getVideoProvider } = await import('$lib/services/video-registry');
		(getEnabledVideoKey as any).mockResolvedValue({
			id: 'key-1',
			provider: 'openai',
			apiKey: 'test-key',
			videoEnabled: true
		});
		(getVideoProvider as any).mockReturnValue({
			name: 'openai',
			generateVideo: vi.fn().mockResolvedValue({
				providerJobId: 'prov-job-1',
				status: 'queued',
				videoUrl: null
			}),
			getAvailableModels: vi.fn().mockReturnValue([{ id: 'sora', displayName: 'Sora' }])
		});

		const { POST } = await import('../../src/routes/api/video/generate/+server.js');
		const response = await POST({
			platform: mockPlatform,
			locals: mockLocals,
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					prompt: 'A sunset over the ocean',
					aspectRatio: '16:9'
				})
			})
		} as any);

		const data = await response.json();
		expect(data.id).toBeDefined();
		expect(data.status).toBe('queued');
		expect(data.providerJobId).toBe('prov-job-1');
	});

	it('should pass duration to provider when specified', async () => {
		const mockGenerateVideo = vi.fn().mockResolvedValue({
			providerJobId: 'prov-job-2',
			status: 'queued',
			videoUrl: null
		});
		const { getEnabledVideoKey, getVideoProvider } = await import('$lib/services/video-registry');
		(getEnabledVideoKey as any).mockResolvedValue({
			id: 'key-1',
			provider: 'openai',
			apiKey: 'test-key',
			videoEnabled: true
		});
		(getVideoProvider as any).mockReturnValue({
			name: 'openai',
			generateVideo: mockGenerateVideo,
			getAvailableModels: vi.fn().mockReturnValue([{ id: 'sora', displayName: 'Sora' }])
		});

		const { POST } = await import('../../src/routes/api/video/generate/+server.js');
		await POST({
			platform: mockPlatform,
			locals: mockLocals,
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					prompt: 'A sunset over the ocean',
					aspectRatio: '16:9',
					duration: 12
				})
			})
		} as any);

		expect(mockGenerateVideo).toHaveBeenCalledWith(
			'test-key',
			expect.objectContaining({
				duration: 12
			})
		);
	});

	it('should ignore invalid duration values', async () => {
		const mockGenerateVideo = vi.fn().mockResolvedValue({
			providerJobId: 'prov-job-3',
			status: 'queued',
			videoUrl: null
		});
		const { getEnabledVideoKey, getVideoProvider } = await import('$lib/services/video-registry');
		(getEnabledVideoKey as any).mockResolvedValue({
			id: 'key-1',
			provider: 'openai',
			apiKey: 'test-key',
			videoEnabled: true
		});
		(getVideoProvider as any).mockReturnValue({
			name: 'openai',
			generateVideo: mockGenerateVideo,
			getAvailableModels: vi.fn().mockReturnValue([{ id: 'sora', displayName: 'Sora' }])
		});

		const { POST } = await import('../../src/routes/api/video/generate/+server.js');
		await POST({
			platform: mockPlatform,
			locals: mockLocals,
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					prompt: 'A sunset over the ocean',
					duration: 999
				})
			})
		} as any);

		expect(mockGenerateVideo).toHaveBeenCalledWith(
			'test-key',
			expect.objectContaining({
				duration: undefined
			})
		);
	});
});

// ─────────────────────────────────────
// GET /api/video/models - Get available models
// ─────────────────────────────────────
describe('GET /api/video/models - Available models', () => {
	it('should return 401 when not authenticated', async () => {
		const { GET } = await import('../../src/routes/api/video/models/+server.js');
		try {
			await GET({
				platform: mockPlatform,
				locals: { user: null }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return empty models when no provider configured', async () => {
		const { getAllEnabledVideoKeys } = await import('$lib/services/video-registry');
		(getAllEnabledVideoKeys as any).mockResolvedValue([]);

		const { GET } = await import('../../src/routes/api/video/models/+server.js');
		const response = await GET({
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const data = await response.json();
		expect(data.models).toEqual([]);
	});

	it('should return available models', async () => {
		const { getAllEnabledVideoKeys, getModelsForKey } = await import(
			'$lib/services/video-registry'
		);
		(getAllEnabledVideoKeys as any).mockResolvedValue([
			{
				id: 'key-1',
				provider: 'openai',
				apiKey: 'test-key',
				videoEnabled: true
			}
		]);
		(getModelsForKey as any).mockReturnValue([
			{
				id: 'sora',
				displayName: 'Sora',
				provider: 'openai',
				type: 'text-to-video',
				maxDuration: 12,
				supportedAspectRatios: ['16:9', '9:16', '1:1'],
				supportedResolutions: ['1080p', '720p']
			}
		]);

		const { GET } = await import('../../src/routes/api/video/models/+server.js');
		const response = await GET({
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const data = await response.json();
		expect(data.models).toHaveLength(1);
		expect(data.models[0].id).toBe('sora');
		expect(data.models[0].provider).toBe('openai');
	});
});
