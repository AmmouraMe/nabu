import { describe, expect, it } from 'vitest';
import {
	BRAND_COMPLETION_ITEMS,
	computeBrandCompletion
} from '../../src/lib/services/brand-completion';
import type { BrandProfile } from '../../src/lib/types/onboarding';

function profile(overrides: Partial<BrandProfile> = {}): BrandProfile {
	return {
		id: 'b1',
		userId: 'u1',
		status: 'in_progress',
		brandNameConfirmed: false,
		onboardingStep: 'welcome',
		createdAt: '',
		updatedAt: '',
		...overrides
	} as BrandProfile;
}

/** Fill every item so the profile scores 100. */
function completeProfile(): BrandProfile {
	return profile({
		brandName: 'DanceMonkey',
		brandNameConfirmed: true,
		tagline: 'Move',
		missionStatement: 'm',
		elevatorPitch: 'e',
		visionStatement: 'v',
		targetAudience: 'a',
		valueProposition: 'vp',
		customerPainPoints: 'p',
		brandArchetype: 'jester',
		toneOfVoice: 't',
		brandPersonalityTraits: 'tr',
		primaryColor: '#3498db',
		secondaryColor: '#f1c40f',
		accentColor: '#2ecc71',
		typographyHeading: 'Inter',
		typographyBody: 'Inter',
		logoUrl: 'https://example.com/logo.png',
		industry: 'i',
		uniqueSellingPoints: 'u',
		marketPosition: 'premium',
		competitors: 'c',
		originStory: 'o',
		brandValues: 'bv',
		brandPromise: 'bp'
	});
}

describe('computeBrandCompletion', () => {
	it('scores an empty profile at zero and lists everything as missing', () => {
		const result = computeBrandCompletion(profile());
		expect(result.percent).toBe(0);
		expect(result.earned).toBe(0);
		expect(result.missing).toHaveLength(BRAND_COMPLETION_ITEMS.length);
		expect(result.completed).toHaveLength(0);
	});

	it('does not throw on a null profile', () => {
		const result = computeBrandCompletion(null);
		expect(result.percent).toBe(0);
		expect(result.nextBest).not.toBeNull();
	});

	it('reaches exactly 100 with nothing outstanding', () => {
		const result = computeBrandCompletion(completeProfile());
		expect(result.percent).toBe(100);
		expect(result.missing).toHaveLength(0);
		expect(result.nextBest).toBeNull();
	});

	it('never reports 100 while an item is still outstanding', () => {
		// One low-weight item missing out of a large total would round to 100.
		const nearly = completeProfile();
		delete (nearly as unknown as Record<string, unknown>).brandPromise;
		const result = computeBrandCompletion(nearly);
		expect(result.missing.length).toBeGreaterThan(0);
		expect(result.percent).toBeLessThan(100);
	});

	it('treats an unconfirmed brand name as incomplete', () => {
		// A system-generated codename is not a decision the user has made.
		const result = computeBrandCompletion(
			profile({ brandName: 'Codename Falcon', brandNameConfirmed: false })
		);
		expect(result.missing.some((i) => i.key === 'brandName')).toBe(true);

		const confirmed = computeBrandCompletion(
			profile({ brandName: 'Codename Falcon', brandNameConfirmed: true })
		);
		expect(confirmed.completed.some((i) => i.key === 'brandName')).toBe(true);
	});

	it('rejects prose in a colour field', () => {
		// Extraction can leave "a warm, vibrant orange" in the column.
		const result = computeBrandCompletion(profile({ primaryColor: 'a warm vibrant orange' }));
		expect(result.missing.some((i) => i.key === 'primaryColor')).toBe(true);
	});

	it('accepts both hex forms', () => {
		expect(
			computeBrandCompletion(profile({ primaryColor: '#3498db' })).completed.some(
				(i) => i.key === 'primaryColor'
			)
		).toBe(true);
		expect(
			computeBrandCompletion(profile({ primaryColor: '#abc' })).completed.some(
				(i) => i.key === 'primaryColor'
			)
		).toBe(true);
	});

	it('treats whitespace-only text as missing', () => {
		const result = computeBrandCompletion(profile({ tagline: '   ' }));
		expect(result.missing.some((i) => i.key === 'tagline')).toBe(true);
	});

	it('does not count a logo concept as having a logo', () => {
		// Otherwise a brand hits 100% with no actual mark to put on anything.
		const result = computeBrandCompletion(profile({ logoConcept: 'a monkey mid-spin' }));
		expect(result.missing.some((i) => i.key === 'logoUrl')).toBe(true);
	});

	it('picks the heaviest outstanding item as next best', () => {
		const result = computeBrandCompletion(profile());
		expect(result.nextBest?.weight).toBe(3);
	});

	it('follows checklist order when weights tie', () => {
		// All weight-3 items outstanding: the first in the natural arc should win.
		const result = computeBrandCompletion(profile());
		expect(result.nextBest?.key).toBe('brandName');
	});

	it('moves on to the next item once the heaviest is satisfied', () => {
		const result = computeBrandCompletion(profile({ brandName: 'X', brandNameConfirmed: true }));
		expect(result.nextBest?.key).not.toBe('brandName');
	});

	it('reports per-group progress', () => {
		const result = computeBrandCompletion(
			profile({ primaryColor: '#3498db', secondaryColor: '#f1c40f' })
		);
		const visual = result.groups.find((g) => g.group === 'visual');
		expect(visual).toBeDefined();
		expect(visual!.earned).toBeGreaterThan(0);
		expect(visual!.percent).toBeLessThan(100);

		const story = result.groups.find((g) => g.group === 'story');
		expect(story!.earned).toBe(0);
	});

	it('exposes a card type and a gentle prompt for every item', () => {
		for (const item of BRAND_COMPLETION_ITEMS) {
			expect(item.card).toBeTruthy();
			expect(item.prompt.length).toBeGreaterThan(0);
			// Nudges are invitations, not scoldings.
			expect(item.prompt).not.toMatch(/must|required|failed/i);
		}
	});

	it('gives every item a short label and an icon for the foundation rail', () => {
		for (const item of BRAND_COMPLETION_ITEMS) {
			expect(item.icon).toBeTruthy();
			expect(item.short.length).toBeGreaterThan(0);
			// Long enough to identify, short enough to sit under a 30px circle without
			// wrapping — anything past this breaks the rail's alignment.
			expect(item.short.length).toBeLessThanOrEqual(10);
		}
	});

	it('has unique keys', () => {
		const keys = BRAND_COMPLETION_ITEMS.map((i) => i.key);
		expect(new Set(keys).size).toBe(keys.length);
	});
});
