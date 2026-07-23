/**
 * Tests for Chat Stream API, Onboarding Chat API, and Onboarding Start API
 * Covers low-coverage streaming/onboarding endpoints
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Helper to read a streaming Response body in happy-dom.
 * happy-dom's Response wraps the body but doesn't support .text() or .getReader() on it.
 * We intercept the original ReadableStream passed to new Response() and read it directly.
 */
let capturedStream: ReadableStream | null = null;
const OriginalResponse = globalThis.Response;
const SpyResponse = function (body?: any, init?: any) {
	if (body instanceof ReadableStream) {
		capturedStream = body;
	}
	return new OriginalResponse(body, init);
} as any;
SpyResponse.prototype = OriginalResponse.prototype;
SpyResponse.json = OriginalResponse.json;
SpyResponse.error = OriginalResponse.error;
SpyResponse.redirect = OriginalResponse.redirect;

async function readStreamResponse(response: Response): Promise<string> {
	const stream = capturedStream;
	capturedStream = null;
	if (!stream) return '';
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let result = '';
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		result += decoder.decode(value, { stream: true });
	}
	return result;
}

// Replace Response globally so our spy intercepts stream construction
globalThis.Response = SpyResponse;

// Mock dependent services
vi.mock('$lib/services/openai-chat', () => ({
	getEnabledOpenAIKey: vi.fn(),
	streamChatCompletion: vi.fn(),
	formatMessagesForOpenAI: vi.fn((msgs: any[]) => msgs),
	getAllEnabledAIKeys: vi.fn(),
	getFirstEnabledAIKey: vi.fn(),
	chatCompletionWithKey: vi.fn(),
	streamChatCompletionWithFallback: vi.fn()
}));

vi.mock('$lib/services/onboarding', () => ({
	createBrandProfile: vi.fn(),
	getBrandProfile: vi.fn(),
	addOnboardingMessage: vi.fn(),
	getOnboardingMessages: vi.fn(),
	buildConversationContext: vi.fn(),
	updateBrandProfile: vi.fn(),
	getNextStep: vi.fn(),
	getSystemPromptForStep: vi.fn(),
	getStepConfig: vi.fn(),
	STEP_COMPLETE_MARKER: '[STEP_COMPLETE]',
	ONBOARDING_STEPS: []
}));

vi.mock('$lib/utils/cost', () => ({
	calculateCost: vi.fn(() => ({ totalCost: 0.01 })),
	getModelDisplayName: vi.fn(() => 'GPT-4o'),
	calculateVideoCostFromPricing: vi.fn(() => 0)
}));

let mockDB: any;
let mockPlatform: any;
let mockLocals: any;

function createMockDB() {
	const chain: any = {
		prepare: vi.fn().mockReturnThis(),
		bind: vi.fn().mockReturnThis(),
		first: vi.fn().mockResolvedValue(null),
		all: vi.fn().mockResolvedValue({ results: [] }),
		run: vi.fn().mockResolvedValue({ success: true })
	};
	return chain;
}

beforeEach(() => {
	vi.clearAllMocks();
	mockDB = createMockDB();
	mockPlatform = {
		env: {
			DB: mockDB,
			KV: {
				get: vi.fn().mockResolvedValue(null),
				put: vi.fn().mockResolvedValue(undefined)
			}
		},
		context: {
			waitUntil: vi.fn()
		}
	};
	mockLocals = { user: { id: 'user-123', login: 'testuser' } };
});

// ─────────────────────────────────────
// POST /api/chat/stream - Extended coverage
// ─────────────────────────────────────
describe('POST /api/chat/stream - Extended coverage', () => {
	it('should return 400 when conversationId is missing', async () => {
		const { POST } = await import('../../src/routes/api/chat/stream/+server');

		const request = new Request('http://localhost', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				messages: [{ role: 'user', content: 'Hello' }]
			})
		});

		try {
			await POST({ request, platform: mockPlatform, locals: mockLocals } as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return 400 when messages are empty', async () => {
		const { POST } = await import('../../src/routes/api/chat/stream/+server');

		const request = new Request('http://localhost', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ messages: [], conversationId: 'conv-1' })
		});

		try {
			await POST({ request, platform: mockPlatform, locals: mockLocals } as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should stream responses with content and usage chunks', async () => {
		const { POST } = await import('../../src/routes/api/chat/stream/+server');
		const { getAllEnabledAIKeys, streamChatCompletionWithFallback } = await import(
			'$lib/services/openai-chat'
		);

		vi.mocked(getAllEnabledAIKeys).mockResolvedValue([
			{
				apiKey: 'sk-test',
				provider: 'openai',
				id: 'k1',
				name: 'Test',
				enabled: true
			}
		] as any);

		// Create an async iterator that yields content then usage
		async function* mockStream() {
			yield { type: 'content', content: 'Hello ' };
			yield { type: 'content', content: 'world!' };
			yield {
				type: 'usage',
				model: 'gpt-4o',
				usage: { promptTokens: 10, completionTokens: 5 }
			};
		}
		vi.mocked(streamChatCompletionWithFallback).mockReturnValue(mockStream() as any);

		const request = new Request('http://localhost', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				messages: [{ role: 'user', content: 'Hello' }],
				conversationId: 'conv-1',
				model: 'gpt-4o'
			})
		});

		const response = await POST({
			request,
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		expect(response.headers.get('Content-Type')).toBe('text/event-stream');

		// Read the stream to verify content
		const result = await readStreamResponse(response);

		expect(result).toContain('"content":"Hello "');
		expect(result).toContain('"content":"world!"');
		expect(result).toContain('"usage"');
		expect(result).toContain('[DONE]');

		// Verify waitUntil was called for persistence
		expect(mockPlatform.context.waitUntil).toHaveBeenCalled();
	});

	it('should handle unexpected throw during stream setup', async () => {
		const { POST } = await import('../../src/routes/api/chat/stream/+server');
		const { getAllEnabledAIKeys, streamChatCompletionWithFallback } = await import(
			'$lib/services/openai-chat'
		);

		vi.mocked(getAllEnabledAIKeys).mockResolvedValue([
			{
				apiKey: 'sk-test',
				provider: 'openai',
				id: 'k1',
				name: 'Test',
				enabled: true
			}
		] as any);

		async function* mockStream(): AsyncGenerator<any> {
			throw new Error('Stream blew up');
		}
		vi.mocked(streamChatCompletionWithFallback).mockReturnValue(mockStream() as any);

		const request = new Request('http://localhost', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				messages: [{ role: 'user', content: 'Hello' }],
				conversationId: 'conv-1'
			})
		});

		const response = await POST({
			request,
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		// Should still return a streaming response, but with error
		expect(response.headers.get('Content-Type')).toBe('text/event-stream');
		const result = await readStreamResponse(response);
		expect(result).toContain('"error"');
	});

	it('should not persist when no platform.context', async () => {
		const { POST } = await import('../../src/routes/api/chat/stream/+server');
		const { getAllEnabledAIKeys, streamChatCompletionWithFallback } = await import(
			'$lib/services/openai-chat'
		);

		vi.mocked(getAllEnabledAIKeys).mockResolvedValue([
			{
				apiKey: 'sk-test',
				provider: 'openai',
				id: 'k1',
				name: 'Test',
				enabled: true
			}
		] as any);

		async function* mockStream() {
			yield { type: 'content', content: 'Hi' };
		}
		vi.mocked(streamChatCompletionWithFallback).mockReturnValue(mockStream() as any);

		const platformNoContext = { ...mockPlatform, context: undefined };
		const request = new Request('http://localhost', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				messages: [{ role: 'user', content: 'Hello' }],
				conversationId: 'conv-1'
			})
		});

		const response = await POST({
			request,
			platform: platformNoContext,
			locals: mockLocals
		} as any);

		// consume stream
		await readStreamResponse(response);

		expect(response.status).toBe(200);
	});

	it('should handle generic error during JSON parse', async () => {
		const { POST } = await import('../../src/routes/api/chat/stream/+server');

		const request = new Request('http://localhost', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{invalid'
		});

		try {
			await POST({ request, platform: mockPlatform, locals: mockLocals } as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});
});

// ─────────────────────────────────────
// POST /api/onboarding/chat - Full coverage
// ─────────────────────────────────────
describe('POST /api/onboarding/chat', () => {
	it('should return 401 when not authenticated', async () => {
		const { POST } = await import('../../src/routes/api/onboarding/chat/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({})
				}),
				platform: mockPlatform,
				locals: { user: null }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 400 when fields missing', async () => {
		const { POST } = await import('../../src/routes/api/onboarding/chat/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ profileId: 'p1' })
				}),
				platform: mockPlatform,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return 404 when profile not found', async () => {
		const { getBrandProfile } = await import('$lib/services/onboarding');
		vi.mocked(getBrandProfile).mockResolvedValue(null);

		const { POST } = await import('../../src/routes/api/onboarding/chat/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ profileId: 'p1', message: 'Hi', step: 'welcome' })
				}),
				platform: mockPlatform,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});

	it('should return 403 when profile belongs to another user', async () => {
		const { getBrandProfile } = await import('$lib/services/onboarding');
		vi.mocked(getBrandProfile).mockResolvedValue({
			id: 'p1',
			userId: 'other-user',
			onboardingStep: 'welcome'
		} as any);

		const { POST } = await import('../../src/routes/api/onboarding/chat/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ profileId: 'p1', message: 'Hi', step: 'welcome' })
				}),
				platform: mockPlatform,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(403);
		}
	});

	it('should return 503 when no AI key available', async () => {
		const { getBrandProfile } = await import('$lib/services/onboarding');
		const { getAllEnabledAIKeys } = await import('$lib/services/openai-chat');

		vi.mocked(getBrandProfile).mockResolvedValue({
			id: 'p1',
			userId: 'user-123',
			onboardingStep: 'welcome'
		} as any);
		vi.mocked(getAllEnabledAIKeys).mockResolvedValue([]);

		const { POST } = await import('../../src/routes/api/onboarding/chat/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ profileId: 'p1', message: 'Hi', step: 'welcome' })
				}),
				platform: mockPlatform,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(503);
		}
	});

	it('should stream onboarding chat response with content and usage', async () => {
		const {
			getBrandProfile,
			addOnboardingMessage,
			getOnboardingMessages,
			buildConversationContext,
			getNextStep
		} = await import('$lib/services/onboarding');
		const { getAllEnabledAIKeys, streamChatCompletionWithFallback } = await import(
			'$lib/services/openai-chat'
		);

		vi.mocked(getBrandProfile).mockResolvedValue({
			id: 'p1',
			userId: 'user-123',
			onboardingStep: 'welcome'
		} as any);
		vi.mocked(getAllEnabledAIKeys).mockResolvedValue([
			{
				apiKey: 'sk-test',
				provider: 'openai',
				id: 'k1',
				name: 'Test',
				enabled: true
			}
		] as any);
		vi.mocked(addOnboardingMessage).mockResolvedValue({ id: 'msg-1' } as any);
		vi.mocked(getOnboardingMessages).mockResolvedValue([]);
		vi.mocked(buildConversationContext).mockReturnValue([]);
		vi.mocked(getNextStep).mockReturnValue(null);

		async function* mockStream() {
			yield { type: 'content', content: 'Welcome!' };
			yield {
				type: 'usage',
				model: 'gpt-4o',
				usage: { promptTokens: 10, completionTokens: 5 }
			};
		}
		vi.mocked(streamChatCompletionWithFallback).mockReturnValue(mockStream() as any);

		const { POST } = await import('../../src/routes/api/onboarding/chat/+server');
		const response = await POST({
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ profileId: 'p1', message: 'Hi', step: 'welcome' })
			}),
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		expect(response.headers.get('Content-Type')).toBe('text/event-stream');

		// Read stream
		const result = await readStreamResponse(response);

		expect(result).toContain('"content":"Welcome!"');
		expect(result).toContain('"usage"');
		expect(result).toContain('[DONE]');
	});

	it('should handle STEP_COMPLETE_MARKER in response', async () => {
		const {
			getBrandProfile,
			addOnboardingMessage,
			getOnboardingMessages,
			buildConversationContext,
			getNextStep,
			STEP_COMPLETE_MARKER
		} = await import('$lib/services/onboarding');
		const { getAllEnabledAIKeys, streamChatCompletionWithFallback } = await import(
			'$lib/services/openai-chat'
		);

		vi.mocked(getBrandProfile).mockResolvedValue({
			id: 'p1',
			userId: 'user-123',
			onboardingStep: 'welcome'
		} as any);
		vi.mocked(getAllEnabledAIKeys).mockResolvedValue([
			{
				apiKey: 'sk-test',
				provider: 'openai',
				id: 'k1',
				name: 'Test',
				enabled: true
			}
		] as any);
		vi.mocked(addOnboardingMessage).mockResolvedValue({ id: 'msg-1' } as any);
		vi.mocked(getOnboardingMessages).mockResolvedValue([]);
		vi.mocked(buildConversationContext).mockReturnValue([]);
		vi.mocked(getNextStep).mockReturnValue('brand_assessment');

		async function* mockStream() {
			yield { type: 'content', content: `Great!${STEP_COMPLETE_MARKER}` };
		}
		vi.mocked(streamChatCompletionWithFallback).mockReturnValue(mockStream() as any);

		const { POST } = await import('../../src/routes/api/onboarding/chat/+server');
		const response = await POST({
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ profileId: 'p1', message: 'Hi', step: 'welcome' })
			}),
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const result = await readStreamResponse(response);

		expect(result).toContain('"stepAdvance":"brand_assessment"');
		expect(mockPlatform.context.waitUntil).toHaveBeenCalled();
	});

	it('should handle stream error gracefully', async () => {
		const {
			getBrandProfile,
			addOnboardingMessage,
			getOnboardingMessages,
			buildConversationContext
		} = await import('$lib/services/onboarding');
		const { getAllEnabledAIKeys, streamChatCompletionWithFallback } = await import(
			'$lib/services/openai-chat'
		);

		vi.mocked(getBrandProfile).mockResolvedValue({
			id: 'p1',
			userId: 'user-123',
			onboardingStep: 'welcome'
		} as any);
		vi.mocked(getAllEnabledAIKeys).mockResolvedValue([
			{
				apiKey: 'sk-test',
				provider: 'openai',
				id: 'k1',
				name: 'Test',
				enabled: true
			}
		] as any);
		vi.mocked(addOnboardingMessage).mockResolvedValue({ id: 'msg-1' } as any);
		vi.mocked(getOnboardingMessages).mockResolvedValue([]);
		vi.mocked(buildConversationContext).mockReturnValue([]);

		async function* mockStream(): AsyncGenerator<any> {
			throw new Error('AI error');
		}
		vi.mocked(streamChatCompletionWithFallback).mockReturnValue(mockStream() as any);

		const { POST } = await import('../../src/routes/api/onboarding/chat/+server');
		const response = await POST({
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ profileId: 'p1', message: 'Hi', step: 'welcome' })
			}),
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const result = await readStreamResponse(response);

		expect(result).toContain('"error":"AI error"');
	});

	it('should not persist when no platform.context', async () => {
		const {
			getBrandProfile,
			addOnboardingMessage,
			getOnboardingMessages,
			buildConversationContext
		} = await import('$lib/services/onboarding');
		const { getAllEnabledAIKeys, streamChatCompletionWithFallback } = await import(
			'$lib/services/openai-chat'
		);

		vi.mocked(getBrandProfile).mockResolvedValue({
			id: 'p1',
			userId: 'user-123',
			onboardingStep: 'welcome'
		} as any);
		vi.mocked(getAllEnabledAIKeys).mockResolvedValue([
			{
				apiKey: 'sk-test',
				provider: 'openai',
				id: 'k1',
				name: 'Test',
				enabled: true
			}
		] as any);
		vi.mocked(addOnboardingMessage).mockResolvedValue({ id: 'msg-1' } as any);
		vi.mocked(getOnboardingMessages).mockResolvedValue([]);
		vi.mocked(buildConversationContext).mockReturnValue([]);

		async function* mockStream() {
			yield { type: 'content', content: 'Hello' };
		}
		vi.mocked(streamChatCompletionWithFallback).mockReturnValue(mockStream() as any);

		const { POST } = await import('../../src/routes/api/onboarding/chat/+server');
		const response = await POST({
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ profileId: 'p1', message: 'Hi', step: 'welcome' })
			}),
			platform: { ...mockPlatform, context: undefined },
			locals: mockLocals
		} as any);

		await readStreamResponse(response);
		expect(response.status).toBe(200);
	});
});

// ─────────────────────────────────────
// POST /api/onboarding/start - Extended
// ─────────────────────────────────────
describe('POST /api/onboarding/start - Extended', () => {
	it('should return 401 when not authenticated', async () => {
		const { POST } = await import('../../src/routes/api/onboarding/start/+server');
		try {
			await POST({
				platform: mockPlatform,
				locals: { user: null }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should create profile and return welcome message', async () => {
		const { createBrandProfile, addOnboardingMessage, getSystemPromptForStep } = await import(
			'$lib/services/onboarding'
		);
		const { getFirstEnabledAIKey, streamChatCompletionWithFallback } = await import(
			'$lib/services/openai-chat'
		);

		vi.mocked(createBrandProfile).mockResolvedValue({
			id: 'profile-1',
			userId: 'user-123',
			onboardingStep: 'welcome'
		} as any);
		vi.mocked(getSystemPromptForStep).mockReturnValue('Welcome prompt');
		vi.mocked(getFirstEnabledAIKey).mockResolvedValue({
			apiKey: 'sk-test',
			provider: 'openai'
		} as any);
		vi.mocked(addOnboardingMessage).mockResolvedValue({
			id: 'msg-1',
			role: 'assistant',
			content: 'Welcome!'
		} as any);

		async function* mockStream() {
			yield { type: 'content', content: 'Welcome!' };
		}
		vi.mocked(streamChatCompletionWithFallback).mockReturnValue(mockStream() as any);

		const { POST } = await import('../../src/routes/api/onboarding/start/+server');
		const response = await POST({
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const data = await response.json();
		expect(data.profile.id).toBe('profile-1');
		expect(data.message).toEqual(
			expect.objectContaining({ role: 'assistant', content: 'Welcome!' })
		);
	});

	it('should return profile without message when no AI key', async () => {
		const { createBrandProfile } = await import('$lib/services/onboarding');
		const { getFirstEnabledAIKey } = await import('$lib/services/openai-chat');

		vi.mocked(createBrandProfile).mockResolvedValue({
			id: 'profile-1',
			userId: 'user-123'
		} as any);
		vi.mocked(getFirstEnabledAIKey).mockResolvedValue(null);

		const { POST } = await import('../../src/routes/api/onboarding/start/+server');
		const response = await POST({
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const data = await response.json();
		expect(data.profile.id).toBe('profile-1');
		expect(data.message).toBeNull();
		expect(data.error).toBe('No AI provider configured');
	});

	it('should handle AI generation failure gracefully', async () => {
		const { createBrandProfile, getSystemPromptForStep } = await import('$lib/services/onboarding');
		const { getFirstEnabledAIKey, streamChatCompletionWithFallback } = await import(
			'$lib/services/openai-chat'
		);

		vi.mocked(createBrandProfile).mockResolvedValue({
			id: 'profile-1',
			userId: 'user-123'
		} as any);
		vi.mocked(getSystemPromptForStep).mockReturnValue('prompt');
		vi.mocked(getFirstEnabledAIKey).mockResolvedValue({
			apiKey: 'sk-test',
			provider: 'openai'
		} as any);

		async function* mockStream(): AsyncGenerator<any> {
			throw new Error('API error');
		}
		vi.mocked(streamChatCompletionWithFallback).mockReturnValue(mockStream() as any);

		const { POST } = await import('../../src/routes/api/onboarding/start/+server');
		const response = await POST({
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const data = await response.json();
		expect(data.profile.id).toBe('profile-1');
		expect(data.message).toBeNull();
		expect(data.error).toBe('Failed to generate welcome message');
	});
});
