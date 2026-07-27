import { describe, expect, it } from 'vitest';
import { buildLogoPrompt, isLogoStyle, LOGO_STYLES } from '../../src/lib/server/logo-prompt';

describe('buildLogoPrompt', () => {
	it('names the brand and the style', () => {
		const p = buildLogoPrompt({ brandName: 'DanceMonkey' }, 'lettermark');
		expect(p).toContain('DanceMonkey');
		expect(p).toContain('monogram');
	});

	it('always carries the constraints that make output usable as a mark', () => {
		const p = buildLogoPrompt({ brandName: 'X' }, 'abstract');
		// Without these an image model returns shaded illustration, not a logo.
		expect(p).toContain('flat vector');
		expect(p).toContain('legible at small sizes');
		expect(p).toContain('no gradients');
		expect(p).toContain('no photorealism');
	});

	it('survives an empty brand without producing a broken sentence', () => {
		const p = buildLogoPrompt({});
		expect(p).toContain('an unnamed brand');
		expect(p).not.toContain('""');
		expect(p).not.toContain('undefined');
		expect(p).not.toContain('null');
	});

	it('uses the palette when both colours are real hex', () => {
		const p = buildLogoPrompt({
			brandName: 'X',
			primaryColor: '#3498db',
			secondaryColor: '#f1c40f'
		});
		expect(p).toContain('#3498db');
		expect(p).toContain('#f1c40f');
	});

	it('ignores prose left in a colour field by extraction', () => {
		// "a warm, vibrant orange" must never reach the model as a colour instruction.
		const p = buildLogoPrompt({ brandName: 'X', primaryColor: 'a warm vibrant orange' });
		expect(p).not.toContain('warm vibrant orange');
		expect(p).toContain('at most two colours');
	});

	it('falls back to a two-colour limit with no palette at all', () => {
		expect(buildLogoPrompt({ brandName: 'X' })).toContain('at most two colours');
	});

	it('includes an agreed logo concept when present', () => {
		const p = buildLogoPrompt({ brandName: 'X', logoConcept: 'a monkey mid-spin' });
		expect(p).toContain('a monkey mid-spin');
	});

	it('appends caller direction without dropping the constraints', () => {
		// An app asking for "playful" should still get something printable.
		const p = buildLogoPrompt({ brandName: 'X' }, 'abstract', 'make it playful');
		expect(p).toContain('make it playful');
		expect(p).toContain('flat vector');
	});

	it('produces a distinct direction for every style', () => {
		const prompts = LOGO_STYLES.map((s) => buildLogoPrompt({ brandName: 'X' }, s));
		expect(new Set(prompts).size).toBe(LOGO_STYLES.length);
	});
});

describe('isLogoStyle', () => {
	it('accepts the known styles', () => {
		for (const s of LOGO_STYLES) expect(isLogoStyle(s)).toBe(true);
	});

	it('rejects anything else', () => {
		expect(isLogoStyle('freeform')).toBe(false);
		expect(isLogoStyle(undefined)).toBe(false);
		expect(isLogoStyle(42)).toBe(false);
	});
});
