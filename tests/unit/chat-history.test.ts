import {
	chatHistoryStore,
	currentConversation,
	currentMessages,
	type ChatHistoryState,
	type Conversation
} from '$lib/stores/chatHistory';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Helper to create a mock fetch that handles conversation API calls
function mockFetch() {
	const mock = vi.fn(async (url: string, options?: RequestInit) => {
		const method = options?.method || 'GET';
		const urlStr = typeof url === 'string' ? url : '';

		// POST /api/chat/conversations — create conversation
		if (urlStr === '/api/chat/conversations' && method === 'POST') {
			const body = JSON.parse((options?.body as string) || '{}');
			return new Response(
				JSON.stringify({
					id: crypto.randomUUID(),
					title: body.title || 'New conversation',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString()
				}),
				{ status: 200 }
			);
		}

		// GET /api/chat/conversations — list conversations
		if (urlStr === '/api/chat/conversations' && method === 'GET') {
			return new Response(JSON.stringify({ conversations: [] }), { status: 200 });
		}

		// GET /api/chat/conversations/:id — get conversation
		if (urlStr.match(/\/api\/chat\/conversations\/[^/]+$/) && method === 'GET') {
			return new Response(
				JSON.stringify({
					id: urlStr.split('/').pop(),
					title: 'Test',
					messages: [],
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString()
				}),
				{ status: 200 }
			);
		}

		// PATCH /api/chat/conversations/:id — rename
		if (urlStr.match(/\/api\/chat\/conversations\/[^/]+$/) && method === 'PATCH') {
			return new Response(JSON.stringify({ success: true }), { status: 200 });
		}

		// DELETE /api/chat/conversations/:id — delete
		if (urlStr.match(/\/api\/chat\/conversations\/[^/]+$/) && method === 'DELETE') {
			return new Response(JSON.stringify({ success: true }), { status: 200 });
		}

		// POST /api/chat/conversations/:id/messages — add message
		if (urlStr.match(/\/api\/chat\/conversations\/[^/]+\/messages$/) && method === 'POST') {
			return new Response(JSON.stringify({ success: true }), { status: 200 });
		}

		return new Response('Not found', { status: 404 });
	});

	globalThis.fetch = mock as typeof globalThis.fetch;
	return mock;
}

describe('Chat History Store', () => {
	let fetchMock: ReturnType<typeof mockFetch>;
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		chatHistoryStore.reset();
		fetchMock = mockFetch();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	describe('Initial state', () => {
		it('should have empty conversations initially', () => {
			const state = get(chatHistoryStore) as ChatHistoryState;
			expect(state.conversations).toEqual([]);
		});

		it('should have no current conversation initially', () => {
			const state = get(chatHistoryStore) as ChatHistoryState;
			expect(state.currentConversationId).toBeNull();
		});

		it('should not be loading initially', () => {
			const state = get(chatHistoryStore) as ChatHistoryState;
			expect(state.isLoading).toBe(false);
		});
	});

	describe('Creating conversations', () => {
		it('should create a new conversation', async () => {
			const conversation = await chatHistoryStore.createConversation();

			expect(conversation).toBeDefined();
			expect(conversation.id).toBeDefined();
			expect(conversation.title).toBe('New conversation');
			expect(conversation.messages).toEqual([]);
			expect(conversation.createdAt).toBeInstanceOf(Date);
			expect(conversation.updatedAt).toBeInstanceOf(Date);
		});

		it('should add the new conversation to the list', async () => {
			const conversation = await chatHistoryStore.createConversation();
			const state = get(chatHistoryStore) as ChatHistoryState;

			expect(state.conversations).toHaveLength(1);
			expect(state.conversations[0].id).toBe(conversation.id);
		});

		it('should set the new conversation as current', async () => {
			const conversation = await chatHistoryStore.createConversation();
			const state = get(chatHistoryStore) as ChatHistoryState;

			expect(state.currentConversationId).toBe(conversation.id);
		});

		it('should create conversation with custom title', async () => {
			const conversation = await chatHistoryStore.createConversation('My Custom Chat');

			expect(conversation.title).toBe('My Custom Chat');
		});
	});

	describe('Selecting conversations', () => {
		it('should select an existing conversation', async () => {
			const conv1 = await chatHistoryStore.createConversation('First');
			await chatHistoryStore.createConversation('Second');

			await chatHistoryStore.selectConversation(conv1.id);
			const state = get(chatHistoryStore) as ChatHistoryState;

			expect(state.currentConversationId).toBe(conv1.id);
		});

		it('should return the selected conversation messages', async () => {
			const conv = await chatHistoryStore.createConversation();
			chatHistoryStore.addMessage(conv.id, {
				role: 'user',
				content: 'Hello'
			});

			await chatHistoryStore.selectConversation(conv.id);
			const messages = chatHistoryStore.getCurrentMessages();

			expect(messages).toHaveLength(1);
			expect(messages[0].content).toBe('Hello');
		});
	});

	describe('Managing messages', () => {
		it('should add a message to a conversation', async () => {
			const conv = await chatHistoryStore.createConversation();

			chatHistoryStore.addMessage(conv.id, {
				role: 'user',
				content: 'Hello, AI!'
			});

			const state = get(chatHistoryStore) as ChatHistoryState;
			const conversation = state.conversations.find((c: Conversation) => c.id === conv.id);

			expect(conversation?.messages).toHaveLength(1);
			expect(conversation?.messages[0].content).toBe('Hello, AI!');
			expect(conversation?.messages[0].role).toBe('user');
			expect(conversation?.messages[0].id).toBeDefined();
			expect(conversation?.messages[0].timestamp).toBeInstanceOf(Date);
		});

		it('should update conversation title based on first user message', async () => {
			const conv = await chatHistoryStore.createConversation();

			chatHistoryStore.addMessage(conv.id, {
				role: 'user',
				content: 'How do I bake a chocolate cake?'
			});

			const state = get(chatHistoryStore) as ChatHistoryState;
			const conversation = state.conversations.find((c: Conversation) => c.id === conv.id);

			expect(conversation?.title).toBe('How do I bake a chocolate cake?');
		});

		it('should truncate long titles', async () => {
			const conv = await chatHistoryStore.createConversation();

			chatHistoryStore.addMessage(conv.id, {
				role: 'user',
				content:
					'This is a very long message that should be truncated when used as a title for the conversation in the sidebar'
			});

			const state = get(chatHistoryStore) as ChatHistoryState;
			const conversation = state.conversations.find((c: Conversation) => c.id === conv.id);

			expect(conversation?.title.length).toBeLessThanOrEqual(53); // 50 chars + '...'
		});

		it('should update the conversation updatedAt when adding a message', async () => {
			const conv = await chatHistoryStore.createConversation();
			const originalUpdatedAt = conv.updatedAt;

			chatHistoryStore.addMessage(conv.id, {
				role: 'user',
				content: 'Hello'
			});

			const state = get(chatHistoryStore) as ChatHistoryState;
			const conversation = state.conversations.find((c: Conversation) => c.id === conv.id);

			expect(conversation?.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt.getTime());
		});
	});

	describe('Deleting conversations', () => {
		it('should delete a conversation', async () => {
			const conv1 = await chatHistoryStore.createConversation('First');
			const conv2 = await chatHistoryStore.createConversation('Second');

			await chatHistoryStore.deleteConversation(conv1.id);
			const state = get(chatHistoryStore) as ChatHistoryState;

			expect(state.conversations).toHaveLength(1);
			expect(state.conversations[0].id).toBe(conv2.id);
		});

		it('should clear currentConversationId when deleting current conversation', async () => {
			const conv = await chatHistoryStore.createConversation();

			await chatHistoryStore.deleteConversation(conv.id);
			const state = get(chatHistoryStore) as ChatHistoryState;

			expect(state.currentConversationId).toBeNull();
		});

		it('should select another conversation after deleting current', async () => {
			const conv1 = await chatHistoryStore.createConversation('First');
			await chatHistoryStore.createConversation('Second');

			const currentState = get(chatHistoryStore) as ChatHistoryState;
			await chatHistoryStore.deleteConversation(currentState.currentConversationId!);
			const state = get(chatHistoryStore) as ChatHistoryState;

			expect(state.currentConversationId).toBe(conv1.id);
		});
	});

	describe('Renaming conversations', () => {
		it('should rename a conversation', async () => {
			const conv = await chatHistoryStore.createConversation('Original Title');

			await chatHistoryStore.renameConversation(conv.id, 'New Title');
			const state = get(chatHistoryStore) as ChatHistoryState;
			const conversation = state.conversations.find((c: Conversation) => c.id === conv.id);

			expect(conversation?.title).toBe('New Title');
		});
	});

	describe('Clearing all conversations', () => {
		it('should clear all conversations', async () => {
			await chatHistoryStore.createConversation('First');
			await chatHistoryStore.createConversation('Second');
			await chatHistoryStore.createConversation('Third');

			chatHistoryStore.clearAll();
			const state = get(chatHistoryStore) as ChatHistoryState;

			expect(state.conversations).toEqual([]);
			expect(state.currentConversationId).toBeNull();
		});
	});

	describe('Sorting conversations', () => {
		it('should sort conversations by most recent first', async () => {
			const conv1 = await chatHistoryStore.createConversation('First');
			const conv2 = await chatHistoryStore.createConversation('Second');
			const conv3 = await chatHistoryStore.createConversation('Third');

			const state = get(chatHistoryStore) as ChatHistoryState;

			// Most recently created should be first
			expect(state.conversations[0].id).toBe(conv3.id);
			expect(state.conversations[1].id).toBe(conv2.id);
			expect(state.conversations[2].id).toBe(conv1.id);
		});
	});

	describe('Updating messages', () => {
		it('should update an existing message content', async () => {
			const conv = await chatHistoryStore.createConversation();
			const message = chatHistoryStore.addMessage(conv.id, {
				role: 'assistant',
				content: 'Initial response'
			});

			chatHistoryStore.updateMessage(conv.id, message.id, 'Updated response');

			const state = get(chatHistoryStore) as ChatHistoryState;
			const conversation = state.conversations.find((c: Conversation) => c.id === conv.id);
			const updatedMessage = conversation?.messages.find((m) => m.id === message.id);

			expect(updatedMessage?.content).toBe('Updated response');
		});

		it('should update message with cost information', async () => {
			const conv = await chatHistoryStore.createConversation();
			const message = chatHistoryStore.addMessage(conv.id, {
				role: 'assistant',
				content: 'AI response'
			});

			const cost = {
				inputTokens: 100,
				outputTokens: 200,
				totalCost: 0.005,
				model: 'gpt-4',
				displayName: 'GPT-4'
			};

			chatHistoryStore.updateMessage(conv.id, message.id, 'Updated response', cost);

			const state = get(chatHistoryStore) as ChatHistoryState;
			const conversation = state.conversations.find((c: Conversation) => c.id === conv.id);
			const updatedMessage = conversation?.messages.find((m) => m.id === message.id);

			expect(updatedMessage?.cost).toEqual(cost);
		});

		it('should update conversation updatedAt when updating a message', async () => {
			const conv = await chatHistoryStore.createConversation();
			const message = chatHistoryStore.addMessage(conv.id, {
				role: 'assistant',
				content: 'Initial'
			});

			const beforeState = get(chatHistoryStore) as ChatHistoryState;
			const beforeUpdated = beforeState.conversations.find(
				(c: Conversation) => c.id === conv.id
			)?.updatedAt;

			chatHistoryStore.updateMessage(conv.id, message.id, 'Updated');

			const afterState = get(chatHistoryStore) as ChatHistoryState;
			const afterUpdated = afterState.conversations.find(
				(c: Conversation) => c.id === conv.id
			)?.updatedAt;

			expect(afterUpdated?.getTime()).toBeGreaterThanOrEqual(beforeUpdated?.getTime() || 0);
		});

		it('should not update messages in other conversations', async () => {
			const conv1 = await chatHistoryStore.createConversation('First');
			const conv2 = await chatHistoryStore.createConversation('Second');

			const message1 = chatHistoryStore.addMessage(conv1.id, {
				role: 'user',
				content: 'Message in conv1'
			});

			chatHistoryStore.addMessage(conv2.id, {
				role: 'user',
				content: 'Message in conv2'
			});

			chatHistoryStore.updateMessage(conv1.id, message1.id, 'Updated in conv1');

			const state = get(chatHistoryStore) as ChatHistoryState;
			const conv2Updated = state.conversations.find((c: Conversation) => c.id === conv2.id);

			expect(conv2Updated?.messages[0].content).toBe('Message in conv2');
		});
	});

	describe('Getting current conversation', () => {
		it('should return null when no conversation is selected', () => {
			const result = chatHistoryStore.getCurrentConversation();
			expect(result).toBeNull();
		});

		it('should return the current conversation when one is selected', async () => {
			const conv = await chatHistoryStore.createConversation('Test Conv');
			chatHistoryStore.addMessage(conv.id, { role: 'user', content: 'Hello' });

			const result = chatHistoryStore.getCurrentConversation();

			expect(result).toBeDefined();
			expect(result?.id).toBe(conv.id);
			expect(result?.title).toBe('Test Conv');
			expect(result?.messages).toHaveLength(1);
		});

		it('should return null for non-existent conversation id', async () => {
			const conv = await chatHistoryStore.createConversation('Test');

			await chatHistoryStore.deleteConversation(conv.id);

			const result = chatHistoryStore.getCurrentConversation();
			expect(result).toBeNull();
		});
	});

	describe('Getting current messages', () => {
		it('should return empty array when no conversation is selected', () => {
			const messages = chatHistoryStore.getCurrentMessages();
			expect(messages).toEqual([]);
		});

		it('should return messages from the current conversation', async () => {
			const conv = await chatHistoryStore.createConversation();
			chatHistoryStore.addMessage(conv.id, { role: 'user', content: 'Message 1' });
			chatHistoryStore.addMessage(conv.id, { role: 'assistant', content: 'Message 2' });

			const messages = chatHistoryStore.getCurrentMessages();

			expect(messages).toHaveLength(2);
			expect(messages[0].content).toBe('Message 1');
			expect(messages[1].content).toBe('Message 2');
		});
	});

	describe('Sidebar state management', () => {
		it('should have sidebar open by default', () => {
			const state = get(chatHistoryStore) as ChatHistoryState;
			expect(state.isSidebarOpen).toBe(true);
		});

		it('should toggle sidebar state', () => {
			chatHistoryStore.toggleSidebar();
			let state = get(chatHistoryStore) as ChatHistoryState;
			expect(state.isSidebarOpen).toBe(false);

			chatHistoryStore.toggleSidebar();
			state = get(chatHistoryStore) as ChatHistoryState;
			expect(state.isSidebarOpen).toBe(true);
		});

		it('should set sidebar open state explicitly', () => {
			chatHistoryStore.setSidebarOpen(false);
			let state = get(chatHistoryStore) as ChatHistoryState;
			expect(state.isSidebarOpen).toBe(false);

			chatHistoryStore.setSidebarOpen(true);
			state = get(chatHistoryStore) as ChatHistoryState;
			expect(state.isSidebarOpen).toBe(true);
		});
	});

	describe('Loading state management', () => {
		it('should set loading state', () => {
			chatHistoryStore.setLoading(true);
			let state = get(chatHistoryStore) as ChatHistoryState;
			expect(state.isLoading).toBe(true);

			chatHistoryStore.setLoading(false);
			state = get(chatHistoryStore) as ChatHistoryState;
			expect(state.isLoading).toBe(false);
		});
	});

	describe('User initialization', () => {
		it('should initialize store for a user', async () => {
			await chatHistoryStore.initializeForUser('user-123');

			const state = get(chatHistoryStore) as ChatHistoryState;
			expect(state.userId).toBe('user-123');
		});

		it('should fetch conversations on init', async () => {
			await chatHistoryStore.initializeForUser('test-user-456');
			expect(fetchMock).toHaveBeenCalledWith('/api/chat/conversations');
		});
	});

	describe('Adding messages with cost', () => {
		it('should add a message with cost information', async () => {
			const conv = await chatHistoryStore.createConversation();
			const cost = {
				inputTokens: 50,
				outputTokens: 100,
				totalCost: 0.002,
				model: 'gpt-3.5-turbo',
				displayName: 'GPT-3.5 Turbo'
			};

			const message = chatHistoryStore.addMessage(conv.id, {
				role: 'assistant',
				content: 'Response with cost',
				cost
			});

			expect(message.cost).toEqual(cost);

			const state = get(chatHistoryStore) as ChatHistoryState;
			expect(state.conversations[0].messages[0].cost).toEqual(cost);
		});
	});

	describe('Title update behavior', () => {
		it('should not update title if not default', async () => {
			const conv = await chatHistoryStore.createConversation('Custom Title');

			chatHistoryStore.addMessage(conv.id, {
				role: 'user',
				content: 'This should not become the title'
			});

			const state = get(chatHistoryStore) as ChatHistoryState;
			const conversation = state.conversations.find((c: Conversation) => c.id === conv.id);
			expect(conversation?.title).toBe('Custom Title');
		});

		it('should not update title for assistant messages', async () => {
			const conv = await chatHistoryStore.createConversation();

			chatHistoryStore.addMessage(conv.id, {
				role: 'assistant',
				content: 'AI responds first'
			});

			const state = get(chatHistoryStore) as ChatHistoryState;
			const conversation = state.conversations.find((c: Conversation) => c.id === conv.id);
			expect(conversation?.title).toBe('New conversation');
		});

		it('should not update title after first user message', async () => {
			const conv = await chatHistoryStore.createConversation();

			chatHistoryStore.addMessage(conv.id, {
				role: 'user',
				content: 'First message becomes title'
			});

			chatHistoryStore.addMessage(conv.id, {
				role: 'user',
				content: 'Second message should not become title'
			});

			const state = get(chatHistoryStore) as ChatHistoryState;
			const conversation = state.conversations.find((c: Conversation) => c.id === conv.id);
			expect(conversation?.title).toBe('First message becomes title');
		});
	});

	describe('Deleting non-current conversation', () => {
		it('should not change currentConversationId when deleting a different conversation', async () => {
			const conv1 = await chatHistoryStore.createConversation('First');
			const conv2 = await chatHistoryStore.createConversation('Second');

			await chatHistoryStore.deleteConversation(conv1.id);
			const state = get(chatHistoryStore) as ChatHistoryState;

			expect(state.currentConversationId).toBe(conv2.id);
			expect(state.conversations).toHaveLength(1);
		});
	});

	describe('Derived stores', () => {
		it('currentConversation should return null when no conversation selected', () => {
			const conv = get(currentConversation);
			expect(conv).toBeNull();
		});

		it('currentConversation should return the selected conversation', async () => {
			const created = await chatHistoryStore.createConversation('Test Derived');
			chatHistoryStore.addMessage(created.id, { role: 'user', content: 'Hello' });

			const conv = get(currentConversation);
			expect(conv).toBeDefined();
			expect(conv?.id).toBe(created.id);
		});

		it('currentMessages should return empty array when no conversation', () => {
			const messages = get(currentMessages);
			expect(messages).toEqual([]);
		});

		it('currentMessages should return messages from current conversation', async () => {
			const conv = await chatHistoryStore.createConversation();
			chatHistoryStore.addMessage(conv.id, { role: 'user', content: 'Message 1' });
			chatHistoryStore.addMessage(conv.id, { role: 'assistant', content: 'Message 2' });

			const messages = get(currentMessages);
			expect(messages).toHaveLength(2);
			expect(messages[0].content).toBe('Message 1');
			expect(messages[1].content).toBe('Message 2');
		});

		it('currentConversation should return null for non-existent id', async () => {
			const conv = await chatHistoryStore.createConversation('Test');
			await chatHistoryStore.deleteConversation(conv.id);

			const current = get(currentConversation);
			expect(current).toBeNull();
		});
	});

	describe('Media attachment', () => {
		it('should add a message with media attachment', async () => {
			const conv = await chatHistoryStore.createConversation();
			const media = {
				type: 'video' as const,
				status: 'generating' as const,
				progress: 0
			};

			const message = chatHistoryStore.addMessage(conv.id, {
				role: 'assistant',
				content: 'Generating video...',
				media
			});

			expect(message.media).toEqual(media);
		});

		it('should update message media', async () => {
			const conv = await chatHistoryStore.createConversation();
			const message = chatHistoryStore.addMessage(conv.id, {
				role: 'assistant',
				content: 'Generating video...',
				media: { type: 'video', status: 'generating', progress: 0 }
			});

			chatHistoryStore.updateMessageMedia(conv.id, message.id, {
				status: 'complete',
				url: 'https://example.com/video.mp4',
				progress: 100
			});

			const state = get(chatHistoryStore) as ChatHistoryState;
			const updated = state.conversations[0].messages[0];
			expect(updated.media?.status).toBe('complete');
			expect(updated.media?.url).toBe('https://example.com/video.mp4');
		});
	});
});
