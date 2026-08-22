/**
 * The contract between issuing a session and accepting one.
 *
 * This exists because of a bug that nothing caught. `/api/auth/signup` and
 * `/api/auth/login` were written when the session cookie carried the identity;
 * the hook was later rewritten to expect an opaque token looked up in the
 * `sessions` table. Both routes kept their old cookie, which the new hook
 * rejects — so signing up handed you a cookie the very next request discarded,
 * and you landed straight back on logged-out.
 *
 * Neither route conflicted in git, because the file predates the branch that
 * changed the rules. And both sat at **100% statement coverage** the whole time,
 * because every existing test asserted status codes and database writes and
 * nothing asserted what the cookie actually was. Coverage measures which lines
 * ran, not which contracts hold.
 *
 * So these tests do the round trip on purpose: take the cookie the route really
 * returns, decode it the way the hook really does, and look the session up the
 * way the hook really does. If issuance and acceptance ever drift apart again,
 * this fails.
 */

import { describe, it, expect, vi } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { hashPassword } from '../../src/lib/server/password';
import { decodeDatabaseSessionCookie } from '../../src/lib/server/session';
import { findValidSession, hashSessionToken } from '../../src/lib/utils/db';

const SECRET = 'test-session-secret';
const PASSWORD = 'correct horse battery';
const FAST = 1_000;

interface UserRow {
	id: string;
	email: string;
	name: string | null;
	password_hash: string | null;
	is_admin: number;
	plan: string | null;
}

interface SessionRow {
	id: string;
	user_id: string;
	expires_at: string;
}

/** A D1 that stores users *and* sessions, so issuance and lookup really agree. */
function fakeDb(seed: UserRow[] = []) {
	const users = new Map(seed.map((u) => [u.email, u]));
	const sessions = new Map<string, SessionRow>();

	const db = {
		prepare(sql: string) {
			const flat = sql.replace(/\s+/g, ' ').trim();
			return {
				bind(...args: unknown[]) {
					return {
						async first<T>(): Promise<T | null> {
							if (flat.startsWith('SELECT id FROM users WHERE email')) {
								const found = users.get(args[0] as string);
								return found ? ({ id: found.id } as T) : null;
							}
							if (flat.startsWith('SELECT id, email, name, password_hash')) {
								return (users.get(args[0] as string) as T) ?? null;
							}
							if (flat.startsWith('SELECT * FROM sessions WHERE id')) {
								return (sessions.get(args[0] as string) as T) ?? null;
							}
							return null;
						},
						async run() {
							if (flat.startsWith('INSERT INTO users')) {
								const [id, email, name, passwordHash, plan] = args as string[];
								users.set(email, {
									id,
									email,
									name,
									password_hash: passwordHash,
									is_admin: 0,
									plan
								});
							}
							if (flat.startsWith('INSERT INTO sessions')) {
								const [id, userId, expiresAt] = args as string[];
								sessions.set(id, { id, user_id: userId, expires_at: expiresAt });
							}
							return { meta: { changes: 1 } };
						}
					};
				}
			};
		}
	} as unknown as D1Database;

	return { db, users, sessions };
}

function platform(db: D1Database) {
	return { env: { DB: db, SESSION_SECRET: SECRET, PASSWORD_ITERATIONS: String(FAST) } };
}

function event(path: string, body: unknown, db: D1Database) {
	return {
		request: new Request(`https://nabu.test${path}`, {
			method: 'POST',
			body: JSON.stringify(body),
			headers: { 'cf-connecting-ip': '203.0.113.9' }
		}),
		url: new URL(`https://nabu.test${path}`),
		platform: platform(db)
	};
}

/** The `session=` value out of a Set-Cookie header. */
function cookieValue(response: Response): string {
	const header = response.headers.get('Set-Cookie');
	expect(header).toBeTruthy();
	const match = /(?:^|;\s*)session=([^;]+)/.exec(header!);
	expect(match).toBeTruthy();
	return match![1];
}

/** Exactly what the hook does with the cookie it is handed. */
async function resolveLikeTheHook(db: D1Database, cookie: string) {
	const token = await decodeDatabaseSessionCookie(cookie, SECRET);
	if (!token) return null;
	return findValidSession(db, token);
}

describe('signup issues a session the hook will accept', () => {
	it('round-trips: cookie → token → sessions row for the new user', async () => {
		const { POST } = await import('../../src/routes/api/auth/signup/+server');
		const { db, users, sessions } = fakeDb();

		const response = (await POST(
			event(
				'/api/auth/signup',
				{ name: 'Davis', email: 'davis@example.com', password: PASSWORD },
				db
			) as never
		)) as Response;

		expect(response.status).toBe(201);

		// A row was actually written, not just a cookie handed out.
		expect(sessions.size).toBe(1);

		const session = await resolveLikeTheHook(db, cookieValue(response));
		expect(session).not.toBeNull();
		expect(session!.user_id).toBe(users.get('davis@example.com')!.id);
	});

	it('stores only the hash of the token, never the token itself', async () => {
		const { POST } = await import('../../src/routes/api/auth/signup/+server');
		const { db, sessions } = fakeDb();

		const response = (await POST(
			event(
				'/api/auth/signup',
				{ name: 'Davis', email: 'davis@example.com', password: PASSWORD },
				db
			) as never
		)) as Response;

		const token = (await decodeDatabaseSessionCookie(cookieValue(response), SECRET))!;
		const storedId = [...sessions.keys()][0];

		// A database read must not yield anything that can be replayed as a cookie.
		expect(storedId).not.toBe(token);
		expect(storedId).toBe(await hashSessionToken(token));
	});

	it('does not sign the identity into the cookie any more', async () => {
		const { POST } = await import('../../src/routes/api/auth/signup/+server');
		const { db } = fakeDb();

		const response = (await POST(
			event(
				'/api/auth/signup',
				{ name: 'Davis', email: 'davis@example.com', password: PASSWORD },
				db
			) as never
		)) as Response;

		// The payload is a token wrapper, not a user record — decoding it as the
		// hook does yields a string, and the email never appears in the cookie.
		expect(cookieValue(response)).not.toContain('davis');
		expect(typeof (await decodeDatabaseSessionCookie(cookieValue(response), SECRET))).toBe(
			'string'
		);
	});
});

describe('login issues a session the hook will accept', () => {
	async function seeded() {
		const hash = await hashPassword(PASSWORD, FAST);
		return fakeDb([
			{
				id: 'user-1',
				email: 'davis@example.com',
				name: 'Davis',
				password_hash: hash,
				is_admin: 0,
				plan: 'starter'
			}
		]);
	}

	it('round-trips: cookie → token → sessions row for the right user', async () => {
		const { POST } = await import('../../src/routes/api/auth/login/+server');
		const { db, sessions } = await seeded();

		const response = (await POST(
			event('/api/auth/login', { email: 'davis@example.com', password: PASSWORD }, db) as never
		)) as Response;

		expect(sessions.size).toBe(1);

		const session = await resolveLikeTheHook(db, cookieValue(response));
		expect(session).not.toBeNull();
		expect(session!.user_id).toBe('user-1');
	});

	it('gives a different token every time, so one cookie is not reusable forever', async () => {
		const { POST } = await import('../../src/routes/api/auth/login/+server');
		const { db } = await seeded();

		const first = (await POST(
			event('/api/auth/login', { email: 'davis@example.com', password: PASSWORD }, db) as never
		)) as Response;
		const second = (await POST(
			event('/api/auth/login', { email: 'davis@example.com', password: PASSWORD }, db) as never
		)) as Response;

		expect(cookieValue(first)).not.toBe(cookieValue(second));
	});

	it('is refused when signed with the wrong secret', async () => {
		const { POST } = await import('../../src/routes/api/auth/login/+server');
		const { db } = await seeded();

		const response = (await POST(
			event('/api/auth/login', { email: 'davis@example.com', password: PASSWORD }, db) as never
		)) as Response;

		// The signature is what stops a caller writing their own token in.
		expect(await decodeDatabaseSessionCookie(cookieValue(response), 'other-secret')).toBeNull();
	});
});

describe('the cookie itself', () => {
	it('is HttpOnly and SameSite=Lax', async () => {
		const { POST } = await import('../../src/routes/api/auth/signup/+server');
		const { db } = fakeDb();

		const response = (await POST(
			event(
				'/api/auth/signup',
				{ name: 'Davis', email: 'davis@example.com', password: PASSWORD },
				db
			) as never
		)) as Response;

		const header = response.headers.get('Set-Cookie')!;
		expect(header).toContain('HttpOnly');
		expect(header).toContain('SameSite=Lax');
		expect(header).toContain('Path=/');
	});
});
