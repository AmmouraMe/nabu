/**
 * Saving generations, and keeping suggested names unique across everybody.
 *
 * The uniqueness check reads across every user's history, so the tests that
 * matter most here are the ones about what that check is *allowed to know*. A
 * brief describes an unlaunched business; it must never come back to anyone but
 * its author, and a logged-out visitor's brief must never come back at all.
 */

import { describe, it, expect, vi } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import {
	listGenerations,
	nameKey,
	reserveName,
	saveGeneration
} from '../../src/lib/server/namer/history';
import type { GeneratedName } from '../../src/lib/server/namer/naming';

const NAME: GeneratedName = {
	name: 'Ardor',
	meaning: 'A burning.',
	sound: 'Warm.',
	radio: 'Spells itself.',
	translation: 'None.',
	domain: 'ardor.com',
	checks: { syllables: 2, alphabeticalRank: 1, initial: 'A', typable: true }
};

interface GenRow {
	id: string;
	user_id: string | null;
	description: string;
	audience: string | null;
	archetype: string | null;
	require_tlds: string | null;
	names: string;
	created_at: string;
}

/**
 * A D1 that enforces the reserved-name primary key, so the conditional insert is
 * exercised rather than assumed.
 */
function fakeDb(seedNames: string[] = [], seedRows: GenRow[] = []) {
	const reserved = new Set(seedNames);
	const rows: GenRow[] = [...seedRows];

	const db = {
		prepare(sql: string) {
			const flat = sql.replace(/\s+/g, ' ').trim();
			return {
				bind(...args: unknown[]) {
					return {
						async run() {
							if (flat.startsWith('INSERT INTO namer_reserved_names')) {
								const key = args[0] as string;
								if (reserved.has(key)) return { meta: { changes: 0 } };
								reserved.add(key);
								return { meta: { changes: 1 } };
							}
							if (flat.startsWith('INSERT INTO namer_generations')) {
								const [id, userId, description, audience, archetype, requireTlds, names] = args as (
									| string
									| null
								)[];
								rows.push({
									id: id as string,
									user_id: userId,
									description: description as string,
									audience,
									archetype,
									require_tlds: requireTlds,
									names: names as string,
									created_at: '2026-08-20T00:00:00Z'
								});
								return { meta: { changes: 1 } };
							}
							return { meta: { changes: 0 } };
						},
						async all<T>() {
							if (flat.includes('FROM namer_generations')) {
								// The real query filters on user_id; the fake does the same, so a
								// missing WHERE in the source would show up as a failing test.
								const [userId, limit] = args as [string, number];
								return {
									results: rows
										.filter((r) => r.user_id === userId)
										.slice(0, limit) as unknown as T[]
								};
							}
							return { results: [] as T[] };
						}
					};
				}
			};
		}
	} as unknown as D1Database;

	return { db, reserved, rows };
}

describe('nameKey', () => {
	it('collapses case and spacing, so near-identical names collide', () => {
		expect(nameKey('Blue Bottle')).toBe('bluebottle');
		expect(nameKey('bluebottle')).toBe('bluebottle');
		expect(nameKey('BlueBottle')).toBe('bluebottle');
	});

	it('is empty for a name with nothing usable in it', () => {
		expect(nameKey('!!!')).toBe('');
	});
});

describe('reserveName', () => {
	it('claims a free name', async () => {
		const { db, reserved } = fakeDb();
		expect(await reserveName(db, 'Ardor')).toBe(true);
		expect(reserved.has('ardor')).toBe(true);
	});

	it('refuses one somebody already has', async () => {
		const { db } = fakeDb(['ardor']);
		expect(await reserveName(db, 'Ardor')).toBe(false);
	});

	it('refuses a different spelling of the same name', async () => {
		const { db } = fakeDb(['bluebottle']);
		expect(await reserveName(db, 'Blue Bottle')).toBe(false);
	});

	it('decides by conditional insert, not read-then-write', async () => {
		// Two callers racing would both read "free" and both be handed the name,
		// which is the collision this exists to prevent. Only one insert changes a
		// row, so only one caller wins.
		const { db } = fakeDb();
		const [first, second] = await Promise.all([reserveName(db, 'Ardor'), reserveName(db, 'Ardor')]);
		expect([first, second].filter(Boolean)).toHaveLength(1);
	});

	it('refuses a name with no usable characters', async () => {
		const { db } = fakeDb();
		expect(await reserveName(db, '!!!')).toBe(false);
	});

	it('treats a driver that reports no meta as a failed claim', async () => {
		// D1 always returns meta, but a shim or a future version might not, and
		// "unknown" must not be read as "you own this name".
		const vague = {
			prepare: () => ({ bind: () => ({ run: async () => ({}) }) })
		} as unknown as D1Database;
		expect(await reserveName(vague, 'Ardor')).toBe(false);
	});

	it('fails open when the database errors, costing uniqueness not the generator', async () => {
		const broken = {
			prepare: () => ({
				bind: () => ({
					run: async () => {
						throw new Error('D1 down');
					}
				})
			})
		} as unknown as D1Database;
		expect(await reserveName(broken, 'Ardor')).toBe(true);
	});
});

describe('saveGeneration', () => {
	it("stores a signed-in user's generation against them", async () => {
		const { db, rows } = fakeDb();
		await saveGeneration(db, {
			id: 'gen-1',
			userId: 'user-1',
			input: { description: 'A coffee box', requireTlds: ['com'] },
			names: [NAME]
		});

		expect(rows).toHaveLength(1);
		expect(rows[0].user_id).toBe('user-1');
		expect(JSON.parse(rows[0].names)[0].name).toBe('Ardor');
	});

	it("stores a logged-out visitor's generation against nobody", async () => {
		const { db, rows } = fakeDb();
		await saveGeneration(db, {
			id: 'gen-2',
			userId: null,
			input: { description: 'A tool library' },
			names: [NAME]
		});

		// Written, as asked — but with no identifier minted for someone who did not
		// ask for an account.
		expect(rows[0].user_id).toBeNull();
	});

	it('writes nothing when no names were delivered', async () => {
		const { db, rows } = fakeDb();
		await saveGeneration(db, {
			id: 'gen-3',
			userId: 'user-1',
			input: { description: 'A coffee box' },
			names: []
		});
		expect(rows).toHaveLength(0);
	});

	it('never throws — the names were already delivered', async () => {
		const broken = {
			prepare: () => ({
				bind: () => ({
					run: async () => {
						throw new Error('D1 down');
					}
				})
			})
		} as unknown as D1Database;

		await expect(
			saveGeneration(broken, {
				id: 'gen-4',
				userId: 'user-1',
				input: { description: 'A coffee box' },
				names: [NAME]
			})
		).resolves.toBeUndefined();
	});
});

describe('listGenerations — the privacy boundary', () => {
	function seeded() {
		return fakeDb(
			[],
			[
				{
					id: 'a',
					user_id: 'user-1',
					description: 'MINE: a coffee box',
					audience: null,
					archetype: null,
					require_tlds: '["com"]',
					names: JSON.stringify([NAME]),
					created_at: '2026-08-20T00:00:00Z'
				},
				{
					id: 'b',
					user_id: 'user-2',
					description: 'SOMEONE ELSE: an unlaunched fintech',
					audience: null,
					archetype: null,
					require_tlds: '[]',
					names: JSON.stringify([NAME]),
					created_at: '2026-08-20T00:00:00Z'
				},
				{
					id: 'c',
					user_id: null,
					description: "ANONYMOUS: a stranger's idea",
					audience: null,
					archetype: null,
					require_tlds: '[]',
					names: JSON.stringify([NAME]),
					created_at: '2026-08-20T00:00:00Z'
				}
			]
		);
	}

	it("returns only the asking user's own generations", async () => {
		const { db } = seeded();
		const mine = await listGenerations(db, 'user-1');

		expect(mine).toHaveLength(1);
		expect(mine[0].description).toContain('MINE');
	});

	it("never returns another user's brief", async () => {
		const { db } = seeded();
		const all = JSON.stringify(await listGenerations(db, 'user-1'));

		// A brief is the shape of an unlaunched business. It is the most sensitive
		// thing stored here and must not cross between accounts.
		expect(all).not.toContain('SOMEONE ELSE');
		expect(all).not.toContain('fintech');
	});

	it("never returns a logged-out visitor's brief to anyone", async () => {
		const { db } = seeded();
		for (const asker of ['user-1', 'user-2', 'null', '']) {
			const all = JSON.stringify(await listGenerations(db, asker));
			expect(all).not.toContain('ANONYMOUS');
		}
	});

	it('returns nothing for an empty id rather than falling through to everybody', async () => {
		const { db } = seeded();
		expect(await listGenerations(db, '')).toEqual([]);
	});

	it('parses the stored JSON back, and survives a corrupt row', async () => {
		const { db } = fakeDb(
			[],
			[
				{
					id: 'a',
					user_id: 'user-1',
					description: 'A coffee box',
					audience: 'Home baristas',
					archetype: 'explorer',
					require_tlds: 'not json',
					names: JSON.stringify([NAME]),
					created_at: '2026-08-20T00:00:00Z'
				}
			]
		);
		const [row] = await listGenerations(db, 'user-1');

		expect(row.names[0].name).toBe('Ardor');
		expect(row.audience).toBe('Home baristas');
		expect(row.requireTlds).toEqual([]);
	});

	it('clamps the limit, so a caller cannot ask for the whole table', async () => {
		const { db } = seeded();
		const captured: number[] = [];
		const spy = {
			prepare: () => ({
				bind: (_userId: string, limit: number) => {
					captured.push(limit);
					return { all: async () => ({ results: [] }) };
				}
			})
		} as unknown as D1Database;

		await listGenerations(spy, 'user-1', 5000);
		await listGenerations(spy, 'user-1', 0);
		await listGenerations(spy, 'user-1');
		expect(captured).toEqual([100, 1, 20]);
		expect(db).toBeDefined();
	});

	it('copes with a row whose stored JSON is absent', async () => {
		const { db } = fakeDb(
			[],
			[
				{
					id: 'a',
					user_id: 'user-1',
					description: 'A coffee box',
					audience: null,
					archetype: null,
					require_tlds: null,
					names: JSON.stringify([NAME]),
					created_at: '2026-08-20T00:00:00Z'
				}
			]
		);
		const [row] = await listGenerations(db, 'user-1');
		expect(row.requireTlds).toEqual([]);
	});

	it('ignores stored JSON that is valid but not an array', async () => {
		const { db } = fakeDb(
			[],
			[
				{
					id: 'a',
					user_id: 'user-1',
					description: 'A coffee box',
					audience: null,
					archetype: null,
					require_tlds: '{"com":true}',
					names: JSON.stringify([NAME]),
					created_at: '2026-08-20T00:00:00Z'
				}
			]
		);
		const [row] = await listGenerations(db, 'user-1');
		expect(row.requireTlds).toEqual([]);
	});

	it('returns an empty list when the driver yields no results array', async () => {
		const empty = {
			prepare: () => ({ bind: () => ({ all: async () => ({}) }) })
		} as unknown as D1Database;
		expect(await listGenerations(empty, 'user-1')).toEqual([]);
	});

	it('returns an empty list when the database errors', async () => {
		const broken = {
			prepare: () => ({
				bind: () => ({
					all: async () => {
						throw new Error('D1 down');
					}
				})
			})
		} as unknown as D1Database;
		expect(await listGenerations(broken, 'user-1')).toEqual([]);
	});
});
