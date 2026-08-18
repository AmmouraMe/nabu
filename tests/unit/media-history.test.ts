/**
 * Tests for Media Activity Log & Revision Control Service
 * TDD: Tests written first, then implementation
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	logMediaActivity,
	getMediaActivityLog,
	getMediaActivityLogForAsset,
	createMediaRevision,
	getMediaRevisions,
	getCurrentRevision,
	revertToRevision,
	getRevisionCount
} from '$lib/services/media-history';

// Mock D1 database
function createMockDB() {
	const mockResult = { results: [], success: true, meta: {} };
	const mockFirst = vi.fn().mockResolvedValue(null);
	const mockAll = vi.fn().mockResolvedValue(mockResult);
	const mockRun = vi.fn().mockResolvedValue(mockResult);

	const mockBind = vi.fn().mockReturnValue({
		first: mockFirst,
		all: mockAll,
		run: mockRun
	});

	const mockPrepare = vi.fn().mockReturnValue({
		bind: mockBind,
		first: mockFirst,
		all: mockAll,
		run: mockRun
	});

	return {
		prepare: mockPrepare,
		batch: vi.fn().mockResolvedValue([]),
		_mockBind: mockBind,
		_mockFirst: mockFirst,
		_mockAll: mockAll,
		_mockRun: mockRun
	};
}

describe('Media History Service', () => {
	let mockDB: ReturnType<typeof createMockDB>;

	beforeEach(() => {
		mockDB = createMockDB();
		vi.clearAllMocks();
	});

	// ─── Activity Logging ──────────────────────────────────

	describe('logMediaActivity', () => {
		it('should create an activity log entry', async () => {
			const log = await logMediaActivity(mockDB as any, {
				brandProfileId: 'brand-1',
				brandMediaId: 'media-1',
				userId: 'user-1',
				action: 'uploaded',
				description: 'Uploaded primary logo',
				source: 'upload'
			});

			expect(log).toBeDefined();
			expect(log.id).toBeDefined();
			expect(log.brandProfileId).toBe('brand-1');
			expect(log.brandMediaId).toBe('media-1');
			expect(log.action).toBe('uploaded');
			expect(log.source).toBe('upload');
			expect(log.createdAt).toBeDefined();
			expect(mockDB.prepare).toHaveBeenCalled();
		});

		it('should support entries without a specific media asset', async () => {
			const log = await logMediaActivity(mockDB as any, {
				brandProfileId: 'brand-1',
				userId: 'user-1',
				action: 'ai_generated',
				description: 'Generated brand images using AI',
				source: 'ai_generated'
			});

			expect(log.brandMediaId).toBeUndefined();
		});

		it('should store optional details as JSON', async () => {
			const details = { previousName: 'Old Logo', newName: 'New Logo' };
			const log = await logMediaActivity(mockDB as any, {
				brandProfileId: 'brand-1',
				brandMediaId: 'media-1',
				userId: 'user-1',
				action: 'updated',
				description: 'Renamed logo',
				details,
				source: 'upload'
			});

			expect(log.details).toEqual(details);
		});
	});

	describe('getMediaActivityLog', () => {
		it('should return all activity for a brand', async () => {
			mockDB._mockAll.mockResolvedValueOnce({
				results: [
					{
						id: 'log-1',
						brand_profile_id: 'brand-1',
						brand_media_id: 'media-1',
						user_id: 'user-1',
						action: 'uploaded',
						description: 'Uploaded logo',
						details: null,
						source: 'upload',
						created_at: '2025-01-01T00:00:00Z'
					},
					{
						id: 'log-2',
						brand_profile_id: 'brand-1',
						brand_media_id: 'media-1',
						user_id: 'user-1',
						action: 'updated',
						description: 'Updated logo metadata',
						details: '{"field":"description"}',
						source: 'upload',
						created_at: '2025-01-02T00:00:00Z'
					}
				]
			});

			const logs = await getMediaActivityLog(mockDB as any, 'brand-1');
			expect(logs).toHaveLength(2);
			expect(logs[0].action).toBe('uploaded');
			expect(logs[1].details).toEqual({ field: 'description' });
		});

		it('should support pagination with limit and offset', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });

			await getMediaActivityLog(mockDB as any, 'brand-1', { limit: 10, offset: 20 });
			expect(mockDB.prepare).toHaveBeenCalled();
			const query = mockDB.prepare.mock.calls[0][0] as string;
			expect(query).toContain('LIMIT');
			expect(query).toContain('OFFSET');
		});

		it('should return empty array when no activity exists', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });
			const logs = await getMediaActivityLog(mockDB as any, 'brand-1');
			expect(logs).toEqual([]);
		});
	});

	describe('getMediaActivityLogForAsset', () => {
		it('should return activity for a specific media asset', async () => {
			mockDB._mockAll.mockResolvedValueOnce({
				results: [
					{
						id: 'log-1',
						brand_profile_id: 'brand-1',
						brand_media_id: 'media-1',
						user_id: 'user-1',
						action: 'created',
						description: 'Created media asset',
						details: null,
						source: 'ai_generated',
						created_at: '2025-01-01T00:00:00Z'
					}
				]
			});

			const logs = await getMediaActivityLogForAsset(mockDB as any, 'media-1');
			expect(logs).toHaveLength(1);
			expect(logs[0].brandMediaId).toBe('media-1');
		});
	});

	// ─── Revision Control ──────────────────────────────────

	describe('createMediaRevision', () => {
		it('should create a revision with auto-incrementing number', async () => {
			// Mock the count query to return 0 existing revisions
			mockDB._mockFirst.mockResolvedValueOnce({ count: 0 });

			const revision = await createMediaRevision(mockDB as any, {
				brandMediaId: 'media-1',
				url: 'https://example.com/logo-v1.png',
				r2Key: 'brand-1/images/logo-v1.png',
				mimeType: 'image/png',
				fileSize: 50000,
				width: 1024,
				height: 1024,
				source: 'upload',
				userId: 'user-1',
				changeNote: 'Initial upload'
			});

			expect(revision).toBeDefined();
			expect(revision.id).toBeDefined();
			expect(revision.brandMediaId).toBe('media-1');
			expect(revision.revisionNumber).toBe(1);
			expect(revision.source).toBe('upload');
			expect(revision.isCurrent).toBe(true);
			expect(revision.changeNote).toBe('Initial upload');
		});

		it('should increment revision number', async () => {
			// Mock existing 2 revisions
			mockDB._mockFirst.mockResolvedValueOnce({ count: 2 });

			const revision = await createMediaRevision(mockDB as any, {
				brandMediaId: 'media-1',
				url: 'https://example.com/logo-v3.png',
				source: 'ai_generated',
				userId: 'user-1',
				changeNote: 'AI-generated update'
			});

			expect(revision.revisionNumber).toBe(3);
		});

		it('should mark previous revisions as not current', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ count: 1 });

			await createMediaRevision(mockDB as any, {
				brandMediaId: 'media-1',
				url: 'https://example.com/logo-v2.png',
				source: 'upload',
				userId: 'user-1'
			});

			// Should have called UPDATE to unset is_current on previous revisions
			const prepCalls = mockDB.prepare.mock.calls.map((c: unknown[]) => c[0] as string);
			expect(prepCalls.some((q: string) => q.includes('is_current') && q.includes('UPDATE'))).toBe(
				true
			);
		});

		it('should store AI generation source', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ count: 0 });

			const revision = await createMediaRevision(mockDB as any, {
				brandMediaId: 'media-1',
				url: 'https://example.com/ai-logo.png',
				source: 'ai_generated',
				userId: 'user-1',
				changeNote: 'Generated with DALL-E 3'
			});

			expect(revision.source).toBe('ai_generated');
		});
	});

	describe('getMediaRevisions', () => {
		it('should return all revisions for a media asset', async () => {
			mockDB._mockAll.mockResolvedValueOnce({
				results: [
					{
						id: 'rev-1',
						brand_media_id: 'media-1',
						revision_number: 1,
						url: 'https://example.com/v1.png',
						r2_key: null,
						mime_type: 'image/png',
						file_size: 50000,
						width: 1024,
						height: 1024,
						duration_seconds: null,
						source: 'upload',
						user_id: 'user-1',
						change_note: 'Initial upload',
						is_current: 0,
						metadata: null,
						created_at: '2025-01-01T00:00:00Z'
					},
					{
						id: 'rev-2',
						brand_media_id: 'media-1',
						revision_number: 2,
						url: 'https://example.com/v2.png',
						r2_key: null,
						mime_type: 'image/png',
						file_size: 60000,
						width: 1024,
						height: 1024,
						duration_seconds: null,
						source: 'ai_generated',
						user_id: 'user-1',
						change_note: 'AI enhancement',
						is_current: 1,
						metadata: null,
						created_at: '2025-01-02T00:00:00Z'
					}
				]
			});

			const revisions = await getMediaRevisions(mockDB as any, 'media-1');
			expect(revisions).toHaveLength(2);
			expect(revisions[0].revisionNumber).toBe(1);
			expect(revisions[0].isCurrent).toBe(false);
			expect(revisions[1].revisionNumber).toBe(2);
			expect(revisions[1].isCurrent).toBe(true);
		});
	});

	describe('getCurrentRevision', () => {
		it('should return the current revision', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({
				id: 'rev-2',
				brand_media_id: 'media-1',
				revision_number: 2,
				url: 'https://example.com/v2.png',
				r2_key: null,
				mime_type: 'image/png',
				file_size: 60000,
				width: 1024,
				height: 1024,
				duration_seconds: null,
				source: 'upload',
				user_id: 'user-1',
				change_note: 'Updated logo',
				is_current: 1,
				metadata: null,
				created_at: '2025-01-02T00:00:00Z'
			});

			const rev = await getCurrentRevision(mockDB as any, 'media-1');
			expect(rev).toBeDefined();
			expect(rev!.revisionNumber).toBe(2);
			expect(rev!.isCurrent).toBe(true);
		});

		it('should return null when no revisions exist', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);
			const rev = await getCurrentRevision(mockDB as any, 'nonexistent');
			expect(rev).toBeNull();
		});
	});

	describe('revertToRevision', () => {
		it('should create a new revision based on an old one', async () => {
			// First call: get the revision to revert to
			mockDB._mockFirst
				.mockResolvedValueOnce({
					id: 'rev-1',
					brand_media_id: 'media-1',
					revision_number: 1,
					url: 'https://example.com/v1.png',
					r2_key: 'brand-1/images/v1.png',
					mime_type: 'image/png',
					file_size: 50000,
					width: 1024,
					height: 1024,
					duration_seconds: null,
					source: 'upload',
					user_id: 'user-1',
					change_note: 'Initial upload',
					is_current: 0,
					metadata: null,
					created_at: '2025-01-01T00:00:00Z'
				})
				// Second call: count existing revisions
				.mockResolvedValueOnce({ count: 3 });

			const newRevision = await revertToRevision(mockDB as any, 'rev-1', 'user-1');

			expect(newRevision).toBeDefined();
			expect(newRevision.revisionNumber).toBe(4);
			expect(newRevision.url).toBe('https://example.com/v1.png');
			expect(newRevision.changeNote).toContain('Reverted to revision 1');
		});

		it('should throw if revision not found', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);

			await expect(revertToRevision(mockDB as any, 'nonexistent', 'user-1')).rejects.toThrow(
				'Revision not found'
			);
		});
	});

	describe('getRevisionCount', () => {
		it('should return the count of revisions', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ count: 5 });
			const count = await getRevisionCount(mockDB as any, 'media-1');
			expect(count).toBe(5);
		});

		it('should return 0 when no revisions exist', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ count: 0 });
			const count = await getRevisionCount(mockDB as any, 'nonexistent');
			expect(count).toBe(0);
		});
	});
});
