/**
 * Extended CMS API Tests
 *
 * Covers uncovered branches in CMS API routes:
 * - api/cms/[type] (GET/POST error/edge paths)
 * - api/cms/[type]/[id] (GET/PUT/DELETE auth, db missing, error paths)
 * - api/cms/[type]/tags (GET/POST auth, db missing, error paths)
 * - api/cms/types (POST validation, error paths)
 * - api/cms/types/[id] (GET/PUT/DELETE all branches)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMockDB() {
	return {
		prepare: vi.fn().mockReturnThis(),
		bind: vi.fn().mockReturnThis(),
		first: vi.fn(),
		all: vi.fn(),
		run: vi.fn(),
		batch: vi.fn()
	};
}

const adminUser = {
	id: 'user-1',
	login: 'admin',
	email: 'admin@test.com',
	isOwner: true,
	isAdmin: true
};

const regularUser = {
	id: 'user-2',
	login: 'user',
	email: 'user@test.com',
	isOwner: false,
	isAdmin: false
};

// ─── api/cms/[type] extended tests ──────────────────────────────────────────

describe('CMS API [type] - Extended Coverage', () => {
	let mockDB: any;
	let mockPlatform: any;

	beforeEach(() => {
		vi.resetModules();
		mockDB = createMockDB();
		mockPlatform = { env: { DB: mockDB } };
	});

	describe('GET /api/cms/[type]', () => {
		it('should return 500 when database is not available', async () => {
			const { GET } = await import('../../src/routes/api/cms/[type]/+server.js');
			try {
				await GET({
					platform: { env: {} },
					locals: { user: adminUser },
					params: { type: 'blog' },
					url: new URL('http://localhost/api/cms/blog')
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});

		it('should handle unexpected errors in list', async () => {
			const { GET } = await import('../../src/routes/api/cms/[type]/+server.js');

			// getContentTypeBySlug returns a type
			mockDB.first.mockResolvedValueOnce({
				id: 'ct-1',
				slug: 'blog',
				name: 'Blog',
				fields: '[]',
				settings: '{"listPageSize":12}',
				icon: 'article',
				sort_order: 0,
				created_at: '2024-01-01',
				updated_at: '2024-01-01'
			});
			// listContentItems count throws
			mockDB.first.mockRejectedValueOnce(new Error('DB failure'));

			try {
				await GET({
					platform: mockPlatform,
					locals: { user: adminUser },
					params: { type: 'blog' },
					url: new URL('http://localhost/api/cms/blog')
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});

		it('should parse all query params (status, authorId, search, tag, sortBy, sortDirection)', async () => {
			const { GET } = await import('../../src/routes/api/cms/[type]/+server.js');

			mockDB.first.mockResolvedValueOnce({
				id: 'ct-1',
				slug: 'blog',
				name: 'Blog',
				fields: '[]',
				settings: '{"listPageSize":12,"defaultSort":"title","defaultSortDirection":"asc"}',
				icon: 'article',
				sort_order: 0,
				created_at: '2024-01-01',
				updated_at: '2024-01-01'
			});
			// count
			mockDB.first.mockResolvedValueOnce({ count: 0 });
			// items
			mockDB.all.mockResolvedValueOnce({ results: [] });

			const url = new URL(
				'http://localhost/api/cms/blog?status=published&authorId=user-1&search=hello&tag=js&page=2&pageSize=5&sortBy=title&sortDirection=asc'
			);

			const response = await GET({
				platform: mockPlatform,
				locals: { user: adminUser },
				params: { type: 'blog' },
				url
			} as any);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.contentType.slug).toBe('blog');
		});
	});

	describe('POST /api/cms/[type]', () => {
		it('should return 401 when not authenticated', async () => {
			const { POST } = await import('../../src/routes/api/cms/[type]/+server.js');
			try {
				await POST({
					platform: mockPlatform,
					locals: { user: null },
					params: { type: 'blog' },
					request: new Request('http://localhost', { method: 'POST', body: '{}' })
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(401);
			}
		});

		it('should return 403 for non-admin users', async () => {
			const { POST } = await import('../../src/routes/api/cms/[type]/+server.js');
			try {
				await POST({
					platform: mockPlatform,
					locals: { user: regularUser },
					params: { type: 'blog' },
					request: new Request('http://localhost', { method: 'POST', body: '{}' })
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(403);
			}
		});

		it('should return 500 when database is not available', async () => {
			const { POST } = await import('../../src/routes/api/cms/[type]/+server.js');
			try {
				await POST({
					platform: { env: {} },
					locals: { user: adminUser },
					params: { type: 'blog' },
					request: new Request('http://localhost', { method: 'POST', body: '{}' })
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});

		it('should return 404 when content type not found', async () => {
			const { POST } = await import('../../src/routes/api/cms/[type]/+server.js');

			mockDB.first.mockResolvedValueOnce(null);

			try {
				await POST({
					platform: mockPlatform,
					locals: { user: adminUser },
					params: { type: 'nonexistent' },
					request: new Request('http://localhost', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ title: 'Test' })
					})
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(404);
			}
		});

		it('should return 400 for field validation errors', async () => {
			const { POST } = await import('../../src/routes/api/cms/[type]/+server.js');

			// getContentTypeBySlug
			mockDB.first.mockResolvedValueOnce({
				id: 'ct-1',
				slug: 'blog',
				name: 'Blog',
				fields: JSON.stringify([{ name: 'body', label: 'Body', type: 'richtext', required: true }]),
				settings: '{}',
				icon: 'article',
				sort_order: 0,
				created_at: '2024-01-01',
				updated_at: '2024-01-01'
			});

			try {
				await POST({
					platform: mockPlatform,
					locals: { user: adminUser },
					params: { type: 'blog' },
					request: new Request('http://localhost', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ title: 'Test', fields: {} })
					})
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(400);
			}
		});

		it('should return 500 when createContentItem returns null', async () => {
			const { POST } = await import('../../src/routes/api/cms/[type]/+server.js');

			// getContentTypeBySlug
			mockDB.first.mockResolvedValueOnce({
				id: 'ct-1',
				slug: 'blog',
				name: 'Blog',
				fields: '[]',
				settings: '{}',
				icon: 'article',
				sort_order: 0,
				created_at: '2024-01-01',
				updated_at: '2024-01-01'
			});
			// createContentItem: content type lookup
			mockDB.first.mockResolvedValueOnce(null); // content type not found → returns null

			try {
				await POST({
					platform: mockPlatform,
					locals: { user: adminUser },
					params: { type: 'blog' },
					request: new Request('http://localhost', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ title: 'Test' })
					})
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});

		it('should handle unexpected errors in POST', async () => {
			const { POST } = await import('../../src/routes/api/cms/[type]/+server.js');

			// getContentTypeBySlug throws
			mockDB.first.mockRejectedValueOnce(new Error('DB crash'));

			try {
				await POST({
					platform: mockPlatform,
					locals: { user: adminUser },
					params: { type: 'blog' },
					request: new Request('http://localhost', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ title: 'Test' })
					})
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});
	});
});

// ─── api/cms/[type]/[id] extended tests ─────────────────────────────────────

describe('CMS API [type]/[id] - Extended Coverage', () => {
	let mockDB: any;
	let mockPlatform: any;

	beforeEach(() => {
		vi.resetModules();
		mockDB = createMockDB();
		mockPlatform = { env: { DB: mockDB } };
	});

	describe('GET /api/cms/[type]/[id]', () => {
		it('should return 401 when not authenticated', async () => {
			const { GET } = await import('../../src/routes/api/cms/[type]/[id]/+server.js');
			try {
				await GET({
					platform: mockPlatform,
					locals: { user: null },
					params: { type: 'blog', id: 'ci-1' }
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(401);
			}
		});

		it('should return 500 when database is not available', async () => {
			const { GET } = await import('../../src/routes/api/cms/[type]/[id]/+server.js');
			try {
				await GET({
					platform: { env: {} },
					locals: { user: adminUser },
					params: { type: 'blog', id: 'ci-1' }
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});

		it('should handle unexpected errors', async () => {
			const { GET } = await import('../../src/routes/api/cms/[type]/[id]/+server.js');

			mockDB.first.mockRejectedValueOnce(new Error('DB crash'));

			try {
				await GET({
					platform: mockPlatform,
					locals: { user: adminUser },
					params: { type: 'blog', id: 'ci-1' }
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});
	});

	describe('PUT /api/cms/[type]/[id]', () => {
		it('should return 401 when not authenticated', async () => {
			const { PUT } = await import('../../src/routes/api/cms/[type]/[id]/+server.js');
			try {
				await PUT({
					platform: mockPlatform,
					locals: { user: null },
					params: { type: 'blog', id: 'ci-1' },
					request: new Request('http://localhost', { method: 'PUT', body: '{}' })
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(401);
			}
		});

		it('should return 403 for non-admin users', async () => {
			const { PUT } = await import('../../src/routes/api/cms/[type]/[id]/+server.js');
			try {
				await PUT({
					platform: mockPlatform,
					locals: { user: regularUser },
					params: { type: 'blog', id: 'ci-1' },
					request: new Request('http://localhost', { method: 'PUT', body: '{}' })
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(403);
			}
		});

		it('should return 500 when database is not available', async () => {
			const { PUT } = await import('../../src/routes/api/cms/[type]/[id]/+server.js');
			try {
				await PUT({
					platform: { env: {} },
					locals: { user: adminUser },
					params: { type: 'blog', id: 'ci-1' },
					request: new Request('http://localhost', { method: 'PUT', body: '{}' })
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});

		it('should return 404 when item not found', async () => {
			const { PUT } = await import('../../src/routes/api/cms/[type]/[id]/+server.js');

			// updateContentItem: existing item not found
			mockDB.first.mockResolvedValueOnce(null);

			try {
				await PUT({
					platform: mockPlatform,
					locals: { user: adminUser },
					params: { type: 'blog', id: 'nonexistent' },
					request: new Request('http://localhost', {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ title: 'Updated' })
					})
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(404);
			}
		});

		it('should handle unexpected errors in PUT', async () => {
			const { PUT } = await import('../../src/routes/api/cms/[type]/[id]/+server.js');

			mockDB.first.mockRejectedValueOnce(new Error('DB crash'));

			try {
				await PUT({
					platform: mockPlatform,
					locals: { user: adminUser },
					params: { type: 'blog', id: 'ci-1' },
					request: new Request('http://localhost', {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ title: 'Test' })
					})
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});
	});

	describe('DELETE /api/cms/[type]/[id]', () => {
		it('should return 401 when not authenticated', async () => {
			const { DELETE } = await import('../../src/routes/api/cms/[type]/[id]/+server.js');
			try {
				await DELETE({
					platform: mockPlatform,
					locals: { user: null },
					params: { type: 'blog', id: 'ci-1' }
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(401);
			}
		});

		it('should return 403 for non-admin users', async () => {
			const { DELETE } = await import('../../src/routes/api/cms/[type]/[id]/+server.js');
			try {
				await DELETE({
					platform: mockPlatform,
					locals: { user: regularUser },
					params: { type: 'blog', id: 'ci-1' }
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(403);
			}
		});

		it('should return 500 when database is not available', async () => {
			const { DELETE } = await import('../../src/routes/api/cms/[type]/[id]/+server.js');
			try {
				await DELETE({
					platform: { env: {} },
					locals: { user: adminUser },
					params: { type: 'blog', id: 'ci-1' }
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});

		it('should handle unexpected errors in DELETE', async () => {
			const { DELETE } = await import('../../src/routes/api/cms/[type]/[id]/+server.js');

			mockDB.run.mockRejectedValueOnce(new Error('DB crash'));

			try {
				await DELETE({
					platform: mockPlatform,
					locals: { user: adminUser },
					params: { type: 'blog', id: 'ci-1' }
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});
	});
});

// ─── api/cms/[type]/tags extended tests ─────────────────────────────────────

describe('CMS API [type]/tags - Extended Coverage', () => {
	let mockDB: any;
	let mockPlatform: any;

	beforeEach(() => {
		vi.resetModules();
		mockDB = createMockDB();
		mockPlatform = { env: { DB: mockDB } };
	});

	describe('GET /api/cms/[type]/tags', () => {
		it('should return 401 when not authenticated', async () => {
			const { GET } = await import('../../src/routes/api/cms/[type]/tags/+server.js');
			try {
				await GET({
					platform: mockPlatform,
					locals: { user: null },
					params: { type: 'blog' }
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(401);
			}
		});

		it('should return 500 when database is not available', async () => {
			const { GET } = await import('../../src/routes/api/cms/[type]/tags/+server.js');
			try {
				await GET({
					platform: { env: {} },
					locals: { user: adminUser },
					params: { type: 'blog' }
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});

		it('should return 404 when content type not found', async () => {
			const { GET } = await import('../../src/routes/api/cms/[type]/tags/+server.js');

			mockDB.first.mockResolvedValueOnce(null);

			try {
				await GET({
					platform: mockPlatform,
					locals: { user: adminUser },
					params: { type: 'nonexistent' }
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(404);
			}
		});

		it('should handle unexpected errors', async () => {
			const { GET } = await import('../../src/routes/api/cms/[type]/tags/+server.js');

			mockDB.first.mockRejectedValueOnce(new Error('DB crash'));

			try {
				await GET({
					platform: mockPlatform,
					locals: { user: adminUser },
					params: { type: 'blog' }
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});
	});

	describe('POST /api/cms/[type]/tags', () => {
		it('should return 401 when not authenticated', async () => {
			const { POST } = await import('../../src/routes/api/cms/[type]/tags/+server.js');
			try {
				await POST({
					platform: mockPlatform,
					locals: { user: null },
					params: { type: 'blog' },
					request: new Request('http://localhost', { method: 'POST', body: '{}' })
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(401);
			}
		});

		it('should return 403 for non-admin users', async () => {
			const { POST } = await import('../../src/routes/api/cms/[type]/tags/+server.js');
			try {
				await POST({
					platform: mockPlatform,
					locals: { user: regularUser },
					params: { type: 'blog' },
					request: new Request('http://localhost', { method: 'POST', body: '{}' })
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(403);
			}
		});

		it('should return 500 when database is not available', async () => {
			const { POST } = await import('../../src/routes/api/cms/[type]/tags/+server.js');
			try {
				await POST({
					platform: { env: {} },
					locals: { user: adminUser },
					params: { type: 'blog' },
					request: new Request('http://localhost', { method: 'POST', body: '{}' })
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});

		it('should return 404 when content type not found', async () => {
			const { POST } = await import('../../src/routes/api/cms/[type]/tags/+server.js');

			mockDB.first.mockResolvedValueOnce(null);

			try {
				await POST({
					platform: mockPlatform,
					locals: { user: adminUser },
					params: { type: 'nonexistent' },
					request: new Request('http://localhost', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ name: 'Tag' })
					})
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(404);
			}
		});

		it('should return 400 when tag name is missing', async () => {
			const { POST } = await import('../../src/routes/api/cms/[type]/tags/+server.js');

			// getContentTypeBySlug
			mockDB.first.mockResolvedValueOnce({
				id: 'ct-1',
				slug: 'blog',
				name: 'Blog',
				fields: '[]',
				settings: '{}',
				icon: 'article',
				sort_order: 0,
				created_at: '2024-01-01',
				updated_at: '2024-01-01'
			});

			try {
				await POST({
					platform: mockPlatform,
					locals: { user: adminUser },
					params: { type: 'blog' },
					request: new Request('http://localhost', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({})
					})
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(400);
			}
		});

		it('should return 500 when createContentTag returns null', async () => {
			const { POST } = await import('../../src/routes/api/cms/[type]/tags/+server.js');

			// getContentTypeBySlug
			mockDB.first.mockResolvedValueOnce({
				id: 'ct-1',
				slug: 'blog',
				name: 'Blog',
				fields: '[]',
				settings: '{}',
				icon: 'article',
				sort_order: 0,
				created_at: '2024-01-01',
				updated_at: '2024-01-01'
			});
			// createContentTag returns null
			mockDB.first.mockResolvedValueOnce(null);

			try {
				await POST({
					platform: mockPlatform,
					locals: { user: adminUser },
					params: { type: 'blog' },
					request: new Request('http://localhost', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ name: 'NewTag' })
					})
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});

		it('should handle unexpected errors in POST', async () => {
			const { POST } = await import('../../src/routes/api/cms/[type]/tags/+server.js');

			mockDB.first.mockRejectedValueOnce(new Error('DB crash'));

			try {
				await POST({
					platform: mockPlatform,
					locals: { user: adminUser },
					params: { type: 'blog' },
					request: new Request('http://localhost', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ name: 'Tag' })
					})
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});
	});
});

// ─── api/cms/types extended tests ───────────────────────────────────────────

describe('CMS API types - Extended Coverage', () => {
	let mockDB: any;
	let mockPlatform: any;

	beforeEach(() => {
		vi.resetModules();
		mockDB = createMockDB();
		mockPlatform = { env: { DB: mockDB } };
	});

	describe('GET /api/cms/types', () => {
		it('should handle unexpected errors', async () => {
			const { GET } = await import('../../src/routes/api/cms/types/+server.js');

			// syncContentTypes throws
			mockDB.all.mockRejectedValueOnce(new Error('DB crash'));

			try {
				await GET({
					platform: mockPlatform,
					locals: { user: adminUser }
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});
	});

	describe('POST /api/cms/types', () => {
		it('should return 401 when not authenticated', async () => {
			const { POST } = await import('../../src/routes/api/cms/types/+server.js');
			try {
				await POST({
					platform: mockPlatform,
					locals: { user: null },
					request: new Request('http://localhost', { method: 'POST', body: '{}' })
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(401);
			}
		});

		it('should return 403 for non-admin users', async () => {
			const { POST } = await import('../../src/routes/api/cms/types/+server.js');
			try {
				await POST({
					platform: mockPlatform,
					locals: { user: regularUser },
					request: new Request('http://localhost', { method: 'POST', body: '{}' })
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(403);
			}
		});

		it('should return 500 when database is not available', async () => {
			const { POST } = await import('../../src/routes/api/cms/types/+server.js');
			try {
				await POST({
					platform: { env: {} },
					locals: { user: adminUser },
					request: new Request('http://localhost', { method: 'POST', body: '{}' })
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});

		it('should return 400 when name is missing', async () => {
			const { POST } = await import('../../src/routes/api/cms/types/+server.js');
			try {
				await POST({
					platform: mockPlatform,
					locals: { user: adminUser },
					request: new Request('http://localhost', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({})
					})
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(400);
			}
		});

		it('should return 400 when name is empty string', async () => {
			const { POST } = await import('../../src/routes/api/cms/types/+server.js');
			try {
				await POST({
					platform: mockPlatform,
					locals: { user: adminUser },
					request: new Request('http://localhost', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ name: '   ' })
					})
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(400);
			}
		});

		it('should return 409 when slug already exists', async () => {
			const { POST } = await import('../../src/routes/api/cms/types/+server.js');

			// createContentTypeInDB: slug already exists
			mockDB.first.mockResolvedValueOnce({ id: 'existing' }); // slug check

			try {
				await POST({
					platform: mockPlatform,
					locals: { user: adminUser },
					request: new Request('http://localhost', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ name: 'Blog', slug: 'blog' })
					})
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(409);
			}
		});

		it('should create a content type successfully', async () => {
			const { POST } = await import('../../src/routes/api/cms/types/+server.js');

			// createContentTypeInDB: slug doesn't exist
			mockDB.first.mockResolvedValueOnce(null);
			// max sort order
			mockDB.first.mockResolvedValueOnce({ max_order: 2 });
			// insert returning
			mockDB.first.mockResolvedValueOnce({
				id: 'new-ct',
				slug: 'faq',
				name: 'FAQ',
				description: 'Questions',
				fields: '[]',
				settings: '{}',
				icon: 'document',
				sort_order: 3,
				is_system: 0,
				created_at: '2024-01-01',
				updated_at: '2024-01-01'
			});

			const response = await POST({
				platform: mockPlatform,
				locals: { user: adminUser },
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name: 'FAQ', description: 'Questions' })
				})
			} as any);

			expect(response.status).toBe(201);
			const data = await response.json();
			expect(data.contentType.name).toBe('FAQ');
		});

		it('should handle unexpected errors in POST', async () => {
			const { POST } = await import('../../src/routes/api/cms/types/+server.js');

			// createContentTypeInDB throws
			mockDB.first.mockRejectedValueOnce(new Error('DB crash'));

			try {
				await POST({
					platform: mockPlatform,
					locals: { user: adminUser },
					request: new Request('http://localhost', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ name: 'FAQ' })
					})
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});
	});
});

// ─── api/cms/types/[id] extended tests ──────────────────────────────────────

describe('CMS API types/[id] - Extended Coverage', () => {
	let mockDB: any;
	let mockPlatform: any;

	beforeEach(() => {
		vi.resetModules();
		mockDB = createMockDB();
		mockPlatform = { env: { DB: mockDB } };
	});

	describe('GET /api/cms/types/[id]', () => {
		it('should return 401 when not authenticated', async () => {
			const { GET } = await import('../../src/routes/api/cms/types/[id]/+server.js');
			try {
				await GET({
					platform: mockPlatform,
					locals: { user: null },
					params: { id: 'ct-1' }
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(401);
			}
		});

		it('should return 403 for non-admin users', async () => {
			const { GET } = await import('../../src/routes/api/cms/types/[id]/+server.js');
			try {
				await GET({
					platform: mockPlatform,
					locals: { user: regularUser },
					params: { id: 'ct-1' }
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(403);
			}
		});

		it('should return 500 when database is not available', async () => {
			const { GET } = await import('../../src/routes/api/cms/types/[id]/+server.js');
			try {
				await GET({
					platform: { env: {} },
					locals: { user: adminUser },
					params: { id: 'ct-1' }
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});

		it('should return a content type by id', async () => {
			const { GET } = await import('../../src/routes/api/cms/types/[id]/+server.js');

			mockDB.first.mockResolvedValueOnce({
				id: 'ct-1',
				slug: 'blog',
				name: 'Blog',
				description: 'Articles',
				fields: '[]',
				settings: '{}',
				icon: 'article',
				sort_order: 0,
				is_system: 1,
				created_at: '2024-01-01',
				updated_at: '2024-01-01'
			});

			const response = await GET({
				platform: mockPlatform,
				locals: { user: adminUser },
				params: { id: 'ct-1' }
			} as any);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.contentType.slug).toBe('blog');
		});

		it('should return 404 when content type not found', async () => {
			const { GET } = await import('../../src/routes/api/cms/types/[id]/+server.js');

			mockDB.first.mockResolvedValueOnce(null);

			try {
				await GET({
					platform: mockPlatform,
					locals: { user: adminUser },
					params: { id: 'nonexistent' }
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(404);
			}
		});

		it('should handle unexpected errors', async () => {
			const { GET } = await import('../../src/routes/api/cms/types/[id]/+server.js');

			mockDB.first.mockRejectedValueOnce(new Error('DB crash'));

			try {
				await GET({
					platform: mockPlatform,
					locals: { user: adminUser },
					params: { id: 'ct-1' }
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});
	});

	describe('PUT /api/cms/types/[id]', () => {
		it('should return 401 when not authenticated', async () => {
			const { PUT } = await import('../../src/routes/api/cms/types/[id]/+server.js');
			try {
				await PUT({
					platform: mockPlatform,
					locals: { user: null },
					params: { id: 'ct-1' },
					request: new Request('http://localhost', { method: 'PUT', body: '{}' })
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(401);
			}
		});

		it('should return 403 for non-admin users', async () => {
			const { PUT } = await import('../../src/routes/api/cms/types/[id]/+server.js');
			try {
				await PUT({
					platform: mockPlatform,
					locals: { user: regularUser },
					params: { id: 'ct-1' },
					request: new Request('http://localhost', { method: 'PUT', body: '{}' })
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(403);
			}
		});

		it('should return 500 when database is not available', async () => {
			const { PUT } = await import('../../src/routes/api/cms/types/[id]/+server.js');
			try {
				await PUT({
					platform: { env: {} },
					locals: { user: adminUser },
					params: { id: 'ct-1' },
					request: new Request('http://localhost', { method: 'PUT', body: '{}' })
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});

		it('should update a content type without name (optional for updates)', async () => {
			const { PUT } = await import('../../src/routes/api/cms/types/[id]/+server.js');

			// updateContentTypeInDB: dynamic set
			mockDB.first.mockResolvedValueOnce({
				id: 'ct-1',
				slug: 'blog',
				name: 'Blog Updated',
				description: 'New desc',
				fields: '[]',
				settings: '{}',
				icon: 'article',
				sort_order: 0,
				is_system: 0,
				created_at: '2024-01-01',
				updated_at: '2024-01-15'
			});

			const response = await PUT({
				platform: mockPlatform,
				locals: { user: adminUser },
				params: { id: 'ct-1' },
				request: new Request('http://localhost', {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ description: 'New desc' })
				})
			} as any);

			expect(response.status).toBe(200);
		});

		it('should update a content type with name', async () => {
			const { PUT } = await import('../../src/routes/api/cms/types/[id]/+server.js');

			mockDB.first.mockResolvedValueOnce({
				id: 'ct-1',
				slug: 'blog',
				name: 'Updated Blog',
				description: null,
				fields: '[]',
				settings: '{}',
				icon: 'article',
				sort_order: 0,
				is_system: 0,
				created_at: '2024-01-01',
				updated_at: '2024-01-15'
			});

			const response = await PUT({
				platform: mockPlatform,
				locals: { user: adminUser },
				params: { id: 'ct-1' },
				request: new Request('http://localhost', {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name: 'Updated Blog' })
				})
			} as any);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.contentType.name).toBe('Updated Blog');
		});

		it('should return 404 when content type not found', async () => {
			const { PUT } = await import('../../src/routes/api/cms/types/[id]/+server.js');

			// updateContentTypeInDB returns null
			mockDB.first.mockResolvedValueOnce(null);

			try {
				await PUT({
					platform: mockPlatform,
					locals: { user: adminUser },
					params: { id: 'nonexistent' },
					request: new Request('http://localhost', {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ name: 'Test' })
					})
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(404);
			}
		});

		it('should handle unexpected errors', async () => {
			const { PUT } = await import('../../src/routes/api/cms/types/[id]/+server.js');

			mockDB.first.mockRejectedValueOnce(new Error('DB crash'));

			try {
				await PUT({
					platform: mockPlatform,
					locals: { user: adminUser },
					params: { id: 'ct-1' },
					request: new Request('http://localhost', {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ name: 'Test' })
					})
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});
	});

	describe('DELETE /api/cms/types/[id]', () => {
		it('should return 401 when not authenticated', async () => {
			const { DELETE } = await import('../../src/routes/api/cms/types/[id]/+server.js');
			try {
				await DELETE({
					platform: mockPlatform,
					locals: { user: null },
					params: { id: 'ct-1' }
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(401);
			}
		});

		it('should return 403 for non-admin users', async () => {
			const { DELETE } = await import('../../src/routes/api/cms/types/[id]/+server.js');
			try {
				await DELETE({
					platform: mockPlatform,
					locals: { user: regularUser },
					params: { id: 'ct-1' }
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(403);
			}
		});

		it('should return 500 when database is not available', async () => {
			const { DELETE } = await import('../../src/routes/api/cms/types/[id]/+server.js');
			try {
				await DELETE({
					platform: { env: {} },
					locals: { user: adminUser },
					params: { id: 'ct-1' }
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});

		it('should delete a non-system content type', async () => {
			const { DELETE } = await import('../../src/routes/api/cms/types/[id]/+server.js');

			// deleteContentTypeFromDB: exists, not system
			mockDB.first.mockResolvedValueOnce({ id: 'ct-1', is_system: 0 });
			mockDB.run.mockResolvedValueOnce({ success: true });

			const response = await DELETE({
				platform: mockPlatform,
				locals: { user: adminUser },
				params: { id: 'ct-1' }
			} as any);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.success).toBe(true);
		});

		it('should return 404 when content type not found', async () => {
			const { DELETE } = await import('../../src/routes/api/cms/types/[id]/+server.js');

			// deleteContentTypeFromDB: not found
			mockDB.first.mockResolvedValueOnce(null);

			try {
				await DELETE({
					platform: mockPlatform,
					locals: { user: adminUser },
					params: { id: 'nonexistent' }
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(404);
			}
		});

		it('should return 403 when trying to delete a system content type', async () => {
			const { DELETE } = await import('../../src/routes/api/cms/types/[id]/+server.js');

			// deleteContentTypeFromDB: exists but is system
			mockDB.first.mockResolvedValueOnce({ id: 'ct-1', is_system: 1 });

			try {
				await DELETE({
					platform: mockPlatform,
					locals: { user: adminUser },
					params: { id: 'ct-1' }
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(403);
			}
		});

		it('should handle unexpected errors', async () => {
			const { DELETE } = await import('../../src/routes/api/cms/types/[id]/+server.js');

			mockDB.first.mockRejectedValueOnce(new Error('DB crash'));

			try {
				await DELETE({
					platform: mockPlatform,
					locals: { user: adminUser },
					params: { id: 'ct-1' }
				} as any);
				expect.fail('Should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});
	});
});
