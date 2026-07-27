/**
 * Tests for Brand Assets API endpoints
 * Covers:
 *   - GET/POST/PATCH/DELETE /api/brand/assets/media
 *   - GET /api/brand/assets/summary
 *   - GET /api/brand/assets/activity
 *   - GET/POST/PATCH/DELETE /api/brand/assets/texts
 *   - GET /api/brand/assets/texts/field-status
 *   - GET/POST/DELETE /api/brand/assets/variants
 *   - GET/POST /api/brand/assets/revisions
 *   - GET /api/brand/assets/file
 *   - POST /api/brand/assets/upload
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('$lib/services/brand-assets', () => ({
	createBrandMedia: vi.fn(),
	getBrandMedia: vi.fn(),
	getBrandMediaByType: vi.fn(),
	getBrandMediaByCategory: vi.fn(),
	updateBrandMedia: vi.fn(),
	deleteBrandMedia: vi.fn(),
	getLogoAssets: vi.fn(),
	getBrandAssetSummary: vi.fn(),
	createBrandText: vi.fn(),
	getBrandTexts: vi.fn(),
	getBrandTextsByCategory: vi.fn(),
	updateBrandText: vi.fn(),
	deleteBrandText: vi.fn(),
	createMediaVariant: vi.fn(),
	getMediaVariants: vi.fn(),
	deleteMediaVariant: vi.fn()
}));

vi.mock('$lib/services/media-history', () => ({
	getMediaActivityLog: vi.fn(),
	getMediaActivityLogForAsset: vi.fn(),
	getMediaRevisions: vi.fn(),
	getCurrentRevision: vi.fn(),
	revertToRevision: vi.fn(),
	createMediaRevision: vi.fn(),
	logMediaActivity: vi.fn()
}));

vi.mock('$lib/services/brand', () => ({
	updateBrandFieldWithVersion: vi.fn(),
	getMatchingProfileField: vi.fn(),
	getProfileFieldValue: vi.fn()
}));

import {
	createBrandMedia,
	getBrandMedia,
	getBrandMediaByType,
	getBrandMediaByCategory,
	updateBrandMedia,
	deleteBrandMedia,
	getLogoAssets,
	getBrandAssetSummary,
	createBrandText,
	getBrandTexts,
	getBrandTextsByCategory,
	updateBrandText,
	deleteBrandText,
	createMediaVariant,
	getMediaVariants,
	deleteMediaVariant
} from '$lib/services/brand-assets';

import {
	getMediaActivityLog,
	getMediaActivityLogForAsset,
	getMediaRevisions,
	getCurrentRevision,
	revertToRevision,
	createMediaRevision,
	logMediaActivity
} from '$lib/services/media-history';

import { getMatchingProfileField, getProfileFieldValue } from '$lib/services/brand';

beforeEach(() => {
	vi.clearAllMocks();
});

// ─── Helpers ────────────────────────────────────────────────────

function makeUrl(path: string, params: Record<string, string> = {}) {
	const u = new URL(`http://localhost${path}`);
	for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
	return u;
}

const mockDB = { prepare: vi.fn() };
const mockBucket = { get: vi.fn(), put: vi.fn(), delete: vi.fn() };
const authedLocals = { user: { id: 'user-1' } };
const noUser = { user: null };

/**
 * A DB in which `user-1` owns every brand. The file route authorises the key's brand
 * before reading R2, so these tests need an ownership answer to reach the R2 branches
 * they are actually about.
 */
const ownerDB = {
	prepare: vi.fn().mockImplementation((sql: string) => ({
		bind: vi.fn().mockReturnValue({
			first: vi
				.fn()
				.mockResolvedValue(sql.includes('FROM brand_profiles') ? { user_id: 'user-1' } : null)
		})
	}))
};

// ═══════════════════════════════════════════════════════════════
// GET/POST/PATCH/DELETE /api/brand/assets/media
// ═══════════════════════════════════════════════════════════════
describe('GET /api/brand/assets/media', () => {
	it('should return 401 when not authenticated', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/media/+server');
		try {
			await GET({
				url: makeUrl('/x', { brandProfileId: 'bp-1' }),
				platform: { env: { DB: mockDB } },
				locals: noUser
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 500 when DB not available', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/media/+server');
		try {
			await GET({
				url: makeUrl('/x', { brandProfileId: 'bp-1' }),
				platform: { env: {} },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('should return 400 when brandProfileId missing', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/media/+server');
		try {
			await GET({
				url: makeUrl('/x'),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return logos when logos=true', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/media/+server');
		vi.mocked(getLogoAssets).mockResolvedValue([{ id: 'logo-1' }] as any);
		const res = await GET({
			url: makeUrl('/x', { brandProfileId: 'bp-1', logos: 'true' }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.logos).toHaveLength(1);
	});

	it('should filter by mediaType and category', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/media/+server');
		vi.mocked(getBrandMediaByCategory).mockResolvedValue([{ id: 'm-1' }] as any);
		const res = await GET({
			url: makeUrl('/x', { brandProfileId: 'bp-1', mediaType: 'image', category: 'logo' }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.media).toHaveLength(1);
		expect(getBrandMediaByCategory).toHaveBeenCalledWith(mockDB, 'bp-1', 'image', 'logo');
	});

	it('should filter by mediaType only', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/media/+server');
		vi.mocked(getBrandMediaByType).mockResolvedValue([{ id: 'm-1' }] as any);
		const res = await GET({
			url: makeUrl('/x', { brandProfileId: 'bp-1', mediaType: 'audio' }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(getBrandMediaByType).toHaveBeenCalledWith(mockDB, 'bp-1', 'audio');
	});

	it('should return all media when no filters', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/media/+server');
		vi.mocked(getBrandMedia).mockResolvedValue([{ id: 'm-1' }, { id: 'm-2' }] as any);
		const res = await GET({
			url: makeUrl('/x', { brandProfileId: 'bp-1' }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.media).toHaveLength(2);
	});
});

describe('POST /api/brand/assets/media', () => {
	it('should return 401 when not authenticated', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/media/+server');
		try {
			await POST({
				request: new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) }),
				platform: { env: { DB: mockDB } },
				locals: noUser
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 400 when required fields missing', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/media/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ brandProfileId: 'bp-1' })
				}),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should create media asset', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/media/+server');
		vi.mocked(createBrandMedia).mockResolvedValue({ id: 'new-media' } as any);
		const body = { brandProfileId: 'bp-1', mediaType: 'image', category: 'logo', name: 'Logo' };
		const res = await POST({
			request: new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data.media.id).toBe('new-media');
	});
});

describe('PATCH /api/brand/assets/media', () => {
	it('should return 400 when id missing', async () => {
		const { PATCH } = await import('../../src/routes/api/brand/assets/media/+server');
		try {
			await PATCH({
				request: new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({}) }),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should update media asset', async () => {
		const { PATCH } = await import('../../src/routes/api/brand/assets/media/+server');
		vi.mocked(updateBrandMedia).mockResolvedValue(undefined as any);
		const res = await PATCH({
			request: new Request('http://localhost', {
				method: 'PATCH',
				body: JSON.stringify({ id: 'm-1', name: 'Updated' })
			}),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.success).toBe(true);
		expect(updateBrandMedia).toHaveBeenCalledWith(mockDB, 'm-1', { name: 'Updated' });
	});
});

describe('DELETE /api/brand/assets/media', () => {
	it('should return 400 when id missing', async () => {
		const { DELETE } = await import('../../src/routes/api/brand/assets/media/+server');
		try {
			await DELETE({
				url: makeUrl('/x'),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should delete media asset', async () => {
		const { DELETE } = await import('../../src/routes/api/brand/assets/media/+server');
		vi.mocked(deleteBrandMedia).mockResolvedValue(undefined as any);
		const res = await DELETE({
			url: makeUrl('/x', { id: 'm-1' }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.success).toBe(true);
	});
});

// ═══════════════════════════════════════════════════════════════
// GET /api/brand/assets/summary
// ═══════════════════════════════════════════════════════════════
describe('GET /api/brand/assets/summary', () => {
	it('should return 401 when not authenticated', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/summary/+server');
		try {
			await GET({
				url: makeUrl('/x', { brandProfileId: 'bp-1' }),
				platform: { env: { DB: mockDB } },
				locals: noUser
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 400 when brandProfileId missing', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/summary/+server');
		try {
			await GET({
				url: makeUrl('/x'),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return asset summary', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/summary/+server');
		vi.mocked(getBrandAssetSummary).mockResolvedValue({ images: 5, audio: 2 } as any);
		const res = await GET({
			url: makeUrl('/x', { brandProfileId: 'bp-1' }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.summary).toEqual({ images: 5, audio: 2 });
	});
});

// ═══════════════════════════════════════════════════════════════
// GET /api/brand/assets/activity
// ═══════════════════════════════════════════════════════════════
describe('GET /api/brand/assets/activity', () => {
	it('should return 401 when not authenticated', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/activity/+server');
		try {
			await GET({ url: makeUrl('/x'), platform: { env: { DB: mockDB } }, locals: noUser } as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 500 when DB not available', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/activity/+server');
		try {
			await GET({ url: makeUrl('/x'), platform: { env: {} }, locals: authedLocals } as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('should return activity for specific asset', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/activity/+server');
		vi.mocked(getMediaActivityLogForAsset).mockResolvedValue([{ id: 'log-1' }] as any);
		const res = await GET({
			url: makeUrl('/x', { brandMediaId: 'media-1' }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.logs).toHaveLength(1);
		expect(getMediaActivityLogForAsset).toHaveBeenCalledWith(mockDB, 'media-1');
	});

	it('should return 400 when neither brandMediaId nor brandProfileId', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/activity/+server');
		try {
			await GET({
				url: makeUrl('/x'),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return activity for brand with pagination', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/activity/+server');
		vi.mocked(getMediaActivityLog).mockResolvedValue([{ id: 'log-1' }, { id: 'log-2' }] as any);
		const res = await GET({
			url: makeUrl('/x', { brandProfileId: 'bp-1', limit: '10', offset: '5' }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.logs).toHaveLength(2);
		expect(getMediaActivityLog).toHaveBeenCalledWith(mockDB, 'bp-1', { limit: 10, offset: 5 });
	});
});

// ═══════════════════════════════════════════════════════════════
// GET/POST/PATCH/DELETE /api/brand/assets/texts
// ═══════════════════════════════════════════════════════════════
describe('GET /api/brand/assets/texts', () => {
	it('should return 401 when not authenticated', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/texts/+server');
		try {
			await GET({
				url: makeUrl('/x', { brandProfileId: 'bp-1' }),
				platform: { env: { DB: mockDB } },
				locals: noUser
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 400 when brandProfileId missing', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/texts/+server');
		try {
			await GET({
				url: makeUrl('/x'),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return texts filtered by category', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/texts/+server');
		vi.mocked(getBrandTextsByCategory).mockResolvedValue([{ id: 't1' }] as any);
		const res = await GET({
			url: makeUrl('/x', { brandProfileId: 'bp-1', category: 'taglines' }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.texts).toHaveLength(1);
		expect(getBrandTextsByCategory).toHaveBeenCalledWith(mockDB, 'bp-1', 'taglines');
	});

	it('should return all texts when no category', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/texts/+server');
		vi.mocked(getBrandTexts).mockResolvedValue([{ id: 't1' }, { id: 't2' }] as any);
		const res = await GET({
			url: makeUrl('/x', { brandProfileId: 'bp-1' }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.texts).toHaveLength(2);
	});
});

describe('POST /api/brand/assets/texts', () => {
	it('should return 400 when required fields missing', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/texts/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ brandProfileId: 'bp-1' })
				}),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should create text asset', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/texts/+server');
		vi.mocked(createBrandText).mockResolvedValue({ id: 't-new', value: 'Hello' } as any);
		const body = {
			brandProfileId: 'bp-1',
			category: 'taglines',
			key: 'main',
			label: 'Main Tagline',
			value: 'Hello World'
		};
		const res = await POST({
			request: new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data.text.id).toBe('t-new');
		expect(data.profileFieldUpdated).toBe(false);
	});

	it('should update profile field when setAsProfileField=true', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/texts/+server');
		const { updateBrandFieldWithVersion } = await import('$lib/services/brand');
		vi.mocked(createBrandText).mockResolvedValue({ id: 't-new' } as any);
		vi.mocked(updateBrandFieldWithVersion).mockResolvedValue(undefined);
		const body = {
			brandProfileId: 'bp-1',
			category: 'taglines',
			key: 'main',
			label: 'Main Tagline',
			value: 'Updated',
			setAsProfileField: true,
			profileFieldName: 'tagline'
		};
		const res = await POST({
			request: new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data.profileFieldUpdated).toBe(true);
	});

	it('should handle profile field update failure gracefully', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/texts/+server');
		const { updateBrandFieldWithVersion } = await import('$lib/services/brand');
		vi.mocked(createBrandText).mockResolvedValue({ id: 't-new' } as any);
		vi.mocked(updateBrandFieldWithVersion).mockRejectedValue(new Error('DB error'));
		const body = {
			brandProfileId: 'bp-1',
			category: 'taglines',
			key: 'main',
			label: 'Tag',
			value: 'v',
			setAsProfileField: true,
			profileFieldName: 'tagline'
		};
		const res = await POST({
			request: new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data.profileFieldUpdated).toBe(false);
	});
});

describe('PATCH /api/brand/assets/texts', () => {
	it('should return 400 when id missing', async () => {
		const { PATCH } = await import('../../src/routes/api/brand/assets/texts/+server');
		try {
			await PATCH({
				request: new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({}) }),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should update text asset', async () => {
		const { PATCH } = await import('../../src/routes/api/brand/assets/texts/+server');
		vi.mocked(updateBrandText).mockResolvedValue(undefined as any);
		const res = await PATCH({
			request: new Request('http://localhost', {
				method: 'PATCH',
				body: JSON.stringify({ id: 't-1', value: 'new value' })
			}),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.success).toBe(true);
	});
});

describe('DELETE /api/brand/assets/texts', () => {
	it('should return 400 when id missing', async () => {
		const { DELETE } = await import('../../src/routes/api/brand/assets/texts/+server');
		try {
			await DELETE({
				url: makeUrl('/x'),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should delete text asset', async () => {
		const { DELETE } = await import('../../src/routes/api/brand/assets/texts/+server');
		vi.mocked(deleteBrandText).mockResolvedValue(undefined as any);
		const res = await DELETE({
			url: makeUrl('/x', { id: 't-1' }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.success).toBe(true);
	});
});

// ═══════════════════════════════════════════════════════════════
// GET /api/brand/assets/texts/field-status
// ═══════════════════════════════════════════════════════════════
describe('GET /api/brand/assets/texts/field-status', () => {
	it('should return 401 when not authenticated', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/texts/field-status/+server');
		try {
			await GET({ url: makeUrl('/x'), platform: { env: { DB: mockDB } }, locals: noUser } as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 400 when params missing', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/texts/field-status/+server');
		try {
			await GET({
				url: makeUrl('/x', { brandProfileId: 'bp-1' }),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return matchesField=false when no mapping', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/texts/field-status/+server');
		vi.mocked(getMatchingProfileField).mockReturnValue(null);
		const res = await GET({
			url: makeUrl('/x', { brandProfileId: 'bp-1', category: 'misc', key: 'random' }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.matchesField).toBe(false);
	});

	it('should return field info when mapping exists', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/texts/field-status/+server');
		vi.mocked(getMatchingProfileField).mockReturnValue({
			fieldName: 'tagline',
			fieldLabel: 'Tagline'
		});
		vi.mocked(getProfileFieldValue).mockResolvedValue('Current tagline');
		const res = await GET({
			url: makeUrl('/x', { brandProfileId: 'bp-1', category: 'taglines', key: 'main' }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.matchesField).toBe(true);
		expect(data.fieldName).toBe('tagline');
		expect(data.currentValue).toBe('Current tagline');
	});
});

// ═══════════════════════════════════════════════════════════════
// GET/POST/DELETE /api/brand/assets/variants
// ═══════════════════════════════════════════════════════════════
describe('GET /api/brand/assets/variants', () => {
	it('should return 401 when not authenticated', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/variants/+server');
		try {
			await GET({ url: makeUrl('/x'), platform: { env: { DB: mockDB } }, locals: noUser } as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 400 when brandMediaId missing', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/variants/+server');
		try {
			await GET({
				url: makeUrl('/x'),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return variants', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/variants/+server');
		vi.mocked(getMediaVariants).mockResolvedValue([{ id: 'v1' }] as any);
		const res = await GET({
			url: makeUrl('/x', { brandMediaId: 'm-1' }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.variants).toHaveLength(1);
	});
});

describe('POST /api/brand/assets/variants', () => {
	it('should return 400 when required fields missing', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/variants/+server');
		try {
			await POST({
				request: new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) }),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should create variant', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/variants/+server');
		vi.mocked(createMediaVariant).mockResolvedValue({ id: 'v-new' } as any);
		const res = await POST({
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ brandMediaId: 'm-1', variantType: 'thumbnail', label: 'Thumb' })
			}),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data.variant.id).toBe('v-new');
	});
});

describe('DELETE /api/brand/assets/variants', () => {
	it('should return 400 when id missing', async () => {
		const { DELETE } = await import('../../src/routes/api/brand/assets/variants/+server');
		try {
			await DELETE({
				url: makeUrl('/x'),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should delete variant', async () => {
		const { DELETE } = await import('../../src/routes/api/brand/assets/variants/+server');
		vi.mocked(deleteMediaVariant).mockResolvedValue(undefined as any);
		const res = await DELETE({
			url: makeUrl('/x', { id: 'v-1' }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.success).toBe(true);
	});
});

// ═══════════════════════════════════════════════════════════════
// GET/POST /api/brand/assets/revisions
// ═══════════════════════════════════════════════════════════════
describe('GET /api/brand/assets/revisions', () => {
	it('should return 401 when not authenticated', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/revisions/+server');
		try {
			await GET({ url: makeUrl('/x'), platform: { env: { DB: mockDB } }, locals: noUser } as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 400 when brandMediaId missing', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/revisions/+server');
		try {
			await GET({
				url: makeUrl('/x'),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return current revision', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/revisions/+server');
		vi.mocked(getCurrentRevision).mockResolvedValue({ id: 'rev-1' } as any);
		const res = await GET({
			url: makeUrl('/x', { brandMediaId: 'm-1', current: 'true' }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.revision.id).toBe('rev-1');
	});

	it('should return all revisions', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/revisions/+server');
		vi.mocked(getMediaRevisions).mockResolvedValue([{ id: 'rev-1' }, { id: 'rev-2' }] as any);
		const res = await GET({
			url: makeUrl('/x', { brandMediaId: 'm-1' }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.revisions).toHaveLength(2);
	});
});

describe('POST /api/brand/assets/revisions', () => {
	it('should return 401 when not authenticated', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/revisions/+server');
		try {
			await POST({
				request: new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) }),
				platform: { env: { DB: mockDB } },
				locals: noUser
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should revert to previous revision', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/revisions/+server');
		vi.mocked(revertToRevision).mockResolvedValue({
			brandMediaId: 'm-1',
			r2Key: 'k',
			mimeType: 'image/png',
			fileSize: 100,
			width: 200,
			height: 200,
			revisionNumber: 2,
			changeNote: 'Reverted to revision 1',
			source: 'upload'
		} as any);
		vi.mocked(updateBrandMedia).mockResolvedValue(undefined as any);
		vi.mocked(logMediaActivity).mockResolvedValue(undefined as any);

		const res = await POST({
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ action: 'revert', revisionId: 'rev-1', brandProfileId: 'bp-1' })
			}),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.revision.revisionNumber).toBe(2);
		expect(updateBrandMedia).toHaveBeenCalled();
		expect(logMediaActivity).toHaveBeenCalled();
	});

	it('should return 400 when revert missing revisionId', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/revisions/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ action: 'revert', brandProfileId: 'bp-1' })
				}),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return 400 when revert missing brandProfileId', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/revisions/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ action: 'revert', revisionId: 'rev-1' })
				}),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should create new revision', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/revisions/+server');
		vi.mocked(createMediaRevision).mockResolvedValue({
			id: 'rev-new',
			revisionNumber: 3,
			brandMediaId: 'm-1'
		} as any);
		vi.mocked(logMediaActivity).mockResolvedValue(undefined as any);

		const res = await POST({
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					brandMediaId: 'm-1',
					brandProfileId: 'bp-1',
					r2Key: 'k',
					mimeType: 'image/png',
					fileSize: 500,
					changeNote: 'Updated image'
				})
			}),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data.revision.revisionNumber).toBe(3);
	});

	it('should return 400 when creating revision without brandMediaId', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/revisions/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ brandProfileId: 'bp-1' })
				}),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// GET /api/brand/assets/file
// ═══════════════════════════════════════════════════════════════
describe('GET /api/brand/assets/file', () => {
	it('should return 401 when not authenticated', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/file/+server');
		try {
			await GET({
				url: makeUrl('/x', { key: 'k' }),
				platform: { env: { BUCKET: mockBucket } },
				locals: noUser
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 500 when BUCKET not available', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/file/+server');
		try {
			await GET({
				url: makeUrl('/x', { key: 'k' }),
				platform: { env: {} },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('should return 400 when key missing', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/file/+server');
		try {
			await GET({
				url: makeUrl('/x'),
				platform: { env: { BUCKET: mockBucket, DB: ownerDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return 404 when file not found', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/file/+server');
		mockBucket.get.mockResolvedValue(null);
		try {
			await GET({
				// A key the caller *is* allowed to read, so this reaches the R2 miss —
				// an unauthorised key answers 404 too, but never gets that far.
				url: makeUrl('/x', { key: 'brands/bp-1/image/missing.png' }),
				platform: { env: { BUCKET: mockBucket, DB: ownerDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});

	it('should serve file with correct headers', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/file/+server');
		mockBucket.get.mockResolvedValue({
			body: new ReadableStream(),
			size: 1234,
			httpMetadata: { contentType: 'audio/mpeg' }
		});
		const res = await GET({
			url: makeUrl('/x', { key: 'brands/bp-1/audio/voice.mp3' }),
			platform: { env: { BUCKET: mockBucket, DB: ownerDB } },
			locals: authedLocals
		} as any);
		expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
		expect(res.headers.get('Content-Length')).toBe('1234');
		// `private`, not `public`: the response is authorised per user now, so a shared
		// cache holding it would hand one user's asset to the next caller.
		expect(res.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable');
	});
});

// ═══════════════════════════════════════════════════════════════
// POST /api/brand/assets/upload
// ═══════════════════════════════════════════════════════════════
describe('POST /api/brand/assets/upload', () => {
	it('should return 401 when not authenticated', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/upload/+server');
		try {
			await POST({
				request: { formData: () => Promise.resolve(new FormData()) },
				platform: { env: { DB: mockDB, BUCKET: mockBucket } },
				locals: noUser
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 500 when platform not available', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/upload/+server');
		try {
			await POST({
				request: { formData: () => Promise.resolve(new FormData()) },
				platform: { env: {} },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('should return 400 when file not provided', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/upload/+server');
		const fd = new FormData();
		fd.set('brandProfileId', 'bp-1');
		try {
			await POST({
				request: { formData: () => Promise.resolve(fd) },
				platform: { env: { DB: mockDB, BUCKET: mockBucket } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return 400 when brandProfileId missing', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/upload/+server');
		const fd = new FormData();
		fd.set('file', new File(['x'], 'test.png', { type: 'image/png' }));
		try {
			await POST({
				request: { formData: () => Promise.resolve(fd) },
				platform: { env: { DB: mockDB, BUCKET: mockBucket } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return 400 when mediaType invalid', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/upload/+server');
		const fd = new FormData();
		fd.set('file', new File(['x'], 'test.txt', { type: 'text/plain' }));
		fd.set('brandProfileId', 'bp-1');
		fd.set('mediaType', 'document');
		fd.set('category', 'misc');
		try {
			await POST({
				request: { formData: () => Promise.resolve(fd) },
				platform: { env: { DB: mockDB, BUCKET: mockBucket } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return 400 when category missing', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/upload/+server');
		const fd = new FormData();
		fd.set('file', new File(['x'], 'test.png', { type: 'image/png' }));
		fd.set('brandProfileId', 'bp-1');
		fd.set('mediaType', 'image');
		try {
			await POST({
				request: { formData: () => Promise.resolve(fd) },
				platform: { env: { DB: mockDB, BUCKET: mockBucket } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should upload file, create media asset and revision', async () => {
		// This test uses dynamic imports internally, so we need to mock them
		vi.mocked(createBrandMedia).mockResolvedValue({ id: 'media-new' } as any);
		vi.mocked(createMediaRevision).mockResolvedValue({ id: 'rev-1' } as any);
		vi.mocked(logMediaActivity).mockResolvedValue(undefined as any);
		mockBucket.put.mockResolvedValue(undefined);

		const { POST } = await import('../../src/routes/api/brand/assets/upload/+server');
		const fd = new FormData();
		const file = new File(['test content'], 'logo.png', { type: 'image/png' });
		fd.set('file', file);
		fd.set('brandProfileId', 'bp-1');
		fd.set('mediaType', 'image');
		fd.set('category', 'logo');
		fd.set('name', 'Brand Logo');

		const res = await POST({
			request: { formData: () => Promise.resolve(fd) },
			platform: { env: { DB: mockDB, BUCKET: mockBucket } },
			locals: authedLocals
		} as any);
		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data.media.id).toBe('media-new');
		expect(mockBucket.put).toHaveBeenCalled();
	});
});
