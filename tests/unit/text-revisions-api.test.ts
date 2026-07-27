/**
 * Tests for Brand Text Revisions API endpoint
 * Covers GET/POST /api/brand/assets/texts/revisions
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('$lib/services/text-history', () => ({
  getTextRevisions: vi.fn(),
  getCurrentTextRevision: vi.fn(),
  revertTextToRevision: vi.fn(),
  createTextRevision: vi.fn()
}));

vi.mock('$lib/services/brand-assets', () => ({
  updateBrandText: vi.fn()
}));

import {
  getTextRevisions,
  getCurrentTextRevision,
  revertTextToRevision,
  createTextRevision
} from '$lib/services/text-history';

import { updateBrandText } from '$lib/services/brand-assets';
import { withBrandAccess } from '../fixtures/brand-access';

// ─── Helpers ────────────────────────────────────────────────────

// The route resolves the text's owning brand before acting; `user-1` owns it.
const mockPlatform = { env: { DB: withBrandAccess({}, { userId: 'user-1' }) } };
const mockUser = { id: 'user-1', email: 'test@example.com' };

function makeUrl(params: Record<string, string>) {
  const url = new URL('http://localhost/api/brand/assets/texts/revisions');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

// ─── Tests ──────────────────────────────────────────────────────

describe('Text Revisions API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/brand/assets/texts/revisions', () => {
    it('should return 401 if not authenticated', async () => {
      const { GET } = await import('../../src/routes/api/brand/assets/texts/revisions/+server');

      await expect(
        GET({
          url: makeUrl({ brandTextId: 'text-1' }),
          platform: mockPlatform,
          locals: {}
        } as any)
      ).rejects.toThrow();
    });

    it('should return 400 if brandTextId missing', async () => {
      const { GET } = await import('../../src/routes/api/brand/assets/texts/revisions/+server');

      await expect(
        GET({
          url: makeUrl({}),
          platform: mockPlatform,
          locals: { user: mockUser }
        } as any)
      ).rejects.toThrow();
    });

    it('should return all revisions for a text asset', async () => {
      const mockRevisions = [
        { id: 'rev-1', brandTextId: 'text-1', revisionNumber: 1, value: 'v1', isCurrent: false },
        { id: 'rev-2', brandTextId: 'text-1', revisionNumber: 2, value: 'v2', isCurrent: true }
      ];
      vi.mocked(getTextRevisions).mockResolvedValueOnce(mockRevisions as any);

      const { GET } = await import('../../src/routes/api/brand/assets/texts/revisions/+server');
      const response = await GET({
        url: makeUrl({ brandTextId: 'text-1' }),
        platform: mockPlatform,
        locals: { user: mockUser }
      } as any);

      const data = await response.json();
      expect(data.revisions).toHaveLength(2);
      expect(getTextRevisions).toHaveBeenCalledWith(mockPlatform.env.DB, 'text-1');
    });

    it('should return current revision when current=true', async () => {
      const mockRevision = { id: 'rev-2', brandTextId: 'text-1', revisionNumber: 2, isCurrent: true };
      vi.mocked(getCurrentTextRevision).mockResolvedValueOnce(mockRevision as any);

      const { GET } = await import('../../src/routes/api/brand/assets/texts/revisions/+server');
      const response = await GET({
        url: makeUrl({ brandTextId: 'text-1', current: 'true' }),
        platform: mockPlatform,
        locals: { user: mockUser }
      } as any);

      const data = await response.json();
      expect(data.revision).toBeDefined();
      expect(getCurrentTextRevision).toHaveBeenCalledWith(mockPlatform.env.DB, 'text-1');
    });
  });

  describe('POST /api/brand/assets/texts/revisions', () => {
    it('should revert to a previous revision', async () => {
      const revertedRevision = {
        id: 'rev-3',
        brandTextId: 'text-1',
        revisionNumber: 3,
        value: 'Original value',
        label: 'Tagline',
        changeSource: 'revert',
        changeNote: 'Reverted to revision 1',
        isCurrent: true
      };
      vi.mocked(revertTextToRevision).mockResolvedValueOnce(revertedRevision as any);

      const { POST } = await import('../../src/routes/api/brand/assets/texts/revisions/+server');
      const response = await POST({
        request: new Request('http://localhost', {
          method: 'POST',
          body: JSON.stringify({ action: 'revert', revisionId: 'rev-1' })
        }),
        platform: mockPlatform,
        locals: { user: mockUser }
      } as any);

      const data = await response.json();
      expect(data.revision.changeSource).toBe('revert');
      expect(revertTextToRevision).toHaveBeenCalledWith(mockPlatform.env.DB, 'rev-1', 'user-1');
      // Should also update the text asset
      expect(updateBrandText).toHaveBeenCalledWith(mockPlatform.env.DB, 'text-1', {
        value: 'Original value',
        label: 'Tagline'
      });
    });

    it('should create a new revision', async () => {
      const newRevision = {
        id: 'rev-1',
        brandTextId: 'text-1',
        revisionNumber: 1,
        value: 'New tagline',
        changeSource: 'manual',
        isCurrent: true
      };
      vi.mocked(createTextRevision).mockResolvedValueOnce(newRevision as any);

      const { POST } = await import('../../src/routes/api/brand/assets/texts/revisions/+server');
      const response = await POST({
        request: new Request('http://localhost', {
          method: 'POST',
          body: JSON.stringify({
            brandTextId: 'text-1',
            value: 'New tagline',
            changeSource: 'manual'
          })
        }),
        platform: mockPlatform,
        locals: { user: mockUser }
      } as any);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.revision.value).toBe('New tagline');
    });

    it('should return 400 if revisionId missing on revert', async () => {
      const { POST } = await import('../../src/routes/api/brand/assets/texts/revisions/+server');

      await expect(
        POST({
          request: new Request('http://localhost', {
            method: 'POST',
            body: JSON.stringify({ action: 'revert' })
          }),
          platform: mockPlatform,
          locals: { user: mockUser }
        } as any)
      ).rejects.toThrow();
    });

    it('should return 400 if brandTextId missing on create', async () => {
      const { POST } = await import('../../src/routes/api/brand/assets/texts/revisions/+server');

      await expect(
        POST({
          request: new Request('http://localhost', {
            method: 'POST',
            body: JSON.stringify({ value: 'test' })
          }),
          platform: mockPlatform,
          locals: { user: mockUser }
        } as any)
      ).rejects.toThrow();
    });
  });
});
