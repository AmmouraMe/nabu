/**
 * Branch coverage tests for AI Media Generation Service
 * Targets: 59.25% branches → higher coverage
 * Focuses on: mapRowToGeneration null-coalescing branches,
 *   optional parameter branches in generateImage/Audio/Video,
 *   every optional field in updateAIGenerationStatus
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	generateImage,
	generateAudio,
	requestAIVideoGeneration,
	getAIGeneration,
	getAIGenerationsByBrand,
	updateAIGenerationStatus
} from '$lib/services/ai-media-generation';

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

describe('AI Media Generation - Branch Coverage', () => {
	let mockDB: ReturnType<typeof createMockDB>;

	beforeEach(() => {
		mockDB = createMockDB();
		vi.clearAllMocks();
	});

	// ─── mapRowToGeneration branches ─────────────────────────

	describe('mapRowToGeneration via getAIGeneration (null-coalescing branches)', () => {
		it('should map row with ALL fields populated', async () => {
			const fullRow = {
				id: 'gen-1',
				brand_profile_id: 'bp-1',
				brand_media_id: 'bm-1',
				generation_type: 'image',
				provider: 'openai',
				model: 'dall-e-3',
				prompt: 'A logo',
				negative_prompt: 'blurry',
				status: 'complete',
				provider_job_id: 'pj-1',
				result_url: 'https://example.com/img.png',
				r2_key: 'brands/bp-1/img.png',
				cost: 0.04,
				error_message: null,
				parameters: JSON.stringify({ size: '1024x1024' }),
				progress: 100,
				created_at: '2026-01-01',
				completed_at: '2026-01-02'
			};
			mockDB._mockFirst.mockResolvedValueOnce(fullRow);

			const result = await getAIGeneration(mockDB as any, 'gen-1');
			expect(result).not.toBeNull();
			expect(result!.brandMediaId).toBe('bm-1');
			expect(result!.negativePrompt).toBe('blurry');
			expect(result!.providerJobId).toBe('pj-1');
			expect(result!.resultUrl).toBe('https://example.com/img.png');
			expect(result!.r2Key).toBe('brands/bp-1/img.png');
			expect(result!.cost).toBe(0.04);
			expect(result!.errorMessage).toBeUndefined(); // null → || undefined
			expect(result!.parameters).toEqual({ size: '1024x1024' });
			expect(result!.progress).toBe(100);
			expect(result!.completedAt).toBe('2026-01-02');
		});

		it('should map row with ALL optional fields null/empty (falsy branch)', async () => {
			const minimalRow = {
				id: 'gen-2',
				brand_profile_id: 'bp-1',
				brand_media_id: null,
				generation_type: 'image',
				provider: 'openai',
				model: 'dall-e-3',
				prompt: 'A logo',
				negative_prompt: null,
				status: 'pending',
				provider_job_id: null,
				result_url: null,
				r2_key: null,
				cost: null,
				error_message: null,
				parameters: null,
				progress: null,
				created_at: '2026-01-01',
				completed_at: null
			};
			mockDB._mockFirst.mockResolvedValueOnce(minimalRow);

			const result = await getAIGeneration(mockDB as any, 'gen-2');
			expect(result).not.toBeNull();
			expect(result!.brandMediaId).toBeUndefined();
			expect(result!.negativePrompt).toBeUndefined();
			expect(result!.providerJobId).toBeUndefined();
			expect(result!.resultUrl).toBeUndefined();
			expect(result!.r2Key).toBeUndefined();
			expect(result!.cost).toBeUndefined();
			expect(result!.errorMessage).toBeUndefined();
			expect(result!.parameters).toBeUndefined();
			expect(result!.progress).toBe(0); // null || 0
			expect(result!.completedAt).toBeUndefined();
		});

		it('should map row with empty-string optional fields (falsy branch)', async () => {
			const emptyStringRow = {
				id: 'gen-3',
				brand_profile_id: 'bp-1',
				brand_media_id: '',
				generation_type: 'audio',
				provider: 'openai',
				model: 'tts-1',
				prompt: 'Hello',
				negative_prompt: '',
				status: 'failed',
				provider_job_id: '',
				result_url: '',
				r2_key: '',
				cost: 0,
				error_message: '',
				parameters: null,
				progress: 0,
				created_at: '2026-01-01',
				completed_at: ''
			};
			mockDB._mockFirst.mockResolvedValueOnce(emptyStringRow);

			const result = await getAIGeneration(mockDB as any, 'gen-3');
			expect(result).not.toBeNull();
			// Empty strings → || undefined
			expect(result!.brandMediaId).toBeUndefined();
			expect(result!.negativePrompt).toBeUndefined();
			expect(result!.providerJobId).toBeUndefined();
			expect(result!.resultUrl).toBeUndefined();
			expect(result!.r2Key).toBeUndefined();
			expect(result!.cost).toBeUndefined(); // 0 || undefined
			expect(result!.errorMessage).toBeUndefined();
		});

		it('should map row with error_message populated (truthy branch)', async () => {
			const errorRow = {
				id: 'gen-4',
				brand_profile_id: 'bp-1',
				brand_media_id: null,
				generation_type: 'image',
				provider: 'openai',
				model: 'dall-e-3',
				prompt: 'A logo',
				negative_prompt: null,
				status: 'failed',
				provider_job_id: null,
				result_url: null,
				r2_key: null,
				cost: null,
				error_message: 'Rate limit exceeded',
				parameters: null,
				progress: 50,
				created_at: '2026-01-01',
				completed_at: null
			};
			mockDB._mockFirst.mockResolvedValueOnce(errorRow);

			const result = await getAIGeneration(mockDB as any, 'gen-4');
			expect(result!.errorMessage).toBe('Rate limit exceeded');
			expect(result!.progress).toBe(50);
		});
	});

	// ─── mapRowToGeneration via getAIGenerationsByBrand ───────

	describe('getAIGenerationsByBrand mapping branches', () => {
		it('should map multiple rows with mixed null/populated fields', async () => {
			const rows = [
				{
					id: 'gen-a',
					brand_profile_id: 'bp-1',
					brand_media_id: 'bm-1',
					generation_type: 'image',
					provider: 'openai',
					model: 'dall-e-3',
					prompt: 'Logo1',
					negative_prompt: 'blurry',
					status: 'complete',
					provider_job_id: 'pj-1',
					result_url: 'https://example.com/a.png',
					r2_key: 'brands/a.png',
					cost: 0.04,
					error_message: null,
					parameters: JSON.stringify({ style: 'vivid' }),
					progress: 100,
					created_at: '2026-01-01',
					completed_at: '2026-01-02'
				},
				{
					id: 'gen-b',
					brand_profile_id: 'bp-1',
					brand_media_id: null,
					generation_type: 'audio',
					provider: 'openai',
					model: 'tts-1',
					prompt: 'Hello',
					negative_prompt: null,
					status: 'pending',
					provider_job_id: null,
					result_url: null,
					r2_key: null,
					cost: null,
					error_message: null,
					parameters: null,
					progress: null,
					created_at: '2026-01-01',
					completed_at: null
				}
			];
			mockDB._mockAll.mockResolvedValueOnce({ results: rows });

			const results = await getAIGenerationsByBrand(mockDB as any, 'bp-1');
			expect(results).toHaveLength(2);
			expect(results[0].brandMediaId).toBe('bm-1');
			expect(results[0].parameters).toEqual({ style: 'vivid' });
			expect(results[1].brandMediaId).toBeUndefined();
			expect(results[1].parameters).toBeUndefined();
		});

		it('should filter by type (else branch for no type filter)', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });

			const results = await getAIGenerationsByBrand(mockDB as any, 'bp-1', 'video');
			expect(results).toHaveLength(0);
			// verify the query used generation_type filter
			expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining('generation_type'));
		});

		it('should NOT filter by type when omitted (else branch)', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });

			const results = await getAIGenerationsByBrand(mockDB as any, 'bp-1');
			expect(results).toHaveLength(0);
		});
	});

	// ─── generateImage optional parameter branches ───────────

	describe('generateImage - optional parameter branches', () => {
		it('should generate with NO optional parameters (empty params object branch)', async () => {
			const result = await generateImage(mockDB as any, {
				brandProfileId: 'bp-1',
				prompt: 'A simple logo'
			});

			expect(result.parameters).toBeUndefined();
			expect(result.model).toBe('dall-e-3');
			expect(result.negativePrompt).toBeUndefined();
		});

		it('should include category parameter when provided', async () => {
			const result = await generateImage(mockDB as any, {
				brandProfileId: 'bp-1',
				prompt: 'A logo',
				category: 'logo'
			});

			expect(result.parameters).toBeDefined();
			expect(result.parameters!.category).toBe('logo');
		});

		it('should include name parameter when provided', async () => {
			const result = await generateImage(mockDB as any, {
				brandProfileId: 'bp-1',
				prompt: 'A logo',
				name: 'Primary Logo'
			});

			expect(result.parameters).toBeDefined();
			expect(result.parameters!.name).toBe('Primary Logo');
		});

		it('should include ALL optional parameters together', async () => {
			const result = await generateImage(mockDB as any, {
				brandProfileId: 'bp-1',
				prompt: 'A logo',
				size: '1024x1024',
				style: 'vivid',
				quality: 'hd',
				category: 'logo',
				name: 'Logo',
				negativePrompt: 'blurry',
				model: 'dall-e-2'
			});

			expect(result.parameters).toEqual({
				size: '1024x1024',
				style: 'vivid',
				quality: 'hd',
				category: 'logo',
				name: 'Logo'
			});
			expect(result.model).toBe('dall-e-2');
			expect(result.negativePrompt).toBe('blurry');
		});

		it('should generate with only size (single optional param)', async () => {
			const result = await generateImage(mockDB as any, {
				brandProfileId: 'bp-1',
				prompt: 'A logo',
				size: '1792x1024'
			});

			expect(result.parameters).toEqual({ size: '1792x1024' });
		});

		it('should generate with only style', async () => {
			const result = await generateImage(mockDB as any, {
				brandProfileId: 'bp-1',
				prompt: 'A logo',
				style: 'natural'
			});

			expect(result.parameters!.style).toBe('natural');
		});

		it('should generate with only quality', async () => {
			const result = await generateImage(mockDB as any, {
				brandProfileId: 'bp-1',
				prompt: 'A logo',
				quality: 'standard'
			});

			expect(result.parameters!.quality).toBe('standard');
		});
	});

	// ─── generateAudio optional parameter branches ───────────

	describe('generateAudio - optional parameter branches', () => {
		it('should generate with NO optional parameters', async () => {
			const result = await generateAudio(mockDB as any, {
				brandProfileId: 'bp-1',
				prompt: 'Hello world'
			});

			expect(result.parameters).toEqual({ voice: 'alloy' });
			expect(result.model).toBe('tts-1');
		});

		it('should include responseFormat parameter', async () => {
			const result = await generateAudio(mockDB as any, {
				brandProfileId: 'bp-1',
				prompt: 'Hello world',
				responseFormat: 'opus'
			});

			expect(result.parameters!.responseFormat).toBe('opus');
		});

		it('should include category parameter', async () => {
			const result = await generateAudio(mockDB as any, {
				brandProfileId: 'bp-1',
				prompt: 'Hello world',
				category: 'sonic_identity'
			});

			expect(result.parameters!.category).toBe('sonic_identity');
		});

		it('should include name parameter', async () => {
			const result = await generateAudio(mockDB as any, {
				brandProfileId: 'bp-1',
				prompt: 'Hello world',
				name: 'Brand Jingle'
			});

			expect(result.parameters!.name).toBe('Brand Jingle');
		});

		it('should include all optional parameters together', async () => {
			const result = await generateAudio(mockDB as any, {
				brandProfileId: 'bp-1',
				prompt: 'Hello world',
				voice: 'nova',
				speed: 1.5,
				responseFormat: 'flac',
				category: 'music',
				name: 'Jingle',
				model: 'tts-1-hd'
			});

			expect(result.parameters).toEqual({
				voice: 'nova',
				speed: 1.5,
				responseFormat: 'flac',
				category: 'music',
				name: 'Jingle'
			});
			expect(result.model).toBe('tts-1-hd');
		});
	});

	// ─── requestAIVideoGeneration optional parameter branches ─

	describe('requestAIVideoGeneration - optional parameter branches', () => {
		it('should generate with NO optional parameters (empty params)', async () => {
			const result = await requestAIVideoGeneration(mockDB as any, {
				brandProfileId: 'bp-1',
				prompt: 'A brand intro video'
			});

			expect(result.parameters).toBeUndefined();
			expect(result.provider).toBe('openai');
			expect(result.model).toBe('sora-2');
		});

		it('should include aspectRatio parameter', async () => {
			const result = await requestAIVideoGeneration(mockDB as any, {
				brandProfileId: 'bp-1',
				prompt: 'A video',
				aspectRatio: '16:9'
			});

			expect(result.parameters!.aspectRatio).toBe('16:9');
		});

		it('should include duration parameter', async () => {
			const result = await requestAIVideoGeneration(mockDB as any, {
				brandProfileId: 'bp-1',
				prompt: 'A video',
				duration: 30
			});

			expect(result.parameters!.duration).toBe(30);
		});

		it('should include resolution parameter', async () => {
			const result = await requestAIVideoGeneration(mockDB as any, {
				brandProfileId: 'bp-1',
				prompt: 'A video',
				resolution: '1080p'
			});

			expect(result.parameters!.resolution).toBe('1080p');
		});

		it('should include category parameter', async () => {
			const result = await requestAIVideoGeneration(mockDB as any, {
				brandProfileId: 'bp-1',
				prompt: 'A video',
				category: 'brand'
			});

			expect(result.parameters!.category).toBe('brand');
		});

		it('should include name parameter', async () => {
			const result = await requestAIVideoGeneration(mockDB as any, {
				brandProfileId: 'bp-1',
				prompt: 'A video',
				name: 'Intro Video'
			});

			expect(result.parameters!.name).toBe('Intro Video');
		});

		it('should include all optional parameters together', async () => {
			const result = await requestAIVideoGeneration(mockDB as any, {
				brandProfileId: 'bp-1',
				prompt: 'A brand video',
				provider: 'wavespeed',
				model: 'wan-2.1',
				aspectRatio: '9:16',
				duration: 10,
				resolution: '720p',
				category: 'social',
				name: 'Reel'
			});

			expect(result.parameters).toEqual({
				aspectRatio: '9:16',
				duration: 10,
				resolution: '720p',
				category: 'social',
				name: 'Reel'
			});
			expect(result.provider).toBe('wavespeed');
			expect(result.model).toBe('wan-2.1');
		});
	});

	// ─── updateAIGenerationStatus optional field branches ────

	describe('updateAIGenerationStatus - individual optional field branches', () => {
		it('should update with ONLY status (no optional fields)', async () => {
			await updateAIGenerationStatus(mockDB as any, 'gen-1', {
				status: 'processing'
			});

			expect(mockDB.prepare).toHaveBeenCalled();
			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('status = ?');
			expect(sql).not.toContain('provider_job_id');
			expect(sql).not.toContain('result_url');
			expect(sql).not.toContain('r2_key');
			expect(sql).not.toContain('brand_media_id');
			expect(sql).not.toContain('cost');
			expect(sql).not.toContain('error_message');
			expect(sql).not.toContain('progress');
		});

		it('should update with providerJobId', async () => {
			await updateAIGenerationStatus(mockDB as any, 'gen-1', {
				status: 'processing',
				providerJobId: 'pj-1'
			});

			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('provider_job_id = ?');
		});

		it('should update with resultUrl', async () => {
			await updateAIGenerationStatus(mockDB as any, 'gen-1', {
				status: 'complete',
				resultUrl: 'https://example.com/result.png'
			});

			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('result_url = ?');
		});

		it('should update with r2Key', async () => {
			await updateAIGenerationStatus(mockDB as any, 'gen-1', {
				status: 'complete',
				r2Key: 'brands/bp-1/result.png'
			});

			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('r2_key = ?');
		});

		it('should update with brandMediaId', async () => {
			await updateAIGenerationStatus(mockDB as any, 'gen-1', {
				status: 'complete',
				brandMediaId: 'bm-1'
			});

			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('brand_media_id = ?');
		});

		it('should update with cost', async () => {
			await updateAIGenerationStatus(mockDB as any, 'gen-1', {
				status: 'complete',
				cost: 0.04
			});

			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('cost = ?');
		});

		it('should update with errorMessage', async () => {
			await updateAIGenerationStatus(mockDB as any, 'gen-1', {
				status: 'failed',
				errorMessage: 'API timeout'
			});

			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('error_message = ?');
		});

		it('should update with progress', async () => {
			await updateAIGenerationStatus(mockDB as any, 'gen-1', {
				status: 'processing',
				progress: 75
			});

			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('progress = ?');
		});

		it('should set completed_at for "complete" status', async () => {
			await updateAIGenerationStatus(mockDB as any, 'gen-1', {
				status: 'complete'
			});

			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain("completed_at = datetime('now')");
		});

		it('should set completed_at for "failed" status', async () => {
			await updateAIGenerationStatus(mockDB as any, 'gen-1', {
				status: 'failed'
			});

			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain("completed_at = datetime('now')");
		});

		it('should NOT set completed_at for "processing" status', async () => {
			await updateAIGenerationStatus(mockDB as any, 'gen-1', {
				status: 'processing'
			});

			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).not.toContain('completed_at');
		});

		it('should NOT set completed_at for "pending" status', async () => {
			await updateAIGenerationStatus(mockDB as any, 'gen-1', {
				status: 'pending'
			});

			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).not.toContain('completed_at');
		});

		it('should update with ALL optional fields at once', async () => {
			await updateAIGenerationStatus(mockDB as any, 'gen-1', {
				status: 'complete',
				providerJobId: 'pj-1',
				resultUrl: 'https://example.com/result.png',
				r2Key: 'brands/bp-1/result.png',
				brandMediaId: 'bm-1',
				cost: 0.04,
				errorMessage: '',
				progress: 100
			});

			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('provider_job_id = ?');
			expect(sql).toContain('result_url = ?');
			expect(sql).toContain('r2_key = ?');
			expect(sql).toContain('brand_media_id = ?');
			expect(sql).toContain('cost = ?');
			expect(sql).toContain('error_message = ?');
			expect(sql).toContain('progress = ?');
			expect(sql).toContain("completed_at = datetime('now')");
		});
	});
});
