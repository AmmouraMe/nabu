/**
 * Tests for publishers/linkedin.ts
 * Mocks the global fetch — no real HTTP calls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sharePost, linkedInKvKey } from '$lib/services/publishers/linkedin';

const FAKE_TOKEN = 'Bearer fake-access-token';
const AUTHOR_URN = 'urn:li:person:ABCDE12345';

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── linkedInKvKey ─────────────────────────────────────────────────

describe('linkedInKvKey', () => {
  it('returns consistent key format', () => {
    expect(linkedInKvKey('user-456')).toBe('linkedin:token:user-456');
  });
});

// ─── sharePost ─────────────────────────────────────────────────────

describe('sharePost', () => {
  it('returns id and shareUrl on success', async () => {
    vi.stubGlobal('fetch', mockFetch(201, { id: 'urn:li:share:123456' }));

    const result = await sharePost(FAKE_TOKEN, {
      text: 'Hello LinkedIn!',
      authorUrn: AUTHOR_URN
    });

    expect(result.id).toBe('urn:li:share:123456');
    expect(result.shareUrl).toContain('linkedin.com');
  });

  it('POSTs to /ugcPosts endpoint', async () => {
    vi.stubGlobal('fetch', mockFetch(201, { id: 'urn:li:share:1' }));
    await sharePost(FAKE_TOKEN, { text: 'test', authorUrn: AUTHOR_URN });

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/v2/ugcPosts');
  });

  it('sends Authorization header with Bearer token', async () => {
    vi.stubGlobal('fetch', mockFetch(201, { id: 'urn:li:share:1' }));
    await sharePost(FAKE_TOKEN, { text: 'test', authorUrn: AUTHOR_URN });

    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts.headers['Authorization']).toBe(`Bearer ${FAKE_TOKEN}`);
  });

  it('includes author URN in body', async () => {
    vi.stubGlobal('fetch', mockFetch(201, { id: 'urn:li:share:1' }));
    await sharePost(FAKE_TOKEN, { text: 'My post', authorUrn: AUTHOR_URN });

    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.author).toBe(AUTHOR_URN);
  });

  it('sends text in shareCommentary', async () => {
    vi.stubGlobal('fetch', mockFetch(201, { id: 'urn:li:share:1' }));
    await sharePost(FAKE_TOKEN, { text: 'My awesome post', authorUrn: AUTHOR_URN });

    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body);
    const commentary =
      body.specificContent['com.linkedin.ugc.ShareContent'].shareCommentary.text;
    expect(commentary).toBe('My awesome post');
  });

  it('sets visibility to PUBLIC', async () => {
    vi.stubGlobal('fetch', mockFetch(201, { id: 'urn:li:share:1' }));
    await sharePost(FAKE_TOKEN, { text: 'test', authorUrn: AUTHOR_URN });

    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body);
    const visibility = body.visibility['com.linkedin.ugc.MemberNetworkVisibility'];
    expect(visibility).toBe('PUBLIC');
  });

  it('sets lifecycleState to PUBLISHED', async () => {
    vi.stubGlobal('fetch', mockFetch(201, { id: 'urn:li:share:1' }));
    await sharePost(FAKE_TOKEN, { text: 'test', authorUrn: AUTHOR_URN });

    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.lifecycleState).toBe('PUBLISHED');
  });

  it('throws on non-2xx response', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { message: 'Unauthorized' }));
    await expect(sharePost(FAKE_TOKEN, { text: 'test', authorUrn: AUTHOR_URN })).rejects.toThrow(
      'LinkedIn API error 401'
    );
  });

  it('throws on 403 forbidden', async () => {
    vi.stubGlobal('fetch', mockFetch(403, { message: 'Forbidden' }));
    await expect(sharePost(FAKE_TOKEN, { text: 'test', authorUrn: AUTHOR_URN })).rejects.toThrow(
      'LinkedIn API error 403'
    );
  });
});
