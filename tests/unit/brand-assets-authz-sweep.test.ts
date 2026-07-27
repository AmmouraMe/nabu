/**
 * Every remaining `/api/brand/assets/*` handler, driven by a stranger.
 *
 * The two headline IDORs (`generate`, `file`) have their own tests in
 * brand-assets-idor.test.ts. This covers the rest of the surface, which had the same
 * defect: a `brandProfileId` — or an asset id — taken from the request and trusted.
 *
 * The table is the point. One case per handler means a new route added without a
 * guard is a visible omission here rather than a silent hole.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/services/brand-assets', () => ({
	createBrandMedia: vi.fn(),
	getBrandMedia: vi.fn(async () => []),
	getBrandMediaByType: vi.fn(async () => []),
	getBrandMediaByCategory: vi.fn(async () => []),
	updateBrandMedia: vi.fn(),
	deleteBrandMedia: vi.fn(),
	getLogoAssets: vi.fn(async () => []),
	getBrandAssetSummary: vi.fn(async () => ({})),
	createBrandText: vi.fn(),
	getBrandTexts: vi.fn(async () => []),
	getBrandTextsByCategory: vi.fn(async () => []),
	updateBrandText: vi.fn(),
	deleteBrandText: vi.fn(),
	createMediaVariant: vi.fn(),
	getMediaVariants: vi.fn(async () => []),
	deleteMediaVariant: vi.fn()
}));
vi.mock('$lib/services/media-history', () => ({
	getMediaActivityLog: vi.fn(async () => []),
	getMediaActivityLogForAsset: vi.fn(async () => []),
	getMediaRevisions: vi.fn(async () => []),
	getCurrentRevision: vi.fn(),
	revertToRevision: vi.fn(),
	createMediaRevision: vi.fn(),
	logMediaActivity: vi.fn()
}));
vi.mock('$lib/services/text-history', () => ({
	getTextRevisions: vi.fn(async () => []),
	getCurrentTextRevision: vi.fn(),
	revertTextToRevision: vi.fn(),
	createTextRevision: vi.fn()
}));
vi.mock('$lib/services/brand', () => ({
	updateBrandFieldWithVersion: vi.fn(),
	getMatchingProfileField: vi.fn(() => ({ fieldName: 'tagline', fieldLabel: 'Tagline' })),
	getProfileFieldValue: vi.fn(async () => 'a secret tagline')
}));

import { withBrandAccess } from '../fixtures/brand-access';

const VICTIM = 'brand-of-victim';
const stranger = { user: { id: 'attacker', login: 'a', email: 'a@b.c', isOwner: false } };

/** A database where the brand and every asset belong to someone else. */
function strangerPlatform(extra: Record<string, unknown> = {}) {
	return {
		env: {
			DB: withBrandAccess({ prepare: vi.fn() }, { asStranger: true, brandProfileId: VICTIM }),
			BUCKET: { put: vi.fn(), get: vi.fn() },
			...extra
		},
		context: { waitUntil: vi.fn() }
	} as any;
}

function url(path: string, params: Record<string, string>) {
	const u = new URL(`http://localhost${path}`);
	for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
	return u;
}

function jsonRequest(body: unknown) {
	return new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) });
}

/**
 * Each case: the handler, and a call a stranger might make against another user's
 * brand or assets. All must be refused — never fulfilled.
 */
const CASES: Array<{
	name: string;
	route: string;
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	event: () => any;
}> = [
	{
		name: 'summary: counts of another brand’s assets',
		route: 'summary',
		method: 'GET',
		event: () => ({ url: url('/x', { brandProfileId: VICTIM }) })
	},
	{
		name: 'activity: another brand’s history',
		route: 'activity',
		method: 'GET',
		event: () => ({ url: url('/x', { brandProfileId: VICTIM }) })
	},
	{
		name: 'activity: history of an asset in another brand',
		route: 'activity',
		method: 'GET',
		event: () => ({ url: url('/x', { brandMediaId: 'm-1' }) })
	},
	{
		name: 'media: listing another brand’s media',
		route: 'media',
		method: 'GET',
		event: () => ({ url: url('/x', { brandProfileId: VICTIM }) })
	},
	{
		name: 'media: creating an asset in another brand',
		route: 'media',
		method: 'POST',
		event: () => ({
			request: jsonRequest({
				brandProfileId: VICTIM,
				mediaType: 'image',
				category: 'logo',
				name: 'x'
			})
		})
	},
	{
		name: 'media: editing another brand’s asset',
		route: 'media',
		method: 'PATCH',
		event: () => ({ request: jsonRequest({ id: 'm-1', name: 'renamed' }) })
	},
	{
		name: 'media: deleting another brand’s asset',
		route: 'media',
		method: 'DELETE',
		event: () => ({ url: url('/x', { id: 'm-1' }) })
	},
	{
		name: 'texts: listing another brand’s texts',
		route: 'texts',
		method: 'GET',
		event: () => ({ url: url('/x', { brandProfileId: VICTIM }) })
	},
	{
		name: 'texts: writing a text into another brand',
		route: 'texts',
		method: 'POST',
		event: () => ({
			request: jsonRequest({
				brandProfileId: VICTIM,
				category: 'core',
				key: 'tagline',
				label: 'Tagline',
				value: 'mine now'
			})
		})
	},
	{
		name: 'texts: editing another brand’s text',
		route: 'texts',
		method: 'PATCH',
		event: () => ({ request: jsonRequest({ id: 't-1', value: 'mine now' }) })
	},
	{
		name: 'texts: deleting another brand’s text',
		route: 'texts',
		method: 'DELETE',
		event: () => ({ url: url('/x', { id: 't-1' }) })
	},
	{
		name: 'texts/field-status: reading another brand’s field value',
		route: 'texts/field-status',
		method: 'GET',
		event: () => ({ url: url('/x', { brandProfileId: VICTIM, category: 'core', key: 'tagline' }) })
	},
	{
		name: 'texts/revisions: another text’s revision history',
		route: 'texts/revisions',
		method: 'GET',
		event: () => ({ url: url('/x', { brandTextId: 't-1' }) })
	},
	{
		name: 'texts/revisions: reverting another brand’s text',
		route: 'texts/revisions',
		method: 'POST',
		event: () => ({ request: jsonRequest({ action: 'revert', revisionId: 'r-1' }) })
	},
	{
		name: 'texts/revisions: adding a revision to another brand’s text',
		route: 'texts/revisions',
		method: 'POST',
		event: () => ({ request: jsonRequest({ brandTextId: 't-1', value: 'mine now' }) })
	},
	{
		name: 'revisions: another asset’s revision history',
		route: 'revisions',
		method: 'GET',
		event: () => ({ url: url('/x', { brandMediaId: 'm-1' }) })
	},
	{
		name: 'revisions: reverting another brand’s asset',
		route: 'revisions',
		method: 'POST',
		event: () => ({
			request: jsonRequest({ action: 'revert', revisionId: 'r-1', brandProfileId: VICTIM })
		})
	},
	{
		name: 'revisions: adding a revision to another brand’s asset',
		route: 'revisions',
		method: 'POST',
		event: () => ({
			request: jsonRequest({ brandMediaId: 'm-1', brandProfileId: VICTIM, source: 'upload' })
		})
	},
	{
		name: 'variants: listing another asset’s variants',
		route: 'variants',
		method: 'GET',
		event: () => ({ url: url('/x', { brandMediaId: 'm-1' }) })
	},
	{
		name: 'variants: adding a variant to another brand’s asset',
		route: 'variants',
		method: 'POST',
		event: () => ({
			request: jsonRequest({ brandMediaId: 'm-1', variantType: 'thumb', label: 'Thumb' })
		})
	},
	{
		name: 'variants: deleting another brand’s variant',
		route: 'variants',
		method: 'DELETE',
		event: () => ({ url: url('/x', { id: 'v-1' }) })
	}
];

describe('the rest of /api/brand/assets refuses a stranger', () => {
	for (const testCase of CASES) {
		it(testCase.name, async () => {
			const handlers = await import(`../../src/routes/api/brand/assets/${testCase.route}/+server`);
			const handler = handlers[testCase.method];
			expect(handler, `${testCase.method} ${testCase.route} has no handler`).toBeTypeOf('function');

			await expect(
				handler({ ...testCase.event(), platform: strangerPlatform(), locals: stranger })
			).rejects.toMatchObject({ status: 404 });
		});
	}
});

describe('upload', () => {
	it('will not write a file into another brand’s namespace', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/upload/+server');
		const platform = strangerPlatform();

		const form = new FormData();
		form.set('file', new File(['bytes'], 'logo.png', { type: 'image/png' }));
		form.set('brandProfileId', VICTIM);
		form.set('mediaType', 'image');
		form.set('category', 'logo');

		await expect(
			POST({
				request: new Request('http://localhost', { method: 'POST', body: form }),
				platform,
				locals: stranger
			} as any)
		).rejects.toMatchObject({ status: 404 });

		// The refusal must land before the write — an object in another brand's prefix
		// is exactly what this route was handing out.
		expect(platform.env.BUCKET.put).not.toHaveBeenCalled();
	});
});

describe('revisions cross-brand mismatch', () => {
	/** A database where the caller legitimately owns the asset's brand. */
	function ownerPlatform() {
		return {
			env: {
				DB: withBrandAccess({ prepare: vi.fn() }, { userId: 'owner', brandProfileId: 'my-brand' }),
				BUCKET: { put: vi.fn() }
			},
			context: { waitUntil: vi.fn() }
		} as any;
	}

	const owner = { user: { id: 'owner', login: 'o', email: 'o@b.c', isOwner: false } };

	it('refuses when the body names a different brand than the asset belongs to', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/revisions/+server');

		// The caller owns `my-brand` and the asset lives there — but they asked for the
		// activity to be logged against someone else's brand.
		await expect(
			POST({
				request: jsonRequest({
					brandMediaId: 'm-1',
					brandProfileId: 'someone-elses-brand',
					source: 'upload'
				}),
				platform: ownerPlatform(),
				locals: owner
			} as any)
		).rejects.toMatchObject({ status: 404 });
	});

	it('allows it when the body agrees with the asset’s real brand', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/revisions/+server');
		const { createMediaRevision } = await import('$lib/services/media-history');
		vi.mocked(createMediaRevision).mockResolvedValue({ id: 'rev-1', revisionNumber: 2 } as any);

		const res = await POST({
			request: jsonRequest({
				brandMediaId: 'm-1',
				brandProfileId: 'my-brand',
				source: 'upload'
			}),
			platform: ownerPlatform(),
			locals: owner
		} as any);

		expect(res.status).toBe(201);
	});
});
