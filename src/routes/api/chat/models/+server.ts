import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Common chat models with display names
 */
const CHAT_MODELS: Record<string, string> = {
	// Workers AI — keyless, free within the daily Neuron allocation.
	'@cf/meta/llama-3.3-70b-instruct-fp8-fast': 'Llama 3.3 70B (free)',
	'@cf/meta/llama-3.1-8b-instruct-fast': 'Llama 3.1 8B (free, faster)',
	'gpt-4o': 'GPT-4o',
	'gpt-4o-mini': 'GPT-4o mini',
	'gpt-4o-2024-11-20': 'GPT-4o (Nov 2024)',
	'gpt-4o-2024-08-06': 'GPT-4o (Aug 2024)',
	'gpt-4-turbo': 'GPT-4 Turbo',
	'gpt-4-turbo-2024-04-09': 'GPT-4 Turbo (Apr 2024)',
	'gpt-4': 'GPT-4',
	'gpt-3.5-turbo': 'GPT-3.5 Turbo',
	'gpt-3.5-turbo-0125': 'GPT-3.5 Turbo (Jan 2025)',
	o1: 'o1',
	'o1-2024-12-17': 'o1 (Dec 2024)',
	'o1-preview': 'o1 Preview',
	'o1-mini': 'o1 mini',
	'o1-mini-2024-09-12': 'o1 mini (Sep 2024)',
	o3: 'o3',
	'o3-mini': 'o3 mini',
	'o4-mini': 'o4 mini'
};

/**
 * Model sort order (lower = higher priority)
 */
const MODEL_ORDER = [
	'@cf/meta/llama-3.3-70b-instruct-fp8-fast',
	'@cf/meta/llama-3.1-8b-instruct-fast',
	'gpt-4o',
	'gpt-4o-2024-11-20',
	'gpt-4o-2024-08-06',
	'gpt-4o-mini',
	'o3',
	'o3-mini',
	'o4-mini',
	'o1',
	'o1-2024-12-17',
	'o1-preview',
	'o1-mini',
	'o1-mini-2024-09-12',
	'gpt-4-turbo',
	'gpt-4-turbo-2024-04-09',
	'gpt-4',
	'gpt-3.5-turbo',
	'gpt-3.5-turbo-0125'
];

/**
 * Get all enabled text models from AI keys in KV storage
 */
async function getEnabledModels(platform: App.Platform): Promise<string[]> {
	try {
		const keysList = await platform.env.KV.get('ai_keys_list');
		if (!keysList) {
			return [];
		}

		const keyIds = JSON.parse(keysList);
		const enabledModels = new Set<string>();

		for (const keyId of keyIds) {
			const keyData = await platform.env.KV.get(`ai_key:${keyId}`);
			if (keyData) {
				const key = JSON.parse(keyData);
				// OpenAI plus the keyless Workers AI binding. NOTE: 'anthropic' keys
				// are chat-capable in openai-chat.ts but still absent here — their
				// model display names aren't defined, so they'd render as raw ids.
				if ((key.provider === 'openai' || key.provider === 'workers-ai') && key.enabled !== false) {
					// Collect models from the key (support both array and legacy single model)
					const models = key.models || (key.model ? [key.model] : []);
					for (const model of models) {
						enabledModels.add(model);
					}
				}
			}
		}

		return Array.from(enabledModels);
	} catch (err) {
		console.error('Failed to get enabled models:', err);
		return [];
	}
}

/**
 * GET /api/chat/models
 * Returns only the chat models that are enabled in admin settings
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
				defaultModel: null
			});
		}

		// Build the list of enabled models with display names
		const availableModels = enabledModelIds
			.filter((id) => CHAT_MODELS[id]) // Only include known models
			.map((id) => ({
				id,
				displayName: CHAT_MODELS[id]
			}))
			.sort((a, b) => {
				const orderA = MODEL_ORDER.indexOf(a.id);
				const orderB = MODEL_ORDER.indexOf(b.id);
				// If not in order list, sort alphabetically at the end
				if (orderA === -1 && orderB === -1) return a.id.localeCompare(b.id);
				if (orderA === -1) return 1;
				if (orderB === -1) return -1;
				return orderA - orderB;
			});

		// Determine default model (prefer gpt-4o-mini, then gpt-4o, then first available)
		let defaultModel = availableModels[0]?.id || null;
		if (availableModels.some((m) => m.id === 'gpt-4o-mini')) {
			defaultModel = 'gpt-4o-mini';
		} else if (availableModels.some((m) => m.id === 'gpt-4o')) {
			defaultModel = 'gpt-4o';
		}

		return json({
			models: availableModels,
			defaultModel
		});
	} catch (err: unknown) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		console.error('Error fetching models:', err);
		throw error(500, 'Failed to fetch available models');
	}
};
