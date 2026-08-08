/**
 * Tests for Brand Archive & Unarchive functionality
 * TDD: Tests written first for viewing archived brands and restoring them
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	getAllBrandProfilesByUser,
	getArchivedBrandProfilesByUser,
	getBrandProfileForUser
} from '$lib/services/brand';
import {
	archiveBrandProfile,
	unarchiveBrandProfile,
	getBrandProfile
} from '$lib/services/onboarding';
import type { BrandProfile } from '$lib/types/onboarding';

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

function makeMockProfile(overrides: Partial<BrandProfile> = {}): Record<string, unknown> {
	return {
		id: overrides.id || 'profile-1',
		user_id: overrides.userId || 'user-1',
		status: overrides.status || 'completed',
		brand_name: overrides.brandName || 'Test Brand',
		brand_name_confirmed: overrides.brandNameConfirmed ?? false,
		tagline: overrides.tagline || null,
		mission_statement: overrides.missionStatement || null,
		vision_statement: overrides.visionStatement || null,
		elevator_pitch: overrides.elevatorPitch || null,
		brand_archetype: overrides.brandArchetype || null,
		brand_personality_traits: null,
		tone_of_voice: overrides.toneOfVoice || null,
		communication_style: overrides.communicationStyle || null,
		target_audience: null,
		customer_pain_points: null,
		value_proposition: overrides.valueProposition || null,
		primary_color: overrides.primaryColor || null,
		secondary_color: null,
		accent_color: null,
		color_palette: null,
		typography_logo: null,
		typography_heading: null,
		typography_body: null,
		logo_concept: null,
		logo_url: null,
		industry: overrides.industry || null,
		competitors: null,
		unique_selling_points: null,
		market_position: null,
		origin_story: null,
		brand_values: null,
		brand_promise: null,
		style_guide: null,
		onboarding_step: overrides.onboardingStep || 'complete',
		conversation_id: null,
		created_at: overrides.createdAt || '2025-01-01T00:00:00Z',
		updated_at: overrides.updatedAt || '2025-01-01T00:00:00Z'
	};
}

describe('Brand Archive & Unarchive', () => {
	let mockDB: ReturnType<typeof createMockDB>;

	beforeEach(() => {
		mockDB = createMockDB();
		vi.clearAllMocks();
	});

	describe('getArchivedBrandProfilesByUser', () => {
		it('should return only archived brand profiles for a user', async () => {
			const mockProfiles = [
				makeMockProfile({ id: 'brand-1', brandName: 'Archived Brand A', status: 'archived' }),
				makeMockProfile({ id: 'brand-2', brandName: 'Archived Brand B', status: 'archived' })
			];

			mockDB._mockAll.mockResolvedValueOnce({ results: mockProfiles });

			const profiles = await getArchivedBrandProfilesByUser(mockDB as any, 'user-1');

			expect(profiles).toHaveLength(2);
			expect(profiles[0].id).toBe('brand-1');
			expect(profiles[0].brandName).toBe('Archived Brand A');
			expect(profiles[1].id).toBe('brand-2');
			expect(profiles[1].brandName).toBe('Archived Brand B');
		});

		it('should filter to only archived status in SQL', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });

			await getArchivedBrandProfilesByUser(mockDB as any, 'user-1');

			const prepareCall = mockDB.prepare.mock.calls[0][0] as string;
			expect(prepareCall).toContain("status = 'archived'");
		});

		it('should return empty array when user has no archived brands', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });

			const profiles = await getArchivedBrandProfilesByUser(mockDB as any, 'user-1');
			expect(profiles).toEqual([]);
		});

		it('should order archived profiles by updated_at DESC', async () => {
			const mockProfiles = [
				makeMockProfile({
					id: 'brand-2',
					brandName: 'Recently Archived',
					status: 'archived',
					updatedAt: '2025-02-01T00:00:00Z'
				}),
				makeMockProfile({
					id: 'brand-1',
					brandName: 'Long Ago Archived',
					status: 'archived',
					updatedAt: '2025-01-01T00:00:00Z'
				})
			];

			mockDB._mockAll.mockResolvedValueOnce({ results: mockProfiles });

			const profiles = await getArchivedBrandProfilesByUser(mockDB as any, 'user-1');

			expect(profiles[0].brandName).toBe('Recently Archived');
			expect(profiles[1].brandName).toBe('Long Ago Archived');

			const prepareCall = mockDB.prepare.mock.calls[0][0] as string;
			expect(prepareCall).toContain('ORDER BY updated_at DESC');
		});

		it('should bind user_id parameter', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });

			await getArchivedBrandProfilesByUser(mockDB as any, 'user-42');

			expect(mockDB._mockBind).toHaveBeenCalledWith('user-42');
		});
	});

	describe('unarchiveBrandProfile', () => {
		it('should set profile status back to in_progress', async () => {
			await unarchiveBrandProfile(mockDB as any, 'brand-123');

			expect(mockDB.prepare).toHaveBeenCalled();
			const prepareCall = mockDB.prepare.mock.calls[0][0] as string;
			expect(prepareCall).toContain("status = 'in_progress'");
			expect(prepareCall).toContain('UPDATE brand_profiles');
		});

		it('should update the updated_at timestamp', async () => {
			await unarchiveBrandProfile(mockDB as any, 'brand-123');

			const prepareCall = mockDB.prepare.mock.calls[0][0] as string;
			expect(prepareCall).toContain("updated_at = datetime('now')");
		});

		it('should target the correct profile by id', async () => {
			await unarchiveBrandProfile(mockDB as any, 'brand-456');

			expect(mockDB._mockBind).toHaveBeenCalledWith('brand-456');
		});
	});

	describe('archive then unarchive round-trip', () => {
		it('should archive and then restore a brand profile', async () => {
			// Archive the brand
			await archiveBrandProfile(mockDB as any, 'brand-1');

			const archiveCall = mockDB.prepare.mock.calls[0][0] as string;
			expect(archiveCall).toContain("status = 'archived'");

			// Clear for next call
			mockDB.prepare.mockClear();

			// Unarchive the brand
			await unarchiveBrandProfile(mockDB as any, 'brand-1');

			const unarchiveCall = mockDB.prepare.mock.calls[0][0] as string;
			expect(unarchiveCall).toContain("status = 'in_progress'");
		});
	});
});
