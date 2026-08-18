/**
 * Tests for GoogleFontPicker component
 * TDD: Written before implementation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import GoogleFontPicker from '$lib/components/GoogleFontPicker.svelte';

const mockFontsResponse = {
	items: [
		{ family: 'Roboto', category: 'sans-serif', variants: ['regular', '700'] },
		{ family: 'Open Sans', category: 'sans-serif', variants: ['regular', '700'] },
		{ family: 'Lato', category: 'sans-serif', variants: ['regular', '700'] },
		{ family: 'Montserrat', category: 'sans-serif', variants: ['regular', '700'] },
		{ family: 'Playfair Display', category: 'serif', variants: ['regular', '700'] },
		{ family: 'Merriweather', category: 'serif', variants: ['regular', '700'] },
		{ family: 'Lora', category: 'serif', variants: ['regular', '700'] },
		{ family: 'Poppins', category: 'sans-serif', variants: ['regular', '700'] },
		{ family: 'Oswald', category: 'sans-serif', variants: ['regular', '700'] },
		{ family: 'Raleway', category: 'sans-serif', variants: ['regular', '700'] },
		{ family: 'Dancing Script', category: 'handwriting', variants: ['regular', '700'] },
		{ family: 'Fira Code', category: 'monospace', variants: ['regular', '700'] }
	]
};

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	mockFetch = vi.fn().mockResolvedValue({
		ok: true,
		json: () => Promise.resolve(mockFontsResponse)
	});
	vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	cleanup();
});

/** Flush all pending microtask/promise queues */
async function flushAll() {
	await new Promise((r) => setTimeout(r, 10));
	await tick();
	await new Promise((r) => setTimeout(r, 10));
	await tick();
}

/** Helper to render and wait for fonts to load */
async function renderAndLoad(props: {
	field: 'typographyLogo' | 'typographyHeading' | 'typographyBody';
	currentFont?: string;
}) {
	const result = render(GoogleFontPicker, { props });
	await flushAll();
	return result;
}

describe('GoogleFontPicker', () => {
	// ─── Rendering ────────────────────────────────────

	it('should render with a search input', async () => {
		const { container } = await renderAndLoad({ field: 'typographyHeading' });
		const searchInput = container.querySelector(
			'input[type="search"], input[placeholder*="Search"]'
		);
		expect(searchInput).toBeTruthy();
	});

	it('should show a title indicating the field being edited', async () => {
		const { getByText } = await renderAndLoad({ field: 'typographyHeading' });
		expect(getByText(/heading font/i)).toBeTruthy();
	});

	it('should show "Body Font" title for body field', async () => {
		const { getByText } = await renderAndLoad({ field: 'typographyBody' });
		expect(getByText(/body font/i)).toBeTruthy();
	});

	it('should fetch Google Fonts on mount', async () => {
		await renderAndLoad({ field: 'typographyHeading' });
		expect(mockFetch).toHaveBeenCalledWith('/api/google-fonts');
	});

	it('should display font list after loading', async () => {
		const { getByText } = await renderAndLoad({ field: 'typographyHeading' });
		expect(getByText('Roboto')).toBeTruthy();
		expect(getByText('Open Sans')).toBeTruthy();
	});

	// ─── Search / Filter ──────────────────────────────

	it('should filter fonts based on search input', async () => {
		const { container, getByText, queryByText } = await renderAndLoad({
			field: 'typographyHeading'
		});
		expect(getByText('Roboto')).toBeTruthy();

		const searchInput = container.querySelector(
			'input[type="search"], input[placeholder*="Search"]'
		) as HTMLInputElement;
		await fireEvent.input(searchInput, { target: { value: 'Play' } });

		expect(getByText('Playfair Display')).toBeTruthy();
		expect(queryByText('Roboto')).toBeFalsy();
	});

	it('should show category filter buttons', async () => {
		const { getByText } = await renderAndLoad({ field: 'typographyHeading' });
		expect(getByText('All')).toBeTruthy();
		expect(getByText('Sans Serif')).toBeTruthy();
		expect(getByText('Serif')).toBeTruthy();
	});

	it('should filter by category when a category button is clicked', async () => {
		const { getByText, queryByText } = await renderAndLoad({ field: 'typographyHeading' });
		expect(getByText('Roboto')).toBeTruthy();

		await fireEvent.click(getByText('Serif'));

		expect(getByText('Playfair Display')).toBeTruthy();
		expect(getByText('Merriweather')).toBeTruthy();
		expect(queryByText('Roboto')).toBeFalsy();
	});

	// ─── Selection ────────────────────────────────────

	it('should dispatch select event when a font is clicked', async () => {
		const handler = vi.fn();
		const { component, getByText } = await renderAndLoad({ field: 'typographyHeading' });
		component.$on('select', handler);

		const robotoButton = getByText('Roboto').closest('button');
		await fireEvent.click(robotoButton!);

		expect(handler).toHaveBeenCalled();
		expect(handler.mock.calls[0][0].detail).toEqual({
			field: 'typographyHeading',
			font: 'Roboto'
		});
	});

	it('should dispatch close event when close button is clicked', async () => {
		const handler = vi.fn();
		const { component, getByLabelText } = await renderAndLoad({ field: 'typographyHeading' });
		component.$on('close', handler);

		await fireEvent.click(getByLabelText('Close font picker'));
		expect(handler).toHaveBeenCalled();
	});

	it('should highlight the currently selected font', async () => {
		const { container } = await renderAndLoad({
			field: 'typographyHeading',
			currentFont: 'Roboto'
		});
		const activeItem = container.querySelector(
			'.font-item.active, .font-item[aria-pressed="true"]'
		);
		expect(activeItem).toBeTruthy();
		expect(activeItem?.textContent).toContain('Roboto');
	});

	// ─── Font Preview ─────────────────────────────────

	it('should render font items with preview text styled in the font', async () => {
		const { container } = await renderAndLoad({ field: 'typographyHeading' });
		const fontItems = container.querySelectorAll('.font-item');
		expect(fontItems.length).toBeGreaterThan(0);
	});

	// ─── Error Handling ───────────────────────────────

	it('should show error message when fetch fails', async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			statusText: 'Internal Server Error'
		});

		const result = render(GoogleFontPicker, {
			props: { field: 'typographyHeading', currentFont: undefined }
		});
		await flushAll();

		expect(result.getByText(/failed to load fonts/i)).toBeTruthy();
	});

	it('should show loading state while fonts are being fetched', () => {
		mockFetch.mockReturnValue(new Promise(() => {}));

		const { getByText } = render(GoogleFontPicker, {
			props: { field: 'typographyHeading', currentFont: undefined }
		});

		expect(getByText(/loading/i)).toBeTruthy();
	});

	// ─── No Results ───────────────────────────────────

	it('should show "no fonts found" message when search has no matches', async () => {
		const { container, getByText } = await renderAndLoad({ field: 'typographyHeading' });
		expect(getByText('Roboto')).toBeTruthy();

		const searchInput = container.querySelector(
			'input[type="search"], input[placeholder*="Search"]'
		) as HTMLInputElement;
		await fireEvent.input(searchInput, { target: { value: 'xyznonexistent' } });

		expect(getByText(/no fonts found/i)).toBeTruthy();
	});
});
