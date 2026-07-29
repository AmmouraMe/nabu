/**
 * Which chat models exist, which are switched on, and which one you get if you do
 * not choose.
 *
 * Extracted from `/api/chat/models` because a second caller now needs the same
 * answer: on a plan without "Custom AI model selection" the stream endpoint pins the
 * conversation to the default model, and the two must agree about what that is. When
 * the list said the free tier's only option was GPT-4o mini and the stream hardcoded
 * GPT-4o, every free reply would be labelled — and costed — as the wrong model.
 */

/** Known chat models with display names. Unknown ids are hidden rather than shown raw. */
export const CHAT_MODELS: Record<string, string> = {
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

/** Display order (lower = higher priority). Unlisted ids sort alphabetically after. */
export const MODEL_ORDER = [
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
 * Last-resort model id, used when no AI key advertises anything usable. Matches what
 * the stream endpoint has always fallen back to.
 */
export const FALLBACK_CHAT_MODEL = 'gpt-4o';

export interface ChatModel {
	id: string;
	displayName: string;
}

/** Every text model switched on across the configured AI keys. */
export async function getEnabledModels(platform: App.Platform): Promise<string[]> {
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

/** Known, enabled models in display order. */
export function toSortedModels(enabledModelIds: string[]): ChatModel[] {
	return enabledModelIds
		.filter((id) => CHAT_MODELS[id])
		.map((id) => ({ id, displayName: CHAT_MODELS[id] }))
		.sort((a, b) => {
			const orderA = MODEL_ORDER.indexOf(a.id);
			const orderB = MODEL_ORDER.indexOf(b.id);
			if (orderA === -1 && orderB === -1) return a.id.localeCompare(b.id);
			if (orderA === -1) return 1;
			if (orderB === -1) return -1;
			return orderA - orderB;
		});
}

/** The model an account gets without choosing: cheapest capable option available. */
export function resolveDefaultModel(models: ChatModel[]): string | null {
	if (models.some((m) => m.id === 'gpt-4o-mini')) return 'gpt-4o-mini';
	if (models.some((m) => m.id === 'gpt-4o')) return 'gpt-4o';
	return models[0]?.id ?? null;
}

/**
 * The single model a plan without model selection is pinned to.
 *
 * Same computation the model list uses, so a locked account is served exactly the
 * one model it is shown.
 */
export async function defaultModelFor(platform: App.Platform | undefined): Promise<string> {
	if (!platform?.env?.KV) return FALLBACK_CHAT_MODEL;
	const models = toSortedModels(await getEnabledModels(platform));
	return resolveDefaultModel(models) ?? FALLBACK_CHAT_MODEL;
}
