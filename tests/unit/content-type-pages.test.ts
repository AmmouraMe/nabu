/**
 * Tests for [contentType] page servers
 *
 * Covers the dynamic CMS routes:
 * - /[contentType]/+page.server.ts (list page)
 * - /[contentType]/[slug]/+page.server.ts (item page)
 *
 * Both files currently have 0% coverage.
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

// ─── [contentType]/+page.server.ts ──────────────────────────────────────────

describe('Content Type List Page Server', () => {
	let mockDB: any;

	beforeEach(() => {
		vi.resetModules();
		mockDB = createMockDB();
	});

	it('should return 500 when database is not available', async () => {
		const { load } = await import('../../src/routes/[contentType]/+page.server.js');

		try {
			await load({
				params: { contentType: 'blog' },
				platform: { env: {} },
				url: new URL('http://localhost/blog')
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('should return 404 when content type slug does not exist', async () => {
		const { load } = await import('../../src/routes/[contentType]/+page.server.js');

		// syncContentTypes: existing types
		mockDB.all.mockResolvedValueOnce({ results: [] });
		// No batch needed (empty registry mock handled by no statements)
		// isContentTypeSlug: not found
		mockDB.first.mockResolvedValueOnce(null);

		try {
			await load({
				params: { contentType: 'nonexistent' },
				platform: { env: { DB: mockDB } },
				url: new URL('http://localhost/nonexistent')
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});

	it('should return 404 when content type slug exists but getContentTypeBySlug returns null', async () => {
		const { load } = await import('../../src/routes/[contentType]/+page.server.js');

		// syncContentTypes: existing types
		mockDB.all.mockResolvedValueOnce({ results: [] });
		// isContentTypeSlug: found
		mockDB.first.mockResolvedValueOnce({ id: 'ct-1' });
		// getContentTypeBySlug: null
		mockDB.first.mockResolvedValueOnce(null);

		try {
			await load({
				params: { contentType: 'blog' },
				platform: { env: { DB: mockDB } },
				url: new URL('http://localhost/blog')
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});

	it('should load content type and items for public listing', async () => {
		const { load } = await import('../../src/routes/[contentType]/+page.server.js');

		// syncContentTypes: existing types match registry
		mockDB.all.mockResolvedValueOnce({
			results: [
				{
					id: 'ct-1',
					slug: 'blog',
					name: 'Blog',
					description: 'Articles',
					fields: '[]',
					settings: '{}',
					icon: 'article'
				}
			]
		});
		// isContentTypeSlug
		mockDB.first.mockResolvedValueOnce({ id: 'ct-1' });
		// getContentTypeBySlug
		mockDB.first.mockResolvedValueOnce({
			id: 'ct-1',
			slug: 'blog',
			name: 'Blog',
			description: 'Articles',
			fields: '[]',
			settings: '{"listPageSize":12,"defaultSort":"published_at","defaultSortDirection":"desc"}',
			icon: 'article',
			sort_order: 0,
			created_at: '2024-01-01',
			updated_at: '2024-01-01'
		});
		// listContentItems: count
		mockDB.first.mockResolvedValueOnce({ count: 1 });
		// listContentItems: items
		mockDB.all.mockResolvedValueOnce({
			results: [
				{
					id: 'ci-1',
					content_type_id: 'ct-1',
					slug: 'hello',
					title: 'Hello',
					status: 'published',
					fields: '{}',
					seo_title: null,
					seo_description: null,
					seo_image: null,
					author_id: null,
					published_at: '2024-01-01',
					created_at: '2024-01-01',
					updated_at: '2024-01-01'
				}
			]
		});

		const result = await load({
			params: { contentType: 'blog' },
			platform: { env: { DB: mockDB } },
			url: new URL('http://localhost/blog')
		} as any);

		expect(result).toBeDefined();
		const data = result as Record<string, any>;
		expect(data.contentType).toBeTruthy();
		expect(data.contentType.slug).toBe('blog');
		expect(data.items).toHaveLength(1);
	});

	it('should parse query params for filtering', async () => {
		const { load } = await import('../../src/routes/[contentType]/+page.server.js');

		// syncContentTypes
		mockDB.all.mockResolvedValueOnce({ results: [] });
		// isContentTypeSlug
		mockDB.first.mockResolvedValueOnce({ id: 'ct-1' });
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
		// count
		mockDB.first.mockResolvedValueOnce({ count: 0 });
		// items
		mockDB.all.mockResolvedValueOnce({ results: [] });

		const result = await load({
			params: { contentType: 'blog' },
			platform: { env: { DB: mockDB } },
			url: new URL('http://localhost/blog?search=test&tag=js&page=2')
		} as any);

		const data = result as Record<string, any>;
		expect(data.items).toHaveLength(0);
		expect(data.total).toBe(0);
	});
});

// ─── [contentType]/[slug]/+page.server.ts ───────────────────────────────────

describe('Content Type Item Page Server', () => {
	let mockDB: any;

	beforeEach(() => {
		vi.resetModules();
		mockDB = createMockDB();
	});

	it('should return 500 when database is not available', async () => {
		const { load } = await import('../../src/routes/[contentType]/[slug]/+page.server.js');

		try {
			await load({
				params: { contentType: 'blog', slug: 'hello' },
				platform: { env: {} }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('should return 404 when content type slug does not exist', async () => {
		const { load } = await import('../../src/routes/[contentType]/[slug]/+page.server.js');

		// syncContentTypes
		mockDB.all.mockResolvedValueOnce({ results: [] });
		// isContentTypeSlug
		mockDB.first.mockResolvedValueOnce(null);

		try {
			await load({
				params: { contentType: 'nonexistent', slug: 'hello' },
				platform: { env: { DB: mockDB } }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});

	it('should return 404 when getContentTypeBySlug returns null', async () => {
		const { load } = await import('../../src/routes/[contentType]/[slug]/+page.server.js');

		// syncContentTypes
		mockDB.all.mockResolvedValueOnce({ results: [] });
		// isContentTypeSlug: found
		mockDB.first.mockResolvedValueOnce({ id: 'ct-1' });
		// getContentTypeBySlug: null
		mockDB.first.mockResolvedValueOnce(null);

		try {
			await load({
				params: { contentType: 'blog', slug: 'hello' },
				platform: { env: { DB: mockDB } }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});

	it('should return 404 when content item not found', async () => {
		const { load } = await import('../../src/routes/[contentType]/[slug]/+page.server.js');

		// syncContentTypes
		mockDB.all.mockResolvedValueOnce({ results: [] });
		// isContentTypeSlug
		mockDB.first.mockResolvedValueOnce({ id: 'ct-1' });
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
		// getContentItemBySlug: null
		mockDB.first.mockResolvedValueOnce(null);

		try {
			await load({
				params: { contentType: 'blog', slug: 'nonexistent' },
				platform: { env: { DB: mockDB } }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});

	it('should return 404 when item is not published', async () => {
		const { load } = await import('../../src/routes/[contentType]/[slug]/+page.server.js');

		// syncContentTypes
		mockDB.all.mockResolvedValueOnce({ results: [] });
		// isContentTypeSlug
		mockDB.first.mockResolvedValueOnce({ id: 'ct-1' });
		// getContentTypeBySlug
		mockDB.first.mockResolvedValueOnce({
			id: 'ct-1',
			slug: 'blog',
			name: 'Blog',
			fields: '[]',
			settings: '{"hasTags":false}',
			icon: 'article',
			sort_order: 0,
			created_at: '2024-01-01',
			updated_at: '2024-01-01'
		});
		// getContentItemBySlug: draft item
		mockDB.first.mockResolvedValueOnce({
			id: 'ci-1',
			content_type_id: 'ct-1',
			slug: 'draft-post',
			title: 'Draft Post',
			status: 'draft',
			fields: '{}',
			seo_title: null,
			seo_description: null,
			seo_image: null,
			author_id: null,
			published_at: null,
			created_at: '2024-01-01',
			updated_at: '2024-01-01'
		});

		try {
			await load({
				params: { contentType: 'blog', slug: 'draft-post' },
				platform: { env: { DB: mockDB } }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});

	it('should load published item without tags', async () => {
		const { load } = await import('../../src/routes/[contentType]/[slug]/+page.server.js');

		// syncContentTypes
		mockDB.all.mockResolvedValueOnce({ results: [] });
		// isContentTypeSlug
		mockDB.first.mockResolvedValueOnce({ id: 'ct-1' });
		// getContentTypeBySlug
		mockDB.first.mockResolvedValueOnce({
			id: 'ct-1',
			slug: 'blog',
			name: 'Blog',
			fields: '[]',
			settings: '{"hasTags":false}',
			icon: 'article',
			sort_order: 0,
			created_at: '2024-01-01',
			updated_at: '2024-01-01'
		});
		// getContentItemBySlug
		mockDB.first.mockResolvedValueOnce({
			id: 'ci-1',
			content_type_id: 'ct-1',
			slug: 'hello',
			title: 'Hello',
			status: 'published',
			fields: '{"body":"Content"}',
			seo_title: 'Hello SEO',
			seo_description: null,
			seo_image: null,
			author_id: 'user-1',
			published_at: '2024-01-01',
			created_at: '2024-01-01',
			updated_at: '2024-01-01'
		});

		const result = await load({
			params: { contentType: 'blog', slug: 'hello' },
			platform: { env: { DB: mockDB } }
		} as any);

		const data = result as Record<string, any>;
		expect(data.contentType.slug).toBe('blog');
		expect(data.item.title).toBe('Hello');
		expect(data.tags).toHaveLength(0);
	});

	it('should load published item with tags when hasTags is true', async () => {
		const { load } = await import('../../src/routes/[contentType]/[slug]/+page.server.js');

		// syncContentTypes
		mockDB.all.mockResolvedValueOnce({ results: [] });
		// isContentTypeSlug
		mockDB.first.mockResolvedValueOnce({ id: 'ct-1' });
		// getContentTypeBySlug
		mockDB.first.mockResolvedValueOnce({
			id: 'ct-1',
			slug: 'blog',
			name: 'Blog',
			fields: '[]',
			settings: '{"hasTags":true}',
			icon: 'article',
			sort_order: 0,
			created_at: '2024-01-01',
			updated_at: '2024-01-01'
		});
		// getContentItemBySlug
		mockDB.first.mockResolvedValueOnce({
			id: 'ci-1',
			content_type_id: 'ct-1',
			slug: 'hello',
			title: 'Hello',
			status: 'published',
			fields: '{}',
			seo_title: null,
			seo_description: null,
			seo_image: null,
			author_id: null,
			published_at: '2024-01-01',
			created_at: '2024-01-01',
			updated_at: '2024-01-01'
		});
		// getItemTags
		mockDB.all.mockResolvedValueOnce({
			results: [
				{
					id: 'tag-1',
					content_type_id: 'ct-1',
					name: 'JavaScript',
					slug: 'javascript',
					created_at: '2024-01-01'
				}
			]
		});

		const result = await load({
			params: { contentType: 'blog', slug: 'hello' },
			platform: { env: { DB: mockDB } }
		} as any);

		const data = result as Record<string, any>;
		expect(data.tags).toHaveLength(1);
		expect(data.tags[0].name).toBe('JavaScript');
	});
});
