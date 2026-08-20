import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Tests for video generation cost calculation.
 *
 * Covers:
 * - calculateVideoCostFromPricing: computes cost from VideoModelPricing
 * - lookupVideoModelCost: looks up pricing from provider registry
 */

// ─────────────────────────────────────
//  Unit tests for calculateVideoCostFromPricing
// ─────────────────────────────────────
describe('calculateVideoCostFromPricing', () => {
	it('should calculate cost for per-second pricing model', async () => {
		const { calculateVideoCostFromPricing } = await import('../../src/lib/utils/cost.js');
		const cost = calculateVideoCostFromPricing(
			{ estimatedCostPerSecond: 0.1, currency: 'USD' },
			10
		);
		expect(cost).toBeCloseTo(1.0, 4);
	});

	it('should calculate cost for sora-2-pro at $0.30/sec for 8 seconds', async () => {
		const { calculateVideoCostFromPricing } = await import('../../src/lib/utils/cost.js');
		const cost = calculateVideoCostFromPricing({ estimatedCostPerSecond: 0.3, currency: 'USD' }, 8);
		expect(cost).toBeCloseTo(2.4, 4);
	});

	it('should return flat cost for per-generation pricing model', async () => {
		const { calculateVideoCostFromPricing } = await import('../../src/lib/utils/cost.js');
		const cost = calculateVideoCostFromPricing(
			{ estimatedCostPerGeneration: 0.03, currency: 'USD' },
			12
		);
		// Duration is ignored for per-generation pricing
		expect(cost).toBeCloseTo(0.03, 4);
	});

	it('should prefer per-second pricing when both are present', async () => {
		const { calculateVideoCostFromPricing } = await import('../../src/lib/utils/cost.js');
		const cost = calculateVideoCostFromPricing(
			{
				estimatedCostPerSecond: 0.1,
				estimatedCostPerGeneration: 0.05,
				currency: 'USD'
			},
			10
		);
		expect(cost).toBeCloseTo(1.0, 4);
	});

	it('should return 0 when no pricing information is available', async () => {
		const { calculateVideoCostFromPricing } = await import('../../src/lib/utils/cost.js');
		const cost = calculateVideoCostFromPricing({ currency: 'USD' }, 10);
		expect(cost).toBe(0);
	});

	it('should return 0 when pricing is undefined', async () => {
		const { calculateVideoCostFromPricing } = await import('../../src/lib/utils/cost.js');
		const cost = calculateVideoCostFromPricing(undefined, 10);
		expect(cost).toBe(0);
	});

	it('should return flat cost even when duration is 0 or null', async () => {
		const { calculateVideoCostFromPricing } = await import('../../src/lib/utils/cost.js');
		const cost1 = calculateVideoCostFromPricing(
			{ estimatedCostPerGeneration: 0.03, currency: 'USD' },
			0
		);
		expect(cost1).toBeCloseTo(0.03, 4);

		const cost2 = calculateVideoCostFromPricing(
			{ estimatedCostPerGeneration: 0.03, currency: 'USD' },
			null as any
		);
		expect(cost2).toBeCloseTo(0.03, 4);
	});

	it('should return 0 for per-second model when duration is 0', async () => {
		const { calculateVideoCostFromPricing } = await import('../../src/lib/utils/cost.js');
		const cost = calculateVideoCostFromPricing({ estimatedCostPerSecond: 0.1, currency: 'USD' }, 0);
		expect(cost).toBe(0);
	});
});

// ─────────────────────────────────────
//  Unit tests for lookupVideoModelCost
// ─────────────────────────────────────
describe('lookupVideoModelCost', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
	});

	it('should look up OpenAI sora-2 pricing and compute cost', async () => {
		const { lookupVideoModelCost } = await import('../../src/lib/utils/cost.js');
		// sora-2 is $0.10/sec
		const cost = lookupVideoModelCost('openai', 'sora-2', 10);
		expect(cost).toBeCloseTo(1.0, 4);
	});

	it('should look up OpenAI sora-2-pro pricing and compute cost', async () => {
		const { lookupVideoModelCost } = await import('../../src/lib/utils/cost.js');
		// sora-2-pro is $0.30/sec
		const cost = lookupVideoModelCost('openai', 'sora-2-pro', 8);
		expect(cost).toBeCloseTo(2.4, 4);
	});

	it('should look up WaveSpeed model pricing and return flat cost', async () => {
		const { lookupVideoModelCost } = await import('../../src/lib/utils/cost.js');
		// WaveSpeed models use per-generation pricing
		const cost = lookupVideoModelCost('wavespeed', 'wan-2.1/t2v', 10);
		expect(cost).toBeGreaterThan(0);
	});

	it('should return 0 for unknown provider', async () => {
		const { lookupVideoModelCost } = await import('../../src/lib/utils/cost.js');
		const cost = lookupVideoModelCost('unknown-provider', 'some-model', 10);
		expect(cost).toBe(0);
	});

	it('should return 0 for unknown model within known provider', async () => {
		const { lookupVideoModelCost } = await import('../../src/lib/utils/cost.js');
		const cost = lookupVideoModelCost('openai', 'nonexistent-model', 10);
		expect(cost).toBe(0);
	});
});
