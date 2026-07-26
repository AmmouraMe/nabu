import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signSession } from '../../src/lib/server/session';

// The hook seeds a user row before re-reading it; that part is not under test here.
vi.mock('$lib/utils/db', () => ({
	ensureSessionUserRecord: vi.fn().mockResolvedValue(undefined)
}));

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

	function buildEvent(cookie: string | undefined, dbIsAdmin: number | null) {
		const deleted: string[] = [];
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
						DB: {
							prepare: () => ({
								bind: () => ({
									first: async () => (dbIsAdmin === null ? null : { is_admin: dbIsAdmin })
								})
							})
						}
					}
				}
			}
		};
	}

	const resolve = vi.fn().mockResolvedValue(new Response('ok'));

	it('keeps the owner admin even when the row says is_admin = 0', async () => {
		const cookie = await signSession(
			{ id: 'discord_293484886726279168', login: 'davis9001', isOwner: true, isAdmin: true },
			SECRET
		);
		const { event } = buildEvent(cookie, 0);
		const { handle } = await import('../../src/hooks.server');

		await handle({ event, resolve } as any);

		expect((event.locals as any).user.isOwner).toBe(true);
		expect((event.locals as any).user.isAdmin).toBe(true);
	});

	it('still demotes a non-owner whose row says is_admin = 0', async () => {
		const cookie = await signSession(
			{ id: 'discord_999', login: 'someone', isOwner: false, isAdmin: true },
			SECRET
		);
		const { event } = buildEvent(cookie, 0);
		const { handle } = await import('../../src/hooks.server');

		await handle({ event, resolve } as any);

		// A stale cookie claiming admin must not survive the refresh.
		expect((event.locals as any).user.isAdmin).toBe(false);
		expect((event.locals as any).user.isOwner).toBe(false);
	});

	it('promotes a non-owner whose row says is_admin = 1', async () => {
		const cookie = await signSession(
			{ id: 'discord_888', login: 'staff', isOwner: false, isAdmin: false },
			SECRET
		);
		const { event } = buildEvent(cookie, 1);
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
		const { event, deleted } = buildEvent(forged, 1);
		const { handle } = await import('../../src/hooks.server');

		await handle({ event, resolve } as any);

		expect((event.locals as any).user).toBeUndefined();
		expect(deleted).toContain('session');
	});
});
