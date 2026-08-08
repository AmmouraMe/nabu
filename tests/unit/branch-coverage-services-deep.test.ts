/**
 * Deep branch coverage tests for service modules
 * Targets uncovered branches in:
 *   - src/lib/services/brand.ts (86.53%)
 *   - src/lib/services/onboarding.ts (85.05%)
 *   - src/lib/services/file-archive.ts (88.13%)
 *   - src/lib/services/ai-media-generation.ts (59.25%)
 *   - src/lib/services/providers/openai-video.ts (88.7%)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ═══════════════════════════════════════════════════════════════
// ai-media-generation.ts — additional branch coverage
// ═══════════════════════════════════════════════════════════════

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

describe('AI Media Generation - Deep Branch Coverage', () => {
	let mockDB: ReturnType<typeof createMockDB>;

	beforeEach(() => {
		mockDB = createMockDB();
		vi.clearAllMocks();
	});

	describe('getAIGeneration - null return branch', () => {
		it('should return null when row is null', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);
			const result = await getAIGeneration(mockDB as any, 'nonexistent');
			expect(result).toBeNull();
		});
	});

	describe('getAIGenerationsByBrand - results undefined branch', () => {
		it('should return empty array when result.results is undefined', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ success: true });
			const results = await getAIGenerationsByBrand(mockDB as any, 'bp-1');
			expect(results).toEqual([]);
		});

		it('should return empty array when result.results is null', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ results: null, success: true });
			const results = await getAIGenerationsByBrand(mockDB as any, 'bp-1');
			expect(results).toEqual([]);
		});
	});

	describe('mapRowToGeneration - progress=0 is falsy branch', () => {
		it('should map progress=0 to 0 (falsy || 0)', async () => {
			const row = {
				id: 'gen-x',
				brand_profile_id: 'bp-1',
				brand_media_id: null,
				generation_type: 'image',
				provider: 'openai',
				model: 'dall-e-3',
				prompt: 'test',
				negative_prompt: null,
				status: 'pending',
				provider_job_id: null,
				result_url: null,
				r2_key: null,
				cost: null,
				error_message: null,
				parameters: null,
				progress: 0,
				created_at: '2026-01-01',
				completed_at: null
			};
			mockDB._mockFirst.mockResolvedValueOnce(row);
			const result = await getAIGeneration(mockDB as any, 'gen-x');
			expect(result!.progress).toBe(0);
		});

		it('should map cost=0 to undefined (falsy || undefined)', async () => {
			const row = {
				id: 'gen-y',
				brand_profile_id: 'bp-1',
				brand_media_id: null,
				generation_type: 'image',
				provider: 'openai',
				model: 'dall-e-3',
				prompt: 'test',
				negative_prompt: null,
				status: 'complete',
				provider_job_id: null,
				result_url: null,
				r2_key: null,
				cost: 0,
				error_message: null,
				parameters: '{"a":1}',
				progress: 100,
				created_at: '2026-01-01',
				completed_at: '2026-01-02'
			};
			mockDB._mockFirst.mockResolvedValueOnce(row);
			const result = await getAIGeneration(mockDB as any, 'gen-y');
			expect(result!.cost).toBeUndefined();
			expect(result!.parameters).toEqual({ a: 1 });
		});
	});

	describe('generateImage - model default and negativePrompt null coalescing', () => {
		it('should use default model when model is undefined', async () => {
			const result = await generateImage(mockDB as any, {
				brandProfileId: 'bp-1',
				prompt: 'test'
			});
			expect(result.model).toBe('dall-e-3');
		});

		it('should pass negativePrompt as null when not provided (nullish coalescing)', async () => {
			await generateImage(mockDB as any, {
				brandProfileId: 'bp-1',
				prompt: 'test'
			});
			// Verify bind was called and negativePrompt position is null
			expect(mockDB._mockBind).toHaveBeenCalled();
			const args = mockDB._mockBind.mock.calls[0];
			// negativePrompt is the 6th arg (index 5)
			expect(args[5]).toBeNull();
		});

		it('should pass negativePrompt when provided', async () => {
			await generateImage(mockDB as any, {
				brandProfileId: 'bp-1',
				prompt: 'test',
				negativePrompt: 'blurry'
			});
			const args = mockDB._mockBind.mock.calls[0];
			expect(args[5]).toBe('blurry');
		});
	});

	describe('generateAudio - voice default branch', () => {
		it('should default voice to alloy when not provided', async () => {
			const result = await generateAudio(mockDB as any, {
				brandProfileId: 'bp-1',
				prompt: 'test'
			});
			expect(result.parameters!.voice).toBe('alloy');
		});

		it('should use provided voice', async () => {
			const result = await generateAudio(mockDB as any, {
				brandProfileId: 'bp-1',
				prompt: 'test',
				voice: 'nova'
			});
			expect(result.parameters!.voice).toBe('nova');
		});

		it('should include speed when provided', async () => {
			const result = await generateAudio(mockDB as any, {
				brandProfileId: 'bp-1',
				prompt: 'test',
				speed: 1.5
			});
			expect(result.parameters!.speed).toBe(1.5);
		});
	});

	describe('requestAIVideoGeneration - provider/model defaults', () => {
		it('should default provider to openai when not provided', async () => {
			const result = await requestAIVideoGeneration(mockDB as any, {
				brandProfileId: 'bp-1',
				prompt: 'test'
			});
			expect(result.provider).toBe('openai');
		});

		it('should default model to sora-2 when not provided', async () => {
			const result = await requestAIVideoGeneration(mockDB as any, {
				brandProfileId: 'bp-1',
				prompt: 'test'
			});
			expect(result.model).toBe('sora-2');
		});

		it('should use custom provider and model', async () => {
			const result = await requestAIVideoGeneration(mockDB as any, {
				brandProfileId: 'bp-1',
				prompt: 'test',
				provider: 'wavespeed',
				model: 'wan-2.1'
			});
			expect(result.provider).toBe('wavespeed');
			expect(result.model).toBe('wan-2.1');
		});
	});

	describe('updateAIGenerationStatus - all individual field branches', () => {
		it('should not set completed_at for processing status', async () => {
			await updateAIGenerationStatus(mockDB as any, 'gen-1', { status: 'processing' });
			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).not.toContain('completed_at');
		});

		it('should set completed_at for complete status', async () => {
			await updateAIGenerationStatus(mockDB as any, 'gen-1', { status: 'complete' });
			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain("completed_at = datetime('now')");
		});

		it('should set completed_at for failed status', async () => {
			await updateAIGenerationStatus(mockDB as any, 'gen-1', { status: 'failed' });
			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain("completed_at = datetime('now')");
		});

		it('should include providerJobId when provided', async () => {
			await updateAIGenerationStatus(mockDB as any, 'gen-1', {
				status: 'processing',
				providerJobId: 'job-123'
			});
			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('provider_job_id');
		});

		it('should include resultUrl when provided', async () => {
			await updateAIGenerationStatus(mockDB as any, 'gen-1', {
				status: 'complete',
				resultUrl: 'https://example.com/result.png'
			});
			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('result_url');
		});

		it('should include r2Key when provided', async () => {
			await updateAIGenerationStatus(mockDB as any, 'gen-1', {
				status: 'complete',
				r2Key: 'brands/img.png'
			});
			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('r2_key');
		});

		it('should include brandMediaId when provided', async () => {
			await updateAIGenerationStatus(mockDB as any, 'gen-1', {
				status: 'complete',
				brandMediaId: 'bm-1'
			});
			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('brand_media_id');
		});

		it('should include cost when provided', async () => {
			await updateAIGenerationStatus(mockDB as any, 'gen-1', {
				status: 'complete',
				cost: 0.04
			});
			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('cost');
		});

		it('should include errorMessage when provided', async () => {
			await updateAIGenerationStatus(mockDB as any, 'gen-1', {
				status: 'failed',
				errorMessage: 'API error'
			});
			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('error_message');
		});

		it('should include progress when provided', async () => {
			await updateAIGenerationStatus(mockDB as any, 'gen-1', {
				status: 'processing',
				progress: 50
			});
			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('progress');
		});
	});
});

// ═══════════════════════════════════════════════════════════════
// brand.ts — uncovered branches
// ═══════════════════════════════════════════════════════════════

import {
	getProfileFieldValue,
	getTextSuggestionsForField,
	addFieldVersion,
	getFieldHistory,
	getAllFieldHistory,
	updateBrandFieldWithVersion,
	revertFieldToVersion,
	getMatchingProfileField as brandGetMatchingProfileField,
	duplicateBrandProfile,
	getBrandProfileForUser,
	getAllBrandProfilesByUser,
	getBrandFieldsSummary
} from '$lib/services/brand';

describe('Brand Service - Deep Branch Coverage', () => {
	let mockDB: ReturnType<typeof createMockDB>;

	beforeEach(() => {
		mockDB = createMockDB();
		vi.clearAllMocks();
	});

	describe('getProfileFieldValue', () => {
		it('should throw for unknown field name', async () => {
			await expect(getProfileFieldValue(mockDB as any, 'bp-1', 'unknownField')).rejects.toThrow(
				'Unknown field: unknownField'
			);
		});

		it('should return null when row is null', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);
			const result = await getProfileFieldValue(mockDB as any, 'bp-1', 'brandName');
			expect(result).toBeNull();
		});

		it('should return null when column value is null (nullish coalescing)', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ brand_name: null });
			const result = await getProfileFieldValue(mockDB as any, 'bp-1', 'brandName');
			expect(result).toBeNull();
		});

		it('should return null when column value is undefined (nullish coalescing)', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ brand_name: undefined });
			const result = await getProfileFieldValue(mockDB as any, 'bp-1', 'brandName');
			expect(result).toBeNull();
		});

		it('should return value when column has value', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ brand_name: 'MyBrand' });
			const result = await getProfileFieldValue(mockDB as any, 'bp-1', 'brandName');
			expect(result).toBe('MyBrand');
		});
	});

	describe('getTextSuggestionsForField', () => {
		it('should return empty array for unknown field', async () => {
			const result = await getTextSuggestionsForField(mockDB as any, 'bp-1', 'unknownField');
			expect(result).toEqual([]);
		});

		it('should return mapped results for known field', async () => {
			mockDB._mockAll.mockResolvedValueOnce({
				results: [
					{
						id: 't-1',
						category: 'messaging',
						key: 'tagline',
						label: 'Tagline',
						value: 'Test',
						language: 'en'
					}
				]
			});
			const result = await getTextSuggestionsForField(mockDB as any, 'bp-1', 'tagline');
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe('t-1');
		});

		it('should return empty array when results is undefined', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ success: true });
			const result = await getTextSuggestionsForField(mockDB as any, 'bp-1', 'tagline');
			expect(result).toEqual([]);
		});
	});

	describe('addFieldVersion', () => {
		it('should handle maxVersionRow being null (default to 0)', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);
			const result = await addFieldVersion(mockDB as any, {
				brandProfileId: 'bp-1',
				userId: 'user-1',
				fieldName: 'brandName',
				oldValue: null,
				newValue: 'NewBrand',
				changeSource: 'manual'
			});
			expect(result.versionNumber).toBe(1);
		});

		it('should handle maxVersionRow with max_version=0', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ max_version: 0 });
			const result = await addFieldVersion(mockDB as any, {
				brandProfileId: 'bp-1',
				userId: 'user-1',
				fieldName: 'brandName',
				oldValue: null,
				newValue: 'NewBrand',
				changeSource: 'manual'
			});
			expect(result.versionNumber).toBe(1);
		});

		it('should serialize non-string oldValue as JSON', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ max_version: 1 });
			const result = await addFieldVersion(mockDB as any, {
				brandProfileId: 'bp-1',
				userId: 'user-1',
				fieldName: 'brandPersonalityTraits',
				oldValue: ['bold', 'creative'],
				newValue: ['bold', 'creative', 'innovative'],
				changeSource: 'ai',
				changeReason: 'AI suggested'
			});
			expect(result.versionNumber).toBe(2);
			expect(result.oldValue).toBe('["bold","creative"]');
			expect(result.newValue).toBe('["bold","creative","innovative"]');
			expect(result.changeReason).toBe('AI suggested');
		});

		it('should handle string oldValue/newValue without JSON serialization', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ max_version: 2 });
			const result = await addFieldVersion(mockDB as any, {
				brandProfileId: 'bp-1',
				userId: 'user-1',
				fieldName: 'tagline',
				oldValue: 'Old tagline',
				newValue: 'New tagline',
				changeSource: 'manual'
			});
			expect(result.oldValue).toBe('Old tagline');
			expect(result.newValue).toBe('New tagline');
		});

		it('should handle null oldValue and newValue', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ max_version: 4 });
			const result = await addFieldVersion(mockDB as any, {
				brandProfileId: 'bp-1',
				userId: 'user-1',
				fieldName: 'tagline',
				oldValue: null,
				newValue: null,
				changeSource: 'manual'
			});
			expect(result.oldValue).toBeNull();
			expect(result.newValue).toBeNull();
		});

		it('should default changeReason to null when not provided', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ max_version: 0 });
			const result = await addFieldVersion(mockDB as any, {
				brandProfileId: 'bp-1',
				userId: 'user-1',
				fieldName: 'tagline',
				oldValue: null,
				newValue: 'Test',
				changeSource: 'manual'
			});
			expect(result.changeReason).toBeNull();
		});
	});

	describe('getFieldHistory', () => {
		it('should return empty array when results is undefined', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ success: true });
			const result = await getFieldHistory(mockDB as any, 'bp-1', 'brandName');
			expect(result).toEqual([]);
		});

		it('should map rows with null old_value and change_reason', async () => {
			mockDB._mockAll.mockResolvedValueOnce({
				results: [
					{
						id: 'v-1',
						brand_profile_id: 'bp-1',
						user_id: 'u-1',
						field_name: 'brandName',
						old_value: null,
						new_value: 'Brand',
						change_source: 'manual',
						change_reason: null,
						version_number: 1,
						created_at: '2026-01-01'
					}
				]
			});
			const result = await getFieldHistory(mockDB as any, 'bp-1', 'brandName');
			expect(result[0].oldValue).toBeNull();
			expect(result[0].changeReason).toBeNull();
		});

		it('should map rows with populated old_value and change_reason', async () => {
			mockDB._mockAll.mockResolvedValueOnce({
				results: [
					{
						id: 'v-2',
						brand_profile_id: 'bp-1',
						user_id: 'u-1',
						field_name: 'brandName',
						old_value: 'OldBrand',
						new_value: 'NewBrand',
						change_source: 'ai',
						change_reason: 'AI suggested',
						version_number: 2,
						created_at: '2026-01-02'
					}
				]
			});
			const result = await getFieldHistory(mockDB as any, 'bp-1', 'brandName');
			expect(result[0].oldValue).toBe('OldBrand');
			expect(result[0].changeReason).toBe('AI suggested');
		});
	});

	describe('getAllFieldHistory', () => {
		it('should return empty array when results is undefined', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ success: true });
			const result = await getAllFieldHistory(mockDB as any, 'bp-1');
			expect(result).toEqual([]);
		});
	});

	describe('updateBrandFieldWithVersion', () => {
		it('should throw for unknown field name', async () => {
			await expect(
				updateBrandFieldWithVersion(mockDB as any, {
					profileId: 'bp-1',
					userId: 'u-1',
					fieldName: 'invalidField',
					newValue: 'x',
					changeSource: 'manual'
				})
			).rejects.toThrow('Unknown field: invalidField');
		});

		it('should set dbValue to null when newValue is null', async () => {
			mockDB._mockFirst
				.mockResolvedValueOnce({ brand_name: 'OldBrand' }) // current value query
				.mockResolvedValueOnce({ max_version: 0 }); // version query
			await updateBrandFieldWithVersion(mockDB as any, {
				profileId: 'bp-1',
				userId: 'u-1',
				fieldName: 'tagline',
				newValue: null,
				changeSource: 'manual'
			});
			// DB update should bind null
			const updateBindCall = mockDB._mockBind.mock.calls[1]; // Second bind = UPDATE
			expect(updateBindCall[0]).toBeNull(); // dbValue
		});

		it('should set dbValue to null when newValue is undefined', async () => {
			mockDB._mockFirst
				.mockResolvedValueOnce({ brand_name: 'OldBrand' })
				.mockResolvedValueOnce({ max_version: 0 });
			await updateBrandFieldWithVersion(mockDB as any, {
				profileId: 'bp-1',
				userId: 'u-1',
				fieldName: 'tagline',
				newValue: undefined,
				changeSource: 'manual'
			});
			const updateBindCall = mockDB._mockBind.mock.calls[1];
			expect(updateBindCall[0]).toBeNull();
		});

		it('should join array values for text fields (e.g. brandPersonalityTraits)', async () => {
			mockDB._mockFirst
				.mockResolvedValueOnce({ brand_personality_traits: null })
				.mockResolvedValueOnce({ max_version: 0 });
			await updateBrandFieldWithVersion(mockDB as any, {
				profileId: 'bp-1',
				userId: 'u-1',
				fieldName: 'brandPersonalityTraits',
				newValue: ['bold', 'creative'],
				changeSource: 'ai'
			});
			const updateBindCall = mockDB._mockBind.mock.calls[1];
			expect(updateBindCall[0]).toBe('bold, creative');
		});

		it('should store string value as-is for text fields like brandPersonalityTraits', async () => {
			mockDB._mockFirst
				.mockResolvedValueOnce({ brand_personality_traits: '"old"' })
				.mockResolvedValueOnce({ max_version: 1 });
			await updateBrandFieldWithVersion(mockDB as any, {
				profileId: 'bp-1',
				userId: 'u-1',
				fieldName: 'brandPersonalityTraits',
				newValue: 'bold, creative',
				changeSource: 'manual'
			});
			const updateBindCall = mockDB._mockBind.mock.calls[1];
			expect(updateBindCall[0]).toBe('bold, creative');
		});

		it('should String() non-object value for fields no longer in JSON_OBJECT_FIELDS', async () => {
			mockDB._mockFirst
				.mockResolvedValueOnce({ target_audience: null })
				.mockResolvedValueOnce({ max_version: 0 });
			await updateBrandFieldWithVersion(mockDB as any, {
				profileId: 'bp-1',
				userId: 'u-1',
				fieldName: 'targetAudience',
				newValue: 'Adults aged 25-40 interested in tech',
				changeSource: 'ai'
			});
			const updateBindCall = mockDB._mockBind.mock.calls[1];
			expect(updateBindCall[0]).toBe('Adults aged 25-40 interested in tech');
		});

		it('should String() non-null value for regular string fields', async () => {
			mockDB._mockFirst
				.mockResolvedValueOnce({ tagline: null })
				.mockResolvedValueOnce({ max_version: 0 });
			await updateBrandFieldWithVersion(mockDB as any, {
				profileId: 'bp-1',
				userId: 'u-1',
				fieldName: 'tagline',
				newValue: 'New tagline',
				changeSource: 'manual'
			});
			const updateBindCall = mockDB._mockBind.mock.calls[1];
			expect(updateBindCall[0]).toBe('New tagline');
		});

		it('should mark brandName as confirmed when fieldName is brandName', async () => {
			mockDB._mockFirst
				.mockResolvedValueOnce({ brand_name: 'Old' })
				.mockResolvedValueOnce({ max_version: 1 });
			await updateBrandFieldWithVersion(mockDB as any, {
				profileId: 'bp-1',
				userId: 'u-1',
				fieldName: 'brandName',
				newValue: 'New Brand',
				changeSource: 'manual'
			});
			// Should have 4 prepare calls: SELECT, UPDATE, UPDATE brand_name_confirmed, INSERT version
			expect(mockDB.prepare.mock.calls.length).toBeGreaterThanOrEqual(4);
			const confirmedUpdateSql = mockDB.prepare.mock.calls[2][0] as string;
			expect(confirmedUpdateSql).toContain('brand_name_confirmed');
		});

		it('should NOT mark brand_name_confirmed for non-brandName fields', async () => {
			mockDB._mockFirst
				.mockResolvedValueOnce({ tagline: 'Old' })
				.mockResolvedValueOnce({ max_version: 0 });
			await updateBrandFieldWithVersion(mockDB as any, {
				profileId: 'bp-1',
				userId: 'u-1',
				fieldName: 'tagline',
				newValue: 'New tagline',
				changeSource: 'manual'
			});
			// Check no SQL contains brand_name_confirmed
			const allSql = mockDB.prepare.mock.calls.map((c: any) => c[0] as string);
			expect(allSql.some((s: string) => s.includes('brand_name_confirmed'))).toBe(false);
		});

		it('should handle currentRow being null (oldValue defaults to null)', async () => {
			mockDB._mockFirst
				.mockResolvedValueOnce(null) // no current row
				.mockResolvedValueOnce({ max_version: 0 });
			await updateBrandFieldWithVersion(mockDB as any, {
				profileId: 'bp-1',
				userId: 'u-1',
				fieldName: 'tagline',
				newValue: 'New tagline',
				changeSource: 'manual'
			});
			// The function should still complete without error
			expect(mockDB.prepare).toHaveBeenCalled();
		});
	});

	describe('revertFieldToVersion', () => {
		it('should throw when version not found', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);
			await expect(
				revertFieldToVersion(mockDB as any, {
					profileId: 'bp-1',
					userId: 'u-1',
					fieldName: 'brandName',
					versionId: 'v-nonexistent'
				})
			).rejects.toThrow('Version not found');
		});
	});

	describe('getAllBrandProfilesByUser', () => {
		it('should return empty array when results is undefined', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ success: true });
			const result = await getAllBrandProfilesByUser(mockDB as any, 'u-1');
			expect(result).toEqual([]);
		});
	});

	describe('getBrandProfileForUser', () => {
		it('should return null when row is null', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);
			const result = await getBrandProfileForUser(mockDB as any, 'bp-1', 'u-1');
			expect(result).toBeNull();
		});
	});

	describe('duplicateBrandProfile', () => {
		it('should throw when source profile not found', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);
			await expect(duplicateBrandProfile(mockDB as any, 'nonexistent', 'u-1')).rejects.toThrow(
				'Source profile not found'
			);
		});

		it('should duplicate with all fields null (falsy || undefined branches)', async () => {
			const sourceRow = {
				id: 'bp-src',
				user_id: 'u-1',
				status: 'completed',
				brand_name: null,
				tagline: null,
				mission_statement: null,
				vision_statement: null,
				elevator_pitch: null,
				brand_archetype: null,
				brand_personality_traits: null,
				tone_of_voice: null,
				communication_style: null,
				target_audience: null,
				customer_pain_points: null,
				value_proposition: null,
				primary_color: null,
				secondary_color: null,
				accent_color: null,
				color_palette: null,
				typography_logo: null,
				typography_heading: null,
				typography_body: null,
				logo_concept: null,
				logo_url: null,
				industry: null,
				competitors: null,
				unique_selling_points: null,
				market_position: null,
				origin_story: null,
				brand_values: null,
				brand_promise: null,
				style_guide: null,
				onboarding_step: null,
				brand_name_confirmed: 0,
				created_at: '2026-01-01',
				updated_at: '2026-01-01'
			};
			mockDB._mockFirst.mockResolvedValueOnce(sourceRow);
			const result = await duplicateBrandProfile(mockDB as any, 'bp-src', 'u-1');
			expect(result.brandName).toBe('Untitled (Copy)');
			expect(result.tagline).toBeUndefined();
			expect(result.onboardingStep).toBe('complete');
		});

		it('should duplicate with populated fields (truthy branches)', async () => {
			const sourceRow = {
				id: 'bp-src',
				user_id: 'u-1',
				status: 'completed',
				brand_name: 'MyBrand',
				tagline: 'Test tagline',
				mission_statement: 'Mission',
				vision_statement: 'Vision',
				elevator_pitch: 'Pitch',
				brand_archetype: 'hero',
				brand_personality_traits: '["bold"]',
				tone_of_voice: 'Professional',
				communication_style: 'Formal',
				target_audience: '{"age":"25-40"}',
				customer_pain_points: '["pain1"]',
				value_proposition: 'Value',
				primary_color: '#FF0000',
				secondary_color: '#00FF00',
				accent_color: '#0000FF',
				color_palette: '["#111","#222"]',
				typography_logo: 'Inter',
				typography_heading: 'Inter',
				typography_body: 'Open Sans',
				logo_concept: 'Abstract',
				logo_url: 'https://example.com/logo.png',
				industry: 'Tech',
				competitors: '["Comp1"]',
				unique_selling_points: '["USP1"]',
				market_position: 'Leader',
				origin_story: 'Founded in 2020',
				brand_values: '["Innovation"]',
				brand_promise: 'Best quality',
				style_guide: '{"colors":{}}',
				onboarding_step: 'complete',
				brand_name_confirmed: 1,
				created_at: '2026-01-01',
				updated_at: '2026-01-01'
			};
			mockDB._mockFirst.mockResolvedValueOnce(sourceRow);
			const result = await duplicateBrandProfile(mockDB as any, 'bp-src', 'u-1');
			expect(result.brandName).toBe('MyBrand (Copy)');
			expect(result.tagline).toBe('Test tagline');
			expect(result.industry).toBe('Tech');
			expect(result.onboardingStep).toBe('complete');
		});
	});

	describe('getMatchingProfileField', () => {
		it('should return null for unknown category/key', () => {
			const result = brandGetMatchingProfileField('unknown', 'unknown');
			expect(result).toBeNull();
		});

		it('should return match for known mapping', () => {
			const result = brandGetMatchingProfileField('messaging', 'tagline');
			expect(result).not.toBeNull();
			expect(result!.fieldName).toBe('tagline');
			expect(result!.fieldLabel).toBe('Tagline');
		});

		it('should return match for alternative key', () => {
			const result = brandGetMatchingProfileField('messaging', 'slogan');
			expect(result).not.toBeNull();
			expect(result!.fieldName).toBe('tagline');
		});
	});

	describe('getBrandFieldsSummary', () => {
		it('should return all sections for a profile', () => {
			const profile = {
				id: 'bp-1',
				userId: 'u-1',
				status: 'completed' as const,
				brandName: 'Test',
				brandNameConfirmed: true,
				createdAt: '2026-01-01',
				updatedAt: '2026-01-01'
			};
			const sections = getBrandFieldsSummary(profile as any);
			expect(sections.length).toBeGreaterThanOrEqual(6);
			expect(sections[0].id).toBe('identity');
			expect(sections[1].id).toBe('personality');
		});
	});
});

// ═══════════════════════════════════════════════════════════════
// onboarding.ts — uncovered branches (lines 976-977, 1117-1118)
// ═══════════════════════════════════════════════════════════════

import {
	buildExtractionPrompt,
	parseExtractionResponse,
	getNextStep,
	getPreviousStep,
	getStepProgress
} from '$lib/services/onboarding';

describe('Onboarding Service - Deep Branch Coverage', () => {
	describe('parseExtractionResponse', () => {
		it('should return null for empty string', () => {
			expect(parseExtractionResponse('')).toBeNull();
		});

		it('should return null for whitespace only', () => {
			expect(parseExtractionResponse('   ')).toBeNull();
		});

		it('should return null for null/undefined input', () => {
			expect(parseExtractionResponse(null as any)).toBeNull();
			expect(parseExtractionResponse(undefined as any)).toBeNull();
		});

		it('should return null for invalid JSON', () => {
			expect(parseExtractionResponse('not json')).toBeNull();
		});

		it('should return null for JSON array', () => {
			expect(parseExtractionResponse('["a","b"]')).toBeNull();
		});

		it('should return null for JSON primitive', () => {
			expect(parseExtractionResponse('"just a string"')).toBeNull();
		});

		it('should strip markdown code block wrappers', () => {
			const result = parseExtractionResponse('```json\n{"brandName":"Test"}\n```');
			expect(result).not.toBeNull();
			expect(result!.brandName).toBe('Test');
		});

		it('should strip code block without json specifier', () => {
			const result = parseExtractionResponse('```\n{"brandName":"Test"}\n```');
			expect(result).not.toBeNull();
			expect(result!.brandName).toBe('Test');
		});

		it('should filter out unknown fields', () => {
			const result = parseExtractionResponse(
				JSON.stringify({
					brandName: 'Test',
					unknownField: 'value',
					anotherUnknown: 123
				})
			);
			expect(result).not.toBeNull();
			expect(result!.brandName).toBe('Test');
			expect(result!['unknownField' as keyof typeof result]).toBeUndefined();
		});

		it('should filter out null values', () => {
			const result = parseExtractionResponse(
				JSON.stringify({
					brandName: 'Test',
					tagline: null
				})
			);
			expect(result).not.toBeNull();
			expect(result!.brandName).toBe('Test');
			expect('tagline' in result!).toBe(false);
		});

		it('should filter out empty string values', () => {
			const result = parseExtractionResponse(
				JSON.stringify({
					brandName: 'Test',
					tagline: ''
				})
			);
			expect(result).not.toBeNull();
			expect('tagline' in result!).toBe(false);
		});

		it('should filter out whitespace-only string values', () => {
			const result = parseExtractionResponse(
				JSON.stringify({
					brandName: 'Test',
					tagline: '   '
				})
			);
			expect(result).not.toBeNull();
			expect('tagline' in result!).toBe(false);
		});

		it('should return null when all known fields have empty values', () => {
			const result = parseExtractionResponse(
				JSON.stringify({
					brandName: '',
					tagline: null
				})
			);
			expect(result).toBeNull();
		});

		it('should accept array fields', () => {
			const result = parseExtractionResponse(
				JSON.stringify({
					brandPersonalityTraits: ['bold', 'creative']
				})
			);
			expect(result).not.toBeNull();
			expect(result!.brandPersonalityTraits).toEqual(['bold', 'creative']);
		});

		it('should accept object fields', () => {
			const result = parseExtractionResponse(
				JSON.stringify({
					targetAudience: { age: '25-40' }
				})
			);
			expect(result).not.toBeNull();
			expect(result!.targetAudience).toEqual({ age: '25-40' });
		});
	});

	describe('buildExtractionPrompt', () => {
		it('should return empty string for complete step', () => {
			const result = buildExtractionPrompt('complete', []);
			expect(result).toBe('');
		});

		it('should build prompt for brand_identity step', () => {
			const messages = [
				{ role: 'user', content: 'My brand is called Acme' },
				{ role: 'assistant', content: 'Great name!' }
			];
			const result = buildExtractionPrompt('brand_identity', messages);
			expect(result).toContain('brandName');
			expect(result).toContain('Acme');
		});

		it('should handle non-string content in messages', () => {
			const messages = [{ role: 'user', content: { type: 'text', text: 'Hello' } as any }];
			const result = buildExtractionPrompt('brand_identity', messages);
			expect(result).toContain('Hello');
		});
	});

	describe('getNextStep', () => {
		it('should return null for last step (complete)', () => {
			expect(getNextStep('complete')).toBeNull();
		});

		it('should return null for unknown step', () => {
			expect(getNextStep('nonexistent' as any)).toBeNull();
		});

		it('should return next step for valid step', () => {
			const next = getNextStep('brand_identity');
			expect(next).not.toBeNull();
		});
	});

	describe('getPreviousStep', () => {
		it('should return null for first step', () => {
			expect(getPreviousStep('welcome')).toBeNull();
		});

		it('should return null for unknown step', () => {
			expect(getPreviousStep('nonexistent' as any)).toBeNull();
		});

		it('should return previous step for valid step', () => {
			const prev = getPreviousStep('brand_personality');
			expect(prev).not.toBeNull();
		});
	});

	describe('getStepProgress', () => {
		it('should return 0 for unknown step', () => {
			expect(getStepProgress('nonexistent' as any)).toBe(0);
		});

		it('should return 0 for first step', () => {
			expect(getStepProgress('welcome')).toBe(0);
		});

		it('should return 100 for last step', () => {
			expect(getStepProgress('complete')).toBe(100);
		});
	});
});

// ═══════════════════════════════════════════════════════════════
// file-archive.ts — uncovered branches (lines 135,290,411-421)
// ═══════════════════════════════════════════════════════════════

import {
	determineFolder,
	listFileArchive,
	getArchiveStats,
	toggleFileStar,
	updateFileArchiveEntry,
	deleteFileArchiveEntry,
	getArchiveFolders,
	createFileArchiveEntry as createFAEntry,
	getFileArchiveEntry
} from '$lib/services/file-archive';

describe('File Archive Service - Deep Branch Coverage', () => {
	let mockDB: ReturnType<typeof createMockDB>;

	beforeEach(() => {
		mockDB = createMockDB();
		vi.clearAllMocks();
	});

	describe('determineFolder', () => {
		it('should return onboarding path with step', () => {
			const result = determineFolder({
				context: 'onboarding',
				fileType: 'image',
				source: 'user_upload',
				onboardingStep: 'brand_identity',
				brandProfileId: 'bp-1',
				userId: 'u-1',
				fileName: 'test.png',
				mimeType: 'image/png',
				fileSize: 100,
				r2Key: 'key'
			});
			expect(result).toBe('/onboarding/brand-identity/images');
		});

		it('should return onboarding path without step', () => {
			const result = determineFolder({
				context: 'onboarding',
				fileType: 'image',
				source: 'user_upload',
				brandProfileId: 'bp-1',
				userId: 'u-1',
				fileName: 'test.png',
				mimeType: 'image/png',
				fileSize: 100,
				r2Key: 'key'
			});
			expect(result).toBe('/onboarding/images');
		});

		it('should return brand_assets path', () => {
			const result = determineFolder({
				context: 'brand_assets',
				fileType: 'video',
				source: 'user_upload',
				brandProfileId: 'bp-1',
				userId: 'u-1',
				fileName: 'test.mp4',
				mimeType: 'video/mp4',
				fileSize: 100,
				r2Key: 'key'
			});
			expect(result).toBe('/brand-assets/videos');
		});

		it('should return ai-generated path for chat with ai source', () => {
			const result = determineFolder({
				context: 'chat',
				fileType: 'audio',
				source: 'ai_generated',
				brandProfileId: 'bp-1',
				userId: 'u-1',
				fileName: 'test.mp3',
				mimeType: 'audio/mpeg',
				fileSize: 100,
				r2Key: 'key'
			});
			expect(result).toBe('/ai-generated/audios');
		});

		it('should return uploads path for chat with user upload', () => {
			const result = determineFolder({
				context: 'chat',
				fileType: 'document',
				source: 'user_upload',
				brandProfileId: 'bp-1',
				userId: 'u-1',
				fileName: 'test.pdf',
				mimeType: 'application/pdf',
				fileSize: 100,
				r2Key: 'key'
			});
			expect(result).toBe('/uploads/documents');
		});

		it('should return uploads path when no context matches', () => {
			const result = determineFolder({
				fileType: 'image',
				source: 'user_upload',
				brandProfileId: 'bp-1',
				userId: 'u-1',
				fileName: 'test.png',
				mimeType: 'image/png',
				fileSize: 100,
				r2Key: 'key'
			} as any);
			expect(result).toBe('/uploads/images');
		});
	});

	describe('listFileArchive - filter branches', () => {
		it('should apply all filter conditions', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ count: 1 });
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });
			await listFileArchive(mockDB as any, {
				brandProfileId: 'bp-1',
				fileType: 'image',
				source: 'user_upload',
				context: 'chat',
				folder: '/uploads',
				isStarred: true,
				search: 'logo',
				limit: 10,
				offset: 5
			});
			const prepareCall = mockDB.prepare.mock.calls[0][0] as string;
			expect(prepareCall).toContain('file_type = ?');
			expect(prepareCall).toContain('source = ?');
			expect(prepareCall).toContain('context = ?');
			expect(prepareCall).toContain('folder LIKE ?');
			expect(prepareCall).toContain('is_starred = ?');
			expect(prepareCall).toContain('file_name LIKE ?');
		});

		it('should apply isStarred=false filter', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ count: 0 });
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });
			await listFileArchive(mockDB as any, {
				brandProfileId: 'bp-1',
				isStarred: false
			});
			const bindCalls = mockDB._mockBind.mock.calls;
			// isStarred = false should bind 0
			const allArgs = bindCalls.flat();
			expect(allArgs).toContain(0);
		});

		it('should use default limit and offset when not provided', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ count: 0 });
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });
			const result = await listFileArchive(mockDB as any, {
				brandProfileId: 'bp-1'
			});
			expect(result.total).toBe(0);
			expect(result.files).toEqual([]);
		});

		it('should handle null countResult', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });
			const result = await listFileArchive(mockDB as any, {
				brandProfileId: 'bp-1'
			});
			expect(result.total).toBe(0);
		});

		it('should handle undefined results in paginated query', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ count: 5 });
			mockDB._mockAll.mockResolvedValueOnce({ success: true });
			const result = await listFileArchive(mockDB as any, {
				brandProfileId: 'bp-1'
			});
			expect(result.files).toEqual([]);
			expect(result.total).toBe(5);
		});
	});

	describe('getArchiveStats', () => {
		it('should handle all null results', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);
			mockDB._mockAll
				.mockResolvedValueOnce({ results: [] })
				.mockResolvedValueOnce({ results: [] })
				.mockResolvedValueOnce({ results: [] });

			// Need to use Promise.all mock
			const mockPromiseDB = {
				prepare: vi.fn().mockReturnValue({
					bind: vi.fn().mockReturnValue({
						first: vi.fn().mockResolvedValue(null),
						all: vi.fn().mockResolvedValue({ results: [] })
					})
				})
			};

			const result = await getArchiveStats(mockPromiseDB as any, 'bp-1');
			expect(result.totalFiles).toBe(0);
			expect(result.totalSize).toBe(0);
		});
	});

	describe('toggleFileStar', () => {
		it('should return true when file is now starred', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ is_starred: 1 });
			const result = await toggleFileStar(mockDB as any, 'fa-1');
			expect(result).toBe(true);
		});

		it('should return false when file is now unstarred', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ is_starred: 0 });
			const result = await toggleFileStar(mockDB as any, 'fa-1');
			expect(result).toBe(false);
		});

		it('should return false when result is null', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);
			const result = await toggleFileStar(mockDB as any, 'nonexistent');
			expect(result).toBe(false);
		});
	});

	describe('updateFileArchiveEntry', () => {
		it('should update tags when provided', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({
				id: 'fa-1',
				brand_profile_id: 'bp-1',
				user_id: 'u-1',
				file_name: 'test.png',
				mime_type: 'image/png',
				file_size: 100,
				r2_key: 'key',
				file_type: 'image',
				source: 'user_upload',
				context: 'chat',
				folder: '/uploads',
				tags: '["new"]',
				is_starred: 0,
				created_at: '2026-01-01',
				updated_at: '2026-01-02'
			});
			const result = await updateFileArchiveEntry(mockDB as any, 'fa-1', {
				tags: ['new']
			});
			expect(result).not.toBeNull();
		});

		it('should update description when provided', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({
				id: 'fa-1',
				brand_profile_id: 'bp-1',
				user_id: 'u-1',
				file_name: 'test.png',
				mime_type: 'image/png',
				file_size: 100,
				r2_key: 'key',
				file_type: 'image',
				source: 'user_upload',
				context: 'chat',
				folder: '/uploads',
				tags: '[]',
				is_starred: 0,
				created_at: '2026-01-01',
				updated_at: '2026-01-02'
			});
			const result = await updateFileArchiveEntry(mockDB as any, 'fa-1', {
				description: 'New description'
			});
			expect(result).not.toBeNull();
		});

		it('should update folder when provided', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({
				id: 'fa-1',
				brand_profile_id: 'bp-1',
				user_id: 'u-1',
				file_name: 'test.png',
				mime_type: 'image/png',
				file_size: 100,
				r2_key: 'key',
				file_type: 'image',
				source: 'user_upload',
				context: 'chat',
				folder: '/new-folder',
				tags: '[]',
				is_starred: 0,
				created_at: '2026-01-01',
				updated_at: '2026-01-02'
			});
			const result = await updateFileArchiveEntry(mockDB as any, 'fa-1', {
				folder: '/new-folder'
			});
			expect(result).not.toBeNull();
		});

		it('should update fileName when provided', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({
				id: 'fa-1',
				brand_profile_id: 'bp-1',
				user_id: 'u-1',
				file_name: 'renamed.png',
				mime_type: 'image/png',
				file_size: 100,
				r2_key: 'key',
				file_type: 'image',
				source: 'user_upload',
				context: 'chat',
				folder: '/uploads',
				tags: '[]',
				is_starred: 0,
				created_at: '2026-01-01',
				updated_at: '2026-01-02'
			});
			const result = await updateFileArchiveEntry(mockDB as any, 'fa-1', {
				fileName: 'renamed.png'
			});
			expect(result).not.toBeNull();
		});

		it('should return null when no row returned', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);
			const result = await updateFileArchiveEntry(mockDB as any, 'nonexistent', {
				description: 'X'
			});
			expect(result).toBeNull();
		});

		it('should update all fields at once', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({
				id: 'fa-1',
				brand_profile_id: 'bp-1',
				user_id: 'u-1',
				file_name: 'new.png',
				mime_type: 'image/png',
				file_size: 100,
				r2_key: 'key',
				file_type: 'image',
				source: 'user_upload',
				context: 'chat',
				folder: '/moved',
				tags: '["tag1"]',
				description: 'Updated desc',
				is_starred: 0,
				created_at: '2026-01-01',
				updated_at: '2026-01-02'
			});
			const result = await updateFileArchiveEntry(mockDB as any, 'fa-1', {
				tags: ['tag1'],
				description: 'Updated desc',
				folder: '/moved',
				fileName: 'new.png'
			});
			expect(result).not.toBeNull();
			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('tags = ?');
			expect(sql).toContain('description = ?');
			expect(sql).toContain('folder = ?');
			expect(sql).toContain('file_name = ?');
		});
	});

	describe('deleteFileArchiveEntry', () => {
		it('should return true when deletion succeeds', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ id: 'fa-1' });
			const result = await deleteFileArchiveEntry(mockDB as any, 'fa-1');
			expect(result).toBe(true);
		});

		it('should return false when no row deleted', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);
			const result = await deleteFileArchiveEntry(mockDB as any, 'nonexistent');
			expect(result).toBe(false);
		});
	});

	describe('getArchiveFolders', () => {
		it('should return folders with parsed names', async () => {
			mockDB._mockAll.mockResolvedValueOnce({
				results: [
					{ folder: '/uploads/images', file_count: 5 },
					{ folder: '/ai-generated/videos', file_count: 3 }
				]
			});
			const result = await getArchiveFolders(mockDB as any, 'bp-1');
			expect(result).toHaveLength(2);
			expect(result[0].name).toBe('images');
			expect(result[0].fileCount).toBe(5);
			expect(result[1].name).toBe('videos');
		});

		it('should handle empty results', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });
			const result = await getArchiveFolders(mockDB as any, 'bp-1');
			expect(result).toEqual([]);
		});

		it('should handle undefined results', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ success: true });
			const result = await getArchiveFolders(mockDB as any, 'bp-1');
			expect(result).toEqual([]);
		});
	});

	describe('getFileArchiveEntry', () => {
		it('should return null when not found', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);
			const result = await getFileArchiveEntry(mockDB as any, 'nonexistent');
			expect(result).toBeNull();
		});

		it('should return entry when found', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({
				id: 'fa-1',
				brand_profile_id: 'bp-1',
				user_id: 'u-1',
				file_name: 'test.png',
				mime_type: 'image/png',
				file_size: 100,
				r2_key: 'key',
				file_type: 'image',
				source: 'user_upload',
				context: 'chat',
				folder: '/uploads',
				tags: '[]',
				is_starred: 0,
				created_at: '2026-01-01',
				updated_at: '2026-01-01'
			});
			const result = await getFileArchiveEntry(mockDB as any, 'fa-1');
			expect(result).not.toBeNull();
			expect(result!.id).toBe('fa-1');
		});

		it('should handle invalid JSON in tags', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({
				id: 'fa-1',
				brand_profile_id: 'bp-1',
				user_id: 'u-1',
				file_name: 'test.png',
				mime_type: 'image/png',
				file_size: 100,
				r2Key: 'key',
				r2_key: 'key',
				file_type: 'image',
				source: 'user_upload',
				context: 'chat',
				folder: '/uploads',
				tags: 'not-valid-json',
				is_starred: 1,
				created_at: '2026-01-01',
				updated_at: '2026-01-01'
			});
			const result = await getFileArchiveEntry(mockDB as any, 'fa-1');
			expect(result).not.toBeNull();
			expect(result!.tags).toEqual([]);
			expect(result!.isStarred).toBe(true);
		});
	});
});

// ═══════════════════════════════════════════════════════════════
// openai-video.ts — uncovered branches (lines 81,194,199,253)
// ═══════════════════════════════════════════════════════════════

describe('OpenAI Video Provider - Deep Branch Coverage', () => {
	let OpenAIVideoProvider: any;

	beforeEach(async () => {
		vi.restoreAllMocks();
		const mod = await import('../../src/lib/services/providers/openai-video');
		OpenAIVideoProvider = mod.OpenAIVideoProvider;
	});

	describe('generateVideo', () => {
		it('should handle non-ok response', async () => {
			const provider = new OpenAIVideoProvider();
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response(JSON.stringify({ error: { message: 'Rate limited' } }), { status: 429 })
			);
			const result = await provider.generateVideo('key', {
				prompt: 'test',
				model: 'sora-2'
			});
			expect(result.status).toBe('error');
			expect(result.error).toContain('Rate limited');
		});

		it('should handle non-ok response with no parseable error', async () => {
			const provider = new OpenAIVideoProvider();
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response('not json', { status: 500 })
			);
			const result = await provider.generateVideo('key', {
				prompt: 'test',
				model: 'sora-2'
			});
			expect(result.status).toBe('error');
			expect(result.error).toContain('500');
		});

		it('should handle completed status in response', async () => {
			const provider = new OpenAIVideoProvider();
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'vid-1',
						object: 'video',
						status: 'completed',
						model: 'sora-2',
						progress: 100,
						seconds: '8',
						size: '1280x720'
					}),
					{ status: 200 }
				)
			);
			const result = await provider.generateVideo('key', {
				prompt: 'test',
				model: 'sora-2'
			});
			expect(result.status).toBe('complete');
			expect(result.videoUrl).toContain('vid-1');
			expect(result.duration).toBe(8);
		});

		it('should handle queued status in response', async () => {
			const provider = new OpenAIVideoProvider();
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'vid-2',
						object: 'video',
						status: 'queued',
						model: 'sora-2',
						progress: 0,
						seconds: '8',
						size: '1280x720'
					}),
					{ status: 200 }
				)
			);
			const result = await provider.generateVideo('key', {
				prompt: 'test',
				model: 'sora-2'
			});
			expect(result.status).toBe('queued');
			expect(result.providerJobId).toBe('vid-2');
		});

		it('should handle in_progress status in response', async () => {
			const provider = new OpenAIVideoProvider();
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'vid-3',
						object: 'video',
						status: 'in_progress',
						model: 'sora-2',
						progress: 50,
						seconds: '8',
						size: '1280x720'
					}),
					{ status: 200 }
				)
			);
			const result = await provider.generateVideo('key', {
				prompt: 'test',
				model: 'sora-2'
			});
			expect(result.status).toBe('processing');
		});

		it('should handle fetch error (network failure)', async () => {
			const provider = new OpenAIVideoProvider();
			vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));
			const result = await provider.generateVideo('key', {
				prompt: 'test',
				model: 'sora-2'
			});
			expect(result.status).toBe('error');
			expect(result.error).toBe('Network error');
		});

		it('should handle non-Error throw in catch', async () => {
			const provider = new OpenAIVideoProvider();
			vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce('string error');
			const result = await provider.generateVideo('key', {
				prompt: 'test',
				model: 'sora-2'
			});
			expect(result.status).toBe('error');
			expect(result.error).toBe('Failed to start video generation');
		});

		it('should handle undefined duration with NaN seconds', async () => {
			const provider = new OpenAIVideoProvider();
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'vid-4',
						object: 'video',
						status: 'completed',
						model: 'sora-2',
						progress: 100,
						seconds: 'invalid',
						size: '1280x720'
					}),
					{ status: 200 }
				)
			);
			const result = await provider.generateVideo('key', {
				prompt: 'test',
				model: 'sora-2'
			});
			expect(result.status).toBe('complete');
			expect(result.duration).toBeUndefined();
		});
	});

	describe('getStatus', () => {
		it('should handle failed status', async () => {
			const provider = new OpenAIVideoProvider();
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'vid-1',
						status: 'failed',
						model: 'sora-2',
						progress: 0,
						seconds: '8',
						size: '1280x720'
					}),
					{ status: 200 }
				)
			);
			const result = await provider.getStatus('key', 'vid-1');
			expect(result.status).toBe('error');
			expect(result.error).toBe('Video generation failed');
		});

		it('should handle queued status', async () => {
			const provider = new OpenAIVideoProvider();
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'vid-1',
						status: 'queued',
						model: 'sora-2',
						progress: 0,
						seconds: '8',
						size: '1280x720'
					}),
					{ status: 200 }
				)
			);
			const result = await provider.getStatus('key', 'vid-1');
			expect(result.status).toBe('queued');
			expect(result.progress).toBe(0);
		});

		it('should handle in_progress status with progress', async () => {
			const provider = new OpenAIVideoProvider();
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'vid-1',
						status: 'in_progress',
						model: 'sora-2',
						progress: 75,
						seconds: '8',
						size: '1280x720'
					}),
					{ status: 200 }
				)
			);
			const result = await provider.getStatus('key', 'vid-1');
			expect(result.status).toBe('processing');
			expect(result.progress).toBe(75);
		});

		it('should handle null progress with nullish coalescing', async () => {
			const provider = new OpenAIVideoProvider();
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'vid-1',
						status: 'in_progress',
						model: 'sora-2',
						seconds: '8',
						size: '1280x720'
					}),
					{ status: 200 }
				)
			);
			const result = await provider.getStatus('key', 'vid-1');
			expect(result.progress).toBe(0);
		});

		it('should handle completed status', async () => {
			const provider = new OpenAIVideoProvider();
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'vid-1',
						status: 'completed',
						model: 'sora-2',
						progress: 100,
						seconds: '10',
						size: '1280x720'
					}),
					{ status: 200 }
				)
			);
			const result = await provider.getStatus('key', 'vid-1');
			expect(result.status).toBe('complete');
			expect(result.progress).toBe(100);
			expect(result.duration).toBe(10);
		});

		it('should handle error response from API', async () => {
			const provider = new OpenAIVideoProvider();
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 })
			);
			const result = await provider.getStatus('key', 'vid-1');
			expect(result.status).toBe('error');
			expect(result.error).toContain('Not found');
		});

		it('should handle error response with no parseable body', async () => {
			const provider = new OpenAIVideoProvider();
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response('bad response', { status: 500 })
			);
			const result = await provider.getStatus('key', 'vid-1');
			expect(result.status).toBe('error');
			expect(result.error).toContain('500');
		});

		it('should handle fetch error in getStatus', async () => {
			const provider = new OpenAIVideoProvider();
			vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Timeout'));
			const result = await provider.getStatus('key', 'vid-1');
			expect(result.status).toBe('error');
			expect(result.error).toBe('Timeout');
		});

		it('should handle non-Error throw in getStatus catch', async () => {
			const provider = new OpenAIVideoProvider();
			vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(42);
			const result = await provider.getStatus('key', 'vid-1');
			expect(result.status).toBe('error');
			expect(result.error).toBe('Failed to check video status');
		});
	});

	describe('mapAspectRatioAndResolution', () => {
		it('should use validSizes for known model+ratio+res combo', async () => {
			const provider = new OpenAIVideoProvider();
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'vid-1',
						status: 'queued',
						model: 'sora-2',
						progress: 0,
						seconds: '8',
						size: '1280x720'
					}),
					{ status: 200 }
				)
			);
			await provider.generateVideo('key', {
				prompt: 'test',
				model: 'sora-2',
				aspectRatio: '16:9',
				resolution: '720p'
			});
			const fetchCall = vi.mocked(fetch).mock.calls[0];
			const body = JSON.parse(fetchCall[1]!.body as string);
			expect(body.size).toBe('1280x720');
		});

		it('should fall back to first valid size for unmatched resolution', async () => {
			const provider = new OpenAIVideoProvider();
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'vid-1',
						status: 'queued',
						model: 'sora-2',
						progress: 0,
						seconds: '8',
						size: '1280x720'
					}),
					{ status: 200 }
				)
			);
			await provider.generateVideo('key', {
				prompt: 'test',
				model: 'sora-2',
				aspectRatio: '16:9',
				resolution: '4k'
			});
			const fetchCall = vi.mocked(fetch).mock.calls[0];
			const body = JSON.parse(fetchCall[1]!.body as string);
			// Should fall back to first valid size for 16:9
			expect(body.size).toBe('1280x720');
		});

		it('should fall back to fallback table for unknown model', async () => {
			const provider = new OpenAIVideoProvider();
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'vid-1',
						status: 'queued',
						model: 'unknown-model',
						progress: 0,
						seconds: '8',
						size: '1280x720'
					}),
					{ status: 200 }
				)
			);
			await provider.generateVideo('key', {
				prompt: 'test',
				model: 'unknown-model',
				aspectRatio: '9:16',
				resolution: '1080p'
			});
			const fetchCall = vi.mocked(fetch).mock.calls[0];
			const body = JSON.parse(fetchCall[1]!.body as string);
			expect(body.size).toBe('1024x1792');
		});

		it('should use 720p default for fallback with 9:16', async () => {
			const provider = new OpenAIVideoProvider();
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'vid-1',
						status: 'queued',
						progress: 0,
						seconds: '8',
						size: '720x1280',
						model: 'unknown-model'
					}),
					{ status: 200 }
				)
			);
			await provider.generateVideo('key', {
				prompt: 'test',
				model: 'unknown-model',
				aspectRatio: '9:16'
			});
			const fetchCall = vi.mocked(fetch).mock.calls[0];
			const body = JSON.parse(fetchCall[1]!.body as string);
			expect(body.size).toBe('720x1280');
		});

		it('should use default 16:9 for fallback with 1080p and unrecognized aspect ratio', async () => {
			const provider = new OpenAIVideoProvider();
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'vid-1',
						status: 'queued',
						progress: 0,
						seconds: '8',
						size: '1792x1024',
						model: 'unknown-model'
					}),
					{ status: 200 }
				)
			);
			await provider.generateVideo('key', {
				prompt: 'test',
				model: 'unknown-model',
				aspectRatio: '4:3',
				resolution: '1080p'
			});
			const fetchCall = vi.mocked(fetch).mock.calls[0];
			const body = JSON.parse(fetchCall[1]!.body as string);
			// Default case for 1080p with unrecognized ratio
			expect(body.size).toBe('1792x1024');
		});

		it('should use default 16:9 for fallback 720p with unrecognized aspect ratio', async () => {
			const provider = new OpenAIVideoProvider();
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'vid-1',
						status: 'queued',
						progress: 0,
						seconds: '8',
						size: '1280x720',
						model: 'unknown-model'
					}),
					{ status: 200 }
				)
			);
			await provider.generateVideo('key', {
				prompt: 'test',
				model: 'unknown-model',
				aspectRatio: '4:3'
			});
			const fetchCall = vi.mocked(fetch).mock.calls[0];
			const body = JSON.parse(fetchCall[1]!.body as string);
			// Default case for 720p with unrecognized ratio
			expect(body.size).toBe('1280x720');
		});

		it('should default aspectRatio and resolution when not provided for known model', async () => {
			const provider = new OpenAIVideoProvider();
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						id: 'vid-1',
						status: 'queued',
						progress: 0,
						seconds: '8',
						size: '1280x720',
						model: 'sora-2'
					}),
					{ status: 200 }
				)
			);
			await provider.generateVideo('key', {
				prompt: 'test',
				model: 'sora-2'
				// no aspectRatio or resolution
			});
			const fetchCall = vi.mocked(fetch).mock.calls[0];
			const body = JSON.parse(fetchCall[1]!.body as string);
			expect(body.size).toBe('1280x720'); // default 16:9 + 720p
		});
	});

	describe('downloadVideo', () => {
		it('should download video successfully', async () => {
			const provider = new OpenAIVideoProvider();
			const mockBuffer = new ArrayBuffer(8);
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
				new Response(mockBuffer, { status: 200 })
			);
			const result = await provider.downloadVideo('key', 'https://example.com/video.mp4');
			expect(result.byteLength).toBe(8);
		});

		it('should throw on download failure', async () => {
			const provider = new OpenAIVideoProvider();
			vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 404 }));
			await expect(provider.downloadVideo('key', 'https://example.com/video.mp4')).rejects.toThrow(
				'Failed to download video: 404'
			);
		});
	});

	describe('getAvailableModels', () => {
		it('should return OPENAI_VIDEO_MODELS', () => {
			const provider = new OpenAIVideoProvider();
			const models = provider.getAvailableModels();
			expect(models.length).toBeGreaterThanOrEqual(2);
			expect(models.find((m: any) => m.id === 'sora-2')).toBeDefined();
		});
	});
});
