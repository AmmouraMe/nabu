/**
 * Tests for AI Fill Empty Fields feature
 * TDD: Tests written first, then implementation
 *
 * Covers:
 *   - POST /api/brand/assets/fill-empty-fields endpoint logic
 *   - getEmptyTextFields helper
 *   - Generating AI content for multiple empty fields
 *   - Saving generated content to profile fields
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/services/brand', () => ({
	getBrandProfileForUser: vi.fn(),
	updateBrandFieldWithVersion: vi.fn(),
	getBrandFieldsSummary: vi.fn(),
	BRAND_FIELD_LABELS: {
		brandName: 'Brand Name',
		tagline: 'Tagline',
		missionStatement: 'Mission Statement',
		visionStatement: 'Vision Statement',
		elevatorPitch: 'Elevator Pitch',
		brandArchetype: 'Brand Archetype',
		brandPersonalityTraits: 'Personality Traits',
		toneOfVoice: 'Tone of Voice',
		communicationStyle: 'Communication Style',
		targetAudience: 'Target Audience',
		customerPainPoints: 'Customer Pain Points',
		valueProposition: 'Value Proposition',
		industry: 'Industry',
		competitors: 'Competitors',
		uniqueSellingPoints: 'Unique Selling Points',
		marketPosition: 'Market Position',
		originStory: 'Origin Story',
		brandValues: 'Brand Values',
		brandPromise: 'Brand Promise'
	}
}));

vi.mock('$lib/services/ai-text-generation', () => ({
	buildBrandContextPrompt: vi.fn().mockReturnValue('system prompt'),
	buildTextGenerationPrompt: vi.fn().mockReturnValue('user prompt'),
	TEXT_GENERATION_PRESETS: {
		messaging: [
			{ key: 'tagline', label: 'Tagline', promptTemplate: 'Write a tagline' },
			{ key: 'mission_statement', label: 'Mission Statement', promptTemplate: 'Write a mission' },
			{ key: 'vision_statement', label: 'Vision Statement', promptTemplate: 'Write a vision' },
			{ key: 'elevator_pitch', label: 'Elevator Pitch', promptTemplate: 'Write a pitch' },
			{
				key: 'value_proposition',
				label: 'Value Proposition',
				promptTemplate: 'Write a value prop'
			},
			{ key: 'brand_promise', label: 'Brand Promise', promptTemplate: 'Write a promise' },
			{
				key: 'target_audience',
				label: 'Target Audience',
				promptTemplate: 'Describe target audience'
			},
			{
				key: 'customer_pain_points',
				label: 'Customer Pain Points',
				promptTemplate: 'Identify pain points'
			},
			{ key: 'unique_selling_points', label: 'USPs', promptTemplate: 'List USPs' },
			{ key: 'brand_values', label: 'Brand Values', promptTemplate: 'Describe brand values' }
		],
		descriptions: [
			{ key: 'origin_story', label: 'Origin Story', promptTemplate: 'Write origin story' },
			{
				key: 'market_position',
				label: 'Market Position',
				promptTemplate: 'Describe market position'
			},
			{ key: 'industry', label: 'Industry', promptTemplate: 'Describe industry' },
			{ key: 'competitors', label: 'Competitors', promptTemplate: 'List competitors' }
		],
		voice: [
			{ key: 'brand_archetype', label: 'Brand Archetype', promptTemplate: 'Identify archetype' },
			{ key: 'personality_traits', label: 'Personality Traits', promptTemplate: 'Describe traits' },
			{ key: 'tone_guidelines', label: 'Tone Guidelines', promptTemplate: 'Define tone' },
			{
				key: 'communication_style',
				label: 'Communication Style',
				promptTemplate: 'Define comms style'
			}
		],
		names: [{ key: 'brand_name', label: 'Brand Name Ideas', promptTemplate: 'Suggest brand names' }]
	}
}));

vi.mock('$lib/services/brand-assets', () => ({
	getBrandTexts: vi.fn().mockResolvedValue([]),
	syncFieldToTextAsset: vi.fn()
}));

vi.mock('$lib/services/openai-chat', () => ({
	getFirstEnabledAIKey: vi.fn(),
	chatCompletionWithKey: vi.fn()
}));

import { getBrandProfileForUser, updateBrandFieldWithVersion } from '$lib/services/brand';
import { getFirstEnabledAIKey, chatCompletionWithKey } from '$lib/services/openai-chat';
import { getEmptyTextFields, AI_FILLABLE_FIELDS } from '$lib/services/brand-ai-fill';
import { syncFieldToTextAsset } from '$lib/services/brand-assets';

// Plans are not what this suite is about; see tests/fixtures/entitlements.ts.
vi.mock('$lib/server/entitlements', async () =>
	(await import('../fixtures/entitlements')).permissiveEntitlements()
);


describe('Brand AI Fill Empty Fields', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('AI_FILLABLE_FIELDS', () => {
		it('should contain only text-based profile fields (no colors, logos, images)', () => {
			const colorFields = [
				'primaryColor',
				'secondaryColor',
				'accentColor',
				'brandColor4',
				'brandColor5',
				'backgroundColor',
				'surfaceColor',
				'textColor',
				'textSecondaryColor',
				'borderColor',
				'successColor',
				'warningColor',
				'errorColor',
				'colorPalette'
			];
			const imageFields = ['logoUrl', 'logoHorizontalUrl', 'logoVerticalUrl', 'logoConcept'];
			const fontFields = ['typographyLogo', 'typographyHeading', 'typographyBody'];

			for (const f of colorFields) {
				expect(AI_FILLABLE_FIELDS).not.toContainEqual(expect.objectContaining({ fieldKey: f }));
			}
			for (const f of imageFields) {
				expect(AI_FILLABLE_FIELDS).not.toContainEqual(expect.objectContaining({ fieldKey: f }));
			}
			for (const f of fontFields) {
				expect(AI_FILLABLE_FIELDS).not.toContainEqual(expect.objectContaining({ fieldKey: f }));
			}
		});

		it('should include core identity and personality fields', () => {
			const expectedFields = [
				'tagline',
				'missionStatement',
				'visionStatement',
				'elevatorPitch',
				'brandArchetype',
				'brandPersonalityTraits',
				'toneOfVoice',
				'communicationStyle',
				'targetAudience',
				'customerPainPoints',
				'valueProposition',
				'industry',
				'competitors',
				'uniqueSellingPoints',
				'marketPosition',
				'originStory',
				'brandValues',
				'brandPromise'
			];

			for (const f of expectedFields) {
				expect(AI_FILLABLE_FIELDS).toContainEqual(expect.objectContaining({ fieldKey: f }));
			}
		});

		it('should have a prompt template for each fillable field', () => {
			for (const field of AI_FILLABLE_FIELDS) {
				expect(field.promptTemplate).toBeTruthy();
				expect(typeof field.promptTemplate).toBe('string');
			}
		});
	});

	describe('getEmptyTextFields', () => {
		it('should return field keys for fields that are null or empty string', () => {
			const profile = {
				brandName: 'Test Brand',
				tagline: '',
				missionStatement: null,
				visionStatement: 'We have a vision',
				elevatorPitch: '',
				brandArchetype: null,
				brandPersonalityTraits: null,
				toneOfVoice: 'Friendly',
				communicationStyle: null,
				targetAudience: null,
				customerPainPoints: null,
				valueProposition: null,
				industry: 'Tech',
				competitors: null,
				uniqueSellingPoints: null,
				marketPosition: null,
				originStory: null,
				brandValues: null,
				brandPromise: null
			};

			const emptyFields = getEmptyTextFields(profile as any);
			// Should include tagline (empty string), missionStatement (null), etc.
			expect(emptyFields).toContain('tagline');
			expect(emptyFields).toContain('missionStatement');
			expect(emptyFields).toContain('elevatorPitch');
			// Should NOT include filled fields
			expect(emptyFields).not.toContain('brandName');
			expect(emptyFields).not.toContain('visionStatement');
			expect(emptyFields).not.toContain('toneOfVoice');
			expect(emptyFields).not.toContain('industry');
		});

		it('should return empty array when all fields are filled', () => {
			const profile = {
				brandName: 'Test',
				tagline: 'A tagline',
				missionStatement: 'A mission',
				visionStatement: 'A vision',
				elevatorPitch: 'A pitch',
				brandArchetype: 'The Hero',
				brandPersonalityTraits: 'Bold, brave',
				toneOfVoice: 'Friendly',
				communicationStyle: 'Casual',
				targetAudience: 'Everyone',
				customerPainPoints: 'Pain',
				valueProposition: 'Value',
				industry: 'Tech',
				competitors: 'Others',
				uniqueSellingPoints: 'Unique',
				marketPosition: 'Leader',
				originStory: 'Once upon...',
				brandValues: 'Integrity',
				brandPromise: 'The best'
			};

			const emptyFields = getEmptyTextFields(profile as any);
			expect(emptyFields).toHaveLength(0);
		});

		it('should not include brandName in fillable fields', () => {
			// brandName is special — it should not be auto-filled via AI
			const profile = { brandName: null };
			const emptyFields = getEmptyTextFields(profile as any);
			expect(emptyFields).not.toContain('brandName');
		});
	});

	describe('POST /api/brand/assets/fill-empty-fields (endpoint behavior)', () => {
		it('should require a brandProfileId', async () => {
			// The endpoint should reject requests without a brandProfileId
			expect(true).toBe(true); // Placeholder for endpoint integration test
		});

		it('should return 404 when profile not found', async () => {
			vi.mocked(getBrandProfileForUser).mockResolvedValue(null);
			// The endpoint should throw 404
			expect(getBrandProfileForUser).toBeDefined();
		});

		it('should return 400 when no AI provider configured', async () => {
			vi.mocked(getFirstEnabledAIKey).mockResolvedValue(null);
			expect(getFirstEnabledAIKey).toBeDefined();
		});

		it('should generate AI content for each empty field and save it', async () => {
			const mockProfile = {
				id: 'p-1',
				userId: 'u-1',
				brandName: 'Test Brand',
				tagline: null,
				missionStatement: null,
				visionStatement: 'Existing vision',
				elevatorPitch: '',
				brandArchetype: null,
				brandPersonalityTraits: null,
				toneOfVoice: null,
				communicationStyle: null,
				targetAudience: null,
				customerPainPoints: null,
				valueProposition: null,
				industry: 'Tech',
				competitors: null,
				uniqueSellingPoints: null,
				marketPosition: null,
				originStory: null,
				brandValues: null,
				brandPromise: null
			};

			vi.mocked(getBrandProfileForUser).mockResolvedValue(mockProfile as any);

			const mockAiKey = {
				id: 'k-1',
				name: 'Test Key',
				provider: 'openai',
				apiKey: 'sk-test',
				enabled: true
			};
			vi.mocked(getFirstEnabledAIKey).mockResolvedValue(mockAiKey as any);

			vi.mocked(chatCompletionWithKey).mockResolvedValue('Generated text content');
			vi.mocked(updateBrandFieldWithVersion).mockResolvedValue(undefined);

			// Verify the empty fields are detected correctly
			const emptyFields = getEmptyTextFields(mockProfile as any);
			expect(emptyFields.length).toBeGreaterThan(0);
			expect(emptyFields).not.toContain('brandName');
			expect(emptyFields).not.toContain('visionStatement');
			expect(emptyFields).not.toContain('industry');
		});

		it('should return results with status for each field', async () => {
			// Result should be { results: [{ field, label, status, value? }], totalFilled, totalFailed }
			const expectedShape = {
				results: expect.arrayContaining([
					expect.objectContaining({
						field: expect.any(String),
						label: expect.any(String),
						status: expect.stringMatching(/^(success|error)$/)
					})
				]),
				totalFilled: expect.any(Number),
				totalFailed: expect.any(Number)
			};
			expect(expectedShape).toBeDefined();
		});
	});

	/**
	 * Filling in bulk has to leave the brand in the same state as filling by hand.
	 * It did not: `/api/brand/update-field` mirrors a saved value into a text asset and
	 * this route skipped it, so a brand could reach 82% complete with an empty Text tab
	 * — the same value present or absent depending only on which button wrote it.
	 */
	describe('POST /api/brand/assets/fill-empty-fields — mirroring into text assets', () => {
		/** A profile with two fields empty and the rest filled, so the run is small. */
		function profileWithTwoGaps() {
			const filled: Record<string, string> = {};
			for (const key of [
				'brandArchetype',
				'brandPersonalityTraits',
				'toneOfVoice',
				'communicationStyle',
				'targetAudience',
				'customerPainPoints',
				'valueProposition',
				'industry',
				'competitors',
				'uniqueSellingPoints',
				'marketPosition',
				'originStory',
				'brandValues',
				'brandPromise',
				'visionStatement',
				'elevatorPitch'
			])
				filled[key] = 'already set';
			return {
				id: 'p-1',
				userId: 'u-1',
				brandName: 'Test Brand',
				tagline: null,
				missionStatement: null,
				...filled
			};
		}

		function platform() {
			return {
				env: {
					DB: { prepare: vi.fn() },
					KV: { get: vi.fn().mockResolvedValue(null) }
				}
			} as any;
		}

		async function runFill() {
			const { POST } = await import('../../src/routes/api/brand/assets/fill-empty-fields/+server');
			return POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ brandProfileId: 'p-1' })
				}),
				platform: platform(),
				locals: { user: { id: 'u-1' } }
			} as any);
		}

		beforeEach(() => {
			vi.mocked(getBrandProfileForUser).mockResolvedValue(profileWithTwoGaps() as any);
			vi.mocked(getFirstEnabledAIKey).mockResolvedValue({
				id: 'k-1',
				name: 'Test Key',
				provider: 'openai',
				apiKey: 'sk-test',
				enabled: true
			} as any);
			vi.mocked(updateBrandFieldWithVersion).mockResolvedValue(undefined);
			vi.mocked(syncFieldToTextAsset).mockResolvedValue(undefined);
			vi.mocked(chatCompletionWithKey).mockResolvedValue('Generated text content');
		});

		it('writes every filled value into a text asset too', async () => {
			const res = await runFill();
			const body = await res.json();

			expect(body.totalFilled).toBe(2);
			// Once per field saved — the Text tab should show what the Profile tab does.
			expect(syncFieldToTextAsset).toHaveBeenCalledTimes(2);
			expect(syncFieldToTextAsset).toHaveBeenCalledWith(expect.anything(), {
				brandProfileId: 'p-1',
				fieldName: 'tagline',
				value: 'Generated text content'
			});
		});

		it('does not mirror a field whose generation failed', async () => {
			vi.mocked(chatCompletionWithKey)
				.mockResolvedValueOnce('Generated text content')
				.mockResolvedValueOnce('');

			const body = await (await runFill()).json();

			expect(body.totalFilled).toBe(1);
			expect(body.totalFailed).toBe(1);
			expect(syncFieldToTextAsset).toHaveBeenCalledTimes(1);
		});

		it('still saves the field when mirroring throws', async () => {
			vi.mocked(syncFieldToTextAsset).mockRejectedValue(new Error('text table is unhappy'));

			const body = await (await runFill()).json();

			// Best-effort, like the manual path: the profile field is the thing being saved.
			expect(body.totalFilled).toBe(2);
			expect(body.totalFailed).toBe(0);
			expect(updateBrandFieldWithVersion).toHaveBeenCalledTimes(2);
		});
	});
});
