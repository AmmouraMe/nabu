/**
 * POST /api/brand/assets/fill-empty-fields
 * Generate AI content for all empty text-based profile fields in bulk.
 *
 * Body: { brandProfileId }
 * Returns: { results: [{ field, label, status, value? }], totalFilled, totalFailed }
 */
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import {
	getBrandProfileForUser,
	updateBrandFieldWithVersion,
	BRAND_FIELD_LABELS
} from '$lib/services/brand';
import { getEmptyTextFields, AI_FILLABLE_FIELDS } from '$lib/services/brand-ai-fill';
import { buildBrandContextPrompt } from '$lib/services/ai-text-generation';
import { getBrandTexts } from '$lib/services/brand-assets';
import { getFirstEnabledAIKey, chatCompletionWithKey } from '$lib/services/openai-chat';
import {
	consumeUsage,
	entitlementRefusal,
	releaseUsage,
	resolvePlan
} from '$lib/server/entitlements';

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB || !platform?.env?.KV) throw error(500, 'Platform not available');

	const body = await request.json();
	const { brandProfileId } = body;

	if (!brandProfileId) throw error(400, 'brandProfileId required');

	// Verify brand ownership
	const profile = await getBrandProfileForUser(platform.env.DB, brandProfileId, locals.user.id);
	if (!profile) throw error(404, 'Brand profile not found');

	// Get AI key
	const aiKey = await getFirstEnabledAIKey(platform);
	if (!aiKey) throw error(400, 'No AI provider configured. Add one in Admin → AI Keys.');

	// Find empty fields
	const emptyFieldKeys = getEmptyTextFields(profile);
	if (emptyFieldKeys.length === 0) {
		return json({
			results: [],
			totalFilled: 0,
			totalFailed: 0,
			message: 'All fields are already filled'
		});
	}

	// Build brand context for AI prompts
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
		// Continue without existing texts
	}

	const systemPrompt = buildBrandContextPrompt(brandContext, existingTexts);

	// Generate sequentially to respect provider rate limits and preserve deterministic result ordering.
	// (Each call is independent; the system prompt is built once from initial context.)
	const results: Array<{
		field: string;
		label: string;
		status: 'success' | 'error' | 'skipped';
		value?: string;
		error?: string;
	}> = [];
	let totalFilled = 0;
	let totalFailed = 0;
	let totalSkipped = 0;

	// Each field is a separate AI text generation and is charged as one. Metered per
	// field inside the loop rather than as a batch up front, because a batch charge
	// is all-or-nothing: an account with eight generations left and twenty empty
	// fields would be refused outright instead of getting the eight it is owed.
	const plan = await resolvePlan(platform.env.DB, locals.user.id);
	let limitReached: string | null = null;

	for (const fieldKey of emptyFieldKeys) {
		const fieldDef = AI_FILLABLE_FIELDS.find((f) => f.fieldKey === fieldKey);
		if (!fieldDef) continue;

		const label = BRAND_FIELD_LABELS[fieldKey] || fieldDef.label;

		if (limitReached) {
			results.push({ field: fieldKey, label, status: 'skipped', error: limitReached });
			totalSkipped++;
			continue;
		}

		try {
			await consumeUsage(platform.env.DB, locals.user.id, 'aiTextGenerations', plan);
		} catch (err) {
			const refusal = entitlementRefusal(err);
			// Anything that is not a plan refusal is a real fault and still propagates.
			if (!refusal) throw err;
			limitReached = refusal.message;
			results.push({ field: fieldKey, label, status: 'skipped', error: limitReached });
			totalSkipped++;
			continue;
		}

		try {
			const userPrompt = `Generate a "${label}" for the brand.\n\n${fieldDef.promptTemplate}`;

			const generatedText = await chatCompletionWithKey(
				aiKey,
				[
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt }
				],
				{ temperature: 0.7, maxTokens: 1000 }
			);

			if (!generatedText) {
				await releaseUsage(platform.env.DB, locals.user.id, 'aiTextGenerations');
				results.push({ field: fieldKey, label, status: 'error', error: 'No text generated' });
				totalFailed++;
				continue;
			}

			// Save the generated field value. The update service now automatically
			// mirrors to the Text tab (best-effort) for consistency with manual edits.
			await updateBrandFieldWithVersion(platform.env.DB, {
				profileId: brandProfileId,
				userId: locals.user.id,
				fieldName: fieldKey,
				newValue: generatedText,
				changeSource: 'ai',
				changeReason: 'AI-generated via Fill Empty Fields'
			});

			results.push({ field: fieldKey, label, status: 'success', value: generatedText });
			totalFilled++;
		} catch (err) {
			await releaseUsage(platform.env.DB, locals.user.id, 'aiTextGenerations');
			const errMsg = err instanceof Error ? err.message : 'Generation failed';
			results.push({ field: fieldKey, label, status: 'error', error: errMsg });
			totalFailed++;
		}
	}

	// `limitReached` is what the UI turns into an upgrade prompt: the fields that were
	// filled are still saved, and the rest are reported as skipped rather than failed,
	// because nothing went wrong — the plan simply ran out.
	return json({ results, totalFilled, totalFailed, totalSkipped, limitReached });
};
