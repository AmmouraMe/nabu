/**
 * Tests for extractColorsFromImage utility.
 * Validates image-based color extraction: k-means clustering, color scoring,
 * and palette generation from pixel data.
 *
 * TDD: Tests written first — implementation follows.
 */
import { describe, it, expect } from 'vitest';
import {
	extractColorsFromPixels,
	scoreAndRankColors,
	buildPaletteFromExtracted,
	derivedThemeFromBrandColors,
	rgbToHex,
	hexToRgb,
	type ExtractedColor
} from '$lib/utils/brand-colors';

// ─── Helper: create a uniform pixel buffer ────────────

function createPixelBuffer(
	colors: [number, number, number][],
	repeats: number = 1
): Uint8ClampedArray {
	const data = new Uint8ClampedArray(colors.length * repeats * 4);
	let idx = 0;
	for (let r = 0; r < repeats; r++) {
		for (const [cr, cg, cb] of colors) {
			data[idx++] = cr;
			data[idx++] = cg;
			data[idx++] = cb;
			data[idx++] = 255; // alpha
		}
	}
	return data;
}

describe('extractColorsFromPixels', () => {
	it('should extract dominant colors from pixel data', () => {
		// 80% red, 20% blue
		const reds: [number, number, number][] = Array(80).fill([220, 30, 30]);
		const blues: [number, number, number][] = Array(20).fill([30, 30, 220]);
		const pixels = createPixelBuffer([...reds, ...blues]);

		const result = extractColorsFromPixels(pixels, 100, 1, { maxColors: 5 });
		expect(result.length).toBeGreaterThanOrEqual(1);
		expect(result.length).toBeLessThanOrEqual(5);

		// The dominant color should be reddish
		const dominant = result[0];
		expect(dominant.r).toBeGreaterThan(150);
		expect(dominant.b).toBeLessThan(100);
	});

	it('should return empty array for empty pixel data', () => {
		const result = extractColorsFromPixels(new Uint8ClampedArray(0), 0, 0, { maxColors: 5 });
		expect(result).toEqual([]);
	});

	it('should ignore near-white and near-black pixels by default', () => {
		// All near-white pixels + a few colored
		const whites: [number, number, number][] = Array(90).fill([250, 250, 250]);
		const greens: [number, number, number][] = Array(10).fill([30, 180, 60]);
		const pixels = createPixelBuffer([...whites, ...greens]);

		const result = extractColorsFromPixels(pixels, 100, 1, { maxColors: 5 });
		// Should find the green, not white background
		expect(result.length).toBeGreaterThanOrEqual(1);
		const hasGreen = result.some((c) => c.g > 100 && c.r < 100);
		expect(hasGreen).toBe(true);
	});

	it('should handle single-color images', () => {
		const pixels = createPixelBuffer([[120, 80, 200]], 100);
		const result = extractColorsFromPixels(pixels, 100, 1, { maxColors: 5 });
		expect(result.length).toBeGreaterThanOrEqual(1);
		// Should be close to the input
		expect(Math.abs(result[0].r - 120)).toBeLessThan(20);
		expect(Math.abs(result[0].g - 80)).toBeLessThan(20);
		expect(Math.abs(result[0].b - 200)).toBeLessThan(20);
	});

	it('should respect maxColors option', () => {
		const colors: [number, number, number][] = [
			[220, 30, 30],
			[30, 220, 30],
			[30, 30, 220],
			[220, 220, 30],
			[220, 30, 220],
			[30, 220, 220]
		];
		const pixels = createPixelBuffer(colors, 20);
		const result = extractColorsFromPixels(pixels, 120, 1, { maxColors: 3 });
		expect(result.length).toBeLessThanOrEqual(3);
	});

	it('should skip transparent pixels', () => {
		// Create buffer manually with transparent pixels
		const data = new Uint8ClampedArray(40);
		// 5 transparent red pixels
		for (let i = 0; i < 5; i++) {
			data[i * 4] = 200;
			data[i * 4 + 1] = 0;
			data[i * 4 + 2] = 0;
			data[i * 4 + 3] = 0; // fully transparent
		}
		// 5 opaque blue pixels
		for (let i = 5; i < 10; i++) {
			data[i * 4] = 0;
			data[i * 4 + 1] = 0;
			data[i * 4 + 2] = 200;
			data[i * 4 + 3] = 255;
		}
		const result = extractColorsFromPixels(data, 10, 1, { maxColors: 3 });
		expect(result.length).toBeGreaterThanOrEqual(1);
		// Should be blue not red
		expect(result[0].b).toBeGreaterThan(result[0].r);
	});
});

describe('scoreAndRankColors', () => {
	it('should rank saturated colors higher than dull ones', () => {
		const colors: ExtractedColor[] = [
			{ r: 128, g: 128, b: 128, hex: '#808080', population: 50 }, // grey
			{ r: 220, g: 40, b: 60, hex: '#dc283c', population: 50 } // vibrant red
		];
		const ranked = scoreAndRankColors(colors);
		expect(ranked[0].hex).toBe('#dc283c');
	});

	it('should boost colors with higher population', () => {
		const colors: ExtractedColor[] = [
			{ r: 100, g: 40, b: 180, hex: '#6428b4', population: 200 }, // big cluster
			{ r: 200, g: 50, b: 60, hex: '#c8323c', population: 5 } // tiny cluster
		];
		const ranked = scoreAndRankColors(colors);
		// The big cluster should rank first due to larger population
		expect(ranked[0].hex).toBe('#6428b4');
	});

	it('should return colors sorted by score descending', () => {
		const colors: ExtractedColor[] = [
			{ r: 200, g: 200, b: 200, hex: '#c8c8c8', population: 10 },
			{ r: 30, g: 150, b: 220, hex: '#1e96dc', population: 40 },
			{ r: 255, g: 200, b: 0, hex: '#ffc800', population: 30 }
		];
		const ranked = scoreAndRankColors(colors);
		// Each should have a score and be sorted descending
		for (let i = 1; i < ranked.length; i++) {
			expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
		}
	});
});

describe('buildPaletteFromExtracted', () => {
	it('should return primary/secondary/accent from ranked colors', () => {
		const colors: (ExtractedColor & { score: number })[] = [
			{ r: 220, g: 40, b: 60, hex: '#dc283c', population: 80, score: 100 },
			{ r: 40, g: 100, b: 220, hex: '#2864dc', population: 50, score: 80 },
			{ r: 60, g: 200, b: 100, hex: '#3cc864', population: 30, score: 60 }
		];
		const palette = buildPaletteFromExtracted(colors);
		expect(palette.primary).toBe('#dc283c');
		expect(palette.secondary).toBe('#2864dc');
		expect(palette.accent).toBe('#3cc864');
	});

	it('should pick visually distinct colors for secondary/accent', () => {
		// Two very similar reds and one blue
		const colors: (ExtractedColor & { score: number })[] = [
			{ r: 220, g: 40, b: 60, hex: '#dc283c', population: 80, score: 100 },
			{ r: 210, g: 45, b: 55, hex: '#d22d37', population: 70, score: 95 }, // near-duplicate
			{ r: 40, g: 100, b: 220, hex: '#2864dc', population: 30, score: 60 }
		];
		const palette = buildPaletteFromExtracted(colors);
		expect(palette.primary).toBe('#dc283c');
		// Secondary should skip the near-duplicate and pick the blue
		expect(palette.secondary).toBe('#2864dc');
	});

	it('should handle single color input gracefully', () => {
		const colors: (ExtractedColor & { score: number })[] = [
			{ r: 100, g: 80, b: 200, hex: '#6450c8', population: 100, score: 90 }
		];
		const palette = buildPaletteFromExtracted(colors);
		expect(palette.primary).toBe('#6450c8');
		// Secondary/accent should still be valid hex colors (generated from primary)
		expect(palette.secondary).toMatch(/^#[0-9a-f]{6}$/);
		expect(palette.accent).toMatch(/^#[0-9a-f]{6}$/);
	});

	it('should handle empty input without crashing', () => {
		const palette = buildPaletteFromExtracted([]);
		expect(palette.primary).toMatch(/^#[0-9a-f]{6}$/);
		expect(palette.secondary).toMatch(/^#[0-9a-f]{6}$/);
		expect(palette.accent).toMatch(/^#[0-9a-f]{6}$/);
	});
});

describe('derivedThemeFromBrandColors', () => {
	it('should return all layout & status colors from a primary', () => {
		const derived = derivedThemeFromBrandColors({ primary: '#3b82f6' });
		expect(derived.backgroundColor).toMatch(/^#[0-9a-f]{6}$/);
		expect(derived.surfaceColor).toMatch(/^#[0-9a-f]{6}$/);
		expect(derived.textColor).toMatch(/^#[0-9a-f]{6}$/);
		expect(derived.textSecondaryColor).toMatch(/^#[0-9a-f]{6}$/);
		expect(derived.borderColor).toMatch(/^#[0-9a-f]{6}$/);
		expect(derived.successColor).toBe('#22c55e');
		expect(derived.warningColor).toBe('#f59e0b');
		expect(derived.errorColor).toBe('#ef4444');
	});

	it('should not include brand color keys in output', () => {
		const derived = derivedThemeFromBrandColors({ primary: '#ff0000' });
		expect(derived).not.toHaveProperty('primaryColor');
		expect(derived).not.toHaveProperty('secondaryColor');
		expect(derived).not.toHaveProperty('accentColor');
		expect(derived).not.toHaveProperty('brandColor4');
		expect(derived).not.toHaveProperty('brandColor5');
	});

	it('should produce dark background for any hue', () => {
		const red = derivedThemeFromBrandColors({ primary: '#ff0000' });
		const blue = derivedThemeFromBrandColors({ primary: '#0000ff' });
		// Background lightness should be low (dark theme)
		// The hex bg should start dark (low values in R/G/B)
		for (const bg of [red.backgroundColor, blue.backgroundColor]) {
			const r = parseInt(bg.slice(1, 3), 16);
			const g = parseInt(bg.slice(3, 5), 16);
			const b = parseInt(bg.slice(5, 7), 16);
			expect(r + g + b).toBeLessThan(150); // very dark
		}
	});
});
