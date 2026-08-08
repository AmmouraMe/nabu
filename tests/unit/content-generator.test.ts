/**
 * Tests for content-generator.ts
 * Mocks the AI binding — no real network calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateDevToPost,
  generateLinkedInUpdate,
  generateContentCalendar,
  buildDevToPrompt,
  buildLinkedInPrompt,
  buildCalendarPrompt,
  type ContentBrand,
  type AiBinding
} from '$lib/services/content-generator';

const mockBrand: ContentBrand = {
  name: 'TechCo',
  tagline: 'Build better software',
  voice_tone: 'professional yet approachable',
  target_audience: 'senior software engineers',
  niche: 'developer tools'
};

function makeAi(response: unknown): AiBinding {
  return {
    run: vi.fn().mockResolvedValue({ response: JSON.stringify(response) })
  };
}

// ─── Prompt Builders ──────────────────────────────────────────────

describe('buildDevToPrompt', () => {
  it('includes brand context in user prompt', () => {
    const { system, user } = buildDevToPrompt(mockBrand, 'CI/CD best practices');
    expect(user).toContain('TechCo');
    expect(user).toContain('CI/CD best practices');
    expect(user).toContain('developer tools');
  });

  it('system prompt requests JSON', () => {
    const { system } = buildDevToPrompt(mockBrand, 'topic');
    expect(system).toContain('JSON');
  });

  it('works with minimal brand (name only)', () => {
    const minimal: ContentBrand = { name: 'Simple' };
    const { user } = buildDevToPrompt(minimal, 'Rust async');
    expect(user).toContain('Simple');
    expect(user).toContain('Rust async');
  });
});

describe('buildLinkedInPrompt', () => {
  it('includes 3000 char limit instruction', () => {
    const { user } = buildLinkedInPrompt(mockBrand, 'team culture');
    expect(user).toContain('3000');
  });

  it('includes brand voice_tone', () => {
    const { user } = buildLinkedInPrompt(mockBrand, 'topic');
    expect(user).toContain('professional yet approachable');
  });
});

describe('buildCalendarPrompt', () => {
  it('includes correct week count', () => {
    const { user, system } = buildCalendarPrompt(mockBrand, 6);
    expect(user).toContain('6');
    expect(system).toContain('6');
  });

  it('defaults correctly', () => {
    const { user } = buildCalendarPrompt(mockBrand, 4);
    expect(user).toContain('4');
  });
});

// ─── generateDevToPost ─────────────────────────────────────────────

describe('generateDevToPost', () => {
  it('returns title, body, and tags from AI', async () => {
    const ai = makeAi({ title: 'Test Title', body: '# Hello\nContent', tags: ['js', 'webdev'] });
    const result = await generateDevToPost(ai, mockBrand, 'topic');

    expect(result.title).toBe('Test Title');
    expect(result.body).toBe('# Hello\nContent');
    expect(result.tags).toEqual(['js', 'webdev']);
    expect(ai.run).toHaveBeenCalledWith('@cf/meta/llama-3.3-70b-instruct-fp8-fast', expect.any(Object));
  });

  it('caps tags at 5', async () => {
    const ai = makeAi({ title: 'T', body: 'B', tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] });
    const result = await generateDevToPost(ai, mockBrand, 'topic');
    expect(result.tags.length).toBeLessThanOrEqual(5);
  });

  it('falls back to topic as title when AI omits it', async () => {
    const ai = makeAi({ body: 'Some body', tags: [] });
    const result = await generateDevToPost(ai, mockBrand, 'My Topic');
    expect(result.title).toBe('My Topic');
  });

  it('normalizes non-array tags to an empty list', async () => {
    const ai = makeAi({ title: 'T', body: 'B', tags: 'javascript' });
    const result = await generateDevToPost(ai, mockBrand, 'topic');
    expect(result.tags).toEqual([]);
  });

  it('handles fenced JSON in AI response', async () => {
    const ai: AiBinding = {
      run: vi.fn().mockResolvedValue({
        response: '```json\n{"title":"T","body":"B","tags":["tag"]}\n```'
      })
    };
    const result = await generateDevToPost(ai, mockBrand, 'topic');
    expect(result.title).toBe('T');
    expect(result.tags).toEqual(['tag']);
  });

  it('throws on invalid JSON', async () => {
    const ai: AiBinding = { run: vi.fn().mockResolvedValue({ response: 'not json at all' }) };
    await expect(generateDevToPost(ai, mockBrand, 'topic')).rejects.toThrow();
  });
});

// ─── generateLinkedInUpdate ────────────────────────────────────────

describe('generateLinkedInUpdate', () => {
  it('returns text from AI', async () => {
    const ai = makeAi({ text: 'Great post about engineering!' });
    const result = await generateLinkedInUpdate(ai, mockBrand, 'engineering culture');
    expect(result.text).toBe('Great post about engineering!');
  });

  it('defaults missing text to an empty string', async () => {
    const ai = makeAi({});
    const result = await generateLinkedInUpdate(ai, mockBrand, 'engineering culture');
    expect(result.text).toBe('');
  });

  it('truncates text to 3000 chars', async () => {
    const longText = 'x'.repeat(4000);
    const ai = makeAi({ text: longText });
    const result = await generateLinkedInUpdate(ai, mockBrand, 'topic');
    expect(result.text.length).toBeLessThanOrEqual(3000);
  });

  it('passes messages to AI binding', async () => {
    const ai = makeAi({ text: 'Hello' });
    await generateLinkedInUpdate(ai, mockBrand, 'culture');
    expect(ai.run).toHaveBeenCalledWith(
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      expect.objectContaining({ messages: expect.any(Array) })
    );
  });
});

// ─── generateContentCalendar ───────────────────────────────────────

describe('generateContentCalendar', () => {
  it('returns array of calendar entries', async () => {
    const calendar = [
      { week: 1, topic: 'DevOps trends', platforms: ['devto', 'linkedin'] },
      { week: 2, topic: 'Testing strategies', platforms: ['devto'] }
    ];
    const ai = makeAi(calendar);
    const result = await generateContentCalendar(ai, mockBrand, 2);

    expect(result).toHaveLength(2);
    expect(result[0].week).toBe(1);
    expect(result[0].topic).toBe('DevOps trends');
    expect(result[0].platforms).toContain('devto');
  });

  it('caps results at requested week count', async () => {
    const calendar = Array.from({ length: 10 }, (_, i) => ({
      week: i + 1,
      topic: `Topic ${i + 1}`,
      platforms: ['linkedin']
    }));
    const ai = makeAi(calendar);
    const result = await generateContentCalendar(ai, mockBrand, 4);
    expect(result.length).toBeLessThanOrEqual(4);
  });

  it('defaults platforms to linkedin when missing', async () => {
    const ai = makeAi([{ week: 1, topic: 'Something' }]);
    const result = await generateContentCalendar(ai, mockBrand, 1);
    expect(result[0].platforms).toEqual(['linkedin']);
  });

  it('normalizes missing calendar entry fields', async () => {
    const ai = makeAi([{}]);
    const result = await generateContentCalendar(ai, mockBrand, 1);
    expect(result[0]).toEqual({ week: 1, topic: '', platforms: ['linkedin'] });
  });

  it('returns empty array when AI returns non-array', async () => {
    const ai = makeAi({ oops: true });
    const result = await generateContentCalendar(ai, mockBrand, 4);
    expect(result).toEqual([]);
  });

  it('defaults to 4 weeks', async () => {
    const calendar = Array.from({ length: 4 }, (_, i) => ({
      week: i + 1,
      topic: `T${i}`,
      platforms: ['devto']
    }));
    const ai = makeAi(calendar);
    const result = await generateContentCalendar(ai, mockBrand);
    expect(result.length).toBe(4);
  });
});
