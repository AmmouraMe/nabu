/**
 * Branch coverage tests for API route endpoints
 * Targets uncovered branches in:
 *   - /api/brand/assets/variants (68.75%)
 *   - /api/brand/assets/texts (75.86%)
 *   - /api/brand/assets/revisions (81.48%)
 *   - /api/brand/assets/activity (81.81%)
 *   - /api/brand/assets/media (83.33%)
 *   - /api/brand/assets/summary (83.33%)
 *   - /api/brand/assets/upload (88.23%)
 *   - /api/brand/assets/texts/field-status (88.88%)
 *   - /api/chat/stream (86.11%)
 *   - /api/chat/models (85%)
 *   - /api/onboarding/attachments/upload (88.88%)
 *   - /api/brand/[id]/+page.server.ts (85.71%)
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
	upsertBrandText: vi.fn(),
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

vi.mock('$lib/services/file-archive', () => ({
	createFileArchiveEntry: vi.fn()
}));

vi.mock('$lib/utils/attachments', () => ({
	getAttachmentType: vi.fn()
}));

vi.mock('$lib/services/openai-chat', () => ({
	formatMessagesForOpenAI: vi.fn().mockReturnValue([]),
	getEnabledOpenAIKey: vi.fn(),
	streamChatCompletion: vi.fn(),
	getAllEnabledAIKeys: vi.fn(),
	streamChatCompletionWithFallback: vi.fn()
}));

vi.mock('$lib/utils/cost', () => ({
	calculateCost: vi.fn().mockReturnValue({ totalCost: 0.01 }),
	getModelDisplayName: vi.fn().mockReturnValue('GPT-4o'),
	calculateVideoCostFromPricing: vi.fn().mockReturnValue(0)
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
	upsertBrandText,
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

import {
	updateBrandFieldWithVersion,
	getMatchingProfileField,
	getProfileFieldValue
} from '$lib/services/brand';

import { createFileArchiveEntry } from '$lib/services/file-archive';
import { getAttachmentType } from '$lib/utils/attachments';
import {
	getEnabledOpenAIKey,
	streamChatCompletion,
	getAllEnabledAIKeys,
	streamChatCompletionWithFallback
} from '$lib/services/openai-chat';
import { withBrandAccess } from '../fixtures/brand-access';

beforeEach(() => {
	vi.clearAllMocks();
});

// ─── Helpers ────────────────────────────────────────────────────

function makeUrl(path: string, params: Record<string, string> = {}) {
	const u = new URL(`http://localhost${path}`);
	for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
	return u;
}

// The asset routes authorise the brand before acting; `user-1` owns what these
// tests touch, so they reach the branches they are about.
const mockDB = withBrandAccess({ prepare: vi.fn() }, { userId: 'user-1' });
const mockBucket = { get: vi.fn(), put: vi.fn(), delete: vi.fn() };
const authedLocals = { user: { id: 'user-1' } };
const noUser = { user: null };

// ═══════════════════════════════════════════════════════════════
// /api/brand/assets/variants — uncovered branches (lines 11,25-26,44-45)
// ═══════════════════════════════════════════════════════════════
describe('Variants API - platform null branches', () => {
	it('GET: should throw 500 when platform is null', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/variants/+server');
		try {
			await GET({
				url: makeUrl('/x', { brandMediaId: 'bm-1' }),
				platform: null,
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('GET: should throw 500 when platform.env is null', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/variants/+server');
		try {
			await GET({
				url: makeUrl('/x', { brandMediaId: 'bm-1' }),
				platform: { env: null },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('POST: should throw 500 when platform is undefined', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/variants/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ brandMediaId: 'bm-1', variantType: 'dark', label: 'Dark' })
				}),
				platform: undefined,
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('POST: should throw 400 when missing variantType', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/variants/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ brandMediaId: 'bm-1', label: 'Dark' })
				}),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('POST: should throw 400 when missing label', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/variants/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ brandMediaId: 'bm-1', variantType: 'dark' })
				}),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('DELETE: should throw 500 when platform is null', async () => {
		const { DELETE } = await import('../../src/routes/api/brand/assets/variants/+server');
		try {
			await DELETE({
				url: makeUrl('/x', { id: 'v-1' }),
				platform: null,
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('DELETE: should throw 401 when unauthenticated', async () => {
		const { DELETE } = await import('../../src/routes/api/brand/assets/variants/+server');
		try {
			await DELETE({
				url: makeUrl('/x', { id: 'v-1' }),
				platform: { env: { DB: mockDB } },
				locals: noUser
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// /api/brand/assets/texts — uncovered branches (lines 52,63,68,77,84-85,101-102)
// ═══════════════════════════════════════════════════════════════
describe('Texts API - uncovered branches', () => {
	function mockTextUpsert(overrides: Record<string, unknown> = {}) {
		vi.mocked(upsertBrandText).mockResolvedValue({
			text: {
				id: 'text-1',
				value: 'My tagline',
				language: 'en',
				...overrides
			},
			created: true
		} as any);
	}

	it('POST: should set profileFieldUpdated=false when setAsProfileField is falsy', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/texts/+server');
		mockTextUpsert();
		const body = {
			brandProfileId: 'bp-1',
			category: 'messaging',
			key: 'tagline',
			label: 'Tagline',
			value: 'My tagline',
			setAsProfileField: false
		};
		const res = await POST({
			request: new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.profileFieldUpdated).toBe(false);
	});

	it('POST: should set profileFieldUpdated=true when setAsProfileField succeeds', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/texts/+server');
		mockTextUpsert();
		vi.mocked(updateBrandFieldWithVersion).mockResolvedValue(undefined);
		const body = {
			brandProfileId: 'bp-1',
			category: 'messaging',
			key: 'tagline',
			label: 'Tagline',
			value: 'My tagline',
			setAsProfileField: true,
			profileFieldName: 'tagline'
		};
		const res = await POST({
			request: new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.profileFieldUpdated).toBe(true);
		expect(updateBrandFieldWithVersion).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ syncTextAsset: false })
		);
	});

	it('POST: should set profileFieldUpdated=false when updateBrandFieldWithVersion throws', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/texts/+server');
		mockTextUpsert();
		vi.mocked(updateBrandFieldWithVersion).mockRejectedValue(new Error('DB error'));
		const body = {
			brandProfileId: 'bp-1',
			category: 'messaging',
			key: 'tagline',
			label: 'Tagline',
			value: 'My tagline',
			setAsProfileField: true,
			profileFieldName: 'tagline'
		};
		const res = await POST({
			request: new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.profileFieldUpdated).toBe(false);
		expect(data.text.id).toBe('text-1');
	});

	it('POST: should handle setAsProfileField=true without profileFieldName', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/texts/+server');
		mockTextUpsert();
		const body = {
			brandProfileId: 'bp-1',
			category: 'messaging',
			key: 'tagline',
			label: 'Tagline',
			value: 'My tagline',
			setAsProfileField: true,
			profileFieldName: null
		};
		const res = await POST({
			request: new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.profileFieldUpdated).toBe(false);
	});

	it('POST: should throw 500 when platform is null', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/texts/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ brandProfileId: 'bp-1' })
				}),
				platform: null,
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('POST: should include language when provided', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/texts/+server');
		mockTextUpsert({ language: 'en' });
		const body = {
			brandProfileId: 'bp-1',
			category: 'messaging',
			key: 'tagline',
			label: 'Tagline',
			value: 'My tagline',
			language: 'en'
		};
		const res = await POST({
			request: new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		expect(upsertBrandText).toHaveBeenCalledWith(
			mockDB,
			expect.objectContaining({ language: 'en' })
		);
	});

	it('PATCH: should throw 500 when platform is null', async () => {
		const { PATCH } = await import('../../src/routes/api/brand/assets/texts/+server');
		try {
			await PATCH({
				request: new Request('http://localhost', {
					method: 'PATCH',
					body: JSON.stringify({ id: 't-1' })
				}),
				platform: null,
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('DELETE: should throw 500 when platform.env is undefined', async () => {
		const { DELETE } = await import('../../src/routes/api/brand/assets/texts/+server');
		try {
			await DELETE({
				url: makeUrl('/x', { id: 't-1' }),
				platform: { env: undefined },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// /api/brand/assets/revisions — uncovered branches (lines 18,39,68,79,100)
// ═══════════════════════════════════════════════════════════════
describe('Revisions API - uncovered branches', () => {
	it('GET: should throw 500 when platform is null', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/revisions/+server');
		try {
			await GET({
				url: makeUrl('/x', { brandMediaId: 'bm-1' }),
				platform: null,
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('POST: should throw 500 when platform is null', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/revisions/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ action: 'revert', revisionId: 'r-1' })
				}),
				platform: null,
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('POST revert: should throw 400 when brandProfileId missing', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/revisions/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ action: 'revert', revisionId: 'r-1' })
				}),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('POST create: should create revision with default source when source not provided', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/revisions/+server');
		vi.mocked(createMediaRevision).mockResolvedValue({
			id: 'rev-1',
			revisionNumber: 1,
			brandMediaId: 'bm-1'
		} as any);
		vi.mocked(logMediaActivity).mockResolvedValue(undefined as any);
		const body = {
			action: 'create',
			brandMediaId: 'bm-1',
			brandProfileId: 'bp-1',
			url: 'https://example.com/img.png',
			r2Key: 'brands/img.png',
			mimeType: 'image/png',
			fileSize: 1024
		};
		const res = await POST({
			request: new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		expect(res.status).toBe(201);
		expect(createMediaRevision).toHaveBeenCalledWith(
			mockDB,
			expect.objectContaining({
				source: 'upload'
			})
		);
	});

	it('POST create: should create revision with custom source and changeNote', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/revisions/+server');
		vi.mocked(createMediaRevision).mockResolvedValue({
			id: 'rev-1',
			revisionNumber: 2,
			brandMediaId: 'bm-1'
		} as any);
		vi.mocked(logMediaActivity).mockResolvedValue(undefined as any);
		const body = {
			brandMediaId: 'bm-1',
			brandProfileId: 'bp-1',
			source: 'ai_generated',
			changeNote: 'AI enhanced version'
		};
		const res = await POST({
			request: new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		expect(res.status).toBe(201);
	});

	it('POST create: should create revision description without changeNote', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/revisions/+server');
		vi.mocked(createMediaRevision).mockResolvedValue({
			id: 'rev-1',
			revisionNumber: 3,
			brandMediaId: 'bm-1'
		} as any);
		vi.mocked(logMediaActivity).mockResolvedValue(undefined as any);
		const body = {
			brandMediaId: 'bm-1',
			brandProfileId: 'bp-1'
		};
		const res = await POST({
			request: new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		expect(res.status).toBe(201);
		// The description should NOT include ": changeNote" when changeNote is falsy
		expect(logMediaActivity).toHaveBeenCalledWith(
			mockDB,
			expect.objectContaining({
				description: expect.stringContaining('Created revision #3')
			})
		);
	});

	it('POST revert: should handle revert with changeNote in revision', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/revisions/+server');
		vi.mocked(revertToRevision).mockResolvedValue({
			id: 'rev-2',
			brandMediaId: 'bm-1',
			revisionNumber: 4,
			url: 'https://example.com/old.png',
			r2Key: 'brands/old.png',
			mimeType: 'image/png',
			fileSize: 512,
			width: null,
			height: null,
			durationSeconds: null,
			changeNote: 'Reverted to revision #1',
			source: 'upload'
		} as any);
		vi.mocked(updateBrandMedia).mockResolvedValue(undefined as any);
		vi.mocked(logMediaActivity).mockResolvedValue(undefined as any);
		const body = {
			action: 'revert',
			revisionId: 'rev-1',
			brandProfileId: 'bp-1'
		};
		const res = await POST({
			request: new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.revision.id).toBe('rev-2');
	});

	it('POST revert: should handle revert without changeNote in revision', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/revisions/+server');
		vi.mocked(revertToRevision).mockResolvedValue({
			id: 'rev-3',
			brandMediaId: 'bm-1',
			revisionNumber: 5,
			url: 'https://example.com/old.png',
			r2Key: null,
			mimeType: 'image/png',
			fileSize: 512,
			width: 100,
			height: 100,
			durationSeconds: null,
			changeNote: null,
			source: 'ai_generated'
		} as any);
		vi.mocked(updateBrandMedia).mockResolvedValue(undefined as any);
		vi.mocked(logMediaActivity).mockResolvedValue(undefined as any);
		const body = {
			action: 'revert',
			revisionId: 'rev-1',
			brandProfileId: 'bp-1'
		};
		const res = await POST({
			request: new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.revision.id).toBe('rev-3');
		expect(logMediaActivity).toHaveBeenCalledWith(
			mockDB,
			expect.objectContaining({
				description: expect.stringContaining('previous')
			})
		);
	});
});

// ═══════════════════════════════════════════════════════════════
// /api/brand/assets/activity — uncovered branches (lines 25-26)
// ═══════════════════════════════════════════════════════════════
describe('Activity API - uncovered branches', () => {
	it('GET: should use default limit and offset when not provided', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/activity/+server');
		vi.mocked(getMediaActivityLog).mockResolvedValue([]);
		const res = await GET({
			url: makeUrl('/x', { brandProfileId: 'bp-1' }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		expect(getMediaActivityLog).toHaveBeenCalledWith(mockDB, 'bp-1', { limit: 50, offset: 0 });
	});

	it('GET: should parse custom limit and offset', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/activity/+server');
		vi.mocked(getMediaActivityLog).mockResolvedValue([]);
		const res = await GET({
			url: makeUrl('/x', { brandProfileId: 'bp-1', limit: '10', offset: '20' }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		expect(getMediaActivityLog).toHaveBeenCalledWith(mockDB, 'bp-1', { limit: 10, offset: 20 });
	});

	it('GET: should throw 500 when platform is null', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/activity/+server');
		try {
			await GET({
				url: makeUrl('/x', { brandProfileId: 'bp-1' }),
				platform: null,
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// /api/brand/assets/media — uncovered branches (lines 51,69-70,86-87)
// ═══════════════════════════════════════════════════════════════
describe('Media API - platform null branches', () => {
	it('POST: should throw 500 when platform is null', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/media/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({
						brandProfileId: 'bp-1',
						mediaType: 'image',
						category: 'logo',
						name: 'Logo'
					})
				}),
				platform: null,
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('PATCH: should throw 500 when platform is null', async () => {
		const { PATCH } = await import('../../src/routes/api/brand/assets/media/+server');
		try {
			await PATCH({
				request: new Request('http://localhost', {
					method: 'PATCH',
					body: JSON.stringify({ id: 'm-1', name: 'Updated' })
				}),
				platform: null,
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('PATCH: should throw 401 when not authenticated', async () => {
		const { PATCH } = await import('../../src/routes/api/brand/assets/media/+server');
		try {
			await PATCH({
				request: new Request('http://localhost', {
					method: 'PATCH',
					body: JSON.stringify({ id: 'm-1' })
				}),
				platform: { env: { DB: mockDB } },
				locals: noUser
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('DELETE: should throw 500 when platform is null', async () => {
		const { DELETE } = await import('../../src/routes/api/brand/assets/media/+server');
		try {
			await DELETE({
				url: makeUrl('/x', { id: 'm-1' }),
				platform: null,
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('DELETE: should throw 401 when not authenticated', async () => {
		const { DELETE } = await import('../../src/routes/api/brand/assets/media/+server');
		try {
			await DELETE({
				url: makeUrl('/x', { id: 'm-1' }),
				platform: { env: { DB: mockDB } },
				locals: noUser
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// /api/brand/assets/summary — uncovered branch (line 11)
// ═══════════════════════════════════════════════════════════════
describe('Summary API - platform null branch', () => {
	it('GET: should throw 500 when platform is null', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/summary/+server');
		try {
			await GET({
				url: makeUrl('/x', { brandProfileId: 'bp-1' }),
				platform: null,
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('GET: should throw 500 when platform.env is undefined', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/summary/+server');
		try {
			await GET({
				url: makeUrl('/x', { brandProfileId: 'bp-1' }),
				platform: { env: undefined },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// /api/brand/assets/upload — uncovered branches (lines 28-31)
// ═══════════════════════════════════════════════════════════════
describe('Upload API - uncovered branches', () => {
	function makeFormData(fields: Record<string, string | File>) {
		const fd = new FormData();
		for (const [k, v] of Object.entries(fields)) fd.append(k, v);
		return fd;
	}

	it('POST: should throw 400 for invalid mediaType (e.g. "text")', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/upload/+server');
		const file = new File(['content'], 'test.txt', { type: 'text/plain' });
		const fd = makeFormData({
			file,
			brandProfileId: 'bp-1',
			mediaType: 'text',
			category: 'docs',
			name: 'Test'
		});
		try {
			await POST({
				request: new Request('http://localhost', { method: 'POST', body: fd }),
				platform: { env: { DB: mockDB, BUCKET: mockBucket } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('POST: should throw 400 for empty mediaType', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/upload/+server');
		const file = new File(['content'], 'test.png', { type: 'image/png' });
		const fd = makeFormData({
			file,
			brandProfileId: 'bp-1',
			mediaType: '',
			category: 'logo'
		});
		try {
			await POST({
				request: new Request('http://localhost', { method: 'POST', body: fd }),
				platform: { env: { DB: mockDB, BUCKET: mockBucket } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('POST: should throw 400 when category is missing', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/upload/+server');
		const file = new File(['content'], 'test.png', { type: 'image/png' });
		const fd = new FormData();
		fd.append('file', file);
		fd.append('brandProfileId', 'bp-1');
		fd.append('mediaType', 'image');
		try {
			await POST({
				request: new Request('http://localhost', { method: 'POST', body: fd }),
				platform: { env: { DB: mockDB, BUCKET: mockBucket } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('POST: should throw 500 when BUCKET is missing but DB present', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/upload/+server');
		const file = new File(['content'], 'test.png', { type: 'image/png' });
		const fd = makeFormData({ file, brandProfileId: 'bp-1', mediaType: 'image', category: 'logo' });
		try {
			await POST({
				request: new Request('http://localhost', { method: 'POST', body: fd }),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// /api/brand/assets/texts/field-status — uncovered branch (line 15)
// ═══════════════════════════════════════════════════════════════
describe('Field Status API - platform null branch', () => {
	it('GET: should throw 500 when platform is null', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/texts/field-status/+server');
		try {
			await GET({
				url: makeUrl('/x', { brandProfileId: 'bp-1', category: 'messaging', key: 'tagline' }),
				platform: null,
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('GET: should throw 500 when platform.env.DB is null', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/texts/field-status/+server');
		try {
			await GET({
				url: makeUrl('/x', { brandProfileId: 'bp-1', category: 'messaging', key: 'tagline' }),
				platform: { env: { DB: null } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// /api/chat/models — uncovered branches (lines 141-146)
// ═══════════════════════════════════════════════════════════════
describe('Chat Models API - uncovered branches', () => {
	it('GET: should return defaultModel as gpt-4o when gpt-4o-mini is not available', async () => {
		const { GET } = await import('../../src/routes/api/chat/models/+server');
		const mockKV = {
			get: vi
				.fn()
				.mockResolvedValueOnce(JSON.stringify(['key-1'])) // ai_keys_list
				.mockResolvedValueOnce(
					JSON.stringify({
						provider: 'openai',
						enabled: true,
						models: ['gpt-4o', 'gpt-4-turbo']
					})
				) // ai_key:key-1
		};
		const res = await GET({
			platform: { env: { KV: mockKV } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.defaultModel).toBe('gpt-4o');
	});

	it('GET: should return first available model when neither gpt-4o-mini nor gpt-4o are available', async () => {
		const { GET } = await import('../../src/routes/api/chat/models/+server');
		const mockKV = {
			get: vi
				.fn()
				.mockResolvedValueOnce(JSON.stringify(['key-1'])) // ai_keys_list
				.mockResolvedValueOnce(
					JSON.stringify({
						provider: 'openai',
						enabled: true,
						models: ['gpt-3.5-turbo']
					})
				) // ai_key:key-1
		};
		const res = await GET({
			platform: { env: { KV: mockKV } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.defaultModel).toBe('gpt-3.5-turbo');
	});

	it('GET: should handle KV errors gracefully by returning empty models', async () => {
		const { GET } = await import('../../src/routes/api/chat/models/+server');
		const mockKV = {
			get: vi.fn().mockImplementation(() => {
				const err: any = new Error('Service Unavailable');
				err.status = 503;
				throw err;
			})
		};
		// getEnabledModels() catches KV errors internally and returns []
		const res = await GET({
			platform: { env: { KV: mockKV } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.models).toEqual([]);
		expect(data.defaultModel).toBeNull();
	});

	it('GET: should handle unknown models (not in CHAT_MODELS) by filtering them out', async () => {
		const { GET } = await import('../../src/routes/api/chat/models/+server');
		const mockKV = {
			get: vi
				.fn()
				.mockResolvedValueOnce(JSON.stringify(['key-1'])) // ai_keys_list
				.mockResolvedValueOnce(
					JSON.stringify({
						provider: 'openai',
						enabled: true,
						models: ['unknown-model-xyz', 'gpt-4o']
					})
				) // ai_key:key-1
		};
		const res = await GET({
			platform: { env: { KV: mockKV } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		// unknown-model-xyz should be filtered out
		expect(data.models.every((m: any) => m.id !== 'unknown-model-xyz')).toBe(true);
		expect(data.models.some((m: any) => m.id === 'gpt-4o')).toBe(true);
	});

	it('GET: should handle key with legacy single model field', async () => {
		const { GET } = await import('../../src/routes/api/chat/models/+server');
		const mockKV = {
			get: vi
				.fn()
				.mockResolvedValueOnce(JSON.stringify(['key-1'])) // ai_keys_list
				.mockResolvedValueOnce(
					JSON.stringify({
						provider: 'openai',
						enabled: true,
						model: 'gpt-4o-mini' // legacy single model
					})
				) // ai_key:key-1
		};
		const res = await GET({
			platform: { env: { KV: mockKV } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.models.some((m: any) => m.id === 'gpt-4o-mini')).toBe(true);
		expect(data.defaultModel).toBe('gpt-4o-mini');
	});

	it('GET: should handle key with no models and no model field', async () => {
		const { GET } = await import('../../src/routes/api/chat/models/+server');
		const mockKV = {
			get: vi
				.fn()
				.mockResolvedValueOnce(JSON.stringify(['key-1'])) // ai_keys_list
				.mockResolvedValueOnce(
					JSON.stringify({
						provider: 'openai',
						enabled: true
						// no models or model field
					})
				) // ai_key:key-1
		};
		const res = await GET({
			platform: { env: { KV: mockKV } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.models).toHaveLength(0);
		expect(data.defaultModel).toBeNull();
	});

	it('GET: should sort models not in MODEL_ORDER alphabetically at the end', async () => {
		const { GET } = await import('../../src/routes/api/chat/models/+server');
		const mockKV = {
			get: vi
				.fn()
				.mockResolvedValueOnce(JSON.stringify(['key-1'])) // ai_keys_list
				.mockResolvedValueOnce(
					JSON.stringify({
						provider: 'openai',
						enabled: true,
						models: ['gpt-4o', 'o3', 'o3-mini']
					})
				)
		};
		const res = await GET({
			platform: { env: { KV: mockKV } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		const ids = data.models.map((m: any) => m.id);
		// gpt-4o should come before o3 and o3-mini in the sort order
		expect(ids.indexOf('gpt-4o')).toBeLessThan(ids.indexOf('o3'));
	});

	it('GET: should skip non-openai keys', async () => {
		const { GET } = await import('../../src/routes/api/chat/models/+server');
		const mockKV = {
			get: vi
				.fn()
				.mockResolvedValueOnce(JSON.stringify(['key-1', 'key-2'])) // ai_keys_list
				.mockResolvedValueOnce(
					JSON.stringify({
						provider: 'anthropic',
						enabled: true,
						models: ['claude-3']
					})
				) // key-1 (non-openai)
				.mockResolvedValueOnce(
					JSON.stringify({
						provider: 'openai',
						enabled: true,
						models: ['gpt-4o']
					})
				) // key-2
		};
		const res = await GET({
			platform: { env: { KV: mockKV } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.models.length).toBe(1);
		expect(data.models[0].id).toBe('gpt-4o');
	});

	it('GET: should skip disabled keys', async () => {
		const { GET } = await import('../../src/routes/api/chat/models/+server');
		const mockKV = {
			get: vi
				.fn()
				.mockResolvedValueOnce(JSON.stringify(['key-1'])) // ai_keys_list
				.mockResolvedValueOnce(
					JSON.stringify({
						provider: 'openai',
						enabled: false,
						models: ['gpt-4o']
					})
				)
		};
		const res = await GET({
			platform: { env: { KV: mockKV } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.models).toHaveLength(0);
	});
});

// ═══════════════════════════════════════════════════════════════
// /api/onboarding/attachments/upload — uncovered branches (lines 36,58)
// ═══════════════════════════════════════════════════════════════
describe('Onboarding Attachments Upload - uncovered branches', () => {
	it('POST: should throw 400 when file type is unsupported', async () => {
		const { POST } = await import('../../src/routes/api/onboarding/attachments/upload/+server');
		vi.mocked(getAttachmentType).mockReturnValue(null as any);
		const file = new File(['data'], 'test.xyz', { type: 'application/octet-stream' });
		const fd = new FormData();
		fd.append('file', file);
		fd.append('brandProfileId', 'bp-1');
		try {
			await POST({
				request: new Request('http://localhost', { method: 'POST', body: fd }),
				platform: { env: { DB: mockDB, BUCKET: mockBucket } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('POST: should use onboardingStep and messageId when provided', async () => {
		const { POST } = await import('../../src/routes/api/onboarding/attachments/upload/+server');
		vi.mocked(getAttachmentType).mockReturnValue('image');
		vi.mocked(createFileArchiveEntry).mockResolvedValue({
			id: 'fa-1',
			r2Key: 'archive/bp-1/onboarding/images/test.png',
			fileName: 'test.png',
			mimeType: 'image/png',
			fileSize: 100,
			fileType: 'image'
		} as any);
		mockBucket.put.mockResolvedValue(undefined);
		const file = new File(['data'], 'test.png', { type: 'image/png' });
		const fd = new FormData();
		fd.append('file', file);
		fd.append('brandProfileId', 'bp-1');
		fd.append('onboardingStep', 'brand_identity');
		fd.append('messageId', 'msg-1');
		const res = await POST({
			request: new Request('http://localhost', { method: 'POST', body: fd }),
			platform: { env: { DB: mockDB, BUCKET: mockBucket } },
			locals: authedLocals
		} as any);
		expect(res.status).toBe(201);
		expect(createFileArchiveEntry).toHaveBeenCalledWith(
			mockDB,
			expect.objectContaining({
				onboardingStep: 'brand_identity',
				messageId: 'msg-1'
			})
		);
	});

	it('POST: should use undefined for onboardingStep and messageId when not provided', async () => {
		const { POST } = await import('../../src/routes/api/onboarding/attachments/upload/+server');
		vi.mocked(getAttachmentType).mockReturnValue('video');
		vi.mocked(createFileArchiveEntry).mockResolvedValue({
			id: 'fa-2',
			r2Key: 'archive/bp-1/onboarding/videos/test.mp4',
			fileName: 'test.mp4',
			mimeType: 'video/mp4',
			fileSize: 200,
			fileType: 'video'
		} as any);
		mockBucket.put.mockResolvedValue(undefined);
		const file = new File(['data'], 'test.mp4', { type: 'video/mp4' });
		const fd = new FormData();
		fd.append('file', file);
		fd.append('brandProfileId', 'bp-1');
		const res = await POST({
			request: new Request('http://localhost', { method: 'POST', body: fd }),
			platform: { env: { DB: mockDB, BUCKET: mockBucket } },
			locals: authedLocals
		} as any);
		expect(res.status).toBe(201);
		expect(createFileArchiveEntry).toHaveBeenCalledWith(
			mockDB,
			expect.objectContaining({
				onboardingStep: undefined,
				messageId: undefined
			})
		);
	});

	it('POST: should throw 500 when platform is null', async () => {
		const { POST } = await import('../../src/routes/api/onboarding/attachments/upload/+server');
		const fd = new FormData();
		fd.append('file', new File(['data'], 'test.png', { type: 'image/png' }));
		fd.append('brandProfileId', 'bp-1');
		try {
			await POST({
				request: new Request('http://localhost', { method: 'POST', body: fd }),
				platform: null,
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// /api/chat/stream — uncovered branches (lines 43-47)
// ═══════════════════════════════════════════════════════════════
describe('Chat Stream API - uncovered branches', () => {
	it('POST: should throw 400 when conversationId is missing', async () => {
		const { POST } = await import('../../src/routes/api/chat/stream/+server');
		vi.mocked(getEnabledOpenAIKey).mockResolvedValue({ apiKey: 'key-1' } as any);
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({
						messages: [{ role: 'user', content: 'hi' }],
						model: 'gpt-4o'
					})
				}),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('POST: should throw 400 when messages is empty', async () => {
		const { POST } = await import('../../src/routes/api/chat/stream/+server');
		vi.mocked(getEnabledOpenAIKey).mockResolvedValue({ apiKey: 'key-1' } as any);
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({
						messages: [],
						conversationId: 'conv-1'
					})
				}),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('POST: should throw 503 when no AI key configured', async () => {
		const { POST } = await import('../../src/routes/api/chat/stream/+server');
		vi.mocked(getAllEnabledAIKeys).mockResolvedValue([]);
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({
						messages: [{ role: 'user', content: 'hi' }],
						conversationId: 'conv-1'
					})
				}),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(503);
		}
	});

	it('POST: should throw 400 when messages is not an array', async () => {
		const { POST } = await import('../../src/routes/api/chat/stream/+server');
		vi.mocked(getEnabledOpenAIKey).mockResolvedValue({ apiKey: 'key-1' } as any);
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({
						messages: 'not-an-array',
						conversationId: 'conv-1'
					})
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
