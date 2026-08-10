/**
 * Tests for syncing brand profile field values to text assets
 * TDD: When a brand field is updated, a corresponding text asset should be created or updated
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	syncFieldToTextAsset,
	findBrandTextByKey,
	findBrandTextByAnyKey,
	findBrandTextsByAnyKey
} from '$lib/services/brand-assets';
import {
	FIELD_TO_TEXT_MAPPING,
	BRAND_FIELD_LABELS,
	updateBrandFieldWithVersion
} from '$lib/services/brand';

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

describe('Brand Field → Text Asset Sync', () => {
	let mockDB: ReturnType<typeof createMockDB>;

	beforeEach(() => {
		mockDB = createMockDB();
		vi.clearAllMocks();
	});

	describe('FIELD_TO_TEXT_MAPPING coverage', () => {
		it('should map brandName to names category', () => {
			expect(FIELD_TO_TEXT_MAPPING.brandName).toEqual({
				category: 'names',
				keys: ['brand_name', 'primary_name', 'company_name']
			});
		});

		it('should map tagline to messaging category', () => {
			expect(FIELD_TO_TEXT_MAPPING.tagline).toEqual({
				category: 'messaging',
				keys: ['tagline', 'slogan']
			});
		});

		it('should map toneOfVoice to voice category', () => {
			expect(FIELD_TO_TEXT_MAPPING.toneOfVoice).toEqual({
				category: 'voice',
				keys: ['tone', 'tone_of_voice', 'tone_guidelines']
			});
		});
	});

	describe('findBrandTextByKey', () => {
		it('should return null when no text exists with the given key', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);

			const result = await findBrandTextByKey(mockDB as any, 'profile-1', 'messaging', 'tagline');

			expect(result).toBeNull();
			expect(mockDB.prepare).toHaveBeenCalledWith(
				expect.stringContaining('SELECT * FROM brand_texts')
			);
		});

		it('should return the text when found', async () => {
			const mockRow = {
				id: 'text-1',
				brand_profile_id: 'profile-1',
				category: 'messaging',
				key: 'tagline',
				label: 'Tagline',
				value: 'Old tagline',
				language: 'en',
				sort_order: 0,
				metadata: null,
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};
			mockDB._mockFirst.mockResolvedValueOnce(mockRow);

			const result = await findBrandTextByKey(mockDB as any, 'profile-1', 'messaging', 'tagline');

			expect(result).not.toBeNull();
			expect(result!.id).toBe('text-1');
			expect(result!.value).toBe('Old tagline');
		});

		it('should scope the lookup by language when one is given', async () => {
			// brand_texts is UNIQUE on (brand_profile_id, category, key, language),
			// so a language-scoped lookup must name all four.
			mockDB._mockFirst.mockResolvedValueOnce(null);

			const result = await findBrandTextByKey(
				mockDB as any,
				'profile-1',
				'messaging',
				'tagline',
				'fr'
			);

			expect(result).toBeNull();
			expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining('language = ?'));
			expect(mockDB._mockBind).toHaveBeenCalledWith('profile-1', 'messaging', 'tagline', 'fr');
		});
	});

	describe('findBrandTextByAnyKey', () => {
		it('should return null without querying when given no keys', async () => {
			const result = await findBrandTextByAnyKey(mockDB as any, 'profile-1', 'messaging', []);

			expect(result).toBeNull();
			expect(mockDB.prepare).not.toHaveBeenCalled();
		});

		it('should prefer the canonical key when rows exist under several aliases', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);

			await findBrandTextByAnyKey(mockDB as any, 'profile-1', 'messaging', [
				'mission',
				'mission_statement'
			]);

			// The preference order is expressed in SQL, so the DB picks the winner
			expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining('ORDER BY CASE key'));
			expect(mockDB._mockBind).toHaveBeenCalledWith(
				'profile-1',
				'messaging',
				'mission',
				'mission_statement',
				'mission',
				'mission_statement'
			);
		});

		it('should scope alias lookup by language when one is given', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);

			await findBrandTextByAnyKey(
				mockDB as any,
				'profile-1',
				'messaging',
				['mission', 'mission_statement'],
				'fr'
			);

			expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining('language = ?'));
			expect(mockDB._mockBind).toHaveBeenCalledWith(
				'profile-1',
				'messaging',
				'fr',
				'mission',
				'mission_statement',
				'mission',
				'mission_statement'
			);
		});
	});

	describe('findBrandTextsByAnyKey', () => {
		it('returns an empty list without querying when given no aliases', async () => {
			const result = await findBrandTextsByAnyKey(mockDB as any, 'profile-1', 'messaging', []);

			expect(result).toEqual([]);
			expect(mockDB.prepare).not.toHaveBeenCalled();
		});

		it('maps a missing D1 results array to an empty list', async () => {
			mockDB._mockAll.mockResolvedValueOnce({});

			const result = await findBrandTextsByAnyKey(
				mockDB as any,
				'profile-1',
				'messaging',
				['mission'],
				'en'
			);

			expect(result).toEqual([]);
		});
	});

	describe('syncFieldToTextAsset', () => {
		it('should create a new text when no existing text matches', async () => {
			// No existing text found
			mockDB._mockFirst.mockResolvedValueOnce(null);

			await syncFieldToTextAsset(mockDB as any, {
				brandProfileId: 'profile-1',
				fieldName: 'tagline',
				value: 'Illuminate Your Journey'
			});

			// Should have called INSERT
			const insertCall = mockDB.prepare.mock.calls.find(
				(call: string[]) =>
					typeof call[0] === 'string' && call[0].includes('INSERT INTO brand_texts')
			);
			expect(insertCall).toBeDefined();
			expect(mockDB._mockBind).toHaveBeenCalledWith(
				'profile-1',
				'messaging',
				'en',
				'tagline',
				'slogan',
				'tagline',
				'slogan'
			);
		});

		it('should keep lookup and creation in the requested language', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);

			await syncFieldToTextAsset(mockDB as any, {
				brandProfileId: 'profile-1',
				fieldName: 'tagline',
				value: 'Éclairez votre parcours',
				language: 'fr'
			});

			expect(mockDB._mockBind).toHaveBeenCalledWith(
				'profile-1',
				'messaging',
				'fr',
				'tagline',
				'slogan',
				'tagline',
				'slogan'
			);
			const insertBind = mockDB._mockBind.mock.calls.find((args: unknown[]) =>
				args.includes('Éclairez votre parcours')
			);
			expect(insertBind).toContain('fr');
		});

		it('should update existing text when one matches the field key', async () => {
			// Existing text found
			const existingRow = {
				id: 'text-existing',
				brand_profile_id: 'profile-1',
				category: 'messaging',
				key: 'tagline',
				label: 'Tagline',
				value: 'Old value',
				language: 'en',
				sort_order: 0,
				metadata: null,
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};
			mockDB._mockFirst.mockResolvedValueOnce(existingRow);

			await syncFieldToTextAsset(mockDB as any, {
				brandProfileId: 'profile-1',
				fieldName: 'tagline',
				value: 'New tagline'
			});

			// Should have called UPDATE, not INSERT
			const updateCall = mockDB.prepare.mock.calls.find(
				(call: string[]) => typeof call[0] === 'string' && call[0].includes('UPDATE brand_texts')
			);
			expect(updateCall).toBeDefined();
		});

		it('should use the first key from FIELD_TO_TEXT_MAPPING as the default key', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);

			await syncFieldToTextAsset(mockDB as any, {
				brandProfileId: 'profile-1',
				fieldName: 'brandName',
				value: 'Nabu'
			});

			// brandName maps to category=names, first key=brand_name
			const bindArgs = mockDB._mockBind.mock.calls;
			// The INSERT bind should include 'names' category and 'brand_name' key
			const insertBindCall = bindArgs.find(
				(args: unknown[]) => args.includes('names') && args.includes('brand_name')
			);
			expect(insertBindCall).toBeDefined();
		});

		it('should use BRAND_FIELD_LABELS for the text label', async () => {
			mockDB._mockFirst.mockResolvedValueOnce(null);

			await syncFieldToTextAsset(mockDB as any, {
				brandProfileId: 'profile-1',
				fieldName: 'missionStatement',
				value: 'Our mission is...'
			});

			const bindArgs = mockDB._mockBind.mock.calls;
			const insertBindCall = bindArgs.find((args: unknown[]) => args.includes('Mission Statement'));
			expect(insertBindCall).toBeDefined();
		});

		it('should do nothing when field has no text mapping', async () => {
			await syncFieldToTextAsset(mockDB as any, {
				brandProfileId: 'profile-1',
				fieldName: 'primaryColor',
				value: '#FF0000'
			});

			// Should not have tried to find or create any text
			expect(mockDB.prepare).not.toHaveBeenCalled();
		});

		it('should clear the existing text asset when the field value is null', async () => {
			// Clearing a profile field must not leave stale content on the Text tab.
			const existingRow = {
				id: 'text-existing',
				brand_profile_id: 'profile-1',
				category: 'messaging',
				key: 'tagline',
				label: 'Tagline',
				value: 'Stale tagline',
				language: 'en',
				sort_order: 0,
				metadata: null,
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};
			mockDB._mockAll.mockResolvedValueOnce({ results: [existingRow] });

			await syncFieldToTextAsset(mockDB as any, {
				brandProfileId: 'profile-1',
				fieldName: 'tagline',
				value: null as any
			});

			const updateCall = mockDB.prepare.mock.calls.find(
				(call: string[]) => typeof call[0] === 'string' && call[0].includes('UPDATE brand_texts')
			);
			expect(updateCall).toBeDefined();
			// The blanking write binds the empty value, not the stale one
			const blankBind = mockDB._mockBind.mock.calls.find(
				(args: unknown[]) => args.includes('') && args.includes('text-existing')
			);
			expect(blankBind).toBeDefined();

			const insertCall = mockDB.prepare.mock.calls.find(
				(call: string[]) =>
					typeof call[0] === 'string' && call[0].includes('INSERT INTO brand_texts')
			);
			expect(insertCall).toBeUndefined();
		});

		it('should clear the existing text asset when the field value is an empty string', async () => {
			const existingRow = {
				id: 'text-existing',
				brand_profile_id: 'profile-1',
				category: 'messaging',
				key: 'tagline',
				label: 'Tagline',
				value: 'Stale tagline',
				language: 'en',
				sort_order: 0,
				metadata: null,
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};
			mockDB._mockAll.mockResolvedValueOnce({ results: [existingRow] });

			await syncFieldToTextAsset(mockDB as any, {
				brandProfileId: 'profile-1',
				fieldName: 'tagline',
				value: ''
			});

			const updateCall = mockDB.prepare.mock.calls.find(
				(call: string[]) => typeof call[0] === 'string' && call[0].includes('UPDATE brand_texts')
			);
			expect(updateCall).toBeDefined();
		});

		it('should not create an empty text asset when the field is cleared and none exists', async () => {
			// No existing asset — clearing an untouched field must stay a no-op write.
			mockDB._mockAll.mockResolvedValueOnce({ results: [] });

			await syncFieldToTextAsset(mockDB as any, {
				brandProfileId: 'profile-1',
				fieldName: 'tagline',
				value: ''
			});

			const insertCall = mockDB.prepare.mock.calls.find(
				(call: string[]) =>
					typeof call[0] === 'string' && call[0].includes('INSERT INTO brand_texts')
			);
			expect(insertCall).toBeUndefined();
			const updateCall = mockDB.prepare.mock.calls.find(
				(call: string[]) => typeof call[0] === 'string' && call[0].includes('UPDATE brand_texts')
			);
			expect(updateCall).toBeUndefined();
		});

		it('should clear every legacy alias and preserve a revision for each changed row', async () => {
			const baseRow = {
				brand_profile_id: 'profile-1',
				category: 'messaging',
				label: 'Mission Statement',
				language: 'en',
				sort_order: 0,
				metadata: null,
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};
			mockDB._mockAll.mockResolvedValueOnce({
				results: [
					{ ...baseRow, id: 'text-canonical', key: 'mission', value: 'Canonical value' },
					{ ...baseRow, id: 'text-alias', key: 'mission_statement', value: 'Legacy value' }
				]
			});

			await syncFieldToTextAsset(mockDB as any, {
				brandProfileId: 'profile-1',
				fieldName: 'missionStatement',
				value: '',
				userId: 'user-1',
				changeSource: 'manual',
				changeNote: 'Cleared from profile'
			});

			const blankWrites = mockDB._mockBind.mock.calls.filter(
				(args: unknown[]) => args[0] === '' && String(args[1]).startsWith('text-')
			);
			expect(blankWrites).toEqual([
				['', 'text-canonical'],
				['', 'text-alias']
			]);
			const revisionInserts = mockDB.prepare.mock.calls.filter(
				(call: string[]) =>
					typeof call[0] === 'string' && call[0].includes('INSERT INTO brand_text_revisions')
			);
			expect(revisionInserts).toHaveLength(2);
			const revisionWrites = mockDB._mockBind.mock.calls.filter(
				(args: unknown[]) =>
					args.includes('user-1') &&
					args.includes('manual') &&
					args.includes('Cleared from profile')
			);
			expect(revisionWrites).toHaveLength(2);
		});

		it('should update a text stored under an alias key instead of creating a duplicate', async () => {
			// missionStatement's canonical key is 'mission', but the Text tab preset
			// creates 'mission_statement'. Both name the same field, so the sync must
			// adopt the existing row rather than add a second one.
			const aliasRow = {
				id: 'text-alias',
				brand_profile_id: 'profile-1',
				category: 'messaging',
				key: 'mission_statement',
				label: 'Mission Statement',
				value: 'Old mission',
				language: 'en',
				sort_order: 0,
				metadata: null,
				created_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z'
			};
			mockDB._mockFirst.mockResolvedValueOnce(aliasRow);

			await syncFieldToTextAsset(mockDB as any, {
				brandProfileId: 'profile-1',
				fieldName: 'missionStatement',
				value: 'New mission'
			});

			const insertCall = mockDB.prepare.mock.calls.find(
				(call: string[]) =>
					typeof call[0] === 'string' && call[0].includes('INSERT INTO brand_texts')
			);
			expect(insertCall).toBeUndefined();

			const updateBind = mockDB._mockBind.mock.calls.find(
				(args: unknown[]) => args.includes('New mission') && args.includes('text-alias')
			);
			expect(updateBind).toBeDefined();

			// The lookup considers every key the field is known by
			const lookupBind = mockDB._mockBind.mock.calls.find(
				(args: unknown[]) => args.includes('mission') && args.includes('mission_statement')
			);
			expect(lookupBind).toBeDefined();
		});

		it('should handle all mapped fields correctly', () => {
			// Verify all mapped fields have valid categories
			for (const [fieldName, mapping] of Object.entries(FIELD_TO_TEXT_MAPPING)) {
				expect(mapping.category).toBeTruthy();
				expect(mapping.keys.length).toBeGreaterThan(0);
				expect(BRAND_FIELD_LABELS[fieldName]).toBeDefined();
			}
		});
	});

	describe('updateBrandFieldWithVersion source-preservation control', () => {
		it('still updates the profile and version when text-asset sync is disabled', async () => {
			mockDB._mockFirst
				.mockResolvedValueOnce({ tagline: 'Current source text' })
				.mockResolvedValueOnce({ max_version: 0 });

			await updateBrandFieldWithVersion(mockDB as any, {
				profileId: 'profile-1',
				userId: 'user-1',
				fieldName: 'tagline',
				newValue: 'Historical revision text',
				changeSource: 'manual',
				changeReason: 'Pushed from text revision',
				syncTextAsset: false
			});

			const sql = mockDB.prepare.mock.calls.map((call: string[]) => call[0]);
			expect(sql).toEqual(
				expect.arrayContaining([
					expect.stringContaining('UPDATE brand_profiles SET tagline = ?'),
					expect.stringContaining('INSERT INTO brand_field_versions')
				])
			);
			expect(sql.some((statement: string) => statement.includes('brand_texts'))).toBe(false);
		});
	});
});
