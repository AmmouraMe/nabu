/**
 * Tests for publishers/devto.ts
 * Mocks the global fetch — no real HTTP calls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { publishArticle, getArticles, devtoKvKey } from '$lib/services/publishers/devto';

const FAKE_API_KEY = 'test-api-key-123';

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

// ─── devtoKvKey ────────────────────────────────────────────────────

describe('devtoKvKey', () => {
	it('returns consistent key format', () => {
		expect(devtoKvKey('user-123')).toBe('devto:apikey:user-123');
	});
});

// ─── publishArticle ────────────────────────────────────────────────

describe('publishArticle', () => {
	it('POSTs to dev.to API and returns id/url/published', async () => {
		const apiResponse = { id: 42, url: 'https://dev.to/user/my-post', published: false };
		vi.stubGlobal('fetch', mockFetch(201, apiResponse));

		const result = await publishArticle(FAKE_API_KEY, {
			title: 'My Article',
			body: '# Hello World',
			tags: ['js', 'webdev']
		});

		expect(result.id).toBe(42);
		expect(result.url).toBe('https://dev.to/user/my-post');
		expect(result.published).toBe(false);
	});

	it('sends api-key header', async () => {
		vi.stubGlobal('fetch', mockFetch(201, { id: 1, url: 'https://dev.to/x', published: false }));

		await publishArticle(FAKE_API_KEY, { title: 'T', body: 'B' });

		const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(opts.headers['api-key']).toBe(FAKE_API_KEY);
	});

	it('wraps article in { article: ... } body', async () => {
		vi.stubGlobal('fetch', mockFetch(201, { id: 1, url: 'x', published: false }));

		await publishArticle(FAKE_API_KEY, {
			title: 'My Title',
			body: 'Body text',
			tags: ['rust'],
			published: false
		});

		const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
		const sentBody = JSON.parse(opts.body);
		expect(sentBody.article.title).toBe('My Title');
		expect(sentBody.article.tags).toEqual(['rust']);
		expect(sentBody.article.published).toBe(false);
	});

	it('defaults published to false when omitted', async () => {
		vi.stubGlobal('fetch', mockFetch(201, { id: 1, url: 'x', published: false }));
		await publishArticle(FAKE_API_KEY, { title: 'T', body: 'B' });

		const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
		const sentBody = JSON.parse(opts.body);
		expect(sentBody.article.published).toBe(false);
	});

	it('throws on non-2xx response', async () => {
		vi.stubGlobal('fetch', mockFetch(422, { error: 'Unprocessable' }));

		await expect(publishArticle(FAKE_API_KEY, { title: 'T', body: 'B' })).rejects.toThrow(
			'Dev.to API error 422'
		);
	});

	it('throws on 401 unauthorized', async () => {
		vi.stubGlobal('fetch', mockFetch(401, { error: 'Unauthorized' }));
		await expect(publishArticle(FAKE_API_KEY, { title: 'T', body: 'B' })).rejects.toThrow(
			'Dev.to API error 401'
		);
	});
});

// ─── getArticles ───────────────────────────────────────────────────

describe('getArticles', () => {
	it('returns array of articles', async () => {
		const articles = [
			{ id: 1, title: 'Article 1', url: 'https://dev.to/u/a1', published: true },
			{ id: 2, title: 'Article 2', url: 'https://dev.to/u/a2', published: false }
		];
		vi.stubGlobal('fetch', mockFetch(200, articles));

		const result = await getArticles(FAKE_API_KEY);
		expect(result).toHaveLength(2);
		expect(result[0].title).toBe('Article 1');
	});

	it('calls /articles/me/all endpoint with api-key', async () => {
		vi.stubGlobal('fetch', mockFetch(200, []));
		await getArticles(FAKE_API_KEY);

		const [url, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(url).toContain('/articles/me/all');
		expect(opts.headers['api-key']).toBe(FAKE_API_KEY);
	});

	it('throws on API error', async () => {
		vi.stubGlobal('fetch', mockFetch(403, { error: 'Forbidden' }));
		await expect(getArticles(FAKE_API_KEY)).rejects.toThrow('Dev.to API error 403');
	});
});
