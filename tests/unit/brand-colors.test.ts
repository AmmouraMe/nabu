/**
 * Tests for brand color utility functions.
 * Covers HSL/RGB/hex conversions, color harmony generation, contrast checking,
 * color naming, temperature, adjustments, theme generation, and presets.
 */
import { describe, it, expect } from 'vitest';
import {
	hexToHsl,
	hslToHex,
	hexToRgb,
	rgbToHex,
	hexToHsv,
	hsvToHex,
	getContrastRatio,
	meetsContrast,
	generateComplementary,
	generateAnalogous,
	generateTriadic,
	generateTetradic,
	generateSplitComplementary,
	generateMonochromatic,
	suggestBackgroundColors,
	isValidHex,
	normalizeHex,
	getColorName,
	getColorTemperature,
	lighten,
	darken,
	adjustSaturation,
	shiftHue,
	generateFullTheme,
	buildContrastMatrix,
	getPerceivedBrightness,
	shouldUseDarkText,
	blendColors,
	PRESET_THEMES
} from '$lib/utils/brand-colors';

describe('brand-colors utilities', () => {
	describe('isValidHex', () => {
		it('should validate 3-digit hex codes', () => {
			expect(isValidHex('#f00')).toBe(true);
			expect(isValidHex('#abc')).toBe(true);
		});

		it('should validate 6-digit hex codes', () => {
			expect(isValidHex('#ff0000')).toBe(true);
			expect(isValidHex('#aabbcc')).toBe(true);
			expect(isValidHex('#AABBCC')).toBe(true);
		});

		it('should reject invalid values', () => {
			expect(isValidHex('')).toBe(false);
			expect(isValidHex('red')).toBe(false);
			expect(isValidHex('#gg0000')).toBe(false);
			expect(isValidHex('ff0000')).toBe(false);
			expect(isValidHex('#ff00')).toBe(false);
		});
	});

	describe('normalizeHex', () => {
		it('should expand 3-digit hex to 6-digit', () => {
			expect(normalizeHex('#f00')).toBe('#ff0000');
			expect(normalizeHex('#abc')).toBe('#aabbcc');
		});

		it('should lowercase 6-digit hex', () => {
			expect(normalizeHex('#FF0000')).toBe('#ff0000');
		});

		it('should return null for invalid hex', () => {
			expect(normalizeHex('invalid')).toBeNull();
		});
	});

	describe('hexToRgb', () => {
		it('should convert hex to RGB', () => {
			expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
			expect(hexToRgb('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
			expect(hexToRgb('#0000ff')).toEqual({ r: 0, g: 0, b: 255 });
			expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
			expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
		});

		it('should handle 3-digit hex', () => {
			expect(hexToRgb('#f00')).toEqual({ r: 255, g: 0, b: 0 });
		});

		it('should return null for invalid hex', () => {
			expect(hexToRgb('invalid')).toBeNull();
		});
	});

	describe('rgbToHex', () => {
		it('should convert RGB to hex', () => {
			expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
			expect(rgbToHex(0, 255, 0)).toBe('#00ff00');
			expect(rgbToHex(0, 0, 255)).toBe('#0000ff');
		});
	});

	describe('hexToHsl', () => {
		it('should convert pure red', () => {
			const hsl = hexToHsl('#ff0000');
			expect(hsl).not.toBeNull();
			expect(hsl!.h).toBe(0);
			expect(hsl!.s).toBe(100);
			expect(hsl!.l).toBe(50);
		});

		it('should convert pure green', () => {
			const hsl = hexToHsl('#00ff00');
			expect(hsl).not.toBeNull();
			expect(hsl!.h).toBe(120);
			expect(hsl!.s).toBe(100);
			expect(hsl!.l).toBe(50);
		});

		it('should convert pure blue', () => {
			const hsl = hexToHsl('#0000ff');
			expect(hsl).not.toBeNull();
			expect(hsl!.h).toBe(240);
			expect(hsl!.s).toBe(100);
			expect(hsl!.l).toBe(50);
		});

		it('should convert white', () => {
			const hsl = hexToHsl('#ffffff');
			expect(hsl).not.toBeNull();
			expect(hsl!.l).toBe(100);
		});

		it('should convert black', () => {
			const hsl = hexToHsl('#000000');
			expect(hsl).not.toBeNull();
			expect(hsl!.l).toBe(0);
		});

		it('should handle grays (saturation 0)', () => {
			const hsl = hexToHsl('#808080');
			expect(hsl).not.toBeNull();
			expect(hsl!.s).toBe(0);
		});
	});

	describe('hslToHex', () => {
		it('should convert HSL to hex (round-trip)', () => {
			expect(hslToHex(0, 100, 50)).toBe('#ff0000');
			expect(hslToHex(120, 100, 50)).toBe('#00ff00');
			expect(hslToHex(240, 100, 50)).toBe('#0000ff');
		});

		it('should handle achromatic (saturation 0)', () => {
			expect(hslToHex(0, 0, 50)).toBe('#808080');
			expect(hslToHex(0, 0, 100)).toBe('#ffffff');
			expect(hslToHex(0, 0, 0)).toBe('#000000');
		});

		it('should round-trip common colors', () => {
			const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
			for (const c of colors) {
				const hsl = hexToHsl(c)!;
				const result = hslToHex(hsl.h, hsl.s, hsl.l);
				expect(result).toBe(c);
			}
		});
	});

	describe('getContrastRatio', () => {
		it('should return 21 for black on white', () => {
			const ratio = getContrastRatio('#000000', '#ffffff');
			expect(ratio).toBeCloseTo(21, 0);
		});

		it('should return 1 for same colors', () => {
			const ratio = getContrastRatio('#ff0000', '#ff0000');
			expect(ratio).toBeCloseTo(1, 1);
		});

		it('should be commutative', () => {
			const r1 = getContrastRatio('#336699', '#ffffff');
			const r2 = getContrastRatio('#ffffff', '#336699');
			expect(r1).toBeCloseTo(r2, 2);
		});
	});

	describe('meetsContrast', () => {
		it('should pass AA for black on white', () => {
			expect(meetsContrast('#000000', '#ffffff', 'AA')).toBe(true);
		});

		it('should fail AA for light gray on white', () => {
			expect(meetsContrast('#cccccc', '#ffffff', 'AA')).toBe(false);
		});

		it('should pass AAA for black on white', () => {
			expect(meetsContrast('#000000', '#ffffff', 'AAA')).toBe(true);
		});
	});

	describe('generateComplementary', () => {
		it('should return the opposite hue', () => {
			const result = generateComplementary('#ff0000');
			// Red complementary = cyan (#00ffff)
			expect(result).toHaveLength(1);
			expect(result[0]).toBe('#00ffff');
		});

		it('should work for blue', () => {
			const result = generateComplementary('#0000ff');
			// Blue complement = yellow (#ffff00)
			expect(result[0]).toBe('#ffff00');
		});
	});

	describe('generateAnalogous', () => {
		it('should return colors ±30° apart', () => {
			const result = generateAnalogous('#ff0000');
			expect(result).toHaveLength(2);
			// Red (0°) → 330° and 30°
			const hsl1 = hexToHsl(result[0])!;
			const hsl2 = hexToHsl(result[1])!;
			expect(hsl1.h).toBe(330);
			expect(hsl2.h).toBe(30);
		});
	});

	describe('generateTriadic', () => {
		it('should return colors 120° apart', () => {
			const result = generateTriadic('#ff0000');
			expect(result).toHaveLength(2);
			const hsl1 = hexToHsl(result[0])!;
			const hsl2 = hexToHsl(result[1])!;
			expect(hsl1.h).toBe(120);
			expect(hsl2.h).toBe(240);
		});
	});

	describe('generateSplitComplementary', () => {
		it('should return colors 150° and 210° from base', () => {
			const result = generateSplitComplementary('#ff0000');
			expect(result).toHaveLength(2);
			const hsl1 = hexToHsl(result[0])!;
			const hsl2 = hexToHsl(result[1])!;
			expect(hsl1.h).toBe(150);
			expect(hsl2.h).toBe(210);
		});
	});

	describe('generateMonochromatic', () => {
		it('should return variations of the same hue', () => {
			const result = generateMonochromatic('#ff0000', 4);
			expect(result).toHaveLength(4);
			// All should have hue 0 (red)
			for (const c of result) {
				const hsl = hexToHsl(c)!;
				expect(hsl.h).toBe(0);
			}
		});

		it('should produce different lightness values', () => {
			const result = generateMonochromatic('#3366cc', 3);
			const lightnesses = result.map((c) => hexToHsl(c)!.l);
			// All lightnesses should be different
			const unique = new Set(lightnesses);
			expect(unique.size).toBe(3);
		});
	});

	describe('suggestBackgroundColors', () => {
		it('should suggest light and dark backgrounds', () => {
			const result = suggestBackgroundColors('#3366cc');
			expect(result.light).toBeDefined();
			expect(result.dark).toBeDefined();
			// Light background should have high lightness
			const lightHsl = hexToHsl(result.light)!;
			expect(lightHsl.l).toBeGreaterThan(85);
			// Dark background should have low lightness
			const darkHsl = hexToHsl(result.dark)!;
			expect(darkHsl.l).toBeLessThan(20);
		});

		it('should suggest surface colors', () => {
			const result = suggestBackgroundColors('#3366cc');
			expect(result.lightSurface).toBeDefined();
			expect(result.darkSurface).toBeDefined();
		});
	});

	// ─── New function tests ────────────────────────────────

	describe('getColorName', () => {
		it('should name achromatic colors', () => {
			expect(getColorName('#000000')).toBe('Black');
			expect(getColorName('#ffffff')).toBe('White');
			expect(getColorName('#808080')).toBe('Gray');
		});

		it('should name hue families', () => {
			expect(getColorName('#ff0000')).toContain('Red');
			expect(getColorName('#00ff00')).toContain('Green');
			expect(getColorName('#0000ff')).toContain('Blue');
			expect(getColorName('#ff8800')).toContain('Orange');
		});

		it('should prefix with Vivid for high saturation', () => {
			const name = getColorName('#ff0000');
			expect(name).toContain('Vivid');
		});

		it('should prefix with Dark for low lightness', () => {
			const name = getColorName('#330000');
			expect(name).toContain('Dark');
		});

		it('should prefix with Pale for very high lightness', () => {
			const name = getColorName('#ffe8e8');
			expect(name).toContain('Pale');
		});

		it('should return Unknown for invalid hex', () => {
			expect(getColorName('invalid')).toBe('Unknown');
		});
	});

	describe('getColorTemperature', () => {
		it('should classify red as warm', () => {
			expect(getColorTemperature('#ff0000')).toBe('warm');
		});

		it('should classify blue as cool', () => {
			expect(getColorTemperature('#0000ff')).toBe('cool');
		});

		it('should classify gray as neutral', () => {
			expect(getColorTemperature('#808080')).toBe('neutral');
		});

		it('should classify orange as warm', () => {
			expect(getColorTemperature('#ff8800')).toBe('warm');
		});

		it('should return neutral for invalid hex', () => {
			expect(getColorTemperature('invalid')).toBe('neutral');
		});
	});

	describe('lighten', () => {
		it('should increase lightness', () => {
			const result = lighten('#808080', 20);
			const hsl = hexToHsl(result)!;
			expect(hsl.l).toBeGreaterThan(50);
		});

		it('should not exceed 100% lightness', () => {
			const result = lighten('#cccccc', 90);
			const hsl = hexToHsl(result)!;
			expect(hsl.l).toBeLessThanOrEqual(100);
		});

		it('should return original for invalid hex', () => {
			expect(lighten('invalid', 10)).toBe('invalid');
		});
	});

	describe('darken', () => {
		it('should decrease lightness', () => {
			const result = darken('#808080', 20);
			const hsl = hexToHsl(result)!;
			expect(hsl.l).toBeLessThan(50);
		});

		it('should not go below 0% lightness', () => {
			const result = darken('#333333', 90);
			const hsl = hexToHsl(result)!;
			expect(hsl.l).toBeGreaterThanOrEqual(0);
		});

		it('should return original for invalid hex', () => {
			expect(darken('invalid', 10)).toBe('invalid');
		});
	});

	describe('adjustSaturation', () => {
		it('should increase saturation with positive amount', () => {
			const result = adjustSaturation('#996666', 30);
			const original = hexToHsl('#996666')!;
			const adjusted = hexToHsl(result)!;
			expect(adjusted.s).toBeGreaterThan(original.s);
		});

		it('should decrease saturation with negative amount', () => {
			const result = adjustSaturation('#ff0000', -30);
			const adjusted = hexToHsl(result)!;
			expect(adjusted.s).toBeLessThan(100);
		});

		it('should clamp between 0 and 100', () => {
			const desat = adjustSaturation('#ff0000', -200);
			const hsl = hexToHsl(desat)!;
			expect(hsl.s).toBeGreaterThanOrEqual(0);
		});
	});

	describe('shiftHue', () => {
		it('should shift hue by given degrees', () => {
			const result = shiftHue('#ff0000', 120);
			const hsl = hexToHsl(result)!;
			expect(hsl.h).toBe(120);
		});

		it('should wrap around 360', () => {
			const result = shiftHue('#ff0000', 400);
			const hsl = hexToHsl(result)!;
			expect(hsl.h).toBe(40);
		});

		it('should handle negative shifts', () => {
			const result = shiftHue('#ff0000', -60);
			const hsl = hexToHsl(result)!;
			expect(hsl.h).toBe(300);
		});
	});

	describe('generateFullTheme', () => {
		it('should return all 11 color keys', () => {
			const theme = generateFullTheme('#3366cc');
			expect(theme.primaryColor).toBeDefined();
			expect(theme.secondaryColor).toBeDefined();
			expect(theme.accentColor).toBeDefined();
			expect(theme.backgroundColor).toBeDefined();
			expect(theme.surfaceColor).toBeDefined();
			expect(theme.textColor).toBeDefined();
			expect(theme.textSecondaryColor).toBeDefined();
			expect(theme.borderColor).toBeDefined();
			expect(theme.successColor).toBeDefined();
			expect(theme.warningColor).toBeDefined();
			expect(theme.errorColor).toBeDefined();
		});

		it('should preserve the primary color', () => {
			const theme = generateFullTheme('#3366cc');
			expect(theme.primaryColor).toBe('#3366cc');
		});

		it('should generate dark backgrounds', () => {
			const theme = generateFullTheme('#3366cc');
			const bgHsl = hexToHsl(theme.backgroundColor)!;
			expect(bgHsl.l).toBeLessThan(15);
		});

		it('should generate light text', () => {
			const theme = generateFullTheme('#3366cc');
			const txtHsl = hexToHsl(theme.textColor)!;
			expect(txtHsl.l).toBeGreaterThan(85);
		});

		it('should include status colors', () => {
			const theme = generateFullTheme('#3366cc');
			expect(isValidHex(theme.successColor)).toBe(true);
			expect(isValidHex(theme.warningColor)).toBe(true);
			expect(isValidHex(theme.errorColor)).toBe(true);
		});
	});

	describe('buildContrastMatrix', () => {
		it('should return pairs for text/background combinations', () => {
			const pairs = buildContrastMatrix({
				textColor: '#ffffff',
				backgroundColor: '#000000',
				surfaceColor: '#1a1a1a'
			});
			expect(pairs.length).toBeGreaterThan(0);
			// At least text on background
			const txtOnBg = pairs.find((p) => p.fgLabel === 'Text' && p.bgLabel === 'Background');
			expect(txtOnBg).toBeDefined();
			expect(txtOnBg!.passesAA).toBe(true);
		});

		it('should detect failing contrast', () => {
			const pairs = buildContrastMatrix({
				textColor: '#cccccc',
				backgroundColor: '#ffffff'
			});
			const pair = pairs.find((p) => p.fgLabel === 'Text' && p.bgLabel === 'Background');
			expect(pair).toBeDefined();
			expect(pair!.passesAA).toBe(false);
		});

		it('should return empty array for missing colors', () => {
			const pairs = buildContrastMatrix({});
			expect(pairs).toHaveLength(0);
		});

		it('should include ratio and AAA information', () => {
			const pairs = buildContrastMatrix({
				textColor: '#000000',
				backgroundColor: '#ffffff'
			});
			const pair = pairs[0];
			expect(pair.ratio).toBeCloseTo(21, 0);
			expect(pair.passesAAA).toBe(true);
		});
	});

	describe('PRESET_THEMES', () => {
		it('should have at least 4 preset themes', () => {
			expect(PRESET_THEMES.length).toBeGreaterThanOrEqual(4);
		});

		it('should have unique ids', () => {
			const ids = PRESET_THEMES.map((p) => p.id);
			expect(new Set(ids).size).toBe(ids.length);
		});

		it('should have valid colors in each preset', () => {
			for (const preset of PRESET_THEMES) {
				expect(isValidHex(preset.colors.primaryColor)).toBe(true);
				expect(isValidHex(preset.colors.secondaryColor)).toBe(true);
				expect(isValidHex(preset.colors.accentColor)).toBe(true);
				expect(isValidHex(preset.colors.backgroundColor)).toBe(true);
				expect(isValidHex(preset.colors.textColor)).toBe(true);
			}
		});

		it('should have name and description on each preset', () => {
			for (const preset of PRESET_THEMES) {
				expect(preset.name.length).toBeGreaterThan(0);
				expect(preset.description.length).toBeGreaterThan(0);
			}
		});

		it('should include a mood on each preset', () => {
			for (const preset of PRESET_THEMES) {
				expect(['warm', 'cool', 'neutral', 'vibrant', 'muted']).toContain(preset.mood);
			}
		});
	});

	describe('hexToHsv', () => {
		it('should convert pure red', () => {
			expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 100, v: 100 });
		});

		it('should convert pure green', () => {
			expect(hexToHsv('#00ff00')).toEqual({ h: 120, s: 100, v: 100 });
		});

		it('should convert pure blue', () => {
			expect(hexToHsv('#0000ff')).toEqual({ h: 240, s: 100, v: 100 });
		});

		it('should convert white', () => {
			expect(hexToHsv('#ffffff')).toEqual({ h: 0, s: 0, v: 100 });
		});

		it('should convert black', () => {
			expect(hexToHsv('#000000')).toEqual({ h: 0, s: 0, v: 0 });
		});

		it('should return null for invalid hex', () => {
			expect(hexToHsv('invalid')).toBeNull();
			expect(hexToHsv('')).toBeNull();
		});

		it('should convert mid-range colors', () => {
			const result = hexToHsv('#808080');
			expect(result).not.toBeNull();
			expect(result!.h).toBe(0);
			expect(result!.s).toBe(0);
			expect(result!.v).toBe(50);
		});
	});

	describe('hsvToHex', () => {
		it('should convert pure red', () => {
			expect(hsvToHex(0, 100, 100)).toBe('#ff0000');
		});

		it('should convert pure green', () => {
			expect(hsvToHex(120, 100, 100)).toBe('#00ff00');
		});

		it('should convert pure blue', () => {
			expect(hsvToHex(240, 100, 100)).toBe('#0000ff');
		});

		it('should convert white (zero saturation)', () => {
			expect(hsvToHex(0, 0, 100)).toBe('#ffffff');
		});

		it('should convert black (zero value)', () => {
			expect(hsvToHex(0, 0, 0)).toBe('#000000');
		});

		it('should handle h=360 same as h=0', () => {
			expect(hsvToHex(360, 100, 100)).toBe(hsvToHex(0, 100, 100));
		});

		it('should round-trip through hexToHsv', () => {
			const testColors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6'];
			for (const original of testColors) {
				const hsv = hexToHsv(original);
				expect(hsv).not.toBeNull();
				const roundTripped = hsvToHex(hsv!.h, hsv!.s, hsv!.v);
				const hsv2 = hexToHsv(roundTripped);
				expect(hsv2).toEqual(hsv);
			}
		});

		it('should clamp out-of-range values', () => {
			// Should not throw
			const hex = hsvToHex(0, 150, 150);
			expect(hex).toBeTruthy();
			expect(isValidHex(hex)).toBe(true);
		});
	});

	describe('generateTetradic', () => {
		it('should return 3 colors at 90° intervals', () => {
			const result = generateTetradic('#ff0000');
			expect(result).toHaveLength(3);
		});

		it('should produce colors at 90°, 180°, and 270° from base', () => {
			const result = generateTetradic('#ff0000'); // hue 0
			const hues = result.map((c) => hexToHsl(c)!.h);
			expect(hues[0]).toBe(90);
			expect(hues[1]).toBe(180);
			expect(hues[2]).toBe(270);
		});

		it('should wrap around 360°', () => {
			// Blue = 240°, so 240+90=330, 240+180=60, 240+270=150
			const result = generateTetradic('#0000ff');
			const hues = result.map((c) => hexToHsl(c)!.h);
			expect(hues[0]).toBe(330);
			expect(hues[1]).toBe(60);
			expect(hues[2]).toBe(150);
		});

		it('should preserve saturation and lightness', () => {
			const base = hexToHsl('#3366cc')!;
			const result = generateTetradic('#3366cc');
			for (const c of result) {
				const hsl = hexToHsl(c)!;
				expect(hsl.s).toBe(base.s);
				expect(hsl.l).toBe(base.l);
			}
		});

		it('should return valid hex colors', () => {
			const result = generateTetradic('#ff8800');
			for (const c of result) {
				expect(isValidHex(c)).toBe(true);
			}
		});
	});

	describe('getPerceivedBrightness', () => {
		it('should return 0 for black', () => {
			expect(getPerceivedBrightness('#000000')).toBe(0);
		});

		it('should return 255 for white', () => {
			expect(getPerceivedBrightness('#ffffff')).toBe(255);
		});

		it('should rate green as brighter than blue', () => {
			// Green has higher perceived brightness due to luminosity coefficients
			const green = getPerceivedBrightness('#00ff00');
			const blue = getPerceivedBrightness('#0000ff');
			expect(green).toBeGreaterThan(blue);
		});

		it('should rate pure red as medium brightness', () => {
			const red = getPerceivedBrightness('#ff0000');
			expect(red).toBeGreaterThan(50);
			expect(red).toBeLessThan(200);
		});

		it('should return mid-range for gray', () => {
			const gray = getPerceivedBrightness('#808080');
			expect(gray).toBeGreaterThan(100);
			expect(gray).toBeLessThan(150);
		});

		it('should return 0 for invalid hex', () => {
			expect(getPerceivedBrightness('invalid')).toBe(0);
		});
	});

	describe('shouldUseDarkText', () => {
		it('should return true for white background', () => {
			expect(shouldUseDarkText('#ffffff')).toBe(true);
		});

		it('should return false for black background', () => {
			expect(shouldUseDarkText('#000000')).toBe(false);
		});

		it('should return true for light yellow', () => {
			expect(shouldUseDarkText('#ffff00')).toBe(true);
		});

		it('should return false for dark blue', () => {
			expect(shouldUseDarkText('#000066')).toBe(false);
		});

		it('should return true for light gray', () => {
			expect(shouldUseDarkText('#cccccc')).toBe(true);
		});

		it('should return false for dark gray', () => {
			expect(shouldUseDarkText('#333333')).toBe(false);
		});
	});

	describe('blendColors', () => {
		it('should return color1 when amount is 0', () => {
			const result = blendColors('#ff0000', '#0000ff', 0);
			expect(result).toBe('#ff0000');
		});

		it('should return color2 when amount is 1', () => {
			const result = blendColors('#ff0000', '#0000ff', 1);
			expect(result).toBe('#0000ff');
		});

		it('should return a midpoint at 0.5', () => {
			const result = blendColors('#000000', '#ffffff', 0.5);
			const rgb = hexToRgb(result)!;
			// Each channel should be around 128
			expect(rgb.r).toBeGreaterThanOrEqual(126);
			expect(rgb.r).toBeLessThanOrEqual(130);
			expect(rgb.g).toBeGreaterThanOrEqual(126);
			expect(rgb.g).toBeLessThanOrEqual(130);
		});

		it('should blend red and blue', () => {
			const result = blendColors('#ff0000', '#0000ff', 0.5);
			const rgb = hexToRgb(result)!;
			// Should have roughly equal red and blue, no green
			expect(rgb.r).toBeGreaterThan(100);
			expect(rgb.b).toBeGreaterThan(100);
			expect(rgb.g).toBe(0);
		});

		it('should return valid hex', () => {
			const result = blendColors('#3366cc', '#cc6633', 0.3);
			expect(isValidHex(result)).toBe(true);
		});

		it('should return first color when inputs are invalid', () => {
			const result = blendColors('invalid', '#ff0000', 0.5);
			// Falls back to hex1 when parsing fails
			expect(result).toBe('invalid');
		});
	});
});
