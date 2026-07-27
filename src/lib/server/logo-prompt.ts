/**
 * Prompt construction for logo generation.
 *
 * Kept separate from the route so it can be tested without a database or an AI
 * binding, and so the wording is reviewable in one place — the prompt is the entire
 * difference between a logo and a stock illustration.
 */

export interface LogoBrandContext {
	brandName?: string | null;
	industry?: string | null;
	brandPersonalityTraits?: string | null;
	primaryColor?: string | null;
	secondaryColor?: string | null;
	logoConcept?: string | null;
}

export type LogoStyle = 'wordmark' | 'lettermark' | 'abstract' | 'mascot' | 'emblem';

export const LOGO_STYLES: LogoStyle[] = ['wordmark', 'lettermark', 'abstract', 'mascot', 'emblem'];

/**
 * What each style actually asks the model for. Generic prompts return illustrations;
 * these name the form.
 */
const STYLE_DIRECTION: Record<LogoStyle, string> = {
	wordmark: 'a typographic wordmark, the brand name set as a custom letterform',
	lettermark: 'a monogram built from the brand initials, geometric and tightly constructed',
	abstract: 'a single abstract geometric mark, no letters and no representational objects',
	mascot: 'one simple stylised character mark, flat and friendly, no scene around it',
	emblem: 'a badge-style emblem, the mark contained within a simple bounding shape'
};

/**
 * Constraints that make output usable as a logo rather than as art.
 *
 * The negatives matter more than the positives: image models default to detailed,
 * shaded, photographic output, which is the opposite of a mark that has to survive
 * being printed at 16px.
 */
const LOGO_CONSTRAINTS = [
	'flat vector style',
	'solid shapes',
	'high contrast',
	'centred composition',
	'plain uncluttered background',
	'legible at small sizes',
	'no photorealism',
	'no drop shadows',
	'no gradients',
	'no 3D rendering',
	'no mockups',
	'no watermarks',
	'no lorem ipsum text'
].join(', ');

/** Only real hex reaches the prompt; extraction leaves prose in colour columns. */
function usableColor(value: string | null | undefined): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed) ? trimmed : null;
}

/**
 * Build a logo prompt from brand context.
 *
 * A caller-supplied `instruction` is appended rather than replacing the constraints:
 * an app asking for "something playful" should still get something printable.
 */
export function buildLogoPrompt(
	brand: LogoBrandContext,
	style: LogoStyle = 'abstract',
	instruction?: string
): string {
	const name = (brand.brandName || '').trim() || 'an unnamed brand';
	const parts: string[] = [`Design ${STYLE_DIRECTION[style]} for "${name}".`];

	if (brand.industry?.trim()) {
		parts.push(`Industry: ${brand.industry.trim()}.`);
	}
	if (brand.brandPersonalityTraits?.trim()) {
		parts.push(`Personality: ${brand.brandPersonalityTraits.trim()}.`);
	}

	const primary = usableColor(brand.primaryColor);
	const secondary = usableColor(brand.secondaryColor);
	if (primary && secondary) {
		parts.push(`Use a restrained palette of ${primary} and ${secondary}.`);
	} else if (primary) {
		parts.push(`Built around the colour ${primary}.`);
	} else {
		// Without a brand palette, a two-tone constraint still beats letting the model
		// pick a rainbow.
		parts.push('Use at most two colours.');
	}

	if (brand.logoConcept?.trim()) {
		parts.push(`Direction already agreed with the client: ${brand.logoConcept.trim()}.`);
	}
	if (instruction?.trim()) {
		parts.push(`Additional direction: ${instruction.trim()}.`);
	}

	parts.push(`Style requirements: ${LOGO_CONSTRAINTS}.`);
	return parts.join(' ');
}

export function isLogoStyle(value: unknown): value is LogoStyle {
	return typeof value === 'string' && LOGO_STYLES.includes(value as LogoStyle);
}
