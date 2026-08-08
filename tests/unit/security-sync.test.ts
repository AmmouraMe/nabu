import { describe, expect, it, vi } from 'vitest';
import { sanitizeCmsUrl, sanitizeContentFields, sanitizeHtml } from '../../src/lib/cms/sanitize';
import { getTurnstileConfig, verifyTurnstile } from '../../src/lib/server/turnstile';
import {
	consumeOAuthTransaction,
	createOAuthTransaction,
	oauthStateCookieName,
	verifyOAuthState,
	verifyOAuthTransaction
} from '../../src/lib/server/oauth-state';
import { signSession } from '../../src/lib/server/session';

describe('CMS security boundaries', () => {
	it('sanitizes rich text and URL fields at the content boundary', () => {
		const fields = sanitizeContentFields(
			{
				body: '<p>safe</p><script>alert(1)</script><a href="java&#x73;cript:alert(1)">x</a>',
				website: ' javascript:alert(1)',
				image: '//evil.test/x.png'
			},
			[
				{ name: 'body', label: 'Body', type: 'richtext' },
				{ name: 'website', label: 'Website', type: 'url' },
				{ name: 'image', label: 'Image', type: 'image' }
			]
		);
		expect(fields.body).toBe('<p>safe</p><a>x</a>');
		expect(fields.website).toBe('');
		expect(fields.image).toBe('');
	});

	it('enforces safe link and image schemes and strips active embeds', () => {
		expect(sanitizeCmsUrl('/article')).toBe('/article');
		expect(sanitizeCmsUrl('mailto:test@example.com')).toBe('mailto:test@example.com');
		expect(sanitizeCmsUrl('data:image/svg+xml,x', true)).toBeNull();
		expect(sanitizeHtml('<iframe src="https://evil.test"></iframe><p>ok</p>')).toBe('<p>ok</p>');
	});

	it.each([
		['https://example.com/a?x=1&y=2', false, 'https://example.com/a?x=1&y=2'],
		['http://example.com', true, 'http://example.com'],
		['tel:+15551212', false, 'tel:+15551212'],
		['mailto:user@example.com', true, null],
		['data:text/html,evil', false, null],
		['vbscript:evil', false, null],
		['//example.com/path', false, null],
		['\\\\example.com\\path', false, null],
		['', false, null],
		['  /relative/path  ', false, '/relative/path'],
		['/path:with-colon', false, '/path:with-colon'],
		['java&colon;script:alert(1)', false, null],
		['java&#115;cript:alert(1)', false, null],
		['java&#x73;cript:alert(1)', false, null],
		['https&#58;//example.com', false, 'https://example.com'],
		['&#x110000;https://example.com', false, null]
	] as const)('normalizes and validates CMS URL %s', (value, image, expected) => {
		expect(sanitizeCmsUrl(value, image)).toBe(expected);
	});

	it('sanitizes rich-text attributes and repairs external-link rel values', () => {
		const html = sanitizeHtml(
			'<a href="https://example.com?a=1&b=2" target="_BLANK" rel="opener">link</a>' +
				'<a href="javascript:evil" target="self">bad</a>' +
				'<img src="https://example.com/a.png" width="200" height="0">' +
				'<ol start="3"><li>item</li></ol><ol start="9999"></ol>' +
				'<object><p>hidden</p></object>'
		);
		expect(html).toContain('target="_blank" rel="noopener noreferrer"');
		expect(html).not.toContain('javascript:');
		expect(html).toContain('width="200"');
		expect(html).not.toContain('height="0"');
		expect(html).toContain('start="3"');
		expect(html).not.toContain('start="9999"');
		expect(html).not.toContain('hidden');
		expect(sanitizeHtml(null)).toBe('');
	});

	it('preserves unrelated content fields and ignores non-string URLs', () => {
		const fields = sanitizeContentFields(
			{ title: 'Title', count: 3, website: 42, image: 'https://example.com/image.png' },
			[
				{ name: 'website', label: 'Website', type: 'url' },
				{ name: 'image', label: 'Image', type: 'image' },
				{ name: 'missing', label: 'Missing', type: 'text' }
			]
		);
		expect(fields).toEqual({
			title: 'Title',
			count: 3,
			website: 42,
			image: 'https://example.com/image.png'
		});
	});
});

describe('persisted OAuth state', () => {
	it('binds linking state to one session and consumes it once', async () => {
		let row: { intent: 'link'; user_id: string; session_id: string; consumed: boolean } | null =
			null;
		const db = {
			prepare: vi.fn((sql: string) => ({
				bind: (...values: unknown[]) => ({
					run: async () => {
						if (sql.includes('INSERT INTO oauth_transactions')) {
							row = {
								intent: 'link',
								user_id: String(values[3]),
								session_id: String(values[4]),
								consumed: false
							};
						}
					},
					first: async () => {
						if (!row || row.consumed) return null;
						if (sql.includes('UPDATE oauth_transactions')) row.consumed = true;
						return { intent: row.intent, user_id: row.user_id, session_id: row.session_id };
					}
				})
			}))
		} as never;
		const issued = await createOAuthTransaction(
			db,
			'github',
			'link',
			'user-1',
			'session-1',
			'secret'
		);
		const cookies = {
			get: (name: string) => (name === oauthStateCookieName('github') ? issued.cookie : undefined),
			delete: vi.fn()
		};
		await expect(
			verifyOAuthTransaction(db, 'github', issued.state, cookies, 'secret', 'wrong-session')
		).resolves.toBeNull();
		await expect(
			consumeOAuthTransaction(db, 'github', issued.state, cookies, 'secret', 'session-1')
		).resolves.toMatchObject({ intent: 'link', userId: 'user-1' });
		await expect(
			consumeOAuthTransaction(db, 'github', issued.state, cookies, 'secret', 'session-1')
		).resolves.toBeNull();
	});

	it('rejects malformed, mismatched, stale, and future browser state payloads', async () => {
		const valid = {
			provider: 'github' as const,
			state: 'login:state',
			intent: 'login' as const,
			issuedAt: Date.now()
		};
		const verify = async (payload: Record<string, unknown>, state: string | null = valid.state) =>
			verifyOAuthState('github', state, await signSession(payload, 'secret'), 'secret');
		await expect(verify(valid)).resolves.toEqual(valid);
		await expect(verify({ ...valid, provider: 'discord' })).resolves.toBeNull();
		await expect(verify({ ...valid, state: 'other' })).resolves.toBeNull();
		await expect(verify({ ...valid, intent: 'unknown' })).resolves.toBeNull();
		await expect(verify({ ...valid, issuedAt: 'now' })).resolves.toBeNull();
		await expect(verify({ ...valid, issuedAt: Date.now() - 11 * 60_000 })).resolves.toBeNull();
		await expect(verify({ ...valid, issuedAt: Date.now() + 61_000 })).resolves.toBeNull();
		await expect(verify({ ...valid, intent: 'link' })).resolves.toBeNull();
		await expect(verify(valid, null)).resolves.toBeNull();
		await expect(verifyOAuthState('github', valid.state, 'invalid', 'secret')).resolves.toBeNull();
	});

	it('requires both user and bound session for link transaction creation', async () => {
		const db = { prepare: vi.fn() } as never;
		await expect(
			createOAuthTransaction(db, 'github', 'link', undefined, 'session', 'secret')
		).rejects.toThrow('authenticated user and session');
		await expect(
			createOAuthTransaction(db, 'github', 'link', 'user-1', undefined, 'secret')
		).rejects.toThrow('authenticated user and session');
	});
});

describe('paired Turnstile configuration', () => {
	it('fails closed on partial configuration', () => {
		expect(getTurnstileConfig('site', undefined)).toMatchObject({
			enabled: false,
			error: expect.any(String)
		});
		expect(getTurnstileConfig(undefined, 'secret')).toMatchObject({
			enabled: false,
			error: expect.any(String)
		});
		expect(getTurnstileConfig()).toEqual({ enabled: false });
	});

	it('requires a successful verification response', async () => {
		const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
		await expect(verifyTurnstile({ secretKey: 'secret', token: 'token', fetchFn })).resolves.toBe(
			true
		);
		await expect(verifyTurnstile({ secretKey: 'secret', token: '', fetchFn })).resolves.toBe(false);
	});

	it('enables only a complete key pair', () => {
		expect(getTurnstileConfig('site', 'secret')).toEqual({
			enabled: true,
			siteKey: 'site',
			secretKey: 'secret'
		});
	});

	it.each([
		[{ ok: false }, false],
		[{ ok: true, json: async () => ({ success: false }) }, false],
		[{ ok: true, json: async () => ({}) }, false]
	] as const)('fails closed for unsuccessful Turnstile responses', async (response, expected) => {
		await expect(
			verifyTurnstile({
				secretKey: 'secret',
				token: 'token',
				fetchFn: vi.fn().mockResolvedValue(response) as any
			})
		).resolves.toBe(expected);
	});

	it('sends the remote address and fails closed on network errors', async () => {
		const fetchFn = vi.fn().mockImplementation(async (_url, init) => {
			expect(init.method).toBe('POST');
			expect(init.body.get('secret')).toBe('secret');
			expect(init.body.get('response')).toBe('token');
			expect(init.body.get('remoteip')).toBe('203.0.113.1');
			throw new Error('network unavailable');
		});
		await expect(
			verifyTurnstile({
				secretKey: 'secret',
				token: 'token',
				remoteIp: '203.0.113.1',
				fetchFn
			})
		).resolves.toBe(false);
	});
});
