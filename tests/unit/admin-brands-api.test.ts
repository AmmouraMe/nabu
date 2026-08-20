import { beforeEach, describe, expect, it, vi } from 'vitest';

// Plans are not what this suite is about; see tests/fixtures/entitlements.ts.
vi.mock('$lib/server/entitlements', async () =>
	(await import('../fixtures/entitlements')).permissiveEntitlements()
);

describe('Brand Admin API', () => {
	let mockPlatform: any;
	let mockLocals: any;

	beforeEach(() => {
		vi.resetModules();

		const mockDB = {
			prepare: vi.fn().mockReturnThis(),
			bind: vi.fn().mockReturnThis(),
			all: vi.fn(),
			first: vi.fn(),
			run: vi.fn(),
			batch: vi.fn()
		};

		mockPlatform = {
			env: {
				DB: mockDB
			}
		};

		mockLocals = {
			user: {
				id: 'admin-1',
				login: 'adminuser',
				email: 'admin@test.com',
				isOwner: true,
				isAdmin: true
			}
		};
	});

	describe('GET /api/admin/brands', () => {
		it('should require authentication', async () => {
			mockLocals.user = null;

			const { GET } = await import('../../src/routes/api/admin/brands/+server.js');

			try {
				await GET({ platform: mockPlatform, locals: mockLocals } as any);
				expect.fail('Should have thrown error');
			} catch (err: any) {
				expect(err.status).toBe(401);
			}
		});

		it('should require admin access', async () => {
			mockLocals.user.isOwner = false;
			mockLocals.user.isAdmin = false;

			const { GET } = await import('../../src/routes/api/admin/brands/+server.js');

			try {
				await GET({ platform: mockPlatform, locals: mockLocals } as any);
				expect.fail('Should have thrown error');
			} catch (err: any) {
				expect(err.status).toBe(403);
			}
		});

		it('should return list of brands with owner info', async () => {
			const mockBrands = [
				{
					id: 'brand-1',
					brand_name: 'Test Brand',
					status: 'completed',
					created_at: '2024-01-01',
					updated_at: '2024-01-02',
					owner_name: 'John',
					owner_login: 'john',
					owner_email: 'john@test.com',
					owner_avatar: 'https://example.com/john.jpg',
					collaborator_count: 2
				}
			];

			mockPlatform.env.DB.all.mockResolvedValueOnce({ results: mockBrands });

			const { GET } = await import('../../src/routes/api/admin/brands/+server.js');
			const response = await GET({ platform: mockPlatform, locals: mockLocals } as any);
			const data = await response.json();

			expect(data.brands).toBeDefined();
			expect(data.brands).toHaveLength(1);
			expect(data.brands[0].brandName).toBe('Test Brand');
			expect(data.brands[0].ownerLogin).toBe('john');
			expect(data.brands[0].collaboratorCount).toBe(2);
		});
	});
});

describe('Brand Access API', () => {
	let mockPlatform: any;
	let mockLocals: any;

	beforeEach(() => {
		vi.resetModules();

		const mockDB = {
			prepare: vi.fn().mockReturnThis(),
			bind: vi.fn().mockReturnThis(),
			all: vi.fn(),
			first: vi.fn(),
			run: vi.fn(),
			batch: vi.fn()
		};

		mockPlatform = {
			env: {
				DB: mockDB
			}
		};

		mockLocals = {
			user: {
				id: 'admin-1',
				login: 'adminuser',
				email: 'admin@test.com',
				isOwner: true,
				isAdmin: true
			}
		};
	});

	describe('GET /api/admin/brands/[id]/access', () => {
		it('should require authentication', async () => {
			mockLocals.user = null;

			const { GET } = await import('../../src/routes/api/admin/brands/[id]/access/+server.js');

			try {
				await GET({
					platform: mockPlatform,
					locals: mockLocals,
					params: { id: 'brand-1' }
				} as any);
				expect.fail('Should have thrown error');
			} catch (err: any) {
				expect(err.status).toBe(401);
			}
		});

		it('should return access list for a brand', async () => {
			const mockAccess = [
				{
					id: 'access-1',
					brand_profile_id: 'brand-1',
					user_id: 'user-2',
					granted_by: 'admin-1',
					role: 'editor',
					created_at: '2024-01-01',
					updated_at: '2024-01-01',
					user_name: 'Jane',
					user_email: 'jane@test.com',
					user_avatar: null,
					user_login: 'jane'
				}
			];

			mockPlatform.env.DB.all.mockResolvedValueOnce({ results: mockAccess });

			const { GET } = await import('../../src/routes/api/admin/brands/[id]/access/+server.js');
			const response = await GET({
				platform: mockPlatform,
				locals: mockLocals,
				params: { id: 'brand-1' }
			} as any);
			const data = await response.json();

			expect(data.access).toBeDefined();
			expect(data.access).toHaveLength(1);
			expect(data.access[0].role).toBe('editor');
			expect(data.access[0].userLogin).toBe('jane');
		});
	});

	describe('POST /api/admin/brands/[id]/access', () => {
		it('should grant access to a user', async () => {
			mockPlatform.env.DB.run.mockResolvedValue({ success: true });
			// The route now looks the brand's owner up first, so seats are counted against
			// the owner's plan rather than the admin's. Without a row it answers 404.
			mockPlatform.env.DB.first.mockResolvedValueOnce({ user_id: 'owner-1' });

			const { POST } = await import('../../src/routes/api/admin/brands/[id]/access/+server.js');
			const response = await POST({
				platform: mockPlatform,
				locals: mockLocals,
				params: { id: 'brand-1' },
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ userId: 'user-2', role: 'editor' })
				})
			} as any);
			const data = await response.json();

			expect(data.success).toBe(true);
		});

		it('should reject invalid role', async () => {
			const { POST } = await import('../../src/routes/api/admin/brands/[id]/access/+server.js');

			try {
				await POST({
					platform: mockPlatform,
					locals: mockLocals,
					params: { id: 'brand-1' },
					request: new Request('http://localhost', {
						method: 'POST',
						body: JSON.stringify({ userId: 'user-2', role: 'superadmin' })
					})
				} as any);
				expect.fail('Should have thrown error');
			} catch (err: any) {
				expect(err.status).toBe(400);
			}
		});
	});

	describe('DELETE /api/admin/brands/[id]/access', () => {
		it('should revoke access', async () => {
			mockPlatform.env.DB.first.mockResolvedValueOnce({
				brand_profile_id: 'brand-1',
				user_id: 'user-2',
				role: 'editor'
			});
			mockPlatform.env.DB.run.mockResolvedValue({ success: true });

			const { DELETE } = await import('../../src/routes/api/admin/brands/[id]/access/+server.js');
			const response = await DELETE({
				platform: mockPlatform,
				locals: mockLocals,
				params: { id: 'brand-1' },
				request: new Request('http://localhost', {
					method: 'DELETE',
					body: JSON.stringify({ accessId: 'access-1' })
				})
			} as any);
			const data = await response.json();

			expect(data.success).toBe(true);
		});
	});
});

describe('Brand Audit Log API', () => {
	let mockPlatform: any;
	let mockLocals: any;

	beforeEach(() => {
		vi.resetModules();

		const mockDB = {
			prepare: vi.fn().mockReturnThis(),
			bind: vi.fn().mockReturnThis(),
			all: vi.fn(),
			first: vi.fn(),
			run: vi.fn(),
			batch: vi.fn()
		};

		mockPlatform = {
			env: {
				DB: mockDB
			}
		};

		mockLocals = {
			user: {
				id: 'admin-1',
				login: 'adminuser',
				email: 'admin@test.com',
				isOwner: true,
				isAdmin: true
			}
		};
	});

	describe('GET /api/admin/brands/[id]/logs', () => {
		it('should require authentication', async () => {
			mockLocals.user = null;

			const { GET } = await import('../../src/routes/api/admin/brands/[id]/logs/+server.js');

			try {
				await GET({
					platform: mockPlatform,
					locals: mockLocals,
					params: { id: 'brand-1' },
					url: new URL('http://localhost/api/admin/brands/brand-1/logs')
				} as any);
				expect.fail('Should have thrown error');
			} catch (err: any) {
				expect(err.status).toBe(401);
			}
		});

		it('should return audit log entries', async () => {
			const mockEntries = [
				{
					id: 'log-1',
					brand_profile_id: 'brand-1',
					user_id: 'admin-1',
					action: 'access_granted',
					entity_type: 'brand_access',
					entity_id: 'access-1',
					details: '{"userId":"user-2","role":"editor"}',
					ip_address: null,
					created_at: '2024-01-01',
					user_name: 'Admin',
					user_login: 'admin',
					user_avatar: null
				}
			];

			mockPlatform.env.DB.batch.mockResolvedValueOnce([
				{ results: mockEntries },
				{ results: [{ total: 1 }] }
			]);

			const { GET } = await import('../../src/routes/api/admin/brands/[id]/logs/+server.js');
			const response = await GET({
				platform: mockPlatform,
				locals: mockLocals,
				params: { id: 'brand-1' },
				url: new URL('http://localhost/api/admin/brands/brand-1/logs')
			} as any);
			const data = await response.json();

			expect(data.entries).toBeDefined();
			expect(data.entries).toHaveLength(1);
			expect(data.entries[0].action).toBe('access_granted');
			expect(data.total).toBe(1);
		});
	});
});
