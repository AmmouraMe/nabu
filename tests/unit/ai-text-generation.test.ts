/**
 * Tests for AI Text Generation Service
 * TDD: Tests written first, then implementation
 *
 * Provides AI-powered text generation for brand text assets,
 * using brand context (profile, existing texts) to produce
 * on-brand content either from a custom prompt or automatically.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	buildBrandContextPrompt,
	buildTextGenerationPrompt,
	TEXT_GENERATION_PRESETS,
	type AITextGenerationParams,
	type AITextGenerationResult
} from '$lib/services/ai-text-generation';

describe('AI Text Generation Service', () => {
	// ─── Preset Definitions ──────────────────────────────────────

	describe('TEXT_GENERATION_PRESETS', () => {
		it('should define presets for each text category', () => {
			expect(TEXT_GENERATION_PRESETS).toBeDefined();
			expect(typeof TEXT_GENERATION_PRESETS).toBe('object');

			// Should have presets for all text categories
			const expectedCategories = ['names', 'messaging', 'descriptions', 'legal', 'social', 'voice'];
			for (const cat of expectedCategories) {
				expect(TEXT_GENERATION_PRESETS[cat]).toBeDefined();
				expect(Array.isArray(TEXT_GENERATION_PRESETS[cat])).toBe(true);
				expect(TEXT_GENERATION_PRESETS[cat].length).toBeGreaterThan(0);
			}
		});

		it('should have label and promptTemplate for each preset', () => {
			for (const [category, presets] of Object.entries(TEXT_GENERATION_PRESETS)) {
				for (const preset of presets) {
					expect(preset.label).toBeDefined();
					expect(typeof preset.label).toBe('string');
					expect(preset.promptTemplate).toBeDefined();
					expect(typeof preset.promptTemplate).toBe('string');
					expect(preset.key).toBeDefined();
					expect(typeof preset.key).toBe('string');
				}
			}
		});

		it('should include common presets like tagline, elevator pitch, social bios', () => {
			const messagingKeys = TEXT_GENERATION_PRESETS.messaging.map((p) => p.key);
			expect(messagingKeys).toContain('tagline');
			expect(messagingKeys).toContain('elevator_pitch');

			const socialKeys = TEXT_GENERATION_PRESETS.social.map((p) => p.key);
			expect(socialKeys).toContain('twitter_bio');

			const descriptionKeys = TEXT_GENERATION_PRESETS.descriptions.map((p) => p.key);
			expect(descriptionKeys).toContain('short_bio');
		});

		it('should include brand_archetype and personality_traits in voice presets', () => {
			const voiceKeys = TEXT_GENERATION_PRESETS.voice.map((p) => p.key);
			expect(voiceKeys).toContain('brand_archetype');
			expect(voiceKeys).toContain('personality_traits');
		});
	});

	// ─── Brand Context Prompt Builder ────────────────────────────

	describe('buildBrandContextPrompt', () => {
		it('should build a system prompt from brand profile data', () => {
			const brandProfile = {
				brandName: 'Acme Corp',
				tagline: 'Building better things',
				industry: 'Technology',
				missionStatement: 'To empower businesses with innovative solutions',
				toneOfVoice: 'Professional but approachable',
				brandArchetype: 'The Creator',
				brandPersonalityTraits: 'innovative, reliable, bold'
			};

			const result = buildBrandContextPrompt(brandProfile);

			expect(result).toContain('Acme Corp');
			expect(result).toContain('Technology');
			expect(result).toContain('Building better things');
			expect(result).toContain('Professional but approachable');
			expect(result).toContain('The Creator');
		});

		it('should handle minimal brand profile gracefully', () => {
			const brandProfile = {
				brandName: 'Simple Brand'
			};

			const result = buildBrandContextPrompt(brandProfile);

			expect(result).toContain('Simple Brand');
			expect(typeof result).toBe('string');
			expect(result.length).toBeGreaterThan(0);
		});

		it('should include existing text assets as context when provided', () => {
			const brandProfile = {
				brandName: 'Acme Corp'
			};

			const existingTexts = [
				{
					category: 'messaging',
					key: 'tagline',
					label: 'Tagline',
					value: 'Building better things'
				},
				{
					category: 'descriptions',
					key: 'short_bio',
					label: 'Short Bio',
					value: 'Acme Corp is a tech company.'
				}
			];

			const result = buildBrandContextPrompt(brandProfile, existingTexts);

			expect(result).toContain('Building better things');
			expect(result).toContain('Acme Corp is a tech company');
		});

		it('should handle array personality traits by joining them', () => {
			const brandProfile = {
				brandName: 'Test Brand',
				brandPersonalityTraits: 'bold, creative, trustworthy'
			};

			const result = buildBrandContextPrompt(brandProfile);

			expect(result).toContain('bold');
			expect(result).toContain('creative');
			expect(result).toContain('trustworthy');
		});
	});

	// ─── Text Generation Prompt Builder ──────────────────────────

	describe('buildTextGenerationPrompt', () => {
		it('should build a user prompt for custom text generation', () => {
			const params: AITextGenerationParams = {
				brandProfileId: 'brand-1',
				category: 'messaging',
				key: 'tagline',
				label: 'Tagline',
				customPrompt: 'Write a catchy tagline for a tech startup'
			};

			const result = buildTextGenerationPrompt(params);

			expect(result).toContain('tagline');
			expect(result).toContain('catchy tagline');
		});

		it('should build a prompt from preset when no custom prompt given', () => {
			const params: AITextGenerationParams = {
				brandProfileId: 'brand-1',
				category: 'messaging',
				key: 'tagline',
				label: 'Tagline'
			};

			const result = buildTextGenerationPrompt(params);

			expect(result).toContain('Tagline');
			expect(typeof result).toBe('string');
			expect(result.length).toBeGreaterThan(0);
		});

		it('should include category and key context in the prompt', () => {
			const params: AITextGenerationParams = {
				brandProfileId: 'brand-1',
				category: 'social',
				key: 'twitter_bio',
				label: 'Twitter Bio',
				customPrompt: 'Make it witty and under 160 characters'
			};

			const result = buildTextGenerationPrompt(params);

			expect(result).toContain('Twitter Bio');
			expect(result).toContain('witty');
		});

		it('should handle auto-generation with just category context', () => {
			const params: AITextGenerationParams = {
				brandProfileId: 'brand-1',
				category: 'descriptions',
				key: 'about_us',
				label: 'About Us'
			};

			const result = buildTextGenerationPrompt(params);

			expect(result).toContain('About Us');
		});
	});

	// ─── Type Validation ─────────────────────────────────────────

	describe('AITextGenerationParams type', () => {
		it('should accept minimal required fields', () => {
			const params: AITextGenerationParams = {
				brandProfileId: 'brand-1',
				category: 'messaging',
				key: 'tagline',
				label: 'Tagline'
			};

			expect(params.brandProfileId).toBe('brand-1');
			expect(params.category).toBe('messaging');
			expect(params.customPrompt).toBeUndefined();
		});

		it('should accept optional customPrompt', () => {
			const params: AITextGenerationParams = {
				brandProfileId: 'brand-1',
				category: 'messaging',
				key: 'tagline',
				label: 'Tagline',
				customPrompt: 'Write something creative'
			};

			expect(params.customPrompt).toBe('Write something creative');
		});
	});

	describe('AITextGenerationResult type', () => {
		it('should have the expected shape', () => {
			const result: AITextGenerationResult = {
				text: 'Generated tagline here',
				tokensUsed: 42,
				model: 'gpt-4o-mini'
			};

			expect(result.text).toBe('Generated tagline here');
			expect(result.tokensUsed).toBe(42);
			expect(result.model).toBe('gpt-4o-mini');
		});
	});
});
