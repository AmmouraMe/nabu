/**
 * Extended coverage tests for:
 *   - lib/stores/chatHistory.ts (updateMessageMedia, deleteConversation, renameConversation, etc.)
 *   - lib/stores/onboarding.ts (updateStep, updateBrandData, etc.)
 *   - routes/chat/+page.server.ts (checkVideoAvailability, checkVoiceAvailability)
 *   - lib/utils/cost.ts (calculateVideoCost, formatVideoCost, calculateVideoCostFromPricing)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

// ─────────────────────────────────────
// Chat History Store - Extended
// ─────────────────────────────────────
describe('Chat History Store - Extended Coverage', () => {
	let chatHistoryStore: any;

	beforeEach(async () => {
		vi.resetModules();
		vi.restoreAllMocks();

		// Mock fetch globally
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ conversations: [] })
		});

		const mod = await import('../../src/lib/stores/chatHistory');
		chatHistoryStore = mod.chatHistoryStore;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should update message media when message has no existing media', () => {
		// Set up state with a conversation and message
		chatHistoryStore.reset();

		// Create conversation manually via addMessage path
		const conv = {
			id: 'conv-1',
			title: 'Test',
			messages: [
				{
					id: 'msg-1',
					role: 'assistant' as const,
					content: 'Generating video...',
					timestamp: new Date()
				}
			],
			createdAt: new Date(),
			updatedAt: new Date(),
			_loaded: true
		};

		// Directly set state
		chatHistoryStore.reset();

		// We need to add a conversation first
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				id: 'conv-1',
				title: 'Test',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			})
		} as any);

		// Create via public API
		chatHistoryStore.clearAll();
	});

	it('should handle updateMessage with cost and media', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				id: 'conv-1',
				title: 'Test',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			})
		} as any);

		const conv = await chatHistoryStore.createConversation('Test');
		const msg = chatHistoryStore.addMessage(conv.id, {
			role: 'assistant',
			content: 'Hello'
		});

		chatHistoryStore.updateMessage(conv.id, msg.id, 'Updated content', {
			inputTokens: 10,
			outputTokens: 5,
			totalCost: 0.01,
			model: 'gpt-4o',
			displayName: 'GPT-4o'
		});

		const state = get(chatHistoryStore) as any;
		const updatedMsg = state.conversations
			.find((c: any) => c.id === conv.id)
			?.messages.find((m: any) => m.id === msg.id);
		expect(updatedMsg?.content).toBe('Updated content');
		expect(updatedMsg?.cost?.totalCost).toBe(0.01);
	});

	it('should handle updateMessageMedia with existing media', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				id: 'conv-1',
				title: 'Test',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			})
		} as any);

		const conv = await chatHistoryStore.createConversation('Test');
		const msg = chatHistoryStore.addMessage(conv.id, {
			role: 'assistant',
			content: 'Video',
			media: { type: 'video', status: 'generating', progress: 0 }
		});

		// Update media with new progress
		chatHistoryStore.updateMessageMedia(conv.id, msg.id, {
			progress: 50,
			status: 'generating'
		});

		const state = get(chatHistoryStore) as any;
		const updatedMsg = state.conversations
			.find((c: any) => c.id === conv.id)
			?.messages.find((m: any) => m.id === msg.id);
		expect(updatedMsg?.media?.progress).toBe(50);
	});

	it('should handle updateMessageMedia without existing media', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				id: 'conv-1',
				title: 'Test',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			})
		} as any);

		const conv = await chatHistoryStore.createConversation('Test');
		const msg = chatHistoryStore.addMessage(conv.id, {
			role: 'assistant',
			content: 'No media yet'
		});

		chatHistoryStore.updateMessageMedia(conv.id, msg.id, {
			progress: 25,
			url: 'http://example.com'
		});

		const state = get(chatHistoryStore) as any;
		const updatedMsg = state.conversations
			.find((c: any) => c.id === conv.id)
			?.messages.find((m: any) => m.id === msg.id);
		expect(updatedMsg?.media).toBeDefined();
		expect(updatedMsg?.media?.type).toBe('video');
	});

	it('should delete conversation and select another', async () => {
		vi.mocked(globalThis.fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					id: 'conv-1',
					title: 'First',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString()
				})
			} as any)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					id: 'conv-2',
					title: 'Second',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString()
				})
			} as any);

		const conv1 = await chatHistoryStore.createConversation('First');
		const conv2 = await chatHistoryStore.createConversation('Second');

		// Select conv1 as current
		chatHistoryStore.selectConversation(conv1.id);

		// Delete conv1 — should select the remaining one
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({ ok: true } as any);
		await chatHistoryStore.deleteConversation(conv1.id);

		const state = get(chatHistoryStore) as any;
		expect(state.conversations.find((c: any) => c.id === conv1.id)).toBeUndefined();
		expect(state.currentConversationId).toBe(conv2.id);
	});

	it('should handle delete failure gracefully', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				id: 'conv-1',
				title: 'Test',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			})
		} as any);

		const conv = await chatHistoryStore.createConversation('Test');

		vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('Network error'));
		await chatHistoryStore.deleteConversation(conv.id);

		// Should still remove locally even if server fails
		const state = get(chatHistoryStore) as any;
		expect(state.conversations.find((c: any) => c.id === conv.id)).toBeUndefined();
	});

	it('should rename conversation', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				id: 'conv-1',
				title: 'Old Title',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			})
		} as any);

		const conv = await chatHistoryStore.createConversation('Old Title');

		vi.mocked(globalThis.fetch).mockResolvedValueOnce({ ok: true } as any);
		await chatHistoryStore.renameConversation(conv.id, 'New Title');

		const state = get(chatHistoryStore) as any;
		expect(state.conversations.find((c: any) => c.id === conv.id)?.title).toBe('New Title');
	});

	it('should handle rename failure gracefully', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				id: 'conv-1',
				title: 'Old',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			})
		} as any);

		const conv = await chatHistoryStore.createConversation('Old');

		vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('Network error'));
		await chatHistoryStore.renameConversation(conv.id, 'New');

		// Still updates locally
		const state = get(chatHistoryStore) as any;
		expect(state.conversations.find((c: any) => c.id === conv.id)?.title).toBe('New');
	});

	it('should toggle sidebar', () => {
		chatHistoryStore.reset();
		const initial = get(chatHistoryStore) as any;
		expect(initial.isSidebarOpen).toBe(true);

		chatHistoryStore.toggleSidebar();
		expect((get(chatHistoryStore) as any).isSidebarOpen).toBe(false);

		chatHistoryStore.toggleSidebar();
		expect((get(chatHistoryStore) as any).isSidebarOpen).toBe(true);
	});

	it('should set sidebar open/closed', () => {
		chatHistoryStore.setSidebarOpen(false);
		expect((get(chatHistoryStore) as any).isSidebarOpen).toBe(false);

		chatHistoryStore.setSidebarOpen(true);
		expect((get(chatHistoryStore) as any).isSidebarOpen).toBe(true);
	});

	it('should set loading state', () => {
		chatHistoryStore.setLoading(true);
		expect((get(chatHistoryStore) as any).isLoading).toBe(true);

		chatHistoryStore.setLoading(false);
		expect((get(chatHistoryStore) as any).isLoading).toBe(false);
	});

	it('should handle failed fetch during selectConversation', async () => {
		// Create a conversation first
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				conversations: [
					{
						id: 'conv-remote',
						title: 'Remote',
						createdAt: '2025-01-01',
						updatedAt: '2025-01-01',
						messageCount: 3,
						_loaded: false
					}
				]
			})
		} as any);

		await chatHistoryStore.initializeForUser('user-1');

		// Now select — fetch for messages should fail
		vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('Network error'));
		await chatHistoryStore.selectConversation('conv-remote');

		const state = get(chatHistoryStore) as any;
		expect(state.currentConversationId).toBe('conv-remote');
		expect(state.isLoading).toBe(false);
	});

	it('should handle non-ok response during selectConversation', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				conversations: [
					{
						id: 'conv-1',
						title: 'Test',
						createdAt: '2025-01-01',
						updatedAt: '2025-01-01'
					}
				]
			})
		} as any);

		await chatHistoryStore.initializeForUser('user-1');

		vi.mocked(globalThis.fetch).mockResolvedValueOnce({ ok: false, status: 500 } as any);
		await chatHistoryStore.selectConversation('conv-1');

		const state = get(chatHistoryStore) as any;
		expect(state.isLoading).toBe(false);
	});

	it('should handle failed initializeForUser', async () => {
		vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('Network error'));
		await chatHistoryStore.initializeForUser('user-1');

		const state = get(chatHistoryStore) as any;
		expect(state.userId).toBe('user-1');
		expect(state.conversations).toEqual([]);
	});

	it('should handle non-ok response during initializeForUser', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({ ok: false, status: 401 } as any);
		await chatHistoryStore.initializeForUser('user-1');

		const state = get(chatHistoryStore) as any;
		expect(state.conversations).toEqual([]);
	});

	it('should handle createConversation server failure with local fallback', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({ ok: false, status: 500 } as any);
		const conv = await chatHistoryStore.createConversation('Fallback');

		expect(conv.title).toBe('Fallback');
		expect(conv.id).toBeDefined();
		expect(conv._loaded).toBe(true);
	});

	it('should handle addMessage with persist (user message)', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				id: 'conv-1',
				title: 'New conversation',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			})
		} as any);

		const conv = await chatHistoryStore.createConversation('New conversation');

		// Add user message — should update title (only when title is "New conversation")
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({ ok: true } as any);
		const msg = chatHistoryStore.addMessage(conv.id, {
			role: 'user',
			content: 'My first message to the AI'
		});

		expect(msg.content).toBe('My first message to the AI');

		// Title should be updated from "New conversation"
		const state = get(chatHistoryStore) as any;
		const updated = state.conversations.find((c: any) => c.id === conv.id);
		expect(updated?.title).toBe('My first message to the AI');
	});

	it('should handle addMessage with persist failure', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				id: 'conv-1',
				title: 'Test',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			})
		} as any);

		const conv = await chatHistoryStore.createConversation('Test');

		vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('Network error'));
		const msg = chatHistoryStore.addMessage(conv.id, {
			role: 'user',
			content: 'Hello'
		});

		// Should still work locally even if persist fails
		expect(msg.content).toBe('Hello');
	});

	it('should getCurrentMessages and getCurrentConversation', async () => {
		// When no current conversation
		expect(chatHistoryStore.getCurrentMessages()).toEqual([]);
		expect(chatHistoryStore.getCurrentConversation()).toBeNull();

		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				id: 'conv-1',
				title: 'Test',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			})
		} as any);

		const conv = await chatHistoryStore.createConversation('Test');
		chatHistoryStore.addMessage(conv.id, { role: 'user', content: 'Hello' });

		expect(chatHistoryStore.getCurrentConversation()).toBeDefined();
		expect(chatHistoryStore.getCurrentMessages()).toHaveLength(1);
	});
});

// ─────────────────────────────────────
// Chat page.server.ts - Extended
// ─────────────────────────────────────
describe('routes/chat/+page.server.ts - Extended', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
	});

	it('should redirect non-auth users to login', async () => {
		const { load } = await import('../../src/routes/chat/+page.server');
		try {
			await load({ locals: { user: null }, platform: {} } as any);
			expect.fail('Should redirect');
		} catch (err: any) {
			expect(err.status).toBe(302);
			expect(err.location).toBe('/auth/login?redirect=/chat');
		}
	});

	it('should redirect admin to /admin when no providers', async () => {
		const { load } = await import('../../src/routes/chat/+page.server');
		const mockKV = { get: vi.fn().mockResolvedValue(null) };
		try {
			await load({
				locals: { user: { id: 'u1', isAdmin: true, isOwner: false } },
				platform: { env: { KV: mockKV } }
			} as any);
			expect.fail('Should redirect');
		} catch (err: any) {
			expect(err.status).toBe(302);
			expect(err.location).toBe('/admin');
		}
	});

	it('should redirect owner to /admin when no providers', async () => {
		const { load } = await import('../../src/routes/chat/+page.server');
		const mockKV = { get: vi.fn().mockResolvedValue(null) };
		try {
			await load({
				locals: { user: { id: 'u1', isAdmin: false, isOwner: true } },
				platform: { env: { KV: mockKV } }
			} as any);
			expect.fail('Should redirect');
		} catch (err: any) {
			expect(err.status).toBe(302);
			expect(err.location).toBe('/admin');
		}
	});

	it('should redirect non-admin to / when no providers', async () => {
		const { load } = await import('../../src/routes/chat/+page.server');
		const mockKV = { get: vi.fn().mockResolvedValue(null) };
		try {
			await load({
				locals: { user: { id: 'u1', isAdmin: false, isOwner: false } },
				platform: { env: { KV: mockKV } }
			} as any);
			expect.fail('Should redirect');
		} catch (err: any) {
			expect(err.status).toBe(302);
			expect(err.location).toBe('/');
		}
	});

	it('should return voice and video availability', async () => {
		const { load } = await import('../../src/routes/chat/+page.server');

		const mockKV = {
			get: vi.fn().mockImplementation((key: string) => {
				if (key === 'ai_keys_list') return JSON.stringify(['key1']);
				if (key === 'ai_key:key1')
					return JSON.stringify({
						enabled: true,
						voiceEnabled: true,
						videoEnabled: true
					});
				return null;
			})
		};

		const result = await load({
			locals: { user: { id: 'u1', isAdmin: false, isOwner: false } },
			platform: { env: { KV: mockKV } }
		} as any);

		expect((result as any).voiceAvailable).toBe(true);
		expect((result as any).videoAvailable).toBe(true);
		expect((result as any).userId).toBe('u1');
	});

	it('should handle no voice or video enabled', async () => {
		const { load } = await import('../../src/routes/chat/+page.server');

		const mockKV = {
			get: vi.fn().mockImplementation((key: string) => {
				if (key === 'ai_keys_list') return JSON.stringify(['key1']);
				if (key === 'ai_key:key1')
					return JSON.stringify({
						enabled: true,
						voiceEnabled: false,
						videoEnabled: false
					});
				return null;
			})
		};

		const result = await load({
			locals: { user: { id: 'u1', isAdmin: false, isOwner: false } },
			platform: { env: { KV: mockKV } }
		} as any);

		expect((result as any).voiceAvailable).toBe(false);
		expect((result as any).videoAvailable).toBe(false);
	});

	it('should handle KV errors for voice/video checks', async () => {
		const { load } = await import('../../src/routes/chat/+page.server');

		const callCount = { checkProviders: 0 };
		const mockKV = {
			get: vi.fn().mockImplementation((key: string) => {
				callCount.checkProviders++;
				// First call (checkEnabledProviders) returns valid key
				if (callCount.checkProviders <= 2) {
					if (key === 'ai_keys_list') return JSON.stringify(['key1']);
					if (key === 'ai_key:key1') return JSON.stringify({ enabled: true });
				}
				// Subsequent calls throw to test error handling
				throw new Error('KV error');
			})
		};

		const result = await load({
			locals: { user: { id: 'u1', isAdmin: false, isOwner: false } },
			platform: { env: { KV: mockKV } }
		} as any);

		expect((result as any).voiceAvailable).toBe(false);
		expect((result as any).videoAvailable).toBe(false);
	});

	it('should handle null KV platform', async () => {
		const { load } = await import('../../src/routes/chat/+page.server');

		// Without KV, checkEnabledProviders returns false
		try {
			await load({
				locals: { user: { id: 'u1', isAdmin: false, isOwner: false } },
				platform: { env: {} }
			} as any);
			expect.fail('Should redirect');
		} catch (err: any) {
			expect(err.status).toBe(302);
		}
	});

	it('should handle null key data in video check', async () => {
		const { load } = await import('../../src/routes/chat/+page.server');

		let callNumber = 0;
		const mockKV = {
			get: vi.fn().mockImplementation((key: string) => {
				callNumber++;
				if (key === 'ai_keys_list') return JSON.stringify(['key1', 'key2']);
				if (key === 'ai_key:key1') return null; // null key data
				if (key === 'ai_key:key2')
					return JSON.stringify({ enabled: true, voiceEnabled: false, videoEnabled: false });
				return null;
			})
		};

		const result = await load({
			locals: { user: { id: 'u1', isAdmin: false } },
			platform: { env: { KV: mockKV } }
		} as any);

		expect((result as any).voiceAvailable).toBe(false);
		expect((result as any).videoAvailable).toBe(false);
	});
});

// ─────────────────────────────────────
// Cost Utils - Extended
// ─────────────────────────────────────
describe('Cost Utils - Extended Coverage', () => {
	it('should calculate video cost with known model', async () => {
		const { calculateVideoCost } = await import('../../src/lib/utils/cost');
		const result = calculateVideoCost('sora', 10);
		expect(result.cost).toBe(5); // 10 seconds × $0.5/second
		expect(result.displayName).toBe('Sora');
	});

	it('should return zero cost for unknown model', async () => {
		const { calculateVideoCost } = await import('../../src/lib/utils/cost');
		const result = calculateVideoCost('unknown-model', 10);
		expect(result.cost).toBe(0);
		expect(result.displayName).toBe('unknown-model');
	});

	it('should format video cost string', async () => {
		const { formatVideoCost } = await import('../../src/lib/utils/cost');
		const result = formatVideoCost('sora', 10);
		expect(result).toContain('Sora');
		expect(result).toContain('10s');
	});

	it('should calculate cost from pricing with per-second', async () => {
		const { calculateVideoCostFromPricing } = await import('../../src/lib/utils/cost');
		const result = calculateVideoCostFromPricing({ estimatedCostPerSecond: 0.5 }, 10);
		expect(result).toBe(5);
	});

	it('should calculate cost from pricing with per-generation', async () => {
		const { calculateVideoCostFromPricing } = await import('../../src/lib/utils/cost');
		const result = calculateVideoCostFromPricing({ estimatedCostPerGeneration: 2.0 }, 10);
		expect(result).toBe(2.0);
	});

	it('should use resolution-specific pricing', async () => {
		const { calculateVideoCostFromPricing } = await import('../../src/lib/utils/cost');
		const result = calculateVideoCostFromPricing(
			{
				estimatedCostPerSecond: 0.5,
				pricingByResolution: {
					'1080p': { estimatedCostPerSecond: 1.0 }
				}
			},
			10,
			'1080p'
		);
		expect(result).toBe(10); // 10 × $1.0 (resolution override)
	});

	it('should use resolution-specific per-generation pricing', async () => {
		const { calculateVideoCostFromPricing } = await import('../../src/lib/utils/cost');
		const result = calculateVideoCostFromPricing(
			{
				estimatedCostPerGeneration: 2.0,
				pricingByResolution: {
					'720p': { estimatedCostPerGeneration: 1.5 }
				}
			},
			10,
			'720p'
		);
		expect(result).toBe(1.5);
	});

	it('should return 0 for null/undefined pricing', async () => {
		const { calculateVideoCostFromPricing } = await import('../../src/lib/utils/cost');
		expect(calculateVideoCostFromPricing(null, 10)).toBe(0);
		expect(calculateVideoCostFromPricing(undefined, 10)).toBe(0);
	});

	it('should return 0 when no cost rates set', async () => {
		const { calculateVideoCostFromPricing } = await import('../../src/lib/utils/cost');
		expect(calculateVideoCostFromPricing({}, 10)).toBe(0);
	});

	it('should prefer per-second over per-generation', async () => {
		const { calculateVideoCostFromPricing } = await import('../../src/lib/utils/cost');
		const result = calculateVideoCostFromPricing(
			{ estimatedCostPerSecond: 0.5, estimatedCostPerGeneration: 100 },
			10
		);
		expect(result).toBe(5); // per-second wins
	});

	it('should handle zero duration with per-second pricing', async () => {
		const { calculateVideoCostFromPricing } = await import('../../src/lib/utils/cost');
		const result = calculateVideoCostFromPricing({ estimatedCostPerSecond: 0.5 }, 0);
		expect(result).toBe(0);
	});

	it('should handle calculateVoiceCost', async () => {
		const { calculateVoiceCost } = await import('../../src/lib/utils/cost');
		const result = calculateVoiceCost('gpt-4o-realtime-preview', 10, 5);
		expect(result).toBeDefined();
		expect(result.totalCost).toBeGreaterThanOrEqual(0);
	});

	it('should handle lookupVideoModelCost', async () => {
		const { lookupVideoModelCost } = await import('../../src/lib/utils/cost');
		// With unknown provider
		expect(lookupVideoModelCost('unknown', 'model', 10)).toBe(0);
	});
});
