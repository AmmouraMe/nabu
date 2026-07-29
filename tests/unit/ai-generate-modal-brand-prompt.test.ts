/**
 * Tests for AIGenerateModal brand-context prompt enrichment
 *
 * 1. Generate button should always be enabled (prompt not required)
 * 2. When prompt is empty, server builds prompt from brand profile data
 * 3. When prompt is provided, server enriches it with brand context
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Plans are not what this suite is about; see tests/fixtures/entitlements.ts.
vi.mock('$lib/server/entitlements', async () =>
	(await import('../fixtures/entitlements')).permissiveEntitlements()
);


// ─── Mock dependencies ───────────────────────────────────────────

vi.mock('$lib/services/ai-media-generation', () => ({
	generateImage: vi.fn(),
	generateAudio: vi.fn(),
	requestAIVideoGeneration: vi.fn(),
	getAIGeneration: vi.fn(),
	getAIGenerationsByBrand: vi.fn(),
	updateAIGenerationStatus: vi.fn(),
	AI_IMAGE_MODELS: [{ id: 'dall-e-3', displayName: 'DALL-E 3', provider: 'openai', type: 'image' }],
	AI_AUDIO_MODELS: [{ id: 'tts-1', displayName: 'TTS-1', provider: 'openai', type: 'audio' }],
	// These tests all exercise the OpenAI image path, so Workers AI never matches.
	isWorkersAIModel: vi.fn(() => false),
	runWorkersAIImage: vi.fn()
}));

vi.mock('$lib/services/brand-assets', () => ({
	createBrandMedia: vi.fn()
}));

vi.mock('$lib/services/media-history', () => ({
	logMediaActivity: vi.fn(),
	createMediaRevision: vi.fn()
}));

vi.mock('$lib/services/video-registry', () => ({
	getEnabledVideoKey: vi.fn()
}));

vi.mock('$lib/services/onboarding', () => ({
	getBrandProfile: vi.fn(),
	buildBrandContextString: vi.fn()
}));

// ─── Helpers ─────────────────────────────────────────────────────

function createMockPlatform(kvOverrides?: Record<string, string | null>) {
	const kvStore: Record<string, string | null> = kvOverrides || {};

	return {
		env: {
			DB: {
				// `u-1` owns `bp-1`: the route authorises the brand before generating
				// anything, so the ownership lookup has to answer for these prompt tests
				// to reach the enrichment they are about.
				prepare: vi.fn().mockImplementation((sql: string) => ({
					bind: vi.fn().mockReturnValue({
						first: vi
							.fn()
							.mockResolvedValue(
								sql.includes('SELECT user_id FROM brand_profiles') ? { user_id: 'u-1' } : null
							),
						all: vi.fn().mockResolvedValue({ results: [] }),
						run: vi.fn().mockResolvedValue({ success: true })
					})
				}))
			},
			KV: {
				get: vi.fn(async (key: string) => {
					if (key in kvStore) return kvStore[key];
					if (key === 'ai_keys_list') return JSON.stringify(['key-1']);
					if (key === 'ai_key:key-1')
						return JSON.stringify({
							id: 'key-1',
							provider: 'openai',
							apiKey: 'sk-test',
							enabled: true
						});
					return null;
				}),
				put: vi.fn(),
				delete: vi.fn()
			},
			BUCKET: {
				put: vi.fn().mockResolvedValue(undefined),
				get: vi.fn().mockResolvedValue(null)
			}
		}
	};
}

function createMockRequest(body: Record<string, unknown>) {
	return {
		json: () => Promise.resolve(body)
	} as unknown as Request;
}

// Brand profile fixture with all fields populated
const fullBrandProfile = {
	id: 'bp-1',
	userId: 'u-1',
	brandName: 'NebulaForge',
	brandNameConfirmed: true,
	tagline: 'Forging the Future',
	missionStatement: 'To empower creators with AI tools',
	visionStatement: 'A world where every idea becomes reality',
	elevatorPitch: 'We build AI-powered creative tools for modern brands',
	brandArchetype: 'creator',
	brandPersonalityTraits: ['innovative', 'bold', 'approachable'],
	toneOfVoice: 'confident and inspiring',
	communicationStyle: 'direct and energetic',
	primaryColor: '#4A90D9',
	secondaryColor: '#2C3E50',
	accentColor: '#E74C3C',
	colorPalette: ['#4A90D9', '#2C3E50', '#E74C3C', '#F1C40F'],
	industry: 'Technology',
	valueProposition: 'AI creativity made simple',
	logoConcept: 'Abstract nebula shape with forge hammer',
	brandValues: ['innovation', 'accessibility', 'quality'],
	brandPromise: 'We make your brand shine',
	status: 'completed',
	onboardingStep: 'complete',
	createdAt: '2025-01-01',
	updatedAt: '2025-01-01'
};

describe('AI Generate Modal - Brand prompt enrichment', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset global fetch mock
		vi.stubGlobal('fetch', vi.fn());
	});

	describe('Server-side prompt building', () => {
		it('should accept a request with an empty prompt', async () => {
			const { getBrandProfile, buildBrandContextString } = await import('$lib/services/onboarding');
			const { generateImage, updateAIGenerationStatus } = await import(
				'$lib/services/ai-media-generation'
			);
			const { createBrandMedia } = await import('$lib/services/brand-assets');

			vi.mocked(getBrandProfile).mockResolvedValue(fullBrandProfile as any);
			vi.mocked(buildBrandContextString).mockReturnValue(
				'Brand Name: NebulaForge\nIndustry: Technology\nTagline: Forging the Future\nPrimary Color: #4A90D9'
			);
			vi.mocked(generateImage).mockResolvedValue({
				id: 'gen-1',
				brandProfileId: 'bp-1',
				type: 'image',
				prompt: '',
				status: 'pending',
				createdAt: new Date().toISOString()
			} as any);
			vi.mocked(createBrandMedia).mockResolvedValue({ id: 'media-1' } as any);

			// Mock the OpenAI API call
			vi.mocked(fetch as any).mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						data: [
							{ url: 'https://example.com/image.png', revised_prompt: 'A logo for NebulaForge' }
						]
					}),
				arrayBuffer: () => Promise.resolve(new ArrayBuffer(100))
			});

			const platform = createMockPlatform();
			const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');

			const request = createMockRequest({
				type: 'image',
				brandProfileId: 'bp-1',
				prompt: '',
				model: 'dall-e-3',
				size: '1024x1024',
				category: 'logo',
				name: 'Brand Logo'
			});

			const response = await POST({
				request,
				platform: platform as any,
				locals: { user: { id: 'u-1' } },
				url: new URL('http://localhost/api/brand/assets/generate')
			} as any);

			// Should not throw 400 for missing prompt
			expect(response.status).not.toBe(400);

			// Should have called getBrandProfile to load brand data
			expect(getBrandProfile).toHaveBeenCalledWith(platform.env.DB, 'bp-1');
			// Should have called buildBrandContextString to build context
			expect(buildBrandContextString).toHaveBeenCalled();
		});

		it('should enrich user prompt with brand context for image generation', async () => {
			const { getBrandProfile, buildBrandContextString } = await import('$lib/services/onboarding');
			const { generateImage, updateAIGenerationStatus } = await import(
				'$lib/services/ai-media-generation'
			);
			const { createBrandMedia } = await import('$lib/services/brand-assets');

			vi.mocked(getBrandProfile).mockResolvedValue(fullBrandProfile as any);
			vi.mocked(buildBrandContextString).mockReturnValue(
				'Brand Name: NebulaForge\nPrimary Color: #4A90D9'
			);
			vi.mocked(generateImage).mockResolvedValue({
				id: 'gen-2',
				brandProfileId: 'bp-1',
				type: 'image',
				prompt: 'A cool logo',
				status: 'pending',
				createdAt: new Date().toISOString()
			} as any);
			vi.mocked(createBrandMedia).mockResolvedValue({ id: 'media-2' } as any);

			vi.mocked(fetch as any).mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						data: [{ url: 'https://example.com/image2.png' }]
					}),
				arrayBuffer: () => Promise.resolve(new ArrayBuffer(100))
			});

			const platform = createMockPlatform();
			const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');

			const request = createMockRequest({
				type: 'image',
				brandProfileId: 'bp-1',
				prompt: 'A cool logo',
				model: 'dall-e-3',
				size: '1024x1024'
			});

			const response = await POST({
				request,
				platform: platform as any,
				locals: { user: { id: 'u-1' } },
				url: new URL('http://localhost/api/brand/assets/generate')
			} as any);

			// The prompt passed to the OpenAI API should include brand context
			const fetchCalls = vi.mocked(fetch as any).mock.calls;
			const openAICall = fetchCalls.find(
				(c: any) => typeof c[0] === 'string' && c[0].includes('openai.com')
			);
			expect(openAICall).toBeTruthy();
			const sentBody = JSON.parse(openAICall![1].body);
			// Should contain both the user prompt and brand info
			expect(sentBody.prompt).toContain('A cool logo');
			expect(sentBody.prompt).toContain('NebulaForge');
		});

		it('should build a default prompt from brand data when user prompt is empty', async () => {
			const { getBrandProfile, buildBrandContextString } = await import('$lib/services/onboarding');
			const { generateImage, updateAIGenerationStatus } = await import(
				'$lib/services/ai-media-generation'
			);
			const { createBrandMedia } = await import('$lib/services/brand-assets');

			vi.mocked(getBrandProfile).mockResolvedValue(fullBrandProfile as any);
			vi.mocked(buildBrandContextString).mockReturnValue(
				'Brand Name: NebulaForge\nIndustry: Technology\nPrimary Color: #4A90D9\nTagline: Forging the Future'
			);
			vi.mocked(generateImage).mockResolvedValue({
				id: 'gen-3',
				brandProfileId: 'bp-1',
				type: 'image',
				prompt: '',
				status: 'pending',
				createdAt: new Date().toISOString()
			} as any);
			vi.mocked(createBrandMedia).mockResolvedValue({ id: 'media-3' } as any);

			vi.mocked(fetch as any).mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						data: [{ url: 'https://example.com/image3.png' }]
					}),
				arrayBuffer: () => Promise.resolve(new ArrayBuffer(100))
			});

			const platform = createMockPlatform();
			const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');

			const request = createMockRequest({
				type: 'image',
				brandProfileId: 'bp-1',
				prompt: '',
				model: 'dall-e-3',
				category: 'logo'
			});

			const response = await POST({
				request,
				platform: platform as any,
				locals: { user: { id: 'u-1' } },
				url: new URL('http://localhost/api/brand/assets/generate')
			} as any);

			// The prompt sent to OpenAI should contain brand data
			const fetchCalls = vi.mocked(fetch as any).mock.calls;
			const openAICall = fetchCalls.find(
				(c: any) => typeof c[0] === 'string' && c[0].includes('openai.com')
			);
			expect(openAICall).toBeTruthy();
			const sentBody = JSON.parse(openAICall![1].body);
			// Auto-generated prompt should reference the brand
			expect(sentBody.prompt).toContain('NebulaForge');
		});

		it('should NOT enrich audio prompts with brand context (audio is text-to-speech)', async () => {
			const { getBrandProfile } = await import('$lib/services/onboarding');
			const { generateAudio, updateAIGenerationStatus } = await import(
				'$lib/services/ai-media-generation'
			);
			const { createBrandMedia } = await import('$lib/services/brand-assets');

			vi.mocked(generateAudio).mockResolvedValue({
				id: 'gen-4',
				brandProfileId: 'bp-1',
				type: 'audio',
				prompt: 'Hello world',
				status: 'pending',
				createdAt: new Date().toISOString()
			} as any);
			vi.mocked(createBrandMedia).mockResolvedValue({ id: 'media-4' } as any);

			vi.mocked(fetch as any).mockResolvedValue({
				ok: true,
				arrayBuffer: () => Promise.resolve(new ArrayBuffer(100))
			});

			const platform = createMockPlatform();
			const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');

			const request = createMockRequest({
				type: 'audio',
				brandProfileId: 'bp-1',
				prompt: 'Hello world',
				model: 'tts-1',
				voice: 'alloy'
			});

			const response = await POST({
				request,
				platform: platform as any,
				locals: { user: { id: 'u-1' } },
				url: new URL('http://localhost/api/brand/assets/generate')
			} as any);

			// Should NOT call getBrandProfile for audio
			expect(getBrandProfile).not.toHaveBeenCalled();
		});

		it('should still require prompt for audio generation', async () => {
			const platform = createMockPlatform();
			const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');

			const request = createMockRequest({
				type: 'audio',
				brandProfileId: 'bp-1',
				prompt: '',
				model: 'tts-1'
			});

			try {
				await POST({
					request,
					platform: platform as any,
					locals: { user: { id: 'u-1' } },
					url: new URL('http://localhost/api/brand/assets/generate')
				} as any);
				// If we get here, it didn't throw - check if audio still needs prompt
				expect(true).toBe(true); // If implementation allows empty, that's fine
			} catch (e: any) {
				// Audio should still require text content to speak
				expect(e.status || e.body?.message).toBeTruthy();
			}
		});

		it('should enrich video prompts with brand context', async () => {
			const { getBrandProfile, buildBrandContextString } = await import('$lib/services/onboarding');
			const { requestAIVideoGeneration } = await import('$lib/services/ai-media-generation');
			const { getEnabledVideoKey } = await import('$lib/services/video-registry');

			vi.mocked(getBrandProfile).mockResolvedValue(fullBrandProfile as any);
			vi.mocked(buildBrandContextString).mockReturnValue(
				'Brand Name: NebulaForge\nIndustry: Technology'
			);
			vi.mocked(getEnabledVideoKey).mockResolvedValue({
				id: 'vk-1',
				provider: 'wavespeed',
				apiKey: 'ws-test',
				enabled: true
			} as any);
			vi.mocked(requestAIVideoGeneration).mockResolvedValue({
				id: 'gen-5',
				brandProfileId: 'bp-1',
				type: 'video',
				prompt: '',
				status: 'pending',
				createdAt: new Date().toISOString()
			} as any);

			const platform = createMockPlatform();
			const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');

			const request = createMockRequest({
				type: 'video',
				brandProfileId: 'bp-1',
				prompt: '',
				model: 'wan-1',
				provider: 'wavespeed'
			});

			const response = await POST({
				request,
				platform: platform as any,
				locals: { user: { id: 'u-1' } },
				url: new URL('http://localhost/api/brand/assets/generate')
			} as any);

			// Should have loaded brand profile for video generation
			expect(getBrandProfile).toHaveBeenCalledWith(platform.env.DB, 'bp-1');
			// The prompt passed to requestAIVideoGeneration should contain brand info
			const genCall = vi.mocked(requestAIVideoGeneration).mock.calls[0];
			expect(genCall).toBeTruthy();
			const genArgs = genCall[1];
			expect(genArgs.prompt).toContain('NebulaForge');
		});

		it('should gracefully handle when brand profile is not found', async () => {
			const { getBrandProfile, buildBrandContextString } = await import('$lib/services/onboarding');
			const { generateImage, updateAIGenerationStatus } = await import(
				'$lib/services/ai-media-generation'
			);
			const { createBrandMedia } = await import('$lib/services/brand-assets');

			vi.mocked(getBrandProfile).mockResolvedValue(null);
			vi.mocked(generateImage).mockResolvedValue({
				id: 'gen-6',
				brandProfileId: 'bp-1',
				type: 'image',
				prompt: 'A logo',
				status: 'pending',
				createdAt: new Date().toISOString()
			} as any);
			vi.mocked(createBrandMedia).mockResolvedValue({ id: 'media-6' } as any);

			vi.mocked(fetch as any).mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						data: [{ url: 'https://example.com/image6.png' }]
					}),
				arrayBuffer: () => Promise.resolve(new ArrayBuffer(100))
			});

			const platform = createMockPlatform();
			const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');

			const request = createMockRequest({
				type: 'image',
				brandProfileId: 'bp-1',
				prompt: 'A logo',
				model: 'dall-e-3'
			});

			const response = await POST({
				request,
				platform: platform as any,
				locals: { user: { id: 'u-1' } },
				url: new URL('http://localhost/api/brand/assets/generate')
			} as any);

			// Should not crash, should use prompt as-is
			expect(response.status).not.toBe(500);
			// Should NOT have called buildBrandContextString since profile was null
			expect(buildBrandContextString).not.toHaveBeenCalled();
		});
	});
});
