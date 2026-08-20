/**
 * Tests for File Archive Service
 * TDD: Covers CRUD, smart folder assignment, filtering, stats, star toggle
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	determineFolder,
	createFileArchiveEntry,
	getFileArchiveEntry,
	listFileArchive,
	getArchiveFolders,
	toggleFileStar,
	updateFileArchiveEntry,
	deleteFileArchiveEntry,
	getArchiveStats
} from '$lib/services/file-archive';
import type {
	CreateFileArchiveInput,
	FileArchiveEntry,
	FileArchiveFilter
} from '$lib/services/file-archive';

// ─── Mock D1 Database ──────────────────────────────────────────────

function createMockDB() {
	const mockFirst = vi.fn().mockResolvedValue(null);
	const mockAll = vi.fn().mockResolvedValue({ results: [], success: true });
	const mockRun = vi.fn().mockResolvedValue({ success: true });

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

// ─── Fixtures ──────────────────────────────────────────────────────

function baseInput(overrides: Partial<CreateFileArchiveInput> = {}): CreateFileArchiveInput {
	return {
		brandProfileId: 'bp-001',
		userId: 'user-001',
		fileName: 'logo.png',
		mimeType: 'image/png',
		fileSize: 204800,
		r2Key: 'archive/bp-001/onboarding/images/logo.png',
		fileType: 'image',
		source: 'user_upload',
		context: 'onboarding',
		onboardingStep: 'visual_identity',
		...overrides
	};
}

function mockRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: 'fa-001',
		brand_profile_id: 'bp-001',
		user_id: 'user-001',
		file_name: 'logo.png',
		mime_type: 'image/png',
		file_size: 204800,
		r2_key: 'archive/bp-001/onboarding/images/logo.png',
		file_type: 'image',
		source: 'user_upload',
		context: 'onboarding',
		conversation_id: null,
		message_id: null,
		onboarding_step: 'visual_identity',
		ai_prompt: null,
		ai_model: null,
		ai_generation_id: null,
		folder: '/onboarding/visual-identity/images',
		tags: '[]',
		description: null,
		is_starred: 0,
		created_at: '2026-01-01T00:00:00Z',
		updated_at: '2026-01-01T00:00:00Z',
		...overrides
	};
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('File Archive Service', () => {
	let mockDB: ReturnType<typeof createMockDB>;

	beforeEach(() => {
		mockDB = createMockDB();
		vi.clearAllMocks();
	});

	// ─── determineFolder ─────────────────────────────────────────

	describe('determineFolder', () => {
		it('should place onboarding images in /onboarding/{step}/images', () => {
			const folder = determineFolder(baseInput());
			expect(folder).toBe('/onboarding/visual-identity/images');
		});

		it('should replace underscores with hyphens in step names', () => {
			const folder = determineFolder(baseInput({ onboardingStep: 'brand_personality' }));
			expect(folder).toBe('/onboarding/brand-personality/images');
		});

		it('should handle onboarding without step', () => {
			const folder = determineFolder(baseInput({ onboardingStep: undefined }));
			expect(folder).toBe('/onboarding/images');
		});

		it('should place onboarding videos correctly', () => {
			const folder = determineFolder(
				baseInput({ fileType: 'video', onboardingStep: 'brand_story' })
			);
			expect(folder).toBe('/onboarding/brand-story/videos');
		});

		it('should place onboarding audio correctly', () => {
			const folder = determineFolder(baseInput({ fileType: 'audio', onboardingStep: 'welcome' }));
			expect(folder).toBe('/onboarding/welcome/audios');
		});

		it('should place brand_assets images in /brand-assets/images', () => {
			const folder = determineFolder(baseInput({ context: 'brand_assets', fileType: 'image' }));
			expect(folder).toBe('/brand-assets/images');
		});

		it('should place brand_assets videos in /brand-assets/videos', () => {
			const folder = determineFolder(baseInput({ context: 'brand_assets', fileType: 'video' }));
			expect(folder).toBe('/brand-assets/videos');
		});

		it('should place ai_generated chat files in /ai-generated/{type}s', () => {
			const folder = determineFolder(
				baseInput({ context: 'chat', source: 'ai_generated', fileType: 'image' })
			);
			expect(folder).toBe('/ai-generated/images');
		});

		it('should place ai_generated audio in /ai-generated/audios', () => {
			const folder = determineFolder(
				baseInput({ context: 'chat', source: 'ai_generated', fileType: 'audio' })
			);
			expect(folder).toBe('/ai-generated/audios');
		});

		it('should place user_upload chat files in /uploads/{type}s', () => {
			const folder = determineFolder(
				baseInput({ context: 'chat', source: 'user_upload', fileType: 'image' })
			);
			expect(folder).toBe('/uploads/images');
		});

		it('should default to /uploads for unknown context+source combo', () => {
			const folder = determineFolder(
				baseInput({ context: undefined, source: 'user_upload', fileType: 'document' })
			);
			expect(folder).toBe('/uploads/documents');
		});
	});

	// ─── createFileArchiveEntry ──────────────────────────────────

	describe('createFileArchiveEntry', () => {
		it('should insert a new entry and return it', async () => {
			const row = mockRow();
			mockDB._mockFirst.mockResolvedValueOnce(row);

			const entry = await createFileArchiveEntry(mockDB as any, baseInput());

			expect(mockDB.prepare).toHaveBeenCalledWith(
				expect.stringContaining('INSERT INTO file_archive')
			);
			expect(entry.brandProfileId).toBe('bp-001');
			expect(entry.fileName).toBe('logo.png');
			expect(entry.fileType).toBe('image');
			expect(entry.source).toBe('user_upload');
			expect(entry.folder).toBe('/onboarding/visual-identity/images');
			expect(entry.isStarred).toBe(false);
			expect(entry.tags).toEqual([]);
		});

		it('should throw if insert fails (null result)', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);

			await expect(createFileArchiveEntry(mockDB as any, baseInput())).rejects.toThrow(
				'Failed to create file archive entry'
			);
		});

		it('should use a custom folder when provided', async () => {
			const input = baseInput({ folder: '/custom/path' });
			const row = mockRow({ folder: '/custom/path' });
			mockDB._mockFirst.mockResolvedValueOnce(row);

			const entry = await createFileArchiveEntry(mockDB as any, input);
			expect(entry.folder).toBe('/custom/path');
		});

		it('should serialize tags as JSON', async () => {
			const input = baseInput({ tags: ['hero', 'banner'] });
			const row = mockRow({ tags: '["hero","banner"]' });
			mockDB._mockFirst.mockResolvedValueOnce(row);

			const entry = await createFileArchiveEntry(mockDB as any, input);
			expect(entry.tags).toEqual(['hero', 'banner']);
		});

		it('should default context to chat when not specified', async () => {
			const input = baseInput({ context: undefined });
			const row = mockRow({ context: 'chat' });
			mockDB._mockFirst.mockResolvedValueOnce(row);

			const entry = await createFileArchiveEntry(mockDB as any, input);
			expect(entry.context).toBe('chat');
		});

		it('should pass AI metadata to the insert', async () => {
			const input = baseInput({
				source: 'ai_generated',
				aiPrompt: 'Generate a logo',
				aiModel: 'dall-e-3',
				aiGenerationId: 'gen-abc'
			});
			const row = mockRow({
				source: 'ai_generated',
				ai_prompt: 'Generate a logo',
				ai_model: 'dall-e-3',
				ai_generation_id: 'gen-abc'
			});
			mockDB._mockFirst.mockResolvedValueOnce(row);

			const entry = await createFileArchiveEntry(mockDB as any, input);
			expect(entry.source).toBe('ai_generated');
			expect(entry.aiPrompt).toBe('Generate a logo');
			expect(entry.aiModel).toBe('dall-e-3');
			expect(entry.aiGenerationId).toBe('gen-abc');
		});
	});

	// ─── getFileArchiveEntry ─────────────────────────────────────

	describe('getFileArchiveEntry', () => {
		it('should return an entry by ID', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(mockRow());

			const entry = await getFileArchiveEntry(mockDB as any, 'fa-001');

			expect(mockDB.prepare).toHaveBeenCalledWith(
				expect.stringContaining('SELECT * FROM file_archive WHERE id')
			);
			expect(entry).not.toBeNull();
			expect(entry!.id).toBe('fa-001');
			expect(entry!.mimeType).toBe('image/png');
		});

		it('should return null when entry not found', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);

			const entry = await getFileArchiveEntry(mockDB as any, 'nonexistent');
			expect(entry).toBeNull();
		});

		it('should parse tags JSON correctly', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(mockRow({ tags: '["brand","logo"]' }));

			const entry = await getFileArchiveEntry(mockDB as any, 'fa-001');
			expect(entry!.tags).toEqual(['brand', 'logo']);
		});

		it('should handle malformed tags JSON gracefully', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(mockRow({ tags: 'bad json' }));

			const entry = await getFileArchiveEntry(mockDB as any, 'fa-001');
			expect(entry!.tags).toEqual([]);
		});

		it('should convert is_starred integer to boolean', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(mockRow({ is_starred: 1 }));
			const starred = await getFileArchiveEntry(mockDB as any, 'fa-001');
			expect(starred!.isStarred).toBe(true);

			mockDB._mockFirst.mockResolvedValueOnce(mockRow({ is_starred: 0 }));
			const unstarred = await getFileArchiveEntry(mockDB as any, 'fa-001');
			expect(unstarred!.isStarred).toBe(false);
		});
	});

	// ─── listFileArchive ─────────────────────────────────────────

	describe('listFileArchive', () => {
		const baseFilter: FileArchiveFilter = { brandProfileId: 'bp-001' };

		it('should query with brand_profile_id filter', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ count: 0 });
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });

			const result = await listFileArchive(mockDB as any, baseFilter);

			expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining('brand_profile_id = ?'));
			expect(result.files).toEqual([]);
			expect(result.total).toBe(0);
		});

		it('should add fileType filter when specified', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ count: 1 });
			mockDB._mockAll.mockResolvedValueOnce({ results: [mockRow()] });

			await listFileArchive(mockDB as any, { ...baseFilter, fileType: 'image' });

			expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining('file_type = ?'));
		});

		it('should add source filter when specified', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ count: 0 });
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });

			await listFileArchive(mockDB as any, { ...baseFilter, source: 'ai_generated' });

			expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining('source = ?'));
		});

		it('should add context filter when specified', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ count: 0 });
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });

			await listFileArchive(mockDB as any, { ...baseFilter, context: 'onboarding' });

			expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining('context = ?'));
		});

		it('should add folder prefix filter when specified', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ count: 0 });
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });

			await listFileArchive(mockDB as any, { ...baseFilter, folder: '/onboarding' });

			expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining('folder LIKE ?'));
		});

		it('should filter starred files', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ count: 0 });
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });

			await listFileArchive(mockDB as any, { ...baseFilter, isStarred: true });

			expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining('is_starred = ?'));
		});

		it('should add search filter across name, description, and tags', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ count: 0 });
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });

			await listFileArchive(mockDB as any, { ...baseFilter, search: 'logo' });

			expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining('file_name LIKE ?'));
			expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining('description LIKE ?'));
			expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining('tags LIKE ?'));
		});

		it('should use default limit of 50 and offset of 0', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ count: 0 });
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });

			await listFileArchive(mockDB as any, baseFilter);

			expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining('LIMIT ? OFFSET ?'));
		});

		it('should map rows to FileArchiveEntry objects', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ count: 2 });
			mockDB._mockAll.mockResolvedValueOnce({
				results: [mockRow({ id: 'fa-001' }), mockRow({ id: 'fa-002' })]
			});

			const result = await listFileArchive(mockDB as any, baseFilter);

			expect(result.total).toBe(2);
			expect(result.files).toHaveLength(2);
			expect(result.files[0].id).toBe('fa-001');
			expect(result.files[1].id).toBe('fa-002');
		});

		it('should handle empty results gracefully', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);
			mockDB._mockAll.mockResolvedValueOnce({ results: undefined });

			const result = await listFileArchive(mockDB as any, baseFilter);

			expect(result.total).toBe(0);
			expect(result.files).toEqual([]);
		});
	});

	// ─── getArchiveFolders ───────────────────────────────────────

	describe('getArchiveFolders', () => {
		it('should return folder structure with counts', async () => {
			mockDB._mockAll.mockResolvedValueOnce({
				results: [
					{ folder: '/onboarding/visual-identity/images', file_count: 5 },
					{ folder: '/uploads/videos', file_count: 3 },
					{ folder: '/ai-generated/images', file_count: 8 }
				]
			});

			const folders = await getArchiveFolders(mockDB as any, 'bp-001');

			expect(folders).toHaveLength(3);
			expect(folders[0]).toEqual({
				path: '/onboarding/visual-identity/images',
				name: 'images',
				fileCount: 5
			});
			expect(folders[1]).toEqual({
				path: '/uploads/videos',
				name: 'videos',
				fileCount: 3
			});
			expect(folders[2]).toEqual({
				path: '/ai-generated/images',
				name: 'images',
				fileCount: 8
			});
		});

		it('should return empty array when no files exist', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });

			const folders = await getArchiveFolders(mockDB as any, 'bp-001');
			expect(folders).toEqual([]);
		});

		it('should handle undefined results', async () => {
			mockDB._mockAll.mockResolvedValueOnce({ results: undefined });

			const folders = await getArchiveFolders(mockDB as any, 'bp-001');
			expect(folders).toEqual([]);
		});

		it('should extract the last segment as the folder name', async () => {
			mockDB._mockAll.mockResolvedValueOnce({
				results: [{ folder: '/a/b/c/deep-folder', file_count: 1 }]
			});

			const folders = await getArchiveFolders(mockDB as any, 'bp-001');
			expect(folders[0].name).toBe('deep-folder');
		});
	});

	// ─── toggleFileStar ──────────────────────────────────────────

	describe('toggleFileStar', () => {
		it('should toggle star and return new state (starred)', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ is_starred: 1 });

			const result = await toggleFileStar(mockDB as any, 'fa-001');

			expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE file_archive'));
			expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining('is_starred'));
			expect(result).toBe(true);
		});

		it('should toggle star and return new state (unstarred)', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ is_starred: 0 });

			const result = await toggleFileStar(mockDB as any, 'fa-001');
			expect(result).toBe(false);
		});

		it('should return false when entry not found (null result)', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);

			const result = await toggleFileStar(mockDB as any, 'nonexistent');
			expect(result).toBe(false);
		});
	});

	// ─── updateFileArchiveEntry ──────────────────────────────────

	describe('updateFileArchiveEntry', () => {
		it('should update tags', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(mockRow({ tags: '["updated"]' }));

			const entry = await updateFileArchiveEntry(mockDB as any, 'fa-001', {
				tags: ['updated']
			});

			expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE file_archive'));
			expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining('tags = ?'));
			expect(entry!.tags).toEqual(['updated']);
		});

		it('should update description', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(mockRow({ description: 'New description' }));

			const entry = await updateFileArchiveEntry(mockDB as any, 'fa-001', {
				description: 'New description'
			});

			expect(entry!.description).toBe('New description');
		});

		it('should update folder', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(mockRow({ folder: '/custom/moved' }));

			const entry = await updateFileArchiveEntry(mockDB as any, 'fa-001', {
				folder: '/custom/moved'
			});

			expect(entry!.folder).toBe('/custom/moved');
		});

		it('should update fileName', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(mockRow({ file_name: 'renamed.png' }));

			const entry = await updateFileArchiveEntry(mockDB as any, 'fa-001', {
				fileName: 'renamed.png'
			});

			expect(entry!.fileName).toBe('renamed.png');
		});

		it('should return null when entry not found', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);

			const entry = await updateFileArchiveEntry(mockDB as any, 'nonexistent', {
				description: 'test'
			});

			expect(entry).toBeNull();
		});

		it('should always set updated_at', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(mockRow());

			await updateFileArchiveEntry(mockDB as any, 'fa-001', { description: 'x' });

			expect(mockDB.prepare).toHaveBeenCalledWith(
				expect.stringContaining("updated_at = datetime('now')")
			);
		});
	});

	// ─── deleteFileArchiveEntry ──────────────────────────────────

	describe('deleteFileArchiveEntry', () => {
		it('should delete by ID and return true', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({ id: 'fa-001' });

			const result = await deleteFileArchiveEntry(mockDB as any, 'fa-001');

			expect(mockDB.prepare).toHaveBeenCalledWith(
				expect.stringContaining('DELETE FROM file_archive')
			);
			expect(result).toBe(true);
		});

		it('should return false when entry not found', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);

			const result = await deleteFileArchiveEntry(mockDB as any, 'nonexistent');
			expect(result).toBe(false);
		});
	});

	// ─── getArchiveStats ─────────────────────────────────────────

	describe('getArchiveStats', () => {
		it('should return aggregate stats', async () => {
			// Mock the 4 parallel queries via Promise.all
			// The service calls .first() for totals, .all() for grouped counts
			// Because our mock reuses the same first/all on every prepare().bind(),
			// we can't distinguish them easily. So we test the return shape.
			// We override _mockFirst and _mockAll for each sequential call.

			const firstCalls = [
				{ count: 10, total_size: 5242880 } // totals
			];
			const allCalls = [
				{
					results: [
						{ file_type: 'image', count: 6 },
						{ file_type: 'video', count: 4 }
					]
				},
				{
					results: [
						{ source: 'user_upload', count: 7 },
						{ source: 'ai_generated', count: 3 }
					]
				},
				{
					results: [
						{ context: 'onboarding', count: 8 },
						{ context: 'chat', count: 2 }
					]
				}
			];

			let firstIdx = 0;
			let allIdx = 0;
			mockDB._mockFirst.mockImplementation(() => {
				return Promise.resolve(firstCalls[firstIdx++] || null);
			});
			mockDB._mockAll.mockImplementation(() => {
				return Promise.resolve(allCalls[allIdx++] || { results: [] });
			});

			const stats = await getArchiveStats(mockDB as any, 'bp-001');

			expect(stats.totalFiles).toBe(10);
			expect(stats.totalSize).toBe(5242880);
			expect(stats.byType).toEqual({ image: 6, video: 4 });
			expect(stats.bySource).toEqual({ user_upload: 7, ai_generated: 3 });
			expect(stats.byContext).toEqual({ onboarding: 8, chat: 2 });
		});

		it('should return zeros when archive is empty', async () => {
			mockDB._mockFirst.mockResolvedValue(null);
			mockDB._mockAll.mockResolvedValue({ results: [] });

			const stats = await getArchiveStats(mockDB as any, 'bp-001');

			expect(stats.totalFiles).toBe(0);
			expect(stats.totalSize).toBe(0);
			expect(stats.byType).toEqual({});
			expect(stats.bySource).toEqual({});
			expect(stats.byContext).toEqual({});
		});
	});
});
