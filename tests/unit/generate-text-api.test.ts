/**
 * Tests for POST /api/brand/assets/generate-text
 * Covers: text generation endpoint, brand context building, OpenAI API calls,
 * error handling, and the getOpenAIKey helper.
 * Target: lines 47-153, 162-176 of +server.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────

vi.mock('$lib/services/ai-text-generation', () => ({
	buildBrandContextPrompt: vi.fn().mockReturnValue('You are a brand copywriter.'),
	buildTextGenerationPrompt: vi.fn().mockReturnValue('Generate a tagline for this brand.'),
	TEXT_GENERATION_PRESETS: {
		messaging: [
			{ key: 'tagline', label: 'Tagline', description: 'A catchy tagline' },
			{ key: 'slogan', label: 'Slogan', description: 'A memorable slogan' }
		],
		descriptions: [{ key: 'short_bio', label: 'Short Bio', description: 'A brief description' }]
	}
}));

vi.mock('$lib/services/brand-assets', () => ({
	getBrandTexts: vi.fn().mockResolvedValue([])
}));

vi.mock('$lib/services/brand', () => ({
	getBrandProfileForUser: vi.fn()
}));

// ─── Helpers ─────────────────────────────────────────────────────

function createMockPlatform(kvOverrides?: Record<string, string | null>) {
	const kvStore: Record<string, string | null> = kvOverrides || {};
	return {
		env: {
			DB: {
				prepare: vi.fn().mockReturnValue({
					bind: vi.fn().mockReturnValue({
						first: vi.fn().mockResolvedValue(null),
						all: vi.fn().mockResolvedValue({ results: [] }),
						run: vi.fn().mockResolvedValue({ success: true })
					})
				})
			},
			KV: {
				get: vi.fn().mockImplementation((key: string) => {
					return Promise.resolve(kvStore[key] ?? null);
				}),
				put: vi.fn().mockResolvedValue(undefined),
				delete: vi.fn().mockResolvedValue(undefined)
			}
		}
	};
}

function createMockUser() {
	return { id: 'user-1', login: 'tester', email: 'test@test.com', isOwner: false, isAdmin: false };
}

function kvWithOpenAIKey() {
	return {
		ai_keys_list: JSON.stringify(['key1']),
		'ai_key:key1': JSON.stringify({
			id: 'key1',
			provider: 'openai',
			apiKey: 'sk-test-gen-text',
			model: 'gpt-4o-mini',
			enabled: true
		})
	};
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
	vi.clearAllMocks();
	originalFetch = globalThis.fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

// ─── GET /api/brand/assets/generate-text ────────────────

describe('GET /api/brand/assets/generate-text', () => {
	it('should return 401 when not authenticated', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		const event = {
			locals: {},
			url: new URL('http://localhost/api/brand/assets/generate-text')
		};

		await expect(GET(event as any)).rejects.toThrow();
	});

	it('should return all presets when no category specified', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		const event = {
			locals: { user: createMockUser() },
			url: new URL('http://localhost/api/brand/assets/generate-text')
		};

		const response = await GET(event as any);
		const data = await response.json();
		expect(data.presets).toBeDefined();
		expect(data.presets.messaging).toBeDefined();
		expect(data.presets.descriptions).toBeDefined();
	});

	it('should return presets for a specific category', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		const event = {
			locals: { user: createMockUser() },
			url: new URL('http://localhost/api/brand/assets/generate-text?category=messaging')
		};

		const response = await GET(event as any);
		const data = await response.json();
		expect(data.presets).toBeDefined();
		expect(Array.isArray(data.presets)).toBe(true);
	});

	it('should return empty array for unknown category', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		const event = {
			locals: { user: createMockUser() },
			url: new URL('http://localhost/api/brand/assets/generate-text?category=nonexistent')
		};

		const response = await GET(event as any);
		const data = await response.json();
		expect(data.presets).toEqual([]);
	});
});

// ─── POST /api/brand/assets/generate-text ───────────────

describe('POST /api/brand/assets/generate-text', () => {
	it('should return 401 when not authenticated', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		const event = {
			locals: {},
			platform: createMockPlatform(),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					brandProfileId: 'bp-1',
					category: 'messaging',
					key: 'tagline',
					label: 'Tagline'
				})
			})
		};

		await expect(POST(event as any)).rejects.toThrow();
	});

	it('should return 500 when platform unavailable', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: null,
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					brandProfileId: 'bp-1',
					category: 'messaging',
					key: 'tagline',
					label: 'Tagline'
				})
			})
		};

		await expect(POST(event as any)).rejects.toThrow();
	});

	it('should return 400 when brandProfileId missing', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ category: 'messaging', key: 'tagline', label: 'Tagline' })
			})
		};

		await expect(POST(event as any)).rejects.toThrow();
	});

	it('should return 400 when category missing', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ brandProfileId: 'bp-1', key: 'tagline', label: 'Tagline' })
			})
		};

		await expect(POST(event as any)).rejects.toThrow();
	});

	it('should return 400 when key missing', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ brandProfileId: 'bp-1', category: 'messaging', label: 'Tagline' })
			})
		};

		await expect(POST(event as any)).rejects.toThrow();
	});

	it('should return 400 when label missing', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ brandProfileId: 'bp-1', category: 'messaging', key: 'tagline' })
			})
		};

		await expect(POST(event as any)).rejects.toThrow();
	});

	it('should return 404 when brand profile not found', async () => {
		const { getBrandProfileForUser } = await import('$lib/services/brand');
		vi.mocked(getBrandProfileForUser).mockResolvedValue(null);

		const { POST } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					brandProfileId: 'bp-1',
					category: 'messaging',
					key: 'tagline',
					label: 'Tagline'
				})
			})
		};

		await expect(POST(event as any)).rejects.toThrow();
	});

	it('should return 400 when no OpenAI key configured', async () => {
		const { getBrandProfileForUser } = await import('$lib/services/brand');
		vi.mocked(getBrandProfileForUser).mockResolvedValue({
			id: 'bp-1',
			userId: 'user-1',
			brandName: 'TestBrand'
		} as any);

		const { POST } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(), // No KV keys
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					brandProfileId: 'bp-1',
					category: 'messaging',
					key: 'tagline',
					label: 'Tagline'
				})
			})
		};

		await expect(POST(event as any)).rejects.toThrow();
	});

	it('should generate text successfully', async () => {
		const { getBrandProfileForUser } = await import('$lib/services/brand');
		vi.mocked(getBrandProfileForUser).mockResolvedValue({
			id: 'bp-1',
			userId: 'user-1',
			brandName: 'TestBrand',
			tagline: 'Existing tagline',
			industry: 'Tech',
			toneOfVoice: 'Professional'
		} as any);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ message: { content: 'Innovation at your fingertips' } }],
				usage: { total_tokens: 150 }
			})
		});

		const { POST } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(kvWithOpenAIKey()),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					brandProfileId: 'bp-1',
					category: 'messaging',
					key: 'tagline',
					label: 'Tagline'
				})
			})
		};

		const response = await POST(event as any);
		const data = await response.json();
		expect(data.text).toBe('Innovation at your fingertips');
		// The route reports the key's configured model, falling back to its provider
		// name. Token counts are no longer surfaced — the shared chatCompletionWithKey
		// helper returns only the generated string.
		expect(data.model).toBe('gpt-4o-mini');
	});

	it('should handle OpenAI API error (non-ok response)', async () => {
		const { getBrandProfileForUser } = await import('$lib/services/brand');
		vi.mocked(getBrandProfileForUser).mockResolvedValue({
			id: 'bp-1',
			userId: 'user-1',
			brandName: 'TestBrand'
		} as any);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 429,
			json: async () => ({ error: { message: 'Rate limit exceeded' } })
		});

		const { POST } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(kvWithOpenAIKey()),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					brandProfileId: 'bp-1',
					category: 'messaging',
					key: 'tagline',
					label: 'Tagline'
				})
			})
		};

		await expect(POST(event as any)).rejects.toThrow();
	});

	it('should handle empty AI response (no text generated)', async () => {
		const { getBrandProfileForUser } = await import('$lib/services/brand');
		vi.mocked(getBrandProfileForUser).mockResolvedValue({
			id: 'bp-1',
			userId: 'user-1',
			brandName: 'TestBrand'
		} as any);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ message: { content: '' } }],
				usage: { total_tokens: 10 }
			})
		});

		const { POST } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(kvWithOpenAIKey()),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					brandProfileId: 'bp-1',
					category: 'messaging',
					key: 'tagline',
					label: 'Tagline'
				})
			})
		};

		await expect(POST(event as any)).rejects.toThrow();
	});

	it('should handle fetch exception gracefully', async () => {
		const { getBrandProfileForUser } = await import('$lib/services/brand');
		vi.mocked(getBrandProfileForUser).mockResolvedValue({
			id: 'bp-1',
			userId: 'user-1',
			brandName: 'TestBrand'
		} as any);

		globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

		const { POST } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(kvWithOpenAIKey()),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					brandProfileId: 'bp-1',
					category: 'messaging',
					key: 'tagline',
					label: 'Tagline'
				})
			})
		};

		await expect(POST(event as any)).rejects.toThrow();
	});

	it('should handle API error with non-JSON error body', async () => {
		const { getBrandProfileForUser } = await import('$lib/services/brand');
		vi.mocked(getBrandProfileForUser).mockResolvedValue({
			id: 'bp-1',
			userId: 'user-1',
			brandName: 'TestBrand'
		} as any);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			json: () => Promise.reject(new Error('Not JSON'))
		});

		const { POST } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(kvWithOpenAIKey()),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					brandProfileId: 'bp-1',
					category: 'messaging',
					key: 'tagline',
					label: 'Tagline'
				})
			})
		};

		await expect(POST(event as any)).rejects.toThrow();
	});

	it('should load existing brand texts for context', async () => {
		const { getBrandProfileForUser } = await import('$lib/services/brand');
		const { getBrandTexts } = await import('$lib/services/brand-assets');

		vi.mocked(getBrandProfileForUser).mockResolvedValue({
			id: 'bp-1',
			userId: 'user-1',
			brandName: 'TestBrand',
			targetAudience: { age: '25-35' }
		} as any);

		vi.mocked(getBrandTexts).mockResolvedValue([
			{
				id: 't1',
				brandProfileId: 'bp-1',
				category: 'messaging' as any,
				key: 'mission',
				label: 'Mission',
				value: 'To innovate',
				language: 'en',
				sortOrder: 0,
				createdAt: '2026-01-01',
				updatedAt: '2026-01-01'
			}
		]);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ message: { content: 'Generated text' } }],
				usage: { total_tokens: 100 }
			})
		});

		const { POST } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(kvWithOpenAIKey()),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					brandProfileId: 'bp-1',
					category: 'messaging',
					key: 'tagline',
					label: 'Tagline'
				})
			})
		};

		const response = await POST(event as any);
		const data = await response.json();
		expect(data.text).toBe('Generated text');
		expect(getBrandTexts).toHaveBeenCalledWith(expect.anything(), 'bp-1');
	});

	it('should continue even if getBrandTexts throws', async () => {
		const { getBrandProfileForUser } = await import('$lib/services/brand');
		const { getBrandTexts } = await import('$lib/services/brand-assets');

		vi.mocked(getBrandProfileForUser).mockResolvedValue({
			id: 'bp-1',
			userId: 'user-1',
			brandName: 'TestBrand'
		} as any);

		vi.mocked(getBrandTexts).mockRejectedValue(new Error('DB error'));

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ message: { content: 'Still works' } }],
				usage: { total_tokens: 50 }
			})
		});

		const { POST } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(kvWithOpenAIKey()),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					brandProfileId: 'bp-1',
					category: 'messaging',
					key: 'tagline',
					label: 'Tagline'
				})
			})
		};

		const response = await POST(event as any);
		const data = await response.json();
		expect(data.text).toBe('Still works');
	});

	it('should handle null usage in OpenAI response', async () => {
		const { getBrandProfileForUser } = await import('$lib/services/brand');
		vi.mocked(getBrandProfileForUser).mockResolvedValue({
			id: 'bp-1',
			userId: 'user-1',
			brandName: 'TestBrand'
		} as any);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ message: { content: 'Text without usage' } }]
				// No usage field
			})
		});

		const { POST } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(kvWithOpenAIKey()),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					brandProfileId: 'bp-1',
					category: 'messaging',
					key: 'tagline',
					label: 'Tagline'
				})
			})
		};

		const response = await POST(event as any);
		const data = await response.json();
		expect(data.text).toBe('Text without usage');
		// A missing `usage` block is not an error — the route never reads it.
		expect(data).not.toHaveProperty('tokensUsed');
	});

	it('should pass customPrompt when provided', async () => {
		const { getBrandProfileForUser } = await import('$lib/services/brand');
		const { buildTextGenerationPrompt } = await import('$lib/services/ai-text-generation');

		vi.mocked(getBrandProfileForUser).mockResolvedValue({
			id: 'bp-1',
			userId: 'user-1',
			brandName: 'TestBrand'
		} as any);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ message: { content: 'Custom generated' } }],
				usage: { total_tokens: 80 }
			})
		});

		const { POST } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		const event = {
			locals: { user: createMockUser() },
			platform: createMockPlatform(kvWithOpenAIKey()),
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					brandProfileId: 'bp-1',
					category: 'messaging',
					key: 'tagline',
					label: 'Tagline',
					customPrompt: 'Make it rhyme'
				})
			})
		};

		const response = await POST(event as any);
		const data = await response.json();
		expect(data.text).toBe('Custom generated');
		expect(buildTextGenerationPrompt).toHaveBeenCalledWith(
			expect.objectContaining({ customPrompt: 'Make it rhyme' })
		);
	});
});

// ─── generate-text getOpenAIKey helper ──────────────────

describe('generate-text getOpenAIKey helper', () => {
	it('should return null when KV throws error', async () => {
		const { getBrandProfileForUser } = await import('$lib/services/brand');
		vi.mocked(getBrandProfileForUser).mockResolvedValue({
			id: 'bp-1',
			userId: 'user-1',
			brandName: 'TestBrand'
		} as any);

		const platform = createMockPlatform();
		platform.env.KV.get = vi.fn().mockRejectedValue(new Error('KV error'));

		const { POST } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		const event = {
			locals: { user: createMockUser() },
			platform,
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					brandProfileId: 'bp-1',
					category: 'messaging',
					key: 'tagline',
					label: 'Tagline'
				})
			})
		};

		await expect(POST(event as any)).rejects.toThrow();
	});
});
