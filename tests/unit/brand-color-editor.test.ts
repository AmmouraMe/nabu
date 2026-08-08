/**
 * Tests for BrandColorEditor component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import BrandColorEditor from '$lib/components/BrandColorEditor.svelte';

// Mock canvas context
const mockCtx = {
	clearRect: vi.fn(),
	beginPath: vi.fn(),
	moveTo: vi.fn(),
	lineTo: vi.fn(),
	arc: vi.fn(),
	rect: vi.fn(),
	closePath: vi.fn(),
	fill: vi.fn(),
	stroke: vi.fn(),
	fillRect: vi.fn(),
	fillText: vi.fn(),
	save: vi.fn(),
	restore: vi.fn(),
	translate: vi.fn(),
	rotate: vi.fn(),
	setLineDash: vi.fn(),
	createRadialGradient: vi.fn(() => ({
		addColorStop: vi.fn()
	})),
	createLinearGradient: vi.fn(() => ({
		addColorStop: vi.fn()
	})),
	createImageData: vi.fn((w: number, h: number) => ({
		data: new Uint8ClampedArray(w * h * 4),
		width: w,
		height: h
	})),
	putImageData: vi.fn(),
	getImageData: vi.fn((x: number, y: number, w: number, h: number) => ({
		data: new Uint8ClampedArray(w * h * 4),
		width: w,
		height: h
	})),
	drawImage: vi.fn(),
	clip: vi.fn(),
	fillStyle: '',
	strokeStyle: '',
	lineWidth: 0,
	font: '',
	textAlign: '',
	textBaseline: '',
	scale: vi.fn(),
	globalAlpha: 1,
	globalCompositeOperation: 'source-over'
};

beforeEach(() => {
	vi.restoreAllMocks();
	HTMLCanvasElement.prototype.getContext = vi.fn(
		() => mockCtx
	) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

describe('BrandColorEditor', () => {
	// ─── Structure ────────────────────────────────────

	it('should render the BRAND COLORS section header', () => {
		const { getByText } = render(BrandColorEditor, {
			props: { colors: {} }
		});

		expect(getByText('BRAND COLORS')).toBeTruthy();
	});

	it('should render the LOGO section label', () => {
		const { getByText } = render(BrandColorEditor, {
			props: { colors: {} }
		});
		expect(getByText('LOGO')).toBeTruthy();
	});

	it('should render the TYPOGRAPHY section', () => {
		const { getByText } = render(BrandColorEditor, {
			props: { colors: {} }
		});
		expect(getByText('TYPOGRAPHY')).toBeTruthy();
	});

	it('should render core brand color labels', () => {
		const { getByText } = render(BrandColorEditor, {
			props: { colors: {} }
		});

		expect(getByText('Brand Color 1')).toBeTruthy();
		expect(getByText('Brand Color 2')).toBeTruthy();
		expect(getByText('Brand Color 3')).toBeTruthy();
	});

	it('should show Add Brand Color button when fewer than 5 colors', () => {
		const { getByText } = render(BrandColorEditor, {
			props: { colors: {} }
		});

		expect(getByText('Add Brand Color')).toBeTruthy();
	});

	// ─── Color values ────────────────────────────────

	it('should render initialized color values', () => {
		const { container } = render(BrandColorEditor, {
			props: {
				colors: {
					primaryColor: '#ff0000',
					secondaryColor: '#00ff00'
				}
			}
		});

		const hexInputs = container.querySelectorAll('.hex-input') as NodeListOf<HTMLInputElement>;
		const values = Array.from(hexInputs).map((i) => i.value);
		expect(values).toContain('#ff0000');
		expect(values).toContain('#00ff00');
	});

	it('should render the SV picker canvas', () => {
		const { container } = render(BrandColorEditor, {
			props: { colors: {} }
		});

		const canvas = container.querySelector('canvas.sv-picker');
		expect(canvas).toBeTruthy();
	});

	it('should render the hue strip canvas', () => {
		const { container } = render(BrandColorEditor, {
			props: { colors: {} }
		});

		const canvas = container.querySelector('canvas.hue-strip');
		expect(canvas).toBeTruthy();
	});

	// ─── Logo ─────────────────────────────────────────

	it('should show logo placeholder when no logoUrl', () => {
		const { getByText } = render(BrandColorEditor, {
			props: { colors: {}, logoConcept: 'Abstract watermark logo' }
		});

		expect(getByText('Icon')).toBeTruthy();
		expect(getByText('Horizontal')).toBeTruthy();
		expect(getByText('Vertical')).toBeTruthy();
		expect(getByText('Abstract watermark logo')).toBeTruthy();
	});

	it('should show logo image when logoUrl is provided', () => {
		const { container } = render(BrandColorEditor, {
			props: { colors: {}, logoUrl: 'https://example.com/logo.png' }
		});

		const img = container.querySelector('.logo-image') as HTMLImageElement;
		expect(img).toBeTruthy();
		expect(img.src).toContain('logo.png');
	});

	// ─── Typography ───────────────────────────────────

	it('should show typography fields', () => {
		const { getByText } = render(BrandColorEditor, {
			props: {
				colors: {},
				typographyHeading: 'Inter',
				typographyBody: 'Source Sans Pro'
			}
		});

		expect(getByText('Inter')).toBeTruthy();
		expect(getByText('Source Sans Pro')).toBeTruthy();
	});

	// ─── Harmony ──────────────────────────────────────

	it('should show harmony panel expanded by default', () => {
		const { getByText } = render(BrandColorEditor, {
			props: { colors: {} }
		});

		// Harmony panel starts expanded, so harmony types should be visible
		expect(getByText('Complement')).toBeTruthy();
		expect(getByText('Analogous')).toBeTruthy();
		expect(getByText('Triadic')).toBeTruthy();
		expect(getByText('Tetradic')).toBeTruthy();
		expect(getByText('Split-Comp')).toBeTruthy();
		expect(getByText('Mono')).toBeTruthy();
	});

	it('should toggle harmony panel on click', async () => {
		const { getByText, queryByText } = render(BrandColorEditor, {
			props: { colors: {} }
		});

		// Should start open
		expect(getByText('Complement')).toBeTruthy();

		// Click to collapse
		await fireEvent.click(getByText('Color Harmony'));
		expect(queryByText('Complement')).toBeFalsy();

		// Click to expand again
		await fireEvent.click(getByText('Color Harmony'));
		expect(getByText('Complement')).toBeTruthy();
	});

	// ─── Events ───────────────────────────────────────

	it('should dispatch colorchange event when an input changes', async () => {
		const handler = vi.fn();
		const { component, container } = render(BrandColorEditor, {
			props: { colors: { primaryColor: '#ff0000' } }
		});

		component.$on('colorchange', handler);

		const hexInputs = container.querySelectorAll('.hex-input') as NodeListOf<HTMLInputElement>;
		const primaryInput = Array.from(hexInputs).find((i) => i.value === '#ff0000');
		expect(primaryInput).toBeTruthy();

		await fireEvent.input(primaryInput!, { target: { value: '#00ff00' } });

		expect(handler).toHaveBeenCalled();
		expect(handler.mock.calls[0][0].detail.value).toBe('#00ff00');
	});

	it('should not dispatch colorchange for invalid hex', async () => {
		const handler = vi.fn();
		const { component, container } = render(BrandColorEditor, {
			props: { colors: { primaryColor: '#ff0000' } }
		});

		component.$on('colorchange', handler);

		const hexInputs = container.querySelectorAll('.hex-input') as NodeListOf<HTMLInputElement>;
		const primaryInput = Array.from(hexInputs).find((i) => i.value === '#ff0000');

		await fireEvent.input(primaryInput!, { target: { value: '#zzzzzz' } });

		expect(handler).not.toHaveBeenCalled();
	});

	it('should dispatch editlogo event when logo area is clicked', async () => {
		const handler = vi.fn();
		const { component, getByLabelText } = render(BrandColorEditor, {
			props: { colors: {} }
		});

		component.$on('editlogo', handler);

		await fireEvent.click(getByLabelText('Edit icon logo'));
		expect(handler).toHaveBeenCalled();
	});

	it('should open font picker when font row is clicked', async () => {
		const { getByText, container } = render(BrandColorEditor, {
			props: { colors: {} }
		});

		await fireEvent.click(getByText('Heading Font').closest('button')!);

		// The font picker should now be visible
		const fontPicker = container.querySelector('.font-picker');
		expect(fontPicker).toBeTruthy();
	});

	// ─── Auto-generation ──────────────────────────────

	it('should show auto-fill button when primary color is set', () => {
		const { getByText } = render(BrandColorEditor, {
			props: { colors: { primaryColor: '#3366cc' } }
		});

		expect(getByText('Auto-fill empty colors from Primary')).toBeTruthy();
	});

	it('should not show auto-fill button when primary color is empty', () => {
		const { queryByText } = render(BrandColorEditor, {
			props: { colors: {} }
		});

		expect(queryByText('Auto-fill empty colors from Primary')).toBeFalsy();
	});

	it('should show Regenerate All button when primary is set', () => {
		const { getByText } = render(BrandColorEditor, {
			props: { colors: { primaryColor: '#3366cc' } }
		});

		expect(getByText('Regenerate All')).toBeTruthy();
	});

	// ─── Contrast ─────────────────────────────────────

	it('should show contrast check toggle when colors are set', () => {
		const { getByText } = render(BrandColorEditor, {
			props: {
				colors: {
					primaryColor: '#3366cc'
				}
			}
		});

		expect(getByText('Contrast Check')).toBeTruthy();
	});

	// ─── Live Preview ─────────────────────────────────

	it('should show live preview when colors are set', () => {
		const { getByText } = render(BrandColorEditor, {
			props: {
				colors: {
					primaryColor: '#3366cc'
				}
			}
		});

		expect(getByText('LIVE PREVIEW')).toBeTruthy();
		expect(getByText('Feature Card')).toBeTruthy();
	});

	it('should show preview hero section with colors', () => {
		const { container } = render(BrandColorEditor, {
			props: {
				colors: {
					primaryColor: '#3366cc'
				}
			}
		});

		const hero = container.querySelector('.preview-hero-title');
		expect(hero).toBeTruthy();
	});

	// ─── Picker overlay ───────────────────────────────

	it('should show picker hint when no field is active', () => {
		const { getByText } = render(BrandColorEditor, {
			props: { colors: {} }
		});

		expect(getByText('Select a color field to start')).toBeTruthy();
	});

	it('should activate a field when clicked', async () => {
		const { container, queryByText } = render(BrandColorEditor, {
			props: { colors: { primaryColor: '#ff0000' } }
		});

		const primaryRow = container.querySelector(
			'[aria-label="Edit Brand Color 1 color"]'
		) as HTMLElement;
		expect(primaryRow).toBeTruthy();

		await fireEvent.click(primaryRow);

		expect(queryByText('Select a color field to start')).toBeFalsy();
	});

	// ─── Getting Started ──────────────────────────────

	it('should show getting started section when no colors are set', () => {
		const { getByText } = render(BrandColorEditor, {
			props: { colors: {} }
		});

		expect(getByText('GET STARTED')).toBeTruthy();
		expect(getByText('Start from a Preset')).toBeTruthy();
	});

	it('should hide getting started section when colors exist', () => {
		const { queryByText } = render(BrandColorEditor, {
			props: { colors: { primaryColor: '#ff0000' } }
		});

		expect(queryByText('GET STARTED')).toBeFalsy();
	});

	// ─── Presets ──────────────────────────────────────

	it('should open preset panel when browse presets is clicked', async () => {
		const { getByText, queryByText } = render(BrandColorEditor, {
			props: { colors: {} }
		});

		expect(queryByText('PRESET THEMES')).toBeFalsy();

		await fireEvent.click(getByText('Start from a Preset'));
		expect(getByText('PRESET THEMES')).toBeTruthy();
		expect(getByText('Midnight Blue')).toBeTruthy();
		expect(getByText('Ember')).toBeTruthy();
	});

	// ─── Actions ──────────────────────────────────────

	it('should show clear all link when colors exist', () => {
		const { getByText } = render(BrandColorEditor, {
			props: { colors: { primaryColor: '#ff0000' } }
		});

		expect(getByText('Clear all colors')).toBeTruthy();
	});

	// ─── HSL Sliders ──────────────────────────────────

	it('should show HSL sliders when a field is activated', async () => {
		const { container } = render(BrandColorEditor, {
			props: { colors: { primaryColor: '#ff0000' } }
		});

		const primaryRow = container.querySelector(
			'[aria-label="Edit Brand Color 1 color"]'
		) as HTMLElement;
		await fireEvent.click(primaryRow);

		await waitFor(() => {
			expect(container.querySelector('[aria-label="Hue value"]')).toBeTruthy();
			expect(container.querySelector('[aria-label="Saturation value"]')).toBeTruthy();
			expect(container.querySelector('[aria-label="Lightness value"]')).toBeTruthy();
		});
	});

	it('should show FINE-TUNE heading and HSL mode label when active', async () => {
		const { container } = render(BrandColorEditor, {
			props: { colors: { primaryColor: '#ff0000' } }
		});

		const primaryRow = container.querySelector(
			'[aria-label="Edit Brand Color 1 color"]'
		) as HTMLElement;
		await fireEvent.click(primaryRow);

		await waitFor(() => {
			expect(container.querySelector('.slider-heading')?.textContent).toBe('FINE-TUNE');
			expect(container.querySelector('.slider-mode-label')?.textContent).toBe('HSL');
		});
	});

	// ─── Clear button ─────────────────────────────────

	it('should show a clear button for fields with values', () => {
		const { container } = render(BrandColorEditor, {
			props: { colors: { primaryColor: '#ff0000' } }
		});

		const clearBtns = container.querySelectorAll('.clear-btn');
		expect(clearBtns.length).toBeGreaterThan(0);
	});

	// ─── Palette bar ──────────────────────────────────

	it('should render the palette overview bar', () => {
		const { container } = render(BrandColorEditor, {
			props: { colors: {} }
		});

		const paletteBar = container.querySelector('.palette-bar');
		expect(paletteBar).toBeTruthy();

		const items = container.querySelectorAll('.pal-item');
		// 3 core brand colors + 1 "add" button = 4
		expect(items.length).toBe(4);
	});

	it('should highlight active field in palette bar', async () => {
		const { container } = render(BrandColorEditor, {
			props: { colors: { primaryColor: '#ff0000' } }
		});

		const primaryRow = container.querySelector(
			'[aria-label="Edit Brand Color 1 color"]'
		) as HTMLElement;
		await fireEvent.click(primaryRow);

		const activePalItem = container.querySelector('.pal-item.active');
		expect(activePalItem).toBeTruthy();
	});

	// ─── Field descriptions ───────────────────────────

	it('should show field descriptions', () => {
		const { getByText } = render(BrandColorEditor, {
			props: { colors: {} }
		});

		expect(getByText('Main brand color')).toBeTruthy();
		expect(getByText('Supporting accent')).toBeTruthy();
		expect(getByText('Highlight & CTA')).toBeTruthy();
	});

	// ─── Filled badge ─────────────────────────────────

	it('should show filled badge count when fields are filled', () => {
		const { container } = render(BrandColorEditor, {
			props: {
				colors: {
					primaryColor: '#ff0000',
					secondaryColor: '#00ff00'
				}
			}
		});

		const badge = container.querySelector('.filled-badge');
		expect(badge).toBeTruthy();
		// 2 of 3 base colors filled
		expect(badge?.textContent).toBe('2/3');
	});

	// ─── Harmony Apply (batch save) ───────────────────

	it('should dispatch colorsbatchchange with all 3 colors when Apply to Palette is clicked', async () => {
		const handler = vi.fn();
		const { component, getByText } = render(BrandColorEditor, {
			props: { colors: { primaryColor: '#ff0000' } }
		});

		component.$on('colorsbatchchange', handler);

		// Click "Apply to Palette" inside the harmony wheel
		await fireEvent.click(getByText('Apply to Palette'));

		// Should have been called at least once with brand color keys
		expect(handler).toHaveBeenCalled();
		// Find the harmony apply call (contains primaryColor, secondaryColor, accentColor)
		const harmonyCalls = handler.mock.calls.filter((call: unknown[]) => {
			const detail = (call[0] as { detail: { colors: { key: string }[] } }).detail;
			const keys = detail.colors.map((c: { key: string }) => c.key);
			return (
				keys.includes('primaryColor') &&
				keys.includes('secondaryColor') &&
				keys.includes('accentColor')
			);
		});
		expect(harmonyCalls.length).toBeGreaterThanOrEqual(1);

		const detail = (harmonyCalls[0][0] as { detail: { colors: { key: string; value: string }[] } })
			.detail;
		expect(detail.colors.length).toBe(3);

		// All values should be valid hex
		for (const c of detail.colors) {
			expect(c.value).toMatch(/^#[0-9a-f]{6}$/);
		}
	});
});
