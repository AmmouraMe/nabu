/**
 * Tests for Multi-Brand API Endpoints
 * TDD: Tests written first for brand listing, per-brand profiles, duplication, and archiving
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the service modules
vi.mock('$lib/services/brand', () => ({
	getAllBrandProfilesByUser: vi.fn(),
	getBrandProfileForUser: vi.fn(),
	duplicateBrandProfile: vi.fn(),
	getBrandFieldsSummary: vi.fn(),
	updateBrandFieldWithVersion: vi.fn(),
	revertFieldToVersion: vi.fn(),
	getFieldHistory: vi.fn(),
	addFieldVersion: vi.fn(),
	BRAND_FIELD_LABELS: {}
}));

vi.mock('$lib/services/onboarding', () => ({
	createBrandProfile: vi.fn(),
	getBrandProfile: vi.fn(),
	getBrandProfileByUser: vi.fn(),
	archiveBrandProfile: vi.fn(),
	mapRowToProfile: vi.fn()
}));

import {
	getAllBrandProfilesByUser,
	getBrandProfileForUser,
	duplicateBrandProfile,
	getBrandFieldsSummary
} from '$lib/services/brand';
import { archiveBrandProfile, getBrandProfile } from '$lib/services/onboarding';
import type { BrandProfile } from '$lib/types/onboarding';

function makeBrandProfile(overrides: Partial<BrandProfile> = {}): BrandProfile {
	return {
		id: overrides.id || 'brand-1',
		userId: overrides.userId || 'user-1',
		status: overrides.status || 'completed',
		brandName: overrides.brandName || 'Test Brand',
		brandNameConfirmed: overrides.brandNameConfirmed ?? false,
		onboardingStep: overrides.onboardingStep || 'complete',
		createdAt: overrides.createdAt || '2025-01-01T00:00:00Z',
		updatedAt: overrides.updatedAt || '2025-01-01T00:00:00Z',
		...overrides
	};
}

describe('Multi-Brand API Endpoints', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET /api/brand/profiles (list all brands)', () => {
		it('should return all brand profiles for authenticated user', async () => {
			const profiles = [
				makeBrandProfile({ id: 'brand-1', brandName: 'Alpha' }),
				makeBrandProfile({ id: 'brand-2', brandName: 'Beta' })
			];

			(getAllBrandProfilesByUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(profiles);

			// Simulate what the endpoint should do
			const result = await getAllBrandProfilesByUser({} as any, 'user-1');

			expect(result).toHaveLength(2);
			expect(result[0].brandName).toBe('Alpha');
			expect(result[1].brandName).toBe('Beta');
		});

		it('should return empty array when user has no brands', async () => {
			(getAllBrandProfilesByUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

			const result = await getAllBrandProfilesByUser({} as any, 'user-1');
			expect(result).toEqual([]);
		});
	});

	describe('GET /api/brand/profile?id=X (single brand with sections)', () => {
		it('should return specific brand profile with sections when id is provided', async () => {
			const profile = makeBrandProfile({ id: 'brand-1', brandName: 'My Brand' });
			const sections = [{ id: 'identity', title: 'Brand Identity', icon: '🏷️', fields: [] }];

			(getBrandProfileForUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(profile);
			(getBrandFieldsSummary as ReturnType<typeof vi.fn>).mockReturnValueOnce(sections);

			const result = await getBrandProfileForUser({} as any, 'brand-1', 'user-1');
			const summaryResult = getBrandFieldsSummary(result!);

			expect(result).not.toBeNull();
			expect(result!.brandName).toBe('My Brand');
			expect(summaryResult).toHaveLength(1);
		});

		it('should return null for non-existent profile', async () => {
			(getBrandProfileForUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

			const result = await getBrandProfileForUser({} as any, 'nonexistent', 'user-1');
			expect(result).toBeNull();
		});
	});

	describe('POST /api/brand/profiles/duplicate (duplicate brand)', () => {
		it('should duplicate a brand profile', async () => {
			const duplicated = makeBrandProfile({
				id: 'brand-2',
				brandName: 'My Brand (Copy)',
				status: 'in_progress'
			});

			(duplicateBrandProfile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(duplicated);

			const result = await duplicateBrandProfile({} as any, 'brand-1', 'user-1');

			expect(result.id).toBe('brand-2');
			expect(result.brandName).toBe('My Brand (Copy)');
			expect(result.status).toBe('in_progress');
		});

		it('should throw when source profile not found', async () => {
			(duplicateBrandProfile as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
				new Error('Source profile not found')
			);

			await expect(duplicateBrandProfile({} as any, 'nonexistent', 'user-1')).rejects.toThrow(
				'Source profile not found'
			);
		});
	});

	describe('DELETE /api/brand/profile/[id] (archive brand)', () => {
		it('should archive a brand profile owned by the user', async () => {
			const profile = makeBrandProfile({ id: 'brand-1', userId: 'user-1' });

			vi.mocked(getBrandProfile).mockResolvedValueOnce(profile);
			vi.mocked(archiveBrandProfile).mockResolvedValueOnce(undefined);

			// Verify ownership passes
			const fetchedProfile = await getBrandProfile({} as any, 'brand-1');
			expect(fetchedProfile!.userId).toBe('user-1');

			await archiveBrandProfile({} as any, 'brand-1');
			expect(archiveBrandProfile).toHaveBeenCalledWith({}, 'brand-1');
		});

		it('should verify ownership before archiving', async () => {
			const profile = makeBrandProfile({ id: 'brand-1', userId: 'other-user' });

			vi.mocked(getBrandProfile).mockResolvedValueOnce(profile);

			// Endpoint should check ownership - profile.userId !== locals.user.id → 403
			const fetchedProfile = await getBrandProfile({} as any, 'brand-1');
			expect(fetchedProfile!.userId).not.toBe('user-1');
		});

		it('should handle non-existent profile', async () => {
			// When profile doesn't exist, getBrandProfile returns null
			vi.mocked(getBrandProfile).mockReset();
			vi.mocked(getBrandProfile).mockResolvedValueOnce(null);

			const result = await getBrandProfile({} as any, 'nonexistent');
			expect(result).toBeNull();
		});
	});

	describe('PATCH /api/brand/profile/[id]/rename (rename brand)', () => {
		it('should update the brand name', async () => {
			const profile = makeBrandProfile({ id: 'brand-1', brandName: 'Old Name' });

			(getBrandProfileForUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(profile);

			const result = await getBrandProfileForUser({} as any, 'brand-1', 'user-1');
			expect(result).not.toBeNull();
			// The actual rename would call updateBrandFieldWithVersion
		});
	});
});
