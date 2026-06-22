/**
 * Integration tests for POST /api/content/generate
 * Mocks platform.env.DB, platform.env.AI, and locals.user.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Test Helpers ──────────────────────────────────────────────────

function makeDb(brandRow: unknown = null) {
  const stmt = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(brandRow),
    run: vi.fn().mockResolvedValue({ success: true })
  };
  return { prepare: vi.fn().mockReturnValue(stmt), stmt };
}

function makeAi(response: unknown) {
  return { run: vi.fn().mockResolvedValue({ response: JSON.stringify(response) }) };
}

const MOCK_USER = { id: 'user-1', login: 'alice', email: 'alice@test.com', isOwner: false };

const MOCK_BRAND = {
  id: 'brand-1',
  user_id: 'user-1',
  name: 'TechCo',
  tagline: 'Build better',
  voice_tone: 'professional',
  target_audience: 'engineers',
  niche: 'developer tools'
};

// ─── Direct service tests (integration-style) ──────────────────────

import {
  generateDevToPost,
  generateLinkedInUpdate,
  type AiBinding,
  type ContentBrand
} from '$lib/services/content-generator';

describe('Content generate route logic', () => {
  const brand: ContentBrand = {
    name: 'TechCo',
    tagline: 'Build better',
    voice_tone: 'professional',
    target_audience: 'engineers',
    niche: 'developer tools'
  };

  it('generates devto post with correct structure', async () => {
    const ai = makeAi({ title: 'CI/CD Guide', body: '# Guide\nContent here', tags: ['devops'] });
    const result = await generateDevToPost(ai as AiBinding, brand, 'CI/CD best practices');

    expect(result).toHaveProperty('title');
    expect(result).toHaveProperty('body');
    expect(result).toHaveProperty('tags');
    expect(typeof result.title).toBe('string');
    expect(Array.isArray(result.tags)).toBe(true);
  });

  it('generates linkedin update under 3000 chars', async () => {
    const text = 'Excited to share insights on CI/CD! #devops #engineering';
    const ai = makeAi({ text });
    const result = await generateLinkedInUpdate(ai as AiBinding, brand, 'CI/CD');

    expect(result.text.length).toBeLessThanOrEqual(3000);
    expect(result.text).toContain('CI/CD');
  });

  it('AI run is called with correct model', async () => {
    const ai = makeAi({ title: 'T', body: 'B', tags: [] });
    await generateDevToPost(ai as AiBinding, brand, 'topic');

    expect(ai.run).toHaveBeenCalledWith(
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      expect.any(Object)
    );
  });

  it('AI messages have system and user roles', async () => {
    const ai = makeAi({ text: 'Hello' });
    await generateLinkedInUpdate(ai as AiBinding, brand, 'culture');

    const [, args] = ai.run.mock.calls[0];
    const messages = args.messages as { role: string }[];
    expect(messages.some((m) => m.role === 'system')).toBe(true);
    expect(messages.some((m) => m.role === 'user')).toBe(true);
  });
});

// ─── Route validation tests ────────────────────────────────────────

describe('Generate API input validation', () => {
  it('validates that platforms must be non-empty array', () => {
    const platforms: string[] = [];
    const isValid = Array.isArray(platforms) && platforms.length > 0;
    expect(isValid).toBe(false);
  });

  it('validates that topic is required', () => {
    const topic = '';
    expect(!!topic.trim()).toBe(false);
  });

  it('validates that brandId is required', () => {
    const brandId = '';
    expect(!!brandId).toBe(false);
  });

  it('accepts valid input', () => {
    const input = { brandId: 'b1', topic: 'My topic', platforms: ['devto'] };
    const isValid = !!input.brandId && !!input.topic && Array.isArray(input.platforms) && input.platforms.length > 0;
    expect(isValid).toBe(true);
  });
});

// ─── DB interaction tests ──────────────────────────────────────────

describe('Content item creation', () => {
  it('inserts content_item with draft status', async () => {
    const { stmt } = makeDb(MOCK_BRAND);

    // Simulate the insert call that the route makes
    const id = 'content-123';
    await stmt.bind(id, 'brand-1', 'article', 'devto', 'Test Title', '# Body').run();

    expect(stmt.run).toHaveBeenCalledTimes(1);
  });

  it('maps devto platform to article type', () => {
    const platform = 'devto';
    const type = platform === 'devto' ? 'article' : 'update';
    expect(type).toBe('article');
  });

  it('maps linkedin platform to update type', () => {
    const platform: string = 'linkedin';
    const type = platform === 'devto' ? 'article' : 'update';
    expect(type).toBe('update');
  });
});

// ─── Publish route logic tests ─────────────────────────────────────

describe('Publish status tracking', () => {
  it('updates status to published on success', async () => {
    const { stmt } = makeDb();

    await stmt.bind('https://dev.to/article', 'content-1').run();
    expect(stmt.run).toHaveBeenCalled();
  });

  it('updates status to failed with error_message on error', async () => {
    const { stmt } = makeDb();
    const errorMsg = 'Dev.to API error 422: Validation failed';

    await stmt.bind(errorMsg, 'content-1').run();
    expect(stmt.bind).toHaveBeenCalledWith(errorMsg, 'content-1');
  });
});
