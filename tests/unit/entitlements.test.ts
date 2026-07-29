/**
 * The gate itself: `src/lib/server/entitlements.ts`.
 *
 * The D1 stand-in here is not a generic mock — it implements the conditional upsert
 * `consumeUsage` relies on, including refusing the update when the new total would
 * exceed the limit. That behaviour was verified against a real local D1 before this
 * was written, so what these tests check is the module's use of it: the arithmetic,
 * the refusals, the refunds, and what happens when the database says nothing useful.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import {
	consumeUsage,
	countSeats,
	currentPeriod,
	entitlementRefusal,
	hasFeature,
	peekUsage,
	planOf,
	releaseUsage,
	requireFeature,
	requireSeat,
	requireStorage,
	resolvePlan,
	storageLimitBytes,
	usageSnapshot,
	usedStorageBytes,
	UPGRADE_URL
} from '../../src/lib/server/entitlements';

// ─── A D1 that behaves like the real one for the statements we use ───

interface FakeState {
	plan?: string | null;
	/** `${metric}:${period}` → used */
	counters: Map<string, number>;
	storageBytes: number;
	/** Distinct non-owner users with access to this owner's brands. */
	grantees: Set<string>;
	missingUser?: boolean;
	throwOnPlan?: boolean;
	throwOnPeek?: boolean;
}

function fakeDb(state: FakeState): D1Database {
	return {
		prepare(sql: string) {
			const flat = sql.replace(/\s+/g, ' ').trim();
			return {
				bind(...args: unknown[]) {
					return {
						async first<T>(): Promise<T | null> {
							if (flat.startsWith('SELECT plan FROM users')) {
								if (state.throwOnPlan) throw new Error('db down');
								if (state.missingUser) return null;
								return { plan: state.plan ?? null } as T;
							}

							if (flat.startsWith('SELECT used FROM usage_counters')) {
								if (state.throwOnPeek) throw new Error('db down');
								const [, metric, period] = args as [string, string, string];
								const used = state.counters.get(`${metric}:${period}`);
								return used === undefined ? null : ({ used } as T);
							}

							if (flat.startsWith('INSERT INTO usage_counters')) {
								// bind order: userId, metric, period, amount, amount, amount, limit
								const [, metric, period, amount, , , limit] = args as [
									string,
									string,
									string,
									number,
									number,
									number,
									number
								];
								const key = `${metric}:${period}`;
								const existing = state.counters.get(key);

								if (existing === undefined) {
									// INSERT branch: no conflict, so the WHERE never applies.
									state.counters.set(key, amount);
									return { used: amount } as T;
								}

								// ON CONFLICT … DO UPDATE … WHERE used + amount <= limit
								if (existing + amount > limit) return null;
								state.counters.set(key, existing + amount);
								return { used: existing + amount } as T;
							}

							if (flat.includes('COALESCE(SUM(bm.file_size)')) {
								return { bytes: state.storageBytes } as T;
							}

							if (flat.startsWith('SELECT COUNT(DISTINCT ba.user_id)')) {
								return { n: state.grantees.size } as T;
							}

							if (flat.startsWith('SELECT 1 AS hit')) {
								const granteeId = args[1] as string;
								return state.grantees.has(granteeId) ? ({ hit: 1 } as T) : null;
							}

							return null;
						},
						async all<T>(): Promise<{ results: T[] }> {
							if (flat.startsWith('SELECT metric, used FROM usage_counters')) {
								const period = args[1] as string;
								const results = [...state.counters.entries()]
									.filter(([key]) => key.endsWith(`:${period}`))
									.map(([key, used]) => ({ metric: key.split(':')[0], used }));
								return { results: results as T[] };
							}
							return { results: [] };
						},
						async run() {
							if (flat.startsWith('UPDATE usage_counters')) {
								const [amount, , metric, period] = args as [number, string, string, string];
								const key = `${metric}:${period}`;
								const existing = state.counters.get(key) ?? 0;
								state.counters.set(key, Math.max(0, existing - amount));
							}
							return { meta: { changes: 1 } };
						}
					};
				}
			};
		}
	} as unknown as D1Database;
}

function newState(over: Partial<FakeState> = {}): FakeState {
	return {
		counters: new Map(),
		storageBytes: 0,
		grantees: new Set(),
		...over
	};
}

/** The refusal body from a thrown 402, or null if it did not throw one. */
async function refusalFrom(fn: () => Promise<unknown> | unknown) {
	try {
		await fn();
	} catch (err) {
		return entitlementRefusal(err);
	}
	return null;
}

// ─── Plan resolution ─────────────────────────────────────────────────

describe('resolvePlan', () => {
	it('returns the plan on the row', async () => {
		expect(await resolvePlan(fakeDb(newState({ plan: 'pro' })), 'u1')).toBe('pro');
		expect(await resolvePlan(fakeDb(newState({ plan: 'business' })), 'u1')).toBe('business');
	});

	it('falls back to the free tier for a user with no row', async () => {
		expect(await resolvePlan(fakeDb(newState({ missingUser: true })), 'u1')).toBe('starter');
	});

	it('falls back to the free tier for an unrecognised value', async () => {
		expect(await resolvePlan(fakeDb(newState({ plan: 'enterprise' })), 'u1')).toBe('starter');
		expect(await resolvePlan(fakeDb(newState({ plan: null })), 'u1')).toBe('starter');
	});

	it('fails closed when the lookup throws', async () => {
		// A broken database must not be a way onto the paid tier.
		expect(await resolvePlan(fakeDb(newState({ throwOnPlan: true })), 'u1')).toBe('starter');
	});
});

describe('planOf', () => {
	it('reads the plan off a session user', () => {
		expect(planOf({ plan: 'pro' })).toBe('pro');
	});

	it('treats a missing or bogus plan as free', () => {
		expect(planOf(undefined)).toBe('starter');
		expect(planOf(null)).toBe('starter');
		expect(planOf({})).toBe('starter');
		expect(planOf({ plan: 'unlimited' })).toBe('starter');
	});
});

// ─── Features ────────────────────────────────────────────────────────

describe('requireFeature', () => {
	it('passes for a plan that includes the feature', () => {
		expect(() => requireFeature('pro', 'voiceChat')).not.toThrow();
		expect(() => requireFeature('business', 'prioritySupport')).not.toThrow();
	});

	it('refuses with 402 and the details a client needs', async () => {
		const refusal = await refusalFrom(() => requireFeature('starter', 'voiceChat'));
		expect(refusal).toMatchObject({
			code: 'plan_feature_locked',
			plan: 'starter',
			feature: 'voiceChat',
			upgradeUrl: UPGRADE_URL
		});
		expect(refusal!.message).toContain('Voice chat');
		expect(refusal!.message).toContain('Starter');
	});

	it('refuses the free tier every capability the pricing page withholds', async () => {
		for (const feature of [
			'aiLogoGeneration',
			'brandExport',
			'voiceChat',
			'modelSelection',
			'autoPublish',
			'contentCalendar',
			'analytics'
		] as const) {
			expect(hasFeature('starter', feature), feature).toBe(false);
			expect(await refusalFrom(() => requireFeature('starter', feature)), feature).not.toBeNull();
		}
	});

	it('still withholds business-only features from pro', async () => {
		expect(hasFeature('pro', 'prioritySupport')).toBe(false);
		expect(hasFeature('pro', 'priorityAI')).toBe(false);
	});
});

// ─── Periods ─────────────────────────────────────────────────────────

describe('currentPeriod', () => {
	it('formats UTC year and month, zero padded', () => {
		expect(currentPeriod(new Date('2026-07-28T12:00:00Z'))).toBe('2026-07');
		expect(currentPeriod(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
		expect(currentPeriod(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12');
	});

	it('rolls over on the UTC boundary, not the local one', () => {
		// 2026-08-01T00:30Z is still July for anyone an hour behind; the counter is not.
		expect(currentPeriod(new Date('2026-08-01T00:30:00Z'))).toBe('2026-08');
	});
});

// ─── Metering ────────────────────────────────────────────────────────

describe('consumeUsage', () => {
	let state: FakeState;
	let db: D1Database;

	beforeEach(() => {
		state = newState();
		db = fakeDb(state);
	});

	it('counts up and reports what is left', async () => {
		// Starter gets 2 AI videos a month.
		const first = await consumeUsage(db, 'u1', 'aiVideoGenerations', 'starter');
		expect(first).toMatchObject({ used: 1, limit: 2, remaining: 1 });

		const second = await consumeUsage(db, 'u1', 'aiVideoGenerations', 'starter');
		expect(second).toMatchObject({ used: 2, limit: 2, remaining: 0 });
	});

	it('refuses once the allowance is spent, and stops counting', async () => {
		await consumeUsage(db, 'u1', 'aiVideoGenerations', 'starter');
		await consumeUsage(db, 'u1', 'aiVideoGenerations', 'starter');

		const refusal = await refusalFrom(() =>
			consumeUsage(db, 'u1', 'aiVideoGenerations', 'starter')
		);
		expect(refusal).toMatchObject({
			code: 'plan_limit_reached',
			plan: 'starter',
			metric: 'aiVideoGenerations',
			limit: 2,
			used: 2
		});

		// The refused attempt must not have incremented anything.
		expect(await peekUsage(db, 'u1', 'aiVideoGenerations')).toBe(2);
	});

	it('gives a paid plan its larger allowance for the same metric', async () => {
		const result = await consumeUsage(db, 'u1', 'aiVideoGenerations', 'pro');
		expect(result.limit).toBe(20);
	});

	it('keeps metrics separate', async () => {
		await consumeUsage(db, 'u1', 'aiVideoGenerations', 'starter');
		await consumeUsage(db, 'u1', 'aiVideoGenerations', 'starter');

		// Video is spent; images are untouched.
		await expect(consumeUsage(db, 'u1', 'aiImageGenerations', 'starter')).resolves.toMatchObject({
			used: 1
		});
	});

	it('keeps periods separate', async () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(new Date('2026-07-31T23:00:00Z'));
			await consumeUsage(db, 'u1', 'aiVideoGenerations', 'starter');
			await consumeUsage(db, 'u1', 'aiVideoGenerations', 'starter');
			expect(await refusalFrom(() => consumeUsage(db, 'u1', 'aiVideoGenerations', 'starter'))).not
				.toBeNull;

			// New month, new key — the allowance resets with no job to run.
			vi.setSystemTime(new Date('2026-08-01T00:00:00Z'));
			await expect(consumeUsage(db, 'u1', 'aiVideoGenerations', 'starter')).resolves.toMatchObject({
				used: 1
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it('spends several units at once', async () => {
		const result = await consumeUsage(db, 'u1', 'aiTextGenerations', 'starter', 10);
		expect(result).toMatchObject({ used: 10, remaining: 40 });
	});

	it('refuses a batch larger than the whole allowance without writing anything', async () => {
		// The upsert's INSERT branch has no prior row to test, so this case has to be
		// caught before the statement runs or it would create a row already over.
		const refusal = await refusalFrom(() =>
			consumeUsage(db, 'u1', 'aiVideoGenerations', 'starter', 3)
		);
		expect(refusal).toMatchObject({ code: 'plan_limit_reached', limit: 2 });
		expect(await peekUsage(db, 'u1', 'aiVideoGenerations')).toBe(0);
	});

	it('refuses a batch that would overshoot a partly spent allowance', async () => {
		await consumeUsage(db, 'u1', 'aiVideoGenerations', 'starter');
		expect(
			await refusalFrom(() => consumeUsage(db, 'u1', 'aiVideoGenerations', 'starter', 2))
		).toMatchObject({ code: 'plan_limit_reached' });
		expect(await peekUsage(db, 'u1', 'aiVideoGenerations')).toBe(1);
	});
});

describe('releaseUsage', () => {
	it('hands a unit back so it can be spent again', async () => {
		const state = newState();
		const db = fakeDb(state);

		await consumeUsage(db, 'u1', 'aiVideoGenerations', 'starter');
		await consumeUsage(db, 'u1', 'aiVideoGenerations', 'starter');
		await releaseUsage(db, 'u1', 'aiVideoGenerations');

		expect(await peekUsage(db, 'u1', 'aiVideoGenerations')).toBe(1);
		await expect(consumeUsage(db, 'u1', 'aiVideoGenerations', 'starter')).resolves.toMatchObject({
			used: 2
		});
	});

	it('cannot mint allowance by over-releasing', async () => {
		const state = newState();
		const db = fakeDb(state);

		await consumeUsage(db, 'u1', 'aiVideoGenerations', 'starter');
		await releaseUsage(db, 'u1', 'aiVideoGenerations');
		await releaseUsage(db, 'u1', 'aiVideoGenerations');
		await releaseUsage(db, 'u1', 'aiVideoGenerations');

		expect(await peekUsage(db, 'u1', 'aiVideoGenerations')).toBe(0);
	});

	it('never throws, because it runs on failure paths', async () => {
		const exploding = {
			prepare() {
				throw new Error('db down');
			}
		} as unknown as D1Database;

		await expect(releaseUsage(exploding, 'u1', 'aiVideoGenerations')).resolves.toBeUndefined();
	});
});

describe('peekUsage', () => {
	it('reports zero for a metric never used', async () => {
		expect(await peekUsage(fakeDb(newState()), 'u1', 'aiTextGenerations')).toBe(0);
	});

	it('reports zero rather than throwing when the read fails', async () => {
		expect(
			await peekUsage(fakeDb(newState({ throwOnPeek: true })), 'u1', 'aiTextGenerations')
		).toBe(0);
	});
});

// ─── Storage ─────────────────────────────────────────────────────────

describe('storage', () => {
	const GB = 1024 * 1024 * 1024;

	it('converts the plan ceiling to bytes', () => {
		expect(storageLimitBytes('starter')).toBe(1 * GB);
		expect(storageLimitBytes('pro')).toBe(25 * GB);
		expect(storageLimitBytes('business')).toBe(100 * GB);
	});

	it('sums what the account is holding', async () => {
		expect(await usedStorageBytes(fakeDb(newState({ storageBytes: 4096 })), 'u1')).toBe(4096);
	});

	it('reports zero when nothing is stored', async () => {
		expect(await usedStorageBytes(fakeDb(newState()), 'u1')).toBe(0);
	});

	it('allows an upload that fits', async () => {
		const db = fakeDb(newState({ storageBytes: 100 * 1024 * 1024 }));
		await expect(requireStorage(db, 'u1', 'starter', 1024)).resolves.toMatchObject({ limit: GB });
	});

	it('refuses an upload that would cross the ceiling', async () => {
		const db = fakeDb(newState({ storageBytes: GB - 100 }));
		const refusal = await refusalFrom(() => requireStorage(db, 'u1', 'starter', 500));
		expect(refusal).toMatchObject({
			code: 'plan_storage_exceeded',
			plan: 'starter',
			metric: 'storage'
		});
		expect(refusal!.message).toContain('1 GB');
	});

	it('lets the same upload through on a bigger plan', async () => {
		const db = fakeDb(newState({ storageBytes: GB - 100 }));
		await expect(requireStorage(db, 'u1', 'pro', 500)).resolves.toBeTruthy();
	});

	it('refuses an upload that exactly overshoots by one byte', async () => {
		const db = fakeDb(newState({ storageBytes: GB }));
		expect(await refusalFrom(() => requireStorage(db, 'u1', 'starter', 1))).not.toBeNull();
	});
});

// ─── Seats ───────────────────────────────────────────────────────────

describe('seats', () => {
	it('counts the owner plus distinct grantees', async () => {
		expect(await countSeats(fakeDb(newState()), 'owner')).toBe(1);
		expect(await countSeats(fakeDb(newState({ grantees: new Set(['a', 'b']) })), 'owner')).toBe(3);
	});

	it('refuses a second seat on the single-user free plan', async () => {
		const refusal = await refusalFrom(() =>
			requireSeat(fakeDb(newState()), 'owner', 'starter', 'friend')
		);
		expect(refusal).toMatchObject({
			code: 'plan_seats_exceeded',
			plan: 'starter',
			metric: 'teamMembers',
			limit: 1
		});
		expect(refusal!.message).toContain('single user');
	});

	it('never charges the owner a seat for their own brand', async () => {
		await expect(
			requireSeat(fakeDb(newState()), 'owner', 'starter', 'owner')
		).resolves.toBeUndefined();
	});

	it('does not refuse someone who already has a seat', async () => {
		// Re-granting or changing a role must not be blocked by a seat already in use.
		const db = fakeDb(newState({ grantees: new Set(['friend']) }));
		await expect(requireSeat(db, 'owner', 'starter', 'friend')).resolves.toBeUndefined();
	});

	it('allows up to the plan limit and refuses past it', async () => {
		// Pro is 3: owner + 2 grantees is full.
		const full = fakeDb(newState({ grantees: new Set(['a', 'b']) }));
		expect(await refusalFrom(() => requireSeat(full, 'owner', 'pro', 'c'))).toMatchObject({
			code: 'plan_seats_exceeded',
			limit: 3
		});

		const room = fakeDb(newState({ grantees: new Set(['a']) }));
		await expect(requireSeat(room, 'owner', 'pro', 'c')).resolves.toBeUndefined();
	});
});

// ─── Snapshot ────────────────────────────────────────────────────────

describe('usageSnapshot', () => {
	it('reports every metric, including untouched ones', async () => {
		const state = newState({ storageBytes: 2048, grantees: new Set(['a']) });
		const db = fakeDb(state);

		await consumeUsage(db, 'u1', 'aiVideoGenerations', 'starter');

		const snapshot = await usageSnapshot(db, 'u1', 'starter');

		expect(snapshot.plan).toBe('starter');
		expect(snapshot.period).toBe(currentPeriod());
		expect(snapshot.metrics.aiVideoGenerations).toEqual({ used: 1, limit: 2, remaining: 1 });
		expect(snapshot.metrics.aiTextGenerations).toEqual({ used: 0, limit: 50, remaining: 50 });
		expect(snapshot.storage).toEqual({ usedBytes: 2048, limitBytes: 1024 ** 3 });
		expect(snapshot.seats).toEqual({ used: 2, limit: 1 });
	});

	it('carries the feature grants for the plan', async () => {
		const free = await usageSnapshot(fakeDb(newState()), 'u1', 'starter');
		expect(free.features.voiceChat).toBe(false);
		expect(free.features.brandExport).toBe(false);

		const paid = await usageSnapshot(fakeDb(newState()), 'u1', 'business');
		expect(paid.features.voiceChat).toBe(true);
		expect(paid.features.prioritySupport).toBe(true);
	});

	it('does not spend anything', async () => {
		const db = fakeDb(newState());
		await usageSnapshot(db, 'u1', 'starter');
		expect(await peekUsage(db, 'u1', 'aiVideoGenerations')).toBe(0);
	});
});

// ─── Refusal recognition ─────────────────────────────────────────────

describe('entitlementRefusal', () => {
	it('recognises this module’s refusals', async () => {
		expect(await refusalFrom(() => requireFeature('starter', 'voiceChat'))).not.toBeNull();
	});

	it('ignores anything else', () => {
		expect(entitlementRefusal(null)).toBeNull();
		expect(entitlementRefusal(undefined)).toBeNull();
		expect(entitlementRefusal('nope')).toBeNull();
		expect(entitlementRefusal(new Error('boom'))).toBeNull();
		expect(entitlementRefusal({ status: 404, body: { message: 'gone' } })).toBeNull();
		// A 402 from somewhere else is still not ours to swallow.
		expect(entitlementRefusal({ status: 402, body: { code: 'card_declined' } })).toBeNull();
		expect(entitlementRefusal({ status: 402 })).toBeNull();
	});
});
