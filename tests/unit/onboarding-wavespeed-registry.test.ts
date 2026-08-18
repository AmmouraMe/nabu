/**
 * Tests for:
 *   - lib/stores/onboarding.ts (updateStep, updateBrandData, sendMessage SSE, loadExistingProfile)
 *   - lib/services/providers/wavespeed-video.ts (error handling, downloadVideo)
 *   - lib/services/video-registry.ts (getAllEnabledVideoKeys, getModelsForKey, error paths)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

// ─────────────────────────────────────
// Onboarding Store
// ─────────────────────────────────────
describe('Onboarding Store', () => {
	let onboardingStore: any;
	let startOnboarding: any;
	let loadExistingProfile: any;
	let sendMessage: any;
	let updateStep: any;
	let updateBrandData: any;
	let resetOnboarding: any;

	beforeEach(async () => {
		vi.resetModules();
		vi.restoreAllMocks();
		globalThis.fetch = vi.fn();
		// Mock crypto.randomUUID
		vi.stubGlobal('crypto', {
			randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2, 8)
		});

		const mod = await import('../../src/lib/stores/onboarding');
		onboardingStore = mod.onboardingStore;
		startOnboarding = mod.startOnboarding;
		loadExistingProfile = mod.loadExistingProfile;
		sendMessage = mod.sendMessage;
		updateStep = mod.updateStep;
		updateBrandData = mod.updateBrandData;
		resetOnboarding = mod.resetOnboarding;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should resetOnboarding to initial state', () => {
		onboardingStore.set({
			profile: { id: 'p1' },
			messages: [{ id: 'm1' }],
			currentStep: 'brand_identity',
			isLoading: true,
			isStreaming: true,
			error: 'something'
		});

		resetOnboarding();

		const state = get(onboardingStore) as any;
		expect(state.profile).toBeNull();
		expect(state.messages).toEqual([]);
		expect(state.currentStep).toBe('welcome');
		expect(state.isLoading).toBe(false);
		expect(state.isStreaming).toBe(false);
		expect(state.error).toBeNull();
	});

	it('should startOnboarding successfully', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				profile: { id: 'p1', userId: 'u1' },
				message: { id: 'm1', role: 'assistant', content: 'Welcome!' }
			})
		} as any);

		await startOnboarding();

		const state = get(onboardingStore) as any;
		expect(state.profile?.id).toBe('p1');
		expect(state.messages).toHaveLength(1);
		expect(state.messages[0].content).toBe('Welcome!');
		expect(state.isLoading).toBe(false);
	});

	it('should handle startOnboarding failure', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: false,
			statusText: 'Server Error'
		} as any);

		await startOnboarding();

		const state = get(onboardingStore) as any;
		expect(state.error).toContain('Failed to start onboarding');
		expect(state.isLoading).toBe(false);
	});

	it('should handle startOnboarding network error', async () => {
		vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('Network error'));

		await startOnboarding();

		const state = get(onboardingStore) as any;
		expect(state.error).toBe('Network error');
		expect(state.isLoading).toBe(false);
	});

	it('should handle startOnboarding with no message from server', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				profile: { id: 'p1', userId: 'u1' }
			})
		} as any);

		await startOnboarding();

		const state = get(onboardingStore) as any;
		expect(state.profile?.id).toBe('p1');
		expect(state.messages).toHaveLength(0);
	});

	it('should loadExistingProfile successfully', async () => {
		vi.mocked(globalThis.fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					profile: { id: 'p1', userId: 'u1', onboardingStep: 'brand_identity' }
				})
			} as any)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					messages: [
						{ id: 'm1', role: 'user', content: 'Hello' },
						{ id: 'm2', role: 'assistant', content: 'Hi there' }
					]
				})
			} as any);

		const profile = await loadExistingProfile();

		expect(profile?.id).toBe('p1');
		const state = get(onboardingStore) as any;
		expect(state.messages).toHaveLength(2);
		expect(state.currentStep).toBe('brand_identity');
	});

	it('should return null when no profile exists', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({ profile: null })
		} as any);

		const profile = await loadExistingProfile();

		expect(profile).toBeNull();
		const state = get(onboardingStore) as any;
		expect(state.isLoading).toBe(false);
	});

	it('should handle loadExistingProfile failure', async () => {
		vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('Network fail'));

		const profile = await loadExistingProfile();

		expect(profile).toBeNull();
		const state = get(onboardingStore) as any;
		expect(state.error).toBe('Network fail');
	});

	it('should handle loadExistingProfile with non-ok profile response', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: false,
			statusText: 'Not Found'
		} as any);

		const profile = await loadExistingProfile();

		expect(profile).toBeNull();
		const state = get(onboardingStore) as any;
		expect(state.error).toContain('Failed to load profile');
	});

	it('should handle loadExistingProfile with failed messages fetch', async () => {
		vi.mocked(globalThis.fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					profile: { id: 'p1', userId: 'u1', onboardingStep: 'welcome' }
				})
			} as any)
			.mockResolvedValueOnce({
				ok: false,
				statusText: 'Error'
			} as any);

		const profile = await loadExistingProfile();

		expect(profile?.id).toBe('p1');
		const state = get(onboardingStore) as any;
		expect(state.messages).toEqual([]);
	});

	it('should not sendMessage when no profile', async () => {
		resetOnboarding();
		await sendMessage('hello');
		// Should not have called fetch
		expect(globalThis.fetch).not.toHaveBeenCalled();
	});

	it('should sendMessage and handle SSE', async () => {
		// Set up the state with a profile
		onboardingStore.set({
			profile: { id: 'p1', userId: 'u1' },
			messages: [],
			currentStep: 'welcome',
			isLoading: false,
			isStreaming: false,
			error: null
		});

		// Create a readable stream for SSE response
		const sseData = [
			'data: {"content":"Hello "}\n\n',
			'data: {"content":"world!"}\n\n',
			'data: [DONE]\n\n'
		];

		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				for (const chunk of sseData) {
					controller.enqueue(encoder.encode(chunk));
				}
				controller.close();
			}
		});

		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			body: stream
		} as any);

		await sendMessage('Hello');

		const state = get(onboardingStore) as any;
		expect(state.messages).toHaveLength(2); // user + assistant
		expect(state.messages[0].role).toBe('user');
		expect(state.messages[0].content).toBe('Hello');
		expect(state.messages[1].role).toBe('assistant');
		expect(state.messages[1].content).toBe('Hello world!');
		expect(state.isStreaming).toBe(false);
	});

	it('should handle SSE with stepAdvance', async () => {
		onboardingStore.set({
			profile: { id: 'p1', userId: 'u1' },
			messages: [],
			currentStep: 'welcome',
			isLoading: false,
			isStreaming: false,
			error: null
		});

		const sseData = [
			'data: {"content":"Great! "}\n\n',
			'data: {"content":"Let\'s move on."}\n\n',
			'data: {"stepAdvance":"brand_assessment"}\n\n',
			'data: [DONE]\n\n'
		];

		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				for (const chunk of sseData) {
					controller.enqueue(encoder.encode(chunk));
				}
				controller.close();
			}
		});

		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			body: stream
		} as any);

		await sendMessage('My brand is StarSpace');

		const state = get(onboardingStore) as any;
		expect(state.currentStep).toBe('brand_assessment');
		expect(state.profile?.onboardingStep).toBe('brand_assessment');
	});

	it('should handle SSE with error', async () => {
		onboardingStore.set({
			profile: { id: 'p1', userId: 'u1' },
			messages: [],
			currentStep: 'welcome',
			isLoading: false,
			isStreaming: false,
			error: null
		});

		const sseData = ['data: {"error":"OpenAI rate limit exceeded"}\n\n'];

		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				for (const chunk of sseData) {
					controller.enqueue(encoder.encode(chunk));
				}
				controller.close();
			}
		});

		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			body: stream
		} as any);

		await sendMessage('test');

		const state = get(onboardingStore) as any;
		expect(state.error).toBe('OpenAI rate limit exceeded');
		expect(state.isStreaming).toBe(false);
	});

	it('should handle sendMessage non-ok response', async () => {
		onboardingStore.set({
			profile: { id: 'p1', userId: 'u1' },
			messages: [],
			currentStep: 'welcome',
			isLoading: false,
			isStreaming: false,
			error: null
		});

		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: false,
			statusText: 'Internal Server Error'
		} as any);

		await sendMessage('test');

		const state = get(onboardingStore) as any;
		expect(state.error).toContain('Chat failed');
		expect(state.isStreaming).toBe(false);
	});

	it('should handle sendMessage response without body', async () => {
		onboardingStore.set({
			profile: { id: 'p1', userId: 'u1' },
			messages: [],
			currentStep: 'welcome',
			isLoading: false,
			isStreaming: false,
			error: null
		});

		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			body: null
		} as any);

		await sendMessage('test');

		const state = get(onboardingStore) as any;
		expect(state.error).toContain('No response body');
	});

	it('should handle malformed SSE chunks', async () => {
		onboardingStore.set({
			profile: { id: 'p1', userId: 'u1' },
			messages: [],
			currentStep: 'welcome',
			isLoading: false,
			isStreaming: false,
			error: null
		});

		const sseData = [
			'data: not-valid-json\n\n',
			'data: {"content":"Valid chunk"}\n\n',
			': comment line\n\n',
			'\n\n',
			'data: [DONE]\n\n'
		];

		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				for (const chunk of sseData) {
					controller.enqueue(encoder.encode(chunk));
				}
				controller.close();
			}
		});

		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			body: stream
		} as any);

		await sendMessage('test');

		const state = get(onboardingStore) as any;
		expect(state.isStreaming).toBe(false);
		// Should skip malformed and process valid chunk
		expect(state.messages[1].content).toContain('Valid chunk');
	});

	it('should updateStep successfully', async () => {
		onboardingStore.set({
			profile: { id: 'p1', userId: 'u1' },
			messages: [],
			currentStep: 'welcome',
			isLoading: false,
			isStreaming: false,
			error: null
		});

		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				profile: { id: 'p1', userId: 'u1', onboardingStep: 'brand_identity' }
			})
		} as any);

		await updateStep('brand_identity');

		const state = get(onboardingStore) as any;
		expect(state.currentStep).toBe('brand_identity');
		expect(state.profile?.onboardingStep).toBe('brand_identity');
	});

	it('should handle updateStep with no profile in response', async () => {
		onboardingStore.set({
			profile: { id: 'p1', userId: 'u1' },
			messages: [],
			currentStep: 'welcome',
			isLoading: false,
			isStreaming: false,
			error: null
		});

		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({})
		} as any);

		await updateStep('brand_assessment');

		const state = get(onboardingStore) as any;
		expect(state.currentStep).toBe('brand_assessment');
	});

	it('should handle updateStep failure', async () => {
		onboardingStore.set({
			profile: { id: 'p1', userId: 'u1' },
			messages: [],
			currentStep: 'welcome',
			isLoading: false,
			isStreaming: false,
			error: null
		});

		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: false,
			statusText: 'Server Error'
		} as any);

		await updateStep('brand_identity');

		const state = get(onboardingStore) as any;
		expect(state.error).toContain('Failed to update step');
	});

	it('should handle updateStep network error', async () => {
		onboardingStore.set({
			profile: { id: 'p1', userId: 'u1' },
			messages: [],
			currentStep: 'welcome',
			isLoading: false,
			isStreaming: false,
			error: null
		});

		vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('Network error'));

		await updateStep('brand_identity');

		const state = get(onboardingStore) as any;
		expect(state.error).toBe('Network error');
	});

	it('should not updateStep when no profile', async () => {
		resetOnboarding();
		await updateStep('brand_identity');
		expect(globalThis.fetch).not.toHaveBeenCalled();
	});

	it('should updateBrandData successfully', async () => {
		onboardingStore.set({
			profile: { id: 'p1', userId: 'u1', brandName: 'Old Brand' },
			messages: [],
			currentStep: 'brand_identity',
			isLoading: false,
			isStreaming: false,
			error: null
		});

		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				profile: { id: 'p1', userId: 'u1', brandName: 'New Brand' }
			})
		} as any);

		await updateBrandData({ brandName: 'New Brand' });

		const state = get(onboardingStore) as any;
		expect(state.profile?.brandName).toBe('New Brand');
	});

	it('should handle updateBrandData failure', async () => {
		onboardingStore.set({
			profile: { id: 'p1', userId: 'u1' },
			messages: [],
			currentStep: 'welcome',
			isLoading: false,
			isStreaming: false,
			error: null
		});

		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: false,
			statusText: 'Error'
		} as any);

		await updateBrandData({ brandName: 'New' });

		const state = get(onboardingStore) as any;
		expect(state.error).toContain('Failed to update brand data');
	});

	it('should handle updateBrandData network error', async () => {
		onboardingStore.set({
			profile: { id: 'p1', userId: 'u1' },
			messages: [],
			currentStep: 'welcome',
			isLoading: false,
			isStreaming: false,
			error: null
		});

		vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('Network fail'));

		await updateBrandData({ brandName: 'New' });

		const state = get(onboardingStore) as any;
		expect(state.error).toBe('Network fail');
	});

	it('should handle updateBrandData with no profile in response', async () => {
		onboardingStore.set({
			profile: { id: 'p1', userId: 'u1', brandName: 'Old' },
			messages: [],
			currentStep: 'welcome',
			isLoading: false,
			isStreaming: false,
			error: null
		});

		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({})
		} as any);

		await updateBrandData({ brandName: 'New' });

		const state = get(onboardingStore) as any;
		// Should keep existing profile
		expect(state.profile?.brandName).toBe('Old');
	});

	it('should not updateBrandData when no profile', async () => {
		resetOnboarding();
		await updateBrandData({ brandName: 'New' });
		expect(globalThis.fetch).not.toHaveBeenCalled();
	});
});

// ─────────────────────────────────────
// WaveSpeed Video Provider
// ─────────────────────────────────────
describe('WaveSpeed Video Provider', () => {
	let WaveSpeedVideoProvider: any;

	beforeEach(async () => {
		vi.resetModules();
		vi.restoreAllMocks();
		globalThis.fetch = vi.fn();

		const mod = await import('../../src/lib/services/providers/wavespeed-video');
		WaveSpeedVideoProvider = mod.WaveSpeedVideoProvider;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should return available models', () => {
		const provider = new WaveSpeedVideoProvider();
		const models = provider.getAvailableModels();
		expect(models.length).toBeGreaterThan(0);
		expect(models[0].provider).toBe('wavespeed');
	});

	it('should generate video successfully', async () => {
		const provider = new WaveSpeedVideoProvider();
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				data: { id: 'job-1', status: 'created' }
			})
		} as any);

		const result = await provider.generateVideo('api-key', {
			prompt: 'A sunset',
			model: 'wan-2.1/t2v-720p'
		});

		expect(result.providerJobId).toBe('job-1');
		expect(result.status).toBe('queued');
	});

	it('should prefix model with wavespeed-ai/ if not present', async () => {
		const provider = new WaveSpeedVideoProvider();
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				data: { id: 'job-1', status: 'processing' }
			})
		} as any);

		await provider.generateVideo('api-key', {
			prompt: 'Test',
			model: 'some-model'
		});

		expect(globalThis.fetch).toHaveBeenCalledWith(
			expect.stringContaining('wavespeed-ai/some-model'),
			expect.any(Object)
		);
	});

	it('should not double-prefix wavespeed-ai/', async () => {
		const provider = new WaveSpeedVideoProvider();
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				data: { id: 'job-1', status: 'processing' }
			})
		} as any);

		await provider.generateVideo('api-key', {
			prompt: 'Test',
			model: 'wavespeed-ai/wan-2.1/t2v-720p'
		});

		expect(globalThis.fetch).toHaveBeenCalledWith(
			expect.stringContaining('wavespeed-ai/wan-2.1/t2v-720p'),
			expect.any(Object)
		);
		// Should NOT have wavespeed-ai/wavespeed-ai/
		const calledUrl = vi.mocked(globalThis.fetch).mock.calls[0][0] as string;
		expect(calledUrl).not.toContain('wavespeed-ai/wavespeed-ai/');
	});

	it('should pass optional params to API', async () => {
		const provider = new WaveSpeedVideoProvider();
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				data: { id: 'job-1', status: 'created' }
			})
		} as any);

		await provider.generateVideo('api-key', {
			prompt: 'A sunset',
			model: 'test',
			aspectRatio: '16:9',
			duration: 10,
			resolution: '1080p'
		});

		const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
		const body = JSON.parse((fetchCall[1] as any).body);
		expect(body.aspect_ratio).toBe('16:9');
		expect(body.duration).toBe(10);
		expect(body.resolution).toBe('1080p');
	});

	it('should handle generateVideo API error', async () => {
		const provider = new WaveSpeedVideoProvider();
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: false,
			status: 429,
			text: async () => 'Rate limited'
		} as any);

		const result = await provider.generateVideo('api-key', {
			prompt: 'Test',
			model: 'test'
		});

		expect(result.status).toBe('error');
		expect(result.error).toContain('429');
		expect(result.error).toContain('Rate limited');
	});

	it('should handle generateVideo API error with text() failure', async () => {
		const provider = new WaveSpeedVideoProvider();
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: false,
			status: 500,
			text: async () => {
				throw new Error('Cannot read body');
			}
		} as any);

		const result = await provider.generateVideo('api-key', {
			prompt: 'Test',
			model: 'test'
		});

		expect(result.status).toBe('error');
		expect(result.error).toContain('Unknown error');
	});

	it('should getStatus completed with video URL', async () => {
		const provider = new WaveSpeedVideoProvider();
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				data: {
					status: 'completed',
					outputs: ['https://example.com/video.mp4']
				}
			})
		} as any);

		const result = await provider.getStatus('api-key', 'job-1');

		expect(result.status).toBe('complete');
		expect(result.videoUrl).toBe('https://example.com/video.mp4');
	});

	it('should getStatus processing', async () => {
		const provider = new WaveSpeedVideoProvider();
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				data: { status: 'processing' }
			})
		} as any);

		const result = await provider.getStatus('api-key', 'job-1');
		expect(result.status).toBe('processing');
	});

	it('should getStatus pending (queued)', async () => {
		const provider = new WaveSpeedVideoProvider();
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				data: { status: 'pending' }
			})
		} as any);

		const result = await provider.getStatus('api-key', 'job-1');
		expect(result.status).toBe('queued');
	});

	it('should getStatus failed (error)', async () => {
		const provider = new WaveSpeedVideoProvider();
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				data: { status: 'failed', error: 'Generation failed' }
			})
		} as any);

		const result = await provider.getStatus('api-key', 'job-1');
		expect(result.status).toBe('error');
		expect(result.error).toBe('Generation failed');
	});

	it('should getStatus failed without custom error message', async () => {
		const provider = new WaveSpeedVideoProvider();
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				data: { status: 'failed' }
			})
		} as any);

		const result = await provider.getStatus('api-key', 'job-1');
		expect(result.status).toBe('error');
		expect(result.error).toBe('Unknown error');
	});

	it('should handle getStatus HTTP error', async () => {
		const provider = new WaveSpeedVideoProvider();
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: false,
			status: 404,
			text: async () => 'Not found'
		} as any);

		const result = await provider.getStatus('api-key', 'job-1');
		expect(result.status).toBe('error');
		expect(result.error).toContain('404');
	});

	it('should handle getStatus HTTP error with text failure', async () => {
		const provider = new WaveSpeedVideoProvider();
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: false,
			status: 500,
			text: async () => {
				throw new Error('err');
			}
		} as any);

		const result = await provider.getStatus('api-key', 'job-1');
		expect(result.status).toBe('error');
		expect(result.error).toContain('Unknown error');
	});

	it('should getStatus complete with empty outputs', async () => {
		const provider = new WaveSpeedVideoProvider();
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				data: { status: 'completed', outputs: [] }
			})
		} as any);

		const result = await provider.getStatus('api-key', 'job-1');
		expect(result.status).toBe('complete');
		expect(result.videoUrl).toBeUndefined();
	});

	it('should handle unknown status', async () => {
		const provider = new WaveSpeedVideoProvider();
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				data: { status: 'unknown-status' }
			})
		} as any);

		const result = await provider.getStatus('api-key', 'job-1');
		expect(result.status).toBe('processing'); // default fallback
	});

	it('should downloadVideo successfully', async () => {
		const provider = new WaveSpeedVideoProvider();
		const fakeBuffer = new ArrayBuffer(100);
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: true,
			arrayBuffer: async () => fakeBuffer
		} as any);

		const result = await provider.downloadVideo('api-key', 'https://example.com/video.mp4');
		expect(result).toBe(fakeBuffer);
	});

	it('should throw on downloadVideo failure', async () => {
		const provider = new WaveSpeedVideoProvider();
		vi.mocked(globalThis.fetch).mockResolvedValueOnce({
			ok: false,
			status: 403
		} as any);

		await expect(
			provider.downloadVideo('api-key', 'https://example.com/video.mp4')
		).rejects.toThrow('Failed to download video: 403');
	});
});

// ─────────────────────────────────────
// Video Registry
// ─────────────────────────────────────
describe('Video Registry', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
	});

	it('should get known provider', async () => {
		const { getVideoProvider } = await import('../../src/lib/services/video-registry');
		expect(getVideoProvider('openai')).not.toBeNull();
		expect(getVideoProvider('wavespeed')).not.toBeNull();
	});

	it('should return null for unknown provider', async () => {
		const { getVideoProvider } = await import('../../src/lib/services/video-registry');
		expect(getVideoProvider('unknown')).toBeNull();
	});

	it('should get all video models', async () => {
		const { getAllVideoModels } = await import('../../src/lib/services/video-registry');
		const models = getAllVideoModels();
		expect(models.length).toBeGreaterThan(0);
		// Should include models from both providers
		const providers = [...new Set(models.map((m: any) => m.provider))];
		expect(providers).toContain('openai');
		expect(providers).toContain('wavespeed');
	});

	it('should getEnabledVideoKey with preferred provider', async () => {
		const { getEnabledVideoKey } = await import('../../src/lib/services/video-registry');
		const platform = {
			env: {
				KV: {
					get: vi.fn().mockImplementation((key: string) => {
						if (key === 'ai_keys_list') return JSON.stringify(['k1', 'k2']);
						if (key === 'ai_key:k1')
							return JSON.stringify({
								id: 'k1',
								provider: 'openai',
								enabled: true,
								videoEnabled: true,
								apiKey: 'sk-123'
							});
						if (key === 'ai_key:k2')
							return JSON.stringify({
								id: 'k2',
								provider: 'wavespeed',
								enabled: true,
								videoEnabled: true,
								apiKey: 'ws-123'
							});
						return null;
					})
				}
			}
		};

		const key = await getEnabledVideoKey(platform as any, 'wavespeed');
		expect(key?.provider).toBe('wavespeed');
	});

	it('should getEnabledVideoKey returns null when no keys', async () => {
		const { getEnabledVideoKey } = await import('../../src/lib/services/video-registry');
		const platform = {
			env: { KV: { get: vi.fn().mockResolvedValue(null) } }
		};
		const result = await getEnabledVideoKey(platform as any);
		expect(result).toBeNull();
	});

	it('should getEnabledVideoKey skip disabled keys', async () => {
		const { getEnabledVideoKey } = await import('../../src/lib/services/video-registry');
		const platform = {
			env: {
				KV: {
					get: vi.fn().mockImplementation((key: string) => {
						if (key === 'ai_keys_list') return JSON.stringify(['k1']);
						if (key === 'ai_key:k1')
							return JSON.stringify({
								id: 'k1',
								provider: 'openai',
								enabled: false,
								videoEnabled: true
							});
						return null;
					})
				}
			}
		};
		const result = await getEnabledVideoKey(platform as any);
		expect(result).toBeNull();
	});

	it('should getEnabledVideoKey skip non-video keys', async () => {
		const { getEnabledVideoKey } = await import('../../src/lib/services/video-registry');
		const platform = {
			env: {
				KV: {
					get: vi.fn().mockImplementation((key: string) => {
						if (key === 'ai_keys_list') return JSON.stringify(['k1']);
						if (key === 'ai_key:k1')
							return JSON.stringify({
								id: 'k1',
								provider: 'openai',
								enabled: true,
								videoEnabled: false
							});
						return null;
					})
				}
			}
		};
		const result = await getEnabledVideoKey(platform as any);
		expect(result).toBeNull();
	});

	it('should handle getEnabledVideoKey KV errors', async () => {
		const { getEnabledVideoKey } = await import('../../src/lib/services/video-registry');
		const platform = {
			env: {
				KV: {
					get: vi.fn().mockRejectedValue(new Error('KV error'))
				}
			}
		};
		const result = await getEnabledVideoKey(platform as any);
		expect(result).toBeNull();
	});

	it('should getAllEnabledVideoKeys', async () => {
		const { getAllEnabledVideoKeys } = await import('../../src/lib/services/video-registry');
		const platform = {
			env: {
				KV: {
					get: vi.fn().mockImplementation((key: string) => {
						if (key === 'ai_keys_list') return JSON.stringify(['k1', 'k2']);
						if (key === 'ai_key:k1')
							return JSON.stringify({
								id: 'k1',
								provider: 'openai',
								enabled: true,
								videoEnabled: true
							});
						if (key === 'ai_key:k2')
							return JSON.stringify({
								id: 'k2',
								provider: 'wavespeed',
								enabled: true,
								videoEnabled: false
							});
						return null;
					})
				}
			}
		};
		const keys = await getAllEnabledVideoKeys(platform as any);
		expect(keys).toHaveLength(1);
		expect(keys[0].provider).toBe('openai');
	});

	it('should handle getAllEnabledVideoKeys with no keys list', async () => {
		const { getAllEnabledVideoKeys } = await import('../../src/lib/services/video-registry');
		const platform = {
			env: { KV: { get: vi.fn().mockResolvedValue(null) } }
		};
		const keys = await getAllEnabledVideoKeys(platform as any);
		expect(keys).toEqual([]);
	});

	it('should handle getAllEnabledVideoKeys with KV error', async () => {
		const { getAllEnabledVideoKeys } = await import('../../src/lib/services/video-registry');
		const platform = {
			env: { KV: { get: vi.fn().mockRejectedValue(new Error('KV error')) } }
		};
		const keys = await getAllEnabledVideoKeys(platform as any);
		expect(keys).toEqual([]);
	});

	it('should getModelsForKey with all models', async () => {
		const { getModelsForKey } = await import('../../src/lib/services/video-registry');
		const key = {
			id: 'k1',
			name: 'Key',
			provider: 'openai',
			apiKey: 'sk-123',
			enabled: true,
			videoEnabled: true
		};
		const models = getModelsForKey(key);
		expect(models.length).toBeGreaterThan(0);
	});

	it('should getModelsForKey with filtered models', async () => {
		const { getModelsForKey } = await import('../../src/lib/services/video-registry');
		const key = {
			id: 'k1',
			name: 'Key',
			provider: 'openai',
			apiKey: 'sk-123',
			enabled: true,
			videoEnabled: true,
			videoModels: ['sora-2']
		};
		const models = getModelsForKey(key);
		expect(models).toHaveLength(1);
		expect(models[0].id).toBe('sora-2');
	});

	it('should getModelsForKey for unknown provider', async () => {
		const { getModelsForKey } = await import('../../src/lib/services/video-registry');
		const key = { id: 'k1', name: 'Key', provider: 'nonexistent', apiKey: 'x', enabled: true };
		const models = getModelsForKey(key);
		expect(models).toEqual([]);
	});

	it('should handle getEnabledVideoKey with null key data', async () => {
		const { getEnabledVideoKey } = await import('../../src/lib/services/video-registry');
		const platform = {
			env: {
				KV: {
					get: vi.fn().mockImplementation((key: string) => {
						if (key === 'ai_keys_list') return JSON.stringify(['k1']);
						if (key === 'ai_key:k1') return null;
						return null;
					})
				}
			}
		};
		const result = await getEnabledVideoKey(platform as any);
		expect(result).toBeNull();
	});

	it('should handle getAllEnabledVideoKeys with null key data', async () => {
		const { getAllEnabledVideoKeys } = await import('../../src/lib/services/video-registry');
		const platform = {
			env: {
				KV: {
					get: vi.fn().mockImplementation((key: string) => {
						if (key === 'ai_keys_list') return JSON.stringify(['k1']);
						if (key === 'ai_key:k1') return null;
						return null;
					})
				}
			}
		};
		const keys = await getAllEnabledVideoKeys(platform as any);
		expect(keys).toEqual([]);
	});
});
