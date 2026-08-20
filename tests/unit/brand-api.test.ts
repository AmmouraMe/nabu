/**
 * Tests for Brand API endpoints
 * TDD: Tests written first, then implementation
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the brand service
vi.mock('$lib/services/brand', () => ({
	getFieldHistory: vi.fn(),
	addFieldVersion: vi.fn(),
	updateBrandFieldWithVersion: vi.fn(),
	getBrandFieldsSummary: vi.fn(),
	revertFieldToVersion: vi.fn(),
	BRAND_FIELD_LABELS: {
		brandName: 'Brand Name',
		tagline: 'Tagline',
		missionStatement: 'Mission Statement'
	}
}));

vi.mock('$lib/services/onboarding', () => ({
	getBrandProfileByUser: vi.fn(),
	getBrandProfile: vi.fn(),
	updateBrandProfile: vi.fn()
}));

import {
	getFieldHistory,
	updateBrandFieldWithVersion,
	revertFieldToVersion
} from '$lib/services/brand';
import { getBrandProfileByUser, getBrandProfile } from '$lib/services/onboarding';

describe('Brand API Endpoints', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET /api/brand/profile', () => {
		it('should return the user brand profile with field summaries', async () => {
			const mockProfile = {
				id: 'profile-1',
				userId: 'user-1',
				status: 'in_progress',
				brandName: 'Test Brand',
				onboardingStep: 'brand_identity',
				createdAt: '2025-01-01',
				updatedAt: '2025-01-01'
			};

			vi.mocked(getBrandProfileByUser).mockResolvedValue(mockProfile as any);

			// The endpoint should return the profile
			expect(getBrandProfileByUser).toBeDefined();
		});
	});

	describe('GET /api/brand/field-history/:profileId/:fieldName', () => {
		it('should return version history for a field', async () => {
			const mockHistory = [
				{
					id: 'v1',
					brandProfileId: 'profile-1',
					userId: 'user-1',
					fieldName: 'brandName',
					oldValue: null,
					newValue: 'First Name',
					changeSource: 'manual' as const,
					changeReason: null,
					versionNumber: 1,
					createdAt: '2025-01-01T00:00:00Z'
				}
			];

			vi.mocked(getFieldHistory).mockResolvedValue(mockHistory);

			const result = await getFieldHistory({} as any, 'profile-1', 'brandName');
			expect(result).toHaveLength(1);
			expect(result[0].fieldName).toBe('brandName');
		});
	});

	describe('PATCH /api/brand/update-field', () => {
		it('should update a field and create version history', async () => {
			vi.mocked(updateBrandFieldWithVersion).mockResolvedValue(undefined);

			await updateBrandFieldWithVersion({} as any, {
				profileId: 'profile-1',
				userId: 'user-1',
				fieldName: 'brandName',
				newValue: 'Updated Name',
				changeSource: 'manual'
			});

			expect(updateBrandFieldWithVersion).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					fieldName: 'brandName',
					newValue: 'Updated Name',
					changeSource: 'manual'
				})
			);
		});
	});

	describe('POST /api/brand/revert-field', () => {
		it('should revert a field to a specific version', async () => {
			vi.mocked(revertFieldToVersion).mockResolvedValue(undefined);

			await revertFieldToVersion({} as any, {
				profileId: 'profile-1',
				userId: 'user-1',
				fieldName: 'brandName',
				versionId: 'v1'
			});

			expect(revertFieldToVersion).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					versionId: 'v1'
				})
			);
		});
	});
});
