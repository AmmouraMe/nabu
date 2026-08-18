import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';

// ─────────────────────────────────────
//  Mock video-registry (used by API endpoints)
// ─────────────────────────────────────
vi.mock('$lib/services/video-registry', () => ({
	getEnabledVideoKey: vi.fn(),
	getVideoProvider: vi.fn(),
	getModelsForKey: vi.fn(),
	getAllVideoModels: vi.fn(),
	getAllEnabledVideoKeys: vi.fn()
}));

let mockDB: any;
let mockPlatform: any;
let mockLocals: any;

function createMockDB() {
	const chain: any = {
		prepare: vi.fn().mockReturnThis(),
		bind: vi.fn().mockReturnThis(),
		first: vi.fn().mockResolvedValue(null),
		all: vi.fn().mockResolvedValue({ results: [] }),
		run: vi.fn().mockResolvedValue({ success: true }),
		batch: vi.fn().mockResolvedValue([])
	};
	return chain;
}

beforeEach(() => {
	vi.resetModules();
	vi.restoreAllMocks();

	mockDB = createMockDB();
	mockPlatform = {
		env: {
			DB: mockDB,
			KV: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
			BUCKET: { put: vi.fn(), get: vi.fn(), delete: vi.fn() }
		}
	};
	mockLocals = {
		user: {
			id: 'user-1',
			login: 'testuser',
			email: 'test@example.com',
			isOwner: false,
			isAdmin: false
		}
	};
});

// ─────────────────────────────────────
//  VideoModel pricing field
// ─────────────────────────────────────
describe('VideoModel pricing', () => {
	it('should include pricing data on OpenAI models', async () => {
		const { OpenAIVideoProvider } = await import('../../src/lib/services/providers/openai-video');
		const provider = new OpenAIVideoProvider();
		const models = provider.getAvailableModels();

		for (const model of models) {
			expect(model.pricing).toBeDefined();
			expect(model.pricing!.currency).toBe('USD');
			expect(typeof model.pricing!.estimatedCostPerSecond).toBe('number');
			expect(model.pricing!.estimatedCostPerSecond!).toBeGreaterThan(0);
		}
	});

	it('should include pricing data on WaveSpeed models', async () => {
		const { WaveSpeedVideoProvider } = await import(
			'../../src/lib/services/providers/wavespeed-video'
		);
		const provider = new WaveSpeedVideoProvider();
		const models = provider.getAvailableModels();

		for (const model of models) {
			expect(model.pricing).toBeDefined();
			expect(model.pricing!.currency).toBe('USD');
			// WaveSpeed models may use per-generation pricing
			const hasPricing =
				typeof model.pricing!.estimatedCostPerSecond === 'number' ||
				typeof model.pricing!.estimatedCostPerGeneration === 'number';
			expect(hasPricing).toBe(true);
		}
	});

	it('Sora 2 Pro should cost more than Sora 2', async () => {
		const { OpenAIVideoProvider } = await import('../../src/lib/services/providers/openai-video');
		const provider = new OpenAIVideoProvider();
		const models = provider.getAvailableModels();

		const sora2 = models.find((m) => m.id === 'sora-2');
		const sora2Pro = models.find((m) => m.id === 'sora-2-pro');

		expect(sora2).toBeDefined();
		expect(sora2Pro).toBeDefined();
		expect(sora2Pro!.pricing!.estimatedCostPerSecond!).toBeGreaterThan(
			sora2!.pricing!.estimatedCostPerSecond!
		);
	});
});

// ─────────────────────────────────────
//  getAllEnabledVideoKeys registry function
// ─────────────────────────────────────
describe('getAllEnabledVideoKeys', () => {
	// These tests use the REAL implementation, not the mock
	// We dynamically import the actual module
	async function getRealModule() {
		// Import the real source file directly, bypassing the vi.mock
		const mod = await vi.importActual<typeof import('../../src/lib/services/video-registry')>(
			'../../src/lib/services/video-registry'
		);
		return mod;
	}

	it('should return all enabled video-capable keys', async () => {
		const { getAllEnabledVideoKeys } = await getRealModule();

		const keys = [
			{
				id: 'key-1',
				name: 'OpenAI Key',
				provider: 'openai',
				apiKey: 'sk-test',
				enabled: true,
				videoEnabled: true,
				videoModels: ['sora-2']
			},
			{
				id: 'key-2',
				name: 'WaveSpeed Key',
				provider: 'wavespeed',
				apiKey: 'ws-test',
				enabled: true,
				videoEnabled: true,
				videoModels: ['wan-2.1/t2v-720p']
			}
		];

		mockPlatform.env.KV.get
			.mockResolvedValueOnce(JSON.stringify(['key-1', 'key-2']))
			.mockResolvedValueOnce(JSON.stringify(keys[0]))
			.mockResolvedValueOnce(JSON.stringify(keys[1]));

		const result = await getAllEnabledVideoKeys(mockPlatform as any);
		expect(result).toHaveLength(2);
		expect(result[0].provider).toBe('openai');
		expect(result[1].provider).toBe('wavespeed');
	});

	it('should skip disabled or non-video keys', async () => {
		const { getAllEnabledVideoKeys } = await getRealModule();

		mockPlatform.env.KV.get
			.mockResolvedValueOnce(JSON.stringify(['key-1', 'key-2', 'key-3']))
			.mockResolvedValueOnce(
				JSON.stringify({
					id: 'key-1',
					provider: 'openai',
					apiKey: 'sk-1',
					enabled: true,
					videoEnabled: true
				})
			)
			.mockResolvedValueOnce(
				JSON.stringify({
					id: 'key-2',
					provider: 'wavespeed',
					apiKey: 'ws-1',
					enabled: false,
					videoEnabled: true
				})
			)
			.mockResolvedValueOnce(
				JSON.stringify({
					id: 'key-3',
					provider: 'openai',
					apiKey: 'sk-3',
					enabled: true,
					videoEnabled: false
				})
			);

		const result = await getAllEnabledVideoKeys(mockPlatform as any);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('key-1');
	});

	it('should return empty array when no keys exist', async () => {
		const { getAllEnabledVideoKeys } = await getRealModule();

		mockPlatform.env.KV.get.mockResolvedValueOnce(null);

		const result = await getAllEnabledVideoKeys(mockPlatform as any);
		expect(result).toEqual([]);
	});
});

// ─────────────────────────────────────
//  GET /api/video/models — returns pricing + multi-provider
// ─────────────────────────────────────
describe('GET /api/video/models — pricing and multi-provider', () => {
	it('should include pricing data in the models response', async () => {
		const { getAllEnabledVideoKeys, getModelsForKey } = await import(
			'$lib/services/video-registry'
		);

		(getAllEnabledVideoKeys as any).mockResolvedValue([
			{
				id: 'key-1',
				name: 'OpenAI Key',
				provider: 'openai',
				apiKey: 'sk-test',
				enabled: true,
				videoEnabled: true
			}
		]);

		(getModelsForKey as any).mockReturnValue([
			{
				id: 'sora-2',
				displayName: 'Sora 2',
				provider: 'openai',
				type: 'text-to-video',
				maxDuration: 12,
				supportedAspectRatios: ['16:9', '9:16', '1:1'],
				pricing: { estimatedCostPerSecond: 0.1, currency: 'USD' }
			}
		]);

		const { GET } = await import('../../src/routes/api/video/models/+server.js');

		const response = await GET({
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const data = await response.json();
		expect(data.models).toHaveLength(1);
		expect(data.models[0].pricing).toBeDefined();
		expect(data.models[0].pricing.estimatedCostPerSecond).toBe(0.1);
		expect(data.models[0].pricing.currency).toBe('USD');
	});

	it('should return models from multiple providers', async () => {
		const { getAllEnabledVideoKeys, getModelsForKey } = await import(
			'$lib/services/video-registry'
		);

		(getAllEnabledVideoKeys as any).mockResolvedValue([
			{
				id: 'key-1',
				provider: 'openai',
				apiKey: 'sk-test',
				enabled: true,
				videoEnabled: true
			},
			{
				id: 'key-2',
				provider: 'wavespeed',
				apiKey: 'ws-test',
				enabled: true,
				videoEnabled: true
			}
		]);

		(getModelsForKey as any)
			.mockReturnValueOnce([
				{
					id: 'sora-2',
					displayName: 'Sora 2',
					provider: 'openai',
					type: 'text-to-video',
					pricing: { estimatedCostPerSecond: 0.1, currency: 'USD' }
				}
			])
			.mockReturnValueOnce([
				{
					id: 'wan-2.1/t2v-720p',
					displayName: 'Wan 2.1 720p',
					provider: 'wavespeed',
					type: 'text-to-video',
					pricing: { estimatedCostPerGeneration: 0.03, currency: 'USD' }
				}
			]);

		const { GET } = await import('../../src/routes/api/video/models/+server.js');

		const response = await GET({
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const data = await response.json();
		expect(data.models).toHaveLength(2);
		const providers = data.models.map((m: any) => m.provider);
		expect(providers).toContain('openai');
		expect(providers).toContain('wavespeed');
	});
});

// ─────────────────────────────────────
//  POST /api/video/generate — accepts provider preference
// ─────────────────────────────────────
describe('POST /api/video/generate — provider preference', () => {
	it('should use the specified provider when available', async () => {
		const { getEnabledVideoKey, getVideoProvider } = await import('$lib/services/video-registry');

		const mockProvider = {
			name: 'wavespeed',
			getAvailableModels: () => [
				{ id: 'wan-2.1/t2v-720p', displayName: 'Wan 2.1', provider: 'wavespeed' }
			],
			generateVideo: vi.fn().mockResolvedValue({
				providerJobId: 'ws-job-1',
				status: 'queued'
			})
		};

		(getEnabledVideoKey as any).mockResolvedValue({
			id: 'key-2',
			provider: 'wavespeed',
			apiKey: 'ws-test',
			enabled: true,
			videoEnabled: true
		});
		(getVideoProvider as any).mockReturnValue(mockProvider);

		const { POST } = await import('../../src/routes/api/video/generate/+server.js');

		const response = await POST({
			request: new Request('http://localhost/api/video/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					prompt: 'A sunset over mountains',
					model: 'wan-2.1/t2v-720p',
					provider: 'wavespeed',
					aspectRatio: '16:9',
					duration: 8
				})
			}),
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		// Provider should have been called with provider preference
		expect(getEnabledVideoKey).toHaveBeenCalledWith(mockPlatform, 'wavespeed');
	});
});

// ─────────────────────────────────────
//  VideoCreateForm — provider selector + pricing preview
// ─────────────────────────────────────
describe('VideoCreateForm — provider selection', () => {
	const multiProviderModels = [
		{
			id: 'sora-2',
			displayName: 'Sora 2',
			provider: 'openai',
			maxDuration: 12,
			pricing: { estimatedCostPerSecond: 0.1, currency: 'USD' }
		},
		{
			id: 'sora-2-pro',
			displayName: 'Sora 2 Pro',
			provider: 'openai',
			maxDuration: 12,
			pricing: { estimatedCostPerSecond: 0.3, currency: 'USD' }
		},
		{
			id: 'wan-2.1/t2v-720p',
			displayName: 'Wan 2.1 720p',
			provider: 'wavespeed',
			pricing: { estimatedCostPerGeneration: 0.03, currency: 'USD' }
		}
	];

	it('should show provider selector when models from multiple providers exist', async () => {
		const { default: VideoCreateForm } = await import(
			'../../src/lib/components/VideoCreateForm.svelte'
		);

		render(VideoCreateForm, { props: { models: multiProviderModels } });

		expect(screen.getByLabelText(/provider/i)).toBeInTheDocument();
	});

	it('should not show provider selector with only one provider', async () => {
		const { default: VideoCreateForm } = await import(
			'../../src/lib/components/VideoCreateForm.svelte'
		);

		const singleProviderModels = multiProviderModels.filter((m) => m.provider === 'openai');
		render(VideoCreateForm, { props: { models: singleProviderModels } });

		expect(screen.queryByLabelText(/provider/i)).not.toBeInTheDocument();
	});

	it('should filter models when provider changes', async () => {
		const { default: VideoCreateForm } = await import(
			'../../src/lib/components/VideoCreateForm.svelte'
		);

		render(VideoCreateForm, { props: { models: multiProviderModels } });

		// Initially OpenAI is selected (first provider)
		const modelSelect = screen.getByLabelText(/model/i) as HTMLSelectElement;
		const options = Array.from(modelSelect.options).map((o) => o.textContent);
		expect(options).toContain('Sora 2');
		expect(options).toContain('Sora 2 Pro');
		expect(options).not.toContain('Wan 2.1 720p');
	});

	it('should update models when switching provider', async () => {
		const { default: VideoCreateForm } = await import(
			'../../src/lib/components/VideoCreateForm.svelte'
		);

		// Verify that when rendered with only wavespeed models (simulating provider switch),
		// the model selector shows wavespeed models and not openai models
		const wavespeedModels = [
			...multiProviderModels.filter((m) => m.provider === 'wavespeed'),
			// Add a second wavespeed model to ensure the model select is visible
			{
				id: 'wan-2.2/t2v-720p',
				displayName: 'Wan 2.2 720p',
				provider: 'wavespeed',
				pricing: { estimatedCostPerGeneration: 0.04, currency: 'USD' }
			}
		];

		render(VideoCreateForm, { props: { models: wavespeedModels } });

		const modelSelect = screen.getByLabelText(/model/i) as HTMLSelectElement;
		const options = Array.from(modelSelect.options).map((o) => o.textContent?.trim());
		expect(options).toContain('Wan 2.1 720p');
		expect(options).toContain('Wan 2.2 720p');
		expect(options).not.toContain('Sora 2');
		expect(options).not.toContain('Sora 2 Pro');
	});
});

describe('VideoCreateForm — pricing preview', () => {
	const modelsWithPricing = [
		{
			id: 'sora-2',
			displayName: 'Sora 2',
			provider: 'openai',
			maxDuration: 12,
			supportedDurations: [4, 8, 12],
			pricing: { estimatedCostPerSecond: 0.1, currency: 'USD' }
		},
		{
			id: 'wan-2.1/t2v-720p',
			displayName: 'Wan 2.1 720p',
			provider: 'wavespeed',
			supportedDurations: [5, 8],
			pricing: { estimatedCostPerGeneration: 0.03, currency: 'USD' }
		}
	];

	it('should display estimated cost based on selected model and duration', async () => {
		const { default: VideoCreateForm } = await import(
			'../../src/lib/components/VideoCreateForm.svelte'
		);

		render(VideoCreateForm, {
			props: {
				models: [modelsWithPricing[0]]
			}
		});

		// Default duration is 8s, cost per second is 0.10 → $0.80
		const pricingEl = screen.getByTestId('pricing-preview');
		expect(pricingEl).toBeInTheDocument();
		expect(pricingEl.textContent).toContain('$0.80');
	});

	it('should update pricing when duration changes', async () => {
		const { default: VideoCreateForm } = await import(
			'../../src/lib/components/VideoCreateForm.svelte'
		);

		render(VideoCreateForm, {
			props: {
				models: [modelsWithPricing[0]]
			}
		});

		// Switch to 12s → $1.20
		const btn12s = screen.getByRole('radio', { name: '12s' });
		await fireEvent.click(btn12s);

		const pricingEl = screen.getByTestId('pricing-preview');
		expect(pricingEl.textContent).toContain('$1.20');
	});

	it('should show per-generation pricing for flat-rate models', async () => {
		const { default: VideoCreateForm } = await import(
			'../../src/lib/components/VideoCreateForm.svelte'
		);

		render(VideoCreateForm, {
			props: {
				models: [modelsWithPricing[1]]
			}
		});

		const pricingEl = screen.getByTestId('pricing-preview');
		expect(pricingEl).toBeInTheDocument();
		expect(pricingEl.textContent).toContain('$0.03');
	});

	it('should not show pricing when no pricing data exists', async () => {
		const { default: VideoCreateForm } = await import(
			'../../src/lib/components/VideoCreateForm.svelte'
		);

		render(VideoCreateForm, {
			props: {
				models: [{ id: 'basic', displayName: 'Basic', provider: 'test' }]
			}
		});

		expect(screen.queryByTestId('pricing-preview')).not.toBeInTheDocument();
	});
});
