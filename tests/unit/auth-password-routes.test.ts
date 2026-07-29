/**
 * `/api/auth/signup` and `/api/auth/login`.
 *
 * These endpoints are new because the pages in front of them were not real: both
 * forms used to `console.log` the credentials and resolve a `setTimeout`. So the
 * things worth asserting are the ones a stub could never get wrong — that an account
 * is actually written, that it lands on the free plan, that it cannot ask to be an
 * admin, and that every way of failing to log in looks the same from outside.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { hashPassword } from '../../src/lib/server/password';

const SECRET = 'test-session-secret';
const GOOD_PASSWORD = 'correct horse battery';
const FAST = 1_000;

interface UserRow {
	id: string;
	email: string;
	name: string | null;
	password_hash: string | null;
	is_admin: number;
	plan: string | null;
}

/** A D1 that stores users in a Map, so INSERT and SELECT actually agree. */
function fakeDb(seed: UserRow[] = [], opts: { insertError?: Error } = {}) {
	const users = new Map(seed.map((u) => [u.email, u]));
	const inserts: unknown[][] = [];

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
							return null;
						},
						async run() {
							if (flat.startsWith('INSERT INTO users')) {
								if (opts.insertError) throw opts.insertError;
								inserts.push(args);
								const [id, email, name, passwordHash, plan] = args as [
									string,
									string,
									string,
									string,
									string
								];
								users.set(email, {
									id,
									email,
									name,
									password_hash: passwordHash,
									is_admin: 0,
									plan
								});
							}
							if (flat.startsWith('UPDATE users SET password_hash')) {
								const [hash, id] = args as [string, string];
								for (const user of users.values()) {
									if (user.id === id) user.password_hash = hash;
								}
							}
							return { meta: { changes: 1 } };
						}
					};
				}
			};
		}
	} as unknown as D1Database;

	return { db, users, inserts };
}

function fakeKv() {
	const store = new Map<string, string>();
	return {
		store,
		kv: {
			get: vi.fn(async (key: string) => store.get(key) ?? null),
			put: vi.fn(async (key: string, value: string) => {
				store.set(key, value);
			}),
			delete: vi.fn(async (key: string) => {
				store.delete(key);
			})
		} as unknown as KVNamespace
	};
}

function event(body: unknown, over: Record<string, unknown> = {}) {
	return {
		request: new Request('https://nabu.test/api/auth/signup', {
			method: 'POST',
			body: typeof body === 'string' ? body : JSON.stringify(body),
			headers: { 'cf-connecting-ip': '203.0.113.9' }
		}),
		url: new URL('https://nabu.test/api/auth/signup'),
		platform: {
			env: { DB: fakeDb().db, SESSION_SECRET: SECRET, PASSWORD_ITERATIONS: String(FAST) }
		},
		...over
	};
}

function platformWith(db: D1Database, kv?: KVNamespace) {
	return {
		env: { DB: db, KV: kv, SESSION_SECRET: SECRET, PASSWORD_ITERATIONS: String(FAST) }
	};
}

/** The thrown SvelteKit error, or null when the call succeeded. */
async function caught(fn: () => unknown) {
	try {
		await fn();
		return null;
	} catch (err) {
		return err as { status: number; body: { message: string } };
	}
}

// ─── Signup ──────────────────────────────────────────────────────────

describe('POST /api/auth/signup', () => {
	let POST: typeof import('../../src/routes/api/auth/signup/+server').POST;

	beforeEach(async () => {
		({ POST } = await import('../../src/routes/api/auth/signup/+server'));
	});

	it('creates the account and signs the caller in', async () => {
		const { db, users } = fakeDb();

		const response = await POST(
			event(
				{ name: 'Ada', email: 'ada@example.com', password: GOOD_PASSWORD },
				{ platform: platformWith(db) }
			) as never
		);

		expect(response.status).toBe(201);
		const payload = await response.json();
		expect(payload.ok).toBe(true);
		expect(payload.user.email).toBe('ada@example.com');
		expect(users.has('ada@example.com')).toBe(true);

		const cookie = response.headers.get('Set-Cookie') ?? '';
		expect(cookie).toContain('session=');
		expect(cookie).toContain('HttpOnly');
		expect(cookie).toContain('SameSite=Lax');
		// The request is https, so the cookie must not be sent in the clear.
		expect(cookie).toContain('Secure');
	});

	it('puts the new account on the free plan', async () => {
		const { db, users } = fakeDb();

		const response = await POST(
			event(
				{ email: 'ada@example.com', password: GOOD_PASSWORD },
				{ platform: platformWith(db) }
			) as never
		);

		expect((await response.json()).plan).toBe('starter');
		expect(users.get('ada@example.com')!.plan).toBe('starter');
	});

	it('cannot be talked into making an admin or a paid account', async () => {
		const { db, users } = fakeDb();

		await POST(
			event(
				{
					email: 'ada@example.com',
					password: GOOD_PASSWORD,
					is_admin: 1,
					isAdmin: true,
					isOwner: true,
					plan: 'business'
				},
				{ platform: platformWith(db) }
			) as never
		);

		const created = users.get('ada@example.com')!;
		expect(created.is_admin).toBe(0);
		expect(created.plan).toBe('starter');
	});

	it('stores a hash, never the password', async () => {
		const { db, users } = fakeDb();

		await POST(
			event(
				{ email: 'ada@example.com', password: GOOD_PASSWORD },
				{ platform: platformWith(db) }
			) as never
		);

		const stored = users.get('ada@example.com')!.password_hash!;
		expect(stored).not.toContain(GOOD_PASSWORD);
		expect(stored.startsWith('pbkdf2$sha256$')).toBe(true);
	});

	it('normalises the email and derives a name when none is given', async () => {
		const { db, users } = fakeDb();

		await POST(
			event(
				{ email: '  Ada@Example.COM ', password: GOOD_PASSWORD },
				{ platform: platformWith(db) }
			) as never
		);

		expect(users.has('ada@example.com')).toBe(true);
		expect(users.get('ada@example.com')!.name).toBe('ada');
	});

	it('rejects a duplicate address', async () => {
		const { db } = fakeDb([
			{
				id: 'u1',
				email: 'ada@example.com',
				name: 'Ada',
				password_hash: 'x',
				is_admin: 0,
				plan: 'starter'
			}
		]);

		const err = await caught(() =>
			POST(
				event(
					{ email: 'ada@example.com', password: GOOD_PASSWORD },
					{ platform: platformWith(db) }
				) as never
			)
		);
		expect(err?.status).toBe(409);
	});

	it('rejects a duplicate the unique index catches after the check', async () => {
		// Two signups racing for one address both pass the SELECT; the constraint is
		// what actually decides, and it must not surface as a 500.
		const { db } = fakeDb([], { insertError: new Error('UNIQUE constraint failed: users.email') });

		const err = await caught(() =>
			POST(
				event(
					{ email: 'ada@example.com', password: GOOD_PASSWORD },
					{ platform: platformWith(db) }
				) as never
			)
		);
		expect(err?.status).toBe(409);
	});

	it('propagates a genuine database failure rather than calling it a duplicate', async () => {
		const { db } = fakeDb([], { insertError: new Error('disk exploded') });

		const err = await caught(() =>
			POST(
				event(
					{ email: 'ada@example.com', password: GOOD_PASSWORD },
					{ platform: platformWith(db) }
				) as never
			)
		);
		expect(err).toBeInstanceOf(Error);
		expect((err as unknown as Error).message).toBe('disk exploded');
	});

	it.each([
		['not-an-email', GOOD_PASSWORD],
		['ada@', GOOD_PASSWORD],
		['@example.com', GOOD_PASSWORD],
		['ada example@x.co', GOOD_PASSWORD]
	])('rejects the invalid address %s', async (email, password) => {
		const { db } = fakeDb();
		const err = await caught(() =>
			POST(event({ email, password }, { platform: platformWith(db) }) as never)
		);
		expect(err?.status).toBe(400);
	});

	it('rejects a password that fails the shared rules', async () => {
		const { db } = fakeDb();
		const err = await caught(() =>
			POST(
				event(
					{ email: 'ada@example.com', password: 'short' },
					{ platform: platformWith(db) }
				) as never
			)
		);
		expect(err?.status).toBe(400);
		expect(err?.body.message).toContain('10 characters');
	});

	it('rejects an absurd name', async () => {
		const { db } = fakeDb();
		const err = await caught(() =>
			POST(
				event(
					{ email: 'ada@example.com', password: GOOD_PASSWORD, name: 'n'.repeat(101) },
					{ platform: platformWith(db) }
				) as never
			)
		);
		expect(err?.status).toBe(400);
	});

	it('rejects a body that is not JSON', async () => {
		const { db } = fakeDb();
		const err = await caught(() =>
			POST(event('<not json>', { platform: platformWith(db) }) as never)
		);
		expect(err?.status).toBe(400);
	});

	it('answers 503 when there is no database to write to', async () => {
		const err = await caught(() =>
			POST(
				event(
					{ email: 'ada@example.com', password: GOOD_PASSWORD },
					{ platform: { env: {} } }
				) as never
			)
		);
		expect(err?.status).toBe(503);
	});
});

// ─── Login ───────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
	let POST: typeof import('../../src/routes/api/auth/login/+server').POST;

	beforeEach(async () => {
		({ POST } = await import('../../src/routes/api/auth/login/+server'));
	});

	async function seededDb(over: Partial<UserRow> = {}) {
		return fakeDb([
			{
				id: 'u1',
				email: 'ada@example.com',
				name: 'Ada',
				password_hash: await hashPassword(GOOD_PASSWORD, FAST),
				is_admin: 0,
				plan: 'starter',
				...over
			}
		]);
	}

	it('signs in with the right password', async () => {
		const { db } = await seededDb();

		const response = await POST(
			event(
				{ email: 'ada@example.com', password: GOOD_PASSWORD },
				{ platform: platformWith(db) }
			) as never
		);

		expect(response.status).toBe(200);
		const payload = await response.json();
		expect(payload.ok).toBe(true);
		expect(payload.plan).toBe('starter');
		expect(payload.redirect).toBe('/');
		expect(response.headers.get('Set-Cookie')).toContain('session=');
	});

	it('carries the account’s real plan', async () => {
		const { db } = await seededDb({ plan: 'business' });
		const response = await POST(
			event(
				{ email: 'ada@example.com', password: GOOD_PASSWORD },
				{ platform: platformWith(db) }
			) as never
		);
		expect((await response.json()).plan).toBe('business');
	});

	it('sends an admin to the admin area', async () => {
		const { db } = await seededDb({ is_admin: 1 });
		const response = await POST(
			event(
				{ email: 'ada@example.com', password: GOOD_PASSWORD },
				{ platform: platformWith(db) }
			) as never
		);
		expect((await response.json()).redirect).toBe('/admin');
	});

	it('refuses the wrong password', async () => {
		const { db } = await seededDb();
		const err = await caught(() =>
			POST(
				event(
					{ email: 'ada@example.com', password: 'wrong password' },
					{ platform: platformWith(db) }
				) as never
			)
		);
		expect(err?.status).toBe(401);
	});

	it('gives an unknown address the same answer as a wrong password', async () => {
		const { db } = await seededDb();

		const wrongPassword = await caught(() =>
			POST(
				event(
					{ email: 'ada@example.com', password: 'wrong password' },
					{ platform: platformWith(db) }
				) as never
			)
		);
		const unknownUser = await caught(() =>
			POST(
				event(
					{ email: 'nobody@example.com', password: GOOD_PASSWORD },
					{ platform: platformWith(db) }
				) as never
			)
		);

		expect(unknownUser?.status).toBe(wrongPassword?.status);
		expect(unknownUser?.body.message).toBe(wrongPassword?.body.message);
	});

	it('refuses an OAuth-only account without leaking that it exists', async () => {
		const { db } = await seededDb({ password_hash: null });
		const err = await caught(() =>
			POST(
				event(
					{ email: 'ada@example.com', password: GOOD_PASSWORD },
					{ platform: platformWith(db) }
				) as never
			)
		);
		expect(err?.status).toBe(401);
		expect(err?.body.message).toBe('Email or password is incorrect.');
	});

	it('accepts the address in any case', async () => {
		const { db } = await seededDb();
		const response = await POST(
			event(
				{ email: '  ADA@Example.com ', password: GOOD_PASSWORD },
				{ platform: platformWith(db) }
			) as never
		);
		expect(response.status).toBe(200);
	});

	it('requires both fields', async () => {
		const { db } = await seededDb();
		expect(
			(
				await caught(() =>
					POST(event({ email: 'ada@example.com' }, { platform: platformWith(db) }) as never)
				)
			)?.status
		).toBe(400);
		expect(
			(
				await caught(() =>
					POST(event({ password: GOOD_PASSWORD }, { platform: platformWith(db) }) as never)
				)
			)?.status
		).toBe(400);
	});

	it('rejects a body that is not JSON', async () => {
		const { db } = await seededDb();
		expect(
			(await caught(() => POST(event('nope', { platform: platformWith(db) }) as never)))?.status
		).toBe(400);
	});

	it('answers 503 without a database', async () => {
		expect(
			(
				await caught(() =>
					POST(
						event({ email: 'a@b.co', password: GOOD_PASSWORD }, { platform: { env: {} } }) as never
					)
				)
			)?.status
		).toBe(503);
	});

	it('closes the door after repeated failures', async () => {
		const { db } = await seededDb();
		const { kv } = fakeKv();
		const platform = platformWith(db, kv);

		for (let i = 0; i < 8; i++) {
			await caught(() =>
				POST(event({ email: 'ada@example.com', password: 'wrong password' }, { platform }) as never)
			);
		}

		// Even the correct password now waits for the window to pass.
		const err = await caught(() =>
			POST(event({ email: 'ada@example.com', password: GOOD_PASSWORD }, { platform }) as never)
		);
		expect(err?.status).toBe(429);
	});

	it('forgets the failures once someone signs in', async () => {
		const { db } = await seededDb();
		const { kv } = fakeKv();
		const platform = platformWith(db, kv);

		for (let i = 0; i < 5; i++) {
			await caught(() =>
				POST(event({ email: 'ada@example.com', password: 'wrong password' }, { platform }) as never)
			);
		}
		await POST(event({ email: 'ada@example.com', password: GOOD_PASSWORD }, { platform }) as never);

		// A clean slate: five more failures still do not trip the limit.
		for (let i = 0; i < 5; i++) {
			await caught(() =>
				POST(event({ email: 'ada@example.com', password: 'wrong password' }, { platform }) as never)
			);
		}
		const response = await POST(
			event({ email: 'ada@example.com', password: GOOD_PASSWORD }, { platform }) as never
		);
		expect(response.status).toBe(200);
	});

	it('upgrades a hash minted at a weaker work factor', async () => {
		const { db, users } = await seededDb({
			password_hash: await hashPassword(GOOD_PASSWORD, FAST)
		});
		const platform = {
			env: { DB: db, SESSION_SECRET: SECRET, PASSWORD_ITERATIONS: String(FAST * 10) }
		};

		await POST(event({ email: 'ada@example.com', password: GOOD_PASSWORD }, { platform }) as never);

		expect(Number(users.get('ada@example.com')!.password_hash!.split('$')[2])).toBe(FAST * 10);
	});

	it('still signs the user in when the rehash write fails', async () => {
		const { db } = await seededDb();
		const original = db.prepare.bind(db);
		vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
			if (sql.includes('UPDATE users SET password_hash')) {
				throw new Error('write failed');
			}
			return original(sql);
		});

		const platform = {
			env: { DB: db, SESSION_SECRET: SECRET, PASSWORD_ITERATIONS: String(FAST * 10) }
		};
		const response = await POST(
			event({ email: 'ada@example.com', password: GOOD_PASSWORD }, { platform }) as never
		);
		expect(response.status).toBe(200);
	});
});
