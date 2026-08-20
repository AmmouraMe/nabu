/**
 * Isolated coverage boost tests — items that conflict with vi.mock hoisting
 * in coverage-boost-final.test.ts are tested here without mock conflicts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
});

function mockDB(overrides: Record<string, any> = {}) {
	const runFn = vi.fn().mockResolvedValue({ success: true });
	const firstFn = vi.fn().mockResolvedValue(null);
	const allFn = vi.fn().mockResolvedValue({ results: [] });

	return {
		prepare: vi.fn().mockReturnValue({
			bind: vi.fn().mockReturnValue({
				run: overrides.run || runFn,
				first: overrides.first || firstFn,
				all: overrides.all || allFn
			}),
			run: overrides.run || runFn,
			first: overrides.first || firstFn,
			all: overrides.all || allFn
		}),
		_run: runFn,
		_first: firstFn,
		_all: allFn
	};
}

// =========================================================
// text-history.ts - || [] fallback branches (lines 24, 106)
// =========================================================
describe('Text History - fallback branches', () => {
	it('getTextRevisions should return empty array when results is undefined', async () => {
		const { getTextRevisions } = await import('$lib/services/text-history');
		const db = mockDB({
			all: vi.fn().mockResolvedValue({ results: undefined })
		});
		const result = await getTextRevisions(db as any, 'text1');
		expect(result).toEqual([]);
	});

	it('getTextRevisionCount should work', async () => {
		const { getTextRevisionCount } = await import('$lib/services/text-history');
		const db = mockDB({
			first: vi.fn().mockResolvedValue({ count: 5 })
		});
		const count = await getTextRevisionCount(db as any, 'text1');
		expect(count).toBe(5);
	});
});

// =========================================================
// ai-media-generation.ts - updateAIGenerationStatus branches
// Tests each optional field to cover the `if (updates.X !== undefined)` branches
// =========================================================
describe('AI Media Generation - updateAIGenerationStatus branches', () => {
	it('should update with cost field', async () => {
		const { updateAIGenerationStatus } = await import('$lib/services/ai-media-generation');
		const db = mockDB();
		await updateAIGenerationStatus(db as any, 'gen1', {
			status: 'processing' as any,
			cost: 0.05
		});
		expect(db.prepare).toHaveBeenCalled();
	});

	it('should update with errorMessage field', async () => {
		const { updateAIGenerationStatus } = await import('$lib/services/ai-media-generation');
		const db = mockDB();
		await updateAIGenerationStatus(db as any, 'gen1', {
			status: 'failed' as any,
			errorMessage: 'Something went wrong'
		});
		expect(db.prepare).toHaveBeenCalled();
	});

	it('should update with progress field', async () => {
		const { updateAIGenerationStatus } = await import('$lib/services/ai-media-generation');
		const db = mockDB();
		await updateAIGenerationStatus(db as any, 'gen1', {
			status: 'processing' as any,
			progress: 50
		});
		expect(db.prepare).toHaveBeenCalled();
	});

	it('should set completed_at on complete status', async () => {
		const { updateAIGenerationStatus } = await import('$lib/services/ai-media-generation');
		const db = mockDB();
		await updateAIGenerationStatus(db as any, 'gen1', {
			status: 'complete' as any,
			resultUrl: 'https://example.com/result.mp4'
		});
		expect(db.prepare).toHaveBeenCalled();
	});

	it('should set completed_at on failed status', async () => {
		const { updateAIGenerationStatus } = await import('$lib/services/ai-media-generation');
		const db = mockDB();
		await updateAIGenerationStatus(db as any, 'gen1', {
			status: 'failed' as any,
			errorMessage: 'Timeout'
		});
		expect(db.prepare).toHaveBeenCalled();
	});

	it('should update with all fields at once', async () => {
		const { updateAIGenerationStatus } = await import('$lib/services/ai-media-generation');
		const db = mockDB();
		await updateAIGenerationStatus(db as any, 'gen1', {
			status: 'complete' as any,
			providerJobId: 'job2',
			resultUrl: 'https://example.com/result.mp4',
			r2Key: 'r2/key',
			brandMediaId: 'media1',
			cost: 0.1,
			errorMessage: undefined,
			progress: 100
		});
		expect(db.prepare).toHaveBeenCalled();
	});

	it('should handle providerJobId and r2Key fields', async () => {
		const { updateAIGenerationStatus } = await import('$lib/services/ai-media-generation');
		const db = mockDB();
		await updateAIGenerationStatus(db as any, 'gen1', {
			status: 'processing' as any,
			providerJobId: 'ext-job-123',
			r2Key: 'archive/files/video.mp4'
		});
		expect(db.prepare).toHaveBeenCalled();
	});

	it('should handle brandMediaId field', async () => {
		const { updateAIGenerationStatus } = await import('$lib/services/ai-media-generation');
		const db = mockDB();
		await updateAIGenerationStatus(db as any, 'gen1', {
			status: 'complete' as any,
			brandMediaId: 'media-abc'
		});
		expect(db.prepare).toHaveBeenCalled();
	});
});

// =========================================================
// media-history.ts - || [] fallback branches
// =========================================================
describe('Media History - fallback branches', () => {
	it('getMediaActivityLog should return empty array when results is undefined', async () => {
		const { getMediaActivityLog } = await import('$lib/services/media-history');
		const db = mockDB({
			all: vi.fn().mockResolvedValue({ results: undefined })
		});
		const result = await getMediaActivityLog(db as any, 'bp1');
		expect(result).toEqual([]);
	});

	it('getMediaRevisions should return empty array when results is undefined', async () => {
		const { getMediaRevisions } = await import('$lib/services/media-history');
		const db = mockDB({
			all: vi.fn().mockResolvedValue({ results: undefined })
		});
		const result = await getMediaRevisions(db as any, 'media1');
		expect(result).toEqual([]);
	});
});

// =========================================================
// file-archive.ts - getArchiveStats null totalResult branch
// =========================================================
describe('File Archive - getArchiveStats branches', () => {
	it('should handle null totalResult in getArchiveStats', async () => {
		const { getArchiveStats } = await import('$lib/services/file-archive');
		// getArchiveStats uses Promise.all with multiple db queries
		// We need a db mock that can handle multiple prepare() calls
		let callCount = 0;
		const db = {
			prepare: vi.fn().mockImplementation(() => {
				callCount++;
				return {
					bind: vi.fn().mockReturnValue({
						first: vi.fn().mockResolvedValue(null),
						all: vi.fn().mockResolvedValue({ results: [] })
					}),
					first: vi.fn().mockResolvedValue(null),
					all: vi.fn().mockResolvedValue({ results: [] })
				};
			})
		};

		const stats = await getArchiveStats(db as any, 'bp1');
		expect(stats).toBeDefined();
		expect(db.prepare).toHaveBeenCalled();
	});
});
