/**
 * Extended coverage tests for multiple low-coverage files
 * Targets: text-history.ts, +layout.server.ts, ai-media-generation.ts,
 *          chat/models, brand/assets/texts, ai-keys/reorder, file-archive
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withBrandAccess } from '../fixtures/brand-access';

// ─── text-history.ts (75% branches) ──────────────────

describe('text-history.ts - Extended branch coverage', () => {
	function createMockDB() {
		const mockFirst = vi.fn().mockResolvedValue(null);
		const mockAll = vi.fn().mockResolvedValue({ results: [] });
		const mockRun = vi.fn().mockResolvedValue({ success: true });
		const mockBind = vi.fn().mockReturnValue({
			first: mockFirst,
			all: mockAll,
			run: mockRun
		});
		return {
			prepare: vi
				.fn()
				.mockReturnValue({ bind: mockBind, first: mockFirst, all: mockAll, run: mockRun }),
			_mockFirst: mockFirst,
			_mockAll: mockAll
		};
	}

	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it('getRevisionById should return null when not found', async () => {
		const db = createMockDB();
		const { getRevisionById } = await import('$lib/services/text-history');
		const result = await getRevisionById(db as any, 'nonexistent');
		expect(result).toBeNull();
	});

	it('getRevisionById should return mapped revision when found', async () => {
		const db = createMockDB();
		db._mockFirst.mockResolvedValueOnce({
			id: 'r1',
			brand_text_id: 'bt1',
			revision_number: 3,
			is_current: 1,
			value: 'test',
			label: 'Label',
			change_source: 'manual',
			user_id: 'u1',
			change_note: 'note',
			created_at: '2025-01-01'
		});
		const { getRevisionById } = await import('$lib/services/text-history');
		const result = await getRevisionById(db as any, 'r1');
		expect(result).not.toBeNull();
		expect(result!.id).toBe('r1');
		expect(result!.isCurrent).toBe(true);
		expect(result!.revisionNumber).toBe(3);
	});

	it('getTextRevisionCount should return count', async () => {
		const db = createMockDB();
		db._mockFirst.mockResolvedValueOnce({ count: 5 });
		const { getTextRevisionCount } = await import('$lib/services/text-history');
		const count = await getTextRevisionCount(db as any, 'bt1');
		expect(count).toBe(5);
	});

	it('getTextRevisionCount should return 0 when no row', async () => {
		const db = createMockDB();
		db._mockFirst.mockResolvedValueOnce(null);
		const { getTextRevisionCount } = await import('$lib/services/text-history');
		const count = await getTextRevisionCount(db as any, 'nonexistent');
		expect(count).toBe(0);
	});

	it('createTextRevision should handle null count row', async () => {
		const db = createMockDB();
		db._mockFirst.mockResolvedValueOnce(null); // COUNT returns null
		const { createTextRevision } = await import('$lib/services/text-history');
		const revision = await createTextRevision(db as any, {
			brandTextId: 'bt1',
			value: 'v',
			changeSource: 'manual',
			userId: 'u1'
		});
		expect(revision.revisionNumber).toBe(1);
		expect(revision.label).toBeUndefined();
		expect(revision.changeNote).toBeUndefined();
	});
});

// ─── +layout.server.ts (80% branches) ──────────────

describe('+layout.server.ts - Extended branch coverage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it('should handle KV where key data is null', async () => {
		const mockKV = {
			get: vi
				.fn()
				.mockResolvedValueOnce(JSON.stringify(['key-1']))
				.mockResolvedValueOnce(null) // key data null
		};
		const { load } = await import('../../src/routes/+layout.server');
		const result = (await load({
			locals: { user: { id: 'u1' } },
			platform: { env: { KV: mockKV } }
		} as any)) as any;
		expect(result.hasAIProviders).toBe(false);
	});

	it('should handle KV with disabled key', async () => {
		const mockKV = {
			get: vi
				.fn()
				.mockResolvedValueOnce(JSON.stringify(['key-1']))
				.mockResolvedValueOnce(JSON.stringify({ enabled: false }))
		};
		const { load } = await import('../../src/routes/+layout.server');
		const result = (await load({
			locals: { user: { id: 'u1' } },
			platform: { env: { KV: mockKV } }
		} as any)) as any;
		expect(result.hasAIProviders).toBe(false);
	});

	it('should handle null KV list', async () => {
		const mockKV = {
			get: vi.fn().mockResolvedValue(null)
		};
		const { load } = await import('../../src/routes/+layout.server');
		const result = (await load({
			locals: { user: { id: 'u1' } },
			platform: { env: { KV: mockKV } }
		} as any)) as any;
		expect(result.hasAIProviders).toBe(false);
	});

	it('should handle KV error gracefully and return false', async () => {
		const mockKV = {
			get: vi.fn().mockRejectedValue(new Error('KV boom'))
		};
		const { load } = await import('../../src/routes/+layout.server');
		const result = (await load({
			locals: { user: { id: 'u1' } },
			platform: { env: { KV: mockKV } }
		} as any)) as any;
		expect(result.hasAIProviders).toBe(false);
		expect(result.user).toEqual({ id: 'u1' });
	});

	it('should handle no platform env', async () => {
		const { load } = await import('../../src/routes/+layout.server');
		const result = (await load({
			locals: {},
			platform: undefined
		} as any)) as any;
		expect(result.hasAIProviders).toBe(false);
		expect(result.user).toBeNull();
	});
});

// ─── ai-media-generation.ts (61.53% branches) ──────

describe('ai-media-generation.ts - Extended branch coverage', () => {
	function createMockDB() {
		return {
			prepare: vi.fn().mockReturnValue({
				bind: vi.fn().mockReturnValue({
					run: vi.fn().mockResolvedValue({ success: true }),
					first: vi.fn().mockResolvedValue(null),
					all: vi.fn().mockResolvedValue({ results: [] })
				})
			})
		};
	}

	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it('generateImage should handle all optional params', async () => {
		const db = createMockDB();
		const { generateImage } = await import('$lib/services/ai-media-generation');
		const result = await generateImage(db as any, {
			brandProfileId: 'bp1',
			prompt: 'test',
			size: '1024x1024',
			style: 'vivid',
			quality: 'hd',
			category: 'logo',
			name: 'Logo Image',
			negativePrompt: 'blurry',
			model: 'dall-e-2'
		});
		expect(result.model).toBe('dall-e-2');
		expect(result.parameters).toEqual({
			size: '1024x1024',
			style: 'vivid',
			quality: 'hd',
			category: 'logo',
			name: 'Logo Image'
		});
		expect(result.negativePrompt).toBe('blurry');
	});

	it('generateImage with no optional params', async () => {
		const db = createMockDB();
		const { generateImage } = await import('$lib/services/ai-media-generation');
		const result = await generateImage(db as any, {
			brandProfileId: 'bp1',
			prompt: 'test'
		});
		expect(result.model).toBe('dall-e-3');
		expect(result.parameters).toBeUndefined();
		expect(result.negativePrompt).toBeUndefined();
	});

	it('generateAudio should handle all optional params', async () => {
		const db = createMockDB();
		const { generateAudio } = await import('$lib/services/ai-media-generation');
		const result = await generateAudio(db as any, {
			brandProfileId: 'bp1',
			prompt: 'test text',
			voice: 'nova',
			speed: 1.5,
			responseFormat: 'mp3',
			category: 'voiceover',
			name: 'Brand Intro',
			model: 'tts-1-hd'
		});
		expect(result.model).toBe('tts-1-hd');
		expect(result.parameters).toEqual({
			voice: 'nova',
			speed: 1.5,
			responseFormat: 'mp3',
			category: 'voiceover',
			name: 'Brand Intro'
		});
	});

	it('generateAudio with minimal params (defaults)', async () => {
		const db = createMockDB();
		const { generateAudio } = await import('$lib/services/ai-media-generation');
		const result = await generateAudio(db as any, {
			brandProfileId: 'bp1',
			prompt: 'test'
		});
		expect(result.model).toBe('tts-1');
		expect(result.parameters).toEqual({ voice: 'alloy' });
	});

	it('requestAIVideoGeneration should handle all optional params', async () => {
		const db = createMockDB();
		const { requestAIVideoGeneration } = await import('$lib/services/ai-media-generation');
		const result = await requestAIVideoGeneration(db as any, {
			brandProfileId: 'bp1',
			prompt: 'test video',
			provider: 'wavespeed',
			model: 'wan-2.1',
			aspectRatio: '16:9',
			duration: 5,
			resolution: '1080p',
			category: 'promo',
			name: 'Brand Promo'
		});
		expect(result.model).toBe('wan-2.1');
		expect(result.provider).toBe('wavespeed');
		expect(result.parameters).toEqual({
			aspectRatio: '16:9',
			duration: 5,
			resolution: '1080p',
			category: 'promo',
			name: 'Brand Promo'
		});
	});

	it('requestAIVideoGeneration with minimal params (defaults)', async () => {
		const db = createMockDB();
		const { requestAIVideoGeneration } = await import('$lib/services/ai-media-generation');
		const result = await requestAIVideoGeneration(db as any, {
			brandProfileId: 'bp1',
			prompt: 'test'
		});
		expect(result.model).toBe('sora-2');
		expect(result.provider).toBe('openai');
		expect(result.parameters).toBeUndefined();
	});

	it('updateAIGenerationStatus with all optional fields', async () => {
		const db = createMockDB();
		const { updateAIGenerationStatus } = await import('$lib/services/ai-media-generation');
		await updateAIGenerationStatus(db as any, 'gen-1', {
			status: 'complete',
			providerJobId: 'job-1',
			resultUrl: 'https://example.com/result.mp4',
			r2Key: 'videos/result.mp4',
			brandMediaId: 'bm-1',
			cost: 0.05,
			errorMessage: undefined,
			progress: 100
		});
		expect(db.prepare).toHaveBeenCalled();
	});

	it('updateAIGenerationStatus with failed status and error', async () => {
		const db = createMockDB();
		const { updateAIGenerationStatus } = await import('$lib/services/ai-media-generation');
		await updateAIGenerationStatus(db as any, 'gen-1', {
			status: 'failed',
			errorMessage: 'Generation failed'
		});
		expect(db.prepare).toHaveBeenCalled();
	});

	it('updateAIGenerationStatus with only status (in_progress)', async () => {
		const db = createMockDB();
		const { updateAIGenerationStatus } = await import('$lib/services/ai-media-generation');
		await updateAIGenerationStatus(db as any, 'gen-1', {
			status: 'in_progress' as any
		});
		expect(db.prepare).toHaveBeenCalled();
	});

	it('getAIGeneration should return null when not found', async () => {
		const db = createMockDB();
		const { getAIGeneration } = await import('$lib/services/ai-media-generation');
		const result = await getAIGeneration(db as any, 'nonexistent');
		expect(result).toBeNull();
	});

	it('getAIGeneration should map all fields correctly', async () => {
		const db = createMockDB();
		db.prepare.mockReturnValueOnce({
			bind: vi.fn().mockReturnValue({
				first: vi.fn().mockResolvedValue({
					id: 'gen-1',
					brand_profile_id: 'bp1',
					brand_media_id: 'bm1',
					generation_type: 'image',
					provider: 'openai',
					model: 'dall-e-3',
					prompt: 'logo',
					negative_prompt: 'blurry',
					status: 'complete',
					provider_job_id: 'job1',
					result_url: 'https://example.com/img.png',
					r2_key: 'images/img.png',
					cost: 0.04,
					error_message: null,
					parameters: '{"size":"1024x1024"}',
					progress: 100,
					created_at: '2025-01-01',
					completed_at: '2025-01-02'
				})
			})
		});
		const { getAIGeneration } = await import('$lib/services/ai-media-generation');
		const result = await getAIGeneration(db as any, 'gen-1');
		expect(result).not.toBeNull();
		expect(result!.parameters).toEqual({ size: '1024x1024' });
		expect(result!.brandMediaId).toBe('bm1');
		expect(result!.negativePrompt).toBe('blurry');
	});

	it('getAIGenerationsByBrand without type filter', async () => {
		const db = createMockDB();
		const { getAIGenerationsByBrand } = await import('$lib/services/ai-media-generation');
		const results = await getAIGenerationsByBrand(db as any, 'bp1');
		expect(results).toEqual([]);
	});

	it('getAIGenerationsByBrand with type filter', async () => {
		const db = createMockDB();
		const { getAIGenerationsByBrand } = await import('$lib/services/ai-media-generation');
		const results = await getAIGenerationsByBrand(db as any, 'bp1', 'image');
		expect(results).toEqual([]);
	});
});

// ─── Brand Texts API (88.88% branches) ──────────────

describe('Brand Assets Texts API - Extended coverage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	vi.mock('$lib/services/brand-assets', () => ({
		createBrandText: vi.fn().mockResolvedValue({ id: 't1' }),
		findBrandTextByKey: vi.fn().mockResolvedValue(null),
		getBrandTexts: vi.fn().mockResolvedValue([]),
		getBrandTextsByCategory: vi.fn().mockResolvedValue([]),
		updateBrandText: vi.fn().mockResolvedValue(undefined),
		deleteBrandText: vi.fn().mockResolvedValue(undefined)
	}));

	vi.mock('$lib/services/brand', () => ({
		updateBrandFieldWithVersion: vi.fn().mockResolvedValue(undefined)
	}));

	// Texts routes authorise the brand first; `u1` owns what these tests touch.
	const mockPlatform = { env: { DB: withBrandAccess({}, { userId: 'u1' }) } };

	it('GET should return texts by category when category param is set', async () => {
		const { getBrandTextsByCategory } = await import('$lib/services/brand-assets');
		vi.mocked(getBrandTextsByCategory).mockResolvedValue([
			{ id: 't1', category: 'taglines' }
		] as any);

		const { GET } = await import('../../src/routes/api/brand/assets/texts/+server');
		const url = new URL('http://localhost?brandProfileId=bp1&category=taglines');
		const response = await GET({
			url,
			platform: mockPlatform,
			locals: { user: { id: 'u1' } }
		} as any);
		const data = await response.json();
		expect(data.texts).toHaveLength(1);
	});

	it('GET should return all texts when no category', async () => {
		const { getBrandTexts } = await import('$lib/services/brand-assets');
		vi.mocked(getBrandTexts).mockResolvedValue([{ id: 't1' }, { id: 't2' }] as any);

		const { GET } = await import('../../src/routes/api/brand/assets/texts/+server');
		const url = new URL('http://localhost?brandProfileId=bp1');
		const response = await GET({
			url,
			platform: mockPlatform,
			locals: { user: { id: 'u1' } }
		} as any);
		const data = await response.json();
		expect(data.texts).toHaveLength(2);
	});

	it('GET should return 400 when brandProfileId missing', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/texts/+server');
		await expect(
			GET({
				url: new URL('http://localhost'),
				platform: mockPlatform,
				locals: { user: { id: 'u1' } }
			} as any)
		).rejects.toThrow();
	});

	it('POST should create text and update profile field when setAsProfileField=true', async () => {
		const { updateBrandFieldWithVersion } = await import('$lib/services/brand');
		const { POST } = await import('../../src/routes/api/brand/assets/texts/+server');
		const response = await POST({
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					brandProfileId: 'bp1',
					category: 'taglines',
					key: 'main',
					label: 'Main Tagline',
					value: 'Just Do It',
					setAsProfileField: true,
					profileFieldName: 'tagline'
				})
			}),
			platform: mockPlatform,
			locals: { user: { id: 'u1' } }
		} as any);

		const data = await response.json();
		expect(data.profileFieldUpdated).toBe(true);
		expect(updateBrandFieldWithVersion).toHaveBeenCalled();
	});

	it('POST should handle profile field update failure gracefully', async () => {
		const { updateBrandFieldWithVersion } = await import('$lib/services/brand');
		vi.mocked(updateBrandFieldWithVersion).mockRejectedValueOnce(new Error('DB error'));

		const { POST } = await import('../../src/routes/api/brand/assets/texts/+server');
		const response = await POST({
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					brandProfileId: 'bp1',
					category: 'taglines',
					key: 'main',
					label: 'Tagline',
					value: 'Value',
					setAsProfileField: true,
					profileFieldName: 'tagline'
				})
			}),
			platform: mockPlatform,
			locals: { user: { id: 'u1' } }
		} as any);

		const data = await response.json();
		expect(data.profileFieldUpdated).toBe(false);
	});

	it('POST should not update field when setAsProfileField is false', async () => {
		const { updateBrandFieldWithVersion } = await import('$lib/services/brand');
		const { POST } = await import('../../src/routes/api/brand/assets/texts/+server');
		const response = await POST({
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					brandProfileId: 'bp1',
					category: 'taglines',
					key: 'main',
					label: 'Tagline',
					value: 'Value'
				})
			}),
			platform: mockPlatform,
			locals: { user: { id: 'u1' } }
		} as any);

		const data = await response.json();
		expect(data.profileFieldUpdated).toBe(false);
		expect(updateBrandFieldWithVersion).not.toHaveBeenCalled();
	});

	it('PATCH should update text', async () => {
		const { PATCH } = await import('../../src/routes/api/brand/assets/texts/+server');
		const response = await PATCH({
			request: new Request('http://localhost', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: 't1',
					value: 'Updated',
					changeSource: 'ai',
					changeNote: 'AI edit'
				})
			}),
			platform: mockPlatform,
			locals: { user: { id: 'u1' } }
		} as any);
		const data = await response.json();
		expect(data.success).toBe(true);
	});

	it('PATCH should default changeSource to manual', async () => {
		const { updateBrandText } = await import('$lib/services/brand-assets');
		const { PATCH } = await import('../../src/routes/api/brand/assets/texts/+server');
		await PATCH({
			request: new Request('http://localhost', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: 't1', value: 'Updated' })
			}),
			platform: mockPlatform,
			locals: { user: { id: 'u1' } }
		} as any);
		expect(updateBrandText).toHaveBeenCalledWith(
			expect.anything(),
			't1',
			expect.objectContaining({
				changeSource: 'manual'
			})
		);
	});

	it('DELETE should delete text', async () => {
		const { DELETE } = await import('../../src/routes/api/brand/assets/texts/+server');
		const url = new URL('http://localhost?id=t1');
		const response = await DELETE({
			url,
			platform: mockPlatform,
			locals: { user: { id: 'u1' } }
		} as any);
		const data = await response.json();
		expect(data.success).toBe(true);
	});

	it('DELETE should return 400 when id missing', async () => {
		const { DELETE } = await import('../../src/routes/api/brand/assets/texts/+server');
		await expect(
			DELETE({
				url: new URL('http://localhost'),
				platform: mockPlatform,
				locals: { user: { id: 'u1' } }
			} as any)
		).rejects.toThrow();
	});
});

// ─── Chat Models API (85.36% branches) ──────────────

describe('Chat Models API - Extended coverage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it('should return empty on KV error (caught by getEnabledModels)', async () => {
		const mockKV = {
			get: vi.fn().mockRejectedValue(new Error('KV crash'))
		};

		const { GET } = await import('../../src/routes/api/chat/models/+server');
		const response = await GET({
			platform: { env: { KV: mockKV } },
			locals: { user: { id: 'u1' } }
		} as any);
		const data = await response.json();
		expect(data.models).toEqual([]);
		expect(data.defaultModel).toBeNull();
	});

	it('should throw 401 when user not authenticated', async () => {
		const { GET } = await import('../../src/routes/api/chat/models/+server');
		await expect(
			GET({
				platform: { env: { KV: {} } },
				locals: {}
			} as any)
		).rejects.toThrow();
	});

	it('should throw 503 when KV not available', async () => {
		const { GET } = await import('../../src/routes/api/chat/models/+server');
		await expect(
			GET({
				platform: { env: {} },
				locals: { user: { id: 'u1' } }
			} as any)
		).rejects.toThrow();
	});

	it('should handle models with legacy single model field', async () => {
		const mockKV = {
			get: vi
				.fn()
				.mockResolvedValueOnce(JSON.stringify(['k1']))
				.mockResolvedValueOnce(
					JSON.stringify({
						provider: 'openai',
						enabled: true,
						model: 'gpt-4o'
					})
				)
		};

		const { GET } = await import('../../src/routes/api/chat/models/+server');
		const response = await GET({
			platform: { env: { KV: mockKV } },
			locals: { user: { id: 'u1' } }
		} as any);

		const data = await response.json();
		expect(data.models.some((m: any) => m.id === 'gpt-4o')).toBe(true);
	});

	it('should filter unknown model IDs', async () => {
		const mockKV = {
			get: vi
				.fn()
				.mockResolvedValueOnce(JSON.stringify(['k1']))
				.mockResolvedValueOnce(
					JSON.stringify({
						provider: 'openai',
						enabled: true,
						models: ['gpt-4o', 'unknown-model-xyz']
					})
				)
		};

		const { GET } = await import('../../src/routes/api/chat/models/+server');
		const response = await GET({
			platform: { env: { KV: mockKV } },
			locals: { user: { id: 'u1' } }
		} as any);

		const data = await response.json();
		expect(data.models.some((m: any) => m.id === 'unknown-model-xyz')).toBe(false);
		expect(data.models.some((m: any) => m.id === 'gpt-4o')).toBe(true);
	});

	it('should skip non-openai and disabled keys', async () => {
		const mockKV = {
			get: vi
				.fn()
				.mockResolvedValueOnce(JSON.stringify(['k1', 'k2', 'k3']))
				.mockResolvedValueOnce(JSON.stringify({ provider: 'anthropic', models: ['claude-3'] }))
				.mockResolvedValueOnce(
					JSON.stringify({ provider: 'openai', enabled: false, models: ['gpt-4o'] })
				)
				.mockResolvedValueOnce(
					JSON.stringify({ provider: 'openai', enabled: true, models: ['gpt-4o-mini'] })
				)
		};

		const { GET } = await import('../../src/routes/api/chat/models/+server');
		const response = await GET({
			platform: { env: { KV: mockKV } },
			locals: { user: { id: 'u1' } }
		} as any);

		const data = await response.json();
		expect(data.models).toHaveLength(1);
		expect(data.models[0].id).toBe('gpt-4o-mini');
		expect(data.defaultModel).toBe('gpt-4o-mini');
	});

	it('should prefer gpt-4o as default when gpt-4o-mini not available', async () => {
		const mockKV = {
			get: vi
				.fn()
				.mockResolvedValueOnce(JSON.stringify(['k1']))
				.mockResolvedValueOnce(
					JSON.stringify({
						provider: 'openai',
						enabled: true,
						models: ['gpt-4o', 'gpt-4-turbo']
					})
				)
		};

		const { GET } = await import('../../src/routes/api/chat/models/+server');
		const response = await GET({
			platform: { env: { KV: mockKV } },
			locals: { user: { id: 'u1' } }
		} as any);

		const data = await response.json();
		expect(data.defaultModel).toBe('gpt-4o');
	});

	it('should use first model as default when neither gpt-4o-mini nor gpt-4o available', async () => {
		const mockKV = {
			get: vi
				.fn()
				.mockResolvedValueOnce(JSON.stringify(['k1']))
				.mockResolvedValueOnce(
					JSON.stringify({
						provider: 'openai',
						enabled: true,
						models: ['gpt-4-turbo', 'gpt-3.5-turbo']
					})
				)
		};

		const { GET } = await import('../../src/routes/api/chat/models/+server');
		const response = await GET({
			platform: { env: { KV: mockKV } },
			locals: { user: { id: 'u1' } }
		} as any);

		const data = await response.json();
		expect(data.defaultModel).toBe('gpt-4-turbo');
	});

	it('should handle error in getEnabledModels gracefully (returns empty models)', async () => {
		const mockKV = {
			get: vi.fn().mockResolvedValueOnce('invalid json{{{')
		};

		const { GET } = await import('../../src/routes/api/chat/models/+server');
		const response = await GET({
			platform: { env: { KV: mockKV } },
			locals: { user: { id: 'u1' } }
		} as any);

		const data = await response.json();
		expect(data.models).toEqual([]);
		expect(data.defaultModel).toBeNull();
	});
});

// ─── AI Keys Reorder (86.95% branches) ──────────────

describe('AI Keys Reorder - Extended coverage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it('should return 400 for duplicate key IDs', async () => {
		const mockKV = {
			get: vi.fn().mockResolvedValue(JSON.stringify(['a', 'b'])),
			put: vi.fn()
		};

		const { POST } = await import('../../src/routes/api/admin/ai-keys/reorder/+server');
		await expect(
			POST({
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ order: ['a', 'a'] })
				}),
				platform: { env: { KV: mockKV } },
				locals: { user: { id: '1', isOwner: true } }
			} as any)
		).rejects.toThrow();
	});

	it('should return 500 on unexpected error', async () => {
		const mockKV = {
			get: vi.fn().mockRejectedValue(new Error('KV crash'))
		};

		const { POST } = await import('../../src/routes/api/admin/ai-keys/reorder/+server');
		await expect(
			POST({
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ order: ['a'] })
				}),
				platform: { env: { KV: mockKV } },
				locals: { user: { id: '1', isOwner: true } }
			} as any)
		).rejects.toThrow();
	});
});
