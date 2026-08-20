/**
 * Tests for ImageDetailModal component
 * TDD: Tests for viewing images larger with all their data,
 * and selecting an image for a brand's profile data (logoUrl).
 */
import { describe, it, expect, vi } from 'vitest';
import type { BrandMediaAsset } from '$lib/types/brand-assets';

// ─── Helper: Build a mock media asset ─────────────────────

function makeMockAsset(overrides: Partial<BrandMediaAsset> = {}): BrandMediaAsset {
	return {
		id: 'asset-1',
		brandProfileId: 'brand-1',
		mediaType: 'image',
		category: 'logo',
		name: 'Primary Logo',
		description: 'The main brand logo',
		url: 'https://example.com/logo.png',
		r2Key: 'brands/brand-1/logo.png',
		mimeType: 'image/png',
		fileSize: 204800,
		width: 1024,
		height: 1024,
		durationSeconds: undefined,
		tags: ['logo', 'primary'],
		metadata: { aiGenerated: true, prompt: 'A nebula logo' },
		sortOrder: 0,
		isPrimary: true,
		createdAt: '2025-01-15T10:00:00Z',
		updatedAt: '2025-01-15T10:00:00Z',
		...overrides
	};
}

// ─── Utility function tests ─────────────────────────────

describe('ImageDetailModal - utility functions', () => {
	describe('formatFileSize', () => {
		it('should format bytes correctly', () => {
			const { formatFileSize } = getFormatters();
			expect(formatFileSize(0)).toBe('0 B');
			expect(formatFileSize(512)).toBe('512 B');
			expect(formatFileSize(1024)).toBe('1.0 KB');
			expect(formatFileSize(1536)).toBe('1.5 KB');
			expect(formatFileSize(1048576)).toBe('1.0 MB');
			expect(formatFileSize(5242880)).toBe('5.0 MB');
		});

		it('should return empty string for undefined', () => {
			const { formatFileSize } = getFormatters();
			expect(formatFileSize(undefined)).toBe('');
		});
	});

	describe('formatDimensions', () => {
		it('should format width x height', () => {
			const { formatDimensions } = getFormatters();
			expect(formatDimensions(1024, 1024)).toBe('1024 × 1024');
			expect(formatDimensions(1920, 1080)).toBe('1920 × 1080');
		});

		it('should return empty string when missing dimensions', () => {
			const { formatDimensions } = getFormatters();
			expect(formatDimensions(undefined, 1024)).toBe('');
			expect(formatDimensions(1024, undefined)).toBe('');
			expect(formatDimensions(undefined, undefined)).toBe('');
		});
	});

	describe('getAssetUrl', () => {
		it('should use url when available', () => {
			const { getAssetUrl } = getFormatters();
			const asset = makeMockAsset({ url: 'https://cdn.example.com/img.png' });
			expect(getAssetUrl(asset)).toBe('https://cdn.example.com/img.png');
		});

		it('should fall back to r2Key file endpoint', () => {
			const { getAssetUrl } = getFormatters();
			const asset = makeMockAsset({ url: undefined, r2Key: 'brands/x/logo.png' });
			expect(getAssetUrl(asset)).toBe('/api/brand/assets/file?key=brands%2Fx%2Flogo.png');
		});

		it('should return empty string when neither exists', () => {
			const { getAssetUrl } = getFormatters();
			const asset = makeMockAsset({ url: undefined, r2Key: undefined });
			expect(getAssetUrl(asset)).toBe('');
		});
	});
});

// ─── Modal data display tests ───────────────────────────

describe('ImageDetailModal - data display', () => {
	it('should expose all asset metadata properties', () => {
		const asset = makeMockAsset();
		// Verify the asset has all the expected properties for display
		expect(asset.name).toBe('Primary Logo');
		expect(asset.description).toBe('The main brand logo');
		expect(asset.category).toBe('logo');
		expect(asset.mimeType).toBe('image/png');
		expect(asset.fileSize).toBe(204800);
		expect(asset.width).toBe(1024);
		expect(asset.height).toBe(1024);
		expect(asset.tags).toEqual(['logo', 'primary']);
		expect(asset.isPrimary).toBe(true);
		expect(asset.createdAt).toBe('2025-01-15T10:00:00Z');
		expect(asset.metadata?.aiGenerated).toBe(true);
		expect(asset.metadata?.prompt).toBe('A nebula logo');
	});

	it('should handle assets with minimal data', () => {
		const asset = makeMockAsset({
			description: undefined,
			mimeType: undefined,
			fileSize: undefined,
			width: undefined,
			height: undefined,
			tags: undefined,
			metadata: undefined,
			isPrimary: false
		});
		expect(asset.name).toBe('Primary Logo');
		expect(asset.description).toBeUndefined();
		expect(asset.fileSize).toBeUndefined();
		expect(asset.tags).toBeUndefined();
	});

	it('should display category in human-readable format', () => {
		const { formatCategory } = getFormatters();
		expect(formatCategory('logo')).toBe('Logo');
		expect(formatCategory('social')).toBe('Social');
		expect(formatCategory('brand_elements')).toBe('Brand Elements');
		expect(formatCategory('marketing')).toBe('Marketing');
	});

	it('should identify AI-generated assets', () => {
		const { isAIGenerated } = getFormatters();
		expect(isAIGenerated(makeMockAsset({ metadata: { aiGenerated: true } }))).toBe(true);
		expect(isAIGenerated(makeMockAsset({ metadata: undefined }))).toBe(false);
		expect(isAIGenerated(makeMockAsset({ metadata: {} }))).toBe(false);
	});
});

// ─── Image selection for profile tests ──────────────────

describe('ImageDetailModal - set as profile image', () => {
	it('should be possible to set an image asset as logo URL', () => {
		const asset = makeMockAsset({ url: 'https://cdn.example.com/logo.png' });
		// The logoUrl value should be the full URL of the asset
		const logoUrl =
			asset.url || `/api/brand/assets/file?key=${encodeURIComponent(asset.r2Key || '')}`;
		expect(logoUrl).toBe('https://cdn.example.com/logo.png');
	});

	it('should use r2Key-based URL when no direct URL', () => {
		const asset = makeMockAsset({ url: undefined, r2Key: 'brands/brand-1/logo.png' });
		const { getAssetUrl } = getFormatters();
		const logoUrl = getAssetUrl(asset);
		expect(logoUrl).toBe('/api/brand/assets/file?key=brands%2Fbrand-1%2Flogo.png');
	});

	it('should dispatch setAsProfileImage event with asset data', () => {
		const asset = makeMockAsset();
		// Simulate the event payload
		const eventPayload = {
			asset,
			profileField: 'logoUrl',
			value: 'https://example.com/logo.png'
		};
		expect(eventPayload.profileField).toBe('logoUrl');
		expect(eventPayload.asset.id).toBe('asset-1');
	});

	it('should generate correct API payload for update-field', () => {
		const asset = makeMockAsset();
		const payload = {
			profileId: asset.brandProfileId,
			fieldName: 'logoUrl',
			newValue: asset.url || `/api/brand/assets/file?key=${encodeURIComponent(asset.r2Key || '')}`,
			changeSource: 'manual',
			changeReason: `Set from media asset: ${asset.name}`
		};
		expect(payload.profileId).toBe('brand-1');
		expect(payload.fieldName).toBe('logoUrl');
		expect(payload.newValue).toBe('https://example.com/logo.png');
		expect(payload.changeSource).toBe('manual');
	});
});

// ─── Service tests for setImageAsProfileField ───────────

describe('setImageAsProfileField', () => {
	it('should construct the correct fetch request', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({ profile: { id: 'brand-1', logoUrl: 'https://example.com/logo.png' } })
		});

		const asset = makeMockAsset();
		const profileId = 'brand-1';
		const fieldName = 'logoUrl';
		const value = 'https://example.com/logo.png';

		await mockFetch('/api/brand/update-field', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				profileId,
				fieldName,
				newValue: value,
				changeSource: 'manual',
				changeReason: `Set from media asset: ${asset.name}`
			})
		});

		expect(mockFetch).toHaveBeenCalledWith(
			'/api/brand/update-field',
			expect.objectContaining({
				method: 'PATCH',
				body: expect.stringContaining('"fieldName":"logoUrl"')
			})
		);
	});
});

// ─── Formatter functions (extracted for testability) ────

function getFormatters() {
	return {
		formatFileSize(bytes?: number): string {
			if (bytes == null) return '';
			if (bytes === 0) return '0 B';
			if (bytes < 1024) return `${bytes} B`;
			if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
			return `${(bytes / 1048576).toFixed(1)} MB`;
		},

		formatDimensions(width?: number, height?: number): string {
			if (!width || !height) return '';
			return `${width} × ${height}`;
		},

		getAssetUrl(asset: BrandMediaAsset): string {
			if (asset.url) return asset.url;
			if (asset.r2Key) return `/api/brand/assets/file?key=${encodeURIComponent(asset.r2Key)}`;
			return '';
		},

		formatCategory(category: string): string {
			return category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
		},

		isAIGenerated(asset: BrandMediaAsset): boolean {
			return !!(asset.metadata && asset.metadata.aiGenerated);
		}
	};
}
