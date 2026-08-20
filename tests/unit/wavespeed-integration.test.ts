import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for WaveSpeed AI Integration
 * TDD: Tests for WaveSpeed provider in AI keys management
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

describe('WaveSpeed AI Integration', () => {
	let mockKV: any;
	let mockPlatform: any;
	let mockLocals: any;

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
				isOwner: true
			}
		};
	});

	describe('POST /api/admin/ai-keys - Create WaveSpeed Key', () => {
		it('should create a WaveSpeed AI key with video models', async () => {
			mockKV.get.mockResolvedValue(null); // No existing keys

			const { POST } = await import('../../src/routes/api/admin/ai-keys/+server');

			const request = new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					name: 'WaveSpeed Production',
					provider: 'wavespeed',
					apiKey: 'ws-test-key-12345',
					videoEnabled: true,
					videoModels: ['wan-2.1/t2v-720p', 'flux-dev']
				})
			});

			const result = await POST({
				request,
				platform: mockPlatform,
				locals: mockLocals
			} as any);

			const data = await result.json();
			expect(data.success).toBe(true);
			expect(data.key.provider).toBe('wavespeed');
			expect(data.key.videoEnabled).toBe(true);
			expect(data.key.videoModels).toContain('wan-2.1/t2v-720p');
			expect(data.key.videoModels).toContain('flux-dev');
			// API key should not be returned
			expect(data.key.apiKey).toBeUndefined();
		});

		it('should create a WaveSpeed key with both text and video models', async () => {
			mockKV.get.mockResolvedValue(null);

			const { POST } = await import('../../src/routes/api/admin/ai-keys/+server');

			const request = new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					name: 'WaveSpeed Full',
					provider: 'wavespeed',
					apiKey: 'ws-full-key',
					models: ['flux-dev', 'flux-schnell'],
					videoEnabled: true,
					videoModels: ['wan-2.1/t2v-720p']
				})
			});

			const result = await POST({
				request,
				platform: mockPlatform,
				locals: mockLocals
			} as any);

			const data = await result.json();
			expect(data.success).toBe(true);
			expect(data.key.models).toContain('flux-dev');
			expect(data.key.videoModels).toContain('wan-2.1/t2v-720p');
		});
	});

	describe('GET /api/admin/ai-keys - List includes WaveSpeed', () => {
		it('should list WaveSpeed keys alongside other providers', async () => {
			const openaiKey = {
				id: 'key-openai',
				name: 'OpenAI',
				provider: 'openai',
				apiKey: 'sk-secret',
				enabled: true,
				createdAt: '2024-01-01'
			};

			const wavespeedKey = {
				id: 'key-wavespeed',
				name: 'WaveSpeed',
				provider: 'wavespeed',
				apiKey: 'ws-secret',
				enabled: true,
				videoEnabled: true,
				videoModels: ['wan-2.1/t2v-720p'],
				createdAt: '2024-01-02'
			};

			mockKV.get
				.mockResolvedValueOnce(JSON.stringify(['key-openai', 'key-wavespeed']))
				.mockResolvedValueOnce(JSON.stringify(openaiKey))
				.mockResolvedValueOnce(JSON.stringify(wavespeedKey));

			const { GET } = await import('../../src/routes/api/admin/ai-keys/+server');

			const result = await GET({
				platform: mockPlatform,
				locals: mockLocals
			} as any);

			const data = await result.json();
			expect(data.keys).toHaveLength(2);

			const wsKey = data.keys.find((k: any) => k.provider === 'wavespeed');
			expect(wsKey).toBeDefined();
			expect(wsKey.name).toBe('WaveSpeed');
			expect(wsKey.videoEnabled).toBe(true);
			expect(wsKey.apiKey).toBeUndefined(); // Should be stripped
		});
	});

	describe('WaveSpeed Key Validation API', () => {
		it('should validate a WaveSpeed API key by calling the balance endpoint', async () => {
			// Mock global fetch for WaveSpeed API
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					code: 200,
					message: 'success',
					data: { balance: 10.5 }
				})
			});
			vi.stubGlobal('fetch', mockFetch);

			const { POST } = await import(
				'../../src/routes/api/admin/ai-keys/wavespeed-validate/+server'
			);

			const request = new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ apiKey: 'ws-valid-key' })
			});

			const result = await POST({
				request,
				platform: mockPlatform,
				locals: mockLocals
			} as any);

			const data = await result.json();
			expect(data.valid).toBe(true);
			expect(data.balance).toBe(10.5);

			expect(mockFetch).toHaveBeenCalledWith(
				'https://api.wavespeed.ai/api/v3/balance',
				expect.objectContaining({
					headers: expect.objectContaining({
						Authorization: 'Bearer ws-valid-key'
					})
				})
			);

			vi.unstubAllGlobals();
		});

		it('should return invalid for a bad API key', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				text: async () => 'Unauthorized'
			});
			vi.stubGlobal('fetch', mockFetch);

			const { POST } = await import(
				'../../src/routes/api/admin/ai-keys/wavespeed-validate/+server'
			);

			const request = new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ apiKey: 'ws-invalid-key' })
			});

			const result = await POST({
				request,
				platform: mockPlatform,
				locals: mockLocals
			} as any);

			const data = await result.json();
			expect(data.valid).toBe(false);
			expect(data.error).toBeDefined();

			vi.unstubAllGlobals();
		});

		it('should require admin access for validation', async () => {
			const { POST } = await import(
				'../../src/routes/api/admin/ai-keys/wavespeed-validate/+server'
			);

			const request = new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ apiKey: 'ws-key' })
			});

			await expect(
				POST({
					request,
					platform: mockPlatform,
					locals: { user: { id: '1', isOwner: false } }
				} as any)
			).rejects.toThrow();
		});

		it('should require an API key in the request body', async () => {
			const { POST } = await import(
				'../../src/routes/api/admin/ai-keys/wavespeed-validate/+server'
			);

			const request = new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({})
			});

			await expect(
				POST({
					request,
					platform: mockPlatform,
					locals: mockLocals
				} as any)
			).rejects.toThrow();
		});

		it('should handle network errors gracefully', async () => {
			const mockFetch = vi.fn().mockRejectedValue(new Error('Network failure'));
			vi.stubGlobal('fetch', mockFetch);

			const { POST } = await import(
				'../../src/routes/api/admin/ai-keys/wavespeed-validate/+server'
			);

			const request = new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ apiKey: 'ws-key' })
			});

			const result = await POST({
				request,
				platform: mockPlatform,
				locals: mockLocals
			} as any);

			const data = await result.json();
			expect(data.valid).toBe(false);
			expect(data.error).toContain('Network failure');

			vi.unstubAllGlobals();
		});
	});

	describe('WaveSpeed Video Provider', () => {
		it('should be registered in the video registry', async () => {
			const { getVideoProvider } = await import('../../src/lib/services/video-registry');
			const provider = getVideoProvider('wavespeed');
			expect(provider).not.toBeNull();
			expect(provider?.name).toBe('wavespeed');
		});

		it('should return available video models', async () => {
			const { getVideoProvider } = await import('../../src/lib/services/video-registry');
			const provider = getVideoProvider('wavespeed');
			expect(provider).not.toBeNull();

			const models = provider!.getAvailableModels();
			expect(models.length).toBeGreaterThan(0);

			// Should include popular WaveSpeed video models
			const modelIds = models.map((m) => m.id);
			expect(modelIds).toContain('wan-2.1/t2v');
		});

		it('should have correct provider name on models', async () => {
			const { getVideoProvider } = await import('../../src/lib/services/video-registry');
			const provider = getVideoProvider('wavespeed');
			const models = provider!.getAvailableModels();

			for (const model of models) {
				expect(model.provider).toBe('wavespeed');
			}
		});

		it('should generate a video task via WaveSpeed API', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					code: 200,
					message: 'success',
					data: {
						id: 'pred_abc123',
						status: 'created',
						urls: {
							get: 'https://api.wavespeed.ai/api/v3/predictions/pred_abc123/result'
						}
					}
				})
			});
			vi.stubGlobal('fetch', mockFetch);

			const { getVideoProvider } = await import('../../src/lib/services/video-registry');
			const provider = getVideoProvider('wavespeed');
			expect(provider).not.toBeNull();

			const result = await provider!.generateVideo('ws-test-key', {
				prompt: 'A cat in space',
				model: 'wan-2.1/t2v-720p'
			});

			expect(result.providerJobId).toBe('pred_abc123');
			expect(result.status).toBe('queued');

			expect(mockFetch).toHaveBeenCalledWith(
				'https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.1/t2v-720p',
				expect.objectContaining({
					method: 'POST',
					headers: expect.objectContaining({
						Authorization: 'Bearer ws-test-key',
						'Content-Type': 'application/json'
					})
				})
			);

			vi.unstubAllGlobals();
		});

		it('should poll for video status', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					code: 200,
					message: 'success',
					data: {
						id: 'pred_abc123',
						status: 'completed',
						outputs: ['https://cdn.wavespeed.ai/outputs/video-123.mp4']
					}
				})
			});
			vi.stubGlobal('fetch', mockFetch);

			const { getVideoProvider } = await import('../../src/lib/services/video-registry');
			const provider = getVideoProvider('wavespeed');

			const result = await provider!.getStatus('ws-test-key', 'pred_abc123');

			expect(result.status).toBe('complete');
			expect(result.videoUrl).toBe('https://cdn.wavespeed.ai/outputs/video-123.mp4');

			expect(mockFetch).toHaveBeenCalledWith(
				'https://api.wavespeed.ai/api/v3/predictions/pred_abc123/result',
				expect.objectContaining({
					headers: expect.objectContaining({
						Authorization: 'Bearer ws-test-key'
					})
				})
			);

			vi.unstubAllGlobals();
		});

		it('should handle failed video generation', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					code: 200,
					message: 'success',
					data: {
						id: 'pred_abc123',
						status: 'failed',
						error: 'Content policy violation'
					}
				})
			});
			vi.stubGlobal('fetch', mockFetch);

			const { getVideoProvider } = await import('../../src/lib/services/video-registry');
			const provider = getVideoProvider('wavespeed');

			const result = await provider!.getStatus('ws-test-key', 'pred_abc123');

			expect(result.status).toBe('error');
			expect(result.error).toBe('Content policy violation');

			vi.unstubAllGlobals();
		});

		it('should handle processing status', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					code: 200,
					message: 'success',
					data: {
						id: 'pred_abc123',
						status: 'processing'
					}
				})
			});
			vi.stubGlobal('fetch', mockFetch);

			const { getVideoProvider } = await import('../../src/lib/services/video-registry');
			const provider = getVideoProvider('wavespeed');

			const result = await provider!.getStatus('ws-test-key', 'pred_abc123');

			expect(result.status).toBe('processing');
			expect(result.videoUrl).toBeUndefined();

			vi.unstubAllGlobals();
		});

		it('should download video content', async () => {
			const mockBuffer = new ArrayBuffer(100);
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				arrayBuffer: async () => mockBuffer
			});
			vi.stubGlobal('fetch', mockFetch);

			const { getVideoProvider } = await import('../../src/lib/services/video-registry');
			const provider = getVideoProvider('wavespeed');

			const result = await provider!.downloadVideo(
				'ws-test-key',
				'https://cdn.wavespeed.ai/outputs/video-123.mp4'
			);

			expect(result).toBe(mockBuffer);

			vi.unstubAllGlobals();
		});
	});

	describe('WaveSpeed in AI Keys Status', () => {
		it('should include wavespeed as a valid provider for status checks', async () => {
			const wavespeedKey = {
				id: 'key-ws',
				name: 'WaveSpeed',
				provider: 'wavespeed',
				apiKey: 'ws-key',
				enabled: true,
				videoEnabled: true,
				videoModels: ['wan-2.1/t2v-720p'],
				createdAt: '2024-01-01'
			};

			mockKV.get
				.mockResolvedValueOnce(JSON.stringify(['key-ws']))
				.mockResolvedValueOnce(JSON.stringify(wavespeedKey));

			const { GET } = await import('../../src/routes/api/admin/ai-keys/status/+server');

			const result = await GET({
				platform: mockPlatform,
				locals: {}
			} as any);

			const data = await result.json();
			expect(data.hasProviders).toBe(true);
		});
	});

	describe('getEnabledVideoKey with WaveSpeed', () => {
		it('should return WaveSpeed key when it is the enabled video provider', async () => {
			const wavespeedKey = {
				id: 'key-ws',
				name: 'WaveSpeed',
				provider: 'wavespeed',
				apiKey: 'ws-key',
				enabled: true,
				videoEnabled: true,
				videoModels: ['wan-2.1/t2v-720p'],
				createdAt: '2024-01-01'
			};

			mockKV.get
				.mockResolvedValueOnce(JSON.stringify(['key-ws']))
				.mockResolvedValueOnce(JSON.stringify(wavespeedKey));

			const { getEnabledVideoKey } = await import('../../src/lib/services/video-registry');

			const key = await getEnabledVideoKey(mockPlatform, 'wavespeed');

			expect(key).not.toBeNull();
			expect(key!.provider).toBe('wavespeed');
			expect(key!.apiKey).toBe('ws-key');
		});
	});
});
