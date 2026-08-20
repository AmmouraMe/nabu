/**
 * Tests for color harmony triple generation and wheel interaction logic.
 * TDD: these fail first, then we implement.
 */
import { describe, it, expect } from 'vitest';
import {
	generateHarmonyTriple,
	getHarmonyAngles,
	rotateHarmony,
	hexToHsl,
	hslToHex,
	isValidHex,
	type HarmonyType
} from '$lib/utils/brand-colors';

describe('getHarmonyAngles', () => {
	it('should return [0, 180] for complementary', () => {
		expect(getHarmonyAngles('complementary')).toEqual([0, 180]);
	});

	it('should return [0, -30, 30] for analogous', () => {
		expect(getHarmonyAngles('analogous')).toEqual([0, -30, 30]);
	});

	it('should return [0, 120, 240] for triadic', () => {
		expect(getHarmonyAngles('triadic')).toEqual([0, 120, 240]);
	});

	it('should return [0, 90, 180, 270] for tetradic', () => {
		expect(getHarmonyAngles('tetradic')).toEqual([0, 90, 180, 270]);
	});

	it('should return [0, 150, 210] for split-complementary', () => {
		expect(getHarmonyAngles('split-complementary')).toEqual([0, 150, 210]);
	});

	it('should return [0, 0, 0] for monochromatic (same hue)', () => {
		expect(getHarmonyAngles('monochromatic')).toEqual([0, 0, 0]);
	});
});

describe('generateHarmonyTriple', () => {
	it('should return 3 valid hex colors for triadic', () => {
		const result = generateHarmonyTriple('#ff0000', 'triadic');
		expect(result.primary).toBeDefined();
		expect(result.secondary).toBeDefined();
		expect(result.accent).toBeDefined();
		expect(isValidHex(result.primary)).toBe(true);
		expect(isValidHex(result.secondary)).toBe(true);
		expect(isValidHex(result.accent)).toBe(true);
	});

	it('should preserve the primary color', () => {
		const result = generateHarmonyTriple('#3b82f6', 'triadic');
		expect(result.primary).toBe('#3b82f6');
	});

	it('should produce triadic colors 120° apart', () => {
		const result = generateHarmonyTriple('#ff0000', 'triadic');
		const hPrimary = hexToHsl(result.primary)!.h;
		const hSecondary = hexToHsl(result.secondary)!.h;
		const hAccent = hexToHsl(result.accent)!.h;
		// Primary is 0, Secondary should be ~120, Accent ~240
		expect(hPrimary).toBe(0);
		expect(hSecondary).toBe(120);
		expect(hAccent).toBe(240);
	});

	it('should produce analogous colors ±30° from primary', () => {
		const result = generateHarmonyTriple('#ff0000', 'analogous');
		const hSecondary = hexToHsl(result.secondary)!.h;
		const hAccent = hexToHsl(result.accent)!.h;
		expect(hSecondary).toBe(330); // -30 from 0 => 330
		expect(hAccent).toBe(30);
	});

	it('should produce complementary: primary + complement + midpoint', () => {
		const result = generateHarmonyTriple('#ff0000', 'complementary');
		const hSecondary = hexToHsl(result.secondary)!.h;
		// Complementary: secondary at 180°
		expect(hSecondary).toBe(180);
		// Accent should be valid
		expect(isValidHex(result.accent)).toBe(true);
	});

	it('should produce split-complementary colors', () => {
		const result = generateHarmonyTriple('#ff0000', 'split-complementary');
		const hSecondary = hexToHsl(result.secondary)!.h;
		const hAccent = hexToHsl(result.accent)!.h;
		expect(hSecondary).toBe(150);
		expect(hAccent).toBe(210);
	});

	it('should produce tetradic: use first two harmony colors as secondary/accent', () => {
		const result = generateHarmonyTriple('#ff0000', 'tetradic');
		const hSecondary = hexToHsl(result.secondary)!.h;
		const hAccent = hexToHsl(result.accent)!.h;
		expect(hSecondary).toBe(90);
		expect(hAccent).toBe(180);
	});

	it('should produce monochromatic: same hue, different lightness', () => {
		const result = generateHarmonyTriple('#3366cc', 'monochromatic');
		const hPrimary = hexToHsl(result.primary)!;
		const hSecondary = hexToHsl(result.secondary)!;
		const hAccent = hexToHsl(result.accent)!;
		// Same hue
		expect(hSecondary.h).toBe(hPrimary.h);
		expect(hAccent.h).toBe(hPrimary.h);
		// Different lightness
		expect(hSecondary.l).not.toBe(hPrimary.l);
		expect(hAccent.l).not.toBe(hPrimary.l);
	});

	it('should return primary as-is for invalid hex', () => {
		const result = generateHarmonyTriple('invalid', 'triadic');
		expect(result.primary).toBe('invalid');
	});

	it('should work for all harmony types', () => {
		const types: HarmonyType[] = [
			'complementary',
			'analogous',
			'triadic',
			'tetradic',
			'split-complementary',
			'monochromatic'
		];
		for (const type of types) {
			const result = generateHarmonyTriple('#3b82f6', type);
			expect(isValidHex(result.primary)).toBe(true);
			expect(isValidHex(result.secondary)).toBe(true);
			expect(isValidHex(result.accent)).toBe(true);
		}
	});
});

describe('rotateHarmony', () => {
	it('should rotate all harmony colors by the given degrees', () => {
		const triple = { primary: '#ff0000', secondary: '#00ff00', accent: '#0000ff' };
		const result = rotateHarmony(triple, 60);
		const hPrimary = hexToHsl(result.primary)!.h;
		const hSecondary = hexToHsl(result.secondary)!.h;
		const hAccent = hexToHsl(result.accent)!.h;
		expect(hPrimary).toBe(60);
		expect(hSecondary).toBe(180);
		expect(hAccent).toBe(300);
	});

	it('should wrap around 360°', () => {
		const triple = { primary: '#ff0000', secondary: '#00ff00', accent: '#0000ff' };
		const result = rotateHarmony(triple, 300);
		const hPrimary = hexToHsl(result.primary)!.h;
		expect(hPrimary).toBe(300);
	});

	it('should preserve saturation and lightness', () => {
		const triple = generateHarmonyTriple('#3366cc', 'triadic');
		const result = rotateHarmony(triple, 45);
		const originalHsl = hexToHsl(triple.primary)!;
		const rotatedHsl = hexToHsl(result.primary)!;
		expect(rotatedHsl.s).toBe(originalHsl.s);
		expect(rotatedHsl.l).toBe(originalHsl.l);
	});

	it('should return inputs unchanged for 0° rotation', () => {
		const triple = generateHarmonyTriple('#ff0000', 'triadic');
		const result = rotateHarmony(triple, 0);
		expect(result.primary).toBe(triple.primary);
		expect(result.secondary).toBe(triple.secondary);
		expect(result.accent).toBe(triple.accent);
	});

	it('should handle negative rotation', () => {
		const triple = { primary: '#ff0000', secondary: '#00ff00', accent: '#0000ff' };
		const result = rotateHarmony(triple, -60);
		const hPrimary = hexToHsl(result.primary)!.h;
		expect(hPrimary).toBe(300);
	});
});
