/**
 * Tests for Push Text/Asset to Profile
 * TDD: A user should be able to push a specific text asset's current value
 * (or a specific revision) to the corresponding brand profile field.
 *
 * Uses getMatchingProfileField() to reverse-map text category+key → profile field,
 * then updateBrandFieldWithVersion() to update the profile with version tracking.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	getMatchingProfileField,
	FIELD_TO_TEXT_MAPPING,
	BRAND_FIELD_LABELS
} from '$lib/services/brand';

// ─── Unit tests for getMatchingProfileField (reverse mapping) ───

describe('Push to Profile - Reverse mapping', () => {
	describe('getMatchingProfileField', () => {
		it('should find visionStatement from messaging/vision_statement', () => {
			const result = getMatchingProfileField('messaging', 'vision_statement');
			expect(result).toEqual({ fieldName: 'visionStatement', fieldLabel: 'Vision Statement' });
		});

		it('should find missionStatement from messaging/mission_statement', () => {
			const result = getMatchingProfileField('messaging', 'mission_statement');
			expect(result).toEqual({ fieldName: 'missionStatement', fieldLabel: 'Mission Statement' });
		});

		it('should find tagline from messaging/tagline', () => {
			const result = getMatchingProfileField('messaging', 'tagline');
			expect(result).toEqual({ fieldName: 'tagline', fieldLabel: 'Tagline' });
		});

		it('should find brandName from names/brand_name', () => {
			const result = getMatchingProfileField('names', 'brand_name');
			expect(result).toEqual({ fieldName: 'brandName', fieldLabel: 'Brand Name' });
		});

		it('should find toneOfVoice from voice/tone_of_voice', () => {
			const result = getMatchingProfileField('voice', 'tone');
			expect(result).toEqual({ fieldName: 'toneOfVoice', fieldLabel: 'Tone of Voice' });
		});

		it('should find originStory from descriptions/origin_story', () => {
			const result = getMatchingProfileField('descriptions', 'origin_story');
			expect(result).toEqual({ fieldName: 'originStory', fieldLabel: 'Origin Story' });
		});

		it('should return null for unmapped category/key', () => {
			const result = getMatchingProfileField('legal', 'copyright_notice');
			expect(result).toBeNull();
		});

		it('should return null for unknown category', () => {
			const result = getMatchingProfileField('nonexistent', 'some_key');
			expect(result).toBeNull();
		});

		it('should match alternate keys (e.g., "slogan" maps to tagline)', () => {
			const result = getMatchingProfileField('messaging', 'slogan');
			expect(result).toEqual({ fieldName: 'tagline', fieldLabel: 'Tagline' });
		});

		it('should match alternate key "about_us" for originStory', () => {
			const result = getMatchingProfileField('descriptions', 'about_us');
			expect(result).toEqual({ fieldName: 'originStory', fieldLabel: 'Origin Story' });
		});
	});

	describe('every mapped field has a reverse mapping', () => {
		it('should resolve back for every field in FIELD_TO_TEXT_MAPPING using first key', () => {
			for (const [fieldName, mapping] of Object.entries(FIELD_TO_TEXT_MAPPING)) {
				const primaryKey = mapping.keys[0];
				const result = getMatchingProfileField(mapping.category, primaryKey);
				expect(
					result,
					`${fieldName} → ${mapping.category}/${primaryKey} should reverse-map`
				).not.toBeNull();
				expect(result!.fieldName).toBe(fieldName);
				expect(result!.fieldLabel).toBe(BRAND_FIELD_LABELS[fieldName]);
			}
		});
	});
});

// ─── Tests for the push-to-profile API endpoint ─────────────────

describe('Push to Profile - API endpoint logic', () => {
	// These tests verify the logic that the API endpoint should implement.
	// We test the pure logic separately from the HTTP handler.

	interface PushToProfileParams {
		brandProfileId: string;
		textCategory: string;
		textKey: string;
		value: string;
		userId: string;
	}

	/**
	 * Pure logic function: determines whether a push is valid and what field to update.
	 * Returns the target field info or throws if no mapping exists.
	 */
	function validatePushToProfile(params: PushToProfileParams): {
		fieldName: string;
		fieldLabel: string;
		value: string;
	} {
		const match = getMatchingProfileField(params.textCategory, params.textKey);
		if (!match) {
			throw new Error(`No profile field mapping for ${params.textCategory}/${params.textKey}`);
		}
		return {
			fieldName: match.fieldName,
			fieldLabel: match.fieldLabel,
			value: params.value
		};
	}

	it('should validate a push for vision_statement', () => {
		const result = validatePushToProfile({
			brandProfileId: 'bp-1',
			textCategory: 'messaging',
			textKey: 'vision_statement',
			value: 'To be the leading platform...',
			userId: 'user-1'
		});
		expect(result).toEqual({
			fieldName: 'visionStatement',
			fieldLabel: 'Vision Statement',
			value: 'To be the leading platform...'
		});
	});

	it('should validate a push for brand_name', () => {
		const result = validatePushToProfile({
			brandProfileId: 'bp-1',
			textCategory: 'names',
			textKey: 'brand_name',
			value: 'Acme Corp',
			userId: 'user-1'
		});
		expect(result).toEqual({
			fieldName: 'brandName',
			fieldLabel: 'Brand Name',
			value: 'Acme Corp'
		});
	});

	it('should validate a push for origin_story', () => {
		const result = validatePushToProfile({
			brandProfileId: 'bp-1',
			textCategory: 'descriptions',
			textKey: 'origin_story',
			value: 'Founded in 2020...',
			userId: 'user-1'
		});
		expect(result).toEqual({
			fieldName: 'originStory',
			fieldLabel: 'Origin Story',
			value: 'Founded in 2020...'
		});
	});

	it('should throw for text assets without a profile field mapping', () => {
		expect(() =>
			validatePushToProfile({
				brandProfileId: 'bp-1',
				textCategory: 'legal',
				textKey: 'copyright_notice',
				value: '© 2025 Acme Corp',
				userId: 'user-1'
			})
		).toThrow('No profile field mapping for legal/copyright_notice');
	});

	it('should throw for unknown category', () => {
		expect(() =>
			validatePushToProfile({
				brandProfileId: 'bp-1',
				textCategory: 'unknown',
				textKey: 'something',
				value: 'test',
				userId: 'user-1'
			})
		).toThrow('No profile field mapping');
	});
});

// ─── Tests for push-to-profile UI logic ─────────────────────────

describe('Push to Profile - UI behavior', () => {
	/**
	 * Determines if a text asset can be pushed to a profile field.
	 * Shows the "Push to Profile" button only for text assets that map to a profile field.
	 */
	function canPushToProfile(category: string, key: string): boolean {
		return getMatchingProfileField(category, key) !== null;
	}

	it('should show push button for vision_statement', () => {
		expect(canPushToProfile('messaging', 'vision_statement')).toBe(true);
	});

	it('should show push button for tagline', () => {
		expect(canPushToProfile('messaging', 'tagline')).toBe(true);
	});

	it('should show push button for brand_name', () => {
		expect(canPushToProfile('names', 'brand_name')).toBe(true);
	});

	it('should show push button for tone_of_voice', () => {
		expect(canPushToProfile('voice', 'tone')).toBe(true);
	});

	it('should NOT show push button for copyright_notice', () => {
		expect(canPushToProfile('legal', 'copyright_notice')).toBe(false);
	});

	it('should NOT show push button for social media bio', () => {
		expect(canPushToProfile('social', 'twitter_bio')).toBe(false);
	});

	it('should NOT show push button for unmapped descriptions key', () => {
		expect(canPushToProfile('descriptions', 'boilerplate')).toBe(false);
	});

	// All mapped fields should be pushable
	it('should be pushable for every field in FIELD_TO_TEXT_MAPPING', () => {
		for (const [, mapping] of Object.entries(FIELD_TO_TEXT_MAPPING)) {
			const primaryKey = mapping.keys[0];
			expect(
				canPushToProfile(mapping.category, primaryKey),
				`${mapping.category}/${primaryKey} should be pushable`
			).toBe(true);
		}
	});
});
