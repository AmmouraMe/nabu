import { derived, get, writable } from 'svelte/store';

export interface MessageCost {
	inputTokens: number;
	outputTokens: number;
	totalCost: number;
	model: string;
	displayName: string;
}

export interface MediaAttachment {
	type: 'video' | 'image';
	url?: string;
	thumbnailUrl?: string;
	status: 'generating' | 'complete' | 'error';
	progress?: number;
	r2Key?: string;
	duration?: number;
	error?: string;
	providerJobId?: string;
	generationId?: string;
}

export interface ChatAttachment {
	id: string;
	type: 'image' | 'video' | 'audio';
	name: string;
	url: string;
	mimeType: string;
	size?: number;
	r2Key?: string;
	archiveId?: string;
}

export interface Message {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: Date;
	cost?: MessageCost;
	media?: MediaAttachment;
	attachments?: ChatAttachment[];
}

export interface Conversation {
	id: string;
	title: string;
	messages: Message[];
	createdAt: Date;
	updatedAt: Date;
	messageCount?: number;
	lastMessage?: string;
	_loaded?: boolean; // Whether full messages have been fetched
}

export interface ChatHistoryState {
	conversations: Conversation[];
	currentConversationId: string | null;
	isLoading: boolean;
	isSidebarOpen: boolean;
	userId: string | null;
}

const MAX_TITLE_LENGTH = 50;

function generateId(): string {
	return crypto.randomUUID
		? crypto.randomUUID()
		: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function truncateTitle(text: string): string {
	if (text.length <= MAX_TITLE_LENGTH) return text;
	return text.substring(0, MAX_TITLE_LENGTH) + '...';
}

function createInitialState(userId: string | null = null): ChatHistoryState {
	return {
		conversations: [],
		currentConversationId: null,
		isLoading: false,
		isSidebarOpen: true,
		userId
	};
}

function parseTimestamp(ts: any): Date {
	if (ts instanceof Date) return ts;
	if (typeof ts === 'string') return new Date(ts);
	return new Date();
}

function createChatHistoryStore() {
	const store = writable<ChatHistoryState>(createInitialState());
	const { subscribe, set, update } = store;

	return {
		subscribe,

		/**
		 * Initialize the store for a specific user
		 * Fetches conversations from the server API
		 */
		async initializeForUser(userId: string): Promise<void> {
			update((state) => ({ ...state, userId, isLoading: true }));

			try {
				const response = await fetch('/api/chat/conversations');
				if (response.ok) {
					const data = await response.json();
					const conversations: Conversation[] = (data.conversations || []).map((conv: any) => ({
						id: conv.id,
						title: conv.title,
						messages: [],
						createdAt: parseTimestamp(conv.createdAt),
						updatedAt: parseTimestamp(conv.updatedAt),
						messageCount: conv.messageCount || 0,
						lastMessage: conv.lastMessage || '',
						_loaded: false
					}));

					set({
						conversations,
						currentConversationId: null,
						isLoading: false,
						isSidebarOpen: true,
						userId
					});
				} else {
					console.error('Failed to fetch conversations:', response.status);
					set(createInitialState(userId));
				}
			} catch (err) {
				console.error('Failed to initialize chat history:', err);
				set(createInitialState(userId));
			}
		},

		reset(): void {
			const currentState = get(store);
			set(createInitialState(currentState.userId));
		},

		async createConversation(title: string = 'New conversation'): Promise<Conversation> {
			try {
				const response = await fetch('/api/chat/conversations', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ title })
				});

				if (!response.ok) {
					throw new Error('Failed to create conversation');
				}

				const data = await response.json();
				const conversation: Conversation = {
					id: data.id,
					title: data.title,
					messages: [],
					createdAt: parseTimestamp(data.createdAt),
					updatedAt: parseTimestamp(data.updatedAt),
					_loaded: true
				};

				update((state) => ({
					...state,
					conversations: [conversation, ...state.conversations],
					currentConversationId: conversation.id
				}));

				return conversation;
			} catch (err) {
				console.error('Failed to create conversation:', err);
				// Fallback: create locally with a temp ID (will sync later)
				const now = new Date();
				const conversation: Conversation = {
					id: generateId(),
					title,
					messages: [],
					createdAt: now,
					updatedAt: now,
					_loaded: true
				};

				update((state) => ({
					...state,
					conversations: [conversation, ...state.conversations],
					currentConversationId: conversation.id
				}));

				return conversation;
			}
		},

		async selectConversation(id: string): Promise<void> {
			// Set current immediately for responsive UI
			update((state) => ({
				...state,
				currentConversationId: id
			}));

			// Check if messages need to be loaded
			const state = get(store);
			const conv = state.conversations.find((c) => c.id === id);
			if (conv && conv._loaded) return;

			// Fetch full conversation with messages
			try {
				update((s) => ({ ...s, isLoading: true }));
				const response = await fetch(`/api/chat/conversations/${id}`);
				if (response.ok) {
					const data = await response.json();
					const messages: Message[] = (data.messages || []).map((msg: any) => ({
						id: msg.id,
						role: msg.role,
						content: msg.content,
						timestamp: parseTimestamp(msg.timestamp),
						cost: msg.cost,
						media: msg.media
					}));

					update((s) => ({
						...s,
						isLoading: false,
						conversations: s.conversations.map((c) =>
							c.id === id
								? {
										...c,
										title: data.title,
										messages,
										_loaded: true
									}
								: c
						)
					}));
				} else {
					update((s) => ({ ...s, isLoading: false }));
				}
			} catch (err) {
				console.error('Failed to load conversation:', err);
				update((s) => ({ ...s, isLoading: false }));
			}
		},

		getCurrentMessages(): Message[] {
			const state = get(store);
			if (!state.currentConversationId) return [];

			const conversation = state.conversations.find((c) => c.id === state.currentConversationId);
			return conversation?.messages || [];
		},

		getCurrentConversation(): Conversation | null {
			const state = get(store);
			if (!state.currentConversationId) return null;

			return state.conversations.find((c) => c.id === state.currentConversationId) || null;
		},

		addMessage(
			conversationId: string,
			message: {
				role: 'user' | 'assistant' | 'system';
				content: string;
				cost?: MessageCost;
				media?: MediaAttachment;
				attachments?: ChatAttachment[];
				id?: string;
			}
		): Message {
			const newMessage: Message = {
				id: message.id || generateId(),
				role: message.role,
				content: message.content,
				timestamp: new Date(),
				cost: message.cost,
				media: message.media,
				attachments: message.attachments
			};

			update((state) => {
				const conversations = state.conversations.map((conv) => {
					if (conv.id !== conversationId) return conv;

					// Update title from first user message if still default
					let title = conv.title;
					if (
						conv.title === 'New conversation' &&
						message.role === 'user' &&
						conv.messages.length === 0
					) {
						title = truncateTitle(message.content);
					}

					return {
						...conv,
						title,
						messages: [...conv.messages, newMessage],
						updatedAt: new Date()
					};
				});

				return {
					...state,
					conversations
				};
			});

			// Persist to server (non-blocking)
			// Note: For text chat, the stream endpoint handles assistant message persistence.
			// User messages and video messages are persisted here.
			if (message.role === 'user' || message.media) {
				fetch(`/api/chat/conversations/${conversationId}/messages`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						id: newMessage.id,
						role: message.role,
						content: message.content,
						cost: message.cost,
						media: message.media,
						attachments: message.attachments
					})
				}).catch((err) => console.error('Failed to persist message:', err));
			}

			return newMessage;
		},

		updateMessage(
			conversationId: string,
			messageId: string,
			content: string,
			cost?: MessageCost,
			media?: MediaAttachment
		): void {
			update((state) => ({
				...state,
				conversations: state.conversations.map((conv) => {
					if (conv.id !== conversationId) return conv;

					return {
						...conv,
						messages: conv.messages.map((msg) =>
							msg.id === messageId
								? {
										...msg,
										content,
										...(cost && { cost }),
										...(media && { media })
									}
								: msg
						),
						updatedAt: new Date()
					};
				})
			}));
		},

		/**
		 * Update just the media attachment on a message (for video progress)
		 */
		updateMessageMedia(
			conversationId: string,
			messageId: string,
			media: Partial<MediaAttachment>
		): void {
			update((state) => ({
				...state,
				conversations: state.conversations.map((conv) => {
					if (conv.id !== conversationId) return conv;

					return {
						...conv,
						messages: conv.messages.map((msg) => {
							if (msg.id !== messageId) return msg;
							return {
								...msg,
								media: msg.media
									? { ...msg.media, ...media }
									: ({ type: 'video', status: 'generating', ...media } as MediaAttachment)
							};
						})
					};
				})
			}));
		},

		async deleteConversation(id: string): Promise<void> {
			update((state) => {
				const newConversations = state.conversations.filter((c) => c.id !== id);
				let newCurrentId = state.currentConversationId;

				// If we deleted the current conversation, select another one
				if (state.currentConversationId === id) {
					newCurrentId = newConversations.length > 0 ? newConversations[0].id : null;
				}

				return {
					...state,
					conversations: newConversations,
					currentConversationId: newCurrentId
				};
			});

			// Delete on server
			try {
				await fetch(`/api/chat/conversations/${id}`, { method: 'DELETE' });
			} catch (err) {
				console.error('Failed to delete conversation on server:', err);
			}
		},

		async renameConversation(id: string, title: string): Promise<void> {
			update((state) => ({
				...state,
				conversations: state.conversations.map((conv) =>
					conv.id === id ? { ...conv, title, updatedAt: new Date() } : conv
				)
			}));

			// Persist rename
			try {
				await fetch(`/api/chat/conversations/${id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ title })
				});
			} catch (err) {
				console.error('Failed to rename conversation on server:', err);
			}
		},

		clearAll(): void {
			update((state) => ({
				...state,
				conversations: [],
				currentConversationId: null
			}));
		},

		toggleSidebar(): void {
			update((state) => ({
				...state,
				isSidebarOpen: !state.isSidebarOpen
			}));
		},

		setSidebarOpen(isOpen: boolean): void {
			update((state) => ({
				...state,
				isSidebarOpen: isOpen
			}));
		},

		setLoading(isLoading: boolean): void {
			update((state) => ({
				...state,
				isLoading
			}));
		}
	};
}

export const chatHistoryStore = createChatHistoryStore();

// Derived store for the current conversation
export const currentConversation = derived(chatHistoryStore, ($store) => {
	if (!$store.currentConversationId) return null;
	return $store.conversations.find((c) => c.id === $store.currentConversationId) || null;
});

// Derived store for current messages
export const currentMessages = derived(
	currentConversation,
	($conversation) => $conversation?.messages || []
);
