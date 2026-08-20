import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatAttachment, Message } from '$lib/stores/chatHistory';

/**
 * Tests for chat media attachments (images/videos in messages)
 * TDD: Tests written first for the media attachment feature
 */

describe('Chat Media Attachments', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	describe('ChatAttachment type and Message.attachments', () => {
		it('should support image attachments on Message interface', () => {
			const attachment: ChatAttachment = {
				id: 'att-1',
				type: 'image',
				name: 'photo.jpg',
				url: 'data:image/jpeg;base64,/9j/4AAQ...',
				mimeType: 'image/jpeg',
				size: 1024
			};

			expect(attachment.id).toBe('att-1');
			expect(attachment.type).toBe('image');
			expect(attachment.name).toBe('photo.jpg');
			expect(attachment.mimeType).toBe('image/jpeg');
		});

		it('should support video attachments', () => {
			const attachment: ChatAttachment = {
				id: 'att-2',
				type: 'video',
				name: 'clip.mp4',
				url: 'data:video/mp4;base64,AAAAIGZ...',
				mimeType: 'video/mp4',
				size: 5242880
			};

			expect(attachment.type).toBe('video');
			expect(attachment.mimeType).toBe('video/mp4');
		});

		it('should allow messages with attachments array', () => {
			const msg: Message = {
				id: 'msg-1',
				role: 'user',
				content: 'Check out this image',
				timestamp: new Date(),
				attachments: [
					{
						id: 'att-1',
						type: 'image',
						name: 'photo.jpg',
						url: 'data:image/jpeg;base64,/9j/4AAQ...',
						mimeType: 'image/jpeg'
					}
				]
			};

			expect(msg.attachments).toHaveLength(1);
			expect(msg.attachments![0].type).toBe('image');
		});

		it('should allow messages without attachments (backward compatible)', () => {
			const msg: Message = {
				id: 'msg-2',
				role: 'user',
				content: 'Hello',
				timestamp: new Date()
			};

			expect(msg.attachments).toBeUndefined();
		});
	});

	describe('formatMessagesForOpenAI with attachments', () => {
		it('should format text-only messages as before', async () => {
			const { formatMessagesForOpenAI } = await import('$lib/services/openai-chat');

			const messages = [
				{ id: '1', role: 'user', content: 'Hello', timestamp: new Date() },
				{ id: '2', role: 'assistant', content: 'Hi!', timestamp: new Date() }
			];

			const result = formatMessagesForOpenAI(messages);

			expect(result).toEqual([
				{ role: 'user', content: 'Hello' },
				{ role: 'assistant', content: 'Hi!' }
			]);
		});

		it('should format messages with image attachments as multi-modal content', async () => {
			const { formatMessagesForOpenAI } = await import('$lib/services/openai-chat');

			const messages = [
				{
					id: '1',
					role: 'user',
					content: 'What is in this image?',
					timestamp: new Date(),
					attachments: [
						{
							id: 'att-1',
							type: 'image' as const,
							name: 'photo.jpg',
							url: 'data:image/jpeg;base64,/9j/4AAQ',
							mimeType: 'image/jpeg'
						}
					]
				}
			];

			const result = formatMessagesForOpenAI(messages);

			expect(result).toEqual([
				{
					role: 'user',
					content: [
						{ type: 'text', text: 'What is in this image?' },
						{
							type: 'image_url',
							image_url: { url: 'data:image/jpeg;base64,/9j/4AAQ', detail: 'auto' }
						}
					]
				}
			]);
		});

		it('should handle multiple image attachments in a single message', async () => {
			const { formatMessagesForOpenAI } = await import('$lib/services/openai-chat');

			const messages = [
				{
					id: '1',
					role: 'user',
					content: 'Compare these images',
					timestamp: new Date(),
					attachments: [
						{
							id: 'att-1',
							type: 'image' as const,
							name: 'photo1.jpg',
							url: 'data:image/jpeg;base64,abc123',
							mimeType: 'image/jpeg'
						},
						{
							id: 'att-2',
							type: 'image' as const,
							name: 'photo2.png',
							url: 'data:image/png;base64,def456',
							mimeType: 'image/png'
						}
					]
				}
			];

			const result = formatMessagesForOpenAI(messages);

			expect(result).toEqual([
				{
					role: 'user',
					content: [
						{ type: 'text', text: 'Compare these images' },
						{
							type: 'image_url',
							image_url: { url: 'data:image/jpeg;base64,abc123', detail: 'auto' }
						},
						{
							type: 'image_url',
							image_url: { url: 'data:image/png;base64,def456', detail: 'auto' }
						}
					]
				}
			]);
		});

		it('should handle video attachments by including a note in the text', async () => {
			const { formatMessagesForOpenAI } = await import('$lib/services/openai-chat');

			const messages = [
				{
					id: '1',
					role: 'user',
					content: 'Check this out',
					timestamp: new Date(),
					attachments: [
						{
							id: 'att-1',
							type: 'video' as const,
							name: 'clip.mp4',
							url: 'data:video/mp4;base64,AAAA',
							mimeType: 'video/mp4'
						}
					]
				}
			];

			const result = formatMessagesForOpenAI(messages);

			// Video-only attachments produce a plain string with video note appended
			expect(result[0].role).toBe('user');
			const content = result[0].content as string;
			expect(content).toContain('Check this out');
			expect(content).toContain('clip.mp4');
		});

		it('should handle mixed image and video attachments', async () => {
			const { formatMessagesForOpenAI } = await import('$lib/services/openai-chat');

			const messages = [
				{
					id: '1',
					role: 'user',
					content: 'Look at these',
					timestamp: new Date(),
					attachments: [
						{
							id: 'att-1',
							type: 'image' as const,
							name: 'photo.jpg',
							url: 'data:image/jpeg;base64,abc',
							mimeType: 'image/jpeg'
						},
						{
							id: 'att-2',
							type: 'video' as const,
							name: 'clip.mp4',
							url: 'data:video/mp4;base64,xyz',
							mimeType: 'video/mp4'
						}
					]
				}
			];

			const result = formatMessagesForOpenAI(messages);

			// Should have multi-modal content with image and text note about video
			expect(result[0].role).toBe('user');
			expect(Array.isArray(result[0].content)).toBe(true);
			const content = result[0].content as unknown as any[];
			const textParts = content.filter((c: any) => c.type === 'text');
			const imageParts = content.filter((c: any) => c.type === 'image_url');
			expect(imageParts).toHaveLength(1);
			expect(textParts.length).toBeGreaterThanOrEqual(1);
		});

		it('should not modify assistant messages even if they somehow have attachments', async () => {
			const { formatMessagesForOpenAI } = await import('$lib/services/openai-chat');

			const messages = [
				{
					id: '1',
					role: 'user',
					content: 'Hello',
					timestamp: new Date()
				},
				{
					id: '2',
					role: 'assistant',
					content: 'Here is an image for you',
					timestamp: new Date()
				}
			];

			const result = formatMessagesForOpenAI(messages);

			expect(result).toEqual([
				{ role: 'user', content: 'Hello' },
				{ role: 'assistant', content: 'Here is an image for you' }
			]);
		});

		it('should handle empty attachments array as text-only message', async () => {
			const { formatMessagesForOpenAI } = await import('$lib/services/openai-chat');

			const messages = [
				{
					id: '1',
					role: 'user',
					content: 'Hello',
					timestamp: new Date(),
					attachments: []
				}
			];

			const result = formatMessagesForOpenAI(messages);

			expect(result).toEqual([{ role: 'user', content: 'Hello' }]);
		});
	});

	describe('chatHistoryStore addMessage with attachments', () => {
		it('should persist message with attachments', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						conversations: []
					})
			});
			globalThis.fetch = mockFetch;

			const { chatHistoryStore } = await import('$lib/stores/chatHistory');

			// Initialize and create a conversation
			await chatHistoryStore.initializeForUser('user-1');

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						id: 'conv-1',
						title: 'Test',
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					})
			});

			await chatHistoryStore.createConversation('Test');

			// Reset mock to track addMessage calls
			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ id: 'msg-1' })
			});

			const attachments = [
				{
					id: 'att-1',
					type: 'image' as const,
					name: 'photo.jpg',
					url: 'data:image/jpeg;base64,abc',
					mimeType: 'image/jpeg',
					size: 1024
				}
			];

			chatHistoryStore.addMessage('conv-1', {
				role: 'user',
				content: 'Check this image',
				attachments
			});

			// Verify the fetch was called with attachments in the body
			const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
			const requestBody = JSON.parse(lastCall[1].body);

			expect(requestBody.attachments).toBeDefined();
			expect(requestBody.attachments).toHaveLength(1);
			expect(requestBody.attachments[0].type).toBe('image');
			expect(requestBody.attachments[0].name).toBe('photo.jpg');
		});
	});

	describe('File validation utilities', () => {
		it('should validate accepted image types', async () => {
			const { isValidAttachmentType, ACCEPTED_IMAGE_TYPES, ACCEPTED_VIDEO_TYPES } = await import(
				'$lib/utils/attachments'
			);

			expect(isValidAttachmentType('image/jpeg')).toBe(true);
			expect(isValidAttachmentType('image/png')).toBe(true);
			expect(isValidAttachmentType('image/gif')).toBe(true);
			expect(isValidAttachmentType('image/webp')).toBe(true);
			expect(isValidAttachmentType('video/mp4')).toBe(true);
			expect(isValidAttachmentType('video/webm')).toBe(true);
			expect(isValidAttachmentType('application/pdf')).toBe(false);
			expect(isValidAttachmentType('text/plain')).toBe(false);

			expect(ACCEPTED_IMAGE_TYPES).toContain('image/jpeg');
			expect(ACCEPTED_IMAGE_TYPES).toContain('image/png');
			expect(ACCEPTED_VIDEO_TYPES).toContain('video/mp4');
		});

		it('should validate file size limits', async () => {
			const { isValidAttachmentSize, MAX_IMAGE_SIZE, MAX_VIDEO_SIZE } = await import(
				'$lib/utils/attachments'
			);

			// Images: max 20MB
			expect(isValidAttachmentSize(1024, 'image')).toBe(true);
			expect(isValidAttachmentSize(20 * 1024 * 1024, 'image')).toBe(true);
			expect(isValidAttachmentSize(21 * 1024 * 1024, 'image')).toBe(false);

			// Videos: max 100MB
			expect(isValidAttachmentSize(5 * 1024 * 1024, 'video')).toBe(true);
			expect(isValidAttachmentSize(100 * 1024 * 1024, 'video')).toBe(true);
			expect(isValidAttachmentSize(101 * 1024 * 1024, 'video')).toBe(false);

			expect(MAX_IMAGE_SIZE).toBe(20 * 1024 * 1024);
			expect(MAX_VIDEO_SIZE).toBe(100 * 1024 * 1024);
		});

		it('should get attachment type from mime type', async () => {
			const { getAttachmentType } = await import('$lib/utils/attachments');

			expect(getAttachmentType('image/jpeg')).toBe('image');
			expect(getAttachmentType('image/png')).toBe('image');
			expect(getAttachmentType('video/mp4')).toBe('video');
			expect(getAttachmentType('video/webm')).toBe('video');
			expect(getAttachmentType('application/pdf')).toBeNull();
		});

		it('should convert file to data URL', async () => {
			const { fileToDataUrl } = await import('$lib/utils/attachments');

			// Create a mock file
			const blob = new Blob(['test content'], { type: 'image/jpeg' });
			const file = new File([blob], 'test.jpg', { type: 'image/jpeg' });

			const dataUrl = await fileToDataUrl(file);

			expect(dataUrl).toMatch(/^data:image\/jpeg;base64,/);
		});

		it('should format file size for display', async () => {
			const { formatFileSize } = await import('$lib/utils/attachments');

			expect(formatFileSize(500)).toBe('500 B');
			expect(formatFileSize(1024)).toBe('1.0 KB');
			expect(formatFileSize(1536)).toBe('1.5 KB');
			expect(formatFileSize(1048576)).toBe('1.0 MB');
			expect(formatFileSize(10485760)).toBe('10.0 MB');
		});
	});
});
