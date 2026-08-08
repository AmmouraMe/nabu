/**
 * Tests for Google Fonts API endpoint
 * TDD: Full coverage for font catalog proxy with KV caching
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('GET /api/google-fonts', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it('should return curated fonts when no KV and no API key', async () => {
		const { GET } = await import('../../src/routes/api/google-fonts/+server');
		const response = await GET({ platform: undefined } as any);
		const data = await response.json();

		expect(data.items).toBeDefined();
		expect(data.items.length).toBeGreaterThan(0);
		expect(data.items[0]).toHaveProperty('family');
		expect(data.items[0]).toHaveProperty('category');
		expect(data.items[0]).toHaveProperty('variants');
		expect(response.headers.get('Cache-Control')).toBe('public, max-age=604800');
	});

	it('should return cached data from KV when available', async () => {
		const cachedData = {
			items: [{ family: 'Cached Font', category: 'serif', variants: ['regular'] }]
		};
		const mockKV = {
			get: vi.fn().mockResolvedValue(cachedData)
		};

		const { GET } = await import('../../src/routes/api/google-fonts/+server');
		const response = await GET({
			platform: { env: { KV: mockKV } }
		} as any);
		const data = await response.json();

		expect(data.items[0].family).toBe('Cached Font');
		expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400');
		expect(mockKV.get).toHaveBeenCalledWith('google-fonts-catalog', 'json');
	});

	it('should fallback to curated list when KV cache misses', async () => {
		const mockKV = {
			get: vi.fn().mockResolvedValue(null)
		};

		const { GET } = await import('../../src/routes/api/google-fonts/+server');
		const response = await GET({
			platform: { env: { KV: mockKV } }
		} as any);
		const data = await response.json();

		expect(data.items.length).toBeGreaterThan(50);
		expect(response.headers.get('Cache-Control')).toBe('public, max-age=604800');
	});

	it('should fallback to curated list when KV throws', async () => {
		const mockKV = {
			get: vi.fn().mockRejectedValue(new Error('KV error'))
		};

		const { GET } = await import('../../src/routes/api/google-fonts/+server');
		const response = await GET({
			platform: { env: { KV: mockKV } }
		} as any);
		const data = await response.json();

		expect(data.items.length).toBeGreaterThan(50);
	});

	it('should fetch live catalog when API key available', async () => {
		const mockKV = {
			get: vi.fn().mockResolvedValue(null),
			put: vi.fn().mockResolvedValue(undefined)
		};
		const mockWaitUntil = vi.fn();

		const apiItems = Array.from({ length: 250 }, (_, i) => ({
			family: `Font ${i}`,
			category: 'sans-serif',
			variants: ['regular'],
			extraField: 'should be stripped'
		}));

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ items: apiItems })
		});

		const { GET } = await import('../../src/routes/api/google-fonts/+server');
		const response = await GET({
			platform: {
				env: { KV: mockKV, GOOGLE_FONTS_API_KEY: 'test-api-key' },
				context: { waitUntil: mockWaitUntil }
			}
		} as any);
		const data = await response.json();

		// Should limit to 200 items and strip extra fields
		expect(data.items.length).toBe(200);
		expect(data.items[0]).not.toHaveProperty('extraField');
		expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400');
		// Should cache result in KV
		expect(mockWaitUntil).toHaveBeenCalled();
	});

	it('should fallback to curated list when API fetch fails', async () => {
		const mockKV = {
			get: vi.fn().mockResolvedValue(null)
		};

		mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

		const { GET } = await import('../../src/routes/api/google-fonts/+server');
		const response = await GET({
			platform: {
				env: { KV: mockKV, GOOGLE_FONTS_API_KEY: 'test-api-key' }
			}
		} as any);
		const data = await response.json();

		expect(data.items.length).toBeGreaterThan(50);
	});

	it('should fallback to curated list when fetch throws', async () => {
		const mockKV = {
			get: vi.fn().mockResolvedValue(null)
		};

		mockFetch.mockRejectedValueOnce(new Error('Network error'));

		const { GET } = await import('../../src/routes/api/google-fonts/+server');
		const response = await GET({
			platform: {
				env: { KV: mockKV, GOOGLE_FONTS_API_KEY: 'test-api-key' }
			}
		} as any);
		const data = await response.json();

		expect(data.items.length).toBeGreaterThan(50);
	});

	it('should handle API response with missing items gracefully', async () => {
		const mockKV = {
			get: vi.fn().mockResolvedValue(null),
			put: vi.fn()
		};

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({})
		});

		const { GET } = await import('../../src/routes/api/google-fonts/+server');
		const response = await GET({
			platform: {
				env: { KV: mockKV, GOOGLE_FONTS_API_KEY: 'test-api-key' },
				context: { waitUntil: vi.fn() }
			}
		} as any);
		const data = await response.json();

		expect(data.items).toEqual([]);
	});

	it('should not cache when no KV available but API key is', async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				items: [{ family: 'Test', category: 'sans-serif', variants: ['regular'] }]
			})
		});

		const { GET } = await import('../../src/routes/api/google-fonts/+server');
		const response = await GET({
			platform: {
				env: { GOOGLE_FONTS_API_KEY: 'test-key' }
			}
		} as any);
		const data = await response.json();

		expect(data.items.length).toBe(1);
	});
});
