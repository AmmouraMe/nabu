/**
 * OpenAI Chat Service
 * Handles streaming text chat and realtime voice chat with OpenAI API
 */

export interface ChatMessage {
	role: 'user' | 'assistant' | 'system';
	content: string | ChatMessageContentPart[];
}

export interface ChatMessageContentPart {
	type: 'text' | 'image_url';
	text?: string;
	image_url?: {
		url: string;
		detail?: 'auto' | 'low' | 'high';
	};
}

export interface AIKey {
	id: string;
	name: string;
	provider: string;
	apiKey: string;
	enabled: boolean;
	// Text chat models enabled for this key
	models?: string[];
	// Legacy single model field (for backwards compatibility)
	model?: string;
	voiceEnabled?: boolean;
	// Voice models enabled for this key
	voiceModels?: string[];
	// Legacy single voice model field (for backwards compatibility)
	voiceModel?: string;
	// Image models — kept separate from `models` so chat never selects one.
	imageModels?: string[];
	/**
	 * Workers AI binding, attached at load time for `provider: 'workers-ai'`.
	 * Not persisted — that provider authenticates via the binding rather than
	 * an apiKey, and attaching it here keeps every existing call site of
	 * streamChatCompletionWithFallback() unchanged.
	 */
	ai?: { run(model: string, inputs: Record<string, unknown>): Promise<unknown> };
}

export interface RealtimeSessionResponse {
	token: string;
}

export interface StreamChunk {
	type: 'content' | 'usage' | 'status';
	content?: string;
	usage?: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
	model?: string;
	status?: {
		message: string;
		keyName: string;
		keyId: string;
		model: string;
		attempt: number;
		totalKeys: number;
	};
}

/** Providers that support text chat completions */
const TEXT_CHAT_PROVIDERS = new Set(['openai', 'anthropic', 'workers-ai']);

/**
 * Workers AI text models, offered by the keyless `AI` binding.
 * llama-3.3-70b-instruct-fp8-fast is already the content generator's model
 * (`content-generator.ts`), so it's the proven default here too.
 */
export const WORKERS_AI_TEXT_MODELS = [
	'@cf/meta/llama-3.3-70b-instruct-fp8-fast',
	'@cf/meta/llama-3.1-8b-instruct-fast'
];
const WORKERS_AI_DEFAULT_TEXT_MODEL = WORKERS_AI_TEXT_MODELS[0];
/** Workers AI image models are stored on the same key record but must never be
 *  selected for chat — guards against a mis-shaped record reaching the model. */
const isWorkersAITextModel = (m: string) =>
	m.startsWith('@cf/') && !m.includes('black-forest-labs');

/** Map short/legacy Anthropic model names to full API model IDs */
const ANTHROPIC_MODEL_ALIASES: Record<string, string> = {
	'claude-3-opus': 'claude-3-opus-20240229',
	'claude-3-sonnet': 'claude-3-5-sonnet-20241022',
	'claude-3-haiku': 'claude-3-haiku-20240307',
	'claude-3.5-sonnet': 'claude-3-5-sonnet-20241022',
	'claude-3.5-haiku': 'claude-3-5-haiku-20241022'
};

/**
 * Get the effective model for a key, respecting the key's configured models
 * and falling back to a provider-appropriate default.
 */
function getEffectiveModel(key: AIKey, requestedModel?: string): string {
	let model: string;
	if (key.models && key.models.length > 0) {
		model = requestedModel && key.models.includes(requestedModel) ? requestedModel : key.models[0];
	} else if (key.model) {
		model = key.model;
	} else {
		switch (key.provider) {
			case 'anthropic':
				return 'claude-sonnet-4-20250514';
			case 'workers-ai':
				return WORKERS_AI_DEFAULT_TEXT_MODEL;
			default:
				return 'gpt-4o';
		}
	}
	// A workers-ai record also carries image models; never chat with one.
	if (key.provider === 'workers-ai' && !isWorkersAITextModel(model)) {
		return WORKERS_AI_DEFAULT_TEXT_MODEL;
	}
	// Resolve short/legacy Anthropic names to full API IDs
	if (key.provider === 'anthropic' && ANTHROPIC_MODEL_ALIASES[model]) {
		return ANTHROPIC_MODEL_ALIASES[model];
	}
	return model;
}

/**
 * Get all enabled AI keys from KV storage, in admin-sorted priority order.
 * Returns keys from ALL text-chat-capable providers.
 */
export async function getAllEnabledAIKeys(platform: App.Platform): Promise<AIKey[]> {
	try {
		const keysList = await platform.env.KV.get('ai_keys_list');
		if (!keysList) return [];

		const keyIds = JSON.parse(keysList);
		const keys: AIKey[] = [];

		for (const keyId of keyIds) {
			const keyData = await platform.env.KV.get(`ai_key:${keyId}`);
			if (keyData) {
				const key = JSON.parse(keyData) as AIKey;
				if (key.enabled !== false && TEXT_CHAT_PROVIDERS.has(key.provider)) {
					// workers-ai authenticates via the binding, not a stored secret.
					// Skip it when the binding is absent, so it can't be picked and fail.
					if (key.provider === 'workers-ai') {
						if (!platform.env.AI) continue;
						key.ai = platform.env.AI;
					}
					keys.push(key);
				}
			}
		}

		return keys;
	} catch (err) {
		console.error('Failed to get AI keys:', err);
		return [];
	}
}

/**
 * Get the first enabled AI key for text chat (any supported provider).
 */
export async function getFirstEnabledAIKey(platform: App.Platform): Promise<AIKey | null> {
	const keys = await getAllEnabledAIKeys(platform);
	return keys[0] ?? null;
}

/**
 * Get the first enabled OpenAI API key from KV storage
 * (Used for OpenAI-specific features like voice chat)
 */
export async function getEnabledOpenAIKey(platform: App.Platform): Promise<AIKey | null> {
	try {
		const keysList = await platform.env.KV.get('ai_keys_list');
		if (!keysList) {
			return null;
		}

		const keyIds = JSON.parse(keysList);

		for (const keyId of keyIds) {
			const keyData = await platform.env.KV.get(`ai_key:${keyId}`);
			if (keyData) {
				const key = JSON.parse(keyData) as AIKey;
				// Only return OpenAI keys that are enabled
				if (key.provider === 'openai' && key.enabled !== false) {
					return key;
				}
			}
		}

		return null;
	} catch (err) {
		console.error('Failed to get OpenAI key:', err);
		return null;
	}
}

/**
 * Get all enabled OpenAI API keys from KV storage, in admin-sorted priority order.
 * @deprecated Use getAllEnabledAIKeys() for multi-provider support
 */
export async function getAllEnabledOpenAIKeys(platform: App.Platform): Promise<AIKey[]> {
	try {
		const keysList = await platform.env.KV.get('ai_keys_list');
		if (!keysList) {
			return [];
		}

		const keyIds = JSON.parse(keysList);
		const keys: AIKey[] = [];

		for (const keyId of keyIds) {
			const keyData = await platform.env.KV.get(`ai_key:${keyId}`);
			if (keyData) {
				const key = JSON.parse(keyData) as AIKey;
				if (key.provider === 'openai' && key.enabled !== false) {
					keys.push(key);
				}
			}
		}

		return keys;
	} catch (err) {
		console.error('Failed to get OpenAI keys:', err);
		return [];
	}
}

/**
 * Non-streaming chat completion for quick extraction calls.
 * Uses JSON response format for structured output.
 * Returns the response content string.
 */
export async function chatCompletion(
	apiKey: string,
	messages: ChatMessage[],
	options: {
		model?: string;
		temperature?: number;
		maxTokens?: number;
		jsonMode?: boolean;
	} = {}
): Promise<string> {
	const { model = 'gpt-4o-mini', temperature = 0.1, maxTokens = 1024, jsonMode = false } = options;

	const body: Record<string, unknown> = {
		model,
		messages,
		temperature,
		max_tokens: maxTokens
	};

	if (jsonMode) {
		body.response_format = { type: 'json_object' };
	}

	const response = await fetch('https://api.openai.com/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		const errorBody = await response.text().catch(() => '');
		let detail = response.statusText;
		try {
			const parsed = JSON.parse(errorBody);
			detail = parsed?.error?.message || detail;
		} catch {
			/* use statusText */
		}
		throw new Error(`OpenAI API error (${response.status}): ${detail}`);
	}

	const json = (await response.json()) as {
		choices: Array<{ message: { content: string } }>;
	};

	return json.choices?.[0]?.message?.content || '';
}

/**
 * Stream chat completion from OpenAI API
 * Yields content chunks and finally a usage chunk with token counts
 */
export async function* streamChatCompletion(
	apiKey: string,
	messages: ChatMessage[],
	options: {
		model?: string;
		temperature?: number;
		maxTokens?: number;
	} = {}
): AsyncGenerator<StreamChunk, void, unknown> {
	const { model = 'gpt-4o', temperature = 0.7, maxTokens = 2048 } = options;

	const response = await fetch('https://api.openai.com/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model,
			messages,
			temperature,
			max_tokens: maxTokens,
			stream: true,
			stream_options: { include_usage: true }
		})
	});

	if (!response.ok) {
		const errorBody = await response.text().catch(() => '');
		let detail = response.statusText;
		try {
			const parsed = JSON.parse(errorBody);
			detail = parsed?.error?.message || detail;
		} catch {
			/* use statusText */
		}
		if (response.status === 401) {
			throw new Error('Invalid or expired OpenAI API key. Check your API key configuration.');
		}
		if (response.status === 429) {
			throw new Error('OpenAI rate limit exceeded or insufficient quota. Please try again later.');
		}
		if (response.status === 404) {
			throw new Error(`Model not available: ${model}. Check your OpenAI plan supports this model.`);
		}
		throw new Error(`OpenAI API error (${response.status}): ${detail}`);
	}

	const reader = response.body?.getReader();
	if (!reader) {
		throw new Error('No response body');
	}

	const decoder = new TextDecoder();
	let buffer = '';

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() || '';

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed || trimmed === 'data: [DONE]') continue;
			if (!trimmed.startsWith('data: ')) continue;

			try {
				const json = JSON.parse(trimmed.slice(6));

				// Check for usage data (comes in the final chunk)
				if (json.usage) {
					yield {
						type: 'usage',
						usage: {
							promptTokens: json.usage.prompt_tokens,
							completionTokens: json.usage.completion_tokens,
							totalTokens: json.usage.total_tokens
						},
						model: json.model || model
					};
				}

				// Check for content delta
				const content = json.choices?.[0]?.delta?.content;
				if (content) {
					yield { type: 'content', content };
				}
			} catch (err) {
				console.error('Failed to parse SSE line:', trimmed, err);
			}
		}
	}
}

/**
 * Stream chat completion from Anthropic API.
 * Yields content chunks and finally a usage chunk with token counts.
 */
export async function* streamAnthropicChatCompletion(
	apiKey: string,
	messages: ChatMessage[],
	options: {
		model?: string;
		temperature?: number;
		maxTokens?: number;
	} = {}
): AsyncGenerator<StreamChunk, void, unknown> {
	const { model = 'claude-sonnet-4-20250514', temperature = 0.7, maxTokens = 2048 } = options;

	// Extract system messages — Anthropic uses a top-level system parameter
	let systemContent = '';
	const chatMessages: Array<{ role: string; content: string | ChatMessageContentPart[] }> = [];
	for (const msg of messages) {
		if (msg.role === 'system') {
			if (typeof msg.content === 'string') {
				systemContent += (systemContent ? '\n\n' : '') + msg.content;
			}
		} else {
			chatMessages.push({ role: msg.role, content: msg.content });
		}
	}

	const body: Record<string, unknown> = {
		model,
		messages: chatMessages,
		temperature,
		max_tokens: maxTokens,
		stream: true
	};
	if (systemContent) {
		body.system = systemContent;
	}

	const response = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': apiKey,
			'anthropic-version': '2023-06-01'
		},
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		const errorBody = await response.text().catch(() => '');
		let detail = response.statusText;
		try {
			const parsed = JSON.parse(errorBody);
			detail = parsed?.error?.message || detail;
		} catch {
			/* use statusText */
		}
		if (response.status === 401) {
			throw new Error('Invalid or expired Anthropic API key. Check your API key configuration.');
		}
		if (response.status === 429) {
			throw new Error(
				'Anthropic rate limit exceeded or insufficient quota. Please try again later.'
			);
		}
		if (response.status === 404) {
			throw new Error(
				`Model not available: ${model}. Check your Anthropic plan supports this model.`
			);
		}
		throw new Error(`Anthropic API error (${response.status}): ${detail}`);
	}

	const reader = response.body?.getReader();
	if (!reader) {
		throw new Error('No response body');
	}

	const decoder = new TextDecoder();
	let buffer = '';
	let inputTokens = 0;
	let outputTokens = 0;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() || '';

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('event:')) continue;
			if (!trimmed.startsWith('data: ')) continue;

			try {
				const json = JSON.parse(trimmed.slice(6));

				switch (json.type) {
					case 'message_start':
						inputTokens = json.message?.usage?.input_tokens || 0;
						break;
					case 'content_block_delta':
						if (json.delta?.type === 'text_delta' && json.delta.text) {
							yield { type: 'content', content: json.delta.text };
						}
						break;
					case 'message_delta':
						outputTokens = json.usage?.output_tokens || 0;
						break;
					case 'message_stop':
						yield {
							type: 'usage',
							usage: {
								promptTokens: inputTokens,
								completionTokens: outputTokens,
								totalTokens: inputTokens + outputTokens
							},
							model
						};
						break;
				}
			} catch (err) {
				console.error('Failed to parse Anthropic SSE line:', trimmed, err);
			}
		}
	}
}

/**
 * Non-streaming chat completion for Anthropic.
 */
export async function anthropicChatCompletion(
	apiKey: string,
	messages: ChatMessage[],
	options: {
		model?: string;
		temperature?: number;
		maxTokens?: number;
		jsonMode?: boolean;
	} = {}
): Promise<string> {
	const {
		model = 'claude-sonnet-4-20250514',
		temperature = 0.1,
		maxTokens = 1024,
		jsonMode = false
	} = options;

	// Extract system messages
	let systemContent = '';
	const chatMessages: Array<{ role: string; content: string | ChatMessageContentPart[] }> = [];
	for (const msg of messages) {
		if (msg.role === 'system') {
			if (typeof msg.content === 'string') {
				systemContent += (systemContent ? '\n\n' : '') + msg.content;
			}
		} else {
			chatMessages.push({ role: msg.role, content: msg.content });
		}
	}

	if (jsonMode && systemContent) {
		systemContent += '\n\nIMPORTANT: Respond with valid JSON only. No other text.';
	}

	// Anthropic requires at least one non-system message
	if (chatMessages.length === 0) {
		chatMessages.push({ role: 'user', content: systemContent || 'Hello' });
		systemContent = '';
	}

	const body: Record<string, unknown> = {
		model,
		messages: chatMessages,
		temperature,
		max_tokens: maxTokens
	};
	if (systemContent) {
		body.system = systemContent;
	}

	const response = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': apiKey,
			'anthropic-version': '2023-06-01'
		},
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		const errorBody = await response.text().catch(() => '');
		let detail = response.statusText;
		try {
			const parsed = JSON.parse(errorBody);
			detail = parsed?.error?.message || detail;
		} catch {
			/* use statusText */
		}
		throw new Error(`Anthropic API error (${response.status}): ${detail}`);
	}

	const data = (await response.json()) as {
		content: Array<{ type: string; text: string }>;
	};

	return data.content?.[0]?.text || '';
}

/**
 * Non-streaming chat completion for Workers AI via the account's `AI` binding.
 *
 * Mirrors {@link streamWorkersAIChatCompletion} but returns the full text in one
 * shot — used by the extraction/analysis calls that need a complete response.
 * Workers AI has no universal `response_format` flag (unlike OpenAI), so JSON
 * mode is enforced by instructing the model in the prompt, the same way
 * {@link anthropicChatCompletion} does.
 */
export async function workersAIChatCompletion(
	ai: NonNullable<AIKey['ai']>,
	messages: ChatMessage[],
	options: {
		model?: string;
		temperature?: number;
		maxTokens?: number;
		jsonMode?: boolean;
	} = {}
): Promise<string> {
	const model = options.model || WORKERS_AI_DEFAULT_TEXT_MODEL;

	const chatMessages = messages.map((m) => ({ role: m.role, content: m.content }));
	if (options.jsonMode) {
		// Nudge the model toward pure JSON. Append to the last system message if
		// there is one, otherwise prepend a fresh system instruction.
		const instruction =
			'IMPORTANT: Respond with a single valid JSON object only — no markdown, no code fences, no commentary before or after.';
		const lastSystem = [...chatMessages].reverse().find((m) => m.role === 'system');
		if (lastSystem && typeof lastSystem.content === 'string') {
			lastSystem.content = `${lastSystem.content}\n\n${instruction}`;
		} else {
			chatMessages.unshift({ role: 'system', content: instruction });
		}
	}

	const inputs = {
		messages: chatMessages,
		...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
		...(options.temperature !== undefined ? { temperature: options.temperature } : {})
	};

	const result = await ai.run(model, inputs);
	const response = (result as { response?: unknown })?.response;
	if (typeof response === 'string') return response;
	// Some Workers AI models return an already-parsed object for `response`
	// (notably when the prompt asks for JSON); hand it back as a JSON string so
	// callers that expect text — and then re-parse — still work.
	if (response && typeof response === 'object') return JSON.stringify(response);
	return '';
}

/**
 * Provider-aware non-streaming chat completion.
 * Routes to the correct API based on the key's provider.
 */
export async function chatCompletionWithKey(
	key: AIKey,
	messages: ChatMessage[],
	options: {
		model?: string;
		temperature?: number;
		maxTokens?: number;
		jsonMode?: boolean;
	} = {}
): Promise<string> {
	const effectiveModel = getEffectiveModel(key, options.model);
	const effectiveOptions = { ...options, model: effectiveModel };

	switch (key.provider) {
		case 'anthropic':
			return anthropicChatCompletion(key.apiKey, messages, effectiveOptions);
		case 'workers-ai':
			return workersAIChatCompletion(key.ai!, messages, effectiveOptions);
		default:
			return chatCompletion(key.apiKey, messages, effectiveOptions);
	}
}

/**
 * Stream chat completion with fallback across multiple AI keys in priority order.
 * Tries each enabled key and emits status events so the client can show live progress.
 * Falls back to the next key if the current one fails.
 * Routes to the correct provider API based on each key's provider field.
 */
/**
 * Stream a chat completion from Workers AI via the account's `AI` binding.
 *
 * No API key: the binding authorises as the account, and usage lands inside
 * Cloudflare's daily free Neuron allocation before it bills.
 *
 * Streaming is attempted first but is **not always available**: through
 * wrangler's local platform proxy (`getPlatformProxy`, what `vite dev` uses)
 * `stream: true` throws an opaque `false == true` — verified 2026-07-18 on
 * wrangler 3.114. So a failure here is not fatal; we fall back to a single
 * non-streaming call and emit the answer as one chunk. Local dev always takes
 * the fallback path; a deployed Worker can stream properly.
 */
export async function* streamWorkersAIChatCompletion(
	ai: NonNullable<AIKey['ai']>,
	messages: ChatMessage[],
	options: { model?: string; temperature?: number; maxTokens?: number } = {}
): AsyncGenerator<StreamChunk, void, unknown> {
	const model = options.model || WORKERS_AI_DEFAULT_TEXT_MODEL;
	const inputs = {
		messages: messages.map((m) => ({ role: m.role, content: m.content })),
		...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
		...(options.temperature !== undefined ? { temperature: options.temperature } : {})
	};

	let result: unknown;
	try {
		result = await ai.run(model, { ...inputs, stream: true });
	} catch {
		result = undefined; // streaming unsupported here — fall back below
	}

	// Non-streaming shape (or the streaming attempt failed) — one call, one chunk.
	if (!(result instanceof ReadableStream)) {
		const single = result ?? (await ai.run(model, inputs));
		const text = (single as { response?: string })?.response;
		if (text) yield { type: 'content', content: text, model };
		return;
	}

	const reader = result.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			// SSE frames are newline-delimited; keep the trailing partial line.
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';
			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed.startsWith('data:')) continue;
				const payload = trimmed.slice(5).trim();
				if (!payload || payload === '[DONE]') continue;
				try {
					const parsed = JSON.parse(payload) as { response?: string };
					if (parsed.response) yield { type: 'content', content: parsed.response, model };
				} catch {
					// A frame split across reads — ignore; the next read completes it.
				}
			}
		}
	} finally {
		reader.releaseLock();
	}
}

export async function* streamChatCompletionWithFallback(
	keys: AIKey[],
	messages: ChatMessage[],
	options: {
		model?: string;
		temperature?: number;
		maxTokens?: number;
	} = {}
): AsyncGenerator<StreamChunk, void, unknown> {
	if (keys.length === 0) {
		throw new Error('No AI keys configured');
	}

	const errors: string[] = [];

	for (let i = 0; i < keys.length; i++) {
		const key = keys[i];
		const attempt = i + 1;
		const effectiveModel = getEffectiveModel(key, options.model);

		// Emit status: trying this key
		if (i === 0) {
			yield {
				type: 'status',
				status: {
					message: `Using ${key.name} (${effectiveModel})`,
					keyName: key.name,
					keyId: key.id,
					model: effectiveModel,
					attempt,
					totalKeys: keys.length
				}
			};
		} else {
			yield {
				type: 'status',
				status: {
					message: `${keys[i - 1].name} failed — trying ${key.name} (attempt ${attempt}/${keys.length})`,
					keyName: key.name,
					keyId: key.id,
					model: effectiveModel,
					attempt,
					totalKeys: keys.length
				}
			};
		}

		try {
			const providerOptions = { ...options, model: effectiveModel };
			const streamer =
				key.provider === 'anthropic'
					? streamAnthropicChatCompletion(key.apiKey, messages, providerOptions)
					: key.provider === 'workers-ai'
						? streamWorkersAIChatCompletion(key.ai!, messages, providerOptions)
						: streamChatCompletion(key.apiKey, messages, providerOptions);

			for await (const chunk of streamer) {
				yield chunk;
			}
			// Success — we're done
			return;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			errors.push(`${key.name}: ${msg}`);
			console.error(`AI key "${key.name}" failed (attempt ${attempt}/${keys.length}):`, msg);
			// Continue to next key
		}
	}

	// All keys failed
	throw new Error(
		`All ${keys.length} AI key${keys.length > 1 ? 's' : ''} failed:\n${errors.join('\n')}`
	);
}

/**
 * Create ephemeral token for OpenAI Realtime API (voice chat)
 */
export async function createRealtimeSession(
	apiKey: string,
	model: string = 'gpt-4o-realtime-preview-2024-12-17'
): Promise<RealtimeSessionResponse> {
	const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model,
			voice: 'alloy'
		})
	});

	if (!response.ok) {
		console.error('Failed to create realtime session:', response.status);
		throw new Error(`Failed to create realtime session: ${response.status}`);
	}

	const data = await response.json();

	if (!data.client_secret?.value) {
		console.error('Invalid response from realtime sessions API');
		throw new Error('Invalid response: missing client_secret');
	}

	return {
		token: data.client_secret.value
	};
}

/**
 * Format messages for OpenAI API
 * Supports multi-modal messages with image attachments
 */
export function formatMessagesForOpenAI(
	messages: Array<{
		id: string;
		role: string;
		content: string;
		timestamp: Date;
		attachments?: Array<{
			id: string;
			type: 'image' | 'video';
			name: string;
			url: string;
			mimeType: string;
			size?: number;
		}>;
	}>,
	options: { includeSystem?: boolean } = {}
): ChatMessage[] {
	const { includeSystem = true } = options;

	return messages
		.filter((msg) => {
			if (!includeSystem && msg.role === 'system') {
				return false;
			}
			return msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system';
		})
		.map((msg) => {
			const role = msg.role as 'user' | 'assistant' | 'system';

			// Only user messages can have attachments
			const imageAttachments = (msg.attachments || []).filter((a) => a.type === 'image');
			const videoAttachments = (msg.attachments || []).filter((a) => a.type === 'video');

			// Build text with video notes if any
			let textContent = msg.content;
			if (videoAttachments.length > 0) {
				const videoNames = videoAttachments.map((v) => v.name).join(', ');
				textContent += `\n\n[Attached video${videoAttachments.length > 1 ? 's' : ''}: ${videoNames}]`;
			}

			// If no image attachments or not a user message, return plain text
			if (role !== 'user' || !imageAttachments.length) {
				return { role, content: textContent };
			}

			// Build multi-modal content array for messages with images
			const content: ChatMessageContentPart[] = [];
			content.push({ type: 'text', text: textContent });

			// Add image attachments as image_url parts
			for (const img of imageAttachments) {
				content.push({
					type: 'image_url',
					image_url: { url: img.url, detail: 'auto' }
				});
			}

			return { role, content };
		});
}
