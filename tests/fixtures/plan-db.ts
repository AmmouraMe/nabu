/**
 * A D1 stand-in that knows how plans work.
 *
 * Shared by the suites that exercise the *real* `$lib/server/entitlements` against
 * routes — the ones asserting that a free account is actually turned away. It answers
 * the statements entitlements issues (plan lookup, the conditional usage upsert,
 * storage sum, seat count) and hands anything else to a per-test `handlers` map, so a
 * route's own queries can be stubbed without reimplementing the quota machinery.
 *
 * The upsert reproduces D1's `ON CONFLICT … DO UPDATE … WHERE`: it returns no row
 * when the new total would exceed the limit, which is what makes the counter the
 * concurrency control rather than a read-then-write race.
 */

import type { D1Database } from '@cloudflare/workers-types';

export interface PlanWorldOptions {
	/** Value of `users.plan`. Omit for a row with no plan, which reads as free. */
	plan?: string | null;
	/** Pre-existing consumption, `{ metric: used }`, for the current period. */
	counters?: Record<string, number>;
	/** Bytes already stored by this account. */
	storageBytes?: number;
	/** User ids already holding a seat on this owner's brands. */
	grantees?: string[];
	/**
	 * Extra statements this test needs answered. Keys are matched as substrings of
	 * the whitespace-collapsed SQL; values receive the bound arguments.
	 */
	handlers?: Record<string, (args: unknown[]) => unknown>;
}

export interface PlanWorld {
	db: D1Database;
	/** Live counter values, so a test can assert what was spent or handed back. */
	counters: Map<string, number>;
	/** Every statement the code under test prepared, whitespace-collapsed. */
	statements: string[];
}

export function planWorld(options: PlanWorldOptions = {}): PlanWorld {
	const counters = new Map<string, number>(Object.entries(options.counters ?? {}));
	const grantees = new Set(options.grantees ?? []);
	const statements: string[] = [];
	const handlers = options.handlers ?? {};

	function handled(flat: string, args: unknown[]): { hit: boolean; value: unknown } {
		for (const [needle, handler] of Object.entries(handlers)) {
			if (flat.includes(needle)) return { hit: true, value: handler(args) };
		}
		return { hit: false, value: null };
	}

	const db = {
		prepare(sql: string) {
			const flat = sql.replace(/\s+/g, ' ').trim();
			statements.push(flat);

			const statement = {
				bind(...args: unknown[]) {
					return {
						async first<T>(): Promise<T | null> {
							const custom = handled(flat, args);
							if (custom.hit) return (custom.value as T) ?? null;

							if (flat.startsWith('SELECT plan FROM users')) {
								return { plan: options.plan ?? null } as T;
							}

							if (flat.startsWith('SELECT used FROM usage_counters')) {
								const metric = args[1] as string;
								const used = counters.get(metric);
								return used === undefined ? null : ({ used } as T);
							}

							if (flat.startsWith('INSERT INTO usage_counters')) {
								const [, metric, , amount, , , limit] = args as [
									string,
									string,
									string,
									number,
									number,
									number,
									number
								];
								const existing = counters.get(metric);
								if (existing === undefined) {
									counters.set(metric, amount);
									return { used: amount } as T;
								}
								if (existing + amount > limit) return null;
								counters.set(metric, existing + amount);
								return { used: existing + amount } as T;
							}

							if (flat.includes('COALESCE(SUM(bm.file_size)')) {
								return { bytes: options.storageBytes ?? 0 } as T;
							}

							if (flat.startsWith('SELECT COUNT(DISTINCT ba.user_id)')) {
								return { n: grantees.size } as T;
							}

							if (flat.startsWith('SELECT 1 AS hit')) {
								return grantees.has(args[1] as string) ? ({ hit: 1 } as T) : null;
							}

							return null;
						},

						async all<T>(): Promise<{ results: T[] }> {
							const custom = handled(flat, args);
							if (custom.hit) return { results: (custom.value as T[]) ?? [] };

							if (flat.startsWith('SELECT metric, used FROM usage_counters')) {
								return {
									results: [...counters.entries()].map(([metric, used]) => ({
										metric,
										used
									})) as T[]
								};
							}
							return { results: [] };
						},

						async run() {
							if (flat.startsWith('UPDATE usage_counters')) {
								const [amount, , metric] = args as [number, string, string];
								counters.set(metric, Math.max(0, (counters.get(metric) ?? 0) - amount));
							}
							handled(flat, args);
							return { meta: { changes: 1 }, success: true };
						}
					};
				}
			};

			// D1 also allows first()/all()/run() straight off a prepared statement when
			// it has no parameters to bind — `/api/cron/content` does exactly that.
			return {
				...statement,
				first: <T>() => statement.bind().first<T>(),
				all: <T>() => statement.bind().all<T>(),
				run: () => statement.bind().run()
			};
		}
	} as unknown as D1Database;

	return { db, counters, statements };
}

/** The refusal body from a 402 thrown by entitlements, or null. */
export function refusalOf(err: unknown): Record<string, unknown> | null {
	if (typeof err !== 'object' || err === null) return null;
	const candidate = err as { status?: unknown; body?: unknown };
	if (candidate.status !== 402) return null;
	return (candidate.body as Record<string, unknown>) ?? null;
}
