/**
 * Tests for Brand Profile/Profiles API endpoints and related routes
 * Covers:
 *   - GET /api/brand/profile
 *   - DELETE /api/brand/profile/[id]
 *   - GET /api/brand/profiles
 *   - POST /api/brand/profiles/duplicate
 *   - PATCH /api/brand/update-field
 *   - POST /api/brand/revert-field
 *   - GET /api/brand/text-suggestions
 *   - GET /api/brand/field-history/[profileId]/[fieldName]
 *   - GET /api/brand/assets/generate (GET only)
 *   - GET/POST /api/brand/assets/generate-text
 *   - load() for /brand/+page.server.ts
 *   - load() for /brand/[id]/+page.server.ts
 *   - load() for /onboarding/archive/+page.server.ts
 *   - POST /api/onboarding/attachments/upload
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('$lib/services/onboarding', () => ({
	getBrandProfileByUser: vi.fn(),
	getBrandProfile: vi.fn(),
	archiveBrandProfile: vi.fn()
}));

vi.mock('$lib/services/brand', () => ({
	getBrandFieldsSummary: vi.fn(),
	getBrandProfileForUser: vi.fn(),
	getAllBrandProfilesByUser: vi.fn(),
	duplicateBrandProfile: vi.fn(),
	updateBrandFieldWithVersion: vi.fn(),
	revertFieldToVersion: vi.fn(),
	getFieldHistory: vi.fn(),
	getTextSuggestionsForField: vi.fn(),
	FIELD_TO_TEXT_MAPPING: {
		tagline: { category: 'taglines', key: 'main' },
		missionStatement: { category: 'mission', key: 'main' }
	},
	getMatchingProfileField: vi.fn(),
	getProfileFieldValue: vi.fn()
}));

vi.mock('$lib/services/file-archive', () => ({
	createFileArchiveEntry: vi.fn()
}));

vi.mock('$lib/utils/attachments', () => ({
	getAttachmentType: vi.fn()
}));

vi.mock('$lib/services/ai-text-generation', () => ({
	buildBrandContextPrompt: vi.fn().mockReturnValue('system prompt'),
	buildTextGenerationPrompt: vi.fn().mockReturnValue('user prompt'),
	TEXT_GENERATION_PRESETS: {
		taglines: [{ key: 'main', label: 'Main Tagline' }],
		mission: [{ key: 'main', label: 'Mission Statement' }]
	}
}));

vi.mock('$lib/services/brand-assets', () => ({
	getBrandTexts: vi.fn().mockResolvedValue([])
}));

vi.mock('$lib/services/ai-media-generation', () => ({
	getAIGeneration: vi.fn(),
	getAIGenerationsByBrand: vi.fn(),
	generateImage: vi.fn(),
	generateAudio: vi.fn(),
	requestAIVideoGeneration: vi.fn(),
	updateAIGenerationStatus: vi.fn(),
	AI_IMAGE_MODELS: ['dall-e-3'],
	AI_AUDIO_MODELS: ['tts-1']
}));

vi.mock('$lib/services/media-history', () => ({
	logMediaActivity: vi.fn(),
	createMediaRevision: vi.fn()
}));

vi.mock('$lib/services/video-registry', () => ({
	getEnabledVideoKey: vi.fn()
}));

import {
	getBrandProfileByUser,
	getBrandProfile,
	archiveBrandProfile
} from '$lib/services/onboarding';

import {
	getBrandFieldsSummary,
	getBrandProfileForUser,
	getAllBrandProfilesByUser,
	duplicateBrandProfile,
	updateBrandFieldWithVersion,
	revertFieldToVersion,
	getFieldHistory,
	getTextSuggestionsForField
} from '$lib/services/brand';

import { createFileArchiveEntry } from '$lib/services/file-archive';
import { getAttachmentType } from '$lib/utils/attachments';
import { getAIGeneration, getAIGenerationsByBrand } from '$lib/services/ai-media-generation';

beforeEach(() => {
	vi.clearAllMocks();
});

// ─── Helpers ────────────────────────────────────────────────────

function makeUrl(path: string, params: Record<string, string> = {}) {
	const u = new URL(`http://localhost${path}`);
	for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
	return u;
}

const mockDB = {
	prepare: vi
		.fn()
		.mockReturnValue({ bind: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(null) }) })
};
/** A DB in which `user-1` owns the brand, for the routes that authorise one. */
const ownerDB = {
	prepare: vi.fn().mockImplementation((sql: string) => ({
		bind: vi.fn().mockReturnValue({
			first: vi
				.fn()
				.mockResolvedValue(sql.includes('FROM brand_profiles') ? { user_id: 'user-1' } : null)
		})
	}))
};
const mockKV = { get: vi.fn().mockResolvedValue(null) };
const mockBucket = { put: vi.fn(), get: vi.fn() };
const authedLocals = { user: { id: 'user-1' } };
const noUser = { user: null };

// ═══════════════════════════════════════════════════════════════
// GET /api/brand/profile
// ═══════════════════════════════════════════════════════════════
describe('GET /api/brand/profile', () => {
	it('should return 401 when not authenticated', async () => {
		const { GET } = await import('../../src/routes/api/brand/profile/+server');
		try {
			await GET({ locals: noUser, url: makeUrl('/x'), platform: { env: { DB: mockDB } } } as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return specific profile by id', async () => {
		const { GET } = await import('../../src/routes/api/brand/profile/+server');
		const profile = { id: 'bp-1', brandName: 'Test' };
		vi.mocked(getBrandProfileForUser).mockResolvedValue(profile as any);
		vi.mocked(getBrandFieldsSummary).mockReturnValue([{ section: 'identity', fields: [] }] as any);

		const res = await GET({
			locals: authedLocals,
			url: makeUrl('/x', { id: 'bp-1' }),
			platform: { env: { DB: mockDB } }
		} as any);
		const data = await res.json();
		expect(data.profile.id).toBe('bp-1');
		expect(data.sections).toBeDefined();
	});

	it('should return 404 when specific profile not found', async () => {
		const { GET } = await import('../../src/routes/api/brand/profile/+server');
		vi.mocked(getBrandProfileForUser).mockResolvedValue(null);
		try {
			await GET({
				locals: authedLocals,
				url: makeUrl('/x', { id: 'missing' }),
				platform: { env: { DB: mockDB } }
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});

	it('should return latest active profile when no id', async () => {
		const { GET } = await import('../../src/routes/api/brand/profile/+server');
		const profile = { id: 'bp-latest', brandName: 'Latest' };
		vi.mocked(getBrandProfileByUser).mockResolvedValue(profile as any);
		vi.mocked(getBrandFieldsSummary).mockReturnValue([]);

		const res = await GET({
			locals: authedLocals,
			url: makeUrl('/x'),
			platform: { env: { DB: mockDB } }
		} as any);
		const data = await res.json();
		expect(data.profile.id).toBe('bp-latest');
	});

	it('should return null profile when none exists', async () => {
		const { GET } = await import('../../src/routes/api/brand/profile/+server');
		vi.mocked(getBrandProfileByUser).mockResolvedValue(null);

		const res = await GET({
			locals: authedLocals,
			url: makeUrl('/x'),
			platform: { env: { DB: mockDB } }
		} as any);
		const data = await res.json();
		expect(data.profile).toBeNull();
		expect(data.sections).toEqual([]);
	});
});

// ═══════════════════════════════════════════════════════════════
// DELETE /api/brand/profile/[id]
// ═══════════════════════════════════════════════════════════════
describe('DELETE /api/brand/profile/[id]', () => {
	it('should return 401 when not authenticated', async () => {
		const { DELETE } = await import('../../src/routes/api/brand/profile/[id]/+server');
		try {
			await DELETE({
				locals: noUser,
				platform: { env: { DB: mockDB } },
				params: { id: 'bp-1' }
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 404 when profile not found', async () => {
		const { DELETE } = await import('../../src/routes/api/brand/profile/[id]/+server');
		vi.mocked(getBrandProfile).mockResolvedValue(null);
		try {
			await DELETE({
				locals: authedLocals,
				platform: { env: { DB: mockDB } },
				params: { id: 'missing' }
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});

	it('should return 403 when profile belongs to another user', async () => {
		const { DELETE } = await import('../../src/routes/api/brand/profile/[id]/+server');
		vi.mocked(getBrandProfile).mockResolvedValue({ id: 'bp-1', userId: 'other-user' } as any);
		try {
			await DELETE({
				locals: authedLocals,
				platform: { env: { DB: mockDB } },
				params: { id: 'bp-1' }
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(403);
		}
	});

	it('should archive profile successfully', async () => {
		const { DELETE } = await import('../../src/routes/api/brand/profile/[id]/+server');
		vi.mocked(getBrandProfile).mockResolvedValue({ id: 'bp-1', userId: 'user-1' } as any);
		vi.mocked(archiveBrandProfile).mockResolvedValue(undefined as any);

		const res = await DELETE({
			locals: authedLocals,
			platform: { env: { DB: mockDB } },
			params: { id: 'bp-1' }
		} as any);
		const data = await res.json();
		expect(data.success).toBe(true);
		expect(archiveBrandProfile).toHaveBeenCalledWith(mockDB, 'bp-1');
	});
});

// ═══════════════════════════════════════════════════════════════
// GET /api/brand/profiles
// ═══════════════════════════════════════════════════════════════
describe('GET /api/brand/profiles', () => {
	it('should return 401 when not authenticated', async () => {
		const { GET } = await import('../../src/routes/api/brand/profiles/+server');
		try {
			await GET({ locals: noUser, platform: { env: { DB: mockDB } } } as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return all profiles for user', async () => {
		const { GET } = await import('../../src/routes/api/brand/profiles/+server');
		vi.mocked(getAllBrandProfilesByUser).mockResolvedValue([
			{ id: 'bp-1', brandName: 'A' },
			{ id: 'bp-2', brandName: 'B' }
		] as any);

		const res = await GET({ locals: authedLocals, platform: { env: { DB: mockDB } } } as any);
		const data = await res.json();
		expect(data.profiles).toHaveLength(2);
	});
});

// ═══════════════════════════════════════════════════════════════
// POST /api/brand/profiles/duplicate
// ═══════════════════════════════════════════════════════════════
describe('POST /api/brand/profiles/duplicate', () => {
	it('should return 401 when not authenticated', async () => {
		const { POST } = await import('../../src/routes/api/brand/profiles/duplicate/+server');
		try {
			await POST({
				locals: noUser,
				platform: { env: { DB: mockDB } },
				request: new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) })
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 400 when sourceProfileId missing', async () => {
		const { POST } = await import('../../src/routes/api/brand/profiles/duplicate/+server');
		try {
			await POST({
				locals: authedLocals,
				platform: { env: { DB: mockDB } },
				request: new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) })
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should duplicate profile successfully', async () => {
		const { POST } = await import('../../src/routes/api/brand/profiles/duplicate/+server');
		vi.mocked(duplicateBrandProfile).mockResolvedValue({
			id: 'bp-dup',
			brandName: 'Copy of Test'
		} as any);

		const res = await POST({
			locals: authedLocals,
			platform: { env: { DB: mockDB } },
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ sourceProfileId: 'bp-1' })
			})
		} as any);
		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data.profile.id).toBe('bp-dup');
	});

	it('should return 404 when source profile not found', async () => {
		const { POST } = await import('../../src/routes/api/brand/profiles/duplicate/+server');
		vi.mocked(duplicateBrandProfile).mockRejectedValue(new Error('Source profile not found'));

		try {
			await POST({
				locals: authedLocals,
				platform: { env: { DB: mockDB } },
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ sourceProfileId: 'missing' })
				})
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});

	it('should rethrow non-NotFound errors', async () => {
		const { POST } = await import('../../src/routes/api/brand/profiles/duplicate/+server');
		vi.mocked(duplicateBrandProfile).mockRejectedValue(new Error('DB connection failed'));

		await expect(
			POST({
				locals: authedLocals,
				platform: { env: { DB: mockDB } },
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ sourceProfileId: 'bp-1' })
				})
			} as any)
		).rejects.toThrow('DB connection failed');
	});
});

// ═══════════════════════════════════════════════════════════════
// PATCH /api/brand/update-field
// ═══════════════════════════════════════════════════════════════
describe('PATCH /api/brand/update-field', () => {
	it('should return 401 when not authenticated', async () => {
		const { PATCH } = await import('../../src/routes/api/brand/update-field/+server');
		try {
			await PATCH({
				locals: noUser,
				platform: { env: { DB: mockDB } },
				request: new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({}) })
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 400 when profileId or fieldName missing', async () => {
		const { PATCH } = await import('../../src/routes/api/brand/update-field/+server');
		try {
			await PATCH({
				locals: authedLocals,
				platform: { env: { DB: mockDB } },
				request: new Request('http://localhost', {
					method: 'PATCH',
					body: JSON.stringify({ profileId: 'bp-1' })
				})
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return 404 when profile not found', async () => {
		const { PATCH } = await import('../../src/routes/api/brand/update-field/+server');
		vi.mocked(getBrandProfile).mockResolvedValue(null);
		try {
			await PATCH({
				locals: authedLocals,
				platform: { env: { DB: mockDB } },
				request: new Request('http://localhost', {
					method: 'PATCH',
					body: JSON.stringify({ profileId: 'missing', fieldName: 'tagline', newValue: 'x' })
				})
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});

	it('should return 403 when profile belongs to another user', async () => {
		const { PATCH } = await import('../../src/routes/api/brand/update-field/+server');
		vi.mocked(getBrandProfile).mockResolvedValue({ id: 'bp-1', userId: 'other' } as any);
		try {
			await PATCH({
				locals: authedLocals,
				platform: { env: { DB: mockDB } },
				request: new Request('http://localhost', {
					method: 'PATCH',
					body: JSON.stringify({ profileId: 'bp-1', fieldName: 'tagline', newValue: 'x' })
				})
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(403);
		}
	});

	it('should update field and return updated profile', async () => {
		const { PATCH } = await import('../../src/routes/api/brand/update-field/+server');
		vi.mocked(getBrandProfile)
			.mockResolvedValueOnce({ id: 'bp-1', userId: 'user-1' } as any)
			.mockResolvedValueOnce({ id: 'bp-1', userId: 'user-1', tagline: 'New' } as any);
		vi.mocked(updateBrandFieldWithVersion).mockResolvedValue(undefined);

		const res = await PATCH({
			locals: authedLocals,
			platform: { env: { DB: mockDB } },
			request: new Request('http://localhost', {
				method: 'PATCH',
				body: JSON.stringify({
					profileId: 'bp-1',
					fieldName: 'tagline',
					newValue: 'New',
					changeSource: 'manual',
					changeReason: 'Updated by user'
				})
			})
		} as any);
		const data = await res.json();
		expect(data.profile.tagline).toBe('New');
		expect(updateBrandFieldWithVersion).toHaveBeenCalledWith(
			mockDB,
			expect.objectContaining({
				fieldName: 'tagline',
				newValue: 'New',
				changeSource: 'manual'
			})
		);
	});

	it('should handle null newValue', async () => {
		const { PATCH } = await import('../../src/routes/api/brand/update-field/+server');
		vi.mocked(getBrandProfile)
			.mockResolvedValueOnce({ id: 'bp-1', userId: 'user-1' } as any)
			.mockResolvedValueOnce({ id: 'bp-1', userId: 'user-1', tagline: null } as any);
		vi.mocked(updateBrandFieldWithVersion).mockResolvedValue(undefined);

		const res = await PATCH({
			locals: authedLocals,
			platform: { env: { DB: mockDB } },
			request: new Request('http://localhost', {
				method: 'PATCH',
				body: JSON.stringify({ profileId: 'bp-1', fieldName: 'tagline' })
			})
		} as any);
		const data = await res.json();
		expect(data.profile).toBeDefined();
		expect(updateBrandFieldWithVersion).toHaveBeenCalledWith(
			mockDB,
			expect.objectContaining({
				newValue: null,
				changeSource: 'manual'
			})
		);
	});
});

// ═══════════════════════════════════════════════════════════════
// POST /api/brand/revert-field
// ═══════════════════════════════════════════════════════════════
describe('POST /api/brand/revert-field', () => {
	it('should return 401 when not authenticated', async () => {
		const { POST } = await import('../../src/routes/api/brand/revert-field/+server');
		try {
			await POST({
				locals: noUser,
				platform: { env: { DB: mockDB } },
				request: new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) })
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 400 when required params missing', async () => {
		const { POST } = await import('../../src/routes/api/brand/revert-field/+server');
		try {
			await POST({
				locals: authedLocals,
				platform: { env: { DB: mockDB } },
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ profileId: 'bp-1', fieldName: 'tagline' })
				})
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return 404 when profile not found', async () => {
		const { POST } = await import('../../src/routes/api/brand/revert-field/+server');
		vi.mocked(getBrandProfile).mockResolvedValue(null);
		try {
			await POST({
				locals: authedLocals,
				platform: { env: { DB: mockDB } },
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ profileId: 'missing', fieldName: 'tagline', versionId: 'v1' })
				})
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});

	it('should return 403 when profile belongs to another user', async () => {
		const { POST } = await import('../../src/routes/api/brand/revert-field/+server');
		vi.mocked(getBrandProfile).mockResolvedValue({ id: 'bp-1', userId: 'other' } as any);
		try {
			await POST({
				locals: authedLocals,
				platform: { env: { DB: mockDB } },
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ profileId: 'bp-1', fieldName: 'tagline', versionId: 'v1' })
				})
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(403);
		}
	});

	it('should return 404 when version not found', async () => {
		const { POST } = await import('../../src/routes/api/brand/revert-field/+server');
		vi.mocked(getBrandProfile).mockResolvedValue({ id: 'bp-1', userId: 'user-1' } as any);
		vi.mocked(revertFieldToVersion).mockRejectedValue(new Error('Version not found'));
		try {
			await POST({
				locals: authedLocals,
				platform: { env: { DB: mockDB } },
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ profileId: 'bp-1', fieldName: 'tagline', versionId: 'bad' })
				})
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});

	it('should revert field and return updated profile', async () => {
		const { POST } = await import('../../src/routes/api/brand/revert-field/+server');
		vi.mocked(getBrandProfile)
			.mockResolvedValueOnce({ id: 'bp-1', userId: 'user-1' } as any)
			.mockResolvedValueOnce({ id: 'bp-1', userId: 'user-1', tagline: 'Old Value' } as any);
		vi.mocked(revertFieldToVersion).mockResolvedValue(undefined);

		const res = await POST({
			locals: authedLocals,
			platform: { env: { DB: mockDB } },
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({ profileId: 'bp-1', fieldName: 'tagline', versionId: 'v1' })
			})
		} as any);
		const data = await res.json();
		expect(data.profile.tagline).toBe('Old Value');
	});

	it('should rethrow non-VersionNotFound errors', async () => {
		const { POST } = await import('../../src/routes/api/brand/revert-field/+server');
		vi.mocked(getBrandProfile).mockResolvedValue({ id: 'bp-1', userId: 'user-1' } as any);
		vi.mocked(revertFieldToVersion).mockRejectedValue(new Error('DB crashed'));

		await expect(
			POST({
				locals: authedLocals,
				platform: { env: { DB: mockDB } },
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ profileId: 'bp-1', fieldName: 'tagline', versionId: 'v1' })
				})
			} as any)
		).rejects.toThrow('DB crashed');
	});
});

// ═══════════════════════════════════════════════════════════════
// GET /api/brand/text-suggestions
// ═══════════════════════════════════════════════════════════════
describe('GET /api/brand/text-suggestions', () => {
	it('should return 401 when not authenticated', async () => {
		const { GET } = await import('../../src/routes/api/brand/text-suggestions/+server');
		try {
			await GET({ url: makeUrl('/x'), platform: { env: { DB: mockDB } }, locals: noUser } as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 400 when brandProfileId missing', async () => {
		const { GET } = await import('../../src/routes/api/brand/text-suggestions/+server');
		try {
			await GET({
				url: makeUrl('/x', { fieldName: 'tagline' }),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return 400 when fieldName missing', async () => {
		const { GET } = await import('../../src/routes/api/brand/text-suggestions/+server');
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

	it('should return suggestions when field has mapping', async () => {
		const { GET } = await import('../../src/routes/api/brand/text-suggestions/+server');
		vi.mocked(getTextSuggestionsForField).mockResolvedValue([{ value: 'Suggestion 1' }] as any);

		const res = await GET({
			url: makeUrl('/x', { brandProfileId: 'bp-1', fieldName: 'tagline' }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.hasMappedTexts).toBe(true);
		expect(data.suggestions).toHaveLength(1);
	});

	it('should return empty when field has no mapping', async () => {
		const { GET } = await import('../../src/routes/api/brand/text-suggestions/+server');
		const res = await GET({
			url: makeUrl('/x', { brandProfileId: 'bp-1', fieldName: 'unknownField' }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.hasMappedTexts).toBe(false);
		expect(data.suggestions).toEqual([]);
	});
});

// ═══════════════════════════════════════════════════════════════
// GET /api/brand/field-history/[profileId]/[fieldName]
// ═══════════════════════════════════════════════════════════════
describe('GET /api/brand/field-history/[profileId]/[fieldName]', () => {
	it('should return 401 when not authenticated', async () => {
		const { GET } = await import(
			'../../src/routes/api/brand/field-history/[profileId]/[fieldName]/+server'
		);
		try {
			await GET({
				locals: noUser,
				platform: { env: { DB: mockDB } },
				params: { profileId: 'bp-1', fieldName: 'tagline' }
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 404 when profile not found', async () => {
		const { GET } = await import(
			'../../src/routes/api/brand/field-history/[profileId]/[fieldName]/+server'
		);
		vi.mocked(getBrandProfile).mockResolvedValue(null);
		try {
			await GET({
				locals: authedLocals,
				platform: { env: { DB: mockDB } },
				params: { profileId: 'missing', fieldName: 'tagline' }
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});

	it('should return 403 when profile belongs to another user', async () => {
		const { GET } = await import(
			'../../src/routes/api/brand/field-history/[profileId]/[fieldName]/+server'
		);
		vi.mocked(getBrandProfile).mockResolvedValue({ id: 'bp-1', userId: 'other' } as any);
		try {
			await GET({
				locals: authedLocals,
				platform: { env: { DB: mockDB } },
				params: { profileId: 'bp-1', fieldName: 'tagline' }
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(403);
		}
	});

	it('should return field history', async () => {
		const { GET } = await import(
			'../../src/routes/api/brand/field-history/[profileId]/[fieldName]/+server'
		);
		vi.mocked(getBrandProfile).mockResolvedValue({ id: 'bp-1', userId: 'user-1' } as any);
		vi.mocked(getFieldHistory).mockResolvedValue([
			{ id: 'v1', fieldName: 'tagline', newValue: 'First', versionNumber: 1 }
		] as any);

		const res = await GET({
			locals: authedLocals,
			platform: { env: { DB: mockDB } },
			params: { profileId: 'bp-1', fieldName: 'tagline' }
		} as any);
		const data = await res.json();
		expect(data.history).toHaveLength(1);
		expect(data.history[0].fieldName).toBe('tagline');
	});
});

// ═══════════════════════════════════════════════════════════════
// GET /api/brand/assets/generate
// ═══════════════════════════════════════════════════════════════
describe('GET /api/brand/assets/generate', () => {
	it('should return 401 when not authenticated', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/generate/+server');
		try {
			await GET({ url: makeUrl('/x'), platform: { env: { DB: mockDB } }, locals: noUser } as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return specific generation by id', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/generate/+server');
		vi.mocked(getAIGeneration).mockResolvedValue({
			id: 'gen-1',
			status: 'complete',
			brandProfileId: 'bp-1'
		} as any);

		const res = await GET({
			url: makeUrl('/x', { id: 'gen-1' }),
			// The generation's brand is authorised before it is returned, so the caller has
			// to actually own it.
			platform: { env: { DB: ownerDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.generation.id).toBe('gen-1');
	});

	it('should return 404 when generation not found', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/generate/+server');
		vi.mocked(getAIGeneration).mockResolvedValue(null);
		try {
			await GET({
				url: makeUrl('/x', { id: 'missing' }),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});

	it('should return 400 when brandProfileId missing and no id', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/generate/+server');
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

	it('should list generations by brand', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/generate/+server');
		vi.mocked(getAIGenerationsByBrand).mockResolvedValue([{ id: 'g1' }] as any);

		const res = await GET({
			url: makeUrl('/x', { brandProfileId: 'bp-1', type: 'image' }),
			platform: { env: { DB: ownerDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.generations).toHaveLength(1);
	});
});

// ═══════════════════════════════════════════════════════════════
// PUT /api/brand/assets/generate (get available models)
// ═══════════════════════════════════════════════════════════════
describe('PUT /api/brand/assets/generate', () => {
	it('should return 401 when not authenticated', async () => {
		const { PUT } = await import('../../src/routes/api/brand/assets/generate/+server');
		try {
			await PUT({ platform: { env: { DB: mockDB } }, locals: noUser } as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return available models', async () => {
		const { PUT } = await import('../../src/routes/api/brand/assets/generate/+server');
		const res = await PUT({ platform: { env: { DB: mockDB } }, locals: authedLocals } as any);
		const data = await res.json();
		expect(data.imageModels).toBeDefined();
		expect(data.audioModels).toBeDefined();
	});
});

// ═══════════════════════════════════════════════════════════════
// GET/POST /api/brand/assets/generate-text
// ═══════════════════════════════════════════════════════════════
describe('GET /api/brand/assets/generate-text', () => {
	it('should return 401 when not authenticated', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		try {
			await GET({ url: makeUrl('/x'), locals: noUser } as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return presets for specific category', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		const res = await GET({
			url: makeUrl('/x', { category: 'taglines' }),
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.presets).toBeDefined();
	});

	it('should return all presets when no category', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		const res = await GET({
			url: makeUrl('/x'),
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.presets).toBeDefined();
	});
});

describe('POST /api/brand/assets/generate-text', () => {
	it('should return 401 when not authenticated', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		try {
			await POST({
				request: new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) }),
				platform: { env: { DB: mockDB, KV: mockKV } },
				locals: noUser
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 500 when platform not available', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		try {
			await POST({
				request: new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) }),
				platform: { env: {} },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('should return 400 when brandProfileId missing', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ category: 'taglines', key: 'main', label: 'Tagline' })
				}),
				platform: { env: { DB: mockDB, KV: mockKV } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return 404 when brand profile not found', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		vi.mocked(getBrandProfileForUser).mockResolvedValue(null);
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({
						brandProfileId: 'bp-1',
						category: 'taglines',
						key: 'main',
						label: 'Tagline'
					})
				}),
				platform: { env: { DB: mockDB, KV: mockKV } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});

	it('should return 400 when no OpenAI key configured', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		vi.mocked(getBrandProfileForUser).mockResolvedValue({ id: 'bp-1', brandName: 'Test' } as any);
		// KV.get returns null → no API key

		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({
						brandProfileId: 'bp-1',
						category: 'taglines',
						key: 'main',
						label: 'Tagline'
					})
				}),
				platform: { env: { DB: mockDB, KV: mockKV } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// load() for /brand/+page.server.ts
// ═══════════════════════════════════════════════════════════════
describe('load() for /brand', () => {
	it('should redirect to login when not authenticated', async () => {
		const { load } = await import('../../src/routes/brand/+page.server');
		try {
			await load({ platform: { env: { KV: mockKV } }, locals: noUser } as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(302);
			expect(err.location).toBe('/auth/login?redirect=/brand');
		}
	});

	it('should return userId and hasAIProviders=false when no keys', async () => {
		const { load } = await import('../../src/routes/brand/+page.server');
		const result = (await load({
			platform: { env: { KV: mockKV } },
			locals: authedLocals
		} as any)) as Record<string, any>;
		expect(result.userId).toBe('user-1');
		expect(result.hasAIProviders).toBe(false);
	});

	it('should return hasAIProviders=true when OpenAI key exists', async () => {
		const { load } = await import('../../src/routes/brand/+page.server');
		const kvWithKeys = {
			get: vi
				.fn()
				.mockResolvedValueOnce(JSON.stringify(['key-1']))
				.mockResolvedValueOnce(
					JSON.stringify({ enabled: true, provider: 'openai', apiKey: 'sk-xxx' })
				)
		};
		const result = (await load({
			platform: { env: { KV: kvWithKeys } },
			locals: authedLocals
		} as any)) as Record<string, any>;
		expect(result.hasAIProviders).toBe(true);
	});

	it('should handle KV errors gracefully', async () => {
		const { load } = await import('../../src/routes/brand/+page.server');
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const kvError = { get: vi.fn().mockRejectedValue(new Error('KV failed')) };
		const result = (await load({
			platform: { env: { KV: kvError } },
			locals: authedLocals
		} as any)) as Record<string, any>;
		expect(result.hasAIProviders).toBe(false);
		errorSpy.mockRestore();
	});
});

// ═══════════════════════════════════════════════════════════════
// load() for /brand/[id]/+page.server.ts
// ═══════════════════════════════════════════════════════════════
describe('load() for /brand/[id]', () => {
	it('should redirect to login when not authenticated', async () => {
		const { load } = await import('../../src/routes/brand/[id]/+page.server');
		try {
			await load({
				platform: { env: { KV: mockKV } },
				locals: noUser,
				params: { id: 'bp-1' }
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(302);
			expect(err.location).toBe('/auth/login?redirect=/brand/bp-1');
		}
	});

	it('should return userId, brandId and hasAIProviders', async () => {
		const { load } = await import('../../src/routes/brand/[id]/+page.server');
		const result = (await load({
			platform: { env: { KV: mockKV } },
			locals: authedLocals,
			params: { id: 'bp-1' }
		} as any)) as Record<string, any>;
		expect(result.userId).toBe('user-1');
		expect(result.brandId).toBe('bp-1');
		expect(result.hasAIProviders).toBe(false);
	});

	it('should detect AI providers via KV', async () => {
		const { load } = await import('../../src/routes/brand/[id]/+page.server');
		const kvWithKeys = {
			get: vi
				.fn()
				.mockResolvedValueOnce(JSON.stringify(['key-1']))
				.mockResolvedValueOnce(
					JSON.stringify({ enabled: true, provider: 'openai', apiKey: 'sk-x' })
				)
		};
		const result = (await load({
			platform: { env: { KV: kvWithKeys } },
			locals: authedLocals,
			params: { id: 'bp-1' }
		} as any)) as Record<string, any>;
		expect(result.hasAIProviders).toBe(true);
	});
});

// ═══════════════════════════════════════════════════════════════
// load() for /onboarding/archive/+page.server.ts
// ═══════════════════════════════════════════════════════════════
describe('load() for /onboarding/archive', () => {
	it('should redirect to login when not authenticated', async () => {
		const { load } = await import('../../src/routes/onboarding/archive/+page.server');
		try {
			await load({
				platform: { env: { DB: mockDB } },
				locals: noUser,
				url: makeUrl('/onboarding/archive')
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(302);
			expect(err.location).toBe('/auth/login?redirect=/onboarding/archive');
		}
	});

	it('should use brand query param when provided', async () => {
		const { load } = await import('../../src/routes/onboarding/archive/+page.server');
		const result = (await load({
			platform: { env: { DB: mockDB } },
			locals: authedLocals,
			url: makeUrl('/onboarding/archive', { brand: 'bp-1' })
		} as any)) as Record<string, any>;
		expect(result.brandProfileId).toBe('bp-1');
	});

	it('should find active profile from DB when no brand param', async () => {
		const { load } = await import('../../src/routes/onboarding/archive/+page.server');
		const dbWithProfile = {
			prepare: vi.fn().mockReturnValue({
				bind: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue({ id: 'bp-found' })
				})
			})
		};
		const result = (await load({
			platform: { env: { DB: dbWithProfile } },
			locals: authedLocals,
			url: makeUrl('/onboarding/archive')
		} as any)) as Record<string, any>;
		expect(result.brandProfileId).toBe('bp-found');
	});

	it('should return null brandProfileId when no profile exists', async () => {
		const { load } = await import('../../src/routes/onboarding/archive/+page.server');
		const result = (await load({
			platform: { env: { DB: mockDB } },
			locals: authedLocals,
			url: makeUrl('/onboarding/archive')
		} as any)) as Record<string, any>;
		expect(result.brandProfileId).toBeNull();
	});

	it('should handle DB errors gracefully', async () => {
		const { load } = await import('../../src/routes/onboarding/archive/+page.server');
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const dbError = {
			prepare: vi.fn().mockReturnValue({
				bind: vi.fn().mockReturnValue({
					first: vi.fn().mockRejectedValue(new Error('DB error'))
				})
			})
		};
		const result = (await load({
			platform: { env: { DB: dbError } },
			locals: authedLocals,
			url: makeUrl('/onboarding/archive')
		} as any)) as Record<string, any>;
		expect(result.brandProfileId).toBeNull();
		errorSpy.mockRestore();
	});
});

// ═══════════════════════════════════════════════════════════════
// POST /api/onboarding/attachments/upload
// ═══════════════════════════════════════════════════════════════
describe('POST /api/onboarding/attachments/upload', () => {
	it('should return 401 when not authenticated', async () => {
		const { POST } = await import('../../src/routes/api/onboarding/attachments/upload/+server');
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
		const { POST } = await import('../../src/routes/api/onboarding/attachments/upload/+server');
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

	it('should return 400 when no file provided', async () => {
		const { POST } = await import('../../src/routes/api/onboarding/attachments/upload/+server');
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
		const { POST } = await import('../../src/routes/api/onboarding/attachments/upload/+server');
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

	it('should return 400 when file type unsupported', async () => {
		const { POST } = await import('../../src/routes/api/onboarding/attachments/upload/+server');
		vi.mocked(getAttachmentType).mockReturnValue(null as any);
		const fd = new FormData();
		fd.set('file', new File(['x'], 'test.xyz', { type: 'application/xyz' }));
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

	it('should upload file and create archive entry', async () => {
		const { POST } = await import('../../src/routes/api/onboarding/attachments/upload/+server');
		vi.mocked(getAttachmentType).mockReturnValue('image');
		vi.mocked(createFileArchiveEntry).mockResolvedValue({
			id: 'fa-1',
			r2Key: 'archive/bp-1/onboarding/images/file.png',
			fileName: 'logo.png',
			mimeType: 'image/png',
			fileSize: 1000,
			fileType: 'image'
		} as any);
		mockBucket.put.mockResolvedValue(undefined);

		const fd = new FormData();
		fd.set('file', new File(['image data'], 'logo.png', { type: 'image/png' }));
		fd.set('brandProfileId', 'bp-1');
		fd.set('onboardingStep', 'visual_identity');

		const res = await POST({
			request: { formData: () => Promise.resolve(fd) },
			platform: { env: { DB: mockDB, BUCKET: mockBucket } },
			locals: authedLocals
		} as any);
		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data.id).toBe('fa-1');
		expect(data.url).toContain('/api/archive/file?key=');
		expect(mockBucket.put).toHaveBeenCalled();
		expect(createFileArchiveEntry).toHaveBeenCalledWith(
			mockDB,
			expect.objectContaining({
				brandProfileId: 'bp-1',
				source: 'user_upload',
				context: 'onboarding',
				onboardingStep: 'visual_identity'
			})
		);
	});

	it('should return 400 when file exceeds size limit', async () => {
		const { POST } = await import('../../src/routes/api/onboarding/attachments/upload/+server');
		const fd = new FormData();
		// Create File mock with size exceeding limit
		const bigFile = new File(['x'], 'big.png', { type: 'image/png' });
		Object.defineProperty(bigFile, 'size', { value: 101 * 1024 * 1024 });
		fd.set('file', bigFile);
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
});
