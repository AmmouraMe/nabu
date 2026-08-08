/**
 * POST /api/brand/assets/texts must reuse an existing text asset rather than
 * blindly INSERTing a second row.
 *
 * brand_texts carries UNIQUE(brand_profile_id, category, key, language)
 * (migrations/0009), so a repeat POST of the same identity previously raised a
 * D1 constraint error instead of updating the row the caller meant to replace.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withBrandAccess } from '../fixtures/brand-access';

vi.mock('$lib/services/brand-assets', () => ({
	createBrandText: vi.fn(),
	getBrandTexts: vi.fn(),
	getBrandTextsByCategory: vi.fn(),
	updateBrandText: vi.fn(),
	deleteBrandText: vi.fn(),
	findBrandTextByKey: vi.fn()
}));

vi.mock('$lib/services/brand', () => ({
	updateBrandFieldWithVersion: vi.fn()
}));

import { createBrandText, updateBrandText, findBrandTextByKey } from '$lib/services/brand-assets';

const authedLocals = { user: { id: 'user-1' } };
const platform = { env: { DB: withBrandAccess({}, { userId: 'user-1' }) } };

function postRequest(body: Record<string, unknown>): Request {
	return new Request('http://localhost/api/brand/assets/texts', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
}

const baseBody = {
	brandProfileId: 'bp-1',
	category: 'messaging',
	key: 'tagline',
	label: 'Tagline',
	value: 'Illuminate your journey'
};

const existingText = {
	id: 'text-existing',
	brandProfileId: 'bp-1',
	category: 'messaging' as const,
	key: 'tagline',
	label: 'Tagline',
	value: 'Old tagline',
	language: 'en',
	sortOrder: 0,
	createdAt: '2025-01-01T00:00:00Z',
	updatedAt: '2025-01-01T00:00:00Z'
};

describe('POST /api/brand/assets/texts — upsert instead of duplicate insert', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(findBrandTextByKey).mockResolvedValue(null);
		vi.mocked(createBrandText).mockResolvedValue({ ...existingText, id: 'text-new' });
		vi.mocked(updateBrandText).mockResolvedValue(undefined);
	});

	it('creates a new text asset when none exists, returning 201', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/texts/+server');

		const res = await POST({
			request: postRequest(baseBody),
			platform,
			locals: authedLocals
		} as never);

		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data.created).toBe(true);
		expect(createBrandText).toHaveBeenCalledTimes(1);
		expect(updateBrandText).not.toHaveBeenCalled();
	});

	it('updates the existing asset instead of inserting a duplicate row', async () => {
		vi.mocked(findBrandTextByKey).mockResolvedValue(existingText);
		const { POST } = await import('../../src/routes/api/brand/assets/texts/+server');

		const res = await POST({
			request: postRequest(baseBody),
			platform,
			locals: authedLocals
		} as never);

		expect(createBrandText).not.toHaveBeenCalled();
		expect(updateBrandText).toHaveBeenCalledTimes(1);
		expect(vi.mocked(updateBrandText).mock.calls[0][1]).toBe('text-existing');
		expect(vi.mocked(updateBrandText).mock.calls[0][2]).toMatchObject({
			value: 'Illuminate your journey',
			label: 'Tagline',
			userId: 'user-1'
		});

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.created).toBe(false);
		expect(data.text.id).toBe('text-existing');
		expect(data.text.value).toBe('Illuminate your journey');
	});

	it('scopes the lookup by language, matching the table UNIQUE constraint', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/texts/+server');

		await POST({
			request: postRequest({ ...baseBody, language: 'fr' }),
			platform,
			locals: authedLocals
		} as never);

		expect(findBrandTextByKey).toHaveBeenCalledWith(
			expect.anything(),
			'bp-1',
			'messaging',
			'tagline',
			'fr'
		);
	});

	it('defaults the lookup language to en when the body omits it', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/texts/+server');

		await POST({
			request: postRequest(baseBody),
			platform,
			locals: authedLocals
		} as never);

		expect(findBrandTextByKey).toHaveBeenCalledWith(
			expect.anything(),
			'bp-1',
			'messaging',
			'tagline',
			'en'
		);
	});
});
