import ChatSidebar from '$lib/components/ChatSidebar.svelte';
import { chatHistoryStore } from '$lib/stores/chatHistory';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('ChatSidebar', () => {
	beforeEach(() => {
		chatHistoryStore.reset();
		// Mock fetch for API-backed store
		globalThis.fetch = vi.fn(async (url: string, options?: RequestInit) => {
			if (typeof url === 'string' && url.includes('/api/chat/conversations')) {
				let title = 'New conversation';
				if (options?.body) {
					try {
						title = JSON.parse(options.body as string).title || title;
					} catch {}
				}
				return new Response(
					JSON.stringify({
						id: crypto.randomUUID(),
						title,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						conversations: [],
						success: true
					}),
					{ status: 200 }
				);
			}
			return new Response('Not found', { status: 404 });
		}) as typeof globalThis.fetch;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('Rendering', () => {
		it('should render the sidebar', () => {
			render(ChatSidebar);
			expect(screen.getByLabelText(/chat history/i)).toBeInTheDocument();
		});

		it('should display "New Chat" button', () => {
			render(ChatSidebar);
			expect(screen.getByRole('button', { name: /new chat/i })).toBeInTheDocument();
		});

		it('should show empty state when no conversations', () => {
			render(ChatSidebar);
			expect(screen.getByText(/no conversations yet/i)).toBeInTheDocument();
		});
	});

	describe('Creating conversations', () => {
		it('should create a new conversation when "New Chat" is clicked', async () => {
			render(ChatSidebar);

			const newChatButton = screen.getByRole('button', { name: /new chat/i });
			await fireEvent.click(newChatButton);

			await waitFor(() => {
				const state = get(chatHistoryStore);
				expect(state.conversations).toHaveLength(1);
			});
		});
	});

	describe('Displaying conversations', () => {
		it('should display conversation titles', async () => {
			await chatHistoryStore.createConversation('Test Conversation');

			render(ChatSidebar);
			await waitFor(() => {
				expect(screen.getByText('Test Conversation')).toBeInTheDocument();
			});
		});

		it('should highlight the current conversation', async () => {
			const conv1 = await chatHistoryStore.createConversation('First Chat');
			await chatHistoryStore.createConversation('Second Chat');

			const { rerender } = render(ChatSidebar);

			// Select the first conversation
			await chatHistoryStore.selectConversation(conv1.id);

			// Wait for re-render
			await waitFor(() => {
				const firstConvElement = screen.getByText('First Chat').closest('[data-conversation-id]');
				expect(firstConvElement).toHaveAttribute('data-selected', 'true');
			});
		});

		it('should show conversations in order of most recent', async () => {
			await chatHistoryStore.createConversation('Oldest');
			await chatHistoryStore.createConversation('Middle');
			await chatHistoryStore.createConversation('Newest');

			render(ChatSidebar);

			await waitFor(() => {
				const conversations = screen.getAllByRole('button', { name: /select conversation/i });
				// Most recent should be first
				expect(conversations[0]).toHaveTextContent('Newest');
				expect(conversations[1]).toHaveTextContent('Middle');
				expect(conversations[2]).toHaveTextContent('Oldest');
			});
		});
	});

	describe('Selecting conversations', () => {
		it('should select a conversation when clicked', async () => {
			const conv1 = await chatHistoryStore.createConversation('First Chat');
			const conv2 = await chatHistoryStore.createConversation('Second Chat');

			render(ChatSidebar);

			// Click on first conversation (conv2 is current by default)
			const firstConv = screen.getByText('First Chat');
			await fireEvent.click(firstConv);

			const state = get(chatHistoryStore);
			expect(state.currentConversationId).toBe(conv1.id);
		});
	});

	describe('Deleting conversations', () => {
		it('should show delete button on hover/focus', async () => {
			await chatHistoryStore.createConversation('Test Chat');

			render(ChatSidebar);

			await waitFor(() => {
				// There should be a delete button (might be hidden with CSS)
				const deleteButton = screen.getByRole('button', { name: /delete conversation/i });
				expect(deleteButton).toBeInTheDocument();
			});
		});

		it('should delete conversation when delete button is clicked', async () => {
			await chatHistoryStore.createConversation('Chat to Delete');

			render(ChatSidebar);

			await waitFor(async () => {
				// Get the delete button specifically (not the parent conversation button)
				const deleteButton = screen.getByRole('button', { name: /delete conversation/i });
				await fireEvent.click(deleteButton);
			});

			await waitFor(() => {
				const state = get(chatHistoryStore);
				expect(state.conversations).toHaveLength(0);
			});
		});
	});
});
