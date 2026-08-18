import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import {
	buildBrandContextPrompt,
	buildTextGenerationPrompt,
	TEXT_GENERATION_PRESETS,
	type AITextGenerationParams
} from '$lib/services/ai-text-generation';
import { getBrandTexts } from '$lib/services/brand-assets';
import { getBrandProfileForUser } from '$lib/services/brand';
import { getFirstEnabledAIKey, chatCompletionWithKey } from '$lib/services/openai-chat';

/**
 * GET /api/brand/assets/generate-text
 * Get available text generation presets for a category.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const category = url.searchParams.get('category');

	if (category) {
		const presets = TEXT_GENERATION_PRESETS[category] || [];
		return json({ presets });
	}

	return json({ presets: TEXT_GENERATION_PRESETS });
};

/**
 * POST /api/brand/assets/generate-text
 * Generate text content using AI, informed by the brand's profile and existing text assets.
 *
 * Body: { brandProfileId, category, key, label, customPrompt? }
 * Returns: { text, model, tokensUsed }
 */
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB || !platform?.env?.KV) throw error(500, 'Platform not available');

	const body = await request.json();
	const { brandProfileId, category, key, label, customPrompt } = body;

	if (!brandProfileId) throw error(400, 'brandProfileId required');
	if (!category) throw error(400, 'category required');
	if (!key) throw error(400, 'key required');
	if (!label) throw error(400, 'label required');

	// Verify brand ownership
	const profile = await getBrandProfileForUser(platform.env.DB, brandProfileId, locals.user.id);
	if (!profile) {
		throw error(404, 'Brand profile not found');
	}

	// Get AI key (any supported provider)
	const aiKey = await getFirstEnabledAIKey(platform);
	if (!aiKey) {
		throw error(400, 'No AI provider configured. Add one in Admin → AI Keys.');
	}

	// Load existing text assets for context
	let existingTexts: Array<{ category: string; key: string; label: string; value: string }> = [];
	try {
		const texts = await getBrandTexts(platform.env.DB, brandProfileId);
		existingTexts = texts.map((t) => ({
			category: t.category,
			key: t.key,
			label: t.label,
			value: t.value
		}));
	} catch {
		// Continue without existing texts context
	}

	// Build prompts
	const brandContext = {
		brandName: profile.brandName,
		tagline: profile.tagline,
		industry: profile.industry,
		missionStatement: profile.missionStatement,
		visionStatement: profile.visionStatement,
		elevatorPitch: profile.elevatorPitch,
		toneOfVoice: profile.toneOfVoice,
		communicationStyle: profile.communicationStyle,
		brandArchetype: profile.brandArchetype,
		brandPersonalityTraits: profile.brandPersonalityTraits,
		valueProposition: profile.valueProposition,
		targetAudience: profile.targetAudience,
		brandValues: profile.brandValues,
		brandPromise: profile.brandPromise,
		marketPosition: profile.marketPosition,
		originStory: profile.originStory
	};
	const systemPrompt = buildBrandContextPrompt(brandContext, existingTexts);
	const params: AITextGenerationParams = {
		brandProfileId,
		category,
		key,
		label,
		customPrompt
	};
	const userPrompt = buildTextGenerationPrompt(params);

	// Call AI via the shared helper (supports OpenAI, Anthropic, etc.)
	try {
		const generatedText = await chatCompletionWithKey(
			aiKey,
			[
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userPrompt }
			],
			{ temperature: 0.7, maxTokens: 1000 }
		);

		if (!generatedText) {
			throw error(502, 'No text generated from AI');
		}

		return json({
			text: generatedText,
			model: aiKey.model || aiKey.provider
		});
	} catch (err) {
		// Re-throw SvelteKit errors
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		const errMsg = err instanceof Error ? err.message : 'Failed to generate text';
		throw error(502, errMsg);
	}
};
