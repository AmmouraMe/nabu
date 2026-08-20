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
	getBrandTexts: vi.fn(),
	getBrandTextsByCategory: vi.fn(),
	upsertBrandText: vi.fn(),
	updateBrandText: vi.fn(),
	deleteBrandText: vi.fn()
}));

vi.mock('$lib/services/brand', () => ({
	updateBrandFieldWithVersion: vi.fn()
}));

import { upsertBrandText } from '$lib/services/brand-assets';

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
		vi.mocked(upsertBrandText).mockResolvedValue({
			text: {
				...existingText,
				id: 'text-new',
				value: 'Illuminate your journey',
				updatedAt: '2026-08-10 07:00:00'
			},
			created: true
		});
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
		expect(upsertBrandText).toHaveBeenCalledTimes(1);
		expect(data.text.updatedAt).toBe('2026-08-10 07:00:00');
	});

	it('updates the existing asset instead of inserting a duplicate row', async () => {
		vi.mocked(upsertBrandText).mockResolvedValue({
			text: {
				...existingText,
				value: 'Illuminate your journey',
				updatedAt: '2026-08-10 07:01:00'
			},
			created: false
		});
		const { POST } = await import('../../src/routes/api/brand/assets/texts/+server');

		const res = await POST({
			request: postRequest(baseBody),
			platform,
			locals: authedLocals
		} as never);

		expect(upsertBrandText).toHaveBeenCalledTimes(1);
		expect(vi.mocked(upsertBrandText).mock.calls[0][1]).toMatchObject({
			brandProfileId: 'bp-1',
			category: 'messaging',
			key: 'tagline',
			value: 'Illuminate your journey',
			label: 'Tagline',
			userId: 'user-1'
		});

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.created).toBe(false);
		expect(data.text.id).toBe('text-existing');
		expect(data.text.value).toBe('Illuminate your journey');
		expect(data.text.updatedAt).toBe('2026-08-10 07:01:00');
	});

	it('scopes the lookup by language, matching the table UNIQUE constraint', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/texts/+server');

		await POST({
			request: postRequest({ ...baseBody, language: 'fr' }),
			platform,
			locals: authedLocals
		} as never);

		expect(upsertBrandText).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ language: 'fr' })
		);
	});

	it('defaults the lookup language to en when the body omits it', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/texts/+server');

		await POST({
			request: postRequest(baseBody),
			platform,
			locals: authedLocals
		} as never);

		expect(upsertBrandText).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ language: 'en' })
		);
	});
});
