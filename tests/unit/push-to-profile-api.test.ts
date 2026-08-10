/**
 * Tests for POST /api/brand/push-to-profile
 * Covers pushing a text asset's value (or a specific revision) to the brand profile.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('$lib/services/onboarding', () => ({
	getBrandProfile: vi.fn()
}));

vi.mock('$lib/services/brand', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/services/brand')>();
	return {
		...actual,
		updateBrandFieldWithVersion: vi.fn()
	};
});

vi.mock('$lib/services/brand-assets', () => ({
	getBrandTextById: vi.fn()
}));

vi.mock('$lib/services/text-history', () => ({
	getRevisionById: vi.fn()
}));

import { getBrandProfile } from '$lib/services/onboarding';
import { updateBrandFieldWithVersion } from '$lib/services/brand';
import { getBrandTextById } from '$lib/services/brand-assets';
import { getRevisionById } from '$lib/services/text-history';

// ─── Helpers ────────────────────────────────────────────────────

const mockPlatform = { env: { DB: {} } };
const mockUser = { id: 'user-1', email: 'test@example.com' };

function makeRequest(body: Record<string, unknown>) {
	return {
		json: () => Promise.resolve(body)
	} as unknown as Request;
}

const mockProfile = {
	id: 'bp-1',
	userId: 'user-1',
	brandName: 'Test Brand',
	status: 'completed'
};

const mockTextAsset = {
	id: 'text-1',
	brandProfileId: 'bp-1',
	category: 'messaging',
	key: 'vision_statement',
	label: 'Vision Statement',
	value: 'To be the leading platform...',
	language: 'en',
	sortOrder: 0,
	createdAt: '2025-01-01T00:00:00Z',
	updatedAt: '2025-01-01T00:00:00Z'
};

const mockRevision = {
	id: 'rev-1',
	brandTextId: 'text-1',
	revisionNumber: 2,
	value: 'An older vision statement...',
	label: 'Vision Statement',
	changeSource: 'manual',
	userId: 'user-1',
	isCurrent: false,
	createdAt: '2024-01-01T00:00:00Z'
};

// ─── Tests ──────────────────────────────────────────────────────

describe('POST /api/brand/push-to-profile', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return 401 if not authenticated', async () => {
		const { POST } = await import('../../src/routes/api/brand/push-to-profile/+server');

		await expect(
			POST({
				request: makeRequest({ brandProfileId: 'bp-1', textId: 'text-1' }),
				platform: mockPlatform,
				locals: {}
			} as any)
		).rejects.toThrow();
	});

	it('should return 400 if brandProfileId is missing', async () => {
		const { POST } = await import('../../src/routes/api/brand/push-to-profile/+server');

		await expect(
			POST({
				request: makeRequest({ textId: 'text-1' }),
				platform: mockPlatform,
				locals: { user: mockUser }
			} as any)
		).rejects.toThrow();
	});

	it('should return 400 if textId is missing', async () => {
		const { POST } = await import('../../src/routes/api/brand/push-to-profile/+server');

		await expect(
			POST({
				request: makeRequest({ brandProfileId: 'bp-1' }),
				platform: mockPlatform,
				locals: { user: mockUser }
			} as any)
		).rejects.toThrow();
	});

	it('should return 404 if profile not found', async () => {
		const { POST } = await import('../../src/routes/api/brand/push-to-profile/+server');
		vi.mocked(getBrandProfile).mockResolvedValue(null);

		await expect(
			POST({
				request: makeRequest({ brandProfileId: 'bp-1', textId: 'text-1' }),
				platform: mockPlatform,
				locals: { user: mockUser }
			} as any)
		).rejects.toThrow();
	});

	it('should return 403 if profile belongs to different user', async () => {
		const { POST } = await import('../../src/routes/api/brand/push-to-profile/+server');
		vi.mocked(getBrandProfile).mockResolvedValue({ ...mockProfile, userId: 'other-user' } as any);

		await expect(
			POST({
				request: makeRequest({ brandProfileId: 'bp-1', textId: 'text-1' }),
				platform: mockPlatform,
				locals: { user: mockUser }
			} as any)
		).rejects.toThrow();
	});

	it('should return 404 if text asset not found', async () => {
		const { POST } = await import('../../src/routes/api/brand/push-to-profile/+server');
		vi.mocked(getBrandProfile).mockResolvedValue(mockProfile as any);
		vi.mocked(getBrandTextById).mockResolvedValue(null);

		await expect(
			POST({
				request: makeRequest({ brandProfileId: 'bp-1', textId: 'text-1' }),
				platform: mockPlatform,
				locals: { user: mockUser }
			} as any)
		).rejects.toThrow();
	});

	it('should return 400 if text asset has no profile field mapping', async () => {
		const { POST } = await import('../../src/routes/api/brand/push-to-profile/+server');
		vi.mocked(getBrandProfile).mockResolvedValue(mockProfile as any);
		vi.mocked(getBrandTextById).mockResolvedValue({
			...mockTextAsset,
			category: 'legal',
			key: 'copyright_notice'
		} as any);

		await expect(
			POST({
				request: makeRequest({ brandProfileId: 'bp-1', textId: 'text-1' }),
				platform: mockPlatform,
				locals: { user: mockUser }
			} as any)
		).rejects.toThrow();
	});

	it('should push text asset value to profile field', async () => {
		const { POST } = await import('../../src/routes/api/brand/push-to-profile/+server');
		vi.mocked(getBrandProfile)
			.mockResolvedValueOnce(mockProfile as any) // verification
			.mockResolvedValueOnce(mockProfile as any); // return updated
		vi.mocked(getBrandTextById).mockResolvedValue(mockTextAsset as any);
		vi.mocked(updateBrandFieldWithVersion).mockResolvedValue(undefined);

		const response = await POST({
			request: makeRequest({ brandProfileId: 'bp-1', textId: 'text-1' }),
			platform: mockPlatform,
			locals: { user: mockUser }
		} as any);

		const result = await response.json();
		expect(result.pushedField).toBe('visionStatement');
		expect(result.pushedLabel).toBe('Vision Statement');
		expect(result.value).toBe('To be the leading platform...');

		expect(updateBrandFieldWithVersion).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				profileId: 'bp-1',
				userId: 'user-1',
				fieldName: 'visionStatement',
				newValue: 'To be the leading platform...',
				changeSource: 'manual',
				syncTextAsset: false
			})
		);
	});

	it('should push a specific revision value when revisionId is provided', async () => {
		const { POST } = await import('../../src/routes/api/brand/push-to-profile/+server');
		vi.mocked(getBrandProfile)
			.mockResolvedValueOnce(mockProfile as any)
			.mockResolvedValueOnce(mockProfile as any);
		vi.mocked(getBrandTextById).mockResolvedValue(mockTextAsset as any);
		vi.mocked(getRevisionById).mockResolvedValue(mockRevision as any);
		vi.mocked(updateBrandFieldWithVersion).mockResolvedValue(undefined);

		const response = await POST({
			request: makeRequest({
				brandProfileId: 'bp-1',
				textId: 'text-1',
				revisionId: 'rev-1'
			}),
			platform: mockPlatform,
			locals: { user: mockUser }
		} as any);

		const result = await response.json();
		expect(result.value).toBe('An older vision statement...');

		expect(updateBrandFieldWithVersion).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				newValue: 'An older vision statement...',
				changeSource: 'manual',
				syncTextAsset: false,
				changeReason: 'Pushed from text revision'
			})
		);
	});

	it('should return 404 if revision not found', async () => {
		const { POST } = await import('../../src/routes/api/brand/push-to-profile/+server');
		vi.mocked(getBrandProfile).mockResolvedValue(mockProfile as any);
		vi.mocked(getBrandTextById).mockResolvedValue(mockTextAsset as any);
		vi.mocked(getRevisionById).mockResolvedValue(null);

		await expect(
			POST({
				request: makeRequest({
					brandProfileId: 'bp-1',
					textId: 'text-1',
					revisionId: 'rev-bad'
				}),
				platform: mockPlatform,
				locals: { user: mockUser }
			} as any)
		).rejects.toThrow();
	});

	it('should return 400 if revision belongs to different text asset', async () => {
		const { POST } = await import('../../src/routes/api/brand/push-to-profile/+server');
		vi.mocked(getBrandProfile).mockResolvedValue(mockProfile as any);
		vi.mocked(getBrandTextById).mockResolvedValue(mockTextAsset as any);
		vi.mocked(getRevisionById).mockResolvedValue({
			...mockRevision,
			brandTextId: 'text-999' // different text asset
		} as any);

		await expect(
			POST({
				request: makeRequest({
					brandProfileId: 'bp-1',
					textId: 'text-1',
					revisionId: 'rev-1'
				}),
				platform: mockPlatform,
				locals: { user: mockUser }
			} as any)
		).rejects.toThrow();
	});
});
