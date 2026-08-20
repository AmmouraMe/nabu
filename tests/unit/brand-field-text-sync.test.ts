/**
 * Tests for syncing brand profile field values to text assets
 * TDD: When a brand field is updated, a corresponding text asset should be created or updated
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { syncFieldToTextAsset, findBrandTextByKey } from '$lib/services/brand-assets';
import { FIELD_TO_TEXT_MAPPING, BRAND_FIELD_LABELS } from '$lib/services/brand';

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

		it('should do nothing when value is null', async () => {
			await syncFieldToTextAsset(mockDB as any, {
				brandProfileId: 'profile-1',
				fieldName: 'tagline',
				value: null as any
			});

			expect(mockDB.prepare).not.toHaveBeenCalled();
		});

		it('should do nothing when value is empty string', async () => {
			await syncFieldToTextAsset(mockDB as any, {
				brandProfileId: 'profile-1',
				fieldName: 'tagline',
				value: ''
			});

			expect(mockDB.prepare).not.toHaveBeenCalled();
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
});
