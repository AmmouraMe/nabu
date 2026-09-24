import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signSession } from '../../src/lib/server/session';
import { devUserId, isDevLoginEnabled, isDevUserId } from '../../src/lib/server/dev-auth';

vi.mock('@sveltejs/kit/hooks', () => ({
	sequence: (...handlers: unknown[]) => handlers[0]
}));

const SECRET = 'test-session-secret';

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('dev-auth helpers', () => {
	it('derives a namespaced, lower-cased id from the email', () => {
		expect(devUserId('  Ann@Example.COM ')).toBe('dev:ann@example.com');
		expect(isDevUserId('dev:ann@example.com')).toBe(true);
		expect(isDevUserId('12345')).toBe(false);
		expect(isDevUserId(undefined)).toBe(false);
		expect(isDevUserId(null)).toBe(false);
	});

	it('is enabled under vite dev', () => {
		vi.stubEnv('DEV', true);
		expect(isDevLoginEnabled(undefined)).toBe(true);
	});

	it('is disabled in a build unless ALLOW_DEV_LOGIN is exactly "true"', () => {
		vi.stubEnv('DEV', false);
		expect(isDevLoginEnabled(undefined)).toBe(false);
		expect(isDevLoginEnabled(null)).toBe(false);
		expect(isDevLoginEnabled({ env: { ALLOW_DEV_LOGIN: '1' } } as App.Platform)).toBe(false);
		expect(isDevLoginEnabled({ env: { ALLOW_DEV_LOGIN: 'true' } } as App.Platform)).toBe(true);
	});
});

describe('GET /api/auth/dev', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	function platformWith(env: Record<string, unknown> = {}) {
		const binds: unknown[][] = [];
		const prepare = vi.fn(() => ({
			bind: (...args: unknown[]) => {
				binds.push(args);
				return { run: vi.fn().mockResolvedValue({}) };
			}
		}));
		return { binds, platform: { env: { SESSION_SECRET: SECRET, DB: { prepare }, ...env } } };
	}

	async function call(query: string, platform: unknown) {
		const { GET } = await import('../../src/routes/api/auth/dev/+server');
		const url = new URL(`http://localhost/api/auth/dev${query}`);
		return (GET as (event: unknown) => Promise<Response>)({ url, platform });
	}

	it('404s when dev login is disabled', async () => {
		vi.stubEnv('DEV', false);
		const { platform } = platformWith();
		await expect(call('', platform)).rejects.toMatchObject({ status: 404 });
	});

	it('works on a staging Worker that opts in', async () => {
		vi.stubEnv('DEV', false);
		const { platform, binds } = platformWith({ ALLOW_DEV_LOGIN: 'true' });
		const response = await call('?admin=0', platform);
		expect(response.status).toBe(302);
		expect(binds[0]).toEqual(['dev:dev-user@nabu.local', 'dev-user@nabu.local', 'Dev User', 0]);
	});

	it('ignores a caller-supplied id, so it cannot take over a real user or the owner', async () => {
		vi.stubEnv('DEV', true);
		const { platform, binds } = platformWith({ GITHUB_OWNER_ID: '424242' });
		const response = await call('?id=424242&email=Owner@Example.com', platform);
		expect(response.status).toBe(302);
		// users upsert binds (id, email, name, is_admin); the id is namespaced.
		expect(binds[0][0]).toBe('dev:owner@example.com');
		// sessions insert binds (digest, user_id, expires_at).
		expect(binds[1][1]).toBe('dev:owner@example.com');
		expect(binds.flat()).not.toContain('424242');
	});

	it('refuses an off-site redirect', async () => {
		vi.stubEnv('DEV', true);
		const { platform } = platformWith();
		const response = await call('?redirect=//evil.example', platform);
		expect(response.headers.get('Location')).toBe('http://localhost/');
	});

	it('503s without a database', async () => {
		vi.stubEnv('DEV', true);
		await expect(call('', { env: {} })).rejects.toMatchObject({ status: 503 });
	});

	it('503s when the user upsert fails', async () => {
		vi.stubEnv('DEV', true);
		const prepare = vi.fn(() => ({
			bind: () => ({ run: vi.fn().mockRejectedValue(new Error('UNIQUE constraint failed')) })
		}));
		await expect(
			call('?email=taken@example.com', { env: { SESSION_SECRET: SECRET, DB: { prepare } } })
		).rejects.toMatchObject({ status: 503 });
	});
});

describe('authHandler - dev-login sessions', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	function buildEvent(cookie: string, userId: string, env: Record<string, unknown> = {}) {
		const deleted: string[] = [];
		const prepare = vi.fn((query: string) => ({
			bind: () => ({
				first: async () => {
					if (query.startsWith('SELECT * FROM sessions')) return { id: 'digest', user_id: userId };
					if (query.includes('FROM users WHERE id = ?'))
						return {
							id: userId,
							email: 'dev-admin@nabu.local',
							name: 'Dev Admin',
							profile_login: null,
							profile_avatar_url: null,
							github_login: null,
							github_avatar_url: null,
							is_admin: 1,
							plan: null
						};
					return null;
				}
			})
		}));
		return {
			deleted,
			event: {
				cookies: {
					get: vi.fn().mockReturnValue(cookie),
					delete: vi.fn((name: string) => deleted.push(name))
				},
				locals: {} as Record<string, unknown>,
				platform: { env: { SESSION_SECRET: SECRET, DB: { prepare }, ...env } }
			}
		};
	}

	const resolve = vi.fn().mockResolvedValue(new Response('ok'));

	it('rejects a dev account once dev login is off', async () => {
		vi.stubEnv('DEV', false);
		const cookie = await signSession({ token: 'opaque' }, SECRET);
		const { event, deleted } = buildEvent(cookie, 'dev:dev-admin@nabu.local');
		const { handle } = await import('../../src/hooks.server');
		await handle({ event, resolve } as never);
		expect(event.locals.user).toBeUndefined();
		expect(deleted).toContain('session');
	});

	it('accepts a dev account while dev login is on', async () => {
		vi.stubEnv('DEV', false);
		const cookie = await signSession({ token: 'opaque' }, SECRET);
		const { event } = buildEvent(cookie, 'dev:dev-admin@nabu.local', { ALLOW_DEV_LOGIN: 'true' });
		const { handle } = await import('../../src/hooks.server');
		await handle({ event, resolve } as never);
		expect(event.locals.user).toMatchObject({ id: 'dev:dev-admin@nabu.local', isAdmin: true });
	});

	it('still accepts a regular account with dev login off', async () => {
		vi.stubEnv('DEV', false);
		const cookie = await signSession({ token: 'opaque' }, SECRET);
		const { event } = buildEvent(cookie, 'user-123');
		const { handle } = await import('../../src/hooks.server');
		await handle({ event, resolve } as never);
		expect(event.locals.user).toMatchObject({ id: 'user-123' });
	});
});
