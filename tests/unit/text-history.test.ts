/**
 * Tests for Brand Text Revision History
 * TDD: Tests written first for text asset revision tracking & rollback
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	createTextRevision,
	getTextRevisions,
	getCurrentTextRevision,
	revertTextToRevision,
	getTextRevisionCount
} from '$lib/services/text-history';
import type { TextRevision } from '$lib/types/brand-assets';

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

describe('Text Revision History Service', () => {
	let mockDB: ReturnType<typeof createMockDB>;

	beforeEach(() => {
		mockDB = createMockDB();
		vi.clearAllMocks();
	});

	// ─── Create Text Revision ──────────────────────────────

	describe('createTextRevision', () => {
		it('should create a revision for a text asset', async () => {
			// First call: COUNT query returns 0 existing revisions
			mockDB._mockFirst.mockResolvedValueOnce({ count: 0 });

			const revision = await createTextRevision(mockDB as any, {
				brandTextId: 'text-1',
				value: 'New tagline value',
				label: 'Tagline',
				changeSource: 'manual',
				userId: 'user-1',
				changeNote: 'Updated brand tagline'
			});

			expect(revision).toBeDefined();
			expect(revision.id).toBeDefined();
			expect(revision.brandTextId).toBe('text-1');
			expect(revision.value).toBe('New tagline value');
			expect(revision.label).toBe('Tagline');
			expect(revision.revisionNumber).toBe(1);
			expect(revision.isCurrent).toBe(true);
			expect(revision.changeSource).toBe('manual');
			expect(revision.userId).toBe('user-1');
			expect(revision.changeNote).toBe('Updated brand tagline');
			expect(revision.createdAt).toBeDefined();
		});

		it('should increment revision number for subsequent revisions', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ count: 3 });

			const revision = await createTextRevision(mockDB as any, {
				brandTextId: 'text-1',
				value: 'Fourth version',
				changeSource: 'ai',
				userId: 'user-1'
			});

			expect(revision.revisionNumber).toBe(4);
		});

		it('should mark previous revisions as not current', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ count: 1 });

			await createTextRevision(mockDB as any, {
				brandTextId: 'text-1',
				value: 'Updated',
				changeSource: 'manual',
				userId: 'user-1'
			});

			// Verify UPDATE was called to clear is_current
			const updateCall = mockDB.prepare.mock.calls.find(
				(call: string[]) =>
					typeof call[0] === 'string' &&
					call[0].includes('UPDATE brand_text_revisions SET is_current = 0')
			);
			expect(updateCall).toBeDefined();
		});

		it('should support AI change source', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ count: 0 });

			const revision = await createTextRevision(mockDB as any, {
				brandTextId: 'text-1',
				value: 'AI generated tagline',
				changeSource: 'ai',
				userId: 'user-1',
				changeNote: 'AI suggestion accepted'
			});

			expect(revision.changeSource).toBe('ai');
		});
	});

	// ─── Get Text Revisions ──────────────────────────────

	describe('getTextRevisions', () => {
		it('should return all revisions for a text asset ordered by revision number', async () => {
			mockDB._mockAll.mockResolvedValueOnce({
				results: [
					{
						id: 'rev-1',
						brand_text_id: 'text-1',
						revision_number: 1,
						is_current: 0,
						value: 'First version',
						label: 'Tagline',
						change_source: 'manual',
						user_id: 'user-1',
						change_note: null,
						created_at: '2025-01-01T00:00:00Z'
					},
					{
						id: 'rev-2',
						brand_text_id: 'text-1',
						revision_number: 2,
						is_current: 1,
						value: 'Second version',
						label: 'Tagline',
						change_source: 'ai',
						user_id: 'user-1',
						change_note: 'AI improvement',
						created_at: '2025-01-02T00:00:00Z'
					}
				]
			});

			const revisions = await getTextRevisions(mockDB as any, 'text-1');

			expect(revisions).toHaveLength(2);
			expect(revisions[0].revisionNumber).toBe(1);
			expect(revisions[0].isCurrent).toBe(false);
			expect(revisions[0].value).toBe('First version');
			expect(revisions[1].revisionNumber).toBe(2);
			expect(revisions[1].isCurrent).toBe(true);
			expect(revisions[1].value).toBe('Second version');
			expect(revisions[1].changeSource).toBe('ai');
		});

		it('should return empty array when no revisions exist', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });

			const revisions = await getTextRevisions(mockDB as any, 'text-999');
			expect(revisions).toEqual([]);
		});
	});

	// ─── Get Current Text Revision ──────────────────────────

	describe('getCurrentTextRevision', () => {
		it('should return the current revision for a text asset', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({
				id: 'rev-2',
				brand_text_id: 'text-1',
				revision_number: 2,
				is_current: 1,
				value: 'Current value',
				label: 'Tagline',
				change_source: 'manual',
				user_id: 'user-1',
				change_note: null,
				created_at: '2025-01-02T00:00:00Z'
			});

			const revision = await getCurrentTextRevision(mockDB as any, 'text-1');

			expect(revision).toBeDefined();
			expect(revision!.isCurrent).toBe(true);
			expect(revision!.value).toBe('Current value');
		});

		it('should return null when no current revision exists', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);

			const revision = await getCurrentTextRevision(mockDB as any, 'text-1');
			expect(revision).toBeNull();
		});
	});

	// ─── Revert Text to Revision ────────────────────────────

	describe('revertTextToRevision', () => {
		it('should create a new revision copying the target revision content', async () => {
			// First: get the target revision
			mockDB._mockFirst
				.mockResolvedValueOnce({
					id: 'rev-1',
					brand_text_id: 'text-1',
					revision_number: 1,
					is_current: 0,
					value: 'Original tagline',
					label: 'Tagline',
					change_source: 'manual',
					user_id: 'user-1',
					change_note: null,
					created_at: '2025-01-01T00:00:00Z'
				})
				// Second: count existing revisions for new revision number
				.mockResolvedValueOnce({ count: 3 });

			const revision = await revertTextToRevision(mockDB as any, 'rev-1', 'user-2');

			expect(revision).toBeDefined();
			expect(revision.brandTextId).toBe('text-1');
			expect(revision.value).toBe('Original tagline');
			expect(revision.label).toBe('Tagline');
			expect(revision.changeSource).toBe('revert');
			expect(revision.changeNote).toBe('Reverted to revision 1');
			expect(revision.revisionNumber).toBe(4);
			expect(revision.isCurrent).toBe(true);
		});

		it('should throw error when target revision not found', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);

			await expect(revertTextToRevision(mockDB as any, 'non-existent', 'user-1')).rejects.toThrow(
				'Revision not found'
			);
		});
	});

	// ─── Get Text Revision Count ─────────────────────────

	describe('getTextRevisionCount', () => {
		it('should return the number of revisions', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ count: 5 });

			const count = await getTextRevisionCount(mockDB as any, 'text-1');
			expect(count).toBe(5);
		});

		it('should return 0 when no revisions exist', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ count: 0 });

			const count = await getTextRevisionCount(mockDB as any, 'text-999');
			expect(count).toBe(0);
		});
	});
});
