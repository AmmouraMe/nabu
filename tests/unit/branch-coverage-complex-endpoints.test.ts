/**
 * Branch coverage tests for complex endpoints
 * Targets uncovered branches in:
 *   - /api/video/[id]/stream (80.28%)
 *   - /api/auth/github/callback (89.65%)
 *   - /routes/brand/[id]/+page.server.ts (85.71%)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════
// Video Stream Endpoint
// ═══════════════════════════════════════════════════════════════

const mockGetEnabledVideoKey = vi.fn();
const mockGetVideoProvider = vi.fn();
const mockCalculateVideoCostFromPricing = vi.fn().mockReturnValue(0.05);

vi.mock('$lib/services/video-registry', () => ({
	getEnabledVideoKey: (...args: any[]) => mockGetEnabledVideoKey(...args),
	getVideoProvider: (...args: any[]) => mockGetVideoProvider(...args)
}));

vi.mock('$lib/utils/cost', () => ({
	calculateVideoCostFromPricing: (...args: any[]) => mockCalculateVideoCostFromPricing(...args)
}));

function createMockDB() {
	const mockResult = { results: [], success: true, meta: {} };
	const mockFirst = vi.fn().mockResolvedValue(null);
	const mockAll = vi.fn().mockResolvedValue(mockResult);
	const mockRun = vi.fn().mockResolvedValue(mockResult);

	const mockBind = vi.fn().mockReturnValue({
		first: mockFirst,
		all: mockAll,
		run: mockRun
	});

	const mockPrepare = vi.fn().mockReturnValue({
		bind: mockBind,
		first: mockFirst,
		all: mockAll,
		run: mockRun
	});

	return {
		prepare: mockPrepare,
		batch: vi.fn().mockResolvedValue([]),
		_mockBind: mockBind,
		_mockFirst: mockFirst,
		_mockAll: mockAll,
		_mockRun: mockRun
	};
}

const authedLocals = { user: { id: 'user-1' } };
const noUser = { user: null };

describe('Video Stream Endpoint (/api/video/[id]/stream)', () => {
	let mockDB: ReturnType<typeof createMockDB>;
	let GET: any;
	let sseEvents: any[];

	beforeEach(async () => {
		vi.clearAllMocks();
		vi.useFakeTimers();

		// Capture SSE events via TextEncoder spy
		// (happy-dom doesn't support response.body.getReader() or response.text() for ReadableStream bodies)
		sseEvents = [];
		const origEncode = TextEncoder.prototype.encode;
		vi.spyOn(TextEncoder.prototype, 'encode').mockImplementation(function (
			this: TextEncoder,
			input?: string
		) {
			if (typeof input === 'string' && input.startsWith('data: ')) {
				try {
					sseEvents.push(JSON.parse(input.slice(6).replace(/\n+$/, '').trim()));
				} catch {
					/* ignore non-JSON */
				}
			}
			return origEncode.call(this, input ?? '');
		});

		mockDB = createMockDB();
		const mod = await import('../../src/routes/api/video/[id]/stream/+server');
		GET = mod.GET;
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('should reject unauthenticated users', async () => {
		await expect(
			GET({
				params: { id: 'gen-1' },
				platform: { env: { DB: mockDB } },
				locals: noUser
			})
		).rejects.toThrow();
	});

	it('should reject when platform is null', async () => {
		await expect(
			GET({
				params: { id: 'gen-1' },
				platform: null,
				locals: authedLocals
			})
		).rejects.toThrow();
	});

	it('should reject when platform.env is null', async () => {
		await expect(
			GET({
				params: { id: 'gen-1' },
				platform: { env: null },
				locals: authedLocals
			})
		).rejects.toThrow();
	});

	it('should return 404 when generation not found', async () => {
		mockDB._mockFirst.mockResolvedValueOnce(null);
		await expect(
			GET({
				params: { id: 'nonexistent' },
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			})
		).rejects.toThrow();
	});

	it('should immediately stream complete status for already-completed generation', async () => {
		mockDB._mockFirst.mockResolvedValueOnce({
			id: 'gen-1',
			provider: 'openai',
			provider_job_id: 'job-1',
			model: 'sora-2',
			status: 'complete',
			video_url: 'https://example.com/v.mp4',
			resolution: '1080p',
			duration_seconds: 10,
			message_id: null,
			conversation_id: null
		});

		const response = await GET({
			params: { id: 'gen-1' },
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		});

		expect(response).toBeInstanceOf(Response);
		expect(response.headers.get('Content-Type')).toBe('text/event-stream');

		expect(sseEvents[0].status).toBe('complete');
		expect(sseEvents[0].videoUrl).toBe('https://example.com/v.mp4');
		expect(sseEvents[0].progress).toBe(100);
	});

	it('should immediately stream error status for already-errored generation', async () => {
		mockDB._mockFirst.mockResolvedValueOnce({
			id: 'gen-1',
			provider: 'openai',
			provider_job_id: 'job-1',
			model: 'sora-2',
			status: 'error',
			video_url: null,
			resolution: null,
			duration_seconds: null,
			message_id: null,
			conversation_id: null
		});

		const response = await GET({
			params: { id: 'gen-1' },
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		});

		expect(sseEvents[0].status).toBe('error');
		expect(sseEvents[0].progress).toBe(0);
	});

	it('should return 503 when video key is not available', async () => {
		mockDB._mockFirst.mockResolvedValueOnce({
			id: 'gen-1',
			provider: 'openai',
			provider_job_id: 'job-1',
			model: 'sora-2',
			status: 'processing',
			video_url: null,
			resolution: '720p',
			duration_seconds: 8,
			message_id: null,
			conversation_id: null
		});

		mockGetEnabledVideoKey.mockResolvedValueOnce(null);

		await expect(
			GET({
				params: { id: 'gen-1' },
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			})
		).rejects.toThrow();
	});

	it('should return 503 when provider is not supported', async () => {
		mockDB._mockFirst.mockResolvedValueOnce({
			id: 'gen-1',
			provider: 'unknown',
			provider_job_id: 'job-1',
			model: 'model-x',
			status: 'processing',
			video_url: null,
			resolution: '720p',
			duration_seconds: 8,
			message_id: null,
			conversation_id: null
		});

		mockGetEnabledVideoKey.mockResolvedValueOnce({ provider: 'unknown', apiKey: 'key-1' });
		mockGetVideoProvider.mockReturnValueOnce(null);

		await expect(
			GET({
				params: { id: 'gen-1' },
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			})
		).rejects.toThrow();
	});

	it('should stream polling progress for processing generation', async () => {
		mockDB._mockFirst.mockResolvedValueOnce({
			id: 'gen-1',
			provider: 'openai',
			provider_job_id: 'job-1',
			model: 'sora-2',
			status: 'processing',
			video_url: null,
			resolution: '720p',
			duration_seconds: 8,
			message_id: null,
			conversation_id: null
		});

		const mockProvider = {
			getStatus: vi.fn().mockResolvedValueOnce({
				status: 'processing',
				progress: 50,
				videoUrl: null,
				thumbnailUrl: null
			}),
			getAvailableModels: vi.fn().mockReturnValue([]),
			downloadVideo: vi.fn()
		};

		mockGetEnabledVideoKey.mockResolvedValueOnce({ provider: 'openai', apiKey: 'key-1' });
		mockGetVideoProvider.mockReturnValueOnce(mockProvider);

		const response = await GET({
			params: { id: 'gen-1' },
			platform: { env: { DB: mockDB, BUCKET: null } },
			locals: authedLocals
		});

		// Wait for first async poll to complete (drain microtasks)
		for (let i = 0; i < 20; i++) await Promise.resolve();
		expect(sseEvents[0].status).toBe('processing');
		expect(sseEvents[0].progress).toBe(50);
	});

	it('should handle complete status in polling with R2 caching', async () => {
		const mockFirst = vi.fn().mockResolvedValueOnce({
			id: 'gen-1',
			provider: 'openai',
			provider_job_id: 'job-1',
			model: 'sora-2',
			status: 'processing',
			video_url: null,
			resolution: '720p',
			duration_seconds: 8,
			message_id: 'msg-1',
			conversation_id: 'conv-1'
		});

		const mockBind = vi.fn().mockReturnValue({
			first: mockFirst,
			run: vi.fn().mockResolvedValue({ success: true })
		});

		const localDB = {
			prepare: vi.fn().mockReturnValue({ bind: mockBind })
		};

		const mockBucket = {
			put: vi.fn().mockResolvedValue(undefined)
		};

		const mockProvider = {
			getStatus: vi.fn().mockResolvedValueOnce({
				status: 'complete',
				progress: 100,
				videoUrl: 'https://example.com/video.mp4',
				thumbnailUrl: 'https://example.com/thumb.jpg',
				duration: 10
			}),
			getAvailableModels: vi.fn().mockReturnValue([{ id: 'sora-2', pricing: { perSecond: 0.01 } }]),
			downloadVideo: vi.fn().mockResolvedValueOnce(new ArrayBuffer(100))
		};

		mockGetEnabledVideoKey.mockResolvedValue({ provider: 'openai', apiKey: 'key-1' });
		mockGetVideoProvider.mockReturnValue(mockProvider);

		const response = await GET({
			params: { id: 'gen-1' },
			platform: { env: { DB: localDB, BUCKET: mockBucket } },
			locals: authedLocals
		});

		// Wait for async poll to complete (drain microtasks)
		for (let i = 0; i < 20; i++) await Promise.resolve();
		expect(sseEvents[0].status).toBe('complete');
		expect(sseEvents[0].progress).toBe(100);
	});

	it('should handle error status in polling', async () => {
		mockDB._mockFirst.mockResolvedValueOnce({
			id: 'gen-1',
			provider: 'openai',
			provider_job_id: 'job-1',
			model: 'sora-2',
			status: 'processing',
			video_url: null,
			resolution: null,
			duration_seconds: null,
			message_id: 'msg-1',
			conversation_id: 'conv-1'
		});

		const mockProvider = {
			getStatus: vi.fn().mockResolvedValueOnce({
				status: 'error',
				error: 'Content policy violation'
			}),
			getAvailableModels: vi.fn().mockReturnValue([]),
			downloadVideo: vi.fn()
		};

		mockGetEnabledVideoKey.mockResolvedValueOnce({ provider: 'openai', apiKey: 'key-1' });
		mockGetVideoProvider.mockReturnValueOnce(mockProvider);

		const response = await GET({
			params: { id: 'gen-1' },
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		});

		// Wait for async poll to complete (drain microtasks)
		for (let i = 0; i < 20; i++) await Promise.resolve();
		expect(sseEvents[0].status).toBe('error');
		expect(sseEvents[0].error).toBe('Content policy violation');
	});

	it('should handle complete without R2 bucket', async () => {
		mockDB._mockFirst.mockResolvedValueOnce({
			id: 'gen-1',
			provider: 'openai',
			provider_job_id: 'job-1',
			model: 'sora-2',
			status: 'processing',
			video_url: null,
			resolution: '720p',
			duration_seconds: 8,
			message_id: null,
			conversation_id: null
		});

		const mockProvider = {
			getStatus: vi.fn().mockResolvedValueOnce({
				status: 'complete',
				progress: 100,
				videoUrl: 'https://example.com/v.mp4',
				thumbnailUrl: null,
				duration: 5
			}),
			getAvailableModels: vi.fn().mockReturnValue([]),
			downloadVideo: vi.fn()
		};

		mockGetEnabledVideoKey.mockResolvedValueOnce({ provider: 'openai', apiKey: 'key-1' });
		mockGetVideoProvider.mockReturnValueOnce(mockProvider);

		const response = await GET({
			params: { id: 'gen-1' },
			platform: { env: { DB: mockDB } }, // no BUCKET
			locals: authedLocals
		});

		// Wait for async poll to complete (drain microtasks)
		for (let i = 0; i < 20; i++) await Promise.resolve();
		expect(sseEvents[0].status).toBe('complete');
	});

	it('should handle complete with null videoUrl (no R2 cache attempt)', async () => {
		mockDB._mockFirst.mockResolvedValueOnce({
			id: 'gen-1',
			provider: 'openai',
			provider_job_id: 'job-1',
			model: 'sora-2',
			status: 'processing',
			video_url: null,
			resolution: '720p',
			duration_seconds: 8,
			message_id: 'msg-1',
			conversation_id: 'conv-1'
		});

		const mockProvider = {
			getStatus: vi.fn().mockResolvedValueOnce({
				status: 'complete',
				progress: 100,
				videoUrl: null, // no video URL
				thumbnailUrl: null,
				duration: null
			}),
			getAvailableModels: vi.fn().mockReturnValue([{ id: 'sora-2', pricing: { perSecond: 0.01 } }]),
			downloadVideo: vi.fn()
		};

		mockGetEnabledVideoKey.mockResolvedValueOnce({ provider: 'openai', apiKey: 'key-1' });
		mockGetVideoProvider.mockReturnValueOnce(mockProvider);

		const response = await GET({
			params: { id: 'gen-1' },
			platform: { env: { DB: mockDB, BUCKET: {} } },
			locals: authedLocals
		});

		// Wait for async poll to complete (drain microtasks)
		for (let i = 0; i < 20; i++) await Promise.resolve();
		expect(sseEvents[0].status).toBe('complete');
		// downloadVideo should NOT have been called since videoUrl is null
		expect(mockProvider.downloadVideo).not.toHaveBeenCalled();
	});
});

// ═══════════════════════════════════════════════════════════════
// Auth GitHub Callback Endpoint
// ═══════════════════════════════════════════════════════════════

vi.mock('$lib/services/account-merge', () => ({
	mergeAccounts: vi.fn()
}));

describe('Auth GitHub Callback (/api/auth/github/callback)', () => {
	let mockDB: ReturnType<typeof createMockDB>;
	let GET_auth: any;

	const baseMockGithubUser = {
		id: 12345,
		login: 'testuser',
		name: 'Test User',
		email: 'test@example.com',
		avatar_url: 'https://github.com/avatar.png'
	};

	beforeEach(async () => {
		vi.clearAllMocks();
		mockDB = createMockDB();
		// Need to mock fetch for GitHub API calls
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
			const urlStr = typeof url === 'string' ? url : url.toString();
			if (urlStr.includes('github.com/login/oauth/access_token')) {
				return new Response(JSON.stringify({ access_token: 'gho_test_token' }), { status: 200 });
			}
			if (urlStr.includes('api.github.com/user')) {
				return new Response(JSON.stringify(baseMockGithubUser), { status: 200 });
			}
			return new Response('Not found', { status: 404 });
		});

		const mod = await import('../../src/routes/api/auth/github/callback/+server');
		GET_auth = mod.GET;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	function makeUrl(query: Record<string, string> = {}) {
		const u = new URL('http://localhost/api/auth/github/callback');
		for (const [k, v] of Object.entries(query)) {
			u.searchParams.set(k, v);
		}
		return u;
	}

	it('should redirect to login when no code parameter', async () => {
		try {
			await GET_auth({
				url: makeUrl(),
				cookies: { get: vi.fn() },
				platform: {
					env: {
						DB: mockDB,
						GITHUB_CLIENT_ID: 'cid',
						GITHUB_CLIENT_SECRET: 'sec',
						GITHUB_OWNER_ID: '999'
					}
				}
			});
		} catch (e: any) {
			expect(e.status).toBe(302);
			expect(e.location).toContain('no_code');
		}
	});

	it('should redirect when clientId/clientSecret not configured', async () => {
		try {
			await GET_auth({
				url: makeUrl({ code: 'abc', state: 'xyz' }),
				cookies: { get: vi.fn() },
				platform: { env: {} }
			});
		} catch (e: any) {
			expect(e.status).toBe(302);
		}
	});

	it('should try KV when env vars not set for client credentials', async () => {
		const mockKV = {
			get: vi.fn().mockImplementation(async (key: string) => {
				if (key === 'auth_config:github') {
					return JSON.stringify({ clientId: 'kv-cid', clientSecret: 'kv-sec' });
				}
				return null;
			}),
			put: vi.fn()
		};
		try {
			await GET_auth({
				url: makeUrl({ code: 'abc', state: 'xyz' }),
				cookies: { get: vi.fn() },
				platform: { env: { DB: mockDB, KV: mockKV, GITHUB_OWNER_ID: '12345' } }
			});
		} catch (e: any) {
			// Should get further than "not_configured" since KV has the creds
			if (e.status === 302 && e.location) {
				expect(e.location).not.toContain('not_configured');
			}
		}
	});

	it('should handle token exchange failure', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('error', { status: 401 }));

		try {
			await GET_auth({
				url: makeUrl({ code: 'bad-code', state: 'xyz' }),
				cookies: { get: vi.fn() },
				platform: { env: { DB: mockDB, GITHUB_CLIENT_ID: 'cid', GITHUB_CLIENT_SECRET: 'sec' } }
			});
		} catch (e: any) {
			expect(e.status).toBe(302);
		}
	});

	it('should handle missing access token in response', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
			const urlStr = typeof url === 'string' ? url : url.toString();
			if (urlStr.includes('access_token')) {
				return new Response(JSON.stringify({ error: 'bad_verification_code' }), { status: 200 });
			}
			return new Response('Not found', { status: 404 });
		});

		try {
			await GET_auth({
				url: makeUrl({ code: 'expired-code', state: 'xyz' }),
				cookies: { get: vi.fn() },
				platform: { env: { DB: mockDB, GITHUB_CLIENT_ID: 'cid', GITHUB_CLIENT_SECRET: 'sec' } }
			});
		} catch (e: any) {
			expect(e.status).toBe(302);
		}
	});

	it('should handle user fetch failure', async () => {
		let callCount = 0;
		vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
			callCount++;
			if (callCount === 1) {
				return new Response(JSON.stringify({ access_token: 'token' }), { status: 200 });
			}
			return new Response('error', { status: 401 });
		});

		try {
			await GET_auth({
				url: makeUrl({ code: 'abc', state: 'xyz' }),
				cookies: { get: vi.fn() },
				platform: { env: { DB: mockDB, GITHUB_CLIENT_ID: 'cid', GITHUB_CLIENT_SECRET: 'sec' } }
			});
		} catch (e: any) {
			expect(e.status).toBe(302);
		}
	});

	it('should handle URL-safe base64 session cookie with - and _', async () => {
		// Create a session cookie that includes URL-safe base64 chars
		const sessionData = { id: 'existing-user-1', login: 'existing' };
		const sessionCookie = btoa(JSON.stringify(sessionData))
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');

		// When existingOAuth is already linked to another user, it should merge
		mockDB._mockFirst.mockResolvedValueOnce({ user_id: 'other-user-id' }); // existing OAuth linked to another user

		try {
			await GET_auth({
				url: makeUrl({ code: 'abc', state: 'xyz' }),
				cookies: { get: vi.fn().mockReturnValue(sessionCookie) },
				platform: {
					env: {
						DB: mockDB,
						GITHUB_CLIENT_ID: 'cid',
						GITHUB_CLIENT_SECRET: 'sec',
						GITHUB_OWNER_ID: '12345'
					}
				}
			});
		} catch (e: any) {
			// Should redirect to /profile?linked=github or handle merge
			if (e.status === 302) {
				expect(e.location || e.headers?.get?.('Location')).toBeDefined();
			}
		}
	});

	it('should handle linking mode when existingOAuth is null (create new oauth record)', async () => {
		const sessionData = { id: 'existing-user', login: 'testuser' };
		const sessionCookie = btoa(JSON.stringify(sessionData));

		mockDB._mockFirst.mockResolvedValueOnce(null); // No existing OAuth → will INSERT

		const response = await GET_auth({
			url: makeUrl({ code: 'abc', state: 'link:xyz' }),
			cookies: { get: vi.fn().mockReturnValue(sessionCookie) },
			platform: {
				env: {
					DB: mockDB,
					GITHUB_CLIENT_ID: 'cid',
					GITHUB_CLIENT_SECRET: 'sec',
					GITHUB_OWNER_ID: '12345'
				}
			}
		});

		expect(response.status).toBe(302);
		expect(response.headers.get('Location')).toContain('linked=github');
	});

	it('should identify owner by username when GITHUB_OWNER_ID is not numeric', async () => {
		const mockKV = {
			get: vi.fn().mockResolvedValue(null),
			put: vi.fn()
		};

		// appOwnerId is a username (not numeric), should match against login
		const response = await GET_auth({
			url: makeUrl({ code: 'abc', state: 'xyz' }),
			cookies: { get: vi.fn() },
			platform: {
				env: {
					DB: mockDB,
					KV: mockKV,
					GITHUB_CLIENT_ID: 'cid',
					GITHUB_CLIENT_SECRET: 'sec',
					GITHUB_OWNER_ID: 'testuser' // matches baseMockGithubUser.login
				}
			}
		});

		expect(response.status).toBe(302);
		// Owner should be redirected to /admin
		expect(response.headers.get('Location')).toContain('/admin');
	});

	it('should handle existing user with no oauth record (legacy user)', async () => {
		// First call: getLinkedAccount → null (no oauth_accounts match)
		// Second call: getUserById → existing user
		// Third call: getExistingOAuth → null (create new)
		mockDB._mockFirst
			.mockResolvedValueOnce(null) // check github oauth linking
			.mockResolvedValueOnce({ id: '12345', is_admin: 0 }) // existing user by id
			.mockResolvedValueOnce(null); // no existing oauth_account record

		const response = await GET_auth({
			url: makeUrl({ code: 'abc', state: 'xyz' }),
			cookies: { get: vi.fn() },
			platform: {
				env: {
					DB: mockDB,
					GITHUB_CLIENT_ID: 'cid',
					GITHUB_CLIENT_SECRET: 'sec',
					GITHUB_OWNER_ID: '999'
				}
			}
		});

		expect(response.status).toBe(302);
		// Should have inserted into oauth_accounts
		const allSql = mockDB.prepare.mock.calls.map((c: any) => c[0] as string);
		expect(allSql.some((s: string) => s.includes('INSERT INTO oauth_accounts'))).toBe(true);
	});

	it('should create new user when not existing', async () => {
		mockDB._mockFirst
			.mockResolvedValueOnce(null) // no oauth linking
			.mockResolvedValueOnce(null); // no existing user

		const response = await GET_auth({
			url: makeUrl({ code: 'abc', state: 'xyz' }),
			cookies: { get: vi.fn() },
			platform: {
				env: {
					DB: mockDB,
					GITHUB_CLIENT_ID: 'cid',
					GITHUB_CLIENT_SECRET: 'sec',
					GITHUB_OWNER_ID: '999'
				}
			}
		});

		expect(response.status).toBe(302);
		const allSql = mockDB.prepare.mock.calls.map((c: any) => c[0] as string);
		expect(allSql.some((s: string) => s.includes('INSERT INTO users'))).toBe(true);
	});

	it('should handle linked user login flow', async () => {
		mockDB._mockFirst
			.mockResolvedValueOnce({ user_id: 'linked-user' }) // oauth_accounts match
			.mockResolvedValueOnce({
				// linked user record
				id: 'linked-user',
				email: 'linked@email.com',
				name: 'Linked User',
				github_login: 'linkeduser',
				github_avatar_url: 'https://github.com/linked.png',
				is_admin: 0
			});

		const response = await GET_auth({
			url: makeUrl({ code: 'abc', state: 'xyz' }),
			cookies: { get: vi.fn() },
			platform: {
				env: {
					DB: mockDB,
					GITHUB_CLIENT_ID: 'cid',
					GITHUB_CLIENT_SECRET: 'sec',
					GITHUB_OWNER_ID: '999'
				}
			}
		});

		expect(response.status).toBe(302);
		expect(response.headers.get('Set-Cookie')).toContain('session=');
	});

	it('should handle linked admin user login', async () => {
		mockDB._mockFirst.mockResolvedValueOnce({ user_id: 'linked-admin' }).mockResolvedValueOnce({
			id: 'linked-admin',
			email: 'admin@email.com',
			name: 'Admin User',
			github_login: 'adminuser',
			github_avatar_url: 'https://github.com/admin.png',
			is_admin: 1
		});

		const response = await GET_auth({
			url: makeUrl({ code: 'abc', state: 'xyz' }),
			cookies: { get: vi.fn() },
			platform: {
				env: {
					DB: mockDB,
					GITHUB_CLIENT_ID: 'cid',
					GITHUB_CLIENT_SECRET: 'sec',
					GITHUB_OWNER_ID: '999'
				}
			}
		});

		expect(response.status).toBe(302);
		expect(response.headers.get('Location')).toContain('/admin');
	});

	it('should handle KV errors gracefully for auth_config', async () => {
		const mockKV = {
			get: vi.fn().mockRejectedValue(new Error('KV failure')),
			put: vi.fn()
		};

		try {
			await GET_auth({
				url: makeUrl({ code: 'abc', state: 'xyz' }),
				cookies: { get: vi.fn() },
				platform: { env: { KV: mockKV } }
			});
		} catch (e: any) {
			// Should redirect with not_configured since no creds
			expect(e.status).toBe(302);
		}
	});

	it('should handle owner first login KV tracking', async () => {
		const mockKV = {
			get: vi.fn().mockImplementation(async (key: string) => {
				if (key === 'admin_first_login_completed') return null;
				if (key === 'github_owner_id') return '12345';
				return null;
			}),
			put: vi.fn()
		};

		mockDB._mockFirst
			.mockResolvedValueOnce(null) // no oauth linking
			.mockResolvedValueOnce(null); // no existing user

		const response = await GET_auth({
			url: makeUrl({ code: 'abc', state: 'xyz' }),
			cookies: { get: vi.fn() },
			platform: {
				env: {
					DB: mockDB,
					KV: mockKV,
					GITHUB_CLIENT_ID: 'cid',
					GITHUB_CLIENT_SECRET: 'sec',
					GITHUB_OWNER_ID: '12345'
				}
			}
		});

		expect(response.status).toBe(302);
		expect(mockKV.put).toHaveBeenCalledWith('admin_first_login_completed', 'true');
	});

	it('should handle DB errors gracefully and still create session', async () => {
		mockDB._mockFirst.mockRejectedValueOnce(new Error('DB down'));

		const response = await GET_auth({
			url: makeUrl({ code: 'abc', state: 'xyz' }),
			cookies: { get: vi.fn() },
			platform: {
				env: {
					DB: mockDB,
					GITHUB_CLIENT_ID: 'cid',
					GITHUB_CLIENT_SECRET: 'sec',
					GITHUB_OWNER_ID: '999'
				}
			}
		});

		expect(response.status).toBe(302);
		expect(response.headers.get('Set-Cookie')).toContain('session=');
	});

	it('should handle no DB at all', async () => {
		const response = await GET_auth({
			url: makeUrl({ code: 'abc', state: 'xyz' }),
			cookies: { get: vi.fn() },
			platform: {
				env: {
					GITHUB_CLIENT_ID: 'cid',
					GITHUB_CLIENT_SECRET: 'sec',
					GITHUB_OWNER_ID: '999'
				}
			}
		});

		expect(response.status).toBe(302);
	});

	it('should use https Secure flag on secure connection', async () => {
		mockDB._mockFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

		const secureUrl = new URL('https://example.com/api/auth/github/callback');
		secureUrl.searchParams.set('code', 'abc');
		secureUrl.searchParams.set('state', 'xyz');

		const response = await GET_auth({
			url: secureUrl,
			cookies: { get: vi.fn() },
			platform: {
				env: {
					DB: mockDB,
					GITHUB_CLIENT_ID: 'cid',
					GITHUB_CLIENT_SECRET: 'sec',
					GITHUB_OWNER_ID: '999'
				}
			}
		});

		expect(response.status).toBe(302);
		expect(response.headers.get('Set-Cookie')).toContain('Secure');
	});

	it('should NOT use Secure flag on http connection', async () => {
		mockDB._mockFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

		const response = await GET_auth({
			url: makeUrl({ code: 'abc', state: 'xyz' }),
			cookies: { get: vi.fn() },
			platform: {
				env: {
					DB: mockDB,
					GITHUB_CLIENT_ID: 'cid',
					GITHUB_CLIENT_SECRET: 'sec',
					GITHUB_OWNER_ID: '999'
				}
			}
		});

		expect(response.status).toBe(302);
		const cookie = response.headers.get('Set-Cookie');
		expect(cookie).not.toContain('Secure');
	});
});

// ═══════════════════════════════════════════════════════════════
// Brand Page Server Load
// ═══════════════════════════════════════════════════════════════

describe('Brand Page Server (/brand/[id]/+page.server.ts)', () => {
	let loadFn: any;

	beforeEach(async () => {
		vi.clearAllMocks();
		const mod = await import('../../src/routes/brand/[id]/+page.server');
		loadFn = mod.load;
	});

	it('should redirect unauthenticated users to login', async () => {
		try {
			await loadFn({
				platform: null,
				locals: noUser,
				params: { id: 'brand-1' }
			});
		} catch (e: any) {
			expect(e.status).toBe(302);
			expect(e.location).toContain('/auth/login');
		}
	});

	it('should return hasAIProviders=false when platform is null', async () => {
		const result = await loadFn({
			platform: null,
			locals: authedLocals,
			params: { id: 'brand-1' }
		});
		expect(result.hasAIProviders).toBe(false);
		expect(result.brandId).toBe('brand-1');
	});

	it('should return hasAIProviders=false when KV is not available', async () => {
		const result = await loadFn({
			platform: { env: {} },
			locals: authedLocals,
			params: { id: 'brand-1' }
		});
		expect(result.hasAIProviders).toBe(false);
	});

	it('should return hasAIProviders=false when no keys in KV', async () => {
		const mockKV = {
			get: vi.fn().mockResolvedValue(null)
		};
		const result = await loadFn({
			platform: { env: { KV: mockKV } },
			locals: authedLocals,
			params: { id: 'brand-1' }
		});
		expect(result.hasAIProviders).toBe(false);
	});

	it('should return hasAIProviders=true when enabled openai key exists', async () => {
		const mockKV = {
			get: vi.fn().mockImplementation(async (key: string) => {
				if (key === 'ai_keys_list') return JSON.stringify(['key-1']);
				if (key === 'ai_key:key-1') return JSON.stringify({ enabled: true, provider: 'openai' });
				return null;
			})
		};
		const result = await loadFn({
			platform: { env: { KV: mockKV } },
			locals: authedLocals,
			params: { id: 'brand-1' }
		});
		expect(result.hasAIProviders).toBe(true);
	});

	it('should return hasAIProviders=false when key has enabled=false', async () => {
		const mockKV = {
			get: vi.fn().mockImplementation(async (key: string) => {
				if (key === 'ai_keys_list') return JSON.stringify(['key-1']);
				if (key === 'ai_key:key-1') return JSON.stringify({ enabled: false, provider: 'openai' });
				return null;
			})
		};
		const result = await loadFn({
			platform: { env: { KV: mockKV } },
			locals: authedLocals,
			params: { id: 'brand-1' }
		});
		expect(result.hasAIProviders).toBe(false);
	});

	it('should return hasAIProviders=true for any text-chat provider, not just OpenAI', async () => {
		const mockKV = {
			get: vi.fn().mockImplementation(async (key: string) => {
				if (key === 'ai_keys_list') return JSON.stringify(['key-1']);
				if (key === 'ai_key:key-1') return JSON.stringify({ enabled: true, provider: 'anthropic' });
				return null;
			})
		};
		const result = await loadFn({
			platform: { env: { KV: mockKV } },
			locals: authedLocals,
			params: { id: 'brand-1' }
		});
		expect(result.hasAIProviders).toBe(true);
	});

	it('should return hasAIProviders=false for workers-ai without the AI binding', async () => {
		const mockKV = {
			get: vi.fn().mockImplementation(async (key: string) => {
				if (key === 'ai_keys_list') return JSON.stringify(['key-1']);
				if (key === 'ai_key:key-1')
					return JSON.stringify({ enabled: true, provider: 'workers-ai', keyless: true });
				return null;
			})
		};
		const result = await loadFn({
			platform: { env: { KV: mockKV } },
			locals: authedLocals,
			params: { id: 'brand-1' }
		});
		expect(result.hasAIProviders).toBe(false);
	});

	it('should return hasAIProviders=true for keyless workers-ai when the binding is present', async () => {
		const mockKV = {
			get: vi.fn().mockImplementation(async (key: string) => {
				if (key === 'ai_keys_list') return JSON.stringify(['key-1']);
				if (key === 'ai_key:key-1')
					return JSON.stringify({ enabled: true, provider: 'workers-ai', keyless: true });
				return null;
			})
		};
		const result = await loadFn({
			platform: { env: { KV: mockKV, AI: { run: vi.fn() } } },
			locals: authedLocals,
			params: { id: 'brand-1' }
		});
		expect(result.hasAIProviders).toBe(true);
	});

	it('should return hasAIProviders=false when key data is null (key deleted)', async () => {
		const mockKV = {
			get: vi.fn().mockImplementation(async (key: string) => {
				if (key === 'ai_keys_list') return JSON.stringify(['key-1', 'key-2']);
				if (key === 'ai_key:key-1') return null; // deleted key
				if (key === 'ai_key:key-2') return null; // deleted key
				return null;
			})
		};
		const result = await loadFn({
			platform: { env: { KV: mockKV } },
			locals: authedLocals,
			params: { id: 'brand-1' }
		});
		expect(result.hasAIProviders).toBe(false);
	});

	it('should handle KV errors gracefully', async () => {
		const mockKV = {
			get: vi.fn().mockRejectedValue(new Error('KV timeout'))
		};
		const result = await loadFn({
			platform: { env: { KV: mockKV } },
			locals: authedLocals,
			params: { id: 'brand-1' }
		});
		expect(result.hasAIProviders).toBe(false);
	});

	it('should handle invalid JSON in ai_keys_list gracefully', async () => {
		const mockKV = {
			get: vi.fn().mockImplementation(async (key: string) => {
				if (key === 'ai_keys_list') return 'not-valid-json';
				return null;
			})
		};
		const result = await loadFn({
			platform: { env: { KV: mockKV } },
			locals: authedLocals,
			params: { id: 'brand-1' }
		});
		// JSON.parse will throw, caught by try/catch → hasAIProviders = false
		expect(result.hasAIProviders).toBe(false);
	});

	it('should check multiple keys and return true when at least one valid', async () => {
		const mockKV = {
			get: vi.fn().mockImplementation(async (key: string) => {
				if (key === 'ai_keys_list') return JSON.stringify(['key-1', 'key-2', 'key-3']);
				if (key === 'ai_key:key-1') return JSON.stringify({ enabled: false, provider: 'openai' });
				if (key === 'ai_key:key-2') return JSON.stringify({ enabled: true, provider: 'anthropic' });
				if (key === 'ai_key:key-3') return JSON.stringify({ enabled: true, provider: 'openai' });
				return null;
			})
		};
		const result = await loadFn({
			platform: { env: { KV: mockKV } },
			locals: authedLocals,
			params: { id: 'brand-1' }
		});
		expect(result.hasAIProviders).toBe(true);
	});

	it('should handle key with enabled undefined (not explicitly set to false)', async () => {
		const mockKV = {
			get: vi.fn().mockImplementation(async (key: string) => {
				if (key === 'ai_keys_list') return JSON.stringify(['key-1']);
				if (key === 'ai_key:key-1') return JSON.stringify({ provider: 'openai' }); // no enabled field
				return null;
			})
		};
		const result = await loadFn({
			platform: { env: { KV: mockKV } },
			locals: authedLocals,
			params: { id: 'brand-1' }
		});
		// key.enabled !== false → true, provider === 'openai' → true
		expect(result.hasAIProviders).toBe(true);
	});
});
