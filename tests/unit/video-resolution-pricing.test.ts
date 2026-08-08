import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import type { VideoModel } from '../../src/lib/services/video-provider';

/**
 * Tests for resolution-aware video pricing and quality settings.
 *
 * OpenAI Sora pricing (per second of generated video):
 *   sora-2     — 480p: $0.04/s, 720p: $0.10/s
 *   sora-2-pro — 480p: $0.04/s, 720p: $0.30/s, 1080p: $0.50/s
 *
 * WaveSpeed pricing — flat per-generation, no resolution tiers.
 */

// ─────────────────────────────────────
//  VideoModelPricing with resolution tiers
// ─────────────────────────────────────
describe('calculateVideoCostFromPricing — resolution-aware', () => {
	it('should use resolution-specific rate when pricingByResolution is provided', async () => {
		const { calculateVideoCostFromPricing } = await import('../../src/lib/utils/cost.js');
		// sora-2-pro at 1080p = $0.50/s
		const cost = calculateVideoCostFromPricing(
			{
				estimatedCostPerSecond: 0.3, // default/720p fallback
				pricingByResolution: {
					'480p': { estimatedCostPerSecond: 0.04 },
					'720p': { estimatedCostPerSecond: 0.3 },
					'1080p': { estimatedCostPerSecond: 0.5 }
				},
				currency: 'USD'
			},
			8,
			'1080p'
		);
		expect(cost).toBeCloseTo(4.0, 4); // 8s × $0.50/s
	});

	it('should fall back to default estimatedCostPerSecond when resolution is not in tiers', async () => {
		const { calculateVideoCostFromPricing } = await import('../../src/lib/utils/cost.js');
		const cost = calculateVideoCostFromPricing(
			{
				estimatedCostPerSecond: 0.1,
				pricingByResolution: {
					'1080p': { estimatedCostPerSecond: 0.5 }
				},
				currency: 'USD'
			},
			10,
			'720p' // not in pricingByResolution
		);
		expect(cost).toBeCloseTo(1.0, 4); // falls back to $0.10/s
	});

	it('should fall back to default when no resolution is specified', async () => {
		const { calculateVideoCostFromPricing } = await import('../../src/lib/utils/cost.js');
		const cost = calculateVideoCostFromPricing(
			{
				estimatedCostPerSecond: 0.3,
				pricingByResolution: {
					'1080p': { estimatedCostPerSecond: 0.5 }
				},
				currency: 'USD'
			},
			8
			// no resolution
		);
		expect(cost).toBeCloseTo(2.4, 4); // 8s × $0.30/s (default)
	});

	it('should use resolution-specific per-generation cost when applicable', async () => {
		const { calculateVideoCostFromPricing } = await import('../../src/lib/utils/cost.js');
		const cost = calculateVideoCostFromPricing(
			{
				estimatedCostPerGeneration: 0.03,
				pricingByResolution: {
					'1080p': { estimatedCostPerGeneration: 0.06 }
				},
				currency: 'USD'
			},
			10,
			'1080p'
		);
		expect(cost).toBeCloseTo(0.06, 4);
	});

	it('should correctly compute sora-2 at 480p ($0.04/s)', async () => {
		const { calculateVideoCostFromPricing } = await import('../../src/lib/utils/cost.js');
		const cost = calculateVideoCostFromPricing(
			{
				estimatedCostPerSecond: 0.1,
				pricingByResolution: {
					'480p': { estimatedCostPerSecond: 0.04 },
					'720p': { estimatedCostPerSecond: 0.1 }
				},
				currency: 'USD'
			},
			12,
			'480p'
		);
		expect(cost).toBeCloseTo(0.48, 4); // 12s × $0.04/s
	});

	it('should correctly compute sora-2-pro at all resolutions', async () => {
		const { calculateVideoCostFromPricing } = await import('../../src/lib/utils/cost.js');
		const soraPricing = {
			estimatedCostPerSecond: 0.3,
			pricingByResolution: {
				'480p': { estimatedCostPerSecond: 0.04 },
				'720p': { estimatedCostPerSecond: 0.3 },
				'1080p': { estimatedCostPerSecond: 0.5 }
			},
			currency: 'USD'
		};

		expect(calculateVideoCostFromPricing(soraPricing, 8, '480p')).toBeCloseTo(0.32, 4);
		expect(calculateVideoCostFromPricing(soraPricing, 8, '720p')).toBeCloseTo(2.4, 4);
		expect(calculateVideoCostFromPricing(soraPricing, 8, '1080p')).toBeCloseTo(4.0, 4);
	});

	it('should still work with old pricing format (no pricingByResolution)', async () => {
		const { calculateVideoCostFromPricing } = await import('../../src/lib/utils/cost.js');
		// Backward compatibility — existing pricing without resolution tiers
		const cost = calculateVideoCostFromPricing(
			{ estimatedCostPerSecond: 0.1, currency: 'USD' },
			10,
			'720p'
		);
		expect(cost).toBeCloseTo(1.0, 4);
	});
});

// ─────────────────────────────────────
//  OpenAI provider model pricing accuracy
// ─────────────────────────────────────
describe('OpenAI Sora — accurate model pricing', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it('sora-2 should have resolution-based pricing with 720p', async () => {
		const { OpenAIVideoProvider } = await import(
			'../../src/lib/services/providers/openai-video.js'
		);
		const provider = new OpenAIVideoProvider();
		const models = provider.getAvailableModels();
		const sora2 = models.find((m) => m.id === 'sora-2');

		expect(sora2).toBeDefined();
		expect(sora2!.pricing).toBeDefined();
		expect(sora2!.pricing!.pricingByResolution).toBeDefined();
		expect(sora2!.pricing!.pricingByResolution!['720p']).toBeDefined();
		expect(sora2!.pricing!.pricingByResolution!['720p'].estimatedCostPerSecond).toBe(0.1);
	});

	it('sora-2-pro should have 720p and 1080p pricing tiers', async () => {
		const { OpenAIVideoProvider } = await import(
			'../../src/lib/services/providers/openai-video.js'
		);
		const provider = new OpenAIVideoProvider();
		const models = provider.getAvailableModels();
		const soraPro = models.find((m) => m.id === 'sora-2-pro');

		expect(soraPro).toBeDefined();
		expect(soraPro!.pricing).toBeDefined();
		expect(soraPro!.pricing!.pricingByResolution).toBeDefined();
		expect(soraPro!.pricing!.pricingByResolution!['720p'].estimatedCostPerSecond).toBe(0.3);
		expect(soraPro!.pricing!.pricingByResolution!['1080p'].estimatedCostPerSecond).toBe(0.5);
	});

	it('sora-2 should support 720p resolution only', async () => {
		const { OpenAIVideoProvider } = await import(
			'../../src/lib/services/providers/openai-video.js'
		);
		const provider = new OpenAIVideoProvider();
		const models = provider.getAvailableModels();
		const sora2 = models.find((m) => m.id === 'sora-2');

		expect(sora2!.supportedResolutions).toContain('720p');
		expect(sora2!.supportedResolutions).not.toContain('480p');
	});

	it('sora-2-pro should support 720p and 1080p resolutions', async () => {
		const { OpenAIVideoProvider } = await import(
			'../../src/lib/services/providers/openai-video.js'
		);
		const provider = new OpenAIVideoProvider();
		const models = provider.getAvailableModels();
		const soraPro = models.find((m) => m.id === 'sora-2-pro');

		expect(soraPro!.supportedResolutions).not.toContain('480p');
		expect(soraPro!.supportedResolutions).toContain('720p');
		expect(soraPro!.supportedResolutions).toContain('1080p');
	});
});

// ─────────────────────────────────────
//  OpenAI provider — resolution to size mapping
// ─────────────────────────────────────
describe('OpenAI Sora — resolution affects API size parameter', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
	});

	it('should send correct size for 1080p 16:9', async () => {
		const { OpenAIVideoProvider } = await import(
			'../../src/lib/services/providers/openai-video.js'
		);
		const provider = new OpenAIVideoProvider();

		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					id: 'vid-test',
					status: 'queued',
					model: 'sora-2-pro',
					progress: 0,
					seconds: '8',
					size: '1792x1024'
				})
		});
		vi.stubGlobal('fetch', mockFetch);

		await provider.generateVideo('test-key', {
			prompt: 'test',
			model: 'sora-2-pro',
			aspectRatio: '16:9',
			duration: 8,
			resolution: '1080p'
		});

		const body = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(body.size).toBe('1792x1024');
	});

	it('should send correct size for 1080p 9:16', async () => {
		const { OpenAIVideoProvider } = await import(
			'../../src/lib/services/providers/openai-video.js'
		);
		const provider = new OpenAIVideoProvider();

		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					id: 'vid-test',
					status: 'queued',
					model: 'sora-2-pro',
					progress: 0,
					seconds: '8',
					size: '1024x1792'
				})
		});
		vi.stubGlobal('fetch', mockFetch);

		await provider.generateVideo('test-key', {
			prompt: 'test',
			model: 'sora-2-pro',
			aspectRatio: '9:16',
			duration: 8,
			resolution: '1080p'
		});

		const body = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(body.size).toBe('1024x1792');
	});

	it('should send 720p size when 480p is requested (480p not supported by API)', async () => {
		const { OpenAIVideoProvider } = await import(
			'../../src/lib/services/providers/openai-video.js'
		);
		const provider = new OpenAIVideoProvider();

		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					id: 'vid-test',
					status: 'queued',
					model: 'sora-2',
					progress: 0,
					seconds: '4',
					size: '1280x720'
				})
		});
		vi.stubGlobal('fetch', mockFetch);

		await provider.generateVideo('test-key', {
			prompt: 'test',
			model: 'sora-2',
			aspectRatio: '16:9',
			duration: 4,
			resolution: '480p'
		});

		const body = JSON.parse(mockFetch.mock.calls[0][1].body);
		// 480p is not a valid API size, so it falls back to the first valid size for 16:9
		expect(body.size).toBe('1280x720');
	});

	it('should default to 720p when no resolution specified', async () => {
		const { OpenAIVideoProvider } = await import(
			'../../src/lib/services/providers/openai-video.js'
		);
		const provider = new OpenAIVideoProvider();

		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					id: 'vid-test',
					status: 'queued',
					model: 'sora-2',
					progress: 0,
					seconds: '8',
					size: '1280x720'
				})
		});
		vi.stubGlobal('fetch', mockFetch);

		await provider.generateVideo('test-key', {
			prompt: 'test',
			model: 'sora-2',
			aspectRatio: '16:9',
			duration: 8
			// no resolution
		});

		const body = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(body.size).toBe('1280x720');
	});
});

// ─────────────────────────────────────
//  lookupVideoModelCost — resolution-aware
// ─────────────────────────────────────
describe('lookupVideoModelCost — resolution-aware', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
	});

	it('should compute sora-2-pro cost at 1080p resolution', async () => {
		const { lookupVideoModelCost } = await import('../../src/lib/utils/cost.js');
		// sora-2-pro at 1080p = $0.50/s
		const cost = lookupVideoModelCost('openai', 'sora-2-pro', 8, '1080p');
		expect(cost).toBeCloseTo(4.0, 4); // 8s × $0.50/s
	});

	it('should compute sora-2-pro cost at 720p resolution', async () => {
		const { lookupVideoModelCost } = await import('../../src/lib/utils/cost.js');
		const cost = lookupVideoModelCost('openai', 'sora-2-pro', 8, '720p');
		expect(cost).toBeCloseTo(2.4, 4); // 8s × $0.30/s
	});

	it('should compute sora-2-pro cost at default rate when 480p requested (not in tiers)', async () => {
		const { lookupVideoModelCost } = await import('../../src/lib/utils/cost.js');
		const cost = lookupVideoModelCost('openai', 'sora-2-pro', 8, '480p');
		// 480p not in pricing tiers, falls back to default estimatedCostPerSecond (0.30)
		expect(cost).toBeCloseTo(2.4, 4); // 8s × $0.30/s
	});

	it('should compute sora-2 cost at default rate when 480p requested (not in tiers)', async () => {
		const { lookupVideoModelCost } = await import('../../src/lib/utils/cost.js');
		const cost = lookupVideoModelCost('openai', 'sora-2', 12, '480p');
		// 480p not in pricing tiers, falls back to default estimatedCostPerSecond (0.10)
		expect(cost).toBeCloseTo(1.2, 4); // 12s × $0.10/s
	});

	it('should fall back to default for wavespeed (no resolution tiers)', async () => {
		const { lookupVideoModelCost } = await import('../../src/lib/utils/cost.js');
		const cost = lookupVideoModelCost('wavespeed', 'wan-2.1/t2v', 10, '720p');
		expect(cost).toBeCloseTo(0.03, 4); // flat per-generation
	});
});

// ─────────────────────────────────────
//  VideoCreateForm — resolution selector
// ─────────────────────────────────────
describe('VideoCreateForm — resolution/quality selector', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
	});

	const openaiModels: VideoModel[] = [
		{
			id: 'sora-2',
			displayName: 'Sora 2',
			provider: 'openai',
			type: 'text-to-video',
			maxDuration: 12,
			supportedAspectRatios: ['16:9', '9:16', '1:1'],
			supportedResolutions: ['720p'],
			pricing: {
				estimatedCostPerSecond: 0.1,
				pricingByResolution: {
					'720p': { estimatedCostPerSecond: 0.1 }
				},
				currency: 'USD'
			}
		},
		{
			id: 'sora-2-pro',
			displayName: 'Sora 2 Pro',
			provider: 'openai',
			type: 'text-to-video',
			maxDuration: 12,
			supportedAspectRatios: ['16:9', '9:16', '1:1'],
			supportedResolutions: ['720p', '1080p'],
			pricing: {
				estimatedCostPerSecond: 0.3,
				pricingByResolution: {
					'720p': { estimatedCostPerSecond: 0.3 },
					'1080p': { estimatedCostPerSecond: 0.5 }
				},
				currency: 'USD'
			}
		}
	];

	it('should show resolution selector when model has multiple resolutions', async () => {
		const { default: VideoCreateForm } = await import(
			'../../src/lib/components/VideoCreateForm.svelte'
		);
		// Use only the model with multiple resolutions (sora-2-pro has 720p + 1080p)
		render(VideoCreateForm, { props: { models: [openaiModels[1]] } });

		// The resolution selector should be visible
		const resolutionLabel = screen.getByText('Resolution');
		expect(resolutionLabel).toBeTruthy();
	});

	it('should update pricing when resolution changes', async () => {
		const { default: VideoCreateForm } = await import(
			'../../src/lib/components/VideoCreateForm.svelte'
		);
		render(VideoCreateForm, { props: { models: [openaiModels[1]] } });

		// Default should show 720p pricing: 8s × $0.30/s = $2.40
		const pricingPreview = screen.getByTestId('pricing-preview');
		expect(pricingPreview.textContent).toContain('$2.40');

		// Select 1080p resolution
		const btn1080 = screen.getByRole('radio', { name: '1080p' });
		await fireEvent.click(btn1080);

		// Pricing should update to 8s × $0.50/s = $4.00
		expect(pricingPreview.textContent).toContain('$4.00');
	});

	it('should show 720p pricing for sora-2', async () => {
		const { default: VideoCreateForm } = await import(
			'../../src/lib/components/VideoCreateForm.svelte'
		);
		render(VideoCreateForm, { props: { models: [openaiModels[0]] } });

		// sora-2 only has 720p, pricing should be 8s × $0.10/s = $0.80
		const pricingPreview = screen.getByTestId('pricing-preview');
		expect(pricingPreview.textContent).toContain('$0.80');
	});

	it('should not show resolution selector for wavespeed models (no resolution support)', async () => {
		const { default: VideoCreateForm } = await import(
			'../../src/lib/components/VideoCreateForm.svelte'
		);
		const wavespeedModels = [
			{
				id: 'wan-2.1/t2v-720p',
				displayName: 'Wan 2.1 Text-to-Video 720p',
				provider: 'wavespeed',
				supportedAspectRatios: ['16:9', '9:16', '1:1'],
				pricing: { estimatedCostPerGeneration: 0.03, currency: 'USD' }
			}
		];

		render(VideoCreateForm, { props: { models: wavespeedModels } });

		// Resolution selector should NOT be present
		const resolutionLabels = screen.queryAllByText('Resolution');
		expect(resolutionLabels.length).toBe(0);
	});

	it('should show pricing breakdown with resolution in detail', async () => {
		const { default: VideoCreateForm } = await import(
			'../../src/lib/components/VideoCreateForm.svelte'
		);
		render(VideoCreateForm, { props: { models: [openaiModels[1]] } });

		// Select 1080p
		const btn1080 = screen.getByRole('radio', { name: '1080p' });
		await fireEvent.click(btn1080);

		const pricingPreview = screen.getByTestId('pricing-preview');
		// Should show the per-second rate for the selected resolution
		expect(pricingPreview.textContent).toContain('$0.5/s');
	});
});
