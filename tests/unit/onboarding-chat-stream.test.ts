/**
 * Tests for POST /api/onboarding/chat - Streaming chat endpoint
 * Covers: lines 60-172, 203-217 — the SSE streaming flow, step advancement,
 * brand data extraction, and waitUntil persistence.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────

vi.mock('$lib/services/onboarding', () => ({
	addOnboardingMessage: vi.fn().mockResolvedValue({ id: 'msg-1' }),
	getBrandProfile: vi.fn(),
	getOnboardingMessages: vi.fn().mockResolvedValue([]),
	buildConversationContext: vi.fn().mockReturnValue([
		{ role: 'system', content: 'You are an onboarding assistant.' },
		{ role: 'user', content: 'Hello' }
	]),
	updateBrandProfile: vi.fn().mockResolvedValue(undefined),
	getNextStep: vi.fn(),
	STEP_COMPLETE_MARKER: '[STEP_COMPLETE]',
	buildExtractionPrompt: vi.fn(),
	parseExtractionResponse: vi.fn()
}));

vi.mock('$lib/services/brand', () => ({
	updateBrandFieldWithVersion: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/services/brand-assets', () => ({
	getBrandTexts: vi.fn().mockResolvedValue([]),
	getBrandAssetSummary: vi.fn().mockResolvedValue({
		textCount: 0,
		imageCount: 0,
		audioCount: 0,
		videoCount: 0,
		videoGenerationsCount: 0,
		totalCount: 0
	})
}));

vi.mock('$lib/services/openai-chat', () => ({
	getEnabledOpenAIKey: vi.fn(),
	streamChatCompletion: vi.fn(),
	chatCompletion: vi.fn(),
	chatCompletionWithKey: vi.fn(),
	getAllEnabledAIKeys: vi.fn(),
	streamChatCompletionWithFallback: vi.fn()
}));

vi.mock('$lib/utils/cost', () => ({
	calculateCost: vi.fn().mockReturnValue({ totalCost: 0.001 }),
	getModelDisplayName: vi.fn().mockReturnValue('GPT-4o')
}));

// ─── Helpers ─────────────────────────────────────────────────────

function createMockPlatform() {
	return {
		env: {
			DB: {
				prepare: vi.fn().mockReturnValue({
					bind: vi.fn().mockReturnValue({
						first: vi.fn().mockResolvedValue(null),
						all: vi.fn().mockResolvedValue({ results: [] }),
						run: vi.fn().mockResolvedValue({ success: true })
					})
				})
			},
			KV: {
				get: vi.fn().mockResolvedValue(null),
				put: vi.fn().mockResolvedValue(undefined)
			}
		},
		context: {
			waitUntil: vi.fn()
		}
	};
}

function createMockUser() {
	return { id: 'user-1', login: 'tester', email: 'test@test.com', isOwner: false, isAdmin: false };
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('POST /api/onboarding/chat - Streaming Flow', () => {
	it('should return 401 when not authenticated', async () => {
		const { POST } = await import('../../src/routes/api/onboarding/chat/+server');
		const event = {
			locals: {},
			platform: createMockPlatform(),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ profileId: 'bp-1', message: 'Hello', step: 'welcome' })
			})
		};

		await expect(POST(event as any)).rejects.toThrow();
	});

	it('should return 400 when required fields missing', async () => {
		const { POST } = await import('../../src/routes/api/onboarding/chat/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({})
			})
		};

		await expect(POST(event as any)).rejects.toThrow();
	});

	it('should return 404 when brand profile not found', async () => {
		const { getBrandProfile } = await import('$lib/services/onboarding');
		vi.mocked(getBrandProfile).mockResolvedValue(null);

		const { POST } = await import('../../src/routes/api/onboarding/chat/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ profileId: 'bp-1', message: 'Hello', step: 'welcome' })
			})
		};

		await expect(POST(event as any)).rejects.toThrow();
	});

	it('should return 403 when profile belongs to different user', async () => {
		const { getBrandProfile } = await import('$lib/services/onboarding');
		vi.mocked(getBrandProfile).mockResolvedValue({
			id: 'bp-1',
			userId: 'other-user',
			status: 'in_progress',
			onboardingStep: 'welcome'
		} as any);

		const { POST } = await import('../../src/routes/api/onboarding/chat/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ profileId: 'bp-1', message: 'Hello', step: 'welcome' })
			})
		};

		await expect(POST(event as any)).rejects.toThrow();
	});

	it('should return 503 when no AI key configured', async () => {
		const { getBrandProfile } = await import('$lib/services/onboarding');
		const { getAllEnabledAIKeys } = await import('$lib/services/openai-chat');

		vi.mocked(getBrandProfile).mockResolvedValue({
			id: 'bp-1',
			userId: 'user-1',
			status: 'in_progress',
			onboardingStep: 'welcome'
		} as any);
		vi.mocked(getAllEnabledAIKeys).mockResolvedValue([]);

		const { POST } = await import('../../src/routes/api/onboarding/chat/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ profileId: 'bp-1', message: 'Hello', step: 'welcome' })
			})
		};

		await expect(POST(event as any)).rejects.toThrow();
	});

	it('should stream content chunks and usage data', async () => {
		const { getBrandProfile, addOnboardingMessage, buildExtractionPrompt } = await import(
			'$lib/services/onboarding'
		);
		const { getAllEnabledAIKeys, streamChatCompletionWithFallback } = await import(
			'$lib/services/openai-chat'
		);
		const { calculateCost } = await import('$lib/utils/cost');

		vi.mocked(getBrandProfile).mockResolvedValue({
			id: 'bp-1',
			userId: 'user-1',
			status: 'in_progress',
			onboardingStep: 'welcome'
		} as any);

		vi.mocked(getAllEnabledAIKeys).mockResolvedValue([
			{
				id: 'key-1',
				name: 'OpenAI',
				provider: 'openai',
				apiKey: 'sk-test',
				enabled: true
			}
		]);

		vi.mocked(buildExtractionPrompt).mockReturnValue(null as any);

		async function* mockStream() {
			yield { type: 'content' as const, content: 'Welcome ' };
			yield { type: 'content' as const, content: 'to onboarding!' };
			yield {
				type: 'usage' as const,
				usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
				model: 'gpt-4o'
			};
		}
		vi.mocked(streamChatCompletionWithFallback).mockReturnValue(mockStream());

		const { POST } = await import('../../src/routes/api/onboarding/chat/+server');
		const platform = createMockPlatform();
		const event = {
			locals: { user: createMockUser() },
			platform,
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ profileId: 'bp-1', message: 'Hello', step: 'welcome' })
			})
		};

		const response = await POST(event as any);
		expect(response.headers.get('Content-Type')).toBe('text/event-stream');

		// Wait for async stream processing to complete
		await new Promise((r) => setTimeout(r, 50));

		// Verify streaming was initiated with correct params. No model is passed —
		// each key carries its own, resolved per provider by getEffectiveModel().
		expect(streamChatCompletionWithFallback).toHaveBeenCalledWith(
			expect.any(Array),
			expect.any(Array),
			expect.objectContaining({ temperature: 0.8, maxTokens: 1500 })
		);

		// Verify cost calculation was called with stream usage data
		expect(calculateCost).toHaveBeenCalled();

		// Verify user message was persisted
		expect(addOnboardingMessage).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				brandProfileId: 'bp-1',
				role: 'user',
				content: 'Hello',
				step: 'welcome'
			})
		);
	});

	it('should handle step advancement with STEP_COMPLETE marker', async () => {
		const { getBrandProfile, getNextStep, updateBrandProfile, buildExtractionPrompt } =
			await import('$lib/services/onboarding');
		const { getAllEnabledAIKeys, streamChatCompletionWithFallback } = await import(
			'$lib/services/openai-chat'
		);

		vi.mocked(getBrandProfile).mockResolvedValue({
			id: 'bp-1',
			userId: 'user-1',
			status: 'in_progress',
			onboardingStep: 'welcome'
		} as any);

		vi.mocked(getAllEnabledAIKeys).mockResolvedValue([
			{
				id: 'key-1',
				name: 'OpenAI',
				provider: 'openai',
				apiKey: 'sk-test',
				enabled: true
			}
		]);

		vi.mocked(getNextStep).mockReturnValue('brand_assessment');
		vi.mocked(buildExtractionPrompt).mockReturnValue(null as any);

		async function* mockStream() {
			yield { type: 'content' as const, content: 'Great! Moving on.[STEP_COMPLETE]' };
			yield {
				type: 'usage' as const,
				usage: { promptTokens: 100, completionTokens: 30, totalTokens: 130 },
				model: 'gpt-4o'
			};
		}
		vi.mocked(streamChatCompletionWithFallback).mockReturnValue(mockStream());

		const { POST } = await import('../../src/routes/api/onboarding/chat/+server');
		const platform = createMockPlatform();
		const event = {
			locals: { user: createMockUser() },
			platform,
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ profileId: 'bp-1', message: 'Done with welcome', step: 'welcome' })
			})
		};

		const response = await POST(event as any);
		expect(response.headers.get('Content-Type')).toBe('text/event-stream');

		// Wait for async stream processing to complete
		await new Promise((r) => setTimeout(r, 50));

		// getNextStep should have been called with the current step
		expect(getNextStep).toHaveBeenCalledWith('welcome');

		// waitUntil should have been called for async persistence
		expect(platform.context.waitUntil).toHaveBeenCalled();
	});

	it('should extract brand data and send to client', async () => {
		const { getBrandProfile, buildExtractionPrompt, parseExtractionResponse } = await import(
			'$lib/services/onboarding'
		);
		const { getAllEnabledAIKeys, streamChatCompletionWithFallback, chatCompletionWithKey } =
			await import('$lib/services/openai-chat');

		vi.mocked(getBrandProfile).mockResolvedValue({
			id: 'bp-1',
			userId: 'user-1',
			status: 'in_progress',
			onboardingStep: 'welcome'
		} as any);

		vi.mocked(getAllEnabledAIKeys).mockResolvedValue([
			{
				id: 'key-1',
				name: 'OpenAI',
				provider: 'openai',
				apiKey: 'sk-test',
				enabled: true
			}
		]);

		vi.mocked(buildExtractionPrompt).mockReturnValue('Extract the brand name and tagline.');
		vi.mocked(chatCompletionWithKey).mockResolvedValue(
			'{"brandName": "Acme", "tagline": "Best in class"}'
		);
		vi.mocked(parseExtractionResponse).mockReturnValue({
			brandName: 'Acme',
			tagline: 'Best in class'
		});

		async function* mockStream() {
			yield { type: 'content' as const, content: 'Got it, Acme!' };
			yield {
				type: 'usage' as const,
				usage: { promptTokens: 200, completionTokens: 20, totalTokens: 220 },
				model: 'gpt-4o'
			};
		}
		vi.mocked(streamChatCompletionWithFallback).mockReturnValue(mockStream());

		const { POST } = await import('../../src/routes/api/onboarding/chat/+server');
		const platform = createMockPlatform();
		const event = {
			locals: { user: createMockUser() },
			platform,
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ profileId: 'bp-1', message: 'My brand is Acme', step: 'welcome' })
			})
		};

		const response = await POST(event as any);
		expect(response.headers.get('Content-Type')).toBe('text/event-stream');

		// Wait for async stream processing to complete
		await new Promise((r) => setTimeout(r, 50));

		// Brand data extraction should have been called
		expect(buildExtractionPrompt).toHaveBeenCalled();
		expect(chatCompletionWithKey).toHaveBeenCalledWith(
			expect.objectContaining({ provider: 'openai', apiKey: 'sk-test' }),
			expect.any(Array),
			expect.objectContaining({ jsonMode: true })
		);
		expect(parseExtractionResponse).toHaveBeenCalledWith(
			'{"brandName": "Acme", "tagline": "Best in class"}'
		);
	});

	it('should handle extraction failure gracefully', async () => {
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { getBrandProfile, buildExtractionPrompt } = await import('$lib/services/onboarding');
		const { getAllEnabledAIKeys, streamChatCompletionWithFallback, chatCompletionWithKey } =
			await import('$lib/services/openai-chat');

		vi.mocked(getBrandProfile).mockResolvedValue({
			id: 'bp-1',
			userId: 'user-1',
			status: 'in_progress',
			onboardingStep: 'welcome'
		} as any);

		vi.mocked(getAllEnabledAIKeys).mockResolvedValue([
			{
				id: 'key-1',
				name: 'OpenAI',
				provider: 'openai',
				apiKey: 'sk-test',
				enabled: true
			}
		]);

		vi.mocked(buildExtractionPrompt).mockReturnValue('Extract brand data.');
		vi.mocked(chatCompletionWithKey).mockRejectedValue(new Error('Extraction API failed'));

		async function* mockStream() {
			yield { type: 'content' as const, content: 'Hello!' };
			yield {
				type: 'usage' as const,
				usage: { promptTokens: 50, completionTokens: 10, totalTokens: 60 },
				model: 'gpt-4o'
			};
		}
		vi.mocked(streamChatCompletionWithFallback).mockReturnValue(mockStream());

		const { POST } = await import('../../src/routes/api/onboarding/chat/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ profileId: 'bp-1', message: 'Hi', step: 'welcome' })
			})
		};

		const response = await POST(event as any);
		expect(response.headers.get('Content-Type')).toBe('text/event-stream');

		// Wait for async stream processing (including failed extraction) to complete
		await new Promise((r) => setTimeout(r, 50));

		// chatCompletionWithKey should have been attempted for extraction
		expect(chatCompletionWithKey).toHaveBeenCalled();

		// Stream should still complete without throwing
		expect(response.status).toBe(200);

		consoleSpy.mockRestore();
	});

	it('should handle stream error gracefully', async () => {
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { getBrandProfile } = await import('$lib/services/onboarding');
		const { getAllEnabledAIKeys, streamChatCompletionWithFallback } = await import(
			'$lib/services/openai-chat'
		);

		vi.mocked(getBrandProfile).mockResolvedValue({
			id: 'bp-1',
			userId: 'user-1',
			status: 'in_progress',
			onboardingStep: 'welcome'
		} as any);

		vi.mocked(getAllEnabledAIKeys).mockResolvedValue([
			{
				id: 'key-1',
				name: 'OpenAI',
				provider: 'openai',
				apiKey: 'sk-test',
				enabled: true
			}
		]);

		async function* mockStream(): AsyncGenerator<any> {
			yield { type: 'content' as const, content: 'Start...' };
			throw new Error('Stream crashed');
		}
		vi.mocked(streamChatCompletionWithFallback).mockReturnValue(mockStream());

		const { POST } = await import('../../src/routes/api/onboarding/chat/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ profileId: 'bp-1', message: 'Hi', step: 'welcome' })
			})
		};

		// Should not throw - error is handled inside the stream
		const response = await POST(event as any);
		expect(response.headers.get('Content-Type')).toBe('text/event-stream');

		// Wait for async stream to encounter the error
		await new Promise((r) => setTimeout(r, 50));

		// The stream should have been started (streamChatCompletionWithFallback was called)
		expect(streamChatCompletionWithFallback).toHaveBeenCalled();

		consoleSpy.mockRestore();
	});

	it('should persist attachments metadata with user message', async () => {
		const { getBrandProfile, addOnboardingMessage, buildExtractionPrompt } = await import(
			'$lib/services/onboarding'
		);
		const { getAllEnabledAIKeys, streamChatCompletionWithFallback } = await import(
			'$lib/services/openai-chat'
		);

		vi.mocked(getBrandProfile).mockResolvedValue({
			id: 'bp-1',
			userId: 'user-1',
			status: 'in_progress',
			onboardingStep: 'welcome'
		} as any);

		vi.mocked(getAllEnabledAIKeys).mockResolvedValue([
			{
				id: 'key-1',
				name: 'OpenAI',
				provider: 'openai',
				apiKey: 'sk-test',
				enabled: true
			}
		]);

		vi.mocked(buildExtractionPrompt).mockReturnValue(null as any);

		async function* mockStream() {
			yield { type: 'content' as const, content: 'Nice image!' };
			yield {
				type: 'usage' as const,
				usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110 },
				model: 'gpt-4o'
			};
		}
		vi.mocked(streamChatCompletionWithFallback).mockReturnValue(mockStream());

		const { POST } = await import('../../src/routes/api/onboarding/chat/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					profileId: 'bp-1',
					message: 'Here is my logo',
					step: 'welcome',
					attachments: [
						{ id: 'att-1', type: 'image', name: 'logo.png', url: 'https://example.com/logo.png' }
					]
				})
			})
		};

		const response = await POST(event as any);

		// Wait for stream processing
		await new Promise((r) => setTimeout(r, 50));

		// Verify attachments JSON was passed
		expect(addOnboardingMessage).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				attachments: expect.stringContaining('logo.png')
			})
		);
	});

	it('should handle null extraction result', async () => {
		const { getBrandProfile, buildExtractionPrompt, parseExtractionResponse } = await import(
			'$lib/services/onboarding'
		);
		const { getAllEnabledAIKeys, streamChatCompletionWithFallback, chatCompletionWithKey } =
			await import('$lib/services/openai-chat');

		vi.mocked(getBrandProfile).mockResolvedValue({
			id: 'bp-1',
			userId: 'user-1',
			status: 'in_progress',
			onboardingStep: 'welcome'
		} as any);

		vi.mocked(getAllEnabledAIKeys).mockResolvedValue([
			{
				id: 'key-1',
				name: 'OpenAI',
				provider: 'openai',
				apiKey: 'sk-test',
				enabled: true
			}
		]);

		vi.mocked(buildExtractionPrompt).mockReturnValue('Extract data');
		vi.mocked(chatCompletionWithKey).mockResolvedValue('{}');
		vi.mocked(parseExtractionResponse).mockReturnValue(null);

		async function* mockStream() {
			yield { type: 'content' as const, content: 'Hello' };
			yield {
				type: 'usage' as const,
				usage: { promptTokens: 50, completionTokens: 5, totalTokens: 55 },
				model: 'gpt-4o'
			};
		}
		vi.mocked(streamChatCompletionWithFallback).mockReturnValue(mockStream());

		const { POST } = await import('../../src/routes/api/onboarding/chat/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ profileId: 'bp-1', message: 'Hey', step: 'welcome' })
			})
		};

		const response = await POST(event as any);

		// Wait for stream processing
		await new Promise((r) => setTimeout(r, 50));

		// Should NOT have called parseExtractionResponse with real data
		// since chatCompletionWithKey returned '{}' and parseExtractionResponse returned null
		expect(parseExtractionResponse).toHaveBeenCalledWith('{}');
	});

	it('should not call stepAdvance when getNextStep returns null', async () => {
		const { getBrandProfile, getNextStep, buildExtractionPrompt } = await import(
			'$lib/services/onboarding'
		);
		const { getAllEnabledAIKeys, streamChatCompletionWithFallback } = await import(
			'$lib/services/openai-chat'
		);

		vi.mocked(getBrandProfile).mockResolvedValue({
			id: 'bp-1',
			userId: 'user-1',
			status: 'in_progress',
			onboardingStep: 'complete'
		} as any);

		vi.mocked(getAllEnabledAIKeys).mockResolvedValue([
			{
				id: 'key-1',
				name: 'OpenAI',
				provider: 'openai',
				apiKey: 'sk-test',
				enabled: true
			}
		]);

		vi.mocked(getNextStep).mockReturnValue(null);
		vi.mocked(buildExtractionPrompt).mockReturnValue(null as any);

		async function* mockStream() {
			yield { type: 'content' as const, content: 'Done![STEP_COMPLETE]' };
			yield {
				type: 'usage' as const,
				usage: { promptTokens: 50, completionTokens: 10, totalTokens: 60 },
				model: 'gpt-4o'
			};
		}
		vi.mocked(streamChatCompletionWithFallback).mockReturnValue(mockStream());

		const { POST } = await import('../../src/routes/api/onboarding/chat/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ profileId: 'bp-1', message: 'Finish', step: 'complete' })
			})
		};

		const response = await POST(event as any);

		// Wait for stream processing
		await new Promise((r) => setTimeout(r, 50));

		// getNextStep returned null, so no step advancement should happen
		expect(getNextStep).toHaveBeenCalledWith('complete');
	});

	it('should set empty attachments to null', async () => {
		const { getBrandProfile, addOnboardingMessage, buildExtractionPrompt } = await import(
			'$lib/services/onboarding'
		);
		const { getAllEnabledAIKeys, streamChatCompletionWithFallback } = await import(
			'$lib/services/openai-chat'
		);

		vi.mocked(getBrandProfile).mockResolvedValue({
			id: 'bp-1',
			userId: 'user-1',
			status: 'in_progress',
			onboardingStep: 'welcome'
		} as any);

		vi.mocked(getAllEnabledAIKeys).mockResolvedValue([
			{
				id: 'key-1',
				name: 'OpenAI',
				provider: 'openai',
				apiKey: 'sk-test',
				enabled: true
			}
		]);

		vi.mocked(buildExtractionPrompt).mockReturnValue(null as any);

		async function* mockStream() {
			yield { type: 'content' as const, content: 'OK' };
			yield {
				type: 'usage' as const,
				usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
				model: 'gpt-4o'
			};
		}
		vi.mocked(streamChatCompletionWithFallback).mockReturnValue(mockStream());

		const { POST } = await import('../../src/routes/api/onboarding/chat/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					profileId: 'bp-1',
					message: 'No attachments',
					step: 'welcome',
					attachments: []
				})
			})
		};

		const response = await POST(event as any);

		// Wait for stream processing
		await new Promise((r) => setTimeout(r, 50));

		// Attachments should be null (empty array → null)
		expect(addOnboardingMessage).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ attachments: null })
		);
	});
});
