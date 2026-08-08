/**
 * Tests for Pricing Section
 * TDD: Verifies pricing tier logic, feature gating, and display
 */
import { describe, it, expect } from 'vitest';

import {
	PRICING_TIERS,
	PRICING_FEATURES,
	FREE_SOCIAL_ACCOUNTS_PER_BRAND,
	getFeatureAvailability,
	formatPrice,
	getAnnualPrice,
	getAnnualSavings,
	type PricingTier,
	type PricingFeature
} from '$lib/utils/pricing';

describe('Pricing Tiers', () => {
	it('should define exactly 3 tiers: starter, pro, business', () => {
		expect(PRICING_TIERS).toHaveLength(3);
		expect(PRICING_TIERS.map((t: PricingTier) => t.id)).toEqual(['starter', 'pro', 'business']);
	});

	it('each tier should have required properties', () => {
		for (const tier of PRICING_TIERS) {
			expect(tier).toHaveProperty('id');
			expect(tier).toHaveProperty('name');
			expect(tier).toHaveProperty('description');
			expect(tier).toHaveProperty('monthlyPrice');
			expect(tier).toHaveProperty('annualPrice');
			expect(tier).toHaveProperty('highlighted');
			expect(tier).toHaveProperty('cta');
			expect(tier).toHaveProperty('limits');
		}
	});

	it('starter tier should be free', () => {
		const starter = PRICING_TIERS.find((t: PricingTier) => t.id === 'starter');
		expect(starter).toBeDefined();
		expect(starter!.monthlyPrice).toBe(0);
		expect(starter!.annualPrice).toBe(0);
	});

	it('pro tier should be the highlighted/recommended tier', () => {
		const pro = PRICING_TIERS.find((t: PricingTier) => t.id === 'pro');
		expect(pro).toBeDefined();
		expect(pro!.highlighted).toBe(true);
	});

	it('prices should increase from starter to business', () => {
		expect(PRICING_TIERS[0].monthlyPrice).toBeLessThan(PRICING_TIERS[1].monthlyPrice);
		expect(PRICING_TIERS[1].monthlyPrice).toBeLessThan(PRICING_TIERS[2].monthlyPrice);
	});

	it('annual price per month should be less than monthly price', () => {
		for (const tier of PRICING_TIERS) {
			if (tier.monthlyPrice > 0) {
				const annualMonthly = tier.annualPrice / 12;
				expect(annualMonthly).toBeLessThan(tier.monthlyPrice);
			}
		}
	});

	it('should not impose brand limits', () => {
		for (const tier of PRICING_TIERS) {
			expect(tier.limits).not.toHaveProperty('brands');
		}
	});

	it('each tier should have AI generation limits', () => {
		for (const tier of PRICING_TIERS) {
			expect(tier.limits).toHaveProperty('aiTextGenerations');
			expect(tier.limits).toHaveProperty('aiImageGenerations');
			expect(tier.limits).toHaveProperty('aiVideoGenerations');
		}
	});

	it('each tier should have storage limits', () => {
		for (const tier of PRICING_TIERS) {
			expect(tier.limits).toHaveProperty('storageGB');
			expect(typeof tier.limits.storageGB).toBe('number');
		}
	});

	it('should include 3 free social accounts per brand for all tiers', () => {
		expect(FREE_SOCIAL_ACCOUNTS_PER_BRAND).toBe(3);
		for (const tier of PRICING_TIERS) {
			expect(tier.limits).not.toHaveProperty('socialAccounts');
		}
	});

	it('higher tiers should have higher or equal limits', () => {
		const [starter, pro, business] = PRICING_TIERS;

		expect(pro.limits.aiTextGenerations).toBeGreaterThanOrEqual(starter.limits.aiTextGenerations);
		expect(business.limits.aiTextGenerations).toBeGreaterThanOrEqual(pro.limits.aiTextGenerations);

		expect(pro.limits.storageGB).toBeGreaterThanOrEqual(starter.limits.storageGB);
		expect(business.limits.storageGB).toBeGreaterThanOrEqual(pro.limits.storageGB);
	});
});

describe('Pricing Features', () => {
	it('should define features across all key categories', () => {
		const categories = [...new Set(PRICING_FEATURES.map((f: PricingFeature) => f.category))];
		expect(categories).toContain('brand');
		expect(categories).toContain('content');
		expect(categories).toContain('publishing');
		expect(categories).toContain('support');
	});

	it('each feature should specify availability for all tiers', () => {
		for (const feature of PRICING_FEATURES) {
			expect(feature).toHaveProperty('name');
			expect(feature).toHaveProperty('category');
			expect(feature).toHaveProperty('tiers');
			expect(feature.tiers).toHaveProperty('starter');
			expect(feature.tiers).toHaveProperty('pro');
			expect(feature.tiers).toHaveProperty('business');
		}
	});

	it('tier availability should be boolean or string', () => {
		for (const feature of PRICING_FEATURES) {
			for (const value of Object.values(feature.tiers)) {
				expect(typeof value === 'boolean' || typeof value === 'string').toBe(true);
			}
		}
	});
});

describe('getFeatureAvailability', () => {
	it('should return availability for a valid feature and tier', () => {
		const firstFeature = PRICING_FEATURES[0];
		const result = getFeatureAvailability(firstFeature.name, 'starter');
		expect(result).toBe(firstFeature.tiers.starter);
	});

	it('should return false for a non-existent feature', () => {
		const result = getFeatureAvailability('nonexistent-feature', 'pro');
		expect(result).toBe(false);
	});

	it('should return false for an invalid tier', () => {
		const firstFeature = PRICING_FEATURES[0];
		const result = getFeatureAvailability(firstFeature.name, 'invalid' as any);
		expect(result).toBe(false);
	});
});

describe('formatPrice', () => {
	it('should format 0 as "Free"', () => {
		expect(formatPrice(0)).toBe('Free');
	});

	it('should format whole numbers without decimals', () => {
		expect(formatPrice(29)).toBe('$29');
	});

	it('should format decimal numbers with two decimal places', () => {
		expect(formatPrice(29.99)).toBe('$29.99');
	});

	it('should format large numbers correctly', () => {
		expect(formatPrice(199)).toBe('$199');
	});
});

describe('getAnnualPrice', () => {
	it('should return 0 for free tier', () => {
		const starter = PRICING_TIERS.find((t: PricingTier) => t.id === 'starter')!;
		expect(getAnnualPrice(starter)).toBe(0);
	});

	it('should return the monthly equivalent of annual price', () => {
		const pro = PRICING_TIERS.find((t: PricingTier) => t.id === 'pro')!;
		const expected = Math.round((pro.annualPrice / 12) * 100) / 100;
		expect(getAnnualPrice(pro)).toBe(expected);
	});
});

describe('getAnnualSavings', () => {
	it('should return 0 for free tier', () => {
		const starter = PRICING_TIERS.find((t: PricingTier) => t.id === 'starter')!;
		expect(getAnnualSavings(starter)).toBe(0);
	});

	it('should return positive savings percentage for paid tiers', () => {
		for (const tier of PRICING_TIERS) {
			if (tier.monthlyPrice > 0) {
				const savings = getAnnualSavings(tier);
				expect(savings).toBeGreaterThan(0);
				expect(savings).toBeLessThan(100);
			}
		}
	});

	it('should calculate savings correctly', () => {
		const pro = PRICING_TIERS.find((t: PricingTier) => t.id === 'pro')!;
		const monthlyTotal = pro.monthlyPrice * 12;
		const annualTotal = pro.annualPrice;
		const expectedSavings = Math.round(((monthlyTotal - annualTotal) / monthlyTotal) * 100);
		expect(getAnnualSavings(pro)).toBe(expectedSavings);
	});
});
