import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for multi-provider AI chat support.
 * Verifies that getAllEnabledAIKeys returns keys from all supported providers,
 * and that streamChatCompletionWithFallback routes to the correct provider API.
 */

const originalFetch = globalThis.fetch;

function createSSEStream(chunks: string[]): ReadableStream {
	return new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			for (const c of chunks) {
				controller.enqueue(encoder.encode(c));
			}
			controller.close();
		}
	});
}

function makeSSEResponse(stream: ReadableStream): Response {
	const resp = new Response(null, {
		status: 200,
		headers: { 'Content-Type': 'text/event-stream' }
	});
	Object.defineProperty(resp, 'body', { value: stream });
	return resp;
}

describe('Multi-provider AI chat', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	describe('getAllEnabledAIKeys', () => {
		it('returns keys from all text-chat providers (openai + anthropic)', async () => {
			const mockKV = {
				get: vi.fn().mockImplementation((key: string) => {
					if (key === 'ai_keys_list') return JSON.stringify(['k-ant', 'k-oai', 'k-wave']);
					if (key === 'ai_key:k-ant')
						return JSON.stringify({
							id: 'k-ant',
							provider: 'anthropic',
							enabled: true,
							apiKey: 'sk-ant-1'
						});
					if (key === 'ai_key:k-oai')
						return JSON.stringify({
							id: 'k-oai',
							provider: 'openai',
							enabled: true,
							apiKey: 'sk-oai-1'
						});
					if (key === 'ai_key:k-wave')
						return JSON.stringify({
							id: 'k-wave',
							provider: 'wavespeed',
							enabled: true,
							apiKey: 'ws-1'
						});
					return null;
				})
			};

			const { getAllEnabledAIKeys } = await import('../../src/lib/services/openai-chat');
			const keys = await getAllEnabledAIKeys({ env: { KV: mockKV } } as any);

			expect(keys).toHaveLength(2);
			expect(keys[0].provider).toBe('anthropic');
			expect(keys[1].provider).toBe('openai');
		});

		it('respects admin sort order (Anthropic first)', async () => {
			const mockKV = {
				get: vi.fn().mockImplementation((key: string) => {
					if (key === 'ai_keys_list') return JSON.stringify(['k-ant', 'k-oai']);
					if (key === 'ai_key:k-ant')
						return JSON.stringify({
							id: 'k-ant',
							provider: 'anthropic',
							enabled: true,
							apiKey: 'sk-ant-1',
							name: 'Anthropic'
						});
					if (key === 'ai_key:k-oai')
						return JSON.stringify({
							id: 'k-oai',
							provider: 'openai',
							enabled: true,
							apiKey: 'sk-oai-1',
							name: 'OpenAI'
						});
					return null;
				})
			};

			const { getAllEnabledAIKeys } = await import('../../src/lib/services/openai-chat');
			const keys = await getAllEnabledAIKeys({ env: { KV: mockKV } } as any);

			expect(keys[0].name).toBe('Anthropic');
			expect(keys[0].provider).toBe('anthropic');
		});

		it('excludes disabled keys', async () => {
			const mockKV = {
				get: vi.fn().mockImplementation((key: string) => {
					if (key === 'ai_keys_list') return JSON.stringify(['k-ant', 'k-oai']);
					if (key === 'ai_key:k-ant')
						return JSON.stringify({
							id: 'k-ant',
							provider: 'anthropic',
							enabled: false,
							apiKey: 'sk-ant-1'
						});
					if (key === 'ai_key:k-oai')
						return JSON.stringify({
							id: 'k-oai',
							provider: 'openai',
							enabled: true,
							apiKey: 'sk-oai-1'
						});
					return null;
				})
			};

			const { getAllEnabledAIKeys } = await import('../../src/lib/services/openai-chat');
			const keys = await getAllEnabledAIKeys({ env: { KV: mockKV } } as any);

			expect(keys).toHaveLength(1);
			expect(keys[0].provider).toBe('openai');
		});
	});

	describe('getFirstEnabledAIKey', () => {
		it('returns the first key in priority order (Anthropic when first)', async () => {
			const mockKV = {
				get: vi.fn().mockImplementation((key: string) => {
					if (key === 'ai_keys_list') return JSON.stringify(['k-ant', 'k-oai']);
					if (key === 'ai_key:k-ant')
						return JSON.stringify({
							id: 'k-ant',
							provider: 'anthropic',
							enabled: true,
							apiKey: 'sk-ant-1',
							name: 'My Anthropic'
						});
					if (key === 'ai_key:k-oai')
						return JSON.stringify({
							id: 'k-oai',
							provider: 'openai',
							enabled: true,
							apiKey: 'sk-oai-1'
						});
					return null;
				})
			};

			const { getFirstEnabledAIKey } = await import('../../src/lib/services/openai-chat');
			const key = await getFirstEnabledAIKey({ env: { KV: mockKV } } as any);

			expect(key).not.toBeNull();
			expect(key!.provider).toBe('anthropic');
			expect(key!.name).toBe('My Anthropic');
		});

		it('returns null when no keys configured', async () => {
			const mockKV = { get: vi.fn().mockResolvedValue(null) };

			const { getFirstEnabledAIKey } = await import('../../src/lib/services/openai-chat');
			const key = await getFirstEnabledAIKey({ env: { KV: mockKV } } as any);

			expect(key).toBeNull();
		});
	});

	describe('streamChatCompletionWithFallback - provider routing', () => {
		it('routes to Anthropic API when key.provider is anthropic', async () => {
			const fetchCalls: string[] = [];
			globalThis.fetch = vi.fn().mockImplementation((url: string) => {
				fetchCalls.push(url);
				const stream = createSSEStream([
					'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":10,"output_tokens":0}}}\n\n',
					'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n\n',
					'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":5}}\n\n',
					'event: message_stop\ndata: {"type":"message_stop"}\n\n'
				]);
				return Promise.resolve(makeSSEResponse(stream));
			});

			const { streamChatCompletionWithFallback } = await import(
				'../../src/lib/services/openai-chat'
			);
			const keys = [
				{
					id: 'k1',
					name: 'Anthropic Key',
					apiKey: 'sk-ant-test',
					provider: 'anthropic',
					enabled: true,
					models: ['claude-sonnet-4-20250514']
				}
			];

			const chunks: any[] = [];
			for await (const chunk of streamChatCompletionWithFallback(keys as any, [
				{ role: 'user', content: 'hi' }
			])) {
				chunks.push(chunk);
			}

			// Verify it called the Anthropic API, not OpenAI
			expect(fetchCalls[0]).toContain('api.anthropic.com');
			expect(fetchCalls[0]).not.toContain('api.openai.com');

			// Verify content was streamed
			const contentChunks = chunks.filter((c) => c.type === 'content');
			expect(contentChunks.length).toBeGreaterThan(0);
			expect(contentChunks[0].content).toBe('Hello');
		});

		it('routes to OpenAI API when key.provider is openai', async () => {
			const fetchCalls: string[] = [];
			globalThis.fetch = vi.fn().mockImplementation((url: string) => {
				fetchCalls.push(url);
				const stream = createSSEStream([
					`data: ${JSON.stringify({ choices: [{ delta: { content: 'Hi' } }] })}\n\n`,
					`data: ${JSON.stringify({ usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }, model: 'gpt-4o', choices: [] })}\n\n`,
					'data: [DONE]\n\n'
				]);
				return Promise.resolve(makeSSEResponse(stream));
			});

			const { streamChatCompletionWithFallback } = await import(
				'../../src/lib/services/openai-chat'
			);
			const keys = [
				{ id: 'k1', name: 'OpenAI Key', apiKey: 'sk-oai-test', provider: 'openai', enabled: true }
			];

			const chunks: any[] = [];
			for await (const chunk of streamChatCompletionWithFallback(keys as any, [
				{ role: 'user', content: 'hi' }
			])) {
				chunks.push(chunk);
			}

			expect(fetchCalls[0]).toContain('api.openai.com');
		});

		it('falls back from failed Anthropic key to OpenAI key', async () => {
			globalThis.fetch = vi.fn().mockImplementation((url: string) => {
				if (url.includes('anthropic')) {
					return Promise.resolve(new Response('Rate limited', { status: 429 }));
				}
				// OpenAI succeeds
				const stream = createSSEStream([
					`data: ${JSON.stringify({ choices: [{ delta: { content: 'Fallback!' } }] })}\n\n`,
					`data: ${JSON.stringify({ usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }, model: 'gpt-4o', choices: [] })}\n\n`,
					'data: [DONE]\n\n'
				]);
				return Promise.resolve(makeSSEResponse(stream));
			});

			const { streamChatCompletionWithFallback } = await import(
				'../../src/lib/services/openai-chat'
			);
			const keys = [
				{
					id: 'k1',
					name: 'Anthropic',
					apiKey: 'sk-ant-test',
					provider: 'anthropic',
					enabled: true,
					models: ['claude-sonnet-4-20250514']
				},
				{ id: 'k2', name: 'OpenAI', apiKey: 'sk-oai-test', provider: 'openai', enabled: true }
			];

			const chunks: any[] = [];
			for await (const chunk of streamChatCompletionWithFallback(keys as any, [
				{ role: 'user', content: 'hi' }
			])) {
				chunks.push(chunk);
			}

			// Should have status events showing fallback and then content
			const statusChunks = chunks.filter((c) => c.type === 'status');
			expect(statusChunks.length).toBe(2);
			expect(statusChunks[1].status.message).toContain('failed');
			expect(statusChunks[1].status.message).toContain('OpenAI');

			const contentChunks = chunks.filter((c) => c.type === 'content');
			expect(contentChunks[0].content).toBe('Fallback!');
		});

		it('uses key-configured model instead of requested model for Anthropic', async () => {
			let requestBody: any = null;
			globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
				requestBody = JSON.parse(init.body);
				const stream = createSSEStream([
					'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":10,"output_tokens":0}}}\n\n',
					'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"}}\n\n',
					'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":1}}\n\n',
					'event: message_stop\ndata: {"type":"message_stop"}\n\n'
				]);
				return makeSSEResponse(stream);
			});

			const { streamChatCompletionWithFallback } = await import(
				'../../src/lib/services/openai-chat'
			);
			const keys = [
				{
					id: 'k1',
					name: 'Anthropic',
					apiKey: 'sk-ant',
					provider: 'anthropic',
					enabled: true,
					models: ['claude-3-5-sonnet-20241022']
				}
			];

			// Requesting gpt-4o but Anthropic key has its own model configured
			for await (const _ of streamChatCompletionWithFallback(
				keys as any,
				[{ role: 'user', content: 'hi' }],
				{ model: 'gpt-4o' }
			)) {
				// consume
			}

			// The Anthropic API should have been called with the key's configured model
			expect(requestBody.model).toBe('claude-3-5-sonnet-20241022');
		});
	});

	describe('chatCompletionWithKey', () => {
		it('routes to Anthropic for anthropic provider', async () => {
			let calledUrl = '';
			globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
				calledUrl = url;
				return new Response(
					JSON.stringify({
						content: [{ type: 'text', text: '{"key": "value"}' }]
					}),
					{ status: 200 }
				);
			});

			const { chatCompletionWithKey } = await import('../../src/lib/services/openai-chat');
			const key = {
				id: 'k1',
				name: 'Ant',
				apiKey: 'sk-ant',
				provider: 'anthropic',
				enabled: true,
				models: ['claude-sonnet-4-20250514']
			};

			const result = await chatCompletionWithKey(
				key as any,
				[{ role: 'user', content: 'extract data' }],
				{ jsonMode: true }
			);

			expect(calledUrl).toContain('api.anthropic.com');
			expect(result).toContain('value');
		});

		it('routes to OpenAI for openai provider', async () => {
			let calledUrl = '';
			globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
				calledUrl = url;
				return new Response(
					JSON.stringify({
						choices: [{ message: { content: '{"key": "value"}' } }]
					}),
					{ status: 200 }
				);
			});

			const { chatCompletionWithKey } = await import('../../src/lib/services/openai-chat');
			const key = { id: 'k1', name: 'OAI', apiKey: 'sk-oai', provider: 'openai', enabled: true };

			const result = await chatCompletionWithKey(key as any, [
				{ role: 'user', content: 'extract data' }
			]);

			expect(calledUrl).toContain('api.openai.com');
			expect(result).toContain('value');
		});
	});

	describe('Anthropic message formatting', () => {
		it('extracts system messages to top-level parameter', async () => {
			let requestBody: any = null;
			globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
				requestBody = JSON.parse(init.body);
				return new Response(
					JSON.stringify({
						content: [{ type: 'text', text: 'response' }]
					}),
					{ status: 200 }
				);
			});

			const { anthropicChatCompletion } = await import('../../src/lib/services/openai-chat');
			await anthropicChatCompletion('sk-ant-test', [
				{ role: 'system', content: 'You are helpful' },
				{ role: 'user', content: 'Hello' }
			]);

			// System should be a top-level parameter, not in messages
			expect(requestBody.system).toBe('You are helpful');
			expect(requestBody.messages).toHaveLength(1);
			expect(requestBody.messages[0].role).toBe('user');
		});

		it('sends correct headers for Anthropic API', async () => {
			let requestHeaders: Record<string, string> = {};
			globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
				requestHeaders = Object.fromEntries(new Headers(init.headers).entries());
				return new Response(
					JSON.stringify({
						content: [{ type: 'text', text: 'ok' }]
					}),
					{ status: 200 }
				);
			});

			const { anthropicChatCompletion } = await import('../../src/lib/services/openai-chat');
			await anthropicChatCompletion('sk-ant-secret', [{ role: 'user', content: 'hi' }]);

			expect(requestHeaders['x-api-key']).toBe('sk-ant-secret');
			expect(requestHeaders['anthropic-version']).toBe('2023-06-01');
			// Should NOT have Authorization: Bearer header
			expect(requestHeaders['authorization']).toBeUndefined();
		});
	});
});
