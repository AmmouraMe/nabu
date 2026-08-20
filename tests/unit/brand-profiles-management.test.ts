/**
 * Tests for Brand Profile management endpoints
 * Covers:
 *   - GET /api/brand/profiles/archived
 *   - POST /api/brand/profiles/reorder
 *   - DELETE /api/brand/profile/[id] (archive)
 *   - PATCH /api/brand/profile/[id] (unarchive)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/services/brand', () => ({
	getArchivedBrandProfilesByUser: vi.fn()
}));

vi.mock('$lib/services/onboarding', () => ({
	getBrandProfile: vi.fn(),
	archiveBrandProfile: vi.fn(),
	unarchiveBrandProfile: vi.fn()
}));

describe('Brand Profiles Management API', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	// ─── GET /api/brand/profiles/archived ────────────────

	describe('GET /api/brand/profiles/archived', () => {
		it('should return 401 when user is not authenticated', async () => {
			const { GET } = await import('../../src/routes/api/brand/profiles/archived/+server');

			await expect(GET({ locals: {}, platform: {} } as any)).rejects.toThrow();
		});

		it('should return archived profiles for the user', async () => {
			const { getArchivedBrandProfilesByUser } = await import('$lib/services/brand');
			const mockProfiles = [
				{ id: 'p1', brandName: 'Archived Brand 1', status: 'archived' },
				{ id: 'p2', brandName: 'Archived Brand 2', status: 'archived' }
			];
			vi.mocked(getArchivedBrandProfilesByUser).mockResolvedValue(mockProfiles as any);

			const mockDB = {};
			const { GET } = await import('../../src/routes/api/brand/profiles/archived/+server');

			const response = await GET({
				locals: { user: { id: 'user-1' } },
				platform: { env: { DB: mockDB } }
			} as any);

			const data = await response.json();
			expect(data.profiles).toEqual(mockProfiles);
			expect(getArchivedBrandProfilesByUser).toHaveBeenCalledWith(mockDB, 'user-1');
		});
	});

	// ─── POST /api/brand/profiles/reorder ────────────────

	describe('POST /api/brand/profiles/reorder', () => {
		it('should return 401 when user is not authenticated', async () => {
			const { POST } = await import('../../src/routes/api/brand/profiles/reorder/+server');

			await expect(
				POST({
					locals: {},
					request: new Request('http://localhost', {
						method: 'POST',
						body: JSON.stringify({ orderedIds: ['a'] })
					})
				} as any)
			).rejects.toThrow();
		});

		it('should return 400 when orderedIds is not an array', async () => {
			const { POST } = await import('../../src/routes/api/brand/profiles/reorder/+server');

			await expect(
				POST({
					locals: { user: { id: 'user-1' } },
					request: new Request('http://localhost', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ orderedIds: 'invalid' })
					}),
					platform: { env: { DB: {} } }
				} as any)
			).rejects.toThrow();
		});

		it('should return 400 when orderedIds is empty', async () => {
			const { POST } = await import('../../src/routes/api/brand/profiles/reorder/+server');

			await expect(
				POST({
					locals: { user: { id: 'user-1' } },
					request: new Request('http://localhost', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ orderedIds: [] })
					}),
					platform: { env: { DB: {} } }
				} as any)
			).rejects.toThrow();
		});

		it('should reorder profiles with batch update', async () => {
			const mockBatch = vi.fn().mockResolvedValue([]);
			const mockBind = vi.fn().mockReturnValue({});
			const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });

			const mockDB = {
				prepare: mockPrepare,
				batch: mockBatch
			};

			const { POST } = await import('../../src/routes/api/brand/profiles/reorder/+server');

			const response = await POST({
				locals: { user: { id: 'user-1' } },
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ orderedIds: ['p1', 'p2', 'p3'] })
				}),
				platform: { env: { DB: mockDB } }
			} as any);

			const data = await response.json();
			expect(data.success).toBe(true);
			expect(mockPrepare).toHaveBeenCalledTimes(3);
			expect(mockBatch).toHaveBeenCalledTimes(1);
		});
	});

	// ─── DELETE /api/brand/profile/[id] ────────────────

	describe('DELETE /api/brand/profile/[id]', () => {
		it('should return 401 when not authenticated', async () => {
			const { DELETE } = await import('../../src/routes/api/brand/profile/[id]/+server');

			await expect(
				DELETE({ locals: {}, params: { id: 'p1' }, platform: {} } as any)
			).rejects.toThrow();
		});

		it('should return 404 when profile not found', async () => {
			const { getBrandProfile } = await import('$lib/services/onboarding');
			vi.mocked(getBrandProfile).mockResolvedValue(null);

			const { DELETE } = await import('../../src/routes/api/brand/profile/[id]/+server');

			await expect(
				DELETE({
					locals: { user: { id: 'user-1' } },
					params: { id: 'nonexistent' },
					platform: { env: { DB: {} } }
				} as any)
			).rejects.toThrow();
		});

		it('should return 403 when profile belongs to another user', async () => {
			const { getBrandProfile } = await import('$lib/services/onboarding');
			vi.mocked(getBrandProfile).mockResolvedValue({
				id: 'p1',
				userId: 'other-user'
			} as any);

			const { DELETE } = await import('../../src/routes/api/brand/profile/[id]/+server');

			await expect(
				DELETE({
					locals: { user: { id: 'user-1' } },
					params: { id: 'p1' },
					platform: { env: { DB: {} } }
				} as any)
			).rejects.toThrow();
		});

		it('should archive profile successfully', async () => {
			const { getBrandProfile, archiveBrandProfile } = await import('$lib/services/onboarding');
			vi.mocked(getBrandProfile).mockResolvedValue({
				id: 'p1',
				userId: 'user-1'
			} as any);
			vi.mocked(archiveBrandProfile).mockResolvedValue(undefined);

			const { DELETE } = await import('../../src/routes/api/brand/profile/[id]/+server');

			const response = await DELETE({
				locals: { user: { id: 'user-1' } },
				params: { id: 'p1' },
				platform: { env: { DB: {} } }
			} as any);

			const data = await response.json();
			expect(data.success).toBe(true);
			expect(archiveBrandProfile).toHaveBeenCalledWith({}, 'p1');
		});
	});

	// ─── PATCH /api/brand/profile/[id] ────────────────

	describe('PATCH /api/brand/profile/[id]', () => {
		it('should return 401 when not authenticated', async () => {
			const { PATCH } = await import('../../src/routes/api/brand/profile/[id]/+server');

			await expect(
				PATCH({
					locals: {},
					params: { id: 'p1' },
					request: new Request('http://localhost', {
						method: 'PATCH',
						body: JSON.stringify({ action: 'unarchive' })
					})
				} as any)
			).rejects.toThrow();
		});

		it('should return 404 when profile not found', async () => {
			const { getBrandProfile } = await import('$lib/services/onboarding');
			vi.mocked(getBrandProfile).mockResolvedValue(null);

			const { PATCH } = await import('../../src/routes/api/brand/profile/[id]/+server');

			await expect(
				PATCH({
					locals: { user: { id: 'user-1' } },
					params: { id: 'nonexistent' },
					request: new Request('http://localhost', {
						method: 'PATCH',
						body: JSON.stringify({ action: 'unarchive' })
					}),
					platform: { env: { DB: {} } }
				} as any)
			).rejects.toThrow();
		});

		it('should return 403 when profile belongs to another user', async () => {
			const { getBrandProfile } = await import('$lib/services/onboarding');
			vi.mocked(getBrandProfile).mockResolvedValue({
				id: 'p1',
				userId: 'other-user',
				status: 'archived'
			} as any);

			const { PATCH } = await import('../../src/routes/api/brand/profile/[id]/+server');

			await expect(
				PATCH({
					locals: { user: { id: 'user-1' } },
					params: { id: 'p1' },
					request: new Request('http://localhost', {
						method: 'PATCH',
						body: JSON.stringify({ action: 'unarchive' })
					}),
					platform: { env: { DB: {} } }
				} as any)
			).rejects.toThrow();
		});

		it('should return 400 when profile is not archived', async () => {
			const { getBrandProfile } = await import('$lib/services/onboarding');
			vi.mocked(getBrandProfile).mockResolvedValue({
				id: 'p1',
				userId: 'user-1',
				status: 'active'
			} as any);

			const { PATCH } = await import('../../src/routes/api/brand/profile/[id]/+server');

			await expect(
				PATCH({
					locals: { user: { id: 'user-1' } },
					params: { id: 'p1' },
					request: new Request('http://localhost', {
						method: 'PATCH',
						body: JSON.stringify({ action: 'unarchive' })
					}),
					platform: { env: { DB: {} } }
				} as any)
			).rejects.toThrow();
		});

		it('should unarchive profile successfully', async () => {
			const { getBrandProfile, unarchiveBrandProfile } = await import('$lib/services/onboarding');
			vi.mocked(getBrandProfile).mockResolvedValue({
				id: 'p1',
				userId: 'user-1',
				status: 'archived'
			} as any);
			vi.mocked(unarchiveBrandProfile).mockResolvedValue(undefined);

			const { PATCH } = await import('../../src/routes/api/brand/profile/[id]/+server');

			const response = await PATCH({
				locals: { user: { id: 'user-1' } },
				params: { id: 'p1' },
				request: new Request('http://localhost', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'unarchive' })
				}),
				platform: { env: { DB: {} } }
			} as any);

			const data = await response.json();
			expect(data.success).toBe(true);
		});

		it('should return 400 for invalid action', async () => {
			const { getBrandProfile } = await import('$lib/services/onboarding');
			vi.mocked(getBrandProfile).mockResolvedValue({
				id: 'p1',
				userId: 'user-1',
				status: 'active'
			} as any);

			const { PATCH } = await import('../../src/routes/api/brand/profile/[id]/+server');

			await expect(
				PATCH({
					locals: { user: { id: 'user-1' } },
					params: { id: 'p1' },
					request: new Request('http://localhost', {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ action: 'unknown' })
					}),
					platform: { env: { DB: {} } }
				} as any)
			).rejects.toThrow();
		});
	});
});
