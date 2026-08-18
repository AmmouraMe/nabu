/**
 * Tests for AI Media Generation Service
 * TDD: Tests written first, then implementation
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	generateImage,
	generateAudio,
	requestAIVideoGeneration,
	getAIGeneration,
	getAIGenerationsByBrand,
	updateAIGenerationStatus,
	AI_IMAGE_MODELS,
	AI_AUDIO_MODELS
} from '$lib/services/ai-media-generation';

// Mock D1 database
function createMockDB() {
	const mockResult = { results: [], success: true, meta: {} };
	const mockFirst = vi.fn().mockResolvedValue(null);
	const mockAll = vi.fn().mockResolvedValue(mockResult);
	const mockRun = vi.fn().mockResolvedValue(mockResult);

	const mockBind = vi.fn().mockReturnValue({
		first: mockFirst,
		all: mockAll,
		run: mockRun
	});

	const mockPrepare = vi.fn().mockReturnValue({
		bind: mockBind,
		first: mockFirst,
		all: mockAll,
		run: mockRun
	});

	return {
		prepare: mockPrepare,
		batch: vi.fn().mockResolvedValue([]),
		_mockBind: mockBind,
		_mockFirst: mockFirst,
		_mockAll: mockAll,
		_mockRun: mockRun
	};
}

// Mock R2 bucket
function createMockBucket() {
	return {
		put: vi.fn().mockResolvedValue({}),
		get: vi.fn().mockResolvedValue(null),
		delete: vi.fn().mockResolvedValue(undefined),
		head: vi.fn().mockResolvedValue(null),
		list: vi.fn().mockResolvedValue({ objects: [] })
	};
}

// Mock KV namespace
function createMockKV() {
	return {
		get: vi.fn().mockResolvedValue(null),
		put: vi.fn().mockResolvedValue(undefined),
		delete: vi.fn().mockResolvedValue(undefined),
		list: vi.fn().mockResolvedValue({ keys: [] })
	};
}

describe('AI Media Generation Service', () => {
	let mockDB: ReturnType<typeof createMockDB>;
	let mockBucket: ReturnType<typeof createMockBucket>;
	let mockKV: ReturnType<typeof createMockKV>;

	beforeEach(() => {
		mockDB = createMockDB();
		mockBucket = createMockBucket();
		mockKV = createMockKV();
		vi.clearAllMocks();
	});

	// ─── Model Constants ──────────────────────────────────

	describe('Model Constants', () => {
		it('should define image generation models', () => {
			expect(AI_IMAGE_MODELS).toBeDefined();
			expect(AI_IMAGE_MODELS.length).toBeGreaterThan(0);
			expect(AI_IMAGE_MODELS[0]).toHaveProperty('id');
			expect(AI_IMAGE_MODELS[0]).toHaveProperty('displayName');
			expect(AI_IMAGE_MODELS[0]).toHaveProperty('provider');
		});

		it('should define audio generation models', () => {
			expect(AI_AUDIO_MODELS).toBeDefined();
			expect(AI_AUDIO_MODELS.length).toBeGreaterThan(0);
			expect(AI_AUDIO_MODELS[0]).toHaveProperty('id');
			expect(AI_AUDIO_MODELS[0]).toHaveProperty('displayName');
			expect(AI_AUDIO_MODELS[0]).toHaveProperty('provider');
		});
	});

	// ─── Image Generation ──────────────────────────────────

	describe('generateImage', () => {
		it('should create a generation record in the database', async () => {
			const result = await generateImage(mockDB as any, {
				brandProfileId: 'brand-1',
				prompt: 'A modern tech company logo with blue gradient',
				name: 'Tech Logo'
			});

			expect(result).toBeDefined();
			expect(result.id).toBeDefined();
			expect(result.brandProfileId).toBe('brand-1');
			expect(result.generationType).toBe('image');
			expect(result.prompt).toBe('A modern tech company logo with blue gradient');
			expect(result.status).toBe('pending');
			expect(mockDB.prepare).toHaveBeenCalled();
		});

		it('should support size parameter', async () => {
			const result = await generateImage(mockDB as any, {
				brandProfileId: 'brand-1',
				prompt: 'A banner image',
				size: '1792x1024'
			});

			expect(result.parameters).toBeDefined();
			expect((result.parameters as Record<string, unknown>)?.size).toBe('1792x1024');
		});

		it('should support style parameter', async () => {
			const result = await generateImage(mockDB as any, {
				brandProfileId: 'brand-1',
				prompt: 'Natural landscape',
				style: 'natural'
			});

			expect(result.parameters).toBeDefined();
			expect((result.parameters as Record<string, unknown>)?.style).toBe('natural');
		});

		it('should support quality parameter', async () => {
			const result = await generateImage(mockDB as any, {
				brandProfileId: 'brand-1',
				prompt: 'High quality product photo',
				quality: 'hd'
			});

			expect(result.parameters).toBeDefined();
			expect((result.parameters as Record<string, unknown>)?.quality).toBe('hd');
		});

		it('should default model to dall-e-3', async () => {
			const result = await generateImage(mockDB as any, {
				brandProfileId: 'brand-1',
				prompt: 'A logo'
			});

			expect(result.model).toBe('dall-e-3');
		});
	});

	// ─── Audio Generation ──────────────────────────────────

	describe('generateAudio', () => {
		it('should create a generation record for audio', async () => {
			const result = await generateAudio(mockDB as any, {
				brandProfileId: 'brand-1',
				prompt: 'Welcome to our brand, where innovation meets excellence.',
				name: 'Brand Intro Voiceover'
			});

			expect(result).toBeDefined();
			expect(result.id).toBeDefined();
			expect(result.brandProfileId).toBe('brand-1');
			expect(result.generationType).toBe('audio');
			expect(result.status).toBe('pending');
			expect(mockDB.prepare).toHaveBeenCalled();
		});

		it('should support voice parameter', async () => {
			const result = await generateAudio(mockDB as any, {
				brandProfileId: 'brand-1',
				prompt: 'Hello world',
				voice: 'nova'
			});

			expect(result.parameters).toBeDefined();
			expect((result.parameters as Record<string, unknown>)?.voice).toBe('nova');
		});

		it('should default voice to alloy', async () => {
			const result = await generateAudio(mockDB as any, {
				brandProfileId: 'brand-1',
				prompt: 'Hello world'
			});

			expect(result.parameters).toBeDefined();
			expect((result.parameters as Record<string, unknown>)?.voice).toBe('alloy');
		});

		it('should support speed parameter', async () => {
			const result = await generateAudio(mockDB as any, {
				brandProfileId: 'brand-1',
				prompt: 'Fast speech',
				speed: 1.5
			});

			expect(result.parameters).toBeDefined();
			expect((result.parameters as Record<string, unknown>)?.speed).toBe(1.5);
		});

		it('should default model to tts-1', async () => {
			const result = await generateAudio(mockDB as any, {
				brandProfileId: 'brand-1',
				prompt: 'Hello'
			});

			expect(result.model).toBe('tts-1');
		});
	});

	// ─── Video Generation ──────────────────────────────────

	describe('requestAIVideoGeneration', () => {
		it('should create a generation record for video', async () => {
			const result = await requestAIVideoGeneration(mockDB as any, {
				brandProfileId: 'brand-1',
				prompt: 'A cinematic brand intro with logo reveal',
				name: 'Brand Intro Video'
			});

			expect(result).toBeDefined();
			expect(result.id).toBeDefined();
			expect(result.brandProfileId).toBe('brand-1');
			expect(result.generationType).toBe('video');
			expect(result.status).toBe('pending');
			expect(mockDB.prepare).toHaveBeenCalled();
		});

		it('should support aspect ratio and duration', async () => {
			const result = await requestAIVideoGeneration(mockDB as any, {
				brandProfileId: 'brand-1',
				prompt: 'A vertical social media clip',
				aspectRatio: '9:16',
				duration: 8
			});

			expect(result.parameters).toBeDefined();
			const params = result.parameters as Record<string, unknown>;
			expect(params?.aspectRatio).toBe('9:16');
			expect(params?.duration).toBe(8);
		});

		it('should use wavespeed provider when specified', async () => {
			const result = await requestAIVideoGeneration(mockDB as any, {
				brandProfileId: 'brand-1',
				prompt: 'A brand intro video',
				provider: 'wavespeed',
				model: 'wan-2.1/t2v-720p',
				aspectRatio: '16:9',
				duration: 5
			});

			expect(result.provider).toBe('wavespeed');
			expect(result.model).toBe('wan-2.1/t2v-720p');
		});

		it('should default provider to openai when not specified', async () => {
			const result = await requestAIVideoGeneration(mockDB as any, {
				brandProfileId: 'brand-1',
				prompt: 'A brand intro video'
			});

			expect(result.provider).toBe('openai');
			expect(result.model).toBe('sora-2');
		});
	});

	// ─── Generation CRUD ──────────────────────────────────

	describe('getAIGeneration', () => {
		it('should return a generation by ID', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({
				id: 'gen-1',
				brand_profile_id: 'brand-1',
				brand_media_id: null,
				generation_type: 'image',
				provider: 'openai',
				model: 'dall-e-3',
				prompt: 'A logo',
				negative_prompt: null,
				status: 'complete',
				provider_job_id: 'job-123',
				result_url: 'https://example.com/image.png',
				r2_key: 'brand-1/images/gen-1.png',
				cost: 0.04,
				error_message: null,
				parameters: '{"size":"1024x1024"}',
				progress: 100,
				created_at: '2025-01-01T00:00:00Z',
				completed_at: '2025-01-01T00:01:00Z'
			});

			const gen = await getAIGeneration(mockDB as any, 'gen-1');
			expect(gen).toBeDefined();
			expect(gen!.id).toBe('gen-1');
			expect(gen!.generationType).toBe('image');
			expect(gen!.status).toBe('complete');
			expect(gen!.parameters).toEqual({ size: '1024x1024' });
		});

		it('should return null when generation not found', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);
			const gen = await getAIGeneration(mockDB as any, 'nonexistent');
			expect(gen).toBeNull();
		});
	});

	describe('getAIGenerationsByBrand', () => {
		it('should return all generations for a brand', async () => {
			mockDB._mockAll.mockResolvedValueOnce({
				results: [
					{
						id: 'gen-1',
						brand_profile_id: 'brand-1',
						brand_media_id: null,
						generation_type: 'image',
						provider: 'openai',
						model: 'dall-e-3',
						prompt: 'A logo',
						negative_prompt: null,
						status: 'complete',
						provider_job_id: null,
						result_url: 'https://example.com/img.png',
						r2_key: null,
						cost: 0.04,
						error_message: null,
						parameters: null,
						progress: 100,
						created_at: '2025-01-01T00:00:00Z',
						completed_at: '2025-01-01T00:01:00Z'
					}
				]
			});

			const gens = await getAIGenerationsByBrand(mockDB as any, 'brand-1');
			expect(gens).toHaveLength(1);
			expect(gens[0].generationType).toBe('image');
		});

		it('should support filtering by generation type', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });

			await getAIGenerationsByBrand(mockDB as any, 'brand-1', 'image');
			expect(mockDB.prepare).toHaveBeenCalled();
			// Should include type filter in query
			const query = mockDB.prepare.mock.calls[0][0] as string;
			expect(query).toContain('generation_type');
		});

		it('should return empty array when no generations exist', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });
			const gens = await getAIGenerationsByBrand(mockDB as any, 'brand-1');
			expect(gens).toEqual([]);
		});
	});

	describe('updateAIGenerationStatus', () => {
		it('should update the status of a generation', async () => {
			await updateAIGenerationStatus(mockDB as any, 'gen-1', {
				status: 'complete',
				resultUrl: 'https://example.com/result.png',
				cost: 0.04,
				progress: 100
			});

			expect(mockDB.prepare).toHaveBeenCalled();
			expect(mockDB._mockBind).toHaveBeenCalled();
		});

		it('should set completed_at when status is complete', async () => {
			await updateAIGenerationStatus(mockDB as any, 'gen-1', {
				status: 'complete',
				resultUrl: 'https://example.com/result.png'
			});

			expect(mockDB.prepare).toHaveBeenCalled();
			const query = mockDB.prepare.mock.calls[0][0] as string;
			expect(query).toContain('completed_at');
		});

		it('should set error_message when status is failed', async () => {
			await updateAIGenerationStatus(mockDB as any, 'gen-1', {
				status: 'failed',
				errorMessage: 'Content policy violation'
			});

			expect(mockDB.prepare).toHaveBeenCalled();
			const query = mockDB.prepare.mock.calls[0][0] as string;
			expect(query).toContain('error_message');
		});
	});
});
