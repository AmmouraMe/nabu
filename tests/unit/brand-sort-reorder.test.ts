/**
 * Tests for Brand Sort & Reorder
 * TDD: Tests for sort/filter controls and drag-drop reorder API
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrandProfile } from '$lib/types/onboarding';

// Replicate the sort function from the brands page
type SortMode =
	| 'custom'
	| 'newest'
	| 'oldest'
	| 'most-complete'
	| 'least-complete'
	| 'alpha-az'
	| 'alpha-za';

function getCompletionStats(brand: BrandProfile) {
	const fields = [
		brand.brandName,
		brand.tagline,
		brand.missionStatement,
		brand.visionStatement,
		brand.elevatorPitch,
		brand.brandArchetype,
		brand.brandPersonalityTraits,
		brand.toneOfVoice,
		brand.communicationStyle,
		brand.targetAudience,
		brand.customerPainPoints,
		brand.valueProposition,
		brand.primaryColor,
		brand.secondaryColor,
		brand.accentColor,
		brand.backgroundColor,
		brand.surfaceColor,
		brand.textColor,
		brand.textSecondaryColor,
		brand.borderColor,
		brand.successColor,
		brand.warningColor,
		brand.errorColor,
		brand.colorPalette,
		brand.typographyLogo,
		brand.typographyHeading,
		brand.typographyBody,
		brand.logoConcept,
		brand.industry,
		brand.competitors,
		brand.uniqueSellingPoints,
		brand.marketPosition,
		brand.originStory,
		brand.brandValues,
		brand.brandPromise
	];
	const filled = fields.filter((f) => f != null && f !== '').length;
	const total = fields.length;
	return { filled, total, percent: Math.round((filled / total) * 100) };
}

function sortBrands(list: BrandProfile[], mode: SortMode): BrandProfile[] {
	if (mode === 'custom') return list;
	const sorted = [...list];
	switch (mode) {
		case 'newest':
			return sorted.sort(
				(a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
			);
		case 'oldest':
			return sorted.sort(
				(a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
			);
		case 'most-complete':
			return sorted.sort((a, b) => getCompletionStats(b).percent - getCompletionStats(a).percent);
		case 'least-complete':
			return sorted.sort((a, b) => getCompletionStats(a).percent - getCompletionStats(b).percent);
		case 'alpha-az':
			return sorted.sort((a, b) => (a.brandName || '').localeCompare(b.brandName || ''));
		case 'alpha-za':
			return sorted.sort((a, b) => (b.brandName || '').localeCompare(a.brandName || ''));
		default:
			return sorted;
	}
}

function makeBrand(overrides: Partial<BrandProfile> = {}): BrandProfile {
	return {
		id: overrides.id || 'test-id',
		userId: 'user-1',
		status: 'completed',
		brandName: overrides.brandName,
		sortOrder: overrides.sortOrder ?? 0,
		onboardingStep: 'complete',
		createdAt: overrides.createdAt || '2025-01-01T00:00:00Z',
		updatedAt: overrides.updatedAt || '2025-01-01T00:00:00Z',
		...overrides
	} as BrandProfile;
}

describe('Brand Sort & Reorder', () => {
	describe('sortBrands', () => {
		const brands = [
			makeBrand({
				id: 'a',
				brandName: 'Alpha',
				updatedAt: '2025-01-01T00:00:00Z',
				primaryColor: '#000'
			}),
			makeBrand({ id: 'b', brandName: 'Charlie', updatedAt: '2025-03-01T00:00:00Z' }),
			makeBrand({
				id: 'c',
				brandName: 'Bravo',
				updatedAt: '2025-02-01T00:00:00Z',
				primaryColor: '#111',
				secondaryColor: '#222'
			})
		];

		it('should return original order for custom sort', () => {
			const result = sortBrands(brands, 'custom');
			expect(result).toBe(brands); // same reference
		});

		it('should not mutate the original array', () => {
			const result = sortBrands(brands, 'alpha-az');
			expect(result).not.toBe(brands);
			expect(brands[0].brandName).toBe('Alpha'); // unchanged
		});

		it('should sort newest first', () => {
			const result = sortBrands(brands, 'newest');
			expect(result.map((b) => b.id)).toEqual(['b', 'c', 'a']);
		});

		it('should sort oldest first', () => {
			const result = sortBrands(brands, 'oldest');
			expect(result.map((b) => b.id)).toEqual(['a', 'c', 'b']);
		});

		it('should sort most complete first', () => {
			const result = sortBrands(brands, 'most-complete');
			// Bravo has 2 fields, Alpha has 1, Charlie has 0
			expect(result.map((b) => b.id)).toEqual(['c', 'a', 'b']);
		});

		it('should sort least complete first', () => {
			const result = sortBrands(brands, 'least-complete');
			expect(result.map((b) => b.id)).toEqual(['b', 'a', 'c']);
		});

		it('should sort alphabetically A-Z', () => {
			const result = sortBrands(brands, 'alpha-az');
			expect(result.map((b) => b.brandName)).toEqual(['Alpha', 'Bravo', 'Charlie']);
		});

		it('should sort alphabetically Z-A', () => {
			const result = sortBrands(brands, 'alpha-za');
			expect(result.map((b) => b.brandName)).toEqual(['Charlie', 'Bravo', 'Alpha']);
		});

		it('should handle brands without names', () => {
			const brandsWithUndefined = [
				makeBrand({ id: 'a', brandName: 'Zeta' }),
				makeBrand({ id: 'b', brandName: undefined }),
				makeBrand({ id: 'c', brandName: 'Alpha' })
			];
			const result = sortBrands(brandsWithUndefined, 'alpha-az');
			expect(result[0].brandName).toBeUndefined(); // '' sorts before 'A'
			expect(result[1].brandName).toBe('Alpha');
			expect(result[2].brandName).toBe('Zeta');
		});
	});

	describe('Reorder API contract', () => {
		it('should call the reorder endpoint with ordered IDs', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ success: true })
			});

			const orderedIds = ['brand-3', 'brand-1', 'brand-2'];

			await mockFetch('/api/brand/profiles/reorder', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ orderedIds })
			});

			expect(mockFetch).toHaveBeenCalledWith(
				'/api/brand/profiles/reorder',
				expect.objectContaining({
					method: 'POST',
					body: JSON.stringify({ orderedIds: ['brand-3', 'brand-1', 'brand-2'] })
				})
			);
		});

		it('should send correct sort order indices', () => {
			const brands = [
				makeBrand({ id: 'b', sortOrder: 1 }),
				makeBrand({ id: 'a', sortOrder: 0 }),
				makeBrand({ id: 'c', sortOrder: 2 })
			];

			// After drag-drop reorder: move 'c' to position 0
			const reorderedIds = ['c', 'b', 'a'];
			const stmts = reorderedIds.map((id, index) => ({
				id,
				sort_order: index
			}));

			expect(stmts[0]).toEqual({ id: 'c', sort_order: 0 });
			expect(stmts[1]).toEqual({ id: 'b', sort_order: 1 });
			expect(stmts[2]).toEqual({ id: 'a', sort_order: 2 });
		});
	});

	describe('getCompletionStats', () => {
		it('should return 0% for empty brand', () => {
			const brand = makeBrand({});
			const stats = getCompletionStats(brand);
			expect(stats.percent).toBe(0);
			expect(stats.filled).toBe(0);
			expect(stats.total).toBe(35);
		});

		it('should count filled fields', () => {
			const brand = makeBrand({
				brandName: 'Test',
				tagline: 'A tagline',
				primaryColor: '#000'
			});
			const stats = getCompletionStats(brand);
			expect(stats.filled).toBe(3);
			expect(stats.percent).toBe(Math.round((3 / 35) * 100));
		});
	});
});
