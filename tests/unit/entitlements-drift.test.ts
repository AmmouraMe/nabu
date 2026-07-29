/**
 * The pricing page and the gate must say the same thing.
 *
 * `PRICING_FEATURES` is the promise we publish; `TIER_FEATURES` / `METERED_LIMITS`
 * are what the server enforces. They are separate structures on purpose (a marketing
 * cell can be prose, a gate cannot), which means they can drift — and drift here is
 * either a broken promise to a paying customer or a free account quietly getting a
 * paid capability. This suite makes that a failing build instead.
 */
import { describe, it, expect } from 'vitest';
import {
	FEATURE_MATRIX_ROW,
	FEATURE_STRING_READINGS,
	METERED_LIMITS,
	METERED_METRICS,
	PRICING_FEATURES,
	PRICING_TIERS,
	TIER_FEATURES,
	getTierLimits,
	normalizeTier,
	tierAllowance,
	tierHasFeature,
	type TierFeature,
	type TierId
} from '$lib/utils/pricing';

const TIER_IDS: TierId[] = PRICING_TIERS.map((t) => t.id);

function cellFor(rowName: string, tier: TierId): boolean | string {
	const row = PRICING_FEATURES.find((f) => f.name === rowName);
	if (!row) throw new Error(`No pricing row named "${rowName}"`);
	return row.tiers[tier];
}

/** "5,000/mo" → 5000. Returns null for a cell that states no number. */
function numberIn(cell: boolean | string): number | null {
	if (typeof cell !== 'string') return null;
	const match = cell.replace(/,/g, '').match(/\d+/);
	return match ? Number(match[0]) : null;
}

describe('metered limits match the published numbers', () => {
	it('names a real pricing row for every metric', () => {
		for (const metric of METERED_METRICS) {
			expect(
				PRICING_FEATURES.some((f) => f.name === METERED_LIMITS[metric]),
				`metric ${metric} points at a row that does not exist`
			).toBe(true);
		}
	});

	it.each(METERED_METRICS)('%s allowance equals the matrix cell on every tier', (metric) => {
		for (const tier of TIER_IDS) {
			const advertised = numberIn(cellFor(METERED_LIMITS[metric], tier));
			expect(advertised, `${METERED_LIMITS[metric]} / ${tier} states no number`).not.toBeNull();
			expect(tierAllowance(tier, metric), `${metric} on ${tier}`).toBe(advertised);
		}
	});

	it('gives the free tier a real, finite allowance for each metric', () => {
		// A zero would silently disable a feature the pricing page sells as included,
		// and a negative or missing one would make `consumeUsage` reject everything.
		for (const metric of METERED_METRICS) {
			const allowance = tierAllowance('starter', metric);
			expect(Number.isInteger(allowance)).toBe(true);
			expect(allowance).toBeGreaterThan(0);
		}
	});
});

describe('feature grants match the published matrix', () => {
	const features = Object.keys(FEATURE_MATRIX_ROW) as TierFeature[];

	it('names a real pricing row for every gated feature', () => {
		for (const feature of features) {
			expect(
				PRICING_FEATURES.some((f) => f.name === FEATURE_MATRIX_ROW[feature]),
				`feature ${feature} points at a row that does not exist`
			).toBe(true);
		}
	});

	it.each(features)('%s agrees with the matrix on every tier', (feature) => {
		for (const tier of TIER_IDS) {
			const cell = cellFor(FEATURE_MATRIX_ROW[feature], tier);
			const granted = tierHasFeature(tier, feature);

			if (typeof cell === 'boolean') {
				expect(granted, `${feature} on ${tier}`).toBe(cell);
				continue;
			}

			// A qualifier cell has to have been read deliberately — see
			// FEATURE_STRING_READINGS for why guessing is not safe here.
			const reading = FEATURE_STRING_READINGS.find((r) => r.feature === feature && r.tier === tier);
			expect(
				reading,
				`"${FEATURE_MATRIX_ROW[feature]}" on ${tier} says "${cell}" — add it to FEATURE_STRING_READINGS with the access it implies`
			).toBeDefined();
			expect(reading!.cell).toBe(cell);
			expect(granted, `${feature} on ${tier}`).toBe(reading!.granted);
		}
	});

	it('grants nothing on the free tier that costs us money to serve', () => {
		// The whole point of the exercise. If a future edit flips one of these to true
		// on starter, it should take a deliberate change to this list too.
		for (const feature of [
			'voiceChat',
			'aiLogoGeneration',
			'autoPublish',
			'brandExport'
		] as const) {
			expect(tierHasFeature('starter', feature), feature).toBe(false);
		}
	});

	it('covers every tier in every grant', () => {
		for (const feature of features) {
			for (const tier of TIER_IDS) {
				expect(typeof TIER_FEATURES[feature][tier], `${feature}/${tier}`).toBe('boolean');
			}
		}
	});
});

describe('normalizeTier', () => {
	it('accepts the real tiers', () => {
		for (const tier of TIER_IDS) {
			expect(normalizeTier(tier)).toBe(tier);
		}
	});

	it.each([null, undefined, '', 'enterprise', 'STARTER', 'free'])(
		'falls back to the free tier for %p',
		(value) => {
			expect(normalizeTier(value as string | null | undefined)).toBe('starter');
		}
	);
});

describe('getTierLimits', () => {
	it('returns the limits of the named tier', () => {
		expect(getTierLimits('business').aiVideoGenerations).toBe(200);
		expect(getTierLimits('starter').teamMembers).toBe(1);
		expect(getTierLimits('starter').storageGB).toBe(1);
	});
});
