import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signSession } from '../../src/lib/server/session';

// `sequence()` needs SvelteKit's per-request AsyncLocalStorage, which does not exist
// outside a real request ("Could not get the request store"). Only one handler is
// composed here, so collapsing it to that handler tests the same code path.
vi.mock('@sveltejs/kit/hooks', () => ({
	sequence: (...handlers: unknown[]) => handlers[0]
}));

const SECRET = 'test-session-secret';

/**
 * `hooks.server.ts` re-derives `isAdmin` from the database on every request. That
 * refresh must never be able to demote the owner: an owner identified by
 * GITHUB_OWNER_ID / DISCORD_OWNER_ID does not necessarily carry `is_admin = 1` in
 * their row, so without the owner clause they come back isOwner: true /
 * isAdmin: false and are refused by every admin route that gates on isAdmin.
 */
describe('hooks.server - admin refresh must not demote the owner', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	function buildEvent(
		cookie: string | undefined,
		userId: string,
		dbIsAdmin: number | null,
		ownerId?: string
	) {
		const deleted: string[] = [];
		const prepare = vi.fn((query: string) => ({
			bind: () => ({
				first: async () => {
					if (query.startsWith('SELECT * FROM sessions')) {
						return dbIsAdmin === null ? null : { id: 'digest', user_id: userId };
					}
					if (query.includes('FROM users WHERE id = ?')) {
						return dbIsAdmin === null
							? null
							: {
									id: userId,
									email: `${userId}@example.com`,
									name: null,
									github_login: null,
									github_avatar_url: null,
									is_admin: dbIsAdmin
								};
					}
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
				platform: {
					env: {
						SESSION_SECRET: SECRET,
						GITHUB_OWNER_ID: ownerId,
						DB: { prepare }
					}
				}
			}
		};
	}

	const resolve = vi.fn().mockResolvedValue(new Response('ok'));

	it('keeps the owner admin even when the row says is_admin = 0', async () => {
		const userId = '293484886726279168';
		const cookie = await signSession({ token: 'owner-session-token' }, SECRET);
		const { event } = buildEvent(cookie, userId, 0, userId);
		const { handle } = await import('../../src/hooks.server');

		await handle({ event, resolve } as any);

		expect((event.locals as any).user.isOwner).toBe(true);
		expect((event.locals as any).user.isAdmin).toBe(true);
	});

	it('still demotes a non-owner whose row says is_admin = 0', async () => {
		const userId = 'discord_999';
		const cookie = await signSession({ token: 'member-session-token' }, SECRET);
		const { event } = buildEvent(cookie, userId, 0);
		const { handle } = await import('../../src/hooks.server');

		await handle({ event, resolve } as any);

		// A stale cookie claiming admin must not survive the refresh.
		expect((event.locals as any).user.isAdmin).toBe(false);
		expect((event.locals as any).user.isOwner).toBe(false);
	});

	it('promotes a non-owner whose row says is_admin = 1', async () => {
		const userId = 'discord_888';
		const cookie = await signSession({ token: 'staff-session-token' }, SECRET);
		const { event } = buildEvent(cookie, userId, 1);
		const { handle } = await import('../../src/hooks.server');

		await handle({ event, resolve } as any);

		expect((event.locals as any).user.isAdmin).toBe(true);
	});

	it('drops a forged cookie entirely', async () => {
		// Unsigned, self-asserted owner — the exact shape of the old forgery bug.
		const forged = btoa(JSON.stringify({ id: 'x', isOwner: true, isAdmin: true }))
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');
		const { event, deleted } = buildEvent(forged, 'x', 1);
		const { handle } = await import('../../src/hooks.server');

		await handle({ event, resolve } as any);

		expect((event.locals as any).user).toBeUndefined();
		expect(deleted).toContain('session');
	});
});

/**
 * AGENTS.md rule: auth fails closed when D1 is unavailable. A session cookie
 * that cannot be verified — because the DB binding (or the whole platform
 * object) is missing — must never leave a user object on locals; the cookie
 * is dropped and the request still resolves as anonymous.
 */
describe('hooks.server - auth fails closed when the session DB is unavailable', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	const resolve = vi.fn().mockResolvedValue(new Response('ok'));

	function buildDblessEvent(cookie: string, platform: unknown) {
		const deleted: string[] = [];
		return {
			deleted,
			event: {
				cookies: {
					get: vi.fn().mockReturnValue(cookie),
					delete: vi.fn((name: string) => deleted.push(name))
				},
				// Pre-seeded stale identity: fail-closed must clear it, not keep it.
				locals: { user: { id: 'stale', isOwner: true, isAdmin: true } } as Record<string, unknown>,
				platform
			}
		};
	}

	it('clears the user and deletes the cookie when platform.env has no DB', async () => {
		const cookie = await signSession({ token: 'valid-signed-token' }, SECRET);
		const { event, deleted } = buildDblessEvent(cookie, { env: { SESSION_SECRET: SECRET } });
		const { handle } = await import('../../src/hooks.server');

		const response = await handle({ event, resolve } as any);

		expect((event.locals as any).user).toBeUndefined();
		expect(deleted).toContain('session');
		expect(resolve).toHaveBeenCalled();
		expect(response).toBeInstanceOf(Response);
	});

	it('clears the user and deletes the cookie when the platform is missing entirely', async () => {
		const cookie = await signSession({ token: 'valid-signed-token' }, SECRET);
		const { event, deleted } = buildDblessEvent(cookie, undefined);
		const { handle } = await import('../../src/hooks.server');

		const response = await handle({ event, resolve } as any);

		expect((event.locals as any).user).toBeUndefined();
		expect(deleted).toContain('session');
		expect(resolve).toHaveBeenCalled();
		expect(response).toBeInstanceOf(Response);
	});

	it('clears the user and deletes the cookie when platform has no env', async () => {
		const cookie = await signSession({ token: 'valid-signed-token' }, SECRET);
		const { event, deleted } = buildDblessEvent(cookie, {});
		const { handle } = await import('../../src/hooks.server');

		const response = await handle({ event, resolve } as any);

		expect((event.locals as any).user).toBeUndefined();
		expect(deleted).toContain('session');
		expect(resolve).toHaveBeenCalled();
		expect(response).toBeInstanceOf(Response);
	});

	it('leaves an anonymous request untouched when no session cookie is present', async () => {
		const deleted: string[] = [];
		const event = {
			cookies: {
				get: vi.fn().mockReturnValue(undefined),
				delete: vi.fn((name: string) => deleted.push(name))
			},
			locals: {} as Record<string, unknown>,
			platform: undefined
		};
		const { handle } = await import('../../src/hooks.server');

		const response = await handle({ event, resolve } as any);

		expect((event.locals as any).user).toBeUndefined();
		expect(deleted).toHaveLength(0);
		expect(response).toBeInstanceOf(Response);
	});
});

/**
 * Remaining fail-closed branches of the session pipeline: a revoked/expired
 * session row, a session pointing at a deleted user, and the login fallback
 * when the email has an empty local part.
 */
describe('hooks.server - session validation edge branches', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	const resolve = vi.fn().mockResolvedValue(new Response('ok'));

	function buildRowEvent(
		cookie: string,
		sessionRow: Record<string, unknown> | null,
		userRow: Record<string, unknown> | null
	) {
		const deleted: string[] = [];
		const prepare = vi.fn((query: string) => ({
			bind: () => ({
				first: async () => {
					if (query.startsWith('SELECT * FROM sessions')) return sessionRow;
					if (query.includes('FROM users WHERE id = ?')) return userRow;
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
				locals: { user: { id: 'stale' } } as Record<string, unknown>,
				platform: { env: { SESSION_SECRET: SECRET, DB: { prepare } } }
			}
		};
	}

	it('fails closed when the session row is expired or revoked', async () => {
		const cookie = await signSession({ token: 'revoked-token' }, SECRET);
		const { event, deleted } = buildRowEvent(cookie, null, {
			id: 'user-1',
			email: 'user-1@example.com',
			name: null,
			github_login: null,
			github_avatar_url: null,
			is_admin: 0
		});
		const { handle } = await import('../../src/hooks.server');

		await handle({ event, resolve } as any);

		expect((event.locals as any).user).toBeUndefined();
		expect(deleted).toContain('session');
	});

	it('fails closed when the session points at a missing user row', async () => {
		const cookie = await signSession({ token: 'orphan-token' }, SECRET);
		const { event, deleted } = buildRowEvent(cookie, { id: 'digest', user_id: 'ghost-user' }, null);
		const { handle } = await import('../../src/hooks.server');

		await handle({ event, resolve } as any);

		expect((event.locals as any).user).toBeUndefined();
		expect(deleted).toContain('session');
	});

	it('falls back to the full email as login when the local part is empty', async () => {
		const cookie = await signSession({ token: 'odd-email-token' }, SECRET);
		const { event } = buildRowEvent(
			cookie,
			{ id: 'digest', user_id: 'user-odd' },
			{
				id: 'user-odd',
				email: '@example.com',
				name: null,
				github_login: null,
				github_avatar_url: null,
				is_admin: 0
			}
		);
		const { handle } = await import('../../src/hooks.server');

		await handle({ event, resolve } as any);

		expect((event.locals as any).user.login).toBe('@example.com');
		expect((event.locals as any).user.isAdmin).toBe(false);
	});
});
