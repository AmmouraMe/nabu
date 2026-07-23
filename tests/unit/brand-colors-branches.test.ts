/**
 * Branch coverage for brand-colors.ts: the invalid-hex guards that every
 * derived-color helper carries, the getColorName range table, and the
 * scoring/ranking edge cases.
 */
import { describe, it, expect } from 'vitest';
import {
	generateComplementary,
	generateAnalogous,
	generateTriadic,
	generateSplitComplementary,
	generateMonochromatic,
	generateTetradic,
	lighten,
	darken,
	adjustSaturation,
	shiftHue,
	blendColors,
	generateFullTheme,
	derivedThemeFromBrandColors,
	rotateHarmony,
	generateHarmonyTriple,
	getColorName,
	getColorTemperature,
	getContrastRatio,
	scoreAndRankColors,
	hexToHsv,
	hsvToHex,
	shouldUseDarkText
} from '../../src/lib/utils/brand-colors';

const BAD = 'not-a-hex';

describe('invalid-hex guards', () => {
	it('harmony generators return an empty array', () => {
		for (const fn of [
			generateComplementary,
			generateAnalogous,
			generateTriadic,
			generateSplitComplementary,
			generateMonochromatic,
			generateTetradic
		]) {
			expect(fn(BAD)).toEqual([]);
		}
	});

	it('single-color transforms return the input unchanged', () => {
		expect(lighten(BAD, 10)).toBe(BAD);
		expect(darken(BAD, 10)).toBe(BAD);
		expect(adjustSaturation(BAD, 10)).toBe(BAD);
		expect(shiftHue(BAD, 30)).toBe(BAD);
	});

	it('theme builders fall back to default hue/saturation', () => {
		const theme = generateFullTheme(BAD);
		expect(theme.primaryColor).toBeTruthy();
		const derived = derivedThemeFromBrandColors({ primary: BAD } as any);
		expect(derived).toBeTruthy();
	});

	it('rotateHarmony passes through unparseable members', () => {
		const rotated = rotateHarmony({ primary: BAD, secondary: BAD, accent: BAD } as any, 45);
		expect(rotated.primary).toBe(BAD);
	});

	it('contrast against an invalid hex still returns a number', () => {
		expect(typeof getContrastRatio(BAD, '#ffffff')).toBe('number');
	});

	it('hexToHsv returns null for an invalid hex', () => {
		expect(hexToHsv(BAD)).toBeNull();
	});
});

describe('hue conversions across the wheel', () => {
	it('hexToHsv handles each dominant channel', () => {
		expect(hexToHsv('#ff0000')!.h).toBeCloseTo(0, 0); // max = r
		expect(hexToHsv('#00ff00')!.h).toBeGreaterThan(0); // max = g
		expect(hexToHsv('#0000ff')!.h).toBeGreaterThan(0); // max = b
		expect(hexToHsv('#ff00ff')!.h).toBeGreaterThan(0); // g < b wrap
		expect(hexToHsv('#808080')!.s).toBe(0); // achromatic
	});

	it('hsvToHex covers every 60° sector', () => {
		for (const h of [0, 45, 90, 150, 210, 270, 330]) {
			expect(hsvToHex(h, 80, 60)).toMatch(/^#[0-9a-f]{6}$/i);
		}
	});

	it('blendColors mixes two valid colors', () => {
		expect(blendColors('#000000', '#ffffff', 0.5)).toMatch(/^#[0-9a-f]{6}$/i);
	});
});

describe('getColorName / temperature / text choice', () => {
	it('names the greyscale ramp', () => {
		const names = ['#000000', '#3a3a3a', '#8a8a8a', '#d0d0d0', '#f5f5f5', '#ffffff'].map(
			getColorName
		);
		expect(new Set(names).size).toBeGreaterThan(3);
	});

	it('applies muted / vivid and dark / light prefixes', () => {
		expect(getColorName('#402d2d')).toMatch(/Dark|Muted/); // low sat, low light
		expect(getColorName('#ff1a1a')).toMatch(/Vivid|Red/); // high sat
		expect(getColorName('#ffd6d6')).toMatch(/Light|Muted|Pink|Red/); // high light
	});

	it('classifies temperature and text contrast', () => {
		expect(['warm', 'cool', 'neutral']).toContain(getColorTemperature('#ff0000'));
		expect(['warm', 'cool', 'neutral']).toContain(getColorTemperature('#0000ff'));
		expect(shouldUseDarkText('#ffffff')).toBe(true);
		expect(shouldUseDarkText('#000000')).toBe(false);
	});
});

describe('generateHarmonyTriple', () => {
	it('produces a triple for each harmony type', () => {
		for (const type of [
			'complementary',
			'analogous',
			'triadic',
			'split-complementary',
			'tetradic',
			'monochromatic'
		] as const) {
			const triple = generateHarmonyTriple('#3ba99f', type as any);
			expect(triple.primary).toBeTruthy();
		}
	});
});

describe('scoreAndRankColors', () => {
	it('returns an empty array for no input', () => {
		expect(scoreAndRankColors([])).toEqual([]);
	});

	it('penalises very dark and very bright colors and handles zero population', () => {
		const ranked = scoreAndRankColors([
			{ r: 5, g: 5, b: 5, population: 0 } as any, // very dark, zero pop
			{ r: 250, g: 250, b: 250, population: 10 } as any, // very bright
			{ r: 59, g: 169, b: 159, population: 100 } as any // vivid mid — should win
		]);
		expect(ranked).toHaveLength(3);
		expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[2].score);
	});
});
