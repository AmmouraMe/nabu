/**
 * Branch coverage for the tone/fallback variants in brand-book.ts and the
 * field conditionals in onboarding's context builders. Complements
 * brand-book.test.ts, which only exercises the 'professional' tone.
 */
import { describe, it, expect } from 'vitest';
import { generateBrandBookHtml, brandBookR2Key } from '../../src/lib/services/brand-book';
import { buildBrandContextString } from '../../src/lib/services/onboarding';

const baseProfile = {
	id: 'bp1',
	brand_name: 'Acme',
	tagline: 'We build',
	mission_statement: 'To build',
	primary_color: '#123456',
	secondary_color: '#abcdef',
	accent_color: '#fff',
	color_palette: JSON.stringify(['#111111', '#222222']),
	background_color: '#ffffff',
	surface_color: '#f0f0f0',
	text_color: '#000000',
	text_secondary_color: '#555555',
	border_color: '#dddddd',
	typography_heading: 'Inter',
	typography_body: 'Georgia',
	typography_logo: 'Rubik',
	logo_url: 'https://x/logo.png',
	logo_horizontal_url: 'https://x/logo-h.png',
	tone_of_voice: 'professional',
	communication_style: 'conversational',
	brand_personality_traits: JSON.stringify(['bold', 'kind']),
	target_audience: 'devs',
	value_proposition: 'speed',
	unique_selling_points: JSON.stringify(['fast', 'cheap']),
	brand_values: JSON.stringify(['trust']),
	brand_archetype: 'Creator',
	industry: 'SaaS'
};

describe('generateBrandBookHtml — tone variants', () => {
	// Each tone flips a different arm across the voice-card ternaries.
	for (const tone of ['playful', 'bold and confident', 'warm and friendly', 'inscrutable']) {
		it(`renders for a ${tone} tone`, () => {
			const html = generateBrandBookHtml({ ...baseProfile, tone_of_voice: tone } as any, 'light');
			expect(html).toContain('<!doctype html>');
			expect(html).toContain('Acme');
		});
	}

	it('renders in dark mode with a null tone and style', () => {
		const html = generateBrandBookHtml(
			{ ...baseProfile, tone_of_voice: null, communication_style: null, brand_name: null } as any,
			'dark'
		);
		expect(html).toContain('<!doctype html>');
	});
});

describe('generateBrandBookHtml — value fallbacks', () => {
	it('falls back on invalid hex colors', () => {
		const html = generateBrandBookHtml(
			{
				...baseProfile,
				primary_color: 'not-a-color',
				secondary_color: '',
				accent_color: null
			} as any,
			'light'
		);
		expect(html).toContain('<!doctype html>');
	});

	it('tolerates a malformed color_palette and a non-array palette', () => {
		expect(
			generateBrandBookHtml({ ...baseProfile, color_palette: '{oops' } as any, 'light')
		).toContain('<!doctype html>');
		expect(
			generateBrandBookHtml({ ...baseProfile, color_palette: '{"a":1}' } as any, 'light')
		).toContain('<!doctype html>');
		expect(
			generateBrandBookHtml({ ...baseProfile, color_palette: null } as any, 'light')
		).toContain('<!doctype html>');
	});

	it('tolerates malformed JSON list fields', () => {
		const html = generateBrandBookHtml(
			{
				...baseProfile,
				brand_personality_traits: 'not json',
				unique_selling_points: '{"x":1}',
				brand_values: null
			} as any,
			'light'
		);
		expect(html).toContain('<!doctype html>');
	});

	it('renders an all-null profile', () => {
		const nulls: any = { id: 'bp2' };
		for (const k of Object.keys(baseProfile)) if (k !== 'id') nulls[k] = null;
		expect(generateBrandBookHtml(nulls, 'light')).toContain('<!doctype html>');
		expect(generateBrandBookHtml(nulls, 'dark')).toContain('<!doctype html>');
	});
});

describe('brandBookR2Key', () => {
	it('namespaces by profile and mode', () => {
		expect(brandBookR2Key('bp1', 'light')).toContain('bp1');
		expect(brandBookR2Key('bp1', 'dark')).not.toBe(brandBookR2Key('bp1', 'light'));
	});
});

describe('buildBrandContextString', () => {
	it('returns an empty string when nothing is known', () => {
		expect(buildBrandContextString({})).toBe('');
	});

	it('includes every populated field', () => {
		const ctx = buildBrandContextString({
			brandName: 'Acme',
			tagline: 'We build',
			industry: 'SaaS',
			missionStatement: 'To build',
			brandArchetype: 'Creator',
			toneOfVoice: 'warm',
			communicationStyle: 'direct',
			brandPersonalityTraits: 'bold, kind',
			targetAudience: 'devs',
			customerPainPoints: 'slow tools',
			valueProposition: 'speed',
			primaryColor: '#111',
			secondaryColor: '#222',
			accentColor: '#333',
			colorPalette: ['#111', '#222'],
			typographyLogo: 'Rubik',
			typographyHeading: 'Inter',
			typographyBody: 'Georgia',
			logoConcept: 'a chevron',
			marketPosition: 'premium',
			competitors: 'others',
			uniqueSellingPoints: 'fast',
			brandValues: 'trust',
			brandPromise: 'always on',
			originStory: 'a garage'
		} as any);

		for (const needle of [
			'Acme',
			'We build',
			'Creator',
			'warm',
			'devs',
			'#111, #222',
			'Rubik',
			'premium',
			'trust',
			'a garage'
		]) {
			expect(ctx).toContain(needle);
		}
	});

	it('accepts a JSON-encoded colorPalette string', () => {
		const ctx = buildBrandContextString({ colorPalette: '["#a1a1a1","#b2b2b2"]' } as any);
		expect(ctx).toContain('#a1a1a1');
	});
});
