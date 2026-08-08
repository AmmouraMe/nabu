/**
 * Tests for chatCompletion function in openai-chat.ts
 * Covers: lines 87-128 (non-streaming chat completion with JSON mode)
 * Target: 86.95% → higher stmts, 80% → 100% funcs
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
	vi.clearAllMocks();
	originalFetch = globalThis.fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe('chatCompletion', () => {
	it('should make a non-streaming API call and return content', async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ message: { content: '{"name": "TestBrand"}' } }]
			})
		});

		const { chatCompletion } = await import('$lib/services/openai-chat');
		const result = await chatCompletion('sk-test', [
			{ role: 'system', content: 'Extract brand info' },
			{ role: 'user', content: 'My brand is TestBrand' }
		]);

		expect(result).toBe('{"name": "TestBrand"}');
		expect(globalThis.fetch).toHaveBeenCalledWith(
			'https://api.openai.com/v1/chat/completions',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					Authorization: 'Bearer sk-test'
				})
			})
		);
	});

	it('should use default options when none provided', async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ message: { content: 'response' } }]
			})
		});

		const { chatCompletion } = await import('$lib/services/openai-chat');
		await chatCompletion('sk-test', [{ role: 'user', content: 'Hello' }]);

		const fetchCall = (globalThis.fetch as any).mock.calls[0];
		const body = JSON.parse(fetchCall[1].body);
		expect(body.model).toBe('gpt-4o-mini');
		expect(body.temperature).toBe(0.1);
		expect(body.max_tokens).toBe(1024);
		expect(body.response_format).toBeUndefined();
	});

	it('should enable JSON mode when jsonMode is true', async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ message: { content: '{"key": "value"}' } }]
			})
		});

		const { chatCompletion } = await import('$lib/services/openai-chat');
		await chatCompletion('sk-test', [{ role: 'user', content: 'Extract data' }], {
			jsonMode: true
		});

		const fetchCall = (globalThis.fetch as any).mock.calls[0];
		const body = JSON.parse(fetchCall[1].body);
		expect(body.response_format).toEqual({ type: 'json_object' });
	});

	it('should use custom model, temperature, and maxTokens', async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ message: { content: 'resp' } }]
			})
		});

		const { chatCompletion } = await import('$lib/services/openai-chat');
		await chatCompletion('sk-test', [{ role: 'user', content: 'Hello' }], {
			model: 'gpt-4o',
			temperature: 0.8,
			maxTokens: 2048
		});

		const fetchCall = (globalThis.fetch as any).mock.calls[0];
		const body = JSON.parse(fetchCall[1].body);
		expect(body.model).toBe('gpt-4o');
		expect(body.temperature).toBe(0.8);
		expect(body.max_tokens).toBe(2048);
	});

	it('should throw on API error', async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 401,
			statusText: 'Unauthorized',
			text: async () => JSON.stringify({ error: { message: 'Invalid API key' } })
		});

		const { chatCompletion } = await import('$lib/services/openai-chat');
		await expect(chatCompletion('sk-bad', [{ role: 'user', content: 'Hello' }])).rejects.toThrow(
			'OpenAI API error (401): Invalid API key'
		);
	});

	it('should return empty string when choices is empty', async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: []
			})
		});

		const { chatCompletion } = await import('$lib/services/openai-chat');
		const result = await chatCompletion('sk-test', [{ role: 'user', content: 'Hello' }]);

		expect(result).toBe('');
	});

	it('should return empty string when content is null', async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ message: { content: null } }]
			})
		});

		const { chatCompletion } = await import('$lib/services/openai-chat');
		const result = await chatCompletion('sk-test', [{ role: 'user', content: 'Hello' }]);

		expect(result).toBe('');
	});
});

describe('formatMessagesForOpenAI - attachment handling', () => {
	it('should handle user messages with image attachments as multi-modal', async () => {
		const { formatMessagesForOpenAI } = await import('$lib/services/openai-chat');

		const messages = [
			{
				id: '1',
				role: 'user',
				content: 'Look at this logo',
				timestamp: new Date(),
				attachments: [
					{
						id: 'att-1',
						type: 'image' as const,
						name: 'logo.png',
						url: 'https://example.com/logo.png',
						mimeType: 'image/png',
						size: 1024
					}
				]
			}
		];

		const result = formatMessagesForOpenAI(messages);
		expect(result).toHaveLength(1);
		expect(Array.isArray(result[0].content)).toBe(true);

		const content = result[0].content as any[];
		expect(content[0]).toEqual({ type: 'text', text: 'Look at this logo' });
		expect(content[1]).toEqual({
			type: 'image_url',
			image_url: { url: 'https://example.com/logo.png', detail: 'auto' }
		});
	});

	it('should handle video attachments by appending note to text', async () => {
		const { formatMessagesForOpenAI } = await import('$lib/services/openai-chat');

		const messages = [
			{
				id: '1',
				role: 'user',
				content: 'Check this video',
				timestamp: new Date(),
				attachments: [
					{
						id: 'att-2',
						type: 'video' as const,
						name: 'brand-intro.mp4',
						url: 'https://example.com/video.mp4',
						mimeType: 'video/mp4'
					}
				]
			}
		];

		const result = formatMessagesForOpenAI(messages);
		expect(result).toHaveLength(1);
		expect(typeof result[0].content).toBe('string');
		expect(result[0].content).toContain('[Attached video: brand-intro.mp4]');
	});

	it('should handle multiple video attachments (plural label)', async () => {
		const { formatMessagesForOpenAI } = await import('$lib/services/openai-chat');

		const messages = [
			{
				id: '1',
				role: 'user',
				content: 'Check these',
				timestamp: new Date(),
				attachments: [
					{
						id: 'v1',
						type: 'video' as const,
						name: 'vid1.mp4',
						url: 'url1',
						mimeType: 'video/mp4'
					},
					{ id: 'v2', type: 'video' as const, name: 'vid2.mp4', url: 'url2', mimeType: 'video/mp4' }
				]
			}
		];

		const result = formatMessagesForOpenAI(messages);
		expect(result[0].content).toContain('[Attached videos: vid1.mp4, vid2.mp4]');
	});

	it('should handle both image and video attachments together', async () => {
		const { formatMessagesForOpenAI } = await import('$lib/services/openai-chat');

		const messages = [
			{
				id: '1',
				role: 'user',
				content: 'Mixed media',
				timestamp: new Date(),
				attachments: [
					{
						id: 'i1',
						type: 'image' as const,
						name: 'logo.png',
						url: 'https://img.com/logo.png',
						mimeType: 'image/png'
					},
					{
						id: 'v1',
						type: 'video' as const,
						name: 'demo.mp4',
						url: 'https://vid.com/demo.mp4',
						mimeType: 'video/mp4'
					}
				]
			}
		];

		const result = formatMessagesForOpenAI(messages);
		expect(Array.isArray(result[0].content)).toBe(true);
		const content = result[0].content as any[];
		// Text should include video note
		expect(content[0].text).toContain('[Attached video: demo.mp4]');
		// Should have image URL part
		expect(content[1].type).toBe('image_url');
	});

	it('should ignore attachments on assistant messages', async () => {
		const { formatMessagesForOpenAI } = await import('$lib/services/openai-chat');

		const messages = [
			{
				id: '1',
				role: 'assistant',
				content: 'Here is the result',
				timestamp: new Date(),
				attachments: [
					{
						id: 'i1',
						type: 'image' as const,
						name: 'result.png',
						url: 'https://img.com/r.png',
						mimeType: 'image/png'
					}
				]
			}
		];

		const result = formatMessagesForOpenAI(messages);
		expect(result).toHaveLength(1);
		expect(typeof result[0].content).toBe('string');
		expect(result[0].content).toBe('Here is the result');
	});

	it('should filter out non-user/assistant/system roles', async () => {
		const { formatMessagesForOpenAI } = await import('$lib/services/openai-chat');

		const messages = [
			{ id: '1', role: 'user', content: 'Hello', timestamp: new Date() },
			{ id: '2', role: 'function', content: 'fn result', timestamp: new Date() },
			{ id: '3', role: 'assistant', content: 'Hi', timestamp: new Date() }
		];

		const result = formatMessagesForOpenAI(messages);
		expect(result).toHaveLength(2);
		expect(result[0].role).toBe('user');
		expect(result[1].role).toBe('assistant');
	});
});
