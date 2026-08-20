/**
 * A permissive stand-in for `$lib/server/entitlements`.
 *
 * Most route suites are about what a route *does*, not about which plan may do it.
 * Before plans existed those suites needed no opinion on the subject; now every
 * metered route asks, and a suite whose fake D1 answers `null` to everything would
 * resolve to the free tier and get a 402 in place of the behaviour under test.
 *
 * So those suites mock this module wide open and keep testing what they were written
 * to test. The gates themselves are covered directly, against the real
 * implementation, in `entitlements.test.ts` and `plan-gates.test.ts` — if the two
 * ever disagree, it is those files that are authoritative.
 *
 * Usage, at the top of a suite:
 *
 *   vi.mock('$lib/server/entitlements', async () =>
 *     (await import('../fixtures/entitlements')).permissiveEntitlements()
 *   );
 */

import { vi } from 'vitest';

/** Same shape the real module returns, with room left over. */
const UNLIMITED = 1_000_000;

export function permissiveEntitlements() {
	return {
		UPGRADE_URL: '/pricing',

		// Highest tier, so no feature check refuses.
		resolvePlan: vi.fn(async () => 'business' as const),
		planOf: vi.fn(() => 'business' as const),

		hasFeature: vi.fn(() => true),
		requireFeature: vi.fn(() => undefined),

		currentPeriod: vi.fn(() => '2026-07'),
		consumeUsage: vi.fn(async (_db: unknown, _userId: string, metric: string) => ({
			metric,
			period: '2026-07',
			limit: UNLIMITED,
			used: 1,
			remaining: UNLIMITED - 1
		})),
		releaseUsage: vi.fn(async () => undefined),
		peekUsage: vi.fn(async () => 0),

		usedStorageBytes: vi.fn(async () => 0),
		storageLimitBytes: vi.fn(() => UNLIMITED),
		requireStorage: vi.fn(async () => ({ used: 0, limit: UNLIMITED })),

		countSeats: vi.fn(async () => 1),
		requireSeat: vi.fn(async () => undefined),

		usageSnapshot: vi.fn(async () => ({
			plan: 'business',
			period: '2026-07',
			metrics: {},
			storage: { usedBytes: 0, limitBytes: UNLIMITED },
			seats: { used: 1, limit: 10 },
			features: {}
		})),

		// Kept faithful to the real one: callers branch on it to tell a plan refusal
		// from a genuine fault, and a stub that always returned null would turn a
		// handled limit into an unhandled throw.
		entitlementRefusal: (err: unknown) => {
			if (typeof err !== 'object' || err === null) return null;
			const candidate = err as { status?: unknown; body?: unknown };
			if (candidate.status !== 402) return null;
			const body = candidate.body as { code?: unknown } | undefined;
			if (!body || typeof body.code !== 'string' || !body.code.startsWith('plan_')) return null;
			return body;
		}
	};
}
