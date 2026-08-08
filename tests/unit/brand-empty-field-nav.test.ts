/**
 * Tests for Brand Profile - Field click → Text tab navigation
 * TDD: When a user clicks any profile field that has a text mapping,
 * they should be navigated to the Text tab:
 * - If a matching text asset exists: open its editor directly
 * - If no matching text asset: open the add form pre-filled with the field value
 * Fields without text mappings (colors, lists, etc.) stay inline.
 */
import { describe, it, expect } from 'vitest';
import { FIELD_TO_TEXT_MAPPING, FIELD_TO_PRESET_KEY, IMAGE_FIELDS } from '$lib/services/brand';
import { TEXT_GENERATION_PRESETS } from '$lib/services/ai-text-generation';

/**
 * Determines how clicking a profile field should behave.
 * Returns:
 * - { action: 'navigate', category, presetKey } for fields with text mapping
 * - null for fields without text mapping (use inline edit)
 */
function getFieldClickAction(
	fieldKey: string
): { action: 'navigate'; category: string; presetKey: string } | null {
	const preset = FIELD_TO_PRESET_KEY[fieldKey];
	if (!preset) return null;

	return { action: 'navigate', category: preset.category, presetKey: preset.presetKey };
}

interface TextAssetStub {
	id: string;
	category: string;
	key: string;
	value: string;
}

/**
 * Simulates what happens after text assets load:
 * - Find matching text asset by category + key → return it for editing
 * - No match → return null (should open add form pre-filled)
 */
function findMatchingTextAsset(
	textAssets: TextAssetStub[],
	category: string,
	presetKey: string
): TextAssetStub | null {
	return textAssets.find((t) => t.category === category && t.key === presetKey) ?? null;
}

describe('Brand Profile - Field click → Text tab navigation', () => {
	describe('getFieldClickAction', () => {
		it('should return navigate for visionStatement (empty)', () => {
			const result = getFieldClickAction('visionStatement');
			expect(result).toEqual({
				action: 'navigate',
				category: 'messaging',
				presetKey: 'vision_statement'
			});
		});

		it('should return navigate for missionStatement', () => {
			const result = getFieldClickAction('missionStatement');
			expect(result).toEqual({
				action: 'navigate',
				category: 'messaging',
				presetKey: 'mission_statement'
			});
		});

		it('should return navigate for tagline', () => {
			const result = getFieldClickAction('tagline');
			expect(result).toEqual({ action: 'navigate', category: 'messaging', presetKey: 'tagline' });
		});

		it('should return navigate for elevatorPitch', () => {
			const result = getFieldClickAction('elevatorPitch');
			expect(result).toEqual({
				action: 'navigate',
				category: 'messaging',
				presetKey: 'elevator_pitch'
			});
		});

		it('should return navigate for originStory', () => {
			const result = getFieldClickAction('originStory');
			expect(result).toEqual({
				action: 'navigate',
				category: 'descriptions',
				presetKey: 'origin_story'
			});
		});

		it('should return navigate for brandName', () => {
			const result = getFieldClickAction('brandName');
			expect(result).toEqual({ action: 'navigate', category: 'names', presetKey: 'brand_name' });
		});

		it('should return navigate for toneOfVoice', () => {
			const result = getFieldClickAction('toneOfVoice');
			expect(result).toEqual({
				action: 'navigate',
				category: 'voice',
				presetKey: 'tone_guidelines'
			});
		});

		it('should return null for fields without text mapping (primaryColor)', () => {
			expect(getFieldClickAction('primaryColor')).toBeNull();
		});

		it('should return null for fields without text mapping (secondaryColor)', () => {
			expect(getFieldClickAction('secondaryColor')).toBeNull();
		});

		it('should return null for unknown field keys', () => {
			expect(getFieldClickAction('unknownField')).toBeNull();
		});

		it('should always navigate to Text tab regardless of current value', () => {
			// Both empty and filled fields with text mappings navigate to Text tab
			const resultEmpty = getFieldClickAction('visionStatement');
			expect(resultEmpty).not.toBeNull();
			// Same result — navigation decision doesn't depend on value
			const resultFilled = getFieldClickAction('visionStatement');
			expect(resultFilled).toEqual(resultEmpty);
		});
	});

	describe('findMatchingTextAsset - post-load matching', () => {
		const mockAssets: TextAssetStub[] = [
			{ id: 'txt-1', category: 'messaging', key: 'vision_statement', value: 'We envision...' },
			{ id: 'txt-2', category: 'messaging', key: 'tagline', value: 'Just do it' },
			{ id: 'txt-3', category: 'names', key: 'brand_name', value: 'Acme Corp' },
			{ id: 'txt-4', category: 'voice', key: 'tone_guidelines', value: 'Professional' }
		];

		it('should find matching vision_statement text asset', () => {
			const result = findMatchingTextAsset(mockAssets, 'messaging', 'vision_statement');
			expect(result).toEqual({
				id: 'txt-1',
				category: 'messaging',
				key: 'vision_statement',
				value: 'We envision...'
			});
		});

		it('should find matching tagline text asset', () => {
			const result = findMatchingTextAsset(mockAssets, 'messaging', 'tagline');
			expect(result).toEqual({
				id: 'txt-2',
				category: 'messaging',
				key: 'tagline',
				value: 'Just do it'
			});
		});

		it('should find matching brand_name text asset', () => {
			const result = findMatchingTextAsset(mockAssets, 'names', 'brand_name');
			expect(result).toEqual({
				id: 'txt-3',
				category: 'names',
				key: 'brand_name',
				value: 'Acme Corp'
			});
		});

		it('should find matching tone_guidelines text asset', () => {
			const result = findMatchingTextAsset(mockAssets, 'voice', 'tone_guidelines');
			expect(result).toEqual({
				id: 'txt-4',
				category: 'voice',
				key: 'tone_guidelines',
				value: 'Professional'
			});
		});

		it('should return null when no matching text asset exists', () => {
			const result = findMatchingTextAsset(mockAssets, 'messaging', 'mission_statement');
			expect(result).toBeNull();
		});

		it('should return null for empty text assets array', () => {
			const result = findMatchingTextAsset([], 'messaging', 'vision_statement');
			expect(result).toBeNull();
		});

		it('should not match wrong category even with correct key', () => {
			const result = findMatchingTextAsset(mockAssets, 'descriptions', 'tagline');
			expect(result).toBeNull();
		});

		it('should not match wrong key even with correct category', () => {
			const result = findMatchingTextAsset(mockAssets, 'messaging', 'brand_promise');
			expect(result).toBeNull();
		});
	});

	describe('FIELD_TO_PRESET_KEY - direct field → preset mapping', () => {
		it('should map every field in FIELD_TO_TEXT_MAPPING', () => {
			for (const fieldKey of Object.keys(FIELD_TO_TEXT_MAPPING)) {
				expect(FIELD_TO_PRESET_KEY[fieldKey]).toBeDefined();
				expect(FIELD_TO_PRESET_KEY[fieldKey].category).toBe(
					FIELD_TO_TEXT_MAPPING[fieldKey].category
				);
			}
		});

		it('should map visionStatement → messaging/vision_statement', () => {
			expect(FIELD_TO_PRESET_KEY.visionStatement).toEqual({
				category: 'messaging',
				presetKey: 'vision_statement'
			});
		});

		it('should map missionStatement → messaging/mission_statement', () => {
			expect(FIELD_TO_PRESET_KEY.missionStatement).toEqual({
				category: 'messaging',
				presetKey: 'mission_statement'
			});
		});

		it('should map tagline → messaging/tagline', () => {
			expect(FIELD_TO_PRESET_KEY.tagline).toEqual({ category: 'messaging', presetKey: 'tagline' });
		});

		it('should map elevatorPitch → messaging/elevator_pitch', () => {
			expect(FIELD_TO_PRESET_KEY.elevatorPitch).toEqual({
				category: 'messaging',
				presetKey: 'elevator_pitch'
			});
		});

		it('should map valueProposition → messaging/value_proposition', () => {
			expect(FIELD_TO_PRESET_KEY.valueProposition).toEqual({
				category: 'messaging',
				presetKey: 'value_proposition'
			});
		});

		it('should map brandPromise → messaging/brand_promise', () => {
			expect(FIELD_TO_PRESET_KEY.brandPromise).toEqual({
				category: 'messaging',
				presetKey: 'brand_promise'
			});
		});

		it('should map brandName → names/brand_name', () => {
			expect(FIELD_TO_PRESET_KEY.brandName).toEqual({ category: 'names', presetKey: 'brand_name' });
		});

		it('should map toneOfVoice → voice/tone_guidelines', () => {
			expect(FIELD_TO_PRESET_KEY.toneOfVoice).toEqual({
				category: 'voice',
				presetKey: 'tone_guidelines'
			});
		});

		it('should map communicationStyle → voice/communication_style', () => {
			expect(FIELD_TO_PRESET_KEY.communicationStyle).toEqual({
				category: 'voice',
				presetKey: 'communication_style'
			});
		});

		it('should map brandArchetype → voice/brand_archetype', () => {
			expect(FIELD_TO_PRESET_KEY.brandArchetype).toEqual({
				category: 'voice',
				presetKey: 'brand_archetype'
			});
		});

		it('should map brandPersonalityTraits → voice/personality_traits', () => {
			expect(FIELD_TO_PRESET_KEY.brandPersonalityTraits).toEqual({
				category: 'voice',
				presetKey: 'personality_traits'
			});
		});

		it('should map originStory → descriptions/origin_story', () => {
			expect(FIELD_TO_PRESET_KEY.originStory).toEqual({
				category: 'descriptions',
				presetKey: 'origin_story'
			});
		});

		it('should map marketPosition → descriptions/market_position', () => {
			expect(FIELD_TO_PRESET_KEY.marketPosition).toEqual({
				category: 'descriptions',
				presetKey: 'market_position'
			});
		});

		it('should map industry → descriptions/industry', () => {
			expect(FIELD_TO_PRESET_KEY.industry).toEqual({
				category: 'descriptions',
				presetKey: 'industry'
			});
		});

		it('should NOT include logoConcept (it navigates to Images tab)', () => {
			expect(FIELD_TO_PRESET_KEY.logoConcept).toBeUndefined();
		});
	});

	describe('Every preset key in FIELD_TO_PRESET_KEY exists in TEXT_GENERATION_PRESETS', () => {
		it('should have a matching preset for every mapped field', () => {
			for (const [fieldKey, { category, presetKey }] of Object.entries(FIELD_TO_PRESET_KEY)) {
				const presets = TEXT_GENERATION_PRESETS[category];
				expect(
					presets,
					`Missing preset category "${category}" for field "${fieldKey}"`
				).toBeDefined();
				const match = presets.find((p) => p.key === presetKey);
				expect(
					match,
					`No preset with key "${presetKey}" in category "${category}" for field "${fieldKey}"`
				).toBeDefined();
			}
		});
	});

	describe('IMAGE_FIELDS - fields that navigate to Images tab', () => {
		it('should include logoConcept', () => {
			expect(IMAGE_FIELDS.has('logoConcept')).toBe(true);
		});

		it('should NOT include text-mapped fields', () => {
			expect(IMAGE_FIELDS.has('tagline')).toBe(false);
			expect(IMAGE_FIELDS.has('brandName')).toBe(false);
			expect(IMAGE_FIELDS.has('originStory')).toBe(false);
		});

		it('logoConcept should NOT be in FIELD_TO_TEXT_MAPPING', () => {
			expect(FIELD_TO_TEXT_MAPPING.logoConcept).toBeUndefined();
		});

		it('logoConcept should NOT be in FIELD_TO_PRESET_KEY', () => {
			expect(FIELD_TO_PRESET_KEY.logoConcept).toBeUndefined();
		});
	});
});
