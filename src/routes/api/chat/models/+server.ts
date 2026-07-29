import { error, json } from '@sveltejs/kit';
import { getEnabledModels, resolveDefaultModel, toSortedModels } from '$lib/server/chat-models';
import { hasFeature, resolvePlan } from '$lib/server/entitlements';
import type { RequestHandler } from './$types';

/**
 * GET /api/chat/models
 * Returns only the chat models that are enabled in admin settings — and, on a plan
 * without "Custom AI model selection", only the default one.
 *
 * The list is trimmed rather than the picker being told to disable itself: the chat
 * UI shows its selector only when it receives more than one model, so a free account
 * simply never sees a control it cannot use. `modelSelection` in the response says
 * why, for anything that wants to offer an upgrade instead.
 */
export const GET: RequestHandler = async ({ platform, locals }) => {
	// Check authentication
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env?.KV) {
		throw error(503, 'Storage not available');
	}

	try {
		// Get models enabled in admin settings
		const enabledModelIds = await getEnabledModels(platform);

		if (enabledModelIds.length === 0) {
			// No models configured - return empty list
			return json({
				models: [],
				defaultModel: null,
				modelSelection: true
			});
		}

		const availableModels = toSortedModels(enabledModelIds);
		const defaultModel = resolveDefaultModel(availableModels);

		const plan = platform.env.DB ? await resolvePlan(platform.env.DB, locals.user.id) : 'starter';
		const canChoose = hasFeature(plan, 'modelSelection');

		return json({
			models: canChoose ? availableModels : availableModels.filter((m) => m.id === defaultModel),
			defaultModel,
			modelSelection: canChoose
		});
	} catch (err: unknown) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		console.error('Error fetching models:', err);
		throw error(500, 'Failed to fetch available models');
	}
};
