/**
 * Extended CMS Service Tests
 *
 * Covers uncovered branches in src/lib/services/cms.ts:
 * - createContentItem: duplicate slug path, tagIds, published status
 * - listContentItems: authorId filter, search filter, tagSlug filter, sort validation
 * - updateContentItem: partial updates, tagIds, published_at transition
 * - updateContentTypeInDB: no fields to update, all field types
 * - deleteContentTag
 * - isContentTypeSlug
 * - getAllContentTypeSlugs
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

describe('CMS Service - Extended Branch Coverage', () => {
  let mockDB: any;

  beforeEach(() => {
    vi.resetModules();
    mockDB = createMockDB();
  });

  describe('createContentItem', () => {
    it('should handle duplicate slug by appending random suffix', async () => {
      const { createContentItem } = await import('../../src/lib/services/cms.js');

      // content type lookup
      mockDB.first.mockResolvedValueOnce({
        id: 'ct-1',
        slug: 'blog',
        name: 'Blog',
        fields: '[]'
      });
      // slug uniqueness check: slug already exists
      mockDB.first.mockResolvedValueOnce({ id: 'existing-slug-item' });
      // insert with unique slug
      mockDB.first.mockResolvedValueOnce({
        id: 'ci-new',
        content_type_id: 'ct-1',
        slug: 'hello-world-abc12345',
        title: 'Hello World',
        status: 'draft',
        fields: '{}',
        seo_title: null,
        seo_description: null,
        seo_image: null,
        author_id: 'user-1',
        published_at: null,
        created_at: '2024-01-01',
        updated_at: '2024-01-01'
      });

      const item = await createContentItem(mockDB, {
        contentTypeSlug: 'blog',
        title: 'Hello World',
        fields: {}
      });

      expect(item).toBeTruthy();
      expect(item!.slug).toContain('hello-world');
    });

    it('should return null when duplicate slug insert returns null', async () => {
      const { createContentItem } = await import('../../src/lib/services/cms.js');

      // content type lookup
      mockDB.first.mockResolvedValueOnce({
        id: 'ct-1',
        slug: 'blog',
        name: 'Blog',
        fields: '[]'
      });
      // slug uniqueness check: exists
      mockDB.first.mockResolvedValueOnce({ id: 'existing' });
      // insert returns null
      mockDB.first.mockResolvedValueOnce(null);

      const item = await createContentItem(mockDB, {
        contentTypeSlug: 'blog',
        title: 'Hello',
        fields: {}
      });

      expect(item).toBeNull();
    });

    it('should set published_at when status is published', async () => {
      const { createContentItem } = await import('../../src/lib/services/cms.js');

      // content type lookup
      mockDB.first.mockResolvedValueOnce({
        id: 'ct-1',
        slug: 'blog',
        name: 'Blog',
        fields: '[]'
      });
      // slug uniqueness check: not exists
      mockDB.first.mockResolvedValueOnce(null);
      // insert
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
        published_at: '2024-01-15T00:00:00.000Z',
        created_at: '2024-01-15',
        updated_at: '2024-01-15'
      });

      const item = await createContentItem(mockDB, {
        contentTypeSlug: 'blog',
        title: 'Hello',
        status: 'published',
        fields: {}
      });

      expect(item).toBeTruthy();
      expect(item!.status).toBe('published');
    });

    it('should set tagIds when provided', async () => {
      const { createContentItem } = await import('../../src/lib/services/cms.js');

      // content type lookup
      mockDB.first.mockResolvedValueOnce({
        id: 'ct-1',
        slug: 'blog',
        name: 'Blog',
        fields: '[]'
      });
      // slug uniqueness check: not exists
      mockDB.first.mockResolvedValueOnce(null);
      // insert
      mockDB.first.mockResolvedValueOnce({
        id: 'ci-1',
        content_type_id: 'ct-1',
        slug: 'hello',
        title: 'Hello',
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
      // setItemTags: batch
      mockDB.batch.mockResolvedValueOnce([{ success: true }]);

      const item = await createContentItem(mockDB, {
        contentTypeSlug: 'blog',
        title: 'Hello',
        fields: {},
        tagIds: ['tag-1', 'tag-2']
      });

      expect(item).toBeTruthy();
      expect(mockDB.batch).toHaveBeenCalled();
    });

    it('should use seo fields when provided', async () => {
      const { createContentItem } = await import('../../src/lib/services/cms.js');

      // content type lookup
      mockDB.first.mockResolvedValueOnce({
        id: 'ct-1',
        slug: 'blog',
        name: 'Blog',
        fields: '[]'
      });
      // slug uniqueness check
      mockDB.first.mockResolvedValueOnce(null);
      // insert
      mockDB.first.mockResolvedValueOnce({
        id: 'ci-1',
        content_type_id: 'ct-1',
        slug: 'hello',
        title: 'Hello',
        status: 'draft',
        fields: '{}',
        seo_title: 'SEO Title',
        seo_description: 'SEO Desc',
        seo_image: 'img.png',
        author_id: 'user-1',
        published_at: null,
        created_at: '2024-01-01',
        updated_at: '2024-01-01'
      });

      const item = await createContentItem(mockDB, {
        contentTypeSlug: 'blog',
        title: 'Hello',
        fields: {},
        seoTitle: 'SEO Title',
        seoDescription: 'SEO Desc',
        seoImage: 'img.png',
        authorId: 'user-1'
      });

      expect(item).toBeTruthy();
    });
  });

  describe('listContentItems', () => {
    it('should filter by authorId', async () => {
      const { listContentItems } = await import('../../src/lib/services/cms.js');

      mockDB.first.mockResolvedValueOnce({ count: 0 });
      mockDB.all.mockResolvedValueOnce({ results: [] });

      const result = await listContentItems(mockDB, 'ct-1', { authorId: 'user-1' });
      expect(result.items).toHaveLength(0);

      // Verify authorId filter was passed
      const prepareCall = mockDB.prepare.mock.calls.find((call: string[]) =>
        call[0].includes('author_id')
      );
      expect(prepareCall).toBeTruthy();
    });

    it('should filter by search term', async () => {
      const { listContentItems } = await import('../../src/lib/services/cms.js');

      mockDB.first.mockResolvedValueOnce({ count: 0 });
      mockDB.all.mockResolvedValueOnce({ results: [] });

      const result = await listContentItems(mockDB, 'ct-1', { search: 'hello' });
      expect(result.items).toHaveLength(0);

      const prepareCall = mockDB.prepare.mock.calls.find((call: string[]) =>
        call[0].includes('LIKE')
      );
      expect(prepareCall).toBeTruthy();
    });

    it('should use ascending sort direction', async () => {
      const { listContentItems } = await import('../../src/lib/services/cms.js');

      mockDB.first.mockResolvedValueOnce({ count: 0 });
      mockDB.all.mockResolvedValueOnce({ results: [] });

      const result = await listContentItems(mockDB, 'ct-1', {
        sortBy: 'title',
        sortDirection: 'asc'
      });
      expect(result.items).toHaveLength(0);

      // Verify ASC ordering
      const orderCall = mockDB.prepare.mock.calls.find(
        (call: string[]) => call[0].includes('ORDER BY') && call[0].includes('ASC')
      );
      expect(orderCall).toBeTruthy();
    });

    it('should fallback to created_at for invalid sort column', async () => {
      const { listContentItems } = await import('../../src/lib/services/cms.js');

      mockDB.first.mockResolvedValueOnce({ count: 0 });
      mockDB.all.mockResolvedValueOnce({ results: [] });

      const result = await listContentItems(mockDB, 'ct-1', {
        sortBy: 'DROP TABLE; --',
        sortDirection: 'desc'
      });
      expect(result.items).toHaveLength(0);

      // Should use created_at (safe default)
      const orderCall = mockDB.prepare.mock.calls.find(
        (call: string[]) => call[0].includes('ORDER BY') && call[0].includes('created_at')
      );
      expect(orderCall).toBeTruthy();
    });

    it('should use default values when no filters provided', async () => {
      const { listContentItems } = await import('../../src/lib/services/cms.js');

      mockDB.first.mockResolvedValueOnce({ count: 0 });
      mockDB.all.mockResolvedValueOnce({ results: [] });

      const result = await listContentItems(mockDB, 'ct-1');
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(12);
    });

    it('should handle null count result', async () => {
      const { listContentItems } = await import('../../src/lib/services/cms.js');

      mockDB.first.mockResolvedValueOnce(null); // count is null
      mockDB.all.mockResolvedValueOnce({ results: [] });

      const result = await listContentItems(mockDB, 'ct-1');
      expect(result.total).toBe(0);
    });
  });

  describe('updateContentItem', () => {
    it('should set published_at when transitioning to published', async () => {
      const { updateContentItem } = await import('../../src/lib/services/cms.js');

      // existing: draft
      mockDB.first.mockResolvedValueOnce({
        id: 'ci-1',
        content_type_id: 'ct-1',
        slug: 'hello',
        title: 'Hello',
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
      // updated
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
        published_at: '2024-01-15T00:00:00.000Z',
        created_at: '2024-01-01',
        updated_at: '2024-01-15'
      });

      const item = await updateContentItem(mockDB, 'ci-1', {
        status: 'published'
      });

      expect(item).toBeTruthy();
      expect(item!.status).toBe('published');
    });

    it('should NOT reset published_at when already published', async () => {
      const { updateContentItem } = await import('../../src/lib/services/cms.js');

      // existing: already published
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
        published_at: '2024-01-01T00:00:00.000Z',
        created_at: '2024-01-01',
        updated_at: '2024-01-01'
      });
      // updated title only
      mockDB.first.mockResolvedValueOnce({
        id: 'ci-1',
        content_type_id: 'ct-1',
        slug: 'hello',
        title: 'Updated',
        status: 'published',
        fields: '{}',
        seo_title: null,
        seo_description: null,
        seo_image: null,
        author_id: null,
        published_at: '2024-01-01T00:00:00.000Z',
        created_at: '2024-01-01',
        updated_at: '2024-01-15'
      });

      const item = await updateContentItem(mockDB, 'ci-1', {
        title: 'Updated',
        status: 'published'
      });

      expect(item).toBeTruthy();
    });

    it('should update with tagIds', async () => {
      const { updateContentItem } = await import('../../src/lib/services/cms.js');

      // existing
      mockDB.first.mockResolvedValueOnce({
        id: 'ci-1',
        content_type_id: 'ct-1',
        slug: 'hello',
        title: 'Hello',
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
      // update result
      mockDB.first.mockResolvedValueOnce({
        id: 'ci-1',
        content_type_id: 'ct-1',
        slug: 'hello',
        title: 'Hello',
        status: 'draft',
        fields: '{}',
        seo_title: null,
        seo_description: null,
        seo_image: null,
        author_id: null,
        published_at: null,
        created_at: '2024-01-01',
        updated_at: '2024-01-15'
      });
      // setItemTags batch
      mockDB.batch.mockResolvedValueOnce([{ success: true }]);

      const item = await updateContentItem(mockDB, 'ci-1', {
        tagIds: ['tag-1']
      });

      expect(item).toBeTruthy();
      expect(mockDB.batch).toHaveBeenCalled();
    });

    it('should use explicit seo fields when provided', async () => {
      const { updateContentItem } = await import('../../src/lib/services/cms.js');

      mockDB.first.mockResolvedValueOnce({
        id: 'ci-1',
        content_type_id: 'ct-1',
        slug: 'hello',
        title: 'Hello',
        status: 'draft',
        fields: '{}',
        seo_title: 'Old SEO',
        seo_description: 'Old Desc',
        seo_image: 'old.png',
        author_id: null,
        published_at: null,
        created_at: '2024-01-01',
        updated_at: '2024-01-01'
      });
      mockDB.first.mockResolvedValueOnce({
        id: 'ci-1',
        content_type_id: 'ct-1',
        slug: 'hello',
        title: 'Hello',
        status: 'draft',
        fields: '{}',
        seo_title: 'New SEO',
        seo_description: 'New Desc',
        seo_image: 'new.png',
        author_id: null,
        published_at: null,
        created_at: '2024-01-01',
        updated_at: '2024-01-15'
      });

      const item = await updateContentItem(mockDB, 'ci-1', {
        seoTitle: 'New SEO',
        seoDescription: 'New Desc',
        seoImage: 'new.png'
      });

      expect(item).toBeTruthy();
    });

    it('should return null when update returns null', async () => {
      const { updateContentItem } = await import('../../src/lib/services/cms.js');

      // existing
      mockDB.first.mockResolvedValueOnce({
        id: 'ci-1',
        content_type_id: 'ct-1',
        slug: 'hello',
        title: 'Hello',
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
      // update returns null
      mockDB.first.mockResolvedValueOnce(null);

      const item = await updateContentItem(mockDB, 'ci-1', { title: 'Test' });
      expect(item).toBeNull();
    });
  });

  describe('deleteContentTag', () => {
    it('should delete a tag and return true', async () => {
      const { deleteContentTag } = await import('../../src/lib/services/cms.js');

      mockDB.run.mockResolvedValue({ success: true, meta: { changes: 1 } });

      const result = await deleteContentTag(mockDB, 'tag-1');
      expect(result).toBe(true);
    });

    it('should return false when tag not found', async () => {
      const { deleteContentTag } = await import('../../src/lib/services/cms.js');

      mockDB.run.mockResolvedValue({ success: true, meta: { changes: 0 } });

      const result = await deleteContentTag(mockDB, 'nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('isContentTypeSlug', () => {
    it('should return true when slug exists', async () => {
      const { isContentTypeSlug } = await import('../../src/lib/services/cms.js');

      mockDB.first.mockResolvedValueOnce({ id: 'ct-1' });

      const result = await isContentTypeSlug(mockDB, 'blog');
      expect(result).toBe(true);
    });

    it('should return false when slug does not exist', async () => {
      const { isContentTypeSlug } = await import('../../src/lib/services/cms.js');

      mockDB.first.mockResolvedValueOnce(null);

      const result = await isContentTypeSlug(mockDB, 'nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('getAllContentTypeSlugs', () => {
    it('should return all slugs', async () => {
      const { getAllContentTypeSlugs } = await import('../../src/lib/services/cms.js');

      mockDB.all.mockResolvedValueOnce({
        results: [{ slug: 'blog' }, { slug: 'faq' }]
      });

      const slugs = await getAllContentTypeSlugs(mockDB);
      expect(slugs).toEqual(['blog', 'faq']);
    });

    it('should return empty array when no results', async () => {
      const { getAllContentTypeSlugs } = await import('../../src/lib/services/cms.js');

      mockDB.all.mockResolvedValueOnce({ results: [] });

      const slugs = await getAllContentTypeSlugs(mockDB);
      expect(slugs).toEqual([]);
    });
  });

  describe('updateContentTypeInDB', () => {
    it('should return current type when nothing to update', async () => {
      const { updateContentTypeInDB } = await import('../../src/lib/services/cms.js');

      // getContentTypeById (fallback when no SET clauses)
      mockDB.first.mockResolvedValueOnce({
        id: 'ct-1',
        slug: 'blog',
        name: 'Blog',
        description: null,
        fields: '[]',
        settings: '{}',
        icon: 'article',
        sort_order: 0,
        created_at: '2024-01-01',
        updated_at: '2024-01-01'
      });

      const result = await updateContentTypeInDB(mockDB, 'ct-1', {});
      expect(result).toBeTruthy();
      expect(result!.slug).toBe('blog');
    });

    it('should update all fields when provided', async () => {
      const { updateContentTypeInDB } = await import('../../src/lib/services/cms.js');

      mockDB.first.mockResolvedValueOnce({
        id: 'ct-1',
        slug: 'blog-updated',
        name: 'Blog Updated',
        description: 'New desc',
        fields: '[{"name":"body","type":"richtext"}]',
        settings: '{"hasTags":true}',
        icon: 'pen',
        sort_order: 0,
        created_at: '2024-01-01',
        updated_at: '2024-01-15'
      });

      const result = await updateContentTypeInDB(mockDB, 'ct-1', {
        name: 'Blog Updated',
        slug: 'blog-updated',
        description: 'New desc',
        icon: 'pen',
        fields: [{ name: 'body', type: 'richtext', label: 'Body' }],
        settings: { hasTags: true }
      });

      expect(result).toBeTruthy();
      expect(result!.name).toBe('Blog Updated');
    });

    it('should return null when update returns null', async () => {
      const { updateContentTypeInDB } = await import('../../src/lib/services/cms.js');

      mockDB.first.mockResolvedValueOnce(null);

      const result = await updateContentTypeInDB(mockDB, 'nonexistent', {
        name: 'Test'
      });
      expect(result).toBeNull();
    });
  });

  describe('createContentTag - null return', () => {
    it('should return null when insert returns null', async () => {
      const { createContentTag } = await import('../../src/lib/services/cms.js');

      mockDB.first.mockResolvedValueOnce(null);

      const result = await createContentTag(mockDB, 'ct-1', 'Tag');
      expect(result).toBeNull();
    });
  });
});
