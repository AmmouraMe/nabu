/**
 * Brand AI Fill Service
 * Identifies empty text-based brand profile fields and generates AI content for them.
 */

import type { BrandProfile } from '$lib/types/onboarding';
import { BRAND_FIELD_LABELS } from '$lib/services/brand';

/** A field that can be auto-filled by AI */
export interface AIFillableField {
	fieldKey: string;
	label: string;
	promptTemplate: string;
}

/**
 * Text-based profile fields that AI can generate content for.
 * Excludes: brandName (user-defined), colors, fonts, images/logos.
 */
export const AI_FILLABLE_FIELDS: AIFillableField[] = [
	{
		fieldKey: 'tagline',
		label: 'Tagline',
		promptTemplate:
			'Write a memorable, concise tagline (under 10 words) that captures the brand essence.'
	},
	{
		fieldKey: 'missionStatement',
		label: 'Mission Statement',
		promptTemplate:
			"Write a clear, inspiring mission statement (1-2 sentences) that defines the brand's purpose and what it aims to achieve for its customers."
	},
	{
		fieldKey: 'visionStatement',
		label: 'Vision Statement',
		promptTemplate:
			'Write a forward-looking vision statement (1-2 sentences) that describes the future the brand is working to create.'
	},
	{
		fieldKey: 'elevatorPitch',
		label: 'Elevator Pitch',
		promptTemplate:
			'Write a compelling 30-second elevator pitch (2-3 sentences) that explains what the brand does and why it matters.'
	},
	{
		fieldKey: 'brandArchetype',
		label: 'Brand Archetype',
		promptTemplate:
			'Identify the brand archetype (based on the 12 Jungian archetypes) that best fits this brand, and explain in 2-3 sentences why it is the right fit.'
	},
	{
		fieldKey: 'brandPersonalityTraits',
		label: 'Personality Traits',
		promptTemplate:
			"List 5-7 key personality traits that define this brand's character, with a brief explanation of how each trait manifests in the brand's communications and behavior."
	},
	{
		fieldKey: 'toneOfVoice',
		label: 'Tone of Voice',
		promptTemplate:
			'Write tone-of-voice guidelines (5-8 bullet points) describing how the brand should sound in all communications.'
	},
	{
		fieldKey: 'communicationStyle',
		label: 'Communication Style',
		promptTemplate:
			"Define the brand's communication style (3-5 sentences) covering how formal or casual the brand is, preferred sentence structures, and how it engages with different audiences."
	},
	{
		fieldKey: 'targetAudience',
		label: 'Target Audience',
		promptTemplate:
			'Describe the ideal target audience for this brand, including key demographics, interests, and behaviors in 2-4 sentences.'
	},
	{
		fieldKey: 'customerPainPoints',
		label: 'Customer Pain Points',
		promptTemplate:
			'Identify the top customer pain points this brand addresses, describing each in a brief sentence.'
	},
	{
		fieldKey: 'valueProposition',
		label: 'Value Proposition',
		promptTemplate:
			'Write a clear value proposition statement that explains the unique benefit the brand offers to its target audience.'
	},
	{
		fieldKey: 'industry',
		label: 'Industry',
		promptTemplate:
			'Write a brief industry description (1-2 sentences) that defines the market or sector the brand operates in.'
	},
	{
		fieldKey: 'competitors',
		label: 'Competitors',
		promptTemplate:
			'Identify the main competitors for this brand, briefly describing each and what they offer in the same market.'
	},
	{
		fieldKey: 'uniqueSellingPoints',
		label: 'Unique Selling Points',
		promptTemplate:
			'List the unique selling points that differentiate this brand from competitors, describing each in a brief sentence.'
	},
	{
		fieldKey: 'marketPosition',
		label: 'Market Position',
		promptTemplate:
			'Write a market positioning statement (2-3 sentences) that defines where the brand sits in its industry and what differentiates it from competitors.'
	},
	{
		fieldKey: 'originStory',
		label: 'Origin Story',
		promptTemplate:
			'Write a compelling origin story (200-300 words) about how and why the brand was founded, including the problem it set out to solve.'
	},
	{
		fieldKey: 'brandValues',
		label: 'Brand Values',
		promptTemplate:
			'Describe the core values that guide this brand, explaining what each value means in the context of the brand identity.'
	},
	{
		fieldKey: 'brandPromise',
		label: 'Brand Promise',
		promptTemplate:
			'Write a concise brand promise (1 sentence) that communicates the core commitment the brand makes to its customers.'
	}
];

/**
 * Get the list of AI-fillable text fields that are currently empty on the profile.
 * A field is considered empty if its value is null, undefined, or an empty string.
 */
export function getEmptyTextFields(profile: BrandProfile): string[] {
	return AI_FILLABLE_FIELDS.filter((f) => {
		const val = profile[f.fieldKey as keyof BrandProfile];
		return val == null || val === '';
	}).map((f) => f.fieldKey);
}
