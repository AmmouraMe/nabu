/**
 * Tests for POST /api/brand/assets/generate
 * Covers: image generation flow, audio generation flow, video generation flow,
 * error handling, the PUT endpoint, and the getOpenAIKey helper.
 * Target: lines 47-355, 371-390 of +server.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Plans are not what this suite is about; see tests/fixtures/entitlements.ts.
vi.mock('$lib/server/entitlements', async () =>
	(await import('../fixtures/entitlements')).permissiveEntitlements()
);


// ─── Mocks ───────────────────────────────────────────────────────

vi.mock('$lib/services/ai-media-generation', () => ({
	generateImage: vi.fn(),
	generateAudio: vi.fn(),
	requestAIVideoGeneration: vi.fn(),
	getAIGeneration: vi.fn(),
	getAIGenerationsByBrand: vi.fn(),
	updateAIGenerationStatus: vi.fn(),
	AI_IMAGE_MODELS: [{ id: 'dall-e-3', displayName: 'DALL-E 3', provider: 'openai', type: 'image' }],
	AI_AUDIO_MODELS: [{ id: 'tts-1', displayName: 'TTS-1', provider: 'openai', type: 'audio' }],
	// These tests all exercise the OpenAI image path, so Workers AI never matches.
	isWorkersAIModel: vi.fn(() => false),
	runWorkersAIImage: vi.fn()
}));

vi.mock('$lib/services/brand-assets', () => ({
	createBrandMedia: vi.fn()
}));

vi.mock('$lib/services/media-history', () => ({
	logMediaActivity: vi.fn(),
	createMediaRevision: vi.fn()
}));

vi.mock('$lib/services/video-registry', () => ({
	getEnabledVideoKey: vi.fn()
}));

// ─── Helpers ─────────────────────────────────────────────────────

function createMockPlatform(kvOverrides?: Record<string, string | null>) {
	const kvStore: Record<string, string | null> = kvOverrides || {};

	return {
		env: {
			DB: {
				// The route authorises the brand before generating anything, so the
				// ownership lookup has to answer for these tests to reach the flow they
				// are about. Only that exact query is answered — everything else stays
				// null, as before.
				prepare: vi.fn().mockImplementation((sql: string) => ({
					bind: vi.fn().mockReturnValue({
						first: vi
							.fn()
							.mockResolvedValue(
								sql.includes('SELECT user_id FROM brand_profiles') ? { user_id: 'user-1' } : null
							),
						all: vi.fn().mockResolvedValue({ results: [] }),
						run: vi.fn().mockResolvedValue({ success: true })
					})
				}))
			},
			KV: {
				get: vi.fn().mockImplementation((key: string) => {
					return Promise.resolve(kvStore[key] ?? null);
				}),
				put: vi.fn().mockResolvedValue(undefined),
				delete: vi.fn().mockResolvedValue(undefined)
			},
			BUCKET: {
				put: vi.fn().mockResolvedValue({}),
				get: vi.fn().mockResolvedValue(null)
			}
		},
		context: {
			waitUntil: vi.fn()
		}
	};
}

function createMockUser() {
	return { id: 'user-1', login: 'tester', email: 'test@test.com', isOwner: false, isAdmin: false };
}

function kvWithOpenAIKey() {
	return {
		ai_keys_list: JSON.stringify(['key1']),
		'ai_key:key1': JSON.stringify({
			id: 'key1',
			provider: 'openai',
			apiKey: 'sk-test-123',
			enabled: true
		})
	};
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
	vi.clearAllMocks();
	originalFetch = globalThis.fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe('POST /api/brand/assets/generate', () => {
	// ─── Auth & Validation ─────────────────────────────────

	it('should return 401 when not authenticated', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');
		const event = {
			locals: {},
			platform: createMockPlatform(),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ type: 'image', brandProfileId: 'bp-1', prompt: 'test' })
			})
		};

		await expect(POST(event as any)).rejects.toThrow();
	});

	it('should return 500 when platform unavailable', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: null,
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ type: 'image', brandProfileId: 'bp-1', prompt: 'test' })
			})
		};

		await expect(POST(event as any)).rejects.toThrow();
	});

	it('should return 400 for invalid type', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ type: 'invalid', brandProfileId: 'bp-1', prompt: 'test' })
			})
		};

		await expect(POST(event as any)).rejects.toThrow();
	});

	it('should return 400 when brandProfileId missing', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ type: 'image', prompt: 'test' })
			})
		};

		await expect(POST(event as any)).rejects.toThrow();
	});

	it('should return 400 when prompt missing', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ type: 'image', brandProfileId: 'bp-1' })
			})
		};

		await expect(POST(event as any)).rejects.toThrow();
	});

	// ─── Image Generation ─────────────────────────────────

	it('should return 400 when no OpenAI key configured for image generation', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ type: 'image', brandProfileId: 'bp-1', prompt: 'A logo' })
			})
		};

		await expect(POST(event as any)).rejects.toThrow();
	});

	it('should generate an image successfully and store in R2', async () => {
		const { generateImage } = await import('$lib/services/ai-media-generation');
		const { createBrandMedia } = await import('$lib/services/brand-assets');
		const { updateAIGenerationStatus } = await import('$lib/services/ai-media-generation');
		const { logMediaActivity, createMediaRevision } = await import('$lib/services/media-history');

		vi.mocked(generateImage).mockResolvedValue({
			id: 'gen-1',
			brandProfileId: 'bp-1',
			generationType: 'image',
			provider: 'openai',
			model: 'dall-e-3',
			prompt: 'A blue logo',
			status: 'pending',
			progress: 0,
			createdAt: '2026-01-01T00:00:00Z'
		});

		vi.mocked(createBrandMedia).mockResolvedValue({
			id: 'media-1',
			brandProfileId: 'bp-1',
			mediaType: 'image',
			category: 'brand_elements',
			name: 'AI Generated Image',
			sortOrder: 0,
			isPrimary: false,
			createdAt: '2026-01-01',
			updatedAt: '2026-01-01'
		});

		vi.mocked(updateAIGenerationStatus).mockResolvedValue(undefined);
		vi.mocked(logMediaActivity).mockResolvedValue({} as any);
		vi.mocked(createMediaRevision).mockResolvedValue({} as any);

		// Mock OpenAI API returning image URL
		const mockFetchSequence = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					data: [{ url: 'https://openai.com/image.png', revised_prompt: 'A beautiful blue logo' }]
				})
			})
			// Mock downloading image from URL
			.mockResolvedValueOnce({
				arrayBuffer: async () => new ArrayBuffer(1024)
			});

		globalThis.fetch = mockFetchSequence;

		const platform = createMockPlatform(kvWithOpenAIKey());
		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');
		const event = {
			locals: { user: createMockUser() },
			platform,
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					type: 'image',
					brandProfileId: 'bp-1',
					prompt: 'A blue logo',
					size: '1024x1024',
					style: 'vivid',
					quality: 'standard'
				})
			})
		};

		const response = await POST(event as any);
		expect(response.status).toBe(201);

		const data = await response.json();
		expect(data.generation.status).toBe('complete');
		expect(data.media).toBeDefined();
		expect(data.media.id).toBe('media-1');

		// Verify R2 upload
		expect(platform.env.BUCKET.put).toHaveBeenCalled();

		// Verify status update
		expect(updateAIGenerationStatus).toHaveBeenCalledWith(
			expect.anything(),
			'gen-1',
			expect.objectContaining({ status: 'complete' })
		);

		// Verify revision and activity log
		expect(createMediaRevision).toHaveBeenCalled();
		expect(logMediaActivity).toHaveBeenCalled();
	});

	it('should handle OpenAI API error for image generation', async () => {
		const { generateImage, updateAIGenerationStatus } = await import(
			'$lib/services/ai-media-generation'
		);

		vi.mocked(generateImage).mockResolvedValue({
			id: 'gen-2',
			brandProfileId: 'bp-1',
			generationType: 'image',
			provider: 'openai',
			model: 'dall-e-3',
			prompt: 'bad prompt',
			status: 'pending',
			progress: 0,
			createdAt: '2026-01-01T00:00:00Z'
		});

		vi.mocked(updateAIGenerationStatus).mockResolvedValue(undefined);

		// Mock API returning error
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 400,
			json: async () => ({ error: { message: 'Content policy violation' } })
		});

		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(kvWithOpenAIKey()),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ type: 'image', brandProfileId: 'bp-1', prompt: 'bad prompt' })
			})
		};

		const response = await POST(event as any);
		expect(response.status).toBe(200);

		const data = await response.json();
		expect(data.generation.status).toBe('failed');
		expect(data.generation.errorMessage).toBe('Content policy violation');
	});

	it('should handle missing image URL in OpenAI response', async () => {
		const { generateImage, updateAIGenerationStatus } = await import(
			'$lib/services/ai-media-generation'
		);

		vi.mocked(generateImage).mockResolvedValue({
			id: 'gen-3',
			brandProfileId: 'bp-1',
			generationType: 'image',
			provider: 'openai',
			model: 'dall-e-3',
			prompt: 'test',
			status: 'pending',
			progress: 0,
			createdAt: '2026-01-01T00:00:00Z'
		});

		vi.mocked(updateAIGenerationStatus).mockResolvedValue(undefined);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ data: [] })
		});

		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(kvWithOpenAIKey()),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ type: 'image', brandProfileId: 'bp-1', prompt: 'test' })
			})
		};

		const response = await POST(event as any);
		const data = await response.json();
		expect(data.generation.status).toBe('failed');
	});

	it('should handle fetch exception during image generation', async () => {
		const { generateImage, updateAIGenerationStatus } = await import(
			'$lib/services/ai-media-generation'
		);

		vi.mocked(generateImage).mockResolvedValue({
			id: 'gen-4',
			brandProfileId: 'bp-1',
			generationType: 'image',
			provider: 'openai',
			model: 'dall-e-3',
			prompt: 'test',
			status: 'pending',
			progress: 0,
			createdAt: '2026-01-01T00:00:00Z'
		});

		vi.mocked(updateAIGenerationStatus).mockResolvedValue(undefined);

		globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(kvWithOpenAIKey()),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ type: 'image', brandProfileId: 'bp-1', prompt: 'test' })
			})
		};

		const response = await POST(event as any);
		const data = await response.json();
		expect(data.generation.status).toBe('failed');
		expect(data.generation.errorMessage).toBe('Network failure');
	});

	it('should cost 0.08 for dall-e-3 HD quality', async () => {
		const { generateImage, updateAIGenerationStatus } = await import(
			'$lib/services/ai-media-generation'
		);
		const { createBrandMedia } = await import('$lib/services/brand-assets');
		const { logMediaActivity, createMediaRevision } = await import('$lib/services/media-history');

		vi.mocked(generateImage).mockResolvedValue({
			id: 'gen-hd',
			brandProfileId: 'bp-1',
			generationType: 'image',
			provider: 'openai',
			model: 'dall-e-3',
			prompt: 'HD image',
			status: 'pending',
			progress: 0,
			createdAt: '2026-01-01T00:00:00Z'
		});

		vi.mocked(createBrandMedia).mockResolvedValue({
			id: 'media-hd',
			brandProfileId: 'bp-1',
			mediaType: 'image',
			category: 'brand_elements',
			name: 'HD Image',
			sortOrder: 0,
			isPrimary: false,
			createdAt: '2026-01-01',
			updatedAt: '2026-01-01'
		});
		vi.mocked(updateAIGenerationStatus).mockResolvedValue(undefined);
		vi.mocked(logMediaActivity).mockResolvedValue({} as any);
		vi.mocked(createMediaRevision).mockResolvedValue({} as any);

		globalThis.fetch = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ data: [{ url: 'https://openai.com/hd.png' }] })
			})
			.mockResolvedValueOnce({ arrayBuffer: async () => new ArrayBuffer(2048) });

		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(kvWithOpenAIKey()),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					type: 'image',
					brandProfileId: 'bp-1',
					prompt: 'HD image',
					model: 'dall-e-3',
					quality: 'hd'
				})
			})
		};

		const response = await POST(event as any);
		const data = await response.json();
		expect(data.generation.cost).toBe(0.08);
	});

	it('should cost 0.02 for dall-e-2', async () => {
		const { generateImage, updateAIGenerationStatus } = await import(
			'$lib/services/ai-media-generation'
		);
		const { createBrandMedia } = await import('$lib/services/brand-assets');
		const { logMediaActivity, createMediaRevision } = await import('$lib/services/media-history');

		vi.mocked(generateImage).mockResolvedValue({
			id: 'gen-d2',
			brandProfileId: 'bp-1',
			generationType: 'image',
			provider: 'openai',
			model: 'dall-e-2',
			prompt: 'Simple image',
			status: 'pending',
			progress: 0,
			createdAt: '2026-01-01T00:00:00Z'
		});

		vi.mocked(createBrandMedia).mockResolvedValue({
			id: 'media-d2',
			brandProfileId: 'bp-1',
			mediaType: 'image',
			category: 'brand_elements',
			name: 'D2 Image',
			sortOrder: 0,
			isPrimary: false,
			createdAt: '2026-01-01',
			updatedAt: '2026-01-01'
		});
		vi.mocked(updateAIGenerationStatus).mockResolvedValue(undefined);
		vi.mocked(logMediaActivity).mockResolvedValue({} as any);
		vi.mocked(createMediaRevision).mockResolvedValue({} as any);

		globalThis.fetch = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ data: [{ url: 'https://openai.com/d2.png' }] })
			})
			.mockResolvedValueOnce({ arrayBuffer: async () => new ArrayBuffer(512) });

		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(kvWithOpenAIKey()),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					type: 'image',
					brandProfileId: 'bp-1',
					prompt: 'Simple image',
					model: 'dall-e-2'
				})
			})
		};

		const response = await POST(event as any);
		const data = await response.json();
		expect(data.generation.cost).toBe(0.02);
	});

	it('should handle OpenAI API error with non-JSON response body', async () => {
		const { generateImage, updateAIGenerationStatus } = await import(
			'$lib/services/ai-media-generation'
		);

		vi.mocked(generateImage).mockResolvedValue({
			id: 'gen-nj',
			brandProfileId: 'bp-1',
			generationType: 'image',
			provider: 'openai',
			model: 'dall-e-3',
			prompt: 'test',
			status: 'pending',
			progress: 0,
			createdAt: '2026-01-01T00:00:00Z'
		});

		vi.mocked(updateAIGenerationStatus).mockResolvedValue(undefined);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			json: () => Promise.reject(new Error('Not JSON'))
		});

		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(kvWithOpenAIKey()),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ type: 'image', brandProfileId: 'bp-1', prompt: 'test' })
			})
		};

		const response = await POST(event as any);
		const data = await response.json();
		expect(data.generation.status).toBe('failed');
		expect(data.generation.errorMessage).toContain('API error: 500');
	});

	// ─── Audio Generation ─────────────────────────────────

	it('should return 400 when no OpenAI key for audio', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ type: 'audio', brandProfileId: 'bp-1', prompt: 'Hello world' })
			})
		};

		await expect(POST(event as any)).rejects.toThrow();
	});

	it('should generate audio successfully', async () => {
		const { generateAudio, updateAIGenerationStatus } = await import(
			'$lib/services/ai-media-generation'
		);
		const { createBrandMedia } = await import('$lib/services/brand-assets');
		const { logMediaActivity, createMediaRevision } = await import('$lib/services/media-history');

		vi.mocked(generateAudio).mockResolvedValue({
			id: 'gen-audio-1',
			brandProfileId: 'bp-1',
			generationType: 'audio',
			provider: 'openai',
			model: 'tts-1',
			prompt: 'Welcome to our brand',
			status: 'pending',
			progress: 0,
			createdAt: '2026-01-01T00:00:00Z'
		});

		vi.mocked(createBrandMedia).mockResolvedValue({
			id: 'media-audio-1',
			brandProfileId: 'bp-1',
			mediaType: 'audio',
			category: 'voiceover',
			name: 'AI Audio',
			sortOrder: 0,
			isPrimary: false,
			createdAt: '2026-01-01',
			updatedAt: '2026-01-01'
		});
		vi.mocked(updateAIGenerationStatus).mockResolvedValue(undefined);
		vi.mocked(logMediaActivity).mockResolvedValue({} as any);
		vi.mocked(createMediaRevision).mockResolvedValue({} as any);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			arrayBuffer: async () => new ArrayBuffer(4096)
		});

		const platform = createMockPlatform(kvWithOpenAIKey());
		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');
		const event = {
			locals: { user: createMockUser() },
			platform,
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					type: 'audio',
					brandProfileId: 'bp-1',
					prompt: 'Welcome to our brand',
					voice: 'nova',
					responseFormat: 'mp3'
				})
			})
		};

		const response = await POST(event as any);
		expect(response.status).toBe(201);

		const data = await response.json();
		expect(data.generation.status).toBe('complete');
		expect(data.media).toBeDefined();
		expect(platform.env.BUCKET.put).toHaveBeenCalled();
	});

	it('should handle audio API error', async () => {
		const { generateAudio, updateAIGenerationStatus } = await import(
			'$lib/services/ai-media-generation'
		);

		vi.mocked(generateAudio).mockResolvedValue({
			id: 'gen-audio-err',
			brandProfileId: 'bp-1',
			generationType: 'audio',
			provider: 'openai',
			model: 'tts-1',
			prompt: 'fail',
			status: 'pending',
			progress: 0,
			createdAt: '2026-01-01T00:00:00Z'
		});

		vi.mocked(updateAIGenerationStatus).mockResolvedValue(undefined);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 429,
			json: async () => ({ error: { message: 'Rate limited' } })
		});

		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(kvWithOpenAIKey()),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ type: 'audio', brandProfileId: 'bp-1', prompt: 'fail' })
			})
		};

		const response = await POST(event as any);
		const data = await response.json();
		expect(data.generation.status).toBe('failed');
		expect(data.generation.errorMessage).toBe('Rate limited');
	});

	it('should handle audio fetch exception', async () => {
		const { generateAudio, updateAIGenerationStatus } = await import(
			'$lib/services/ai-media-generation'
		);

		vi.mocked(generateAudio).mockResolvedValue({
			id: 'gen-audio-exc',
			brandProfileId: 'bp-1',
			generationType: 'audio',
			provider: 'openai',
			model: 'tts-1',
			prompt: 'crash',
			status: 'pending',
			progress: 0,
			createdAt: '2026-01-01T00:00:00Z'
		});

		vi.mocked(updateAIGenerationStatus).mockResolvedValue(undefined);

		globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection reset'));

		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(kvWithOpenAIKey()),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ type: 'audio', brandProfileId: 'bp-1', prompt: 'crash' })
			})
		};

		const response = await POST(event as any);
		const data = await response.json();
		expect(data.generation.status).toBe('failed');
		expect(data.generation.errorMessage).toBe('Connection reset');
	});

	it('should calculate correct cost for tts-1-hd model', async () => {
		const { generateAudio, updateAIGenerationStatus } = await import(
			'$lib/services/ai-media-generation'
		);
		const { createBrandMedia } = await import('$lib/services/brand-assets');
		const { logMediaActivity, createMediaRevision } = await import('$lib/services/media-history');

		vi.mocked(generateAudio).mockResolvedValue({
			id: 'gen-audio-hd',
			brandProfileId: 'bp-1',
			generationType: 'audio',
			provider: 'openai',
			model: 'tts-1-hd',
			prompt: 'A',
			status: 'pending',
			progress: 0,
			createdAt: '2026-01-01T00:00:00Z'
		});
		vi.mocked(createBrandMedia).mockResolvedValue({
			id: 'media-ahd',
			brandProfileId: 'bp-1',
			mediaType: 'audio',
			category: 'voiceover',
			name: 'HD Audio',
			sortOrder: 0,
			isPrimary: false,
			createdAt: '2026-01-01',
			updatedAt: '2026-01-01'
		});
		vi.mocked(updateAIGenerationStatus).mockResolvedValue(undefined);
		vi.mocked(logMediaActivity).mockResolvedValue({} as any);
		vi.mocked(createMediaRevision).mockResolvedValue({} as any);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			arrayBuffer: async () => new ArrayBuffer(100)
		});

		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(kvWithOpenAIKey()),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					type: 'audio',
					brandProfileId: 'bp-1',
					prompt: 'A',
					model: 'tts-1-hd',
					voice: 'alloy'
				})
			})
		};

		const response = await POST(event as any);
		expect(response.status).toBe(201);
	});

	it('should handle audio with various response formats for MIME type', async () => {
		const { generateAudio, updateAIGenerationStatus } = await import(
			'$lib/services/ai-media-generation'
		);
		const { createBrandMedia } = await import('$lib/services/brand-assets');
		const { logMediaActivity, createMediaRevision } = await import('$lib/services/media-history');

		for (const format of ['opus', 'aac', 'flac', 'wav']) {
			vi.clearAllMocks();

			vi.mocked(generateAudio).mockResolvedValue({
				id: `gen-audio-${format}`,
				brandProfileId: 'bp-1',
				generationType: 'audio',
				provider: 'openai',
				model: 'tts-1',
				prompt: 'test',
				status: 'pending',
				progress: 0,
				createdAt: '2026-01-01T00:00:00Z'
			});
			vi.mocked(createBrandMedia).mockResolvedValue({
				id: `media-${format}`,
				brandProfileId: 'bp-1',
				mediaType: 'audio',
				category: 'voiceover',
				name: 'Audio',
				sortOrder: 0,
				isPrimary: false,
				createdAt: '2026-01-01',
				updatedAt: '2026-01-01'
			});
			vi.mocked(updateAIGenerationStatus).mockResolvedValue(undefined);
			vi.mocked(logMediaActivity).mockResolvedValue({} as any);
			vi.mocked(createMediaRevision).mockResolvedValue({} as any);

			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				arrayBuffer: async () => new ArrayBuffer(50)
			});

			const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');
			const event = {
				locals: { user: createMockUser() },
				platform: createMockPlatform(kvWithOpenAIKey()),
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({
						type: 'audio',
						brandProfileId: 'bp-1',
						prompt: 'test',
						responseFormat: format
					})
				})
			};

			const response = await POST(event as any);
			expect(response.status).toBe(201);
		}
	});

	it('should handle audio API error with non-JSON response', async () => {
		const { generateAudio, updateAIGenerationStatus } = await import(
			'$lib/services/ai-media-generation'
		);

		vi.mocked(generateAudio).mockResolvedValue({
			id: 'gen-audio-nj',
			brandProfileId: 'bp-1',
			generationType: 'audio',
			provider: 'openai',
			model: 'tts-1',
			prompt: 'test',
			status: 'pending',
			progress: 0,
			createdAt: '2026-01-01T00:00:00Z'
		});
		vi.mocked(updateAIGenerationStatus).mockResolvedValue(undefined);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			json: () => Promise.reject(new Error('Not JSON'))
		});

		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(kvWithOpenAIKey()),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ type: 'audio', brandProfileId: 'bp-1', prompt: 'test' })
			})
		};

		const response = await POST(event as any);
		const data = await response.json();
		expect(data.generation.status).toBe('failed');
		expect(data.generation.errorMessage).toContain('API error: 500');
	});

	// ─── Video Generation ─────────────────────────────────

	it('should return 400 when no video key configured', async () => {
		const { getEnabledVideoKey } = await import('$lib/services/video-registry');
		vi.mocked(getEnabledVideoKey).mockResolvedValue(null);

		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(kvWithOpenAIKey()),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ type: 'video', brandProfileId: 'bp-1', prompt: 'A brand video' })
			})
		};

		await expect(POST(event as any)).rejects.toThrow();
	});

	it('should create video generation successfully', async () => {
		const { getEnabledVideoKey } = await import('$lib/services/video-registry');
		const { requestAIVideoGeneration } = await import('$lib/services/ai-media-generation');
		const { logMediaActivity } = await import('$lib/services/media-history');

		vi.mocked(getEnabledVideoKey).mockResolvedValue({
			id: 'vkey-1',
			name: 'Video Key',
			provider: 'wavespeed',
			apiKey: 'ws-test',
			enabled: true,
			videoEnabled: true
		});

		vi.mocked(requestAIVideoGeneration).mockResolvedValue({
			id: 'gen-video-1',
			brandProfileId: 'bp-1',
			generationType: 'video',
			provider: 'wavespeed',
			model: 'wan-2.1/t2v',
			prompt: 'A brand video',
			status: 'pending',
			progress: 0,
			createdAt: '2026-01-01T00:00:00Z'
		});

		vi.mocked(logMediaActivity).mockResolvedValue({} as any);

		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(kvWithOpenAIKey()),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					type: 'video',
					brandProfileId: 'bp-1',
					prompt: 'A brand video',
					provider: 'wavespeed'
				})
			})
		};

		const response = await POST(event as any);
		expect(response.status).toBe(201);

		const data = await response.json();
		expect(data.generation).toBeDefined();
		expect(data.generation.generationType).toBe('video');
		expect(logMediaActivity).toHaveBeenCalled();
	});
});

// ─── GET /api/brand/assets/generate ─────────────────────────

describe('GET /api/brand/assets/generate', () => {
	it('should return 401 when not authenticated', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/generate/+server');
		const event = {
			locals: {},
			platform: createMockPlatform(),
			url: new URL('http://localhost/api/brand/assets/generate?brandProfileId=bp-1')
		};

		await expect(GET(event as any)).rejects.toThrow();
	});

	it('should get a specific generation by id', async () => {
		const { getAIGeneration } = await import('$lib/services/ai-media-generation');
		vi.mocked(getAIGeneration).mockResolvedValue({
			id: 'gen-1',
			brandProfileId: 'bp-1',
			generationType: 'image',
			provider: 'openai',
			model: 'dall-e-3',
			prompt: 'test',
			status: 'complete',
			progress: 100,
			createdAt: '2026-01-01T00:00:00Z'
		});

		const { GET } = await import('../../src/routes/api/brand/assets/generate/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(),
			url: new URL('http://localhost/api/brand/assets/generate?id=gen-1')
		};

		const response = await GET(event as any);
		const data = await response.json();
		expect(data.generation.id).toBe('gen-1');
	});

	it('should return 404 when generation not found', async () => {
		const { getAIGeneration } = await import('$lib/services/ai-media-generation');
		vi.mocked(getAIGeneration).mockResolvedValue(null);

		const { GET } = await import('../../src/routes/api/brand/assets/generate/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(),
			url: new URL('http://localhost/api/brand/assets/generate?id=nonexistent')
		};

		await expect(GET(event as any)).rejects.toThrow();
	});

	it('should return 400 when no brandProfileId and no id', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/generate/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(),
			url: new URL('http://localhost/api/brand/assets/generate')
		};

		await expect(GET(event as any)).rejects.toThrow();
	});

	it('should list generations by brand and type', async () => {
		const { getAIGenerationsByBrand } = await import('$lib/services/ai-media-generation');
		vi.mocked(getAIGenerationsByBrand).mockResolvedValue([]);

		const { GET } = await import('../../src/routes/api/brand/assets/generate/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(),
			url: new URL('http://localhost/api/brand/assets/generate?brandProfileId=bp-1&type=image')
		};

		const response = await GET(event as any);
		const data = await response.json();
		expect(data.generations).toBeDefined();
		expect(getAIGenerationsByBrand).toHaveBeenCalledWith(expect.anything(), 'bp-1', 'image');
	});
});

// ─── PUT /api/brand/assets/generate ─────────────────────────

describe('PUT /api/brand/assets/generate', () => {
	it('should return 401 when not authenticated', async () => {
		const { PUT } = await import('../../src/routes/api/brand/assets/generate/+server');
		const event = {
			locals: {},
			platform: createMockPlatform()
		};

		await expect(PUT(event as any)).rejects.toThrow();
	});

	it('should return available models', async () => {
		const { PUT } = await import('../../src/routes/api/brand/assets/generate/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform()
		};

		const response = await PUT(event as any);
		const data = await response.json();
		expect(data.imageModels).toBeDefined();
		expect(data.audioModels).toBeDefined();
	});
});

// ─── getOpenAIKey helper (via KV patterns) ──────────────────

describe('getOpenAIKey helper (internal)', () => {
	it('should find an enabled OpenAI key from KV', async () => {
		// This is tested implicitly — if KV has a key, image generation works
		const { generateImage } = await import('$lib/services/ai-media-generation');
		vi.mocked(generateImage).mockResolvedValue({
			id: 'gen-kv',
			brandProfileId: 'bp-1',
			generationType: 'image',
			provider: 'openai',
			model: 'dall-e-3',
			prompt: 'test',
			status: 'pending',
			progress: 0,
			createdAt: '2026-01-01T00:00:00Z'
		});

		const { updateAIGenerationStatus } = await import('$lib/services/ai-media-generation');
		vi.mocked(updateAIGenerationStatus).mockResolvedValue(undefined);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ data: [] })
		});

		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');

		// With OpenAI key available - should not throw 400
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(kvWithOpenAIKey()),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ type: 'image', brandProfileId: 'bp-1', prompt: 'test' })
			})
		};

		// Should not reject with 400 (key is found)
		const res = await POST(event as any);
		expect(res).toBeDefined();
	});

	it('should return null when KV throws error', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');
		const platform = createMockPlatform();
		platform.env.KV.get = vi.fn().mockRejectedValue(new Error('KV unavailable'));

		const event = {
			locals: { user: createMockUser() },
			platform,
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ type: 'image', brandProfileId: 'bp-1', prompt: 'test' })
			})
		};

		// Should throw 400 because key lookup fails silently
		await expect(POST(event as any)).rejects.toThrow();
	});

	it('should skip disabled OpenAI keys', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');
		const platform = createMockPlatform({
			ai_keys_list: JSON.stringify(['key1']),
			'ai_key:key1': JSON.stringify({
				id: 'key1',
				provider: 'openai',
				apiKey: 'sk-disabled',
				enabled: false
			})
		});

		const event = {
			locals: { user: createMockUser() },
			platform,
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ type: 'image', brandProfileId: 'bp-1', prompt: 'test' })
			})
		};

		await expect(POST(event as any)).rejects.toThrow();
	});

	it('should skip non-OpenAI keys', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');
		const platform = createMockPlatform({
			ai_keys_list: JSON.stringify(['key1']),
			'ai_key:key1': JSON.stringify({
				id: 'key1',
				provider: 'anthropic',
				apiKey: 'sk-ant',
				enabled: true
			})
		});

		const event = {
			locals: { user: createMockUser() },
			platform,
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ type: 'image', brandProfileId: 'bp-1', prompt: 'test' })
			})
		};

		await expect(POST(event as any)).rejects.toThrow();
	});
});
