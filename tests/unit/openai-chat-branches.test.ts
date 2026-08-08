/**
 * Branch coverage for the multi-provider paths in openai-chat.ts:
 * model resolution per provider, the Anthropic streaming/non-streaming error
 * and SSE branches, and the Workers AI binding helper.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	streamAnthropicChatCompletion,
	anthropicChatCompletion,
	workersAIChatCompletion,
	chatCompletionWithKey,
	streamChatCompletion
} from '../../src/lib/services/openai-chat';

// Response whose body streams the given SSE lines.
function sseResponse(lines: string[]) {
	const enc = new TextEncoder();
	const chunks = lines.map((l) => enc.encode(l));
	let i = 0;
	return {
		ok: true,
		status: 200,
		statusText: 'OK',
		body: {
			getReader: () => ({
				read: async () =>
					i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined }
			})
		}
	};
}
function errResponse(status: number, body: string, statusText = 'Err') {
	return { ok: false, status, statusText, text: async () => body };
}
async function drain(gen: AsyncGenerator<any>) {
	const out: any[] = [];
	for await (const c of gen) out.push(c);
	return out;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('streamAnthropicChatCompletion', () => {
	it('maps 401/429/404 and generic errors to distinct messages', async () => {
		for (const [status, needle] of [
			[401, 'Invalid or expired Anthropic API key'],
			[429, 'rate limit exceeded'],
			[404, 'Model not available']
		] as const) {
			globalThis.fetch = vi.fn().mockResolvedValue(errResponse(status, '{}')) as any;
			await expect(
				drain(streamAnthropicChatCompletion('k', [{ role: 'user', content: 'hi' }]))
			).rejects.toThrow(needle as string);
		}
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue(
				errResponse(500, JSON.stringify({ error: { message: 'server melt' } }))
			) as any;
		await expect(
			drain(streamAnthropicChatCompletion('k', [{ role: 'user', content: 'hi' }]))
		).rejects.toThrow('server melt');
	});

	it('throws when the response has no body', async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, body: null }) as any;
		await expect(
			drain(streamAnthropicChatCompletion('k', [{ role: 'user', content: 'hi' }]))
		).rejects.toThrow('No response body');
	});

	it('parses the SSE event types, merges system messages, and tolerates bad JSON', async () => {
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue(
				sseResponse([
					'event: message_start\n',
					'data: {"type":"message_start","message":{"usage":{"input_tokens":5}}}\n',
					'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}\n',
					'data: {"type":"content_block_delta","delta":{"type":"other"}}\n',
					'data: {"type":"message_delta","usage":{"output_tokens":3}}\n',
					'data: {not json}\n',
					'data: {"type":"message_stop"}\n',
					'data: [DONE]\n'
				])
			) as any;
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const chunks = await drain(
			streamAnthropicChatCompletion('k', [
				{ role: 'system', content: 'A' },
				{ role: 'system', content: 'B' },
				{ role: 'user', content: 'hi' }
			])
		);
		expect(chunks.filter((c) => c.type === 'content').map((c) => c.content)).toEqual(['Hel']);
		const usage = chunks.find((c) => c.type === 'usage');
		expect(usage.usage).toMatchObject({ promptTokens: 5, completionTokens: 3, totalTokens: 8 });
		// Both system messages were merged into the top-level system param
		const sent = JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0][1]!.body as string);
		expect(sent.system).toBe('A\n\nB');
		spy.mockRestore();
	});
});

describe('anthropicChatCompletion', () => {
	it('returns the first text block', async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ content: [{ type: 'text', text: 'answer' }] })
		}) as any;
		expect(await anthropicChatCompletion('k', [{ role: 'user', content: 'q' }])).toBe('answer');
	});

	it('returns empty string when there is no content', async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as any;
		expect(await anthropicChatCompletion('k', [{ role: 'user', content: 'q' }])).toBe('');
	});

	it('promotes a system-only conversation to a user message and appends the JSON nudge', async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ content: [{ type: 'text', text: '{}' }] })
		}) as any;
		await anthropicChatCompletion('k', [{ role: 'system', content: 'Extract' }], {
			jsonMode: true
		});
		const sent = JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0][1]!.body as string);
		expect(sent.messages).toHaveLength(1);
		expect(sent.messages[0].role).toBe('user');
		expect(sent.messages[0].content).toContain('valid JSON only');
		expect(sent.system).toBeUndefined();
	});

	it('throws with the parsed detail, falling back to statusText', async () => {
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue(
				errResponse(400, JSON.stringify({ error: { message: 'bad req' } }))
			) as any;
		await expect(anthropicChatCompletion('k', [{ role: 'user', content: 'q' }])).rejects.toThrow(
			'bad req'
		);
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue(errResponse(500, 'not json', 'Server Error')) as any;
		await expect(anthropicChatCompletion('k', [{ role: 'user', content: 'q' }])).rejects.toThrow(
			'Server Error'
		);
	});
});

describe('workersAIChatCompletion', () => {
	const ai = (response: unknown) => ({ run: vi.fn().mockResolvedValue({ response }) });

	it('returns a string response as-is', async () => {
		expect(
			await workersAIChatCompletion(ai('hello') as any, [{ role: 'user', content: 'q' }])
		).toBe('hello');
	});

	it('stringifies an already-parsed object response', async () => {
		expect(
			await workersAIChatCompletion(ai({ brandName: 'X' }) as any, [{ role: 'user', content: 'q' }])
		).toBe('{"brandName":"X"}');
	});

	it('returns empty string for a missing response', async () => {
		expect(
			await workersAIChatCompletion(ai(undefined) as any, [{ role: 'user', content: 'q' }])
		).toBe('');
	});

	it('appends the JSON instruction to an existing system message', async () => {
		const binding = ai('{}');
		await workersAIChatCompletion(
			binding as any,
			[
				{ role: 'system', content: 'Sys' },
				{ role: 'user', content: 'q' }
			],
			{ jsonMode: true, maxTokens: 100, temperature: 0.2 }
		);
		const inputs = binding.run.mock.calls[0][1] as any;
		expect(inputs.messages[0].content).toContain('Sys');
		expect(inputs.messages[0].content).toContain('single valid JSON object');
		expect(inputs).toMatchObject({ max_tokens: 100, temperature: 0.2 });
	});

	it('prepends a system instruction when there is none', async () => {
		const binding = ai('{}');
		await workersAIChatCompletion(binding as any, [{ role: 'user', content: 'q' }], {
			jsonMode: true
		});
		const inputs = binding.run.mock.calls[0][1] as any;
		expect(inputs.messages[0].role).toBe('system');
	});
});

describe('chatCompletionWithKey model resolution', () => {
	const base = { id: 'k', name: 'n', enabled: true };

	it('uses models[0], then key.model, then a provider default', async () => {
		const binding = { run: vi.fn().mockResolvedValue({ response: 'ok' }) };

		// models[0] wins — but a workers-ai image model is rejected for chat
		await chatCompletionWithKey(
			{
				...base,
				provider: 'workers-ai',
				apiKey: '',
				ai: binding,
				models: ['@cf/black-forest-labs/flux-1-schnell']
			} as any,
			[{ role: 'user', content: 'q' }]
		);
		expect(binding.run.mock.calls[0][0]).toContain('llama');

		// key.model is used when models is empty
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ content: [{ type: 'text', text: 'a' }] })
		}) as any;
		await chatCompletionWithKey(
			{ ...base, provider: 'anthropic', apiKey: 'k', model: 'claude-3-5-sonnet-latest' } as any,
			[{ role: 'user', content: 'q' }]
		);
		expect(
			JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0][1]!.body as string).model
		).toBeTruthy();

		// no models at all → provider default
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ content: [{ type: 'text', text: 'a' }] })
		}) as any;
		await chatCompletionWithKey({ ...base, provider: 'anthropic', apiKey: 'k' } as any, [
			{ role: 'user', content: 'q' }
		]);
		expect(JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0][1]!.body as string).model).toBe(
			'claude-sonnet-4-20250514'
		);
	});

	it('falls through to the OpenAI path by default', async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ choices: [{ message: { content: 'hi' } }] })
		}) as any;
		const out = await chatCompletionWithKey({ ...base, provider: 'openai', apiKey: 'sk' } as any, [
			{ role: 'user', content: 'q' }
		]);
		expect(out).toBe('hi');
	});
});

describe('streamChatCompletion error detail parsing', () => {
	it('uses the parsed error message, and a dedicated message for 401', async () => {
		globalThis.fetch = vi.fn().mockResolvedValue(errResponse(401, '{}')) as any;
		await expect(
			drain(streamChatCompletion('sk', [{ role: 'user', content: 'q' }]))
		).rejects.toThrow('Invalid or expired OpenAI API key');

		globalThis.fetch = vi
			.fn()
			.mockResolvedValue(errResponse(500, JSON.stringify({ error: { message: 'boom' } }))) as any;
		await expect(
			drain(streamChatCompletion('sk', [{ role: 'user', content: 'q' }]))
		).rejects.toThrow('boom');
	});
});
