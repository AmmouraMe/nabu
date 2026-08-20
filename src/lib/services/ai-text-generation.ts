/**
 * AI Text Generation Service
 * Generates brand-aligned text content using OpenAI chat completions.
 * Builds context from the brand profile and existing text assets to produce
 * on-brand copy for taglines, bios, social media, legal text, and more.
 */

import type { TextAssetCategory } from '$lib/types/brand-assets';

// ─── Types ───────────────────────────────────────────────────────

/** Parameters for requesting AI text generation */
export interface AITextGenerationParams {
	brandProfileId: string;
	category: TextAssetCategory | string;
	key: string;
	label: string;
	/** Optional custom prompt — if omitted, auto-generates based on category/key */
	customPrompt?: string;
}

/** Result of an AI text generation */
export interface AITextGenerationResult {
	text: string;
	tokensUsed?: number;
	model: string;
}

/** A preset template for a specific type of brand text */
export interface TextGenerationPreset {
	key: string;
	label: string;
	promptTemplate: string;
}

/** Minimal brand context used for prompt building */
export interface BrandContext {
	brandName?: string;
	tagline?: string;
	industry?: string;
	missionStatement?: string;
	visionStatement?: string;
	elevatorPitch?: string;
	toneOfVoice?: string;
	communicationStyle?: string;
	brandArchetype?: string;
	brandPersonalityTraits?: string;
	valueProposition?: string;
	targetAudience?: string;
	brandValues?: string;
	brandPromise?: string;
	marketPosition?: string;
	originStory?: string;
}

/** Existing text asset used as additional context */
export interface ExistingTextContext {
	category: string;
	key: string;
	label: string;
	value: string;
}

// ─── Presets ─────────────────────────────────────────────────────

/** Pre-built generation presets organized by text category */
export const TEXT_GENERATION_PRESETS: Record<string, TextGenerationPreset[]> = {
	names: [
		{
			key: 'brand_name',
			label: 'Brand Name Ideas',
			promptTemplate:
				'Suggest 3 creative brand name ideas that reflect the brand identity and industry.'
		},
		{
			key: 'legal_name',
			label: 'Legal Business Name',
			promptTemplate: 'Suggest a formal legal business name suitable for registration.'
		},
		{
			key: 'abbreviation',
			label: 'Brand Abbreviation',
			promptTemplate: 'Create a short abbreviation or acronym for the brand name.'
		}
	],
	messaging: [
		{
			key: 'tagline',
			label: 'Tagline',
			promptTemplate:
				'Write a memorable, concise tagline (under 10 words) that captures the brand essence.'
		},
		{
			key: 'elevator_pitch',
			label: 'Elevator Pitch',
			promptTemplate:
				'Write a compelling 30-second elevator pitch (2-3 sentences) that explains what the brand does and why it matters.'
		},
		{
			key: 'slogan',
			label: 'Slogan',
			promptTemplate: 'Create a catchy, memorable slogan that reinforces the brand positioning.'
		},
		{
			key: 'value_proposition',
			label: 'Value Proposition',
			promptTemplate:
				'Write a clear value proposition statement that explains the unique benefit the brand offers to its target audience.'
		},
		{
			key: 'mission_statement',
			label: 'Mission Statement',
			promptTemplate:
				"Write a clear, inspiring mission statement (1-2 sentences) that defines the brand's purpose and what it aims to achieve for its customers."
		},
		{
			key: 'vision_statement',
			label: 'Vision Statement',
			promptTemplate:
				'Write a forward-looking vision statement (1-2 sentences) that describes the future the brand is working to create.'
		},
		{
			key: 'brand_promise',
			label: 'Brand Promise',
			promptTemplate:
				'Write a concise brand promise (1 sentence) that communicates the core commitment the brand makes to its customers.'
		},
		{
			key: 'target_audience',
			label: 'Target Audience',
			promptTemplate:
				'Describe the ideal target audience for this brand, including key demographics, interests, and behaviors in 2-4 sentences.'
		},
		{
			key: 'customer_pain_points',
			label: 'Customer Pain Points',
			promptTemplate:
				'Identify the top customer pain points this brand addresses, describing each in a brief sentence.'
		},
		{
			key: 'unique_selling_points',
			label: 'Unique Selling Points',
			promptTemplate:
				'List the unique selling points that differentiate this brand from competitors, describing each in a brief sentence.'
		},
		{
			key: 'brand_values',
			label: 'Brand Values',
			promptTemplate:
				'Describe the core values that guide this brand, explaining what each value means in the context of the brand identity.'
		}
	],
	descriptions: [
		{
			key: 'short_bio',
			label: 'Short Bio',
			promptTemplate:
				'Write a concise brand bio (2-3 sentences, under 50 words) suitable for profiles and directory listings.'
		},
		{
			key: 'long_bio',
			label: 'Long Bio',
			promptTemplate:
				'Write a detailed brand bio (150-200 words) covering who the brand is, what it does, and its mission.'
		},
		{
			key: 'about_us',
			label: 'About Us',
			promptTemplate:
				'Write an engaging "About Us" page section (200-300 words) that tells the brand story and connects with the audience.'
		},
		{
			key: 'boilerplate',
			label: 'Press Boilerplate',
			promptTemplate:
				'Write a professional press boilerplate paragraph (3-4 sentences) for use in press releases and media kits.'
		},
		{
			key: 'origin_story',
			label: 'Origin Story',
			promptTemplate:
				'Write a compelling origin story (200-300 words) about how and why the brand was founded, including the problem it set out to solve.'
		},
		{
			key: 'market_position',
			label: 'Market Position',
			promptTemplate:
				'Write a market positioning statement (2-3 sentences) that defines where the brand sits in its industry and what differentiates it from competitors.'
		},
		{
			key: 'industry',
			label: 'Industry Description',
			promptTemplate:
				'Write a brief industry description (1-2 sentences) that defines the market or sector the brand operates in.'
		},
		{
			key: 'competitors',
			label: 'Competitors',
			promptTemplate:
				'Identify the main competitors for this brand, briefly describing each and what they offer in the same market.'
		},
		{
			key: 'logo_concept',
			label: 'Logo Concept',
			promptTemplate:
				'Describe a logo concept (3-5 sentences) that visually represents the brand identity, including suggested shapes, symbols, and visual metaphors.'
		}
	],
	legal: [
		{
			key: 'copyright_notice',
			label: 'Copyright Notice',
			promptTemplate: 'Write a standard copyright notice for the brand, including the current year.'
		},
		{
			key: 'trademark_text',
			label: 'Trademark Statement',
			promptTemplate: 'Write a brief trademark attribution statement for the brand name and logo.'
		},
		{
			key: 'disclaimer',
			label: 'General Disclaimer',
			promptTemplate: 'Write a general disclaimer for the brand website or marketing materials.'
		}
	],
	social: [
		{
			key: 'twitter_bio',
			label: 'Twitter/X Bio',
			promptTemplate:
				'Write a Twitter/X bio (under 160 characters) that is concise, engaging, and on-brand.'
		},
		{
			key: 'instagram_bio',
			label: 'Instagram Bio',
			promptTemplate:
				'Write an Instagram bio (under 150 characters) with personality, including a call to action.'
		},
		{
			key: 'linkedin_summary',
			label: 'LinkedIn Summary',
			promptTemplate:
				'Write a professional LinkedIn company summary (100-200 words) that highlights expertise and value.'
		},
		{
			key: 'youtube_description',
			label: 'YouTube Channel Description',
			promptTemplate:
				'Write a YouTube channel description (100-150 words) that explains what viewers can expect.'
		}
	],
	voice: [
		{
			key: 'brand_archetype',
			label: 'Brand Archetype',
			promptTemplate:
				'Identify the brand archetype (based on the 12 Jungian archetypes) that best fits this brand, and explain in 2-3 sentences why it is the right fit.'
		},
		{
			key: 'personality_traits',
			label: 'Personality Traits',
			promptTemplate:
				"List 5-7 key personality traits that define this brand's character, with a brief explanation of how each trait manifests in the brand's communications and behavior."
		},
		{
			key: 'tone_guidelines',
			label: 'Tone Guidelines',
			promptTemplate:
				'Write tone-of-voice guidelines (5-8 bullet points) describing how the brand should sound in all communications.'
		},
		{
			key: 'vocabulary',
			label: 'Brand Vocabulary',
			promptTemplate:
				'List 10-15 key words and phrases the brand should use frequently, plus 5-10 words to avoid.'
		},
		{
			key: 'writing_style',
			label: 'Writing Style Guide',
			promptTemplate:
				'Write a brief writing style guide covering sentence length, formality level, punctuation preferences, and formatting rules.'
		},
		{
			key: 'communication_style',
			label: 'Communication Style',
			promptTemplate:
				"Define the brand's communication style (3-5 sentences) covering how formal or casual the brand is, preferred sentence structures, and how it engages with different audiences."
		}
	]
};

// ─── Prompt Builders ─────────────────────────────────────────────

/**
 * Build a system prompt that provides brand context to the AI.
 * Used as the system message in chat completions.
 */
export function buildBrandContextPrompt(
	brandProfile: BrandContext,
	existingTexts?: ExistingTextContext[]
): string {
	const parts: string[] = [
		'You are a professional brand copywriter. Generate text that is perfectly aligned with the brand identity described below.',
		''
	];

	// Core identity
	parts.push('## Brand Identity');
	if (brandProfile.brandName) {
		parts.push(`- **Brand Name**: ${brandProfile.brandName}`);
	}
	if (brandProfile.industry) {
		parts.push(`- **Industry**: ${brandProfile.industry}`);
	}
	if (brandProfile.tagline) {
		parts.push(`- **Tagline**: ${brandProfile.tagline}`);
	}
	if (brandProfile.missionStatement) {
		parts.push(`- **Mission**: ${brandProfile.missionStatement}`);
	}
	if (brandProfile.visionStatement) {
		parts.push(`- **Vision**: ${brandProfile.visionStatement}`);
	}
	if (brandProfile.elevatorPitch) {
		parts.push(`- **Elevator Pitch**: ${brandProfile.elevatorPitch}`);
	}
	if (brandProfile.valueProposition) {
		parts.push(`- **Value Proposition**: ${brandProfile.valueProposition}`);
	}
	if (brandProfile.brandPromise) {
		parts.push(`- **Brand Promise**: ${brandProfile.brandPromise}`);
	}
	if (brandProfile.marketPosition) {
		parts.push(`- **Market Position**: ${brandProfile.marketPosition}`);
	}

	// Personality & Voice
	const hasPersonality =
		brandProfile.brandArchetype ||
		brandProfile.brandPersonalityTraits ||
		brandProfile.toneOfVoice ||
		brandProfile.communicationStyle;
	if (hasPersonality) {
		parts.push('');
		parts.push('## Brand Personality & Voice');
		if (brandProfile.brandArchetype) {
			parts.push(`- **Archetype**: ${brandProfile.brandArchetype}`);
		}
		if (brandProfile.brandPersonalityTraits) {
			parts.push(`- **Personality Traits**: ${brandProfile.brandPersonalityTraits}`);
		}
		if (brandProfile.toneOfVoice) {
			parts.push(`- **Tone of Voice**: ${brandProfile.toneOfVoice}`);
		}
		if (brandProfile.communicationStyle) {
			parts.push(`- **Communication Style**: ${brandProfile.communicationStyle}`);
		}
	}

	// Audience
	if (brandProfile.targetAudience) {
		parts.push('');
		parts.push('## Target Audience');
		parts.push(brandProfile.targetAudience);
	}

	// Brand values
	if (brandProfile.brandValues) {
		parts.push('');
		parts.push(`## Brand Values: ${brandProfile.brandValues}`);
	}

	// Origin story
	if (brandProfile.originStory) {
		parts.push('');
		parts.push(`## Origin Story`);
		parts.push(brandProfile.originStory);
	}

	// Existing text assets as context
	if (existingTexts && existingTexts.length > 0) {
		parts.push('');
		parts.push('## Existing Brand Copy (for consistency)');
		for (const text of existingTexts) {
			parts.push(`- **${text.label}** (${text.category}): ${text.value}`);
		}
	}

	parts.push('');
	parts.push('## Guidelines');
	parts.push('- Match the brand voice and tone exactly');
	parts.push('- Be authentic to the brand identity');
	parts.push(
		'- Output ONLY the requested text — no explanations, headers, or formatting unless asked'
	);
	parts.push('- Maintain consistency with any existing brand copy provided above');

	return parts.join('\n');
}

/**
 * Build the user message prompt for a specific text generation request.
 */
export function buildTextGenerationPrompt(params: AITextGenerationParams): string {
	// If there's a custom prompt, use it with context
	if (params.customPrompt) {
		return `Generate a "${params.label}" (category: ${params.category}, key: ${params.key}) for the brand.\n\nSpecific instructions: ${params.customPrompt}`;
	}

	// Look for a matching preset
	const categoryPresets = TEXT_GENERATION_PRESETS[params.category];
	if (categoryPresets) {
		const preset = categoryPresets.find((p) => p.key === params.key);
		if (preset) {
			return `Generate a "${params.label}" for the brand.\n\n${preset.promptTemplate}`;
		}
	}

	// Fallback: auto-generate based on label and category
	return `Generate a "${params.label}" (category: ${params.category}) for the brand. Write appropriate, professional content that fits this type of brand text asset.`;
}
