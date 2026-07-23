/**
 * Branch coverage for two nearly-untested admin routes:
 *   api/admin/brands/[id]/access  (GET/POST/PATCH/DELETE)
 *   api/admin/core-principle-questions{,/[id]}
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/services/brand-admin', () => ({
	getBrandAccess: vi.fn(),
	grantBrandAccess: vi.fn(),
	updateBrandAccess: vi.fn(),
	revokeBrandAccess: vi.fn()
}));
vi.mock('$lib/services/core-principle-questions', () => ({
	listCorePrincipleQuestions: vi.fn()
}));

const owner = { user: { id: 'u1', isOwner: true } };
const adminOnly = { user: { id: 'u1', isAdmin: true } };
const plain = { user: { id: 'u1' } };
const anon = { user: null };

const req = (body: any) => ({ json: async () => body });
const dbOK = () => ({
	prepare: vi.fn().mockReturnValue({
		bind: vi.fn().mockReturnValue({
			run: vi.fn().mockResolvedValue({ success: true }),
			first: vi.fn().mockResolvedValue({ maxSortOrder: 2 })
		}),
		first: vi.fn().mockResolvedValue({ maxSortOrder: 2 })
	})
});

beforeEach(() => {
	vi.clearAllMocks();
});

describe('api/admin/brands/[id]/access', () => {
	let mod: any;
	let svc: any;
	beforeEach(async () => {
		mod = await import('../../src/routes/api/admin/brands/[id]/access/+server');
		svc = await import('$lib/services/brand-admin');
	});

	const ctx = (over: any = {}) => ({
		platform: { env: { DB: dbOK() } },
		locals: adminOnly,
		params: { id: 'b1' },
		...over
	});

	it('all verbs 401 without a user and 403 for a non-admin', async () => {
		for (const verb of ['GET', 'POST', 'PATCH', 'DELETE']) {
			await expect(mod[verb](ctx({ locals: anon, request: req({}) }))).rejects.toMatchObject({
				status: 401
			});
			await expect(mod[verb](ctx({ locals: plain, request: req({}) }))).rejects.toMatchObject({
				status: 403
			});
		}
	});

	it('all verbs 500 without a database', async () => {
		for (const verb of ['GET', 'POST', 'PATCH', 'DELETE']) {
			await expect(
				mod[verb](
					ctx({
						platform: { env: {} },
						request: req({ userId: 'u2', accessId: 'a1', role: 'viewer' })
					})
				)
			).rejects.toMatchObject({ status: 500 });
		}
	});

	it('GET returns access rows and wraps service errors in 500', async () => {
		vi.mocked(svc.getBrandAccess).mockResolvedValueOnce([{ id: 'a1' }]);
		const res = await mod.GET(ctx());
		expect((await res.json()).access).toHaveLength(1);

		vi.mocked(svc.getBrandAccess).mockRejectedValueOnce(new Error('db down'));
		await expect(mod.GET(ctx())).rejects.toMatchObject({ status: 500 });
	});

	it('POST validates userId and role, defaults to viewer, and maps UNIQUE violations', async () => {
		await expect(mod.POST(ctx({ request: req({}) }))).rejects.toMatchObject({ status: 400 });
		await expect(
			mod.POST(ctx({ request: req({ userId: 'u2', role: 'king' }) }))
		).rejects.toMatchObject({ status: 400 });

		vi.mocked(svc.grantBrandAccess).mockResolvedValueOnce('acc1');
		const res = await mod.POST(ctx({ request: req({ userId: 'u2' }) }));
		expect(await res.json()).toEqual({ success: true, accessId: 'acc1' });
		expect(svc.grantBrandAccess).toHaveBeenCalledWith(
			expect.anything(),
			'b1',
			'u2',
			'u1',
			'viewer'
		);

		vi.mocked(svc.grantBrandAccess).mockRejectedValueOnce(new Error('UNIQUE constraint failed'));
		await expect(mod.POST(ctx({ request: req({ userId: 'u2' }) }))).rejects.toMatchObject({
			status: 400
		});

		vi.mocked(svc.grantBrandAccess).mockRejectedValueOnce(new Error('other'));
		await expect(mod.POST(ctx({ request: req({ userId: 'u2' }) }))).rejects.toMatchObject({
			status: 500
		});
	});

	it('PATCH requires accessId and a valid role', async () => {
		await expect(mod.PATCH(ctx({ request: req({}) }))).rejects.toMatchObject({ status: 400 });
		await expect(mod.PATCH(ctx({ request: req({ accessId: 'a1' }) }))).rejects.toMatchObject({
			status: 400
		});
		await expect(
			mod.PATCH(ctx({ request: req({ accessId: 'a1', role: 'nope' }) }))
		).rejects.toMatchObject({ status: 400 });

		const res = await mod.PATCH(ctx({ request: req({ accessId: 'a1', role: 'editor' }) }));
		expect(await res.json()).toEqual({ success: true });

		vi.mocked(svc.updateBrandAccess).mockRejectedValueOnce(new Error('x'));
		await expect(
			mod.PATCH(ctx({ request: req({ accessId: 'a1', role: 'editor' }) }))
		).rejects.toMatchObject({ status: 500 });
	});

	it('DELETE requires accessId and revokes', async () => {
		await expect(mod.DELETE(ctx({ request: req({}) }))).rejects.toMatchObject({ status: 400 });
		const res = await mod.DELETE(ctx({ request: req({ accessId: 'a1' }) }));
		expect(await res.json()).toEqual({ success: true });

		vi.mocked(svc.revokeBrandAccess).mockRejectedValueOnce(new Error('x'));
		await expect(mod.DELETE(ctx({ request: req({ accessId: 'a1' }) }))).rejects.toMatchObject({
			status: 500
		});
	});
});

describe('api/admin/core-principle-questions', () => {
	let mod: any;
	let svc: any;
	beforeEach(async () => {
		mod = await import('../../src/routes/api/admin/core-principle-questions/+server');
		svc = await import('$lib/services/core-principle-questions');
	});
	const ctx = (over: any = {}) => ({ platform: { env: { DB: dbOK() } }, locals: owner, ...over });

	it('requires a superadmin (401 anon, 403 admin-but-not-owner)', async () => {
		await expect(mod.GET(ctx({ locals: anon }))).rejects.toMatchObject({ status: 401 });
		await expect(mod.GET(ctx({ locals: adminOnly }))).rejects.toMatchObject({ status: 403 });
	});

	it('GET 500 without a DB, lists questions, and wraps errors', async () => {
		await expect(mod.GET(ctx({ platform: { env: {} } }))).rejects.toMatchObject({ status: 500 });
		vi.mocked(svc.listCorePrincipleQuestions).mockResolvedValueOnce([{ id: 'q1' }]);
		expect((await (await mod.GET(ctx())).json()).questions).toHaveLength(1);
		vi.mocked(svc.listCorePrincipleQuestions).mockRejectedValueOnce(new Error('x'));
		await expect(mod.GET(ctx())).rejects.toMatchObject({ status: 500 });
	});

	it('POST validates the question and inserts with the next sort order', async () => {
		await expect(mod.POST(ctx({ platform: { env: {} }, request: req({}) }))).rejects.toMatchObject({
			status: 500
		});
		await expect(mod.POST(ctx({ request: req({ question: '   ' }) }))).rejects.toMatchObject({
			status: 400
		});
		await expect(
			mod.POST(ctx({ request: req({ question: 'x'.repeat(501) }) }))
		).rejects.toMatchObject({ status: 400 });

		const res = await mod.POST(ctx({ request: req({ question: 'Why?', isActive: false }) }));
		const body = await res.json();
		expect(body.success).toBe(true);
		expect(body.question).toMatchObject({ question: 'Why?', is_active: 0, sort_order: 3 });
	});

	it('POST wraps DB failures in 500', async () => {
		const db = {
			prepare: vi.fn().mockReturnValue({
				first: vi.fn().mockRejectedValue(new Error('boom')),
				bind: vi.fn().mockReturnValue({ run: vi.fn(), first: vi.fn() })
			})
		};
		await expect(
			mod.POST({
				platform: { env: { DB: db } },
				locals: owner,
				request: req({ question: 'Q' })
			} as any)
		).rejects.toMatchObject({ status: 500 });
	});
});

describe('api/admin/core-principle-questions/[id]', () => {
	let mod: any;
	beforeEach(async () => {
		mod = await import('../../src/routes/api/admin/core-principle-questions/[id]/+server');
	});
	const ctx = (over: any = {}) => ({
		platform: { env: { DB: dbOK() } },
		locals: owner,
		params: { id: 'q1' },
		...over
	});

	it('PATCH/DELETE require a superadmin and a DB', async () => {
		await expect(mod.PATCH(ctx({ locals: anon, request: req({}) }))).rejects.toMatchObject({
			status: 401
		});
		await expect(mod.PATCH(ctx({ locals: adminOnly, request: req({}) }))).rejects.toMatchObject({
			status: 403
		});
		await expect(mod.PATCH(ctx({ platform: { env: {} }, request: req({}) }))).rejects.toMatchObject(
			{ status: 500 }
		);
		await expect(mod.DELETE(ctx({ platform: { env: {} } }))).rejects.toMatchObject({ status: 500 });
	});

	it('PATCH validates question, sortOrder and the empty-update case', async () => {
		await expect(mod.PATCH(ctx({ request: req({ question: '  ' }) }))).rejects.toMatchObject({
			status: 400
		});
		await expect(
			mod.PATCH(ctx({ request: req({ question: 'x'.repeat(501) }) }))
		).rejects.toMatchObject({ status: 400 });
		await expect(mod.PATCH(ctx({ request: req({ sortOrder: -1 }) }))).rejects.toMatchObject({
			status: 400
		});
		await expect(mod.PATCH(ctx({ request: req({ sortOrder: 1.5 }) }))).rejects.toMatchObject({
			status: 400
		});
		await expect(mod.PATCH(ctx({ request: req({}) }))).rejects.toMatchObject({ status: 400 });
	});

	it('PATCH updates each supported field', async () => {
		const res = await mod.PATCH(
			ctx({ request: req({ question: 'New?', isActive: true, sortOrder: 4 }) })
		);
		expect(await res.json()).toEqual({ success: true });
	});

	it('PATCH/DELETE wrap DB failures in 500', async () => {
		const failDb = {
			prepare: vi.fn().mockReturnValue({
				bind: vi.fn().mockReturnValue({ run: vi.fn().mockRejectedValue(new Error('boom')) })
			})
		};
		await expect(
			mod.PATCH({
				platform: { env: { DB: failDb } },
				locals: owner,
				params: { id: 'q1' },
				request: req({ isActive: true })
			} as any)
		).rejects.toMatchObject({ status: 500 });
		await expect(
			mod.DELETE({ platform: { env: { DB: failDb } }, locals: owner, params: { id: 'q1' } } as any)
		).rejects.toMatchObject({ status: 500 });
	});

	it('DELETE removes the question', async () => {
		const res = await mod.DELETE(ctx());
		expect(await res.json()).toEqual({ success: true });
	});
});
