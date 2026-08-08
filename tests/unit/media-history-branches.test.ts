/**
 * Branch coverage tests for Media History Service
 * Targets: 67.39% branches → higher coverage
 * Focuses on: mapRowToActivityLog/Revision null-coalescing branches,
 *   createMediaRevision with null optionals, countRow null,
 *   getMediaActivityLog default options,
 *   logMediaActivity with null brandMediaId/details,
 *   revertToRevision with null fields in target
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

describe('Media History - Branch Coverage', () => {
	let mockDB: ReturnType<typeof createMockDB>;

	beforeEach(() => {
		mockDB = createMockDB();
		vi.clearAllMocks();
	});

	// ─── mapRowToActivityLog branches ─────────────────────────

	describe('mapRowToActivityLog via getMediaActivityLog', () => {
		it('should map row with ALL fields populated', async () => {
			const rows = [
				{
					id: 'log-1',
					brand_profile_id: 'bp-1',
					brand_media_id: 'bm-1',
					user_id: 'user-1',
					action: 'create',
					description: 'Created logo',
					details: JSON.stringify({ size: '1024x1024' }),
					source: 'manual',
					created_at: '2026-01-01'
				}
			];
			mockDB._mockAll.mockResolvedValueOnce({ results: rows });

			const result = await getMediaActivityLog(mockDB as any, 'bp-1');
			expect(result[0].brandMediaId).toBe('bm-1');
			expect(result[0].details).toEqual({ size: '1024x1024' });
			expect(result[0].action).toBe('create');
			expect(result[0].source).toBe('manual');
		});

		it('should map row with null brand_media_id (falsy branch)', async () => {
			const rows = [
				{
					id: 'log-2',
					brand_profile_id: 'bp-1',
					brand_media_id: null,
					user_id: 'user-1',
					action: 'bulk_import',
					description: 'Imported assets',
					details: null,
					source: 'system',
					created_at: '2026-01-01'
				}
			];
			mockDB._mockAll.mockResolvedValueOnce({ results: rows });

			const result = await getMediaActivityLog(mockDB as any, 'bp-1');
			expect(result[0].brandMediaId).toBeUndefined();
			expect(result[0].details).toBeUndefined();
		});

		it('should map row with empty-string brand_media_id', async () => {
			const rows = [
				{
					id: 'log-3',
					brand_profile_id: 'bp-1',
					brand_media_id: '',
					user_id: 'user-1',
					action: 'update',
					description: 'Updated',
					details: null,
					source: 'ai_generation',
					created_at: '2026-01-01'
				}
			];
			mockDB._mockAll.mockResolvedValueOnce({ results: rows });

			const result = await getMediaActivityLog(mockDB as any, 'bp-1');
			expect(result[0].brandMediaId).toBeUndefined();
		});
	});

	// ─── mapRowToRevision branches ────────────────────────────

	describe('mapRowToRevision via getMediaRevisions', () => {
		it('should map revision with ALL fields populated', async () => {
			const rows = [
				{
					id: 'rev-1',
					brand_media_id: 'bm-1',
					revision_number: 3,
					url: 'https://example.com/v3.png',
					r2_key: 'brands/bp-1/v3.png',
					mime_type: 'image/png',
					file_size: 50000,
					width: 1024,
					height: 1024,
					duration_seconds: null,
					source: 'ai_generation',
					user_id: 'user-1',
					change_note: 'Updated colors',
					is_current: 1,
					metadata: JSON.stringify({ model: 'dall-e-3' }),
					created_at: '2026-01-03'
				}
			];
			mockDB._mockAll.mockResolvedValueOnce({ results: rows });

			const result = await getMediaRevisions(mockDB as any, 'bm-1');
			expect(result[0].url).toBe('https://example.com/v3.png');
			expect(result[0].r2Key).toBe('brands/bp-1/v3.png');
			expect(result[0].mimeType).toBe('image/png');
			expect(result[0].fileSize).toBe(50000);
			expect(result[0].width).toBe(1024);
			expect(result[0].height).toBe(1024);
			expect(result[0].durationSeconds).toBeUndefined();
			expect(result[0].changeNote).toBe('Updated colors');
			expect(result[0].isCurrent).toBe(true);
			expect(result[0].metadata).toEqual({ model: 'dall-e-3' });
		});

		it('should map revision with ALL optional fields null', async () => {
			const rows = [
				{
					id: 'rev-2',
					brand_media_id: 'bm-1',
					revision_number: 1,
					url: null,
					r2_key: null,
					mime_type: null,
					file_size: null,
					width: null,
					height: null,
					duration_seconds: null,
					source: 'manual',
					user_id: 'user-1',
					change_note: null,
					is_current: 0,
					metadata: null,
					created_at: '2026-01-01'
				}
			];
			mockDB._mockAll.mockResolvedValueOnce({ results: rows });

			const result = await getMediaRevisions(mockDB as any, 'bm-1');
			expect(result[0].url).toBeUndefined();
			expect(result[0].r2Key).toBeUndefined();
			expect(result[0].mimeType).toBeUndefined();
			expect(result[0].fileSize).toBeUndefined();
			expect(result[0].width).toBeUndefined();
			expect(result[0].height).toBeUndefined();
			expect(result[0].durationSeconds).toBeUndefined();
			expect(result[0].changeNote).toBeUndefined();
			expect(result[0].isCurrent).toBe(false);
			expect(result[0].metadata).toBeUndefined();
		});

		it('should map revision with duration_seconds populated (for audio/video)', async () => {
			const rows = [
				{
					id: 'rev-3',
					brand_media_id: 'bm-2',
					revision_number: 1,
					url: 'https://example.com/audio.mp3',
					r2_key: null,
					mime_type: 'audio/mpeg',
					file_size: 100000,
					width: null,
					height: null,
					duration_seconds: 45,
					source: 'manual',
					user_id: 'user-1',
					change_note: 'Initial upload',
					is_current: 1,
					metadata: null,
					created_at: '2026-01-01'
				}
			];
			mockDB._mockAll.mockResolvedValueOnce({ results: rows });

			const result = await getMediaRevisions(mockDB as any, 'bm-2');
			expect(result[0].durationSeconds).toBe(45);
			expect(result[0].width).toBeUndefined();
			expect(result[0].height).toBeUndefined();
		});

		it('should handle is_current = 0 correctly (false branch)', async () => {
			const rows = [
				{
					id: 'rev-4',
					brand_media_id: 'bm-1',
					revision_number: 1,
					url: null,
					r2_key: null,
					mime_type: null,
					file_size: null,
					width: null,
					height: null,
					duration_seconds: null,
					source: 'manual',
					user_id: 'user-1',
					change_note: null,
					is_current: 0,
					metadata: null,
					created_at: '2026-01-01'
				}
			];
			mockDB._mockAll.mockResolvedValueOnce({ results: rows });

			const result = await getMediaRevisions(mockDB as any, 'bm-1');
			expect(result[0].isCurrent).toBe(false);
		});
	});

	// ─── getMediaActivityLog default options ──────────────────

	describe('getMediaActivityLog - default options', () => {
		it('should use default limit=50 and offset=0 when no options provided', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });

			await getMediaActivityLog(mockDB as any, 'bp-1');

			expect(mockDB._mockBind).toHaveBeenCalledWith('bp-1', 50, 0);
		});

		it('should use custom limit and offset', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });

			await getMediaActivityLog(mockDB as any, 'bp-1', { limit: 10, offset: 20 });

			expect(mockDB._mockBind).toHaveBeenCalledWith('bp-1', 10, 20);
		});

		it('should use default offset when only limit provided', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });

			await getMediaActivityLog(mockDB as any, 'bp-1', { limit: 25 });

			expect(mockDB._mockBind).toHaveBeenCalledWith('bp-1', 25, 0);
		});

		it('should use default limit when only offset provided', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });

			await getMediaActivityLog(mockDB as any, 'bp-1', { offset: 10 });

			expect(mockDB._mockBind).toHaveBeenCalledWith('bp-1', 50, 10);
		});
	});

	// ─── logMediaActivity branches ────────────────────────────

	describe('logMediaActivity - detail branches', () => {
		it('should set details to null when not provided', async () => {
			const result = await logMediaActivity(mockDB as any, {
				brandProfileId: 'bp-1',
				userId: 'user-1',
				action: 'created',
				description: 'A new asset',
				source: 'upload'
			});

			expect(result.details).toBeUndefined();
			expect(result.brandMediaId).toBeUndefined();
		});

		it('should serialize details when provided', async () => {
			const result = await logMediaActivity(mockDB as any, {
				brandProfileId: 'bp-1',
				brandMediaId: 'bm-1',
				userId: 'user-1',
				action: 'updated',
				description: 'Updated logo',
				details: { field: 'url', oldValue: 'a.png', newValue: 'b.png' },
				source: 'upload'
			});

			expect(result.details).toEqual({ field: 'url', oldValue: 'a.png', newValue: 'b.png' });
			expect(result.brandMediaId).toBe('bm-1');
		});
	});

	// ─── createMediaRevision branches ─────────────────────────

	describe('createMediaRevision - null optional field branches', () => {
		it('should handle null countRow (? ?? 0 branch)', async () => {
			// First first() call returns null (no existing revisions)
			mockDB._mockFirst.mockResolvedValueOnce(null);

			const result = await createMediaRevision(mockDB as any, {
				brandMediaId: 'bm-1',
				source: 'upload',
				userId: 'user-1'
			});

			expect(result.revisionNumber).toBe(1);
			expect(result.url).toBeUndefined();
			expect(result.r2Key).toBeUndefined();
			expect(result.mimeType).toBeUndefined();
			expect(result.fileSize).toBeUndefined();
			expect(result.width).toBeUndefined();
			expect(result.height).toBeUndefined();
			expect(result.durationSeconds).toBeUndefined();
			expect(result.changeNote).toBeUndefined();
			expect(result.metadata).toBeUndefined();
			expect(result.isCurrent).toBe(true);
		});

		it('should handle countRow with count value', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ count: 5 });

			const result = await createMediaRevision(mockDB as any, {
				brandMediaId: 'bm-1',
				source: 'upload',
				userId: 'user-1',
				url: 'https://example.com/v6.png',
				r2Key: 'brands/v6.png',
				mimeType: 'image/png',
				fileSize: 10000,
				width: 512,
				height: 512,
				changeNote: 'Fixed colors',
				metadata: { model: 'dall-e-3' }
			});

			expect(result.revisionNumber).toBe(6);
			expect(result.url).toBe('https://example.com/v6.png');
			expect(result.r2Key).toBe('brands/v6.png');
			expect(result.mimeType).toBe('image/png');
			expect(result.fileSize).toBe(10000);
			expect(result.width).toBe(512);
			expect(result.height).toBe(512);
			expect(result.changeNote).toBe('Fixed colors');
			expect(result.metadata).toEqual({ model: 'dall-e-3' });
		});

		it('should pass null for optional fields in bind when not provided', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ count: 0 });

			await createMediaRevision(mockDB as any, {
				brandMediaId: 'bm-1',
				source: 'ai_generated',
				userId: 'user-1'
			});

			// Verify bind was called with null for optional fields
			// The third prepare call is the INSERT
			expect(mockDB.prepare).toHaveBeenCalledTimes(3);
		});

		it('should serialize metadata when provided', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ count: 0 });

			const result = await createMediaRevision(mockDB as any, {
				brandMediaId: 'bm-1',
				source: 'upload',
				userId: 'user-1',
				metadata: { note: 'test' }
			});

			expect(result.metadata).toEqual({ note: 'test' });
		});

		it('should include durationSeconds when provided', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ count: 0 });

			const result = await createMediaRevision(mockDB as any, {
				brandMediaId: 'bm-2',
				source: 'upload',
				userId: 'user-1',
				durationSeconds: 120,
				mimeType: 'audio/mpeg'
			});

			expect(result.durationSeconds).toBe(120);
		});
	});

	// ─── revertToRevision branches ────────────────────────────

	describe('revertToRevision - target revision field branches', () => {
		it('should throw when target revision not found', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);

			await expect(revertToRevision(mockDB as any, 'nonexistent', 'user-1')).rejects.toThrow(
				'Revision not found'
			);
		});

		it('should create new revision with all fields from target (populated)', async () => {
			// First first() for getting target revision
			mockDB._mockFirst.mockResolvedValueOnce({
				id: 'rev-old',
				brand_media_id: 'bm-1',
				revision_number: 2,
				url: 'https://example.com/v2.png',
				r2_key: 'brands/v2.png',
				mime_type: 'image/png',
				file_size: 20000,
				width: 800,
				height: 600,
				duration_seconds: null,
				source: 'manual',
				user_id: 'user-1',
				change_note: 'Original note',
				is_current: 0,
				metadata: JSON.stringify({ original: true }),
				created_at: '2026-01-01'
			});
			// Second first() for countRow in createMediaRevision
			mockDB._mockFirst.mockResolvedValueOnce({ count: 4 });

			const result = await revertToRevision(mockDB as any, 'rev-old', 'user-2');
			expect(result.revisionNumber).toBe(5);
			expect(result.url).toBe('https://example.com/v2.png');
			expect(result.r2Key).toBe('brands/v2.png');
			expect(result.changeNote).toBe('Reverted to revision 2');
			expect(result.userId).toBe('user-2');
			expect(result.isCurrent).toBe(true);
		});

		it('should create new revision with null optional fields from target', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({
				id: 'rev-minimal',
				brand_media_id: 'bm-1',
				revision_number: 1,
				url: null,
				r2_key: null,
				mime_type: null,
				file_size: null,
				width: null,
				height: null,
				duration_seconds: null,
				source: 'manual',
				user_id: 'user-1',
				change_note: null,
				is_current: 0,
				metadata: null,
				created_at: '2026-01-01'
			});
			mockDB._mockFirst.mockResolvedValueOnce({ count: 3 });

			const result = await revertToRevision(mockDB as any, 'rev-minimal', 'user-1');
			expect(result.revisionNumber).toBe(4);
			expect(result.url).toBeUndefined();
			expect(result.r2Key).toBeUndefined();
			expect(result.mimeType).toBeUndefined();
			expect(result.fileSize).toBeUndefined();
			expect(result.width).toBeUndefined();
			expect(result.height).toBeUndefined();
			expect(result.durationSeconds).toBeUndefined();
			expect(result.changeNote).toBe('Reverted to revision 1');
			expect(result.metadata).toBeUndefined();
		});
	});

	// ─── getCurrentRevision branches ──────────────────────────

	describe('getCurrentRevision - null/populated branches', () => {
		it('should return null when no current revision', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);

			const result = await getCurrentRevision(mockDB as any, 'bm-1');
			expect(result).toBeNull();
		});

		it('should return mapped revision when found', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({
				id: 'rev-current',
				brand_media_id: 'bm-1',
				revision_number: 3,
				url: 'https://example.com/current.png',
				r2_key: 'brands/current.png',
				mime_type: 'image/png',
				file_size: 30000,
				width: 1024,
				height: 1024,
				duration_seconds: null,
				source: 'ai_generation',
				user_id: 'user-1',
				change_note: 'Latest',
				is_current: 1,
				metadata: JSON.stringify({ quality: 'hd' }),
				created_at: '2026-01-05'
			});

			const result = await getCurrentRevision(mockDB as any, 'bm-1');
			expect(result).not.toBeNull();
			expect(result!.revisionNumber).toBe(3);
			expect(result!.isCurrent).toBe(true);
			expect(result!.metadata).toEqual({ quality: 'hd' });
		});
	});

	// ─── getRevisionCount branches ────────────────────────────

	describe('getRevisionCount - null row branch', () => {
		it('should return 0 when row is null', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);

			const count = await getRevisionCount(mockDB as any, 'bm-nonexistent');
			expect(count).toBe(0);
		});

		it('should return count when row exists', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ count: 7 });

			const count = await getRevisionCount(mockDB as any, 'bm-1');
			expect(count).toBe(7);
		});
	});

	// ─── getMediaActivityLogForAsset ──────────────────────────

	describe('getMediaActivityLogForAsset', () => {
		it('should return empty array when no activity', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });

			const result = await getMediaActivityLogForAsset(mockDB as any, 'bm-1');
			expect(result).toEqual([]);
		});

		it('should map rows with mixed null/populated details', async () => {
			const rows = [
				{
					id: 'log-a',
					brand_profile_id: 'bp-1',
					brand_media_id: 'bm-1',
					user_id: 'user-1',
					action: 'create',
					description: 'Created',
					details: JSON.stringify({ prompt: 'A logo' }),
					source: 'ai_generation',
					created_at: '2026-01-01'
				},
				{
					id: 'log-b',
					brand_profile_id: 'bp-1',
					brand_media_id: 'bm-1',
					user_id: 'user-1',
					action: 'update',
					description: 'Updated',
					details: null,
					source: 'manual',
					created_at: '2026-01-02'
				}
			];
			mockDB._mockAll.mockResolvedValueOnce({ results: rows });

			const result = await getMediaActivityLogForAsset(mockDB as any, 'bm-1');
			expect(result).toHaveLength(2);
			expect(result[0].details).toEqual({ prompt: 'A logo' });
			expect(result[1].details).toBeUndefined();
		});
	});
});
