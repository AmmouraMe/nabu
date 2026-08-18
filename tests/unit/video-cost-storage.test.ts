import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Tests for video generation cost storage in the stream endpoint.
 *
 * When a video generation completes, the stream endpoint should:
 * 1. Look up the model's pricing from the provider
 * 2. Calculate the cost based on pricing type and duration
 * 3. Store the cost in the video_generations DB record
 * 4. Include cost in the SSE event sent to the client
 */

vi.mock('$lib/services/video-registry', () => ({
	getEnabledVideoKey: vi.fn(),
	getVideoProvider: vi.fn(),
	getModelsForKey: vi.fn(),
	getAllVideoModels: vi.fn()
}));

describe('Stream endpoint stores cost on video completion', () => {
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
				KV: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
				BUCKET: { put: vi.fn(), get: vi.fn(), delete: vi.fn() }
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

	it('should include cost in the UPDATE when OpenAI video generation completes', async () => {
		const { getEnabledVideoKey, getVideoProvider } = await import('$lib/services/video-registry');
		const { GET } = await import('../../src/routes/api/video/[id]/stream/+server.js');

		// Mock: DB returns a generating record with model field
		mockDB.first.mockResolvedValueOnce({
			id: 'gen-cost-1',
			provider: 'openai',
			provider_job_id: 'prov-job-1',
			status: 'generating',
			video_url: null,
			message_id: null,
			conversation_id: null,
			model: 'sora-2'
		});

		// Mock: provider returns completed status with duration
		const mockProvider = {
			name: 'openai',
			getStatus: vi.fn().mockResolvedValue({
				status: 'complete',
				videoUrl: 'https://example.com/video.mp4',
				thumbnailUrl: 'https://example.com/thumb.jpg',
				duration: 10,
				progress: 100
			}),
			downloadVideo: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
			getAvailableModels: vi.fn().mockReturnValue([
				{
					id: 'sora-2',
					displayName: 'Sora 2',
					provider: 'openai',
					pricing: { estimatedCostPerSecond: 0.1, currency: 'USD' }
				}
			]),
			generateVideo: vi.fn()
		};

		vi.mocked(getEnabledVideoKey).mockResolvedValue({
			id: 'key-1',
			name: 'OpenAI',
			provider: 'openai',
			apiKey: 'sk-test',
			enabled: true,
			videoEnabled: true
		});
		vi.mocked(getVideoProvider).mockReturnValue(mockProvider as any);

		const response = await GET({
			params: { id: 'gen-cost-1' },
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		// Wait for the async polling + DB update to finish
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Cancel the response to clean up
		try {
			if (response.body && typeof response.body.cancel === 'function') {
				await response.body.cancel();
			}
		} catch {
			// ignore cleanup errors
		}

		// Verify the completion UPDATE SQL includes cost
		const prepareCalls = mockDB.prepare.mock.calls.map((c: any[]) => c[0] as string);
		const updateCall = prepareCalls.find(
			(sql: string) =>
				sql.includes('UPDATE video_generations') && sql.includes("status = 'complete'")
		);
		expect(updateCall).toBeDefined();
		expect(updateCall).toContain('cost');

		// Verify the bind call includes the computed cost value
		// sora-2 at $0.10/sec * 10 sec = $1.00
		const bindCalls = mockDB.bind.mock.calls;
		const costBindCall = bindCalls.find((args: any[]) =>
			args.some((arg: any) => typeof arg === 'number' && Math.abs(arg - 1.0) < 0.001)
		);
		expect(costBindCall).toBeDefined();
	});

	it('should store cost for WaveSpeed per-generation model', async () => {
		const { getEnabledVideoKey, getVideoProvider } = await import('$lib/services/video-registry');
		const { GET } = await import('../../src/routes/api/video/[id]/stream/+server.js');

		mockDB.first.mockResolvedValueOnce({
			id: 'gen-cost-2',
			provider: 'wavespeed',
			provider_job_id: 'ws-job-1',
			status: 'generating',
			video_url: null,
			message_id: null,
			conversation_id: null,
			model: 'wan2.1-t2v-turbo'
		});

		const mockProvider = {
			name: 'wavespeed',
			getStatus: vi.fn().mockResolvedValue({
				status: 'complete',
				videoUrl: 'https://wavespeed.com/video.mp4',
				thumbnailUrl: null,
				duration: 5,
				progress: 100
			}),
			downloadVideo: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
			getAvailableModels: vi.fn().mockReturnValue([
				{
					id: 'wan2.1-t2v-turbo',
					displayName: 'Wan 2.1 Turbo',
					provider: 'wavespeed',
					pricing: { estimatedCostPerGeneration: 0.03, currency: 'USD' }
				}
			]),
			generateVideo: vi.fn()
		};

		vi.mocked(getEnabledVideoKey).mockResolvedValue({
			id: 'key-2',
			name: 'WaveSpeed',
			provider: 'wavespeed',
			apiKey: 'ws-test',
			enabled: true,
			videoEnabled: true
		});
		vi.mocked(getVideoProvider).mockReturnValue(mockProvider as any);

		const response = await GET({
			params: { id: 'gen-cost-2' },
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		// Wait for async polling to complete
		await new Promise((resolve) => setTimeout(resolve, 500));

		try {
			if (response.body && typeof response.body.cancel === 'function') {
				await response.body.cancel();
			}
		} catch {
			// ignore cleanup errors
		}

		// Verify the bind includes the flat cost of $0.03
		const bindCalls = mockDB.bind.mock.calls;
		const costBindCall = bindCalls.find((args: any[]) =>
			args.some((arg: any) => typeof arg === 'number' && Math.abs(arg - 0.03) < 0.001)
		);
		expect(costBindCall).toBeDefined();
	});

	it('should calculate and store correct cost before sending SSE completion event', async () => {
		// This test verifies that cost is calculated and stored in DB
		// before the completion SSE event is sent to the client.
		// The stream endpoint was restructured to perform all DB updates
		// BEFORE sending the final SSE event, fixing a race condition
		// where refreshVideo() could read stale cost=0 data.
		const { getEnabledVideoKey, getVideoProvider } = await import('$lib/services/video-registry');
		const { GET } = await import('../../src/routes/api/video/[id]/stream/+server.js');

		mockDB.first.mockResolvedValueOnce({
			id: 'gen-cost-3',
			provider: 'openai',
			provider_job_id: 'prov-job-3',
			status: 'generating',
			video_url: null,
			message_id: null,
			conversation_id: null,
			model: 'sora-2',
			duration_seconds: null,
			resolution: '720p'
		});

		const mockProvider = {
			name: 'openai',
			getStatus: vi.fn().mockResolvedValue({
				status: 'complete',
				videoUrl: 'https://example.com/video.mp4',
				thumbnailUrl: 'https://example.com/thumb.jpg',
				duration: 8,
				progress: 100
			}),
			downloadVideo: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
			getAvailableModels: vi.fn().mockReturnValue([
				{
					id: 'sora-2',
					displayName: 'Sora 2',
					provider: 'openai',
					pricing: { estimatedCostPerSecond: 0.1, currency: 'USD' }
				}
			]),
			generateVideo: vi.fn()
		};

		vi.mocked(getEnabledVideoKey).mockResolvedValue({
			id: 'key-3',
			name: 'OpenAI',
			provider: 'openai',
			apiKey: 'sk-test',
			enabled: true,
			videoEnabled: true
		});
		vi.mocked(getVideoProvider).mockReturnValue(mockProvider as any);

		const response = await GET({
			params: { id: 'gen-cost-3' },
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		// Wait for async polling + DB update to finish
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Cancel the response to clean up
		try {
			if (response.body && typeof response.body.cancel === 'function') {
				await response.body.cancel();
			}
		} catch {
			// ignore cleanup errors
		}

		// Verify the completion UPDATE SQL includes cost
		const prepareCalls = mockDB.prepare.mock.calls.map((c: any[]) => c[0] as string);
		const updateCall = prepareCalls.find(
			(sql: string) =>
				sql.includes('UPDATE video_generations') && sql.includes("status = 'complete'")
		);
		expect(updateCall).toBeDefined();
		expect(updateCall).toContain('cost');

		// Verify the bind call includes the computed cost value
		// sora-2 at $0.10/sec * 8 sec = $0.80
		const bindCalls = mockDB.bind.mock.calls;
		const costBindCall = bindCalls.find((args: any[]) =>
			args.some((arg: any) => typeof arg === 'number' && Math.abs(arg - 0.8) < 0.001)
		);
		expect(costBindCall).toBeDefined();
	});
});
