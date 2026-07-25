import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for Discord OAuth Authentication
 * TDD: Testing the Discord OAuth flow
 */

// Mock SvelteKit redirect
const mockRedirect = vi.fn((status: number, location: string) => {
	const err = new Error('Redirect') as Error & { status: number; location: string; };
	err.status = status;
	err.location = location;
	throw err;
});

vi.mock('@sveltejs/kit', () => ({
	redirect: (status: number, location: string) => mockRedirect(status, location),
	isRedirect: (err: unknown) => {
		return err instanceof Error && 'location' in err && 'status' in err;
	}
}));

describe('Discord OAuth - Initial Redirect', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
		vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-123', subtle: globalThis.__REAL_SUBTLE__ });
	});

	it('should redirect to setup if Discord OAuth is not configured', async () => {
		const { GET } = await import('../../src/routes/api/auth/discord/+server');

		const mockUrl = new URL('http://localhost/api/auth/discord');
		const mockPlatform = {
			env: {
				DISCORD_CLIENT_ID: undefined,
				KV: {
					get: vi.fn().mockResolvedValue(null)
				}
			}
		};

		await expect(
			GET({
				url: mockUrl,
				platform: mockPlatform
			} as any)
		).rejects.toMatchObject({ status: 302, location: '/setup?error=oauth_not_configured' });
	});

	it('should redirect to Discord OAuth when configured via env', async () => {
		const { GET } = await import('../../src/routes/api/auth/discord/+server');

		const mockUrl = new URL('http://localhost/api/auth/discord');
		const mockPlatform = {
			env: {
				DISCORD_CLIENT_ID: 'test-discord-client-id',
				KV: null
			}
		};

		await expect(
			GET({
				url: mockUrl,
				platform: mockPlatform
			} as any)
		).rejects.toMatchObject({
			status: 302
		});

		expect(mockRedirect).toHaveBeenCalled();
		const redirectUrl = mockRedirect.mock.calls[0][1];
		expect(redirectUrl).toContain('https://discord.com/api/oauth2/authorize');
		expect(redirectUrl).toContain('client_id=test-discord-client-id');
		expect(redirectUrl).toContain('state=login%3Atest-uuid-123');
	});

	it('should mark profile-initiated Discord OAuth as link mode', async () => {
		const { GET } = await import('../../src/routes/api/auth/discord/+server');

		const mockUrl = new URL('http://localhost/api/auth/discord?mode=link');
		const mockPlatform = {
			env: {
				DISCORD_CLIENT_ID: 'test-discord-client-id'
			}
		};

		await expect(
			GET({
				url: mockUrl,
				platform: mockPlatform
			} as any)
		).rejects.toMatchObject({ status: 302 });

		const redirectUrl = mockRedirect.mock.calls[0][1];
		expect(redirectUrl).toContain('state=link%3Atest-uuid-123');
	});

	it('should redirect to Discord OAuth when configured via KV', async () => {
		const { GET } = await import('../../src/routes/api/auth/discord/+server');

		const mockUrl = new URL('http://localhost/api/auth/discord');
		const mockPlatform = {
			env: {
				DISCORD_CLIENT_ID: undefined,
				KV: {
					get: vi.fn().mockResolvedValue(JSON.stringify({ clientId: 'kv-discord-client-id' }))
				}
			}
		};

		await expect(
			GET({
				url: mockUrl,
				platform: mockPlatform
			} as any)
		).rejects.toMatchObject({
			status: 302
		});

		expect(mockRedirect).toHaveBeenCalled();
		const redirectUrl = mockRedirect.mock.calls[0][1];
		expect(redirectUrl).toContain('client_id=kv-discord-client-id');
	});

	it('should include correct Discord OAuth scopes', async () => {
		const { GET } = await import('../../src/routes/api/auth/discord/+server');

		const mockUrl = new URL('http://localhost/api/auth/discord');
		const mockPlatform = {
			env: {
				DISCORD_CLIENT_ID: 'test-discord-client-id'
			}
		};

		await expect(
			GET({
				url: mockUrl,
				platform: mockPlatform
			} as any)
		).rejects.toMatchObject({ status: 302 });

		const redirectUrl = mockRedirect.mock.calls[0][1];
		expect(redirectUrl).toContain('scope=identify+email');
	});
});

describe('Discord OAuth - Callback', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
		vi.stubGlobal('fetch', vi.fn());
	});

	it('should redirect to login with error when no code provided', async () => {
		const { GET } = await import('../../src/routes/api/auth/discord/callback/+server');

		const mockUrl = new URL('http://localhost/api/auth/discord/callback');
		const mockCookies = {
			set: vi.fn(),
			get: vi.fn()
		};

		await expect(
			GET({
				url: mockUrl,
				cookies: mockCookies,
				platform: {}
			} as any)
		).rejects.toMatchObject({ status: 302, location: '/auth/login?error=no_code' });
	});

	it('should redirect to login with error when Discord OAuth not configured', async () => {
		const { GET } = await import('../../src/routes/api/auth/discord/callback/+server');

		const mockUrl = new URL('http://localhost/api/auth/discord/callback?code=test-code');
		const mockCookies = {
			set: vi.fn(),
			get: vi.fn()
		};
		const mockPlatform = {
			env: {
				DISCORD_CLIENT_ID: undefined,
				DISCORD_CLIENT_SECRET: undefined,
				KV: {
					get: vi.fn().mockResolvedValue(null)
				}
			}
		};

		await expect(
			GET({
				url: mockUrl,
				cookies: mockCookies,
				platform: mockPlatform
			} as any)
		).rejects.toMatchObject({ status: 302, location: '/auth/login?error=not_configured' });
	});

	it('should exchange code for token and create session on success', async () => {
		const { GET } = await import('../../src/routes/api/auth/discord/callback/+server');

		const mockDiscordUser = {
			id: '123456789',
			username: 'testuser',
			discriminator: '0',
			email: 'test@discord.com',
			avatar: 'abc123'
		};

		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ access_token: 'discord-access-token' })
			} as any)
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockDiscordUser)
			} as any);

		const mockUrl = new URL('http://localhost/api/auth/discord/callback?code=test-code');
		const mockCookies = {
			set: vi.fn(),
			get: vi.fn()
		};
		const mockPlatform = {
			env: {
				DISCORD_CLIENT_ID: 'test-client-id',
				DISCORD_CLIENT_SECRET: 'test-client-secret',
				DB: {
					prepare: vi.fn().mockReturnValue({
						bind: vi.fn().mockReturnValue({
							first: vi.fn().mockResolvedValue(null),
							run: vi.fn().mockResolvedValue({})
						})
					})
				},
				KV: {
					get: vi.fn().mockResolvedValue(null),
					put: vi.fn().mockResolvedValue(undefined)
				}
			}
		};

		const response = await GET({
			url: mockUrl,
			cookies: mockCookies,
			platform: mockPlatform
		} as any);

		expect(response.status).toBe(302);
		expect(response.headers.get('Location')).toBe('http://localhost/');
		expect(response.headers.get('Set-Cookie')).toContain('session=');
	});

	it('should treat stale session cookies as normal login unless link mode was explicit', async () => {
		const { GET } = await import('../../src/routes/api/auth/discord/callback/+server');

		const staleSession = btoa(
			JSON.stringify({ id: 'stale-user', login: 'stale', email: 'stale@example.com' })
		)
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');

		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ access_token: 'discord-access-token' })
			} as any)
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({
					id: 'discord-user',
					username: 'realuser',
					global_name: 'Real User',
					email: 'real@example.com',
					avatar: 'abc123'
				})
			} as any);

		let callCount = 0;
		const mockUrl = new URL('http://localhost/api/auth/discord/callback?code=test-code&state=login:test-uuid-123');
		const mockCookies = {
			set: vi.fn(),
			get: vi.fn().mockReturnValue(staleSession)
		};
		const mockPlatform = {
			env: {
				DISCORD_CLIENT_ID: 'test-client-id',
				DISCORD_CLIENT_SECRET: 'test-client-secret',
				DB: {
					prepare: vi.fn().mockImplementation(() => ({
						bind: vi.fn().mockImplementation(() => ({
							first: vi.fn().mockImplementation(() => {
								callCount += 1;
								if (callCount === 1) {
									return Promise.resolve({ user_id: 'canonical-user' });
								}
								if (callCount === 2) {
									return Promise.resolve({
										id: 'canonical-user',
										email: 'real@example.com',
										name: 'Real User',
										github_login: 'realuser',
										github_avatar_url: 'https://example.com/avatar.png',
										is_admin: 0
									});
								}
								return Promise.resolve(null);
							}),
							run: vi.fn().mockResolvedValue({})
						}))
					}))
				},
				KV: {
					get: vi.fn().mockResolvedValue(null),
					put: vi.fn().mockResolvedValue(undefined)
				}
			}
		};

		const response = await GET({
			url: mockUrl,
			cookies: mockCookies,
			platform: mockPlatform
		} as any);

		expect(response.status).toBe(302);
		expect(response.headers.get('Location')).toBe('http://localhost/');
		expect(response.headers.get('Set-Cookie')).toContain('session=');
	});

	it('should handle token exchange failure', async () => {
		const { GET } = await import('../../src/routes/api/auth/discord/callback/+server');

		vi.mocked(fetch).mockResolvedValueOnce({
			ok: false,
			status: 400,
			text: () => Promise.resolve('Bad Request')
		} as any);

		const mockUrl = new URL('http://localhost/api/auth/discord/callback?code=invalid-code');
		const mockCookies = {
			set: vi.fn(),
			get: vi.fn()
		};
		const mockPlatform = {
			env: {
				DISCORD_CLIENT_ID: 'test-client-id',
				DISCORD_CLIENT_SECRET: 'test-client-secret'
			}
		};

		await expect(
			GET({
				url: mockUrl,
				cookies: mockCookies,
				platform: mockPlatform
			} as any)
		).rejects.toMatchObject({ status: 302, location: '/auth/login?error=token_exchange_failed' });
	});

	it('should handle user fetch failure', async () => {
		const { GET } = await import('../../src/routes/api/auth/discord/callback/+server');

		vi.mocked(fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ access_token: 'discord-access-token' })
			} as any)
			.mockResolvedValueOnce({
				ok: false,
				status: 401,
				text: () => Promise.resolve('Unauthorized')
			} as any);

		const mockUrl = new URL('http://localhost/api/auth/discord/callback?code=test-code');
		const mockCookies = {
			set: vi.fn(),
			get: vi.fn()
		};
		const mockPlatform = {
			env: {
				DISCORD_CLIENT_ID: 'test-client-id',
				DISCORD_CLIENT_SECRET: 'test-client-secret'
			}
		};

		await expect(
			GET({
				url: mockUrl,
				cookies: mockCookies,
				platform: mockPlatform
			} as any)
		).rejects.toMatchObject({ status: 302, location: '/auth/login?error=user_fetch_failed' });
	});
});
