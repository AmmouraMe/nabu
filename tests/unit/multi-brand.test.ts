/**
 * Tests for Multi-Brand Management
 * TDD: Tests written first for managing multiple brands per user
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	getAllBrandProfilesByUser,
	duplicateBrandProfile,
	getBrandProfileForUser
} from '$lib/services/brand';
import {
	createBrandProfile,
	getBrandProfile,
	getBrandProfileByUser,
	archiveBrandProfile
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
		sort_order: 0,
		onboarding_step: overrides.onboardingStep || 'complete',
		conversation_id: null,
		created_at: overrides.createdAt || '2025-01-01T00:00:00Z',
		updated_at: overrides.updatedAt || '2025-01-01T00:00:00Z'
	};
}

describe('Multi-Brand Management', () => {
	let mockDB: ReturnType<typeof createMockDB>;

	beforeEach(() => {
		mockDB = createMockDB();
		vi.clearAllMocks();
	});

	describe('getAllBrandProfilesByUser', () => {
		it('should return all non-archived brand profiles for a user', async () => {
			const mockProfiles = [
				makeMockProfile({ id: 'brand-1', brandName: 'Brand Alpha', status: 'completed' }),
				makeMockProfile({ id: 'brand-2', brandName: 'Brand Beta', status: 'in_progress' })
			];

			mockDB._mockAll.mockResolvedValueOnce({ results: mockProfiles });

			const profiles = await getAllBrandProfilesByUser(mockDB as any, 'user-1');

			expect(profiles).toHaveLength(2);
			expect(profiles[0].id).toBe('brand-1');
			expect(profiles[0].brandName).toBe('Brand Alpha');
			expect(profiles[1].id).toBe('brand-2');
			expect(profiles[1].brandName).toBe('Brand Beta');
		});

		it('should not return archived profiles', async () => {
			const mockProfiles = [
				makeMockProfile({ id: 'brand-1', brandName: 'Active Brand', status: 'completed' })
			];

			mockDB._mockAll.mockResolvedValueOnce({ results: mockProfiles });

			const profiles = await getAllBrandProfilesByUser(mockDB as any, 'user-1');

			expect(profiles).toHaveLength(1);
			expect(profiles[0].brandName).toBe('Active Brand');

			// Verify the SQL filters out archived
			const prepareCall = mockDB.prepare.mock.calls[0][0] as string;
			expect(prepareCall).toContain("status IN ('in_progress', 'completed')");
		});

		it('should return empty array when user has no brands', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });

			const profiles = await getAllBrandProfilesByUser(mockDB as any, 'user-1');
			expect(profiles).toEqual([]);
		});

		it('should order profiles by sort_order then updated_at DESC', async () => {
			const mockProfiles = [
				makeMockProfile({
					id: 'brand-2',
					brandName: 'Recent',
					updatedAt: '2025-02-01T00:00:00Z'
				}),
				makeMockProfile({
					id: 'brand-1',
					brandName: 'Old',
					updatedAt: '2025-01-01T00:00:00Z'
				})
			];

			mockDB._mockAll.mockResolvedValueOnce({ results: mockProfiles });

			const profiles = await getAllBrandProfilesByUser(mockDB as any, 'user-1');

			expect(profiles[0].brandName).toBe('Recent');
			expect(profiles[1].brandName).toBe('Old');

			const prepareCall = mockDB.prepare.mock.calls[0][0] as string;
			expect(prepareCall).toContain('ORDER BY sort_order ASC, updated_at DESC');
		});

		it('should include typography fields in returned profiles', async () => {
			const mockProfiles = [
				makeMockProfile({
					id: 'brand-1',
					brandName: 'Font Brand'
				})
			];
			// Override typography fields on the raw DB row
			(mockProfiles[0] as Record<string, unknown>).typography_heading = 'Montserrat';
			(mockProfiles[0] as Record<string, unknown>).typography_body = 'Open Sans';

			mockDB._mockAll.mockResolvedValueOnce({ results: mockProfiles });

			const profiles = await getAllBrandProfilesByUser(mockDB as any, 'user-1');

			expect(profiles).toHaveLength(1);
			expect(profiles[0].typographyHeading).toBe('Montserrat');
			expect(profiles[0].typographyBody).toBe('Open Sans');
		});
	});

	describe('getBrandProfileForUser', () => {
		it('should return a specific profile that belongs to the user', async () => {
			const mockProfile = makeMockProfile({
				id: 'brand-1',
				userId: 'user-1',
				brandName: 'My Brand'
			});

			mockDB._mockFirst.mockResolvedValueOnce(mockProfile);

			const profile = await getBrandProfileForUser(mockDB as any, 'brand-1', 'user-1');

			expect(profile).not.toBeNull();
			expect(profile!.id).toBe('brand-1');
			expect(profile!.brandName).toBe('My Brand');
		});

		it('should return null if profile does not belong to user', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);

			const profile = await getBrandProfileForUser(mockDB as any, 'brand-1', 'wrong-user');

			expect(profile).toBeNull();
		});

		it('should return null for non-existent profile', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);

			const profile = await getBrandProfileForUser(mockDB as any, 'nonexistent', 'user-1');
			expect(profile).toBeNull();
		});
	});

	describe('duplicateBrandProfile', () => {
		it('should create a copy of an existing brand profile', async () => {
			const sourceProfile = makeMockProfile({
				id: 'brand-1',
				userId: 'user-1',
				brandName: 'Original Brand',
				tagline: 'Original tagline',
				industry: 'Tech',
				primaryColor: '#0066cc'
			});

			// Mock getting the source profile
			mockDB._mockFirst.mockResolvedValueOnce(sourceProfile);

			const newProfile = await duplicateBrandProfile(mockDB as any, 'brand-1', 'user-1');

			expect(newProfile).toBeDefined();
			expect(newProfile.id).not.toBe('brand-1'); // New ID
			expect(newProfile.brandName).toBe('Original Brand (Copy)');
			expect(newProfile.status).toBe('in_progress');
			expect(newProfile.userId).toBe('user-1');
		});

		it('should throw if source profile not found', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);

			await expect(duplicateBrandProfile(mockDB as any, 'nonexistent', 'user-1')).rejects.toThrow(
				'Source profile not found'
			);
		});

		it('should throw if source profile belongs to different user', async () => {
			// When querying with user_id = 'user-1' but the profile belongs to 'other-user',
			// the SQL WHERE clause `id = ? AND user_id = ?` returns no rows
			mockDB._mockFirst.mockResolvedValueOnce(null);

			await expect(duplicateBrandProfile(mockDB as any, 'brand-1', 'user-1')).rejects.toThrow(
				'Source profile not found'
			);
		});

		it('should reset onboarding step and status for the copy', async () => {
			const sourceProfile = makeMockProfile({
				id: 'brand-1',
				userId: 'user-1',
				brandName: 'Complete Brand',
				status: 'completed',
				onboardingStep: 'complete'
			});

			mockDB._mockFirst.mockResolvedValueOnce(sourceProfile);

			const newProfile = await duplicateBrandProfile(mockDB as any, 'brand-1', 'user-1');

			expect(newProfile.status).toBe('in_progress');
			expect(newProfile.onboardingStep).toBe('complete');
		});
	});

	describe('archiveBrandProfile (multi-brand context)', () => {
		it('should archive a specific brand profile', async () => {
			await archiveBrandProfile(mockDB as any, 'brand-1');

			expect(mockDB.prepare).toHaveBeenCalled();
			const prepareCall = mockDB.prepare.mock.calls[0][0] as string;
			expect(prepareCall).toContain("status = 'archived'");
		});
	});

	describe('createBrandProfile (multi-brand context)', () => {
		it('should create a new brand without affecting existing ones', async () => {
			const profile = await createBrandProfile(mockDB as any, 'user-1');

			expect(profile).toBeDefined();
			expect(profile.id).toBeTruthy();
			expect(profile.userId).toBe('user-1');
			expect(profile.status).toBe('in_progress');
			expect(profile.onboardingStep).toBe('welcome');
		});

		it('should allow creating multiple profiles for the same user', async () => {
			const profile1 = await createBrandProfile(mockDB as any, 'user-1');
			const profile2 = await createBrandProfile(mockDB as any, 'user-1');

			expect(profile1.id).not.toBe(profile2.id);
		});
	});

	describe('getBrandProfileByUser (backward compatibility)', () => {
		it('should still return the latest active profile', async () => {
			const mockProfile = makeMockProfile({
				id: 'brand-2',
				brandName: 'Latest Brand',
				updatedAt: '2025-02-01T00:00:00Z'
			});

			mockDB._mockFirst.mockResolvedValueOnce(mockProfile);

			const profile = await getBrandProfileByUser(mockDB as any, 'user-1');

			expect(profile).not.toBeNull();
			expect(profile!.id).toBe('brand-2');
		});
	});

	describe('sortOrder field mapping', () => {
		it('should include sortOrder in mapped profile', async () => {
			const mockProfiles = [
				{ ...makeMockProfile({ id: 'brand-1', brandName: 'First' }), sort_order: 0 },
				{ ...makeMockProfile({ id: 'brand-2', brandName: 'Second' }), sort_order: 1 }
			];

			mockDB._mockAll.mockResolvedValueOnce({ results: mockProfiles });

			const profiles = await getAllBrandProfilesByUser(mockDB as any, 'user-1');

			expect(profiles[0].sortOrder).toBe(0);
			expect(profiles[1].sortOrder).toBe(1);
		});

		it('should default sortOrder to 0 when null', async () => {
			const mockProfiles = [{ ...makeMockProfile({ id: 'brand-1' }), sort_order: null }];

			mockDB._mockAll.mockResolvedValueOnce({ results: mockProfiles });

			const profiles = await getAllBrandProfilesByUser(mockDB as any, 'user-1');

			expect(profiles[0].sortOrder).toBe(0);
		});
	});
});
