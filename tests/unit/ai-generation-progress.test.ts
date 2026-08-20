/**
 * Tests for AI generation progress placeholder in MediaGallery
 *
 * When a user clicks "Generate", the modal should close immediately
 * and a placeholder card should appear in the gallery showing progress.
 * Once generation completes, the placeholder is replaced with the real asset.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';

// ─── Mocks ───────────────────────────────────────────────────────

// Mock fetch globally
let mockFetch: ReturnType<typeof vi.fn>;

async function flushAll() {
	await new Promise((r) => setTimeout(r, 10));
	await tick();
	await new Promise((r) => setTimeout(r, 10));
	await tick();
}

describe('AI Generation Progress Placeholder', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers({ shouldAdvanceTime: true });
		mockFetch = vi.fn();
		vi.stubGlobal('fetch', mockFetch);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// ─── AIGenerateModal behavior ──────────────────────────────────

	describe('AIGenerateModal - close on generate', () => {
		it('should close the modal and dispatch generate event immediately without waiting for API', async () => {
			// The modal should dispatch the event and close immediately.
			// It should NOT make any API calls — the parent handles that.
			vi.useRealTimers();

			const { default: AIGenerateModal } = await import('$lib/components/AIGenerateModal.svelte');
			const { component } = render(AIGenerateModal, {
				props: {
					brandProfileId: 'bp-1',
					generationType: 'image',
					open: true
				}
			});

			// Listen for events
			const generateEvents: any[] = [];
			component.$on('generate', (e: any) => generateEvents.push(e.detail));

			// Type a prompt and click generate
			const textarea = screen.getByLabelText(/Describe what you want/i);
			await fireEvent.input(textarea, { target: { value: 'A cool logo' } });
			await flushAll();

			const generateBtn = screen.getByRole('button', { name: /Generate Image/i });
			await fireEvent.click(generateBtn);
			await flushAll();

			// The generate event should have been dispatched immediately
			expect(generateEvents.length).toBe(1);
			expect(generateEvents[0]).toHaveProperty('type', 'image');
			expect(generateEvents[0]).toHaveProperty('prompt', 'A cool logo');
			expect(generateEvents[0]).toHaveProperty('brandProfileId', 'bp-1');
			// No API call should have been made by the modal
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('should dispatch form data including name, category, and options', async () => {
			vi.useRealTimers();

			const { default: AIGenerateModal } = await import('$lib/components/AIGenerateModal.svelte');
			const { component } = render(AIGenerateModal, {
				props: {
					brandProfileId: 'bp-1',
					generationType: 'image',
					open: true
				}
			});

			const generateEvents: any[] = [];
			component.$on('generate', (e: any) => generateEvents.push(e.detail));

			const textarea = screen.getByLabelText(/Describe what you want/i);
			await fireEvent.input(textarea, { target: { value: 'brand logo' } });
			await flushAll();

			const generateBtn = screen.getByRole('button', { name: /Generate Image/i });
			await fireEvent.click(generateBtn);
			await flushAll();

			expect(generateEvents.length).toBe(1);
			expect(generateEvents[0]).toHaveProperty('name');
			expect(generateEvents[0]).toHaveProperty('category');
			expect(generateEvents[0]).toHaveProperty('options');
			expect(generateEvents[0].options).toHaveProperty('model');
		});
	});

	// ─── MediaGallery progress placeholder ─────────────────────────

	describe('MediaGallery - progress placeholders', () => {
		it('should show a placeholder card for in-progress generations', async () => {
			vi.useRealTimers();

			const { default: MediaGallery } = await import('$lib/components/MediaGallery.svelte');

			// Mock fetch for video models (loaded when modal opens for video)
			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ models: [] })
			});

			render(MediaGallery, {
				props: {
					brandProfileId: 'bp-1',
					mediaType: 'image',
					assets: [],
					loading: false,
					pendingGenerations: [
						{
							id: 'gen-1',
							name: 'AI Logo',
							category: 'logo',
							status: 'pending',
							type: 'image'
						}
					]
				}
			});

			await flushAll();

			// Should show a generating placeholder instead of empty state
			expect(screen.getByText('AI Logo')).toBeTruthy();
			expect(screen.getByText(/Generating/i)).toBeTruthy();
		});

		it('should show placeholder alongside existing assets', async () => {
			vi.useRealTimers();

			const { default: MediaGallery } = await import('$lib/components/MediaGallery.svelte');

			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ models: [] })
			});

			const existingAsset = {
				id: 'asset-1',
				brandProfileId: 'bp-1',
				mediaType: 'image' as const,
				category: 'logo',
				name: 'Existing Logo',
				sortOrder: 0,
				isPrimary: false,
				createdAt: '2025-01-01',
				updatedAt: '2025-01-01'
			};

			render(MediaGallery, {
				props: {
					brandProfileId: 'bp-1',
					mediaType: 'image',
					assets: [existingAsset],
					loading: false,
					pendingGenerations: [
						{
							id: 'gen-2',
							name: 'New AI Image',
							category: 'social',
							status: 'pending',
							type: 'image'
						}
					]
				}
			});

			await flushAll();

			// Both should appear
			expect(screen.getByText('Existing Logo')).toBeTruthy();
			expect(screen.getByText('New AI Image')).toBeTruthy();
		});

		it('should show a spinner animation on the placeholder', async () => {
			vi.useRealTimers();

			const { default: MediaGallery } = await import('$lib/components/MediaGallery.svelte');

			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ models: [] })
			});

			render(MediaGallery, {
				props: {
					brandProfileId: 'bp-1',
					mediaType: 'image',
					assets: [],
					loading: false,
					pendingGenerations: [
						{
							id: 'gen-3',
							name: 'Generating Image',
							category: 'logo',
							status: 'pending',
							type: 'image'
						}
					]
				}
			});

			await flushAll();

			// The placeholder card should have a spinner
			const spinners = document.querySelectorAll('.generation-spinner');
			expect(spinners.length).toBeGreaterThan(0);
		});
	});
});
