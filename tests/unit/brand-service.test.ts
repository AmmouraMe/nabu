/**
 * Tests for Brand Service (field versioning and brand management)
 * TDD: Tests written first, then implementation
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	getFieldHistory,
	addFieldVersion,
	updateBrandFieldWithVersion,
	getBrandFieldsSummary,
	revertFieldToVersion,
	BRAND_FIELD_LABELS,
	FIELD_TO_TEXT_MAPPING,
	getTextSuggestionsForField,
	getMatchingProfileField,
	getProfileFieldValue
} from '$lib/services/brand';

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

describe('Brand Service', () => {
	let mockDB: ReturnType<typeof createMockDB>;

	beforeEach(() => {
		mockDB = createMockDB();
		vi.clearAllMocks();
	});

	describe('BRAND_FIELD_LABELS', () => {
		it('should define human-readable labels for all brand fields', () => {
			expect(BRAND_FIELD_LABELS).toBeDefined();
			expect(typeof BRAND_FIELD_LABELS).toBe('object');
			expect(BRAND_FIELD_LABELS.brandName).toBe('Brand Name');
			expect(BRAND_FIELD_LABELS.tagline).toBe('Tagline');
			expect(BRAND_FIELD_LABELS.missionStatement).toBe('Mission Statement');
			expect(BRAND_FIELD_LABELS.visionStatement).toBe('Vision Statement');
			expect(BRAND_FIELD_LABELS.elevatorPitch).toBe('Elevator Pitch');
			expect(BRAND_FIELD_LABELS.brandArchetype).toBe('Brand Archetype');
			expect(BRAND_FIELD_LABELS.toneOfVoice).toBe('Tone of Voice');
			expect(BRAND_FIELD_LABELS.primaryColor).toBe('Primary Color');
			expect(BRAND_FIELD_LABELS.industry).toBe('Industry');
		});
	});

	describe('addFieldVersion', () => {
		it('should insert a version record', async () => {
			// Mock getting current max version
			mockDB._mockFirst.mockResolvedValueOnce({ max_version: 0 });

			await addFieldVersion(mockDB as any, {
				brandProfileId: 'profile-1',
				userId: 'user-1',
				fieldName: 'brandName',
				oldValue: null,
				newValue: 'My Brand',
				changeSource: 'manual'
			});

			expect(mockDB.prepare).toHaveBeenCalled();
		});

		it('should increment version number for subsequent changes', async () => {
			// First call: get max version → returns 2
			mockDB._mockFirst.mockResolvedValueOnce({ max_version: 2 });

			await addFieldVersion(mockDB as any, {
				brandProfileId: 'profile-1',
				userId: 'user-1',
				fieldName: 'brandName',
				oldValue: 'Old Name',
				newValue: 'New Name',
				changeSource: 'ai'
			});

			expect(mockDB.prepare).toHaveBeenCalled();
		});

		it('should accept changeSource of manual, ai, or import', async () => {
			mockDB._mockFirst.mockResolvedValue({ max_version: 0 });

			for (const source of ['manual', 'ai', 'import'] as const) {
				await addFieldVersion(mockDB as any, {
					brandProfileId: 'profile-1',
					userId: 'user-1',
					fieldName: 'tagline',
					oldValue: null,
					newValue: 'Test',
					changeSource: source
				});
			}

			expect(mockDB.prepare).toHaveBeenCalled();
		});
	});

	describe('getFieldHistory', () => {
		it('should return version history for a specific field', async () => {
			const mockVersions = [
				{
					id: 'v1',
					brand_profile_id: 'profile-1',
					user_id: 'user-1',
					field_name: 'brandName',
					old_value: null,
					new_value: 'First Name',
					change_source: 'manual',
					change_reason: null,
					version_number: 1,
					created_at: '2025-01-01T00:00:00Z'
				},
				{
					id: 'v2',
					brand_profile_id: 'profile-1',
					user_id: 'user-1',
					field_name: 'brandName',
					old_value: 'First Name',
					new_value: 'Better Name',
					change_source: 'ai',
					change_reason: 'AI suggested improvement',
					version_number: 2,
					created_at: '2025-01-02T00:00:00Z'
				}
			];

			mockDB._mockAll.mockResolvedValueOnce({ results: mockVersions });

			const history = await getFieldHistory(mockDB as any, 'profile-1', 'brandName');

			expect(history).toHaveLength(2);
			expect(history[0].fieldName).toBe('brandName');
			expect(history[0].newValue).toBe('First Name');
			expect(history[1].newValue).toBe('Better Name');
			expect(history[1].changeSource).toBe('ai');
		});

		it('should return empty array when no history exists', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });

			const history = await getFieldHistory(mockDB as any, 'profile-1', 'nonExistentField');
			expect(history).toEqual([]);
		});
	});

	describe('updateBrandFieldWithVersion', () => {
		it('should update the field and create a version record', async () => {
			// Mock getting current value
			mockDB._mockFirst
				.mockResolvedValueOnce({ brand_name: 'Old Name' }) // getBrandProfile lookup
				.mockResolvedValueOnce({ max_version: 1 }); // version number lookup

			await updateBrandFieldWithVersion(mockDB as any, {
				profileId: 'profile-1',
				userId: 'user-1',
				fieldName: 'brandName',
				newValue: 'New Name',
				changeSource: 'manual'
			});

			// Should have called prepare at least twice (one for update, one for version)
			expect(mockDB.prepare.mock.calls.length).toBeGreaterThanOrEqual(2);
		});

		it('should handle JSON fields properly', async () => {
			mockDB._mockFirst
				.mockResolvedValueOnce({ brand_values: '["old1","old2"]' })
				.mockResolvedValueOnce({ max_version: 0 });

			await updateBrandFieldWithVersion(mockDB as any, {
				profileId: 'profile-1',
				userId: 'user-1',
				fieldName: 'brandValues',
				newValue: ['new1', 'new2', 'new3'],
				changeSource: 'ai',
				changeReason: 'AI refined values'
			});

			expect(mockDB.prepare).toHaveBeenCalled();
		});
	});

	describe('getBrandFieldsSummary', () => {
		it('should categorize brand fields into sections', () => {
			const profile = {
				id: 'profile-1',
				userId: 'user-1',
				status: 'in_progress' as const,
				brandName: 'Test Brand',
				brandNameConfirmed: false,
				tagline: 'Test tagline',
				missionStatement: 'Our mission',
				primaryColor: '#0066cc',
				industry: 'Technology',
				onboardingStep: 'brand_identity' as const,
				createdAt: '2025-01-01',
				updatedAt: '2025-01-01'
			};

			const summary = getBrandFieldsSummary(profile);

			expect(summary).toBeDefined();
			expect(Array.isArray(summary)).toBe(true);
			expect(summary.length).toBeGreaterThan(0);

			// Find the identity section
			const identitySection = summary.find((s) => s.id === 'identity');
			expect(identitySection).toBeDefined();
			expect(identitySection!.title).toBe('Brand Identity');

			// Check the fields in identity section
			const brandNameField = identitySection!.fields.find((f) => f.key === 'brandName');
			expect(brandNameField).toBeDefined();
			expect(brandNameField!.value).toBe('Test Brand');
			expect(brandNameField!.label).toBe('Brand Name');

			// Find the visual section
			const visualSection = summary.find((s) => s.id === 'visual');
			expect(visualSection).toBeDefined();

			const primaryColorField = visualSection!.fields.find((f) => f.key === 'primaryColor');
			expect(primaryColorField).toBeDefined();
			expect(primaryColorField!.value).toBe('#0066cc');
		});

		it('should mark empty fields as having no value', () => {
			const profile = {
				id: 'profile-1',
				userId: 'user-1',
				status: 'in_progress' as const,
				brandName: 'Test Brand',
				brandNameConfirmed: false,
				onboardingStep: 'welcome' as const,
				createdAt: '2025-01-01',
				updatedAt: '2025-01-01'
			};

			const summary = getBrandFieldsSummary(profile);
			const identitySection = summary.find((s) => s.id === 'identity');
			const taglineField = identitySection!.fields.find((f) => f.key === 'tagline');

			expect(taglineField).toBeDefined();
			expect(taglineField!.value).toBeUndefined();
		});
	});

	describe('revertFieldToVersion', () => {
		it('should get the value from a specific version and apply it', async () => {
			// Mock getting the version
			mockDB._mockFirst
				.mockResolvedValueOnce({
					id: 'v1',
					brand_profile_id: 'profile-1',
					field_name: 'brandName',
					new_value: 'Original Name',
					version_number: 1,
					created_at: '2025-01-01T00:00:00Z'
				})
				// Mock getting current value for version tracking
				.mockResolvedValueOnce({ brand_name: 'Current Name' })
				// Mock getting max version
				.mockResolvedValueOnce({ max_version: 3 });

			await revertFieldToVersion(mockDB as any, {
				profileId: 'profile-1',
				userId: 'user-1',
				fieldName: 'brandName',
				versionId: 'v1'
			});

			expect(mockDB.prepare).toHaveBeenCalled();
		});

		it('should throw if version not found', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);

			await expect(
				revertFieldToVersion(mockDB as any, {
					profileId: 'profile-1',
					userId: 'user-1',
					fieldName: 'brandName',
					versionId: 'nonexistent'
				})
			).rejects.toThrow('Version not found');
		});
	});

	describe('FIELD_TO_TEXT_MAPPING', () => {
		it('should map brand profile fields to text asset categories and keys', () => {
			expect(FIELD_TO_TEXT_MAPPING).toBeDefined();
			expect(typeof FIELD_TO_TEXT_MAPPING).toBe('object');
		});

		it('should map tagline to messaging category', () => {
			const mapping = FIELD_TO_TEXT_MAPPING.tagline;
			expect(mapping).toBeDefined();
			expect(mapping.category).toBe('messaging');
			expect(mapping.keys).toContain('tagline');
		});

		it('should map missionStatement to messaging category', () => {
			const mapping = FIELD_TO_TEXT_MAPPING.missionStatement;
			expect(mapping).toBeDefined();
			expect(mapping.category).toBe('messaging');
			expect(mapping.keys).toContain('mission');
		});

		it('should map visionStatement to messaging category', () => {
			const mapping = FIELD_TO_TEXT_MAPPING.visionStatement;
			expect(mapping).toBeDefined();
			expect(mapping.category).toBe('messaging');
			expect(mapping.keys).toContain('vision');
		});

		it('should map elevatorPitch to messaging category', () => {
			const mapping = FIELD_TO_TEXT_MAPPING.elevatorPitch;
			expect(mapping).toBeDefined();
			expect(mapping.category).toBe('messaging');
			expect(mapping.keys).toContain('elevator_pitch');
		});

		it('should map valueProposition to messaging category', () => {
			const mapping = FIELD_TO_TEXT_MAPPING.valueProposition;
			expect(mapping).toBeDefined();
			expect(mapping.category).toBe('messaging');
			expect(mapping.keys).toContain('value_proposition');
		});

		it('should map brandName to names category', () => {
			const mapping = FIELD_TO_TEXT_MAPPING.brandName;
			expect(mapping).toBeDefined();
			expect(mapping.category).toBe('names');
		});

		it('should map toneOfVoice to voice category', () => {
			const mapping = FIELD_TO_TEXT_MAPPING.toneOfVoice;
			expect(mapping).toBeDefined();
			expect(mapping.category).toBe('voice');
		});

		it('should map originStory to descriptions category', () => {
			const mapping = FIELD_TO_TEXT_MAPPING.originStory;
			expect(mapping).toBeDefined();
			expect(mapping.category).toBe('descriptions');
		});

		it('should not map color fields (they are not text)', () => {
			expect(FIELD_TO_TEXT_MAPPING.primaryColor).toBeUndefined();
			expect(FIELD_TO_TEXT_MAPPING.secondaryColor).toBeUndefined();
			expect(FIELD_TO_TEXT_MAPPING.accentColor).toBeUndefined();
		});
	});

	describe('getTextSuggestionsForField', () => {
		it('should return matching text assets for a mapped field', async () => {
			const mockTexts = [
				{
					id: 't1',
					brand_profile_id: 'p1',
					category: 'messaging',
					key: 'tagline',
					label: 'Tagline',
					value: 'Build the future',
					language: 'en',
					sort_order: 0,
					metadata: null,
					created_at: '2025-01-01',
					updated_at: '2025-01-01'
				},
				{
					id: 't2',
					brand_profile_id: 'p1',
					category: 'messaging',
					key: 'slogan',
					label: 'Slogan',
					value: 'Innovation starts here',
					language: 'en',
					sort_order: 1,
					metadata: null,
					created_at: '2025-01-01',
					updated_at: '2025-01-01'
				}
			];
			mockDB._mockAll.mockResolvedValueOnce({ results: mockTexts, success: true, meta: {} });

			const suggestions = await getTextSuggestionsForField(mockDB as any, 'p1', 'tagline');

			expect(suggestions).toHaveLength(2);
			expect(suggestions[0].value).toBe('Build the future');
			expect(suggestions[1].value).toBe('Innovation starts here');
		});

		it('should return empty array for unmapped fields', async () => {
			const suggestions = await getTextSuggestionsForField(mockDB as any, 'p1', 'primaryColor');
			expect(suggestions).toEqual([]);
		});

		it('should return empty array when no texts exist', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ results: [], success: true, meta: {} });

			const suggestions = await getTextSuggestionsForField(mockDB as any, 'p1', 'tagline');
			expect(suggestions).toEqual([]);
		});

		it('should query the correct category', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ results: [], success: true, meta: {} });

			await getTextSuggestionsForField(mockDB as any, 'p1', 'missionStatement');

			expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining('category = ?'));
		});
	});

	describe('getMatchingProfileField', () => {
		it('should return field info for a known text key that maps to a profile field', () => {
			const result = getMatchingProfileField('messaging', 'tagline');
			expect(result).toBeDefined();
			expect(result!.fieldName).toBe('tagline');
			expect(result!.fieldLabel).toBe('Tagline');
		});

		it('should return field info for value_proposition key', () => {
			const result = getMatchingProfileField('messaging', 'value_proposition');
			expect(result).toBeDefined();
			expect(result!.fieldName).toBe('valueProposition');
			expect(result!.fieldLabel).toBe('Value Proposition');
		});

		it('should return field info for elevator_pitch key', () => {
			const result = getMatchingProfileField('messaging', 'elevator_pitch');
			expect(result).toBeDefined();
			expect(result!.fieldName).toBe('elevatorPitch');
			expect(result!.fieldLabel).toBe('Elevator Pitch');
		});

		it('should return field info for brand_name in names category', () => {
			const result = getMatchingProfileField('names', 'brand_name');
			expect(result).toBeDefined();
			expect(result!.fieldName).toBe('brandName');
			expect(result!.fieldLabel).toBe('Brand Name');
		});

		it('should return field info for tone_guidelines in voice category', () => {
			const result = getMatchingProfileField('voice', 'tone_guidelines');
			expect(result).toBeDefined();
			expect(result!.fieldName).toBe('toneOfVoice');
			expect(result!.fieldLabel).toBe('Tone of Voice');
		});

		it('should return field info for origin_story in descriptions category', () => {
			const result = getMatchingProfileField('descriptions', 'origin_story');
			expect(result).toBeDefined();
			expect(result!.fieldName).toBe('originStory');
			expect(result!.fieldLabel).toBe('Origin Story');
		});

		it('should return null for a key that does not map to any profile field', () => {
			const result = getMatchingProfileField('social', 'twitter_bio');
			expect(result).toBeNull();
		});

		it('should return null for a key in wrong category', () => {
			// tagline maps to messaging, not names
			const result = getMatchingProfileField('names', 'tagline');
			expect(result).toBeNull();
		});

		it('should return null for completely unknown keys', () => {
			const result = getMatchingProfileField('messaging', 'random_unknown_key');
			expect(result).toBeNull();
		});

		it('should match slogan to tagline field', () => {
			const result = getMatchingProfileField('messaging', 'slogan');
			expect(result).toBeDefined();
			expect(result!.fieldName).toBe('tagline');
		});

		it('should match mission to missionStatement field', () => {
			const result = getMatchingProfileField('messaging', 'mission');
			expect(result).toBeDefined();
			expect(result!.fieldName).toBe('missionStatement');
		});
	});

	describe('getProfileFieldValue', () => {
		it('should return the current value of a profile field', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ tagline: 'Existing tagline' });

			const value = await getProfileFieldValue(mockDB as any, 'profile-1', 'tagline');
			expect(value).toBe('Existing tagline');
		});

		it('should return null when the field is empty', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ tagline: null });

			const value = await getProfileFieldValue(mockDB as any, 'profile-1', 'tagline');
			expect(value).toBeNull();
		});

		it('should return null when profile is not found', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);

			const value = await getProfileFieldValue(mockDB as any, 'nonexistent', 'tagline');
			expect(value).toBeNull();
		});

		it('should throw for unknown field names', async () => {
			await expect(
				getProfileFieldValue(mockDB as any, 'profile-1', 'unknownField')
			).rejects.toThrow('Unknown field');
		});

		it('should query the correct column for camelCase field names', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ value_proposition: 'Our value' });

			const value = await getProfileFieldValue(mockDB as any, 'profile-1', 'valueProposition');
			expect(value).toBe('Our value');
			expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining('value_proposition'));
		});
	});
});
