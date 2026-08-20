/**
 * Tests for ColorHarmonyWheel component.
 * Validates rendering, interaction, and event dispatching.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ColorHarmonyWheel from '$lib/components/ColorHarmonyWheel.svelte';

// Mock canvas context with all methods the wheel uses
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
	clip: vi.fn(),
	drawImage: vi.fn(),
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
	fillStyle: '',
	strokeStyle: '',
	lineWidth: 0,
	font: '',
	textAlign: '',
	textBaseline: '',
	scale: vi.fn()
};

beforeEach(() => {
	vi.restoreAllMocks();
	HTMLCanvasElement.prototype.getContext = vi.fn(
		() => mockCtx
	) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

describe('ColorHarmonyWheel', () => {
	// ─── Structure ──────────────────────────────────

	it('should render the wheel canvas', () => {
		const { container } = render(ColorHarmonyWheel, {
			props: { primaryColor: '#3b82f6', harmonyType: 'triadic' }
		});

		const canvas = container.querySelector('canvas.wheel-canvas');
		expect(canvas).toBeTruthy();
	});

	it('should render harmony type selector chips', () => {
		const { getByText } = render(ColorHarmonyWheel, {
			props: { primaryColor: '#3b82f6', harmonyType: 'triadic' }
		});

		expect(getByText('Triadic')).toBeTruthy();
		expect(getByText('Analogous')).toBeTruthy();
		expect(getByText('Complement')).toBeTruthy();
		expect(getByText('Split-Comp')).toBeTruthy();
		expect(getByText('Tetradic')).toBeTruthy();
		expect(getByText('Mono')).toBeTruthy();
	});

	it('should render preview swatches for P, S, A', () => {
		const { getByText } = render(ColorHarmonyWheel, {
			props: { primaryColor: '#ff0000', harmonyType: 'triadic' }
		});

		expect(getByText('Primary')).toBeTruthy();
		expect(getByText('Secondary')).toBeTruthy();
		expect(getByText('Accent')).toBeTruthy();
	});

	it('should render P, S, A key labels on swatches', () => {
		const { getByText } = render(ColorHarmonyWheel, {
			props: { primaryColor: '#ff0000', harmonyType: 'triadic' }
		});

		expect(getByText('P')).toBeTruthy();
		expect(getByText('S')).toBeTruthy();
		expect(getByText('A')).toBeTruthy();
	});

	it('should render the Apply to Palette button', () => {
		const { getByText } = render(ColorHarmonyWheel, {
			props: { primaryColor: '#3b82f6', harmonyType: 'triadic' }
		});

		expect(getByText('Apply to Palette')).toBeTruthy();
	});

	it('should mark the active harmony type chip', () => {
		const { container } = render(ColorHarmonyWheel, {
			props: { primaryColor: '#3b82f6', harmonyType: 'analogous' }
		});

		const activeChips = container.querySelectorAll('.wheel-chip.active');
		expect(activeChips.length).toBe(1);
		expect(activeChips[0].textContent).toContain('Analogous');
	});

	// ─── Color preview ──────────────────────────────

	it('should display the primary hex value in preview', () => {
		const { container } = render(ColorHarmonyWheel, {
			props: { primaryColor: '#ff0000', harmonyType: 'triadic' }
		});

		const hexLabels = container.querySelectorAll('.wheel-swatch-hex');
		const hexValues = Array.from(hexLabels).map((el) => el.textContent);
		expect(hexValues).toContain('#ff0000');
	});

	// ─── Interactions ───────────────────────────────

	it('should change harmony type when a chip is clicked', async () => {
		const { getByText, container } = render(ColorHarmonyWheel, {
			props: { primaryColor: '#3b82f6', harmonyType: 'triadic' }
		});

		await fireEvent.click(getByText('Analogous'));

		const activeChips = container.querySelectorAll('.wheel-chip.active');
		expect(activeChips.length).toBe(1);
		expect(activeChips[0].textContent).toContain('Analogous');
	});

	it('should dispatch harmonyapply when Apply button is clicked', async () => {
		const handler = vi.fn();
		const { component, getByText } = render(ColorHarmonyWheel, {
			props: { primaryColor: '#ff0000', harmonyType: 'triadic' }
		});

		component.$on('harmonyapply', handler);

		await fireEvent.click(getByText('Apply to Palette'));

		expect(handler).toHaveBeenCalled();
		const detail = handler.mock.calls[0][0].detail;
		expect(detail.primary).toBeDefined();
		expect(detail.secondary).toBeDefined();
		expect(detail.accent).toBeDefined();
	});

	it('should dispatch harmonychange when a harmony type chip is clicked', async () => {
		const handler = vi.fn();
		const { component, getByText } = render(ColorHarmonyWheel, {
			props: { primaryColor: '#ff0000', harmonyType: 'triadic' }
		});

		component.$on('harmonychange', handler);

		await fireEvent.click(getByText('Complement'));

		expect(handler).toHaveBeenCalled();
		const detail = handler.mock.calls[0][0].detail;
		expect(detail.primary).toBe('#ff0000');
		expect(detail.secondary).toBeDefined();
		expect(detail.accent).toBeDefined();
	});

	// ─── Keyboard ───────────────────────────────────

	it('should respond to arrow key rotation', async () => {
		const handler = vi.fn();
		const { component, container } = render(ColorHarmonyWheel, {
			props: { primaryColor: '#ff0000', harmonyType: 'triadic' }
		});

		component.$on('harmonychange', handler);

		const canvas = container.querySelector('canvas.wheel-canvas')!;
		await fireEvent.keyDown(canvas, { key: 'ArrowRight' });

		expect(handler).toHaveBeenCalled();
	});

	// ─── Canvas drawing ─────────────────────────────

	it('should call getContext on mount', async () => {
		render(ColorHarmonyWheel, {
			props: { primaryColor: '#3b82f6', harmonyType: 'triadic' }
		});

		// Wait for tick-based drawing
		await new Promise((r) => setTimeout(r, 50));

		expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalled();
	});

	it('should draw to canvas on mount', async () => {
		render(ColorHarmonyWheel, {
			props: { primaryColor: '#3b82f6', harmonyType: 'triadic' }
		});

		// Wait for tick-based drawing
		await new Promise((r) => setTimeout(r, 50));

		// Should have cleared and drawn the ring
		expect(mockCtx.clearRect).toHaveBeenCalled();
		expect(mockCtx.arc).toHaveBeenCalled();
		expect(mockCtx.fillText).toHaveBeenCalled();
	});

	// ─── Accessibility ──────────────────────────────

	it('should have proper ARIA attributes on the canvas', () => {
		const { container } = render(ColorHarmonyWheel, {
			props: { primaryColor: '#3b82f6', harmonyType: 'triadic' }
		});

		const canvas = container.querySelector('canvas.wheel-canvas')!;
		expect(canvas.getAttribute('role')).toBe('slider');
		expect(canvas.getAttribute('aria-valuemin')).toBe('0');
		expect(canvas.getAttribute('aria-valuemax')).toBe('360');
		expect(canvas.getAttribute('tabindex')).toBe('0');
	});

	it('should have a radiogroup for harmony type selection', () => {
		const { container } = render(ColorHarmonyWheel, {
			props: { primaryColor: '#3b82f6', harmonyType: 'triadic' }
		});

		const group = container.querySelector('[role="radiogroup"]');
		expect(group).toBeTruthy();
	});
});
