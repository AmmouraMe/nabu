/**
 * Unit tests for the Veo 3 video generation service.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildRequestBody,
  extractVideoUrl,
  isOperation,
  googleKvKey
} from '$lib/services/video/veo3';
import { generateVideoScript } from '$lib/services/content-generator';

// ─── buildRequestBody ─────────────────────────────────────────────

describe('buildRequestBody', () => {
  it('builds correct body with defaults', () => {
    const body = buildRequestBody('a cat playing piano', {});
    expect(body.contents).toBeDefined();
    const contents = body.contents as unknown[];
    expect(Array.isArray(contents)).toBe(true);
    expect(contents.length).toBe(1);
    const config = body.generationConfig as Record<string, unknown>;
    expect(config.aspectRatio).toBe('16:9');
    expect(config.fps).toBe(24);
    expect(config.videoDuration).toBe(5);
  });

  it('uses provided options', () => {
    const body = buildRequestBody('sunset timelapse', {
      aspectRatio: '9:16',
      durationSeconds: 10,
      fps: 30
    });
    const config = body.generationConfig as Record<string, unknown>;
    expect(config.aspectRatio).toBe('9:16');
    expect(config.videoDuration).toBe(10);
    expect(config.fps).toBe(30);
  });

  it('includes prompt in user message', () => {
    const body = buildRequestBody('golden retriever running', { durationSeconds: 8 });
    const contents = body.contents as Array<{ role: string; parts: Array<{ text: string }> }>;
    const text = contents[0].parts[0].text;
    expect(text).toContain('golden retriever running');
    expect(text).toContain('8-second');
  });
});

// ─── extractVideoUrl ──────────────────────────────────────────────

describe('extractVideoUrl', () => {
  it('returns null for null input', () => {
    expect(extractVideoUrl(null)).toBeNull();
  });

  it('returns null for empty object', () => {
    expect(extractVideoUrl({})).toBeNull();
  });

  it('extracts videoUrl from part', () => {
    const data = {
      candidates: [
        { content: { parts: [{ videoUrl: 'https://storage.googleapis.com/vid.mp4' }] } }
      ]
    };
    expect(extractVideoUrl(data)).toBe('https://storage.googleapis.com/vid.mp4');
  });

  it('extracts fileData.fileUri from part', () => {
    const data = {
      candidates: [
        { content: { parts: [{ fileData: { fileUri: 'https://example.com/video.mp4' } }] } }
      ]
    };
    expect(extractVideoUrl(data)).toBe('https://example.com/video.mp4');
  });

  it('extracts fileUri directly from part', () => {
    const data = {
      candidates: [{ content: { parts: [{ fileUri: 'https://files.google.com/vid.mp4' }] } }]
    };
    expect(extractVideoUrl(data)).toBe('https://files.google.com/vid.mp4');
  });

  it('extracts uri from part', () => {
    const data = {
      candidates: [{ content: { parts: [{ uri: 'https://storage.example.com/vid' }] } }]
    };
    expect(extractVideoUrl(data)).toBe('https://storage.example.com/vid');
  });

  it('extracts from operation response wrapper', () => {
    const data = {
      name: 'operations/abc123',
      done: true,
      response: {
        candidates: [
          { content: { parts: [{ videoUrl: 'https://example.com/result.mp4' }] } }
        ]
      }
    };
    expect(extractVideoUrl(data)).toBe('https://example.com/result.mp4');
  });

  it('returns null when candidates is empty', () => {
    const data = { candidates: [] };
    expect(extractVideoUrl(data)).toBeNull();
  });

  it('returns null when parts is empty', () => {
    const data = { candidates: [{ content: { parts: [] } }] };
    expect(extractVideoUrl(data)).toBeNull();
  });
});

// ─── isOperation ─────────────────────────────────────────────────

describe('isOperation', () => {
  it('returns true for operation-like object with name', () => {
    expect(isOperation({ name: 'operations/xyz123' })).toBe(true);
  });

  it('returns true for pending operation (done=false)', () => {
    expect(isOperation({ name: 'operations/abc', done: false })).toBe(true);
  });

  it('returns false when candidates key is present', () => {
    expect(isOperation({ name: 'x', candidates: [] })).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(isOperation({})).toBe(false);
  });

  it('returns false for null', () => {
    expect(isOperation(null)).toBe(false);
  });

  it('returns false when name is empty string', () => {
    expect(isOperation({ name: '' })).toBe(false);
  });

  it('returns true for done=true operation', () => {
    expect(isOperation({ name: 'operations/done-op', done: true })).toBe(true);
  });
});

// ─── googleKvKey ─────────────────────────────────────────────────

describe('googleKvKey', () => {
  it('returns correct KV key format', () => {
    expect(googleKvKey('user-123')).toBe('google:apikey:user-123');
  });

  it('handles special characters in userId', () => {
    const key = googleKvKey('user@example.com');
    expect(key).toBe('google:apikey:user@example.com');
  });
});

// ─── generateVideoScript (content-generator) ─────────────────────

describe('generateVideoScript', () => {
  function makeAi(response: unknown) {
    return { run: vi.fn().mockResolvedValue({ response: JSON.stringify(response) }) };
  }

  const brand = {
    name: 'TechCo',
    tagline: 'Build better',
    voice_tone: 'professional',
    target_audience: 'engineers',
    niche: 'developer tools'
  };

  it('returns title, script, and durationSeconds', async () => {
    const ai = makeAi({ title: 'Dev Tools Demo', script: 'A developer types at keyboard', durationSeconds: 5 });
    const result = await generateVideoScript(ai as Parameters<typeof generateVideoScript>[0], brand, 'developer tools');
    expect(result.title).toBe('Dev Tools Demo');
    expect(result.script).toContain('developer');
    expect(result.durationSeconds).toBe(5);
  });

  it('falls back to topic when title is missing', async () => {
    const ai = makeAi({ script: 'Some script text', durationSeconds: 10 });
    const result = await generateVideoScript(ai as Parameters<typeof generateVideoScript>[0], brand, 'my topic');
    expect(result.title).toBe('my topic');
  });

  it('uses provided durationSeconds', async () => {
    const ai = makeAi({ title: 'T', script: 'S', durationSeconds: 15 });
    const result = await generateVideoScript(ai as Parameters<typeof generateVideoScript>[0], brand, 'topic', 15);
    expect(result.durationSeconds).toBe(15);
  });

  it('calls AI with system and user roles', async () => {
    const ai = makeAi({ title: 'T', script: 'S', durationSeconds: 5 });
    await generateVideoScript(ai as Parameters<typeof generateVideoScript>[0], brand, 'topic');
    const [, args] = ai.run.mock.calls[0];
    const messages = (args as { messages: { role: string }[] }).messages;
    expect(messages.some((m) => m.role === 'system')).toBe(true);
    expect(messages.some((m) => m.role === 'user')).toBe(true);
  });

  it('uses correct AI model', async () => {
    const ai = makeAi({ title: 'T', script: 'S', durationSeconds: 5 });
    await generateVideoScript(ai as Parameters<typeof generateVideoScript>[0], brand, 'topic');
    expect(ai.run).toHaveBeenCalledWith('@cf/meta/llama-3.3-70b-instruct-fp8-fast', expect.any(Object));
  });
});
