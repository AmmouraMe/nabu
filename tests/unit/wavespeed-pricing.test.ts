import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for WaveSpeed Pricing API Endpoint
 * TDD: Tests for fetching and caching WaveSpeed model pricing
 */

// Mock SvelteKit modules
vi.mock('@sveltejs/kit', () => ({
	json: vi.fn((data, init?) => {
		const resp = new Response(JSON.stringify(data), {
			status: init?.status ?? 200,
			headers: { 'content-type': 'application/json' }
		});
		return resp;
	}),
	error: vi.fn((status: number, message: string) => {
		const err = new Error(message) as any;
		err.status = status;
		throw err;
	})
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('WaveSpeed Pricing API', () => {
	let mockKV: any;
	let mockPlatform: any;
	let mockLocals: any;

	const mockWaveSpeedModelsResponse = {
		code: 200,
		message: 'success',
		data: [
			{
				model_id: 'wavespeed-ai/wan-2.1/t2v-720p',
				name: 'wavespeed-ai/wan-2.1/t2v-720p',
				base_price: 0.02,
				description: 'Text-to-video, 720p quality',
				type: 'text-to-video'
			},
			{
				model_id: 'wavespeed-ai/wan-2.1/i2v-720p',
				name: 'wavespeed-ai/wan-2.1/i2v-720p',
				base_price: 0.03,
				description: 'Image-to-video, 720p quality',
				type: 'image-to-video'
			},
			{
				model_id: 'wavespeed-ai/flux-dev',
				name: 'wavespeed-ai/flux-dev',
				base_price: 0.005,
				description: 'High-quality image generation',
				type: 'text-to-image'
			},
			{
				model_id: 'wavespeed-ai/flux-schnell',
				name: 'wavespeed-ai/flux-schnell',
				base_price: 0.003,
				description: 'Fast image generation',
				type: 'text-to-image'
			},
			{
				model_id: 'wavespeed-ai/hunyuan-video/t2v',
				name: 'wavespeed-ai/hunyuan-video/t2v',
				base_price: 0.4,
				description: 'Tencent HunYuan text-to-video',
				type: 'text-to-video'
			}
		]
	};

	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();

		mockKV = {
			get: vi.fn(),
			put: vi.fn(),
			delete: vi.fn()
		};

		mockPlatform = {
			env: {
				KV: mockKV
			}
		};

		mockLocals = {
			user: {
				id: '1',
				isOwner: true,
				isAdmin: false
			}
		};
	});

	describe('GET /api/admin/ai-keys/wavespeed-pricing', () => {
		it('should require admin access', async () => {
			const { GET } = await import('../../src/routes/api/admin/ai-keys/wavespeed-pricing/+server');

			await expect(
				GET({
					platform: mockPlatform,
					locals: { user: { id: '2', isOwner: false, isAdmin: false } },
					url: new URL('http://localhost/api/admin/ai-keys/wavespeed-pricing')
				} as any)
			).rejects.toThrow();
		});

		it('should return cached pricing if available and not expired', async () => {
			const cachedData = {
				models: mockWaveSpeedModelsResponse.data,
				fetchedAt: Date.now() // Fresh cache
			};
			mockKV.get.mockResolvedValue(JSON.stringify(cachedData));

			const { GET } = await import('../../src/routes/api/admin/ai-keys/wavespeed-pricing/+server');

			const response = await GET({
				platform: mockPlatform,
				locals: mockLocals,
				url: new URL('http://localhost/api/admin/ai-keys/wavespeed-pricing')
			} as any);

			const result = await response.json();
			expect(result.models).toHaveLength(5);
			expect(result.cached).toBe(true);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('should fetch from WaveSpeed API when cache is expired', async () => {
			const expiredCache = {
				models: [],
				fetchedAt: Date.now() - 25 * 60 * 60 * 1000 // 25 hours ago
			};
			mockKV.get.mockResolvedValue(JSON.stringify(expiredCache));

			// Need a stored API key
			mockKV.get.mockImplementation((key: string) => {
				if (key === 'wavespeed_pricing_cache') {
					return JSON.stringify(expiredCache);
				}
				if (key === 'ai_keys') {
					return JSON.stringify([
						{
							id: 'ws-1',
							provider: 'wavespeed',
							apiKey: 'test-ws-key',
							enabled: true
						}
					]);
				}
				return null;
			});

			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(mockWaveSpeedModelsResponse)
			});

			const { GET } = await import('../../src/routes/api/admin/ai-keys/wavespeed-pricing/+server');

			const response = await GET({
				platform: mockPlatform,
				locals: mockLocals,
				url: new URL('http://localhost/api/admin/ai-keys/wavespeed-pricing')
			} as any);

			const result = await response.json();
			expect(result.models).toHaveLength(5);
			expect(result.cached).toBe(false);

			// Verify it fetched from WaveSpeed API
			expect(mockFetch).toHaveBeenCalledWith(
				'https://api.wavespeed.ai/api/v3/models',
				expect.objectContaining({
					headers: expect.objectContaining({
						Authorization: 'Bearer test-ws-key'
					})
				})
			);

			// Verify it cached the results
			expect(mockKV.put).toHaveBeenCalledWith('wavespeed_pricing_cache', expect.any(String));
		});

		it('should fetch from API when no cache exists', async () => {
			mockKV.get.mockImplementation((key: string) => {
				if (key === 'wavespeed_pricing_cache') return null;
				if (key === 'ai_keys') {
					return JSON.stringify([
						{
							id: 'ws-1',
							provider: 'wavespeed',
							apiKey: 'test-ws-key',
							enabled: true
						}
					]);
				}
				return null;
			});

			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(mockWaveSpeedModelsResponse)
			});

			const { GET } = await import('../../src/routes/api/admin/ai-keys/wavespeed-pricing/+server');

			const response = await GET({
				platform: mockPlatform,
				locals: mockLocals,
				url: new URL('http://localhost/api/admin/ai-keys/wavespeed-pricing')
			} as any);

			const result = await response.json();
			expect(result.models).toHaveLength(5);
			expect(result.cached).toBe(false);
			expect(result.models[0]).toHaveProperty('base_price');
			expect(result.models[0]).toHaveProperty('model_id');
			expect(result.models[0]).toHaveProperty('type');
		});

		it('should return error when no WaveSpeed key is configured', async () => {
			mockKV.get.mockImplementation((key: string) => {
				if (key === 'wavespeed_pricing_cache') return null;
				if (key === 'ai_keys') return JSON.stringify([]);
				return null;
			});

			const { GET } = await import('../../src/routes/api/admin/ai-keys/wavespeed-pricing/+server');

			const response = await GET({
				platform: mockPlatform,
				locals: mockLocals,
				url: new URL('http://localhost/api/admin/ai-keys/wavespeed-pricing')
			} as any);

			const result = await response.json();
			expect(result.models).toEqual([]);
			expect(result.error).toBeTruthy();
		});

		it('should handle WaveSpeed API errors gracefully', async () => {
			mockKV.get.mockImplementation((key: string) => {
				if (key === 'wavespeed_pricing_cache') return null;
				if (key === 'ai_keys') {
					return JSON.stringify([
						{
							id: 'ws-1',
							provider: 'wavespeed',
							apiKey: 'bad-key',
							enabled: true
						}
					]);
				}
				return null;
			});

			mockFetch.mockResolvedValue({
				ok: false,
				status: 401,
				text: () => Promise.resolve('Unauthorized')
			});

			const { GET } = await import('../../src/routes/api/admin/ai-keys/wavespeed-pricing/+server');

			const response = await GET({
				platform: mockPlatform,
				locals: mockLocals,
				url: new URL('http://localhost/api/admin/ai-keys/wavespeed-pricing')
			} as any);

			const result = await response.json();
			expect(result.models).toEqual([]);
			expect(result.error).toBeTruthy();
		});

		it('should allow forcing a cache refresh', async () => {
			const freshCache = {
				models: mockWaveSpeedModelsResponse.data,
				fetchedAt: Date.now() // Fresh cache
			};

			mockKV.get.mockImplementation((key: string) => {
				if (key === 'wavespeed_pricing_cache') return JSON.stringify(freshCache);
				if (key === 'ai_keys') {
					return JSON.stringify([
						{
							id: 'ws-1',
							provider: 'wavespeed',
							apiKey: 'test-ws-key',
							enabled: true
						}
					]);
				}
				return null;
			});

			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(mockWaveSpeedModelsResponse)
			});

			const { GET } = await import('../../src/routes/api/admin/ai-keys/wavespeed-pricing/+server');

			const response = await GET({
				platform: mockPlatform,
				locals: mockLocals,
				url: new URL('http://localhost/api/admin/ai-keys/wavespeed-pricing?refresh=true')
			} as any);

			const result = await response.json();
			expect(result.cached).toBe(false);
			expect(mockFetch).toHaveBeenCalled();
		});

		it('should return model data with correct fields', async () => {
			mockKV.get.mockImplementation((key: string) => {
				if (key === 'wavespeed_pricing_cache') return null;
				if (key === 'ai_keys') {
					return JSON.stringify([
						{
							id: 'ws-1',
							provider: 'wavespeed',
							apiKey: 'test-ws-key',
							enabled: true
						}
					]);
				}
				return null;
			});

			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(mockWaveSpeedModelsResponse)
			});

			const { GET } = await import('../../src/routes/api/admin/ai-keys/wavespeed-pricing/+server');

			const response = await GET({
				platform: mockPlatform,
				locals: mockLocals,
				url: new URL('http://localhost/api/admin/ai-keys/wavespeed-pricing')
			} as any);

			const result = await response.json();
			const videoModel = result.models.find(
				(m: any) => m.model_id === 'wavespeed-ai/wan-2.1/t2v-720p'
			);
			expect(videoModel).toBeDefined();
			expect(videoModel.base_price).toBe(0.02);
			expect(videoModel.type).toBe('text-to-video');

			const imageModel = result.models.find((m: any) => m.model_id === 'wavespeed-ai/flux-dev');
			expect(imageModel).toBeDefined();
			expect(imageModel.base_price).toBe(0.005);
			expect(imageModel.type).toBe('text-to-image');
		});
	});
});
