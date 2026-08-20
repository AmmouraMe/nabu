/**
 * Tests for Brand Asset Service (text, image, audio, video assets)
 * TDD: Tests written first, then implementation
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	createBrandText,
	getBrandTexts,
	getBrandTextsByCategory,
	updateBrandText,
	deleteBrandText,
	createBrandMedia,
	getBrandMedia,
	getBrandMediaByType,
	getBrandMediaByCategory,
	getPrimaryMediaForCategory,
	updateBrandMedia,
	deleteBrandMedia,
	createMediaVariant,
	getMediaVariants,
	deleteMediaVariant,
	getLogoAssets,
	getBrandAssetSummary,
	TEXT_CATEGORIES,
	IMAGE_CATEGORIES,
	AUDIO_CATEGORIES,
	VIDEO_CATEGORIES,
	type BrandText,
	type BrandMediaAsset,
	type BrandMediaVariant,
	type BrandAssetSummary
} from '$lib/services/brand-assets';

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

describe('Brand Asset Service', () => {
	let mockDB: ReturnType<typeof createMockDB>;

	beforeEach(() => {
		mockDB = createMockDB();
		vi.clearAllMocks();
	});

	// ─── Category Constants ──────────────────────────────────

	describe('Category Constants', () => {
		it('should define text categories', () => {
			expect(TEXT_CATEGORIES).toBeDefined();
			expect(TEXT_CATEGORIES).toContain('names');
			expect(TEXT_CATEGORIES).toContain('messaging');
			expect(TEXT_CATEGORIES).toContain('descriptions');
			expect(TEXT_CATEGORIES).toContain('legal');
			expect(TEXT_CATEGORIES).toContain('social');
			expect(TEXT_CATEGORIES).toContain('voice');
		});

		it('should define image categories', () => {
			expect(IMAGE_CATEGORIES).toBeDefined();
			expect(IMAGE_CATEGORIES).toContain('logo');
			expect(IMAGE_CATEGORIES).toContain('social');
			expect(IMAGE_CATEGORIES).toContain('marketing');
			expect(IMAGE_CATEGORIES).toContain('product');
			expect(IMAGE_CATEGORIES).toContain('brand_elements');
			expect(IMAGE_CATEGORIES).toContain('team');
		});

		it('should define audio categories', () => {
			expect(AUDIO_CATEGORIES).toBeDefined();
			expect(AUDIO_CATEGORIES).toContain('sonic_identity');
			expect(AUDIO_CATEGORIES).toContain('music');
			expect(AUDIO_CATEGORIES).toContain('voiceover');
		});

		it('should define video categories', () => {
			expect(VIDEO_CATEGORIES).toBeDefined();
			expect(VIDEO_CATEGORIES).toContain('brand');
			expect(VIDEO_CATEGORIES).toContain('social');
			expect(VIDEO_CATEGORIES).toContain('marketing');
			expect(VIDEO_CATEGORIES).toContain('content');
			expect(VIDEO_CATEGORIES).toContain('internal');
		});
	});

	// ─── Brand Text Assets ──────────────────────────────────

	describe('createBrandText', () => {
		it('should insert a text asset record', async () => {
			const result = await createBrandText(mockDB as any, {
				brandProfileId: 'brand-1',
				category: 'names',
				key: 'primary_name',
				label: 'Primary Brand Name',
				value: 'Acme Corp'
			});

			expect(result).toBeDefined();
			expect(result.brandProfileId).toBe('brand-1');
			expect(result.category).toBe('names');
			expect(result.key).toBe('primary_name');
			expect(result.value).toBe('Acme Corp');
			expect(mockDB.prepare).toHaveBeenCalled();
		});

		it('should support language parameter', async () => {
			const result = await createBrandText(mockDB as any, {
				brandProfileId: 'brand-1',
				category: 'messaging',
				key: 'tagline',
				label: 'Tagline',
				value: 'Innovación sin límites',
				language: 'es'
			});

			expect(result.language).toBe('es');
		});

		it('should default language to en', async () => {
			const result = await createBrandText(mockDB as any, {
				brandProfileId: 'brand-1',
				category: 'names',
				key: 'primary_name',
				label: 'Primary Brand Name',
				value: 'Acme Corp'
			});

			expect(result.language).toBe('en');
		});
	});

	describe('getBrandTexts', () => {
		it('should return all text assets for a brand', async () => {
			mockDB._mockAll.mockResolvedValueOnce({
				results: [
					{
						id: 't1',
						brand_profile_id: 'brand-1',
						category: 'names',
						key: 'primary_name',
						label: 'Primary Brand Name',
						value: 'Acme Corp',
						language: 'en',
						sort_order: 0,
						metadata: null,
						created_at: '2025-01-01T00:00:00Z',
						updated_at: '2025-01-01T00:00:00Z'
					}
				]
			});

			const texts = await getBrandTexts(mockDB as any, 'brand-1');
			expect(texts).toHaveLength(1);
			expect(texts[0].key).toBe('primary_name');
			expect(texts[0].value).toBe('Acme Corp');
		});

		it('should return empty array when no texts exist', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });
			const texts = await getBrandTexts(mockDB as any, 'brand-1');
			expect(texts).toEqual([]);
		});
	});

	describe('getBrandTextsByCategory', () => {
		it('should filter text assets by category', async () => {
			mockDB._mockAll.mockResolvedValueOnce({
				results: [
					{
						id: 't1',
						brand_profile_id: 'brand-1',
						category: 'messaging',
						key: 'tagline',
						label: 'Tagline',
						value: 'Think Different',
						language: 'en',
						sort_order: 0,
						metadata: null,
						created_at: '2025-01-01T00:00:00Z',
						updated_at: '2025-01-01T00:00:00Z'
					}
				]
			});

			const texts = await getBrandTextsByCategory(mockDB as any, 'brand-1', 'messaging');
			expect(texts).toHaveLength(1);
			expect(texts[0].category).toBe('messaging');
		});
	});

	describe('updateBrandText', () => {
		it('should update a text asset', async () => {
			await updateBrandText(mockDB as any, 't1', {
				value: 'Updated tagline',
				label: 'Updated Label'
			});

			expect(mockDB.prepare).toHaveBeenCalled();
		});
	});

	describe('deleteBrandText', () => {
		it('should delete a text asset', async () => {
			await deleteBrandText(mockDB as any, 't1');
			expect(mockDB.prepare).toHaveBeenCalled();
		});
	});

	// ─── Brand Media Assets ──────────────────────────────────

	describe('createBrandMedia', () => {
		it('should insert a media asset record', async () => {
			const result = await createBrandMedia(mockDB as any, {
				brandProfileId: 'brand-1',
				mediaType: 'image',
				category: 'logo',
				name: 'Primary Logo',
				url: 'https://r2.example.com/logos/primary.svg',
				r2Key: 'brands/brand-1/logos/primary.svg',
				mimeType: 'image/svg+xml',
				fileSize: 4096,
				width: 512,
				height: 512
			});

			expect(result).toBeDefined();
			expect(result.brandProfileId).toBe('brand-1');
			expect(result.mediaType).toBe('image');
			expect(result.category).toBe('logo');
			expect(result.name).toBe('Primary Logo');
			expect(result.isPrimary).toBe(false);
			expect(mockDB.prepare).toHaveBeenCalled();
		});

		it('should support isPrimary flag', async () => {
			const result = await createBrandMedia(mockDB as any, {
				brandProfileId: 'brand-1',
				mediaType: 'image',
				category: 'logo',
				name: 'Primary Logo',
				isPrimary: true
			});

			expect(result.isPrimary).toBe(true);
		});

		it('should accept audio media type', async () => {
			const result = await createBrandMedia(mockDB as any, {
				brandProfileId: 'brand-1',
				mediaType: 'audio',
				category: 'sonic_identity',
				name: 'Audio Logo',
				durationSeconds: 3.5,
				mimeType: 'audio/mpeg'
			});

			expect(result.mediaType).toBe('audio');
			expect(result.durationSeconds).toBe(3.5);
		});

		it('should accept video media type', async () => {
			const result = await createBrandMedia(mockDB as any, {
				brandProfileId: 'brand-1',
				mediaType: 'video',
				category: 'brand',
				name: 'Brand Manifesto',
				width: 1920,
				height: 1080,
				durationSeconds: 120
			});

			expect(result.mediaType).toBe('video');
			expect(result.width).toBe(1920);
			expect(result.height).toBe(1080);
		});
	});

	describe('getBrandMedia', () => {
		it('should return all media assets for a brand', async () => {
			mockDB._mockAll.mockResolvedValueOnce({
				results: [
					{
						id: 'm1',
						brand_profile_id: 'brand-1',
						media_type: 'image',
						category: 'logo',
						name: 'Primary Logo',
						description: null,
						url: 'https://r2.example.com/logo.svg',
						r2_key: 'brands/brand-1/logo.svg',
						mime_type: 'image/svg+xml',
						file_size: 4096,
						width: 512,
						height: 512,
						duration_seconds: null,
						tags: null,
						metadata: null,
						sort_order: 0,
						is_primary: 1,
						created_at: '2025-01-01T00:00:00Z',
						updated_at: '2025-01-01T00:00:00Z'
					}
				]
			});

			const media = await getBrandMedia(mockDB as any, 'brand-1');
			expect(media).toHaveLength(1);
			expect(media[0].name).toBe('Primary Logo');
			expect(media[0].isPrimary).toBe(true);
			expect(media[0].mediaType).toBe('image');
		});
	});

	describe('getBrandMediaByType', () => {
		it('should filter media by type', async () => {
			mockDB._mockAll.mockResolvedValueOnce({
				results: [
					{
						id: 'm1',
						brand_profile_id: 'brand-1',
						media_type: 'audio',
						category: 'music',
						name: 'Brand Jingle',
						description: null,
						url: null,
						r2_key: null,
						mime_type: 'audio/mpeg',
						file_size: 1024000,
						width: null,
						height: null,
						duration_seconds: 15.5,
						tags: null,
						metadata: null,
						sort_order: 0,
						is_primary: 0,
						created_at: '2025-01-01T00:00:00Z',
						updated_at: '2025-01-01T00:00:00Z'
					}
				]
			});

			const media = await getBrandMediaByType(mockDB as any, 'brand-1', 'audio');
			expect(media).toHaveLength(1);
			expect(media[0].mediaType).toBe('audio');
		});
	});

	describe('getBrandMediaByCategory', () => {
		it('should filter media by type and category', async () => {
			mockDB._mockAll.mockResolvedValueOnce({
				results: [
					{
						id: 'm1',
						brand_profile_id: 'brand-1',
						media_type: 'image',
						category: 'logo',
						name: 'Logo',
						description: null,
						url: null,
						r2_key: null,
						mime_type: null,
						file_size: null,
						width: null,
						height: null,
						duration_seconds: null,
						tags: null,
						metadata: null,
						sort_order: 0,
						is_primary: 1,
						created_at: '2025-01-01T00:00:00Z',
						updated_at: '2025-01-01T00:00:00Z'
					}
				]
			});

			const media = await getBrandMediaByCategory(mockDB as any, 'brand-1', 'image', 'logo');
			expect(media).toHaveLength(1);
			expect(media[0].category).toBe('logo');
		});
	});

	describe('getPrimaryMediaForCategory', () => {
		it('should return the primary media asset for a category', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({
				id: 'm1',
				brand_profile_id: 'brand-1',
				media_type: 'image',
				category: 'logo',
				name: 'Primary Logo',
				description: null,
				url: 'https://r2.example.com/logo.svg',
				r2_key: null,
				mime_type: 'image/svg+xml',
				file_size: 4096,
				width: 512,
				height: 512,
				duration_seconds: null,
				tags: null,
				metadata: null,
				sort_order: 0,
				is_primary: 1,
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			});

			const primary = await getPrimaryMediaForCategory(mockDB as any, 'brand-1', 'image', 'logo');
			expect(primary).not.toBeNull();
			expect(primary!.isPrimary).toBe(true);
			expect(primary!.name).toBe('Primary Logo');
		});

		it('should return null when no primary exists', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);
			const primary = await getPrimaryMediaForCategory(mockDB as any, 'brand-1', 'image', 'logo');
			expect(primary).toBeNull();
		});
	});

	describe('updateBrandMedia', () => {
		it('should update a media asset', async () => {
			await updateBrandMedia(mockDB as any, 'm1', {
				name: 'Updated Logo',
				description: 'Redesigned for 2025'
			});

			expect(mockDB.prepare).toHaveBeenCalled();
		});
	});

	describe('deleteBrandMedia', () => {
		it('should delete a media asset and its variants', async () => {
			await deleteBrandMedia(mockDB as any, 'm1');
			// Should delete variants first, then the media asset
			expect(mockDB.prepare).toHaveBeenCalledTimes(2);
		});
	});

	// ─── Media Variants ──────────────────────────────────────

	describe('createMediaVariant', () => {
		it('should insert a variant for a media asset', async () => {
			const result = await createMediaVariant(mockDB as any, {
				brandMediaId: 'm1',
				variantType: 'size',
				label: '64x64',
				url: 'https://r2.example.com/logo-64.png',
				r2Key: 'brands/brand-1/logos/logo-64.png',
				mimeType: 'image/png',
				fileSize: 2048,
				width: 64,
				height: 64
			});

			expect(result).toBeDefined();
			expect(result.brandMediaId).toBe('m1');
			expect(result.variantType).toBe('size');
			expect(result.label).toBe('64x64');
			expect(result.width).toBe(64);
			expect(result.height).toBe(64);
		});

		it('should support color_mode variant type', async () => {
			const result = await createMediaVariant(mockDB as any, {
				brandMediaId: 'm1',
				variantType: 'color_mode',
				label: 'monochrome',
				url: 'https://r2.example.com/logo-mono.svg'
			});

			expect(result.variantType).toBe('color_mode');
			expect(result.label).toBe('monochrome');
		});

		it('should support background variant type', async () => {
			const result = await createMediaVariant(mockDB as any, {
				brandMediaId: 'm1',
				variantType: 'background',
				label: 'dark_bg'
			});

			expect(result.variantType).toBe('background');
			expect(result.label).toBe('dark_bg');
		});
	});

	describe('getMediaVariants', () => {
		it('should return all variants for a media asset', async () => {
			mockDB._mockAll.mockResolvedValueOnce({
				results: [
					{
						id: 'v1',
						brand_media_id: 'm1',
						variant_type: 'size',
						label: '16x16',
						url: 'https://r2.example.com/logo-16.png',
						r2_key: null,
						mime_type: 'image/png',
						file_size: 512,
						width: 16,
						height: 16,
						metadata: null,
						created_at: '2025-01-01T00:00:00Z'
					},
					{
						id: 'v2',
						brand_media_id: 'm1',
						variant_type: 'size',
						label: '512x512',
						url: 'https://r2.example.com/logo-512.png',
						r2_key: null,
						mime_type: 'image/png',
						file_size: 32768,
						width: 512,
						height: 512,
						metadata: null,
						created_at: '2025-01-01T00:00:00Z'
					}
				]
			});

			const variants = await getMediaVariants(mockDB as any, 'm1');
			expect(variants).toHaveLength(2);
			expect(variants[0].label).toBe('16x16');
			expect(variants[1].label).toBe('512x512');
		});
	});

	describe('deleteMediaVariant', () => {
		it('should delete a specific variant', async () => {
			await deleteMediaVariant(mockDB as any, 'v1');
			expect(mockDB.prepare).toHaveBeenCalled();
		});
	});

	// ─── Logo Convenience ──────────────────────────────────────

	describe('getLogoAssets', () => {
		it('should return logo images with their variants', async () => {
			// First call: get logo media assets
			mockDB._mockAll.mockResolvedValueOnce({
				results: [
					{
						id: 'logo-1',
						brand_profile_id: 'brand-1',
						media_type: 'image',
						category: 'logo',
						name: 'Primary Logo',
						description: 'Full color logo',
						url: 'https://r2.example.com/logo.svg',
						r2_key: 'brands/brand-1/logo.svg',
						mime_type: 'image/svg+xml',
						file_size: 8192,
						width: 1024,
						height: 1024,
						duration_seconds: null,
						tags: '["primary","full-color"]',
						metadata: null,
						sort_order: 0,
						is_primary: 1,
						created_at: '2025-01-01T00:00:00Z',
						updated_at: '2025-01-01T00:00:00Z'
					}
				]
			});

			// Second call: get variants for logo-1
			mockDB._mockAll.mockResolvedValueOnce({
				results: [
					{
						id: 'v1',
						brand_media_id: 'logo-1',
						variant_type: 'size',
						label: '16x16',
						url: 'https://r2.example.com/logo-16.png',
						r2_key: null,
						mime_type: 'image/png',
						file_size: 512,
						width: 16,
						height: 16,
						metadata: null,
						created_at: '2025-01-01T00:00:00Z'
					}
				]
			});

			const logos = await getLogoAssets(mockDB as any, 'brand-1');
			expect(logos).toHaveLength(1);
			expect(logos[0].asset.name).toBe('Primary Logo');
			expect(logos[0].variants).toHaveLength(1);
			expect(logos[0].variants[0].label).toBe('16x16');
		});
	});

	// ─── Brand Asset Summary ────────────────────────────────────

	describe('getBrandAssetSummary', () => {
		it('should return counts of all asset types', async () => {
			// Text count
			mockDB._mockFirst.mockResolvedValueOnce({ count: 5 });
			// Image count
			mockDB._mockFirst.mockResolvedValueOnce({ count: 8 });
			// Audio count
			mockDB._mockFirst.mockResolvedValueOnce({ count: 2 });
			// Video count
			mockDB._mockFirst.mockResolvedValueOnce({ count: 3 });
			// Video generations count
			mockDB._mockFirst.mockResolvedValueOnce({ count: 12 });

			const summary = await getBrandAssetSummary(mockDB as any, 'brand-1');

			expect(summary.textCount).toBe(5);
			expect(summary.imageCount).toBe(8);
			expect(summary.audioCount).toBe(2);
			expect(summary.videoCount).toBe(3);
			expect(summary.videoGenerationsCount).toBe(12);
			expect(summary.totalCount).toBe(18); // 5+8+2+3 (not generations)
		});

		it('should return zeros when no assets exist', async () => {
			mockDB._mockFirst.mockResolvedValue({ count: 0 });

			const summary = await getBrandAssetSummary(mockDB as any, 'brand-1');
			expect(summary.textCount).toBe(0);
			expect(summary.imageCount).toBe(0);
			expect(summary.audioCount).toBe(0);
			expect(summary.videoCount).toBe(0);
			expect(summary.totalCount).toBe(0);
		});
	});
});
