/**
 * Tests for Video File Serve API, Chat Videos Page, Videos Page, Onboarding Page
 * Covers 0% coverage files:
 *   - GET /api/video/file/[...key]
 *   - routes/chat/videos/+page.server.ts
 *   - routes/videos/+page.server.ts
 *   - routes/onboarding/+page.server.ts
 *   - lib/cms/index.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
	vi.resetModules();
	vi.restoreAllMocks();
});

// ─────────────────────────────────────
// GET /api/video/file/[...key]
// ─────────────────────────────────────
describe('GET /api/video/file/[...key]', () => {
	it('should return 401 when not authenticated', async () => {
		const { GET } = await import('../../src/routes/api/video/file/[...key]/+server');
		try {
			await GET({
				params: { key: 'videos/user-1/test.mp4' },
				platform: { env: { BUCKET: {} } },
				locals: { user: null }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 500 when BUCKET not available', async () => {
		const { GET } = await import('../../src/routes/api/video/file/[...key]/+server');
		try {
			await GET({
				params: { key: 'videos/user-1/test.mp4' },
				platform: { env: {} },
				locals: { user: { id: 'user-1' } }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('should return 400 when key is missing', async () => {
		const { GET } = await import('../../src/routes/api/video/file/[...key]/+server');
		try {
			await GET({
				params: { key: '' },
				platform: { env: { BUCKET: {} } },
				locals: { user: { id: 'user-1' } }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it("should return 403 when accessing another user's video", async () => {
		const { GET } = await import('../../src/routes/api/video/file/[...key]/+server');
		try {
			await GET({
				params: { key: 'videos/other-user/test.mp4' },
				platform: { env: { BUCKET: {} } },
				locals: { user: { id: 'user-1' } }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(403);
		}
	});

	it('should return 404 when video not found in R2', async () => {
		const { GET } = await import('../../src/routes/api/video/file/[...key]/+server');
		const mockBucket = {
			get: vi.fn().mockResolvedValue(null)
		};
		try {
			await GET({
				params: { key: 'videos/user-1/test.mp4' },
				platform: { env: { BUCKET: mockBucket } },
				locals: { user: { id: 'user-1' } }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});

	it('should serve video file with correct headers', async () => {
		const { GET } = await import('../../src/routes/api/video/file/[...key]/+server');
		const mockBody = new ReadableStream();
		const mockBucket = {
			get: vi.fn().mockResolvedValue({
				body: mockBody,
				size: 12345,
				httpMetadata: { contentType: 'video/mp4' }
			})
		};

		const response = await GET({
			params: { key: 'videos/user-1/test.mp4' },
			platform: { env: { BUCKET: mockBucket } },
			locals: { user: { id: 'user-1' } }
		} as any);

		expect(response.headers.get('Content-Type')).toBe('video/mp4');
		expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
		expect(response.headers.get('Accept-Ranges')).toBe('bytes');
		expect(response.headers.get('Content-Length')).toBe('12345');
	});

	it('should default to video/mp4 content type when not specified', async () => {
		const { GET } = await import('../../src/routes/api/video/file/[...key]/+server');
		const mockBucket = {
			get: vi.fn().mockResolvedValue({
				body: new ReadableStream(),
				size: 0,
				httpMetadata: {}
			})
		};

		const response = await GET({
			params: { key: 'videos/user-1/test.mp4' },
			platform: { env: { BUCKET: mockBucket } },
			locals: { user: { id: 'user-1' } }
		} as any);

		expect(response.headers.get('Content-Type')).toBe('video/mp4');
	});
});

// ─────────────────────────────────────
// routes/chat/videos/+page.server.ts
// ─────────────────────────────────────
describe('routes/chat/videos - page server', () => {
	it('should redirect to login when not authenticated', async () => {
		const { load } = await import('../../src/routes/chat/videos/+page.server');
		try {
			await load({ locals: { user: null } } as any);
			expect.fail('Should have thrown redirect');
		} catch (err: any) {
			expect(err.status).toBe(302);
			expect(err.location).toBe('/auth/login?redirect=/chat/videos');
		}
	});

	it('should return userId when authenticated', async () => {
		const { load } = await import('../../src/routes/chat/videos/+page.server');
		const result = await load({
			locals: { user: { id: 'user-123' } }
		} as any);
		expect(result).toEqual({ userId: 'user-123' });
	});
});

// ─────────────────────────────────────
// routes/videos/+page.server.ts
// ─────────────────────────────────────
describe('routes/videos - page server', () => {
	it('should redirect to login when not authenticated', async () => {
		const { load } = await import('../../src/routes/videos/+page.server');
		try {
			await load({ locals: { user: null } } as any);
			expect.fail('Should have thrown redirect');
		} catch (err: any) {
			expect(err.status).toBe(302);
			expect(err.location).toBe('/auth/login');
		}
	});

	it('should return user when authenticated', async () => {
		const { load } = await import('../../src/routes/videos/+page.server');
		const user = { id: 'user-123', login: 'test' };
		const result = await load({ locals: { user } } as any);
		expect(result).toEqual({ user });
	});
});

// ─────────────────────────────────────
// routes/onboarding/+page.server.ts
// ─────────────────────────────────────
describe('routes/onboarding - page server', () => {
	it('should redirect to login when not authenticated', async () => {
		const { load } = await import('../../src/routes/onboarding/+page.server');
		try {
			await load({
				locals: { user: null },
				platform: { env: { KV: {} } }
			} as any);
			expect.fail('Should have thrown redirect');
		} catch (err: any) {
			expect(err.status).toBe(302);
			expect(err.location).toBe('/auth/login?redirect=/onboarding');
		}
	});

	it('should return hasAIProviders=false when no KV', async () => {
		const { load } = await import('../../src/routes/onboarding/+page.server');
		const result = await load({
			locals: { user: { id: 'user-1' } },
			platform: { env: {} }
		} as any);
		expect(result).toEqual({ userId: 'user-1', hasAIProviders: false });
	});

	it('should return hasAIProviders=false when no keys configured', async () => {
		const { load } = await import('../../src/routes/onboarding/+page.server');
		const mockKV = {
			get: vi.fn().mockResolvedValue(null)
		};
		const result = await load({
			locals: { user: { id: 'user-1' } },
			platform: { env: { KV: mockKV } }
		} as any);
		expect(result).toEqual({ userId: 'user-1', hasAIProviders: false });
	});

	it('should return hasAIProviders=true when enabled OpenAI key exists', async () => {
		const { load } = await import('../../src/routes/onboarding/+page.server');
		const mockKV = {
			get: vi.fn().mockImplementation((key: string) => {
				if (key === 'ai_keys_list') return JSON.stringify(['key1']);
				if (key === 'ai_key:key1')
					return JSON.stringify({ id: 'key1', provider: 'openai', enabled: true });
				return null;
			})
		};
		const result = await load({
			locals: { user: { id: 'user-1' } },
			platform: { env: { KV: mockKV } }
		} as any);
		expect(result).toEqual({ userId: 'user-1', hasAIProviders: true });
	});

	it('should return hasAIProviders=false when key is disabled', async () => {
		const { load } = await import('../../src/routes/onboarding/+page.server');
		const mockKV = {
			get: vi.fn().mockImplementation((key: string) => {
				if (key === 'ai_keys_list') return JSON.stringify(['key1']);
				if (key === 'ai_key:key1')
					return JSON.stringify({ id: 'key1', provider: 'openai', enabled: false });
				return null;
			})
		};
		const result = await load({
			locals: { user: { id: 'user-1' } },
			platform: { env: { KV: mockKV } }
		} as any);
		expect(result).toEqual({ userId: 'user-1', hasAIProviders: false });
	});

	it('should return hasAIProviders=true for any text-chat provider, not just OpenAI', async () => {
		const { load } = await import('../../src/routes/onboarding/+page.server');
		const mockKV = {
			get: vi.fn().mockImplementation((key: string) => {
				if (key === 'ai_keys_list') return JSON.stringify(['key1']);
				if (key === 'ai_key:key1')
					return JSON.stringify({ id: 'key1', provider: 'anthropic', enabled: true });
				return null;
			})
		};
		const result = await load({
			locals: { user: { id: 'user-1' } },
			platform: { env: { KV: mockKV } }
		} as any);
		expect(result).toEqual({ userId: 'user-1', hasAIProviders: true });
	});

	it('should return hasAIProviders=false for workers-ai without the AI binding', async () => {
		const { load } = await import('../../src/routes/onboarding/+page.server');
		const mockKV = {
			get: vi.fn().mockImplementation((key: string) => {
				if (key === 'ai_keys_list') return JSON.stringify(['key1']);
				if (key === 'ai_key:key1')
					return JSON.stringify({ id: 'key1', provider: 'workers-ai', enabled: true });
				return null;
			})
		};
		const result = await load({
			locals: { user: { id: 'user-1' } },
			platform: { env: { KV: mockKV } }
		} as any);
		expect(result).toEqual({ userId: 'user-1', hasAIProviders: false });
	});

	it('should return hasAIProviders=true for keyless workers-ai when the binding is present', async () => {
		const { load } = await import('../../src/routes/onboarding/+page.server');
		const mockKV = {
			get: vi.fn().mockImplementation((key: string) => {
				if (key === 'ai_keys_list') return JSON.stringify(['key1']);
				if (key === 'ai_key:key1')
					return JSON.stringify({
						id: 'key1',
						provider: 'workers-ai',
						enabled: true,
						keyless: true
					});
				return null;
			})
		};
		const result = await load({
			locals: { user: { id: 'user-1' } },
			platform: { env: { KV: mockKV, AI: { run: vi.fn() } } }
		} as any);
		expect(result).toEqual({ userId: 'user-1', hasAIProviders: true });
	});

	it('should handle KV errors gracefully', async () => {
		const { load } = await import('../../src/routes/onboarding/+page.server');
		const mockKV = {
			get: vi.fn().mockRejectedValue(new Error('KV error'))
		};
		const result = await load({
			locals: { user: { id: 'user-1' } },
			platform: { env: { KV: mockKV } }
		} as any);
		expect(result).toEqual({ userId: 'user-1', hasAIProviders: false });
	});

	it('should handle null key data', async () => {
		const { load } = await import('../../src/routes/onboarding/+page.server');
		const mockKV = {
			get: vi.fn().mockImplementation((key: string) => {
				if (key === 'ai_keys_list') return JSON.stringify(['key1']);
				return null;
			})
		};
		const result = await load({
			locals: { user: { id: 'user-1' } },
			platform: { env: { KV: mockKV } }
		} as any);
		expect(result).toEqual({ userId: 'user-1', hasAIProviders: false });
	});
});

// ─────────────────────────────────────
// lib/cms/index.ts - re-exports
// ─────────────────────────────────────
describe('lib/cms/index.ts - re-exports', () => {
	it('should re-export all expected symbols from registry', async () => {
		const cms = await import('../../src/lib/cms/index');
		expect(cms.contentTypeRegistry).toBeDefined();
		expect(cms.getContentTypeDefinition).toBeDefined();
		expect(cms.getRegisteredSlugs).toBeDefined();
		expect(cms.isRegisteredContentType).toBeDefined();
	});

	it('should re-export all utils', async () => {
		const cms = await import('../../src/lib/cms/index');
		expect(cms.generateSlug).toBeDefined();
		expect(cms.getDefaultFieldValues).toBeDefined();
		expect(cms.parseContentItem).toBeDefined();
		expect(cms.parseContentTag).toBeDefined();
		expect(cms.parseContentType).toBeDefined();
		expect(cms.validateContentTypeInput).toBeDefined();
		expect(cms.validateFields).toBeDefined();
	});
});
