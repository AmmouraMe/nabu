/**
 * Branch coverage tests for Brand Assets Service
 * Targets: 65.97% branches → higher coverage
 * Focuses on: mapRowToText/Media/Variant null-coalescing branches,
 *   updateBrandText/Media per-field branches,
 *   createBrandMedia/Text defaults,
 *   getBrandAssetSummary null count rows
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	createBrandText,
	upsertBrandText,
	getBrandTexts,
	updateBrandText,
	createBrandMedia,
	getBrandMedia,
	getBrandMediaByType,
	getBrandMediaByCategory,
	getPrimaryMediaForCategory,
	updateBrandMedia,
	createMediaVariant,
	getMediaVariants,
	getLogoAssets,
	getBrandAssetSummary
} from '$lib/services/brand-assets';

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

describe('Brand Assets - Branch Coverage', () => {
	let mockDB: ReturnType<typeof createMockDB>;

	beforeEach(() => {
		mockDB = createMockDB();
		vi.clearAllMocks();
	});

	// ─── mapRowToText branches ───────────────────────────────

	describe('mapRowToText via getBrandTexts', () => {
		it('should map row with ALL fields populated', async () => {
			const rows = [
				{
					id: 'txt-1',
					brand_profile_id: 'bp-1',
					category: 'names',
					key: 'brand_name',
					label: 'Brand Name',
					value: 'Acme',
					language: 'en',
					sort_order: 5,
					metadata: JSON.stringify({ source: 'manual' }),
					created_at: '2026-01-01',
					updated_at: '2026-01-02'
				}
			];
			mockDB._mockAll.mockResolvedValueOnce({ results: rows });

			const result = await getBrandTexts(mockDB as any, 'bp-1');
			expect(result[0].sortOrder).toBe(5);
			expect(result[0].metadata).toEqual({ source: 'manual' });
		});

		it('should map row with null metadata and zero sort_order', async () => {
			const rows = [
				{
					id: 'txt-2',
					brand_profile_id: 'bp-1',
					category: 'messaging',
					key: 'tagline',
					label: 'Tagline',
					value: 'We build things',
					language: 'en',
					sort_order: 0,
					metadata: null,
					created_at: '2026-01-01',
					updated_at: '2026-01-02'
				}
			];
			mockDB._mockAll.mockResolvedValueOnce({ results: rows });

			const result = await getBrandTexts(mockDB as any, 'bp-1');
			expect(result[0].sortOrder).toBe(0);
			expect(result[0].metadata).toBeUndefined();
		});

		it('should map row with null sort_order (falsy → 0)', async () => {
			const rows = [
				{
					id: 'txt-3',
					brand_profile_id: 'bp-1',
					category: 'descriptions',
					key: 'bio',
					label: 'Bio',
					value: 'A company',
					language: 'es',
					sort_order: null,
					metadata: null,
					created_at: '2026-01-01',
					updated_at: '2026-01-02'
				}
			];
			mockDB._mockAll.mockResolvedValueOnce({ results: rows });

			const result = await getBrandTexts(mockDB as any, 'bp-1');
			expect(result[0].sortOrder).toBe(0);
			expect(result[0].language).toBe('es');
		});
	});

	// ─── mapRowToMedia branches ──────────────────────────────

	describe('mapRowToMedia via getBrandMedia', () => {
		it('should map row with ALL optional fields populated', async () => {
			const rows = [
				{
					id: 'media-1',
					brand_profile_id: 'bp-1',
					media_type: 'image',
					category: 'logo',
					name: 'Primary Logo',
					description: 'Our main logo',
					url: 'https://example.com/logo.png',
					r2_key: 'brands/bp-1/logo.png',
					mime_type: 'image/png',
					file_size: 102400,
					width: 1024,
					height: 1024,
					duration_seconds: null,
					tags: JSON.stringify(['primary', 'dark']),
					metadata: JSON.stringify({ source: 'ai' }),
					sort_order: 1,
					is_primary: 1,
					created_at: '2026-01-01',
					updated_at: '2026-01-02'
				}
			];
			mockDB._mockAll.mockResolvedValueOnce({ results: rows });

			const result = await getBrandMedia(mockDB as any, 'bp-1');
			expect(result[0].description).toBe('Our main logo');
			expect(result[0].url).toBe('https://example.com/logo.png');
			expect(result[0].r2Key).toBe('brands/bp-1/logo.png');
			expect(result[0].mimeType).toBe('image/png');
			expect(result[0].fileSize).toBe(102400);
			expect(result[0].width).toBe(1024);
			expect(result[0].height).toBe(1024);
			expect(result[0].durationSeconds).toBeUndefined();
			expect(result[0].tags).toEqual(['primary', 'dark']);
			expect(result[0].metadata).toEqual({ source: 'ai' });
			expect(result[0].sortOrder).toBe(1);
			expect(result[0].isPrimary).toBe(true);
		});

		it('should map row with ALL optional fields null (falsy branches)', async () => {
			const rows = [
				{
					id: 'media-2',
					brand_profile_id: 'bp-1',
					media_type: 'audio',
					category: 'sonic_identity',
					name: 'Sound Mark',
					description: null,
					url: null,
					r2_key: null,
					mime_type: null,
					file_size: null,
					width: null,
					height: null,
					duration_seconds: null,
					tags: null,
					metadata: null,
					sort_order: null,
					is_primary: 0,
					created_at: '2026-01-01',
					updated_at: '2026-01-02'
				}
			];
			mockDB._mockAll.mockResolvedValueOnce({ results: rows });

			const result = await getBrandMedia(mockDB as any, 'bp-1');
			expect(result[0].description).toBeUndefined();
			expect(result[0].url).toBeUndefined();
			expect(result[0].r2Key).toBeUndefined();
			expect(result[0].mimeType).toBeUndefined();
			expect(result[0].fileSize).toBeUndefined();
			expect(result[0].width).toBeUndefined();
			expect(result[0].height).toBeUndefined();
			expect(result[0].durationSeconds).toBeUndefined();
			expect(result[0].tags).toBeUndefined();
			expect(result[0].metadata).toBeUndefined();
			expect(result[0].sortOrder).toBe(0);
			expect(result[0].isPrimary).toBe(false);
		});

		it('should map row with empty-string optional fields', async () => {
			const rows = [
				{
					id: 'media-3',
					brand_profile_id: 'bp-1',
					media_type: 'video',
					category: 'brand',
					name: 'Intro',
					description: '',
					url: '',
					r2_key: '',
					mime_type: '',
					file_size: 0,
					width: 0,
					height: 0,
					duration_seconds: 0,
					tags: null,
					metadata: null,
					sort_order: 0,
					is_primary: 0,
					created_at: '2026-01-01',
					updated_at: '2026-01-02'
				}
			];
			mockDB._mockAll.mockResolvedValueOnce({ results: rows });

			const result = await getBrandMedia(mockDB as any, 'bp-1');
			// Empty strings => || undefined
			expect(result[0].description).toBeUndefined();
			expect(result[0].url).toBeUndefined();
			expect(result[0].r2Key).toBeUndefined();
			expect(result[0].mimeType).toBeUndefined();
			expect(result[0].fileSize).toBeUndefined();
			expect(result[0].width).toBeUndefined();
			expect(result[0].height).toBeUndefined();
			expect(result[0].durationSeconds).toBeUndefined();
		});

		it('should map duration_seconds for audio/video', async () => {
			const rows = [
				{
					id: 'media-4',
					brand_profile_id: 'bp-1',
					media_type: 'audio',
					category: 'music',
					name: 'Jingle',
					description: null,
					url: 'https://example.com/jingle.mp3',
					r2_key: null,
					mime_type: 'audio/mpeg',
					file_size: 512000,
					width: null,
					height: null,
					duration_seconds: 30,
					tags: null,
					metadata: null,
					sort_order: 0,
					is_primary: 0,
					created_at: '2026-01-01',
					updated_at: '2026-01-02'
				}
			];
			mockDB._mockAll.mockResolvedValueOnce({ results: rows });

			const result = await getBrandMedia(mockDB as any, 'bp-1');
			expect(result[0].durationSeconds).toBe(30);
		});
	});

	// ─── mapRowToVariant branches ────────────────────────────

	describe('mapRowToVariant via getMediaVariants', () => {
		it('should map variant with ALL fields populated', async () => {
			const rows = [
				{
					id: 'var-1',
					brand_media_id: 'media-1',
					variant_type: 'size',
					label: '256x256',
					url: 'https://example.com/small.png',
					r2_key: 'brands/bp-1/small.png',
					mime_type: 'image/png',
					file_size: 10240,
					width: 256,
					height: 256,
					metadata: JSON.stringify({ resized: true }),
					created_at: '2026-01-01'
				}
			];
			mockDB._mockAll.mockResolvedValueOnce({ results: rows });

			const result = await getMediaVariants(mockDB as any, 'media-1');
			expect(result[0].url).toBe('https://example.com/small.png');
			expect(result[0].r2Key).toBe('brands/bp-1/small.png');
			expect(result[0].mimeType).toBe('image/png');
			expect(result[0].fileSize).toBe(10240);
			expect(result[0].width).toBe(256);
			expect(result[0].height).toBe(256);
			expect(result[0].metadata).toEqual({ resized: true });
		});

		it('should map variant with ALL optional fields null', async () => {
			const rows = [
				{
					id: 'var-2',
					brand_media_id: 'media-1',
					variant_type: 'color_mode',
					label: 'grayscale',
					url: null,
					r2_key: null,
					mime_type: null,
					file_size: null,
					width: null,
					height: null,
					metadata: null,
					created_at: '2026-01-01'
				}
			];
			mockDB._mockAll.mockResolvedValueOnce({ results: rows });

			const result = await getMediaVariants(mockDB as any, 'media-1');
			expect(result[0].url).toBeUndefined();
			expect(result[0].r2Key).toBeUndefined();
			expect(result[0].mimeType).toBeUndefined();
			expect(result[0].fileSize).toBeUndefined();
			expect(result[0].width).toBeUndefined();
			expect(result[0].height).toBeUndefined();
			expect(result[0].metadata).toBeUndefined();
		});
	});

	// ─── updateBrandText per-field branches ──────────────────

	describe('updateBrandText - per-field branches', () => {
		it('should update only value', async () => {
			await updateBrandText(mockDB as any, 'txt-1', { value: 'New Value' });

			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('value = ?');
			expect(sql).not.toContain('label = ?');
			expect(sql).not.toContain('sort_order = ?');
			expect(sql).not.toContain('metadata = ?');
		});

		it('should update only label', async () => {
			await updateBrandText(mockDB as any, 'txt-1', { label: 'New Label' });

			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('label = ?');
			expect(sql).not.toContain('value = ?');
		});

		it('should update only sortOrder', async () => {
			await updateBrandText(mockDB as any, 'txt-1', { sortOrder: 10 });

			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('sort_order = ?');
			expect(sql).not.toContain('value = ?');
		});

		it('should update only metadata', async () => {
			await updateBrandText(mockDB as any, 'txt-1', { metadata: { key: 'val' } });

			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('metadata = ?');
			expect(sql).not.toContain('value = ?');
		});

		it('should do nothing when params is empty (0 sets branch)', async () => {
			await updateBrandText(mockDB as any, 'txt-1', {});

			// Should not even call prepare when sets.length === 0
			expect(mockDB.prepare).not.toHaveBeenCalled();
		});

		it('should update all fields at once', async () => {
			await updateBrandText(mockDB as any, 'txt-1', {
				value: 'New',
				label: 'New Label',
				sortOrder: 5,
				metadata: { x: 1 }
			});

			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('value = ?');
			expect(sql).toContain('label = ?');
			expect(sql).toContain('sort_order = ?');
			expect(sql).toContain('metadata = ?');
			expect(sql).toContain("updated_at = datetime('now')");
		});
	});

	// ─── updateBrandMedia per-field branches ─────────────────

	describe('updateBrandMedia - per-field branches', () => {
		it('should update only name', async () => {
			await updateBrandMedia(mockDB as any, 'media-1', { name: 'New Name' });
			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('name = ?');
		});

		it('should update only description', async () => {
			await updateBrandMedia(mockDB as any, 'media-1', { description: 'Desc' });
			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('description = ?');
		});

		it('should update only url', async () => {
			await updateBrandMedia(mockDB as any, 'media-1', { url: 'https://new.com/img.png' });
			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('url = ?');
		});

		it('should update only r2Key', async () => {
			await updateBrandMedia(mockDB as any, 'media-1', { r2Key: 'brands/new.png' });
			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('r2_key = ?');
		});

		it('should update only mimeType', async () => {
			await updateBrandMedia(mockDB as any, 'media-1', { mimeType: 'image/webp' });
			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('mime_type = ?');
		});

		it('should update only fileSize', async () => {
			await updateBrandMedia(mockDB as any, 'media-1', { fileSize: 5000 });
			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('file_size = ?');
		});

		it('should update only width', async () => {
			await updateBrandMedia(mockDB as any, 'media-1', { width: 800 });
			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('width = ?');
		});

		it('should update only height', async () => {
			await updateBrandMedia(mockDB as any, 'media-1', { height: 600 });
			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('height = ?');
		});

		it('should update only durationSeconds', async () => {
			await updateBrandMedia(mockDB as any, 'media-1', { durationSeconds: 120 });
			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('duration_seconds = ?');
		});

		it('should update only tags', async () => {
			await updateBrandMedia(mockDB as any, 'media-1', { tags: ['new', 'tag'] });
			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('tags = ?');
		});

		it('should update only metadata', async () => {
			await updateBrandMedia(mockDB as any, 'media-1', { metadata: { source: 'ai' } });
			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('metadata = ?');
		});

		it('should update only sortOrder', async () => {
			await updateBrandMedia(mockDB as any, 'media-1', { sortOrder: 3 });
			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('sort_order = ?');
		});

		it('should update only isPrimary', async () => {
			await updateBrandMedia(mockDB as any, 'media-1', { isPrimary: true });
			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('is_primary = ?');
		});

		it('should do nothing when params is empty (0 sets branch)', async () => {
			await updateBrandMedia(mockDB as any, 'media-1', {});
			expect(mockDB.prepare).not.toHaveBeenCalled();
		});

		it('should update ALL fields at once', async () => {
			await updateBrandMedia(mockDB as any, 'media-1', {
				name: 'New',
				description: 'Desc',
				url: 'https://new.com',
				r2Key: 'new.png',
				mimeType: 'image/png',
				fileSize: 999,
				width: 100,
				height: 100,
				durationSeconds: 60,
				tags: ['a'],
				metadata: { b: 1 },
				sortOrder: 1,
				isPrimary: false
			});

			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(sql).toContain('name = ?');
			expect(sql).toContain('description = ?');
			expect(sql).toContain('url = ?');
			expect(sql).toContain('r2_key = ?');
			expect(sql).toContain('mime_type = ?');
			expect(sql).toContain('file_size = ?');
			expect(sql).toContain('width = ?');
			expect(sql).toContain('height = ?');
			expect(sql).toContain('duration_seconds = ?');
			expect(sql).toContain('tags = ?');
			expect(sql).toContain('metadata = ?');
			expect(sql).toContain('sort_order = ?');
			expect(sql).toContain('is_primary = ?');
			expect(sql).toContain("updated_at = datetime('now')");
		});
	});

	// ─── createBrandText defaults ────────────────────────────

	describe('createBrandText - default branches', () => {
		it('should default language to en when not provided', async () => {
			const result = await createBrandText(mockDB as any, {
				brandProfileId: 'bp-1',
				category: 'names',
				key: 'brand_name',
				label: 'Brand Name',
				value: 'Acme'
			});

			expect(result.language).toBe('en');
			expect(result.sortOrder).toBe(0);
			expect(result.metadata).toBeUndefined();
		});

		it('should use provided language and metadata', async () => {
			const result = await createBrandText(mockDB as any, {
				brandProfileId: 'bp-1',
				category: 'names',
				key: 'brand_name',
				label: 'Nom de Marque',
				value: 'Acmé',
				language: 'fr',
				sortOrder: 5,
				metadata: { translated: true }
			});

			expect(result.language).toBe('fr');
			expect(result.sortOrder).toBe(5);
			expect(result.metadata).toEqual({ translated: true });
		});
	});

	describe('upsertBrandText', () => {
		it('uses one conflict-safe statement and returns the persisted update row', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({
				id: 'txt-existing',
				brand_profile_id: 'bp-1',
				category: 'messaging',
				key: 'tagline',
				label: 'Tagline',
				value: 'New value',
				language: 'en',
				sort_order: 0,
				metadata: null,
				created_at: '2026-01-01',
				updated_at: '2026-08-10 07:01:00'
			});

			const result = await upsertBrandText(mockDB as any, {
				brandProfileId: 'bp-1',
				category: 'messaging',
				key: 'tagline',
				label: 'Tagline',
				value: 'New value'
			});

			const sql = mockDB.prepare.mock.calls[0][0] as string;
			expect(mockDB.prepare).toHaveBeenCalledTimes(1);
			expect(sql).toContain('ON CONFLICT(brand_profile_id, category, key, language)');
			expect(sql).toContain("datetime('now')");
			expect(sql).toContain('RETURNING *');
			expect(result.created).toBe(false);
			expect(result.text.updatedAt).toBe('2026-08-10 07:01:00');
		});

		it('recognizes its generated id as a new row', async () => {
			const generatedId = '00000000-0000-4000-8000-000000000001';
			const randomUUID = vi.spyOn(crypto, 'randomUUID').mockReturnValue(generatedId);
			mockDB._mockFirst.mockResolvedValueOnce({
				id: generatedId,
				brand_profile_id: 'bp-1',
				category: 'names',
				key: 'brand_name',
				label: 'Brand Name',
				value: 'Nabu',
				language: 'en',
				sort_order: 0,
				metadata: null,
				created_at: '2026-08-10',
				updated_at: '2026-08-10'
			});

			const result = await upsertBrandText(mockDB as any, {
				brandProfileId: 'bp-1',
				category: 'names',
				key: 'brand_name',
				label: 'Brand Name',
				value: 'Nabu',
				userId: 'user-1'
			});

			expect(result.created).toBe(true);
			expect(mockDB._mockBind).toHaveBeenCalledWith(
				expect.any(String),
				generatedId,
				1,
				'Nabu',
				'Brand Name',
				'manual',
				'user-1',
				'Initial version',
				expect.any(String)
			);
			randomUUID.mockRestore();
		});

		it('records revision context against the persisted existing row', async () => {
			mockDB._mockFirst
				.mockResolvedValueOnce({
					id: 'txt-existing',
					brand_profile_id: 'bp-1',
					category: 'messaging',
					key: 'tagline',
					label: 'Tagline',
					value: 'Valeur enregistrée',
					language: 'fr',
					sort_order: 2,
					metadata: '{"source":"api"}',
					created_at: '2026-08-10 07:00:00',
					updated_at: '2026-08-10 07:02:00'
				})
				.mockResolvedValueOnce({ count: 1 });

			const result = await upsertBrandText(mockDB as any, {
				brandProfileId: 'bp-1',
				category: 'messaging',
				key: 'tagline',
				label: 'Tagline',
				value: 'Valeur enregistrée',
				language: 'fr',
				sortOrder: 2,
				metadata: { source: 'api' },
				userId: 'user-1',
				changeSource: 'import'
			});

			expect(result.created).toBe(false);
			expect(result.text.id).toBe('txt-existing');
			const revisionWrite = mockDB._mockBind.mock.calls.find(
				(args: unknown[]) =>
					args.includes('txt-existing') &&
					args.includes('Valeur enregistrée') &&
					args.includes('import') &&
					args.includes('user-1')
			);
			expect(revisionWrite).toBeDefined();
		});

		it('fails explicitly when SQLite returns no persisted row', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);

			await expect(
				upsertBrandText(mockDB as any, {
					brandProfileId: 'bp-1',
					category: 'names',
					key: 'brand_name',
					label: 'Brand Name',
					value: 'Nabu'
				})
			).rejects.toThrow('Brand text upsert did not return a persisted row');
		});
	});

	// ─── createBrandMedia defaults ───────────────────────────

	describe('createBrandMedia - default branches', () => {
		it('should default sortOrder, isPrimary, tags, metadata when not provided', async () => {
			const result = await createBrandMedia(mockDB as any, {
				brandProfileId: 'bp-1',
				mediaType: 'image',
				category: 'logo',
				name: 'Logo'
			});

			expect(result.sortOrder).toBe(0);
			expect(result.isPrimary).toBe(false);
			expect(result.tags).toBeUndefined();
			expect(result.metadata).toBeUndefined();
			expect(result.description).toBeUndefined();
			expect(result.url).toBeUndefined();
			expect(result.r2Key).toBeUndefined();
			expect(result.mimeType).toBeUndefined();
			expect(result.fileSize).toBeUndefined();
			expect(result.width).toBeUndefined();
			expect(result.height).toBeUndefined();
			expect(result.durationSeconds).toBeUndefined();
		});

		it('should use provided tags and metadata', async () => {
			const result = await createBrandMedia(mockDB as any, {
				brandProfileId: 'bp-1',
				mediaType: 'image',
				category: 'logo',
				name: 'Logo',
				tags: ['primary', 'dark'],
				metadata: { source: 'ai' },
				isPrimary: true,
				sortOrder: 3,
				description: 'Main logo',
				url: 'https://example.com/logo.png',
				r2Key: 'brands/logo.png',
				mimeType: 'image/png',
				fileSize: 10000,
				width: 512,
				height: 512,
				durationSeconds: undefined
			});

			expect(result.tags).toEqual(['primary', 'dark']);
			expect(result.metadata).toEqual({ source: 'ai' });
			expect(result.isPrimary).toBe(true);
			expect(result.sortOrder).toBe(3);
			expect(result.description).toBe('Main logo');
		});
	});

	// ─── createMediaVariant defaults ─────────────────────────

	describe('createMediaVariant - default branches', () => {
		it('should create variant with no optional fields', async () => {
			const result = await createMediaVariant(mockDB as any, {
				brandMediaId: 'media-1',
				variantType: 'size',
				label: 'thumbnail'
			});

			expect(result.url).toBeUndefined();
			expect(result.r2Key).toBeUndefined();
			expect(result.mimeType).toBeUndefined();
			expect(result.fileSize).toBeUndefined();
			expect(result.width).toBeUndefined();
			expect(result.height).toBeUndefined();
			expect(result.metadata).toBeUndefined();
		});

		it('should create variant with ALL optional fields', async () => {
			const result = await createMediaVariant(mockDB as any, {
				brandMediaId: 'media-1',
				variantType: 'format',
				label: 'webp',
				url: 'https://example.com/logo.webp',
				r2Key: 'brands/logo.webp',
				mimeType: 'image/webp',
				fileSize: 5000,
				width: 256,
				height: 256,
				metadata: { converted: true }
			});

			expect(result.url).toBe('https://example.com/logo.webp');
			expect(result.metadata).toEqual({ converted: true });
		});
	});

	// ─── getBrandAssetSummary null count rows ────────────────

	describe('getBrandAssetSummary - null count rows', () => {
		it('should handle null count rows for all types (? ?? 0 branch)', async () => {
			// All first() calls return null (no row found)
			mockDB._mockFirst.mockResolvedValue(null);

			const result = await getBrandAssetSummary(mockDB as any, 'bp-empty');
			expect(result.textCount).toBe(0);
			expect(result.imageCount).toBe(0);
			expect(result.audioCount).toBe(0);
			expect(result.videoCount).toBe(0);
			expect(result.videoGenerationsCount).toBe(0);
			expect(result.totalCount).toBe(0);
		});

		it('should handle rows with count values', async () => {
			// Return specific counts for each first() call
			mockDB._mockFirst
				.mockResolvedValueOnce({ count: 10 }) // texts
				.mockResolvedValueOnce({ count: 5 }) // images
				.mockResolvedValueOnce({ count: 3 }) // audio
				.mockResolvedValueOnce({ count: 2 }) // video
				.mockResolvedValueOnce({ count: 7 }); // video generations

			const result = await getBrandAssetSummary(mockDB as any, 'bp-1');
			expect(result.textCount).toBe(10);
			expect(result.imageCount).toBe(5);
			expect(result.audioCount).toBe(3);
			expect(result.videoCount).toBe(2);
			expect(result.videoGenerationsCount).toBe(7);
			expect(result.totalCount).toBe(20);
		});

		it('should handle mixed null and populated count rows', async () => {
			mockDB._mockFirst
				.mockResolvedValueOnce({ count: 5 }) // texts
				.mockResolvedValueOnce(null) // images - null
				.mockResolvedValueOnce({ count: 1 }) // audio
				.mockResolvedValueOnce(null) // video - null
				.mockResolvedValueOnce(null); // video generations - null

			const result = await getBrandAssetSummary(mockDB as any, 'bp-1');
			expect(result.textCount).toBe(5);
			expect(result.imageCount).toBe(0);
			expect(result.audioCount).toBe(1);
			expect(result.videoCount).toBe(0);
			expect(result.videoGenerationsCount).toBe(0);
			expect(result.totalCount).toBe(6);
		});
	});

	// ─── getPrimaryMediaForCategory null branch ──────────────

	describe('getPrimaryMediaForCategory - null return branch', () => {
		it('should return null when no primary media found', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);

			const result = await getPrimaryMediaForCategory(mockDB as any, 'bp-1', 'image', 'logo');
			expect(result).toBeNull();
		});

		it('should return mapped media when primary found', async () => {
			mockDB._mockFirst.mockResolvedValueOnce({
				id: 'media-1',
				brand_profile_id: 'bp-1',
				media_type: 'image',
				category: 'logo',
				name: 'Logo',
				description: null,
				url: 'https://example.com/logo.png',
				r2_key: null,
				mime_type: 'image/png',
				file_size: 10000,
				width: 512,
				height: 512,
				duration_seconds: null,
				tags: null,
				metadata: null,
				sort_order: 0,
				is_primary: 1,
				created_at: '2026-01-01',
				updated_at: '2026-01-02'
			});

			const result = await getPrimaryMediaForCategory(mockDB as any, 'bp-1', 'image', 'logo');
			expect(result).not.toBeNull();
			expect(result!.isPrimary).toBe(true);
			expect(result!.name).toBe('Logo');
		});
	});
});
