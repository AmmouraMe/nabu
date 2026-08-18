/**
 * Tests for AI Text Quick Generate Component
 * TDD: Tests written first, then implementation
 *
 * Provides a streamlined modal for AI-powered text generation
 * directly from the Brand Text tab — without manual entry steps.
 * Users pick a category + type, optionally add a custom prompt,
 * and AI generates + saves the text in one flow.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tick } from 'svelte';
import AITextQuickGenerate from '$lib/components/AITextQuickGenerate.svelte';

/** Flush all microtasks and allow Svelte to re-render */
async function flushAll() {
	await new Promise((r) => setTimeout(r, 10));
	await tick();
	await new Promise((r) => setTimeout(r, 10));
	await tick();
}

let mockFetch: typeof fetch;

function createMockFetch() {
	return vi.fn((url: string | URL | Request, options?: RequestInit): Promise<Response> => {
		const urlStr = typeof url === 'string' ? url : url.toString();
		const method = (options?.method || 'GET').toUpperCase();

		if (urlStr.includes('/api/brand/assets/generate-text') && method !== 'POST') {
			return Promise.resolve(
				new Response(
					JSON.stringify({
						presets: [
							{ key: 'tagline', label: 'Tagline', promptTemplate: 'Write a tagline' },
							{ key: 'slogan', label: 'Slogan', promptTemplate: 'Write a slogan' }
						]
					}),
					{ status: 200 }
				)
			);
		}
		if (urlStr.includes('/api/brand/assets/generate-text') && method === 'POST') {
			return Promise.resolve(
				new Response(
					JSON.stringify({ text: 'AI generated tagline', model: 'gpt-4o-mini', tokensUsed: 42 }),
					{ status: 200 }
				)
			);
		}
		if (urlStr.includes('/api/brand/assets/texts') && method === 'POST') {
			return Promise.resolve(
				new Response(JSON.stringify({ text: { id: 'text-1' } }), { status: 200 })
			);
		}
		return Promise.resolve(new Response('{}', { status: 200 }));
	}) as unknown as typeof fetch;
}

describe('AITextQuickGenerate', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFetch = createMockFetch() as typeof fetch;
	});

	/** Helper: render with mock fetch and wait for presets to load */
	async function renderAndWaitForPresets(extraProps?: Record<string, unknown>) {
		const result = render(AITextQuickGenerate, {
			props: { brandProfileId: 'brand-1', fetchFn: mockFetch, ...extraProps }
		});
		await flushAll();
		return result;
	}

	// ─── Rendering ──────────────────────────────────────────────

	it('should render the modal with title', async () => {
		await renderAndWaitForPresets();
		expect(screen.getByText(/AI Generate Text/)).toBeTruthy();
	});

	it('should show category selector with all 6 categories', async () => {
		await renderAndWaitForPresets();
		expect(screen.getByText('Names')).toBeTruthy();
		expect(screen.getByText('Messaging')).toBeTruthy();
		expect(screen.getByText('Descriptions')).toBeTruthy();
		expect(screen.getByText('Legal')).toBeTruthy();
		expect(screen.getByText('Social')).toBeTruthy();
		expect(screen.getByText('Voice')).toBeTruthy();
	});

	it('should load presets from API on mount', async () => {
		await renderAndWaitForPresets();
		expect(mockFetch).toHaveBeenCalledWith(
			expect.stringContaining('/api/brand/assets/generate-text')
		);
	});

	it('should have a close button that dispatches close event', async () => {
		const { component } = await renderAndWaitForPresets();

		const closeHandler = vi.fn();
		component.$on('close', closeHandler);

		const closeBtn = screen.getByLabelText('Close');
		await fireEvent.click(closeBtn);
		expect(closeHandler).toHaveBeenCalled();
	});

	// ─── Category Selection ─────────────────────────────────────

	it('should load presets when a category chip is clicked', async () => {
		await renderAndWaitForPresets();

		const descriptionsBtn = screen.getByText('Descriptions');
		await fireEvent.click(descriptionsBtn);
		await flushAll();

		expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('category=descriptions'));
	});

	// ─── AI Generation ──────────────────────────────────────────

	it('should show generate button for each preset', async () => {
		await renderAndWaitForPresets();

		// After presets load, should show preset cards with generate buttons
		const generateBtns = screen.getAllByRole('button', { name: /generate/i });
		expect(generateBtns.length).toBeGreaterThan(0);
	});

	it('should call AI generation API when generate button is clicked', async () => {
		await renderAndWaitForPresets();

		const generateBtns = screen.getAllByRole('button', { name: /generate/i });
		await fireEvent.click(generateBtns[0]);
		await flushAll();

		expect(mockFetch).toHaveBeenCalledWith(
			'/api/brand/assets/generate-text',
			expect.objectContaining({ method: 'POST' })
		);
	});

	it('should show generated text result after successful generation', async () => {
		await renderAndWaitForPresets();

		const generateBtns = screen.getAllByRole('button', { name: /generate/i });
		await fireEvent.click(generateBtns[0]);
		await flushAll();

		expect(screen.getByDisplayValue('AI generated tagline')).toBeTruthy();
	});

	it('should allow saving generated text as a brand text asset', async () => {
		await renderAndWaitForPresets();

		const generateBtns = screen.getAllByRole('button', { name: /generate/i });
		await fireEvent.click(generateBtns[0]);
		await flushAll();

		const saveBtn = screen.getByRole('button', { name: /save/i });
		await fireEvent.click(saveBtn);
		await flushAll();

		expect(mockFetch).toHaveBeenCalledWith(
			'/api/brand/assets/texts',
			expect.objectContaining({ method: 'POST' })
		);
	});

	it('should dispatch saved event after successfully saving', async () => {
		const { component } = await renderAndWaitForPresets();

		const savedHandler = vi.fn();
		component.$on('saved', savedHandler);

		const generateBtns = screen.getAllByRole('button', { name: /generate/i });
		await fireEvent.click(generateBtns[0]);
		await flushAll();

		const saveBtn = screen.getByRole('button', { name: /save/i });
		await fireEvent.click(saveBtn);
		await flushAll();

		expect(savedHandler).toHaveBeenCalled();
	});

	// ─── Custom Prompt ──────────────────────────────────────────

	it('should allow entering a custom prompt', async () => {
		await renderAndWaitForPresets();

		const customPromptToggle = screen.getByText(/custom prompt/i);
		await fireEvent.click(customPromptToggle);

		const promptInput = screen.getByPlaceholderText(/describe what you want/i);
		expect(promptInput).toBeTruthy();
	});

	// ─── Error Handling ─────────────────────────────────────────

	it('should show error message when generation fails', async () => {
		// Override mockFetch to fail on POST
		const errorFetch = vi.fn(
			(url: string | URL | Request, options?: RequestInit): Promise<Response> => {
				const urlStr = typeof url === 'string' ? url : url.toString();
				const method = (options?.method || 'GET').toUpperCase();

				if (urlStr.includes('/api/brand/assets/generate-text') && method === 'POST') {
					return Promise.resolve(
						new Response(JSON.stringify({ message: 'No OpenAI API key configured' }), {
							status: 400
						})
					);
				}
				return Promise.resolve(
					new Response(
						JSON.stringify({
							presets: [{ key: 'tagline', label: 'Tagline', promptTemplate: 'Write a tagline' }]
						}),
						{ status: 200 }
					)
				);
			}
		) as unknown as typeof fetch;

		const result = render(AITextQuickGenerate, {
			props: { brandProfileId: 'brand-1', fetchFn: errorFetch }
		});
		await flushAll();

		const generateBtns = screen.getAllByRole('button', { name: /generate/i });
		await fireEvent.click(generateBtns[0]);
		await flushAll();

		expect(screen.getByText(/no openai api key/i)).toBeTruthy();
	});

	// ─── Regenerate ─────────────────────────────────────────────

	it('should allow regenerating text after initial generation', async () => {
		await renderAndWaitForPresets();

		const generateBtns = screen.getAllByRole('button', { name: /generate/i });
		await fireEvent.click(generateBtns[0]);
		await flushAll();

		// Should have a regenerate button
		const regenBtn = screen.getByRole('button', { name: /regenerate/i });
		expect(regenBtn).toBeTruthy();
	});

	// ─── Edit Before Save ───────────────────────────────────────

	it('should allow editing generated text before saving', async () => {
		await renderAndWaitForPresets();

		const generateBtns = screen.getAllByRole('button', { name: /generate/i });
		await fireEvent.click(generateBtns[0]);
		await flushAll();

		// The generated text should be editable (in a textarea)
		const textarea = screen.getByDisplayValue('AI generated tagline');
		expect(textarea).toBeTruthy();

		await fireEvent.input(textarea, { target: { value: 'Edited tagline' } });
		expect((textarea as HTMLTextAreaElement).value).toBe('Edited tagline');
	});

	// ─── Profile Field Auto-Set ─────────────────────────────────

	describe('profile field auto-set on save', () => {
		/** Creates a mock fetch where field-status returns a given response */
		function createFieldStatusMockFetch(fieldStatus: {
			matchesField: boolean;
			fieldName?: string;
			fieldLabel?: string;
			currentValue?: string | null;
		}) {
			return vi.fn((url: string | URL | Request, options?: RequestInit): Promise<Response> => {
				const urlStr = typeof url === 'string' ? url : url.toString();
				const method = (options?.method || 'GET').toUpperCase();

				if (urlStr.includes('/api/brand/assets/texts/field-status')) {
					return Promise.resolve(new Response(JSON.stringify(fieldStatus), { status: 200 }));
				}
				if (urlStr.includes('/api/brand/assets/generate-text') && method !== 'POST') {
					return Promise.resolve(
						new Response(
							JSON.stringify({
								presets: [
									{ key: 'tagline', label: 'Tagline', promptTemplate: 'Write a tagline' },
									{ key: 'slogan', label: 'Slogan', promptTemplate: 'Write a slogan' }
								]
							}),
							{ status: 200 }
						)
					);
				}
				if (urlStr.includes('/api/brand/assets/generate-text') && method === 'POST') {
					return Promise.resolve(
						new Response(
							JSON.stringify({
								text: 'AI generated tagline',
								model: 'gpt-4o-mini',
								tokensUsed: 42
							}),
							{ status: 200 }
						)
					);
				}
				if (urlStr.includes('/api/brand/assets/texts') && method === 'POST') {
					return Promise.resolve(
						new Response(JSON.stringify({ text: { id: 'text-1' } }), { status: 200 })
					);
				}
				return Promise.resolve(new Response('{}', { status: 200 }));
			}) as unknown as typeof fetch;
		}

		it('should check field status after generating text', async () => {
			const statusFetch = createFieldStatusMockFetch({
				matchesField: true,
				fieldName: 'tagline',
				fieldLabel: 'Tagline',
				currentValue: null
			});

			const result = render(AITextQuickGenerate, {
				props: { brandProfileId: 'brand-1', fetchFn: statusFetch }
			});
			await flushAll();

			const generateBtns = screen.getAllByRole('button', { name: /generate/i });
			await fireEvent.click(generateBtns[0]);
			await flushAll();

			// Should have called field-status API
			expect(statusFetch).toHaveBeenCalledWith(
				expect.stringContaining('/api/brand/assets/texts/field-status')
			);
		});

		it('should show auto-set notice when profile field is empty', async () => {
			const statusFetch = createFieldStatusMockFetch({
				matchesField: true,
				fieldName: 'tagline',
				fieldLabel: 'Tagline',
				currentValue: null
			});

			const { container } = render(AITextQuickGenerate, {
				props: { brandProfileId: 'brand-1', fetchFn: statusFetch }
			});
			await flushAll();

			const generateBtns = screen.getAllByRole('button', { name: /generate/i });
			await fireEvent.click(generateBtns[0]);
			await flushAll();
			await flushAll();

			// Should show notice that it will auto-set the field
			await waitFor(() => {
				const notice = container.querySelector('.field-notice.auto-set');
				expect(notice).toBeTruthy();
				expect(notice!.textContent).toMatch(/will also set.*tagline/i);
			});
		});

		it('should show toggle when profile field already has a value', async () => {
			const statusFetch = createFieldStatusMockFetch({
				matchesField: true,
				fieldName: 'tagline',
				fieldLabel: 'Tagline',
				currentValue: 'Existing tagline value'
			});

			render(AITextQuickGenerate, {
				props: { brandProfileId: 'brand-1', fetchFn: statusFetch }
			});
			await flushAll();

			const generateBtns = screen.getAllByRole('button', { name: /generate/i });
			await fireEvent.click(generateBtns[0]);
			await flushAll();
			await flushAll(); // Extra flush for chained field-status fetch

			// Should show a toggle option (not auto-set notice)
			const toggle = screen.getByRole('checkbox', { name: /update.*tagline/i });
			expect(toggle).toBeTruthy();
			// Default should be unchecked
			expect((toggle as HTMLInputElement).checked).toBe(false);
		});

		it('should not show any field notice when text does not map to a profile field', async () => {
			const statusFetch = createFieldStatusMockFetch({
				matchesField: false
			});

			const { container } = render(AITextQuickGenerate, {
				props: { brandProfileId: 'brand-1', fetchFn: statusFetch }
			});
			await flushAll();

			const generateBtns = screen.getAllByRole('button', { name: /generate/i });
			await fireEvent.click(generateBtns[0]);
			await flushAll();
			await flushAll(); // Extra flush for chained field-status fetch

			// Should not show any field-related UI
			expect(container.querySelector('.field-notice')).toBeNull();
			expect(container.querySelector('.field-toggle')).toBeNull();
		});

		it('should send setAsProfileField=true when saving with empty field', async () => {
			const statusFetch = createFieldStatusMockFetch({
				matchesField: true,
				fieldName: 'tagline',
				fieldLabel: 'Tagline',
				currentValue: null
			});

			render(AITextQuickGenerate, {
				props: { brandProfileId: 'brand-1', fetchFn: statusFetch }
			});
			await flushAll();

			const generateBtns = screen.getAllByRole('button', { name: /generate/i });
			await fireEvent.click(generateBtns[0]);
			await flushAll();
			await flushAll(); // Extra flush for chained field-status fetch

			const saveBtn = screen.getByRole('button', { name: /save/i });
			await fireEvent.click(saveBtn);
			await flushAll();

			// Find the POST to /api/brand/assets/texts
			const textPostCall = vi
				.mocked(statusFetch)
				.mock.calls.find(([url, opts]: [string | URL | Request, RequestInit?]) => {
					const u = typeof url === 'string' ? url : url.toString();
					return (
						u.includes('/api/brand/assets/texts') &&
						!u.includes('field-status') &&
						opts?.method === 'POST'
					);
				});
			expect(textPostCall).toBeDefined();
			const body = JSON.parse(textPostCall![1]!.body as string);
			expect(body.setAsProfileField).toBe(true);
			expect(body.profileFieldName).toBe('tagline');
		});

		it('should send setAsProfileField=false when toggle is off for filled field', async () => {
			const statusFetch = createFieldStatusMockFetch({
				matchesField: true,
				fieldName: 'tagline',
				fieldLabel: 'Tagline',
				currentValue: 'Existing tagline'
			});

			render(AITextQuickGenerate, {
				props: { brandProfileId: 'brand-1', fetchFn: statusFetch }
			});
			await flushAll();

			const generateBtns = screen.getAllByRole('button', { name: /generate/i });
			await fireEvent.click(generateBtns[0]);
			await flushAll();
			await flushAll(); // Extra flush for chained field-status fetch

			// Don't toggle - leave default (off)
			const saveBtn = screen.getByRole('button', { name: /save/i });
			await fireEvent.click(saveBtn);
			await flushAll();

			const textPostCall = vi
				.mocked(statusFetch)
				.mock.calls.find(([url, opts]: [string | URL | Request, RequestInit?]) => {
					const u = typeof url === 'string' ? url : url.toString();
					return (
						u.includes('/api/brand/assets/texts') &&
						!u.includes('field-status') &&
						opts?.method === 'POST'
					);
				});
			expect(textPostCall).toBeDefined();
			const body = JSON.parse(textPostCall![1]!.body as string);
			expect(body.setAsProfileField).toBeFalsy();
		});

		it('should send setAsProfileField=true when toggle is turned on for filled field', async () => {
			const statusFetch = createFieldStatusMockFetch({
				matchesField: true,
				fieldName: 'tagline',
				fieldLabel: 'Tagline',
				currentValue: 'Existing tagline'
			});

			render(AITextQuickGenerate, {
				props: { brandProfileId: 'brand-1', fetchFn: statusFetch }
			});
			await flushAll();

			const generateBtns = screen.getAllByRole('button', { name: /generate/i });
			await fireEvent.click(generateBtns[0]);
			await flushAll();
			await flushAll(); // Extra flush for chained field-status fetch

			// Toggle ON
			const toggle = screen.getByRole('checkbox', { name: /update.*tagline/i });
			await fireEvent.click(toggle);
			await flushAll();

			const saveBtn = screen.getByRole('button', { name: /save/i });
			await fireEvent.click(saveBtn);
			await flushAll();

			const textPostCall = vi
				.mocked(statusFetch)
				.mock.calls.find(([url, opts]: [string | URL | Request, RequestInit?]) => {
					const u = typeof url === 'string' ? url : url.toString();
					return (
						u.includes('/api/brand/assets/texts') &&
						!u.includes('field-status') &&
						opts?.method === 'POST'
					);
				});
			expect(textPostCall).toBeDefined();
			const body = JSON.parse(textPostCall![1]!.body as string);
			expect(body.setAsProfileField).toBe(true);
			expect(body.profileFieldName).toBe('tagline');
		});
	});
});
