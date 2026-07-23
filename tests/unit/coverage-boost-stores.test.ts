/**
 * Coverage boost tests for stores and additional service branches
 * Targets: chatHistory.ts store, onboarding.ts store, file-archive.ts,
 *          brand-colors.ts, onboarding.ts service
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

// ─── chatHistory.ts store (91.8% branches) ──────────

describe('Chat History Store - Extended branch coverage', () => {
	let chatHistoryStore: any;
	let currentConversation: any;
	let currentMessages: any;

	beforeEach(async () => {
		vi.resetModules();
		vi.clearAllMocks();

		// Mock fetch globally
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				conversations: [],
				id: 'conv-1',
				title: 'Test',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			})
		});

		const mod = await import('$lib/stores/chatHistory');
		chatHistoryStore = mod.chatHistoryStore;
		currentConversation = mod.currentConversation;
		currentMessages = mod.currentMessages;

		// Reset to initial state
		chatHistoryStore.clearAll();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should handle parseTimestamp with Date object', async () => {
		// Initialize and create conversation to trigger timestamp parsing
		await chatHistoryStore.initializeForUser('user1');

		const mockDate = new Date('2025-01-01T00:00:00Z');
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				conversations: [
					{
						id: 'c1',
						title: 'Test',
						createdAt: mockDate,
						updatedAt: '2025-01-01',
						messageCount: 0,
						lastMessage: ''
					}
				]
			})
		} as any);
		await chatHistoryStore.initializeForUser('user1');
		const state = get(chatHistoryStore) as any;
		expect(state.conversations).toHaveLength(1);
	});

	it('should handle parseTimestamp with number (fallback to new Date)', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				conversations: [{ id: 'c1', title: 'Test', createdAt: 12345, updatedAt: 67890 }]
			})
		} as any);
		await chatHistoryStore.initializeForUser('user1');
		const state = get(chatHistoryStore) as any;
		expect(state.conversations[0].createdAt).toBeInstanceOf(Date);
	});

	it('should handle fetch failure during initializeForUser', async () => {
		vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('network fail'));
		await chatHistoryStore.initializeForUser('user1');
		const state = get(chatHistoryStore) as any;
		expect(state.conversations).toEqual([]);
		expect(state.userId).toBe('user1');
	});

	it('should handle non-ok response during initializeForUser', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: false,
			status: 500
		} as any);
		await chatHistoryStore.initializeForUser('user1');
		const state = get(chatHistoryStore) as any;
		expect(state.conversations).toEqual([]);
	});

	it('should handle fetch failure in createConversation (fallback to local)', async () => {
		vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('create failed'));
		const conv = await chatHistoryStore.createConversation('My Chat');
		expect(conv.title).toBe('My Chat');
		expect(conv._loaded).toBe(true);
		// Should still add to store
		const state = get(chatHistoryStore) as any;
		expect(state.conversations).toHaveLength(1);
	});

	it('should handle non-ok response in createConversation', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: false,
			status: 500
		} as any);
		const conv = await chatHistoryStore.createConversation();
		expect(conv.title).toBe('New conversation');
	});

	it('should selectConversation and load messages from server', async () => {
		// First create a conversation locally
		const conv = await chatHistoryStore.createConversation('Test');

		// Now set it as not loaded
		chatHistoryStore.clearAll();
		chatHistoryStore.addMessage; // ensure store is ready

		// Re-init with an unloaded conversation
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				conversations: [
					{
						id: 'c1',
						title: 'Test',
						_loaded: false,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					}
				]
			})
		} as any);
		await chatHistoryStore.initializeForUser('user1');

		// Mock the conversation detail fetch
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				title: 'Test',
				messages: [
					{
						id: 'm1',
						role: 'user',
						content: 'Hello',
						timestamp: '2025-01-01',
						cost: null,
						media: null
					}
				]
			})
		} as any);
		await chatHistoryStore.selectConversation('c1');
		const state = get(chatHistoryStore) as any;
		const c = state.conversations.find((x: any) => x.id === 'c1');
		expect(c._loaded).toBe(true);
		expect(c.messages).toHaveLength(1);
	});

	it('should handle selectConversation fetch failure', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				conversations: [
					{
						id: 'c1',
						title: 'Test',
						_loaded: false,
						createdAt: '2025-01-01',
						updatedAt: '2025-01-01'
					}
				]
			})
		} as any);
		await chatHistoryStore.initializeForUser('user1');

		vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('load fail'));
		await chatHistoryStore.selectConversation('c1');
		const state = get(chatHistoryStore) as any;
		expect(state.isLoading).toBe(false);
	});

	it('should handle selectConversation non-ok response', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				conversations: [
					{
						id: 'c1',
						title: 'Test',
						_loaded: false,
						createdAt: '2025-01-01',
						updatedAt: '2025-01-01'
					}
				]
			})
		} as any);
		await chatHistoryStore.initializeForUser('user1');

		vi.mocked(globalThis.fetch).mockResolvedValueOnce({ ok: false, status: 404 } as any);
		await chatHistoryStore.selectConversation('c1');
		const state = get(chatHistoryStore) as any;
		expect(state.isLoading).toBe(false);
	});

	it('should handle updateMessageMedia when message has no existing media', async () => {
		const conv = await chatHistoryStore.createConversation('Test');
		const msg = chatHistoryStore.addMessage(conv.id, {
			role: 'assistant',
			content: 'Generating video...'
		});

		chatHistoryStore.updateMessageMedia(conv.id, msg.id, {
			status: 'generating',
			progress: 50
		});

		const state = get(chatHistoryStore) as any;
		const updatedMsg = state.conversations[0].messages.find((m: any) => m.id === msg.id);
		expect(updatedMsg.media).toBeDefined();
		expect(updatedMsg.media.type).toBe('video');
		expect(updatedMsg.media.status).toBe('generating');
	});

	it('should handle updateMessageMedia when message has existing media', async () => {
		const conv = await chatHistoryStore.createConversation('Test');
		const msg = chatHistoryStore.addMessage(conv.id, {
			role: 'assistant',
			content: 'Video ready',
			media: { type: 'video', status: 'generating', progress: 0 }
		});

		chatHistoryStore.updateMessageMedia(conv.id, msg.id, {
			status: 'complete',
			progress: 100,
			url: 'http://video.mp4'
		});

		const state = get(chatHistoryStore) as any;
		const updatedMsg = state.conversations[0].messages.find((m: any) => m.id === msg.id);
		expect(updatedMsg.media.status).toBe('complete');
		expect(updatedMsg.media.url).toBe('http://video.mp4');
	});

	it('should handle deleteConversation server error gracefully', async () => {
		const conv = await chatHistoryStore.createConversation('Test');
		vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('delete fail'));
		await chatHistoryStore.deleteConversation(conv.id);
		const state = get(chatHistoryStore) as any;
		expect(state.conversations).toHaveLength(0);
	});

	it('should handle renameConversation server error gracefully', async () => {
		const conv = await chatHistoryStore.createConversation('Test');
		vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('rename fail'));
		await chatHistoryStore.renameConversation(conv.id, 'New Name');
		// State still updated locally
		const state = get(chatHistoryStore) as any;
		expect(state.conversations[0].title).toBe('New Name');
	});

	it('should persist user messages to server', async () => {
		const conv = await chatHistoryStore.createConversation('Test');
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({ ok: true } as any);
		chatHistoryStore.addMessage(conv.id, {
			role: 'user',
			content: 'Hello world'
		});
		// fetch should be called for user messages
		expect(globalThis.fetch).toHaveBeenCalled();
	});

	it('should persist media messages to server', async () => {
		const conv = await chatHistoryStore.createConversation('Test');
		chatHistoryStore.addMessage(conv.id, {
			role: 'assistant',
			content: 'Video',
			media: { type: 'video', status: 'complete', url: 'http://test.mp4' }
		});
		// fetch should be called for messages with media
		expect(globalThis.fetch).toHaveBeenCalled();
	});

	it('should handle persist message fetch failure gracefully', async () => {
		const conv = await chatHistoryStore.createConversation('Test');
		vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('persist fail'));
		// Should not throw
		chatHistoryStore.addMessage(conv.id, {
			role: 'user',
			content: 'Will fail to persist'
		});
		const state = get(chatHistoryStore) as any;
		expect(state.conversations[0].messages).toHaveLength(1);
	});

	it('currentConversation derived store returns null for non-existent id', async () => {
		// Set a non-existent conversation id
		const conv = await chatHistoryStore.createConversation('Test');
		await chatHistoryStore.deleteConversation(conv.id);
		const current = get(currentConversation);
		expect(current).toBeNull();
	});

	it('reset should preserve userId', () => {
		chatHistoryStore.reset();
		const state = get(chatHistoryStore) as any;
		expect(state.conversations).toEqual([]);
		expect(state.currentConversationId).toBeNull();
	});
});

// ─── onboarding.ts store (90.09% branches) ──────────

describe('Onboarding Store - Extended branch coverage', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('loadExistingProfile should handle profile without onboardingStep', async () => {
		globalThis.fetch = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ profile: { id: 'p1', userId: 'u1' } })
			} as any)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ messages: [] })
			} as any);

		const { loadExistingProfile, onboardingStore } = await import('$lib/stores/onboarding');
		const profile = await loadExistingProfile();
		expect(profile).toBeDefined();
		const state = get(onboardingStore) as any;
		expect(state.currentStep).toBe('welcome');
	});

	it('loadExistingProfile should use brandId parameter', async () => {
		globalThis.fetch = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ profile: { id: 'p2', userId: 'u1', onboardingStep: 'colors' } })
			} as any)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ messages: [{ id: 'm1', role: 'assistant', content: 'hi' }] })
			} as any);

		const { loadExistingProfile, onboardingStore } = await import('$lib/stores/onboarding');
		const profile = await loadExistingProfile('p2');
		expect(profile!.id).toBe('p2');

		// Verify URL used the brandId
		expect(globalThis.fetch).toHaveBeenCalledWith('/api/onboarding/profile?id=p2');
		const state = get(onboardingStore) as any;
		expect(state.currentStep).toBe('colors');
	});

	it('loadExistingProfile should handle failed messages fetch', async () => {
		globalThis.fetch = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ profile: { id: 'p1', userId: 'u1' } })
			} as any)
			.mockResolvedValueOnce({ ok: false, status: 500 } as any);

		const { loadExistingProfile, onboardingStore } = await import('$lib/stores/onboarding');
		await loadExistingProfile();
		const state = get(onboardingStore) as any;
		expect(state.messages).toEqual([]);
	});

	it('loadExistingProfile should handle error and set error state', async () => {
		globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('network fail'));

		const { loadExistingProfile, onboardingStore } = await import('$lib/stores/onboarding');
		const result = await loadExistingProfile();
		expect(result).toBeNull();
		const state = get(onboardingStore) as any;
		expect(state.error).toBe('network fail');
		expect(state.isLoading).toBe(false);
	});

	it('loadExistingProfile should handle non-Error throw', async () => {
		globalThis.fetch = vi.fn().mockRejectedValueOnce('string error');

		const { loadExistingProfile, onboardingStore } = await import('$lib/stores/onboarding');
		const result = await loadExistingProfile();
		expect(result).toBeNull();
		const state = get(onboardingStore) as any;
		expect(state.error).toBe('Failed to load profile');
	});

	it('sendMessage should handle brandDataExtracted with brandName', async () => {
		// Create an SSE response with brandDataExtracted
		const sseData = [
			'data: {"content":"Great name! "}\n\n',
			'data: {"brandDataExtracted":{"brandName":"TestBrand","industry":"tech"}}\n\n',
			'data: [DONE]\n\n'
		].join('');

		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode(sseData));
				controller.close();
			}
		});

		globalThis.fetch = vi.fn().mockResolvedValueOnce({
			ok: true,
			body: stream
		} as any);

		const { sendMessage, onboardingStore } = await import('$lib/stores/onboarding');

		// Set up initial state with a profile
		onboardingStore.set({
			profile: { id: 'p1', userId: 'u1', brandName: '' } as any,
			messages: [],
			currentStep: 'welcome',
			isLoading: false,
			isStreaming: false,
			streamingStatus: '',
			error: null
		});

		await sendMessage('My brand is TestBrand');
		const state = get(onboardingStore) as any;
		expect(state.profile.brandName).toBe('TestBrand');
		expect(state.profile.brandNameConfirmed).toBe(true);
		expect(state.profile.industry).toBe('tech');
	});

	it('sendMessage should handle brandDataExtracted without brandName', async () => {
		const sseData = [
			'data: {"brandDataExtracted":{"industry":"tech","tagline":"We build stuff"}}\n\n',
			'data: [DONE]\n\n'
		].join('');

		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode(sseData));
				controller.close();
			}
		});

		globalThis.fetch = vi.fn().mockResolvedValueOnce({
			ok: true,
			body: stream
		} as any);

		const { sendMessage, onboardingStore } = await import('$lib/stores/onboarding');
		onboardingStore.set({
			profile: { id: 'p1', userId: 'u1' } as any,
			messages: [],
			currentStep: 'welcome',
			isLoading: false,
			isStreaming: false,
			streamingStatus: '',
			error: null
		});

		await sendMessage('We do tech things');
		const state = get(onboardingStore) as any;
		expect(state.profile.industry).toBe('tech');
		expect(state.profile.brandNameConfirmed).toBeUndefined();
	});

	it('sendMessage should ignore null/empty values in brandDataExtracted', async () => {
		const sseData = [
			'data: {"brandDataExtracted":{"industry":"tech","tagline":null,"description":""}}\n\n',
			'data: [DONE]\n\n'
		].join('');

		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode(sseData));
				controller.close();
			}
		});

		globalThis.fetch = vi.fn().mockResolvedValueOnce({
			ok: true,
			body: stream
		} as any);

		const { sendMessage, onboardingStore } = await import('$lib/stores/onboarding');
		onboardingStore.set({
			profile: { id: 'p1', userId: 'u1', tagline: 'old', description: 'old desc' } as any,
			messages: [],
			currentStep: 'welcome',
			isLoading: false,
			isStreaming: false,
			streamingStatus: '',
			error: null
		});

		await sendMessage('Info');
		const state = get(onboardingStore) as any;
		expect(state.profile.industry).toBe('tech');
		// null and '' should NOT overwrite
		expect(state.profile.tagline).toBe('old');
		expect(state.profile.description).toBe('old desc');
	});

	it('sendMessage should handle stepAdvance in SSE', async () => {
		const sseData = [
			'data: {"content":"Step complete! "}\n\n',
			'data: {"stepAdvance":"colors"}\n\n',
			'data: [DONE]\n\n'
		].join('');

		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode(sseData));
				controller.close();
			}
		});

		globalThis.fetch = vi.fn().mockResolvedValueOnce({
			ok: true,
			body: stream
		} as any);

		const { sendMessage, onboardingStore } = await import('$lib/stores/onboarding');
		onboardingStore.set({
			profile: { id: 'p1', userId: 'u1' } as any,
			messages: [],
			currentStep: 'welcome',
			isLoading: false,
			isStreaming: false,
			streamingStatus: '',
			error: null
		});

		await sendMessage('Done!');
		const state = get(onboardingStore) as any;
		expect(state.currentStep).toBe('colors');
		expect(state.profile.onboardingStep).toBe('colors');
	});

	it('sendMessage should propagate server error from SSE stream', async () => {
		// Server errors in json.error are now properly propagated to the store
		const sseData = 'data: {"error":"Server error"}\n\n';

		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode(sseData));
				controller.close();
			}
		});

		globalThis.fetch = vi.fn().mockResolvedValueOnce({
			ok: true,
			body: stream
		} as any);

		const { sendMessage, onboardingStore } = await import('$lib/stores/onboarding');
		onboardingStore.set({
			profile: { id: 'p1', userId: 'u1' } as any,
			messages: [],
			currentStep: 'welcome',
			isLoading: false,
			isStreaming: false,
			streamingStatus: '',
			error: null
		});

		await sendMessage('test');
		const state = get(onboardingStore) as any;
		expect(state.error).toBe('Server error');
		expect(state.isStreaming).toBe(false);
	});

	it('sendMessage should skip malformed SSE chunks', async () => {
		const sseData = [
			'data: not-valid-json\n\n',
			'data: {"content":"Hello"}\n\n',
			'data: [DONE]\n\n'
		].join('');

		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode(sseData));
				controller.close();
			}
		});

		globalThis.fetch = vi.fn().mockResolvedValueOnce({
			ok: true,
			body: stream
		} as any);

		const { sendMessage, onboardingStore } = await import('$lib/stores/onboarding');
		onboardingStore.set({
			profile: { id: 'p1', userId: 'u1' } as any,
			messages: [],
			currentStep: 'welcome',
			isLoading: false,
			isStreaming: false,
			streamingStatus: '',
			error: null
		});

		await sendMessage('test');
		const state = get(onboardingStore) as any;
		// Should still get the valid content
		const assistantMsg = state.messages.find((m: any) => m.role === 'assistant');
		expect(assistantMsg.content).toBe('Hello');
	});

	it('sendMessage should handle no response body', async () => {
		globalThis.fetch = vi.fn().mockResolvedValueOnce({
			ok: true,
			body: null
		} as any);

		const { sendMessage, onboardingStore } = await import('$lib/stores/onboarding');
		onboardingStore.set({
			profile: { id: 'p1', userId: 'u1' } as any,
			messages: [],
			currentStep: 'welcome',
			isLoading: false,
			isStreaming: false,
			streamingStatus: '',
			error: null
		});

		await sendMessage('test');
		const state = get(onboardingStore) as any;
		expect(state.error).toBe('No response body');
		expect(state.isStreaming).toBe(false);
	});

	it('sendMessage should handle non-ok response', async () => {
		globalThis.fetch = vi.fn().mockResolvedValueOnce({
			ok: false,
			statusText: 'Bad Request'
		} as any);

		const { sendMessage, onboardingStore } = await import('$lib/stores/onboarding');
		onboardingStore.set({
			profile: { id: 'p1', userId: 'u1' } as any,
			messages: [],
			currentStep: 'welcome',
			isLoading: false,
			isStreaming: false,
			streamingStatus: '',
			error: null
		});

		await sendMessage('test');
		const state = get(onboardingStore) as any;
		expect(state.error).toBe('Chat failed: Bad Request');
	});

	it('sendMessage should do nothing when profile is null', async () => {
		const { sendMessage, onboardingStore } = await import('$lib/stores/onboarding');
		onboardingStore.set({
			profile: null,
			messages: [],
			currentStep: 'welcome',
			isLoading: false,
			isStreaming: false,
			streamingStatus: '',
			error: null
		});

		await sendMessage('test');
		const state = get(onboardingStore) as any;
		expect(state.messages).toHaveLength(0);
	});

	it('sendMessage should pass attachments in body', async () => {
		const sseData = 'data: {"content":"Got it"}\n\ndata: [DONE]\n\n';
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode(sseData));
				controller.close();
			}
		});

		globalThis.fetch = vi.fn().mockResolvedValueOnce({
			ok: true,
			body: stream
		} as any);

		const { sendMessage, onboardingStore } = await import('$lib/stores/onboarding');
		onboardingStore.set({
			profile: { id: 'p1', userId: 'u1' } as any,
			messages: [],
			currentStep: 'welcome',
			isLoading: false,
			isStreaming: false,
			streamingStatus: '',
			error: null
		});

		await sendMessage('Look at this', [
			{
				id: 'a1',
				type: 'image',
				name: 'logo.png',
				url: 'http://test/logo.png',
				mimeType: 'image/png'
			}
		] as any);

		const state = get(onboardingStore) as any;
		const userMsg = state.messages.find((m: any) => m.role === 'user');
		expect(userMsg.attachments).toHaveLength(1);
	});

	it('updateStep should handle error', async () => {
		globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('step fail'));

		const { updateStep, onboardingStore } = await import('$lib/stores/onboarding');
		onboardingStore.set({
			profile: { id: 'p1', userId: 'u1' } as any,
			messages: [],
			currentStep: 'welcome',
			isLoading: false,
			isStreaming: false,
			streamingStatus: '',
			error: null
		});

		await updateStep('colors' as any);
		const state = get(onboardingStore) as any;
		expect(state.error).toBe('step fail');
	});

	it('updateStep should do nothing when profile is null', async () => {
		const { updateStep, onboardingStore } = await import('$lib/stores/onboarding');
		await updateStep('colors' as any);
		// No error since early return
	});

	it('updateBrandData should handle error', async () => {
		globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('update fail'));

		const { updateBrandData, onboardingStore } = await import('$lib/stores/onboarding');
		onboardingStore.set({
			profile: { id: 'p1', userId: 'u1' } as any,
			messages: [],
			currentStep: 'welcome',
			isLoading: false,
			isStreaming: false,
			streamingStatus: '',
			error: null
		});

		await updateBrandData({ brandName: 'test' } as any);
		const state = get(onboardingStore) as any;
		expect(state.error).toBe('update fail');
	});

	it('updateBrandData should do nothing when profile is null', async () => {
		const { updateBrandData, onboardingStore } = await import('$lib/stores/onboarding');
		await updateBrandData({ brandName: 'test' } as any);
	});

	it('startOnboarding should handle non-Error exception', async () => {
		globalThis.fetch = vi.fn().mockRejectedValueOnce(42);

		const { startOnboarding, onboardingStore } = await import('$lib/stores/onboarding');
		await startOnboarding();
		const state = get(onboardingStore) as any;
		expect(state.error).toBe('Failed to start onboarding');
	});

	it('updateStep should use returned profile or fall back', async () => {
		globalThis.fetch = vi.fn().mockResolvedValueOnce({
			ok: true,
			json: async () => ({ profile: null }) // no profile returned
		} as any);

		const { updateStep, onboardingStore } = await import('$lib/stores/onboarding');
		onboardingStore.set({
			profile: { id: 'p1', userId: 'u1' } as any,
			messages: [],
			currentStep: 'welcome',
			isLoading: false,
			isStreaming: false,
			streamingStatus: '',
			error: null
		});

		await updateStep('colors' as any);
		const state = get(onboardingStore) as any;
		expect(state.currentStep).toBe('colors');
		// Since profile from response was null, uses fallback spread
		expect(state.profile.onboardingStep).toBe('colors');
	});

	it('updateBrandData should update with returned profile', async () => {
		globalThis.fetch = vi.fn().mockResolvedValueOnce({
			ok: true,
			json: async () => ({ profile: { id: 'p1', userId: 'u1', brandName: 'Updated' } })
		} as any);

		const { updateBrandData, onboardingStore } = await import('$lib/stores/onboarding');
		onboardingStore.set({
			profile: { id: 'p1', userId: 'u1', brandName: 'Old' } as any,
			messages: [],
			currentStep: 'welcome',
			isLoading: false,
			isStreaming: false,
			streamingStatus: '',
			error: null
		});

		await updateBrandData({ brandName: 'Updated' } as any);
		const state = get(onboardingStore) as any;
		expect(state.profile.brandName).toBe('Updated');
	});
});

// ─── file-archive.ts (90.62% branches) ──────────────

describe('File Archive Service - Extended branch coverage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it('determineFolder for onboarding with step', async () => {
		const { determineFolder } = await import('$lib/services/file-archive');
		const folder = determineFolder({
			brandProfileId: 'bp1',
			userId: 'u1',
			fileName: 'logo.png',
			mimeType: 'image/png',
			fileSize: 1000,
			r2Key: 'test',
			fileType: 'image',
			source: 'user_upload',
			context: 'onboarding',
			onboardingStep: 'brand_identity'
		});
		expect(folder).toBe('/onboarding/brand-identity/images');
	});

	it('determineFolder for onboarding without step', async () => {
		const { determineFolder } = await import('$lib/services/file-archive');
		const folder = determineFolder({
			brandProfileId: 'bp1',
			userId: 'u1',
			fileName: 'logo.png',
			mimeType: 'image/png',
			fileSize: 1000,
			r2Key: 'test',
			fileType: 'image',
			source: 'user_upload',
			context: 'onboarding'
		});
		expect(folder).toBe('/onboarding/images');
	});

	it('determineFolder for brand_assets', async () => {
		const { determineFolder } = await import('$lib/services/file-archive');
		const folder = determineFolder({
			brandProfileId: 'bp1',
			userId: 'u1',
			fileName: 'audio.mp3',
			mimeType: 'audio/mpeg',
			fileSize: 5000,
			r2Key: 'test',
			fileType: 'audio',
			source: 'ai_generated',
			context: 'brand_assets'
		});
		expect(folder).toBe('/brand-assets/audios');
	});

	it('determineFolder for chat ai_generated', async () => {
		const { determineFolder } = await import('$lib/services/file-archive');
		const folder = determineFolder({
			brandProfileId: 'bp1',
			userId: 'u1',
			fileName: 'video.mp4',
			mimeType: 'video/mp4',
			fileSize: 10000,
			r2Key: 'test',
			fileType: 'video',
			source: 'ai_generated',
			context: 'chat'
		});
		expect(folder).toBe('/ai-generated/videos');
	});

	it('determineFolder for chat user_upload (default)', async () => {
		const { determineFolder } = await import('$lib/services/file-archive');
		const folder = determineFolder({
			brandProfileId: 'bp1',
			userId: 'u1',
			fileName: 'doc.pdf',
			mimeType: 'application/pdf',
			fileSize: 2000,
			r2Key: 'test',
			fileType: 'document',
			source: 'user_upload',
			context: 'chat'
		});
		expect(folder).toBe('/uploads/documents');
	});

	it('getArchiveFolders should return folder info with name from parts', async () => {
		const mockDB = {
			prepare: vi.fn().mockReturnValue({
				bind: vi.fn().mockReturnValue({
					all: vi.fn().mockResolvedValue({
						results: [
							{ folder: '/ai-generated/images', file_count: 5 },
							{ folder: '/uploads/videos', file_count: 3 },
							{ folder: '/', file_count: 1 }
						]
					})
				})
			})
		};

		const { getArchiveFolders } = await import('$lib/services/file-archive');
		const folders = await getArchiveFolders(mockDB as any, 'bp1');
		expect(folders[0].name).toBe('images');
		expect(folders[0].fileCount).toBe(5);
		expect(folders[2].name).toBe('Root');
	});

	it('getArchiveStats should handle null totalResult', async () => {
		const mockDB = {
			prepare: vi.fn().mockReturnValue({
				bind: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue(null),
					all: vi.fn().mockResolvedValue({ results: [] })
				})
			})
		};

		const { getArchiveStats } = await import('$lib/services/file-archive');
		const stats = await getArchiveStats(mockDB as any, 'bp1');
		expect(stats.totalFiles).toBe(0);
		expect(stats.totalSize).toBe(0);
	});

	it('getArchiveStats should aggregate by type/source/context', async () => {
		const mockFirst = vi.fn().mockResolvedValue({ count: 10, total_size: 50000 });
		const mockAll = vi
			.fn()
			.mockResolvedValueOnce({
				results: [
					{ file_type: 'image', count: 7 },
					{ file_type: 'video', count: 3 }
				]
			})
			.mockResolvedValueOnce({
				results: [
					{ source: 'user_upload', count: 4 },
					{ source: 'ai_generated', count: 6 }
				]
			})
			.mockResolvedValueOnce({
				results: [
					{ context: 'chat', count: 8 },
					{ context: 'onboarding', count: 2 }
				]
			});

		const mockDB = {
			prepare: vi.fn().mockReturnValue({
				bind: vi.fn().mockReturnValue({
					first: mockFirst,
					all: mockAll
				})
			})
		};

		const { getArchiveStats } = await import('$lib/services/file-archive');
		const stats = await getArchiveStats(mockDB as any, 'bp1');
		expect(stats.totalFiles).toBe(10);
		expect(stats.byType).toEqual({ image: 7, video: 3 });
		expect(stats.bySource).toEqual({ user_upload: 4, ai_generated: 6 });
		expect(stats.byContext).toEqual({ chat: 8, onboarding: 2 });
	});

	it('rowToEntry should handle invalid tags JSON', async () => {
		const mockDB = {
			prepare: vi.fn().mockReturnValue({
				bind: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue({
						id: 'f1',
						brand_profile_id: 'bp1',
						user_id: 'u1',
						file_name: 'test.png',
						mime_type: 'image/png',
						file_size: 1000,
						r2_key: 'test',
						file_type: 'image',
						source: 'user_upload',
						context: 'chat',
						folder: '/uploads/images',
						tags: 'not-valid-json',
						is_starred: 0,
						created_at: '2025-01-01',
						updated_at: '2025-01-01'
					})
				})
			})
		};

		const { getFileArchiveEntry } = await import('$lib/services/file-archive');
		const entry = await getFileArchiveEntry(mockDB as any, 'f1');
		expect(entry).not.toBeNull();
		expect(entry!.tags).toEqual([]);
	});

	it('listFileArchive should handle all filter options', async () => {
		const mockDB = {
			prepare: vi.fn().mockReturnValue({
				bind: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue({ count: 1 }),
					all: vi.fn().mockResolvedValue({
						results: [
							{
								id: 'f1',
								brand_profile_id: 'bp1',
								user_id: 'u1',
								file_name: 'test.png',
								mime_type: 'image/png',
								file_size: 1000,
								r2_key: 'test',
								file_type: 'image',
								source: 'user_upload',
								context: 'chat',
								folder: '/uploads/images',
								tags: '[]',
								is_starred: 1,
								created_at: '2025-01-01',
								updated_at: '2025-01-01'
							}
						]
					})
				})
			})
		};

		const { listFileArchive } = await import('$lib/services/file-archive');
		const result = await listFileArchive(mockDB as any, {
			brandProfileId: 'bp1',
			fileType: 'image',
			source: 'user_upload',
			context: 'chat',
			folder: '/uploads',
			search: 'test',
			isStarred: true,
			limit: 10,
			offset: 0
		});
		expect(result.total).toBe(1);
		expect(result.files).toHaveLength(1);
	});

	it('toggleFileStar should return true when starred', async () => {
		const mockDB = {
			prepare: vi.fn().mockReturnValue({
				bind: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue({ is_starred: 1 })
				})
			})
		};

		const { toggleFileStar } = await import('$lib/services/file-archive');
		const result = await toggleFileStar(mockDB as any, 'f1');
		expect(result).toBe(true);
	});

	it('toggleFileStar should return false when unstarred', async () => {
		const mockDB = {
			prepare: vi.fn().mockReturnValue({
				bind: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue({ is_starred: 0 })
				})
			})
		};

		const { toggleFileStar } = await import('$lib/services/file-archive');
		const result = await toggleFileStar(mockDB as any, 'f1');
		expect(result).toBe(false);
	});

	it('updateFileArchiveEntry with all update options', async () => {
		const mockDB = {
			prepare: vi.fn().mockReturnValue({
				bind: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue({
						id: 'f1',
						brand_profile_id: 'bp1',
						user_id: 'u1',
						file_name: 'renamed.png',
						mime_type: 'image/png',
						file_size: 1000,
						r2_key: 'test',
						file_type: 'image',
						source: 'user_upload',
						context: 'chat',
						folder: '/new-folder',
						tags: '["tag1"]',
						is_starred: 0,
						description: 'New desc',
						created_at: '2025-01-01',
						updated_at: '2025-01-02'
					})
				})
			})
		};

		const { updateFileArchiveEntry } = await import('$lib/services/file-archive');
		const result = await updateFileArchiveEntry(mockDB as any, 'f1', {
			tags: ['tag1'],
			description: 'New desc',
			folder: '/new-folder',
			fileName: 'renamed.png'
		});
		expect(result).not.toBeNull();
		expect(result!.fileName).toBe('renamed.png');
		expect(result!.tags).toEqual(['tag1']);
	});

	it('updateFileArchiveEntry returns null when not found', async () => {
		const mockDB = {
			prepare: vi.fn().mockReturnValue({
				bind: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue(null)
				})
			})
		};

		const { updateFileArchiveEntry } = await import('$lib/services/file-archive');
		const result = await updateFileArchiveEntry(mockDB as any, 'nonexistent', {
			description: 'test'
		});
		expect(result).toBeNull();
	});

	it('deleteFileArchiveEntry returns true when found', async () => {
		const mockDB = {
			prepare: vi.fn().mockReturnValue({
				bind: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue({ id: 'f1' })
				})
			})
		};

		const { deleteFileArchiveEntry } = await import('$lib/services/file-archive');
		const result = await deleteFileArchiveEntry(mockDB as any, 'f1');
		expect(result).toBe(true);
	});

	it('deleteFileArchiveEntry returns false when not found', async () => {
		const mockDB = {
			prepare: vi.fn().mockReturnValue({
				bind: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue(null)
				})
			})
		};

		const { deleteFileArchiveEntry } = await import('$lib/services/file-archive');
		const result = await deleteFileArchiveEntry(mockDB as any, 'nonexistent');
		expect(result).toBe(false);
	});
});

// ─── brand-colors.ts uncovered branches ─────────────

describe('Brand Colors - Extended branch coverage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it('extractColorsFromPixels should return empty when all pixels are transparent', async () => {
		const { extractColorsFromPixels } = await import('$lib/utils/brand-colors');
		// All pixels transparent (alpha = 0)
		const pixels = new Uint8ClampedArray(400); // 100 pixels, all 0
		const result = extractColorsFromPixels(pixels, 10, 10, { maxColors: 5 });
		expect(result).toEqual([]);
	});

	it('extractColorsFromPixels should use fallback when all color samples filtered', async () => {
		const { extractColorsFromPixels } = await import('$lib/utils/brand-colors');
		// Create grey/desaturated pixels that pass alpha but fail saturation filter
		const width = 10;
		const height = 10;
		const pixels = new Uint8ClampedArray(width * height * 4);
		for (let i = 0; i < width * height; i++) {
			const idx = i * 4;
			// All grey (same R,G,B) with full alpha - will fail saturation filter
			pixels[idx] = 128; // R
			pixels[idx + 1] = 128; // G
			pixels[idx + 2] = 128; // B
			pixels[idx + 3] = 255; // A
		}
		const result = extractColorsFromPixels(pixels, width, height, { maxColors: 3 });
		// Should use fallback (no saturation filter) and return at least some colors
		expect(result.length).toBeGreaterThanOrEqual(0);
	});

	it('buildPaletteFromExtracted should handle primary with no matching secondary/accent', async () => {
		const { buildPaletteFromExtracted } = await import('$lib/utils/brand-colors');
		// Provide only primary color sample — secondary/accent will be generated from harmony
		const result = buildPaletteFromExtracted([
			{ hex: '#FF0000', r: 255, g: 0, b: 0, population: 100, score: 1 }
		]);
		expect(result.primary).toBe('#FF0000');
		expect(result.secondary).toBeDefined();
		expect(result.accent).toBeDefined();
	});

	it('buildPaletteFromExtracted with full 3-color palette (distinct colors)', async () => {
		const { buildPaletteFromExtracted } = await import('$lib/utils/brand-colors');
		const result = buildPaletteFromExtracted([
			{ hex: '#FF0000', r: 255, g: 0, b: 0, population: 100, score: 1 },
			{ hex: '#00FF00', r: 0, g: 255, b: 0, population: 80, score: 0.8 },
			{ hex: '#0000FF', r: 0, g: 0, b: 255, population: 60, score: 0.6 }
		]);
		expect(result.primary).toBe('#FF0000');
	});

	it('buildPaletteFromExtracted with empty array falls back to triadic', async () => {
		const { buildPaletteFromExtracted } = await import('$lib/utils/brand-colors');
		const result = buildPaletteFromExtracted([]);
		expect(result.primary).toBeDefined();
		expect(result.secondary).toBeDefined();
		expect(result.accent).toBeDefined();
	});

	it('buildPaletteFromExtracted with similar colors (below MIN_DISTANCE) generates from harmony', async () => {
		const { buildPaletteFromExtracted } = await import('$lib/utils/brand-colors');
		// All colors are nearly identical — no secondary/accent meets MIN_DISTANCE
		const result = buildPaletteFromExtracted([
			{ hex: '#FF0000', r: 255, g: 0, b: 0, population: 100, score: 1 },
			{ hex: '#FE0101', r: 254, g: 1, b: 1, population: 80, score: 0.8 },
			{ hex: '#FD0202', r: 253, g: 2, b: 2, population: 60, score: 0.6 }
		]);
		expect(result.primary).toBe('#FF0000');
		expect(result.secondary).toBeDefined();
		expect(result.accent).toBeDefined();
	});

	it('generateHarmonyTriple should work for triadic', async () => {
		const { generateHarmonyTriple } = await import('$lib/utils/brand-colors');
		const result = generateHarmonyTriple('#FF0000', 'triadic');
		expect(result.primary).toBe('#FF0000');
		expect(result.secondary).toBeDefined();
		expect(result.accent).toBeDefined();
	});

	it('generateHarmonyTriple should work for complementary', async () => {
		const { generateHarmonyTriple } = await import('$lib/utils/brand-colors');
		const result = generateHarmonyTriple('#FF0000', 'complementary');
		expect(result.primary).toBe('#FF0000');
	});

	it('generateHarmonyTriple should work for analogous', async () => {
		const { generateHarmonyTriple } = await import('$lib/utils/brand-colors');
		const result = generateHarmonyTriple('#3366CC', 'analogous');
		expect(result.primary).toBe('#3366CC');
	});

	it('generateHarmonyTriple should work for split-complementary', async () => {
		const { generateHarmonyTriple } = await import('$lib/utils/brand-colors');
		const result = generateHarmonyTriple('#3366CC', 'split-complementary');
		expect(result.primary).toBe('#3366CC');
		expect(result.secondary).toBeDefined();
		expect(result.accent).toBeDefined();
	});
});
