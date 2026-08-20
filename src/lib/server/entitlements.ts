/**
 * Plan entitlements — what an account is actually allowed to do.
 *
 * The companion to `brand-access.ts`. That module answers "is this *your* brand";
 * this one answers "does your plan include this at all". Both had to exist before a
 * public signup was safe: authorisation stopped one user spending another's AI
 * budget, but nothing stopped a brand-new free account spending *ours* — unlimited
 * video generation, realtime voice sessions, and auto-publishing were all one
 * `locals.user` check away, and every check said yes.
 *
 * Three conventions, all of them about failing closed:
 *
 * - **Unknown means free.** A missing user row, an unreadable `plan`, a value no
 *   tier claims — all resolve to `starter`. The failure mode of a broken lookup is a
 *   customer told to upgrade, never a stranger handed the paid tier.
 * - **Counting is the gate, not a step before it.** `consumeUsage` increments and
 *   checks in one conditional upsert, so two requests racing at the last unit cannot
 *   both see "1 remaining". Read-then-write would let them.
 * - **402, with the numbers.** Refusals carry `code`, `limit`, `used` and the plan,
 *   so the client can render "2 of 2 videos used this month" and link to /pricing
 *   instead of showing a bare error.
 */

import type { D1Database } from '@cloudflare/workers-types';
import { error } from '@sveltejs/kit';
import {
	FREE_TIER,
	METERED_METRICS,
	getTierLimits,
	normalizeTier,
	tierAllowance,
	tierHasFeature,
	type MeteredMetric,
	type TierFeature,
	type TierId
} from '$lib/utils/pricing';

const BYTES_PER_GB = 1024 * 1024 * 1024;

/** Where a refused request is told to go. */
export const UPGRADE_URL = '/pricing';

// ─── Plan resolution ─────────────────────────────────────────────────

/**
 * The plan on an account, read from the row rather than the session.
 *
 * The session cookie is signed, so its contents cannot be forged — but it lives for
 * seven days, which is long enough for a cancellation or a downgrade to be a week
 * stale. Anything that spends money re-reads the row.
 */
export async function resolvePlan(db: D1Database, userId: string): Promise<TierId> {
	try {
		const row = await db
			.prepare('SELECT plan FROM users WHERE id = ?')
			.bind(userId)
			.first<{ plan: string | null }>();
		return normalizeTier(row?.plan);
	} catch {
		// A user whose row cannot be read is not a user with unlimited rights.
		return FREE_TIER;
	}
}

/**
 * The plan carried on `locals.user`, for gates that only decide *visibility* —
 * hiding a control, picking which models to list. Anything that spends money should
 * prefer `resolvePlan`, which cannot be stale.
 */
export function planOf(user: { plan?: string } | null | undefined): TierId {
	return normalizeTier(user?.plan);
}

// ─── Refusals ────────────────────────────────────────────────────────

export type EntitlementCode =
	| 'plan_feature_locked'
	| 'plan_limit_reached'
	| 'plan_storage_exceeded'
	| 'plan_seats_exceeded';

/** Every refusal from this module: 402, machine-readable, with the numbers attached. */
function refuse(body: {
	code: EntitlementCode;
	message: string;
	plan: TierId;
	feature?: TierFeature;
	metric?: MeteredMetric | 'storage' | 'teamMembers';
	limit?: number;
	used?: number;
}): never {
	// 402 rather than 403: this is not "you may not", it is "not on this plan" —
	// a distinction the client needs, because one is an error and the other is an
	// upgrade prompt.
	throw error(402, { ...body, upgradeUrl: UPGRADE_URL });
}

/**
 * Recognise a refusal thrown by this module, for the callers that need to handle one
 * rather than propagate it.
 *
 * Bulk operations are the reason this exists: filling twenty empty brand fields when
 * eight text generations remain should fill eight and say so, not fail all twenty.
 * Matching on `status === 402` alone would also swallow a 402 from somewhere else,
 * so the `plan_` code has to be there too.
 */
export function entitlementRefusal(err: unknown): (App.Error & { code: EntitlementCode }) | null {
	if (typeof err !== 'object' || err === null) return null;
	const candidate = err as { status?: unknown; body?: unknown };
	if (candidate.status !== 402) return null;

	const body = candidate.body as { code?: unknown } | undefined;
	if (!body || typeof body.code !== 'string' || !body.code.startsWith('plan_')) return null;

	return body as App.Error & { code: EntitlementCode };
}

// ─── Boolean capabilities ────────────────────────────────────────────

/** Human-readable names for the things a plan can lock, used in refusal messages. */
const FEATURE_LABELS: Record<TierFeature, string> = {
	aiLogoGeneration: 'AI logo generation',
	brandExport: 'Brand export',
	voiceChat: 'Voice chat',
	modelSelection: 'Choosing the AI model',
	priorityAI: 'Priority AI processing',
	autoPublish: 'Auto-publishing to social',
	contentCalendar: 'The content calendar',
	analytics: 'The analytics dashboard',
	emailSupport: 'Email support',
	prioritySupport: 'Priority support'
};

export function hasFeature(plan: TierId, feature: TierFeature): boolean {
	return tierHasFeature(plan, feature);
}

/** Assert a plan includes a capability, or throw the 402 the route should answer with. */
export function requireFeature(plan: TierId, feature: TierFeature): void {
	if (tierHasFeature(plan, feature)) return;
	refuse({
		code: 'plan_feature_locked',
		message: `${FEATURE_LABELS[feature]} is not included on the ${planName(plan)} plan.`,
		plan,
		feature
	});
}

function planName(plan: TierId): string {
	return plan.charAt(0).toUpperCase() + plan.slice(1);
}

// ─── Monthly metering ────────────────────────────────────────────────

/** UTC calendar month, the key a usage row is filed under. */
export function currentPeriod(now: Date = new Date()): string {
	const month = String(now.getUTCMonth() + 1).padStart(2, '0');
	return `${now.getUTCFullYear()}-${month}`;
}

export interface UsageResult {
	metric: MeteredMetric;
	period: string;
	limit: number;
	used: number;
	remaining: number;
}

/**
 * Spend `amount` units of a monthly allowance, or refuse.
 *
 * The increment and the limit check are the same statement: the upsert only writes
 * while the new total would still fit, and returns nothing when it would not. That
 * is what makes it safe under concurrency — a read-then-write version lets two
 * requests arriving together both observe the last unit as free and both spend it,
 * which on `aiVideoGenerations` (2/month on the free tier) is a 100% overrun.
 *
 * Call it *before* doing the work, and `releaseUsage` if the work then fails, so a
 * provider outage does not quietly burn a free account's monthly allowance.
 */
export async function consumeUsage(
	db: D1Database,
	userId: string,
	metric: MeteredMetric,
	plan: TierId,
	amount = 1
): Promise<UsageResult> {
	const limit = tierAllowance(plan, metric);
	const period = currentPeriod();

	// A request for more than a whole month's allowance can never succeed, and the
	// upsert below cannot express it: its INSERT branch has no prior row to test
	// against, so it would happily create one already over the line.
	if (amount > limit) {
		const used = await peekUsage(db, userId, metric, period);
		refuse({
			code: 'plan_limit_reached',
			message: limitMessage(metric, plan, limit),
			plan,
			metric,
			limit,
			used
		});
	}

	const row = await db
		.prepare(
			`INSERT INTO usage_counters (user_id, metric, period, used, updated_at)
			 VALUES (?, ?, ?, ?, datetime('now'))
			 ON CONFLICT(user_id, metric, period) DO UPDATE SET
			   used = usage_counters.used + ?,
			   updated_at = datetime('now')
			 WHERE usage_counters.used + ? <= ?
			 RETURNING used`
		)
		.bind(userId, metric, period, amount, amount, amount, limit)
		.first<{ used: number }>();

	// No row back means the conflicting update was filtered out by its WHERE — the
	// allowance is spent. Nothing was written, so there is nothing to undo.
	if (!row) {
		refuse({
			code: 'plan_limit_reached',
			message: limitMessage(metric, plan, limit),
			plan,
			metric,
			limit,
			used: await peekUsage(db, userId, metric, period)
		});
	}

	return {
		metric,
		period,
		limit,
		used: row.used,
		remaining: Math.max(0, limit - row.used)
	};
}

/**
 * Hand back units taken by work that did not happen.
 *
 * Best-effort and never throws: it runs on failure paths, where turning a provider
 * error into a 500 would hide the real problem. Clamped at zero so a double release
 * cannot mint allowance.
 */
export async function releaseUsage(
	db: D1Database,
	userId: string,
	metric: MeteredMetric,
	amount = 1
): Promise<void> {
	try {
		await db
			.prepare(
				`UPDATE usage_counters
				 SET used = MAX(0, used - ?), updated_at = datetime('now')
				 WHERE user_id = ? AND metric = ? AND period = ?`
			)
			.bind(amount, userId, metric, currentPeriod())
			.run();
	} catch {
		// A quota that stays spent is a far smaller problem than a failed rollback
		// masking the original error.
	}
}

/** Units already spent this period. Returns 0 for a metric never used. */
export async function peekUsage(
	db: D1Database,
	userId: string,
	metric: MeteredMetric,
	period: string = currentPeriod()
): Promise<number> {
	try {
		const row = await db
			.prepare('SELECT used FROM usage_counters WHERE user_id = ? AND metric = ? AND period = ?')
			.bind(userId, metric, period)
			.first<{ used: number }>();
		return row?.used ?? 0;
	} catch {
		return 0;
	}
}

function limitMessage(metric: MeteredMetric, plan: TierId, limit: number): string {
	const labels: Record<MeteredMetric, string> = {
		aiTextGenerations: 'AI text generations',
		aiImageGenerations: 'AI image generations',
		aiAudioGenerations: 'AI audio generations',
		aiVideoGenerations: 'AI video generations',
		scheduledPosts: 'scheduled posts'
	};
	return `The ${planName(plan)} plan includes ${limit} ${labels[metric]} per month, and this month's are used up.`;
}

// ─── Storage ─────────────────────────────────────────────────────────

/**
 * Bytes this account is storing in R2, counted from the rows that own the objects.
 *
 * Three writers put objects in the bucket and each keeps its own size column, so the
 * total is their sum: brand media, the derived variants of that media, and the AI
 * file archive. They address distinct R2 keys (`brands/…` vs `archive/…`), so nothing
 * here is counted twice.
 */
export async function usedStorageBytes(db: D1Database, userId: string): Promise<number> {
	const row = await db
		.prepare(
			`SELECT
			   (SELECT COALESCE(SUM(bm.file_size), 0)
			      FROM brand_media bm
			      JOIN brand_profiles bp ON bp.id = bm.brand_profile_id
			     WHERE bp.user_id = ?)
			 + (SELECT COALESCE(SUM(v.file_size), 0)
			      FROM brand_media_variants v
			      JOIN brand_media bm2 ON bm2.id = v.brand_media_id
			      JOIN brand_profiles bp2 ON bp2.id = bm2.brand_profile_id
			     WHERE bp2.user_id = ?)
			 + (SELECT COALESCE(SUM(fa.file_size), 0)
			      FROM file_archive fa
			     WHERE fa.user_id = ?) AS bytes`
		)
		.bind(userId, userId, userId)
		.first<{ bytes: number }>();
	return row?.bytes ?? 0;
}

export function storageLimitBytes(plan: TierId): number {
	return getTierLimits(plan).storageGB * BYTES_PER_GB;
}

/**
 * Assert an incoming upload still fits under the plan's storage ceiling.
 *
 * Checked before the object is written, since R2 has no undo that leaves the quota
 * consistent — a rejected upload that already landed would count against the user
 * until something else deleted it.
 */
export async function requireStorage(
	db: D1Database,
	userId: string,
	plan: TierId,
	incomingBytes: number
): Promise<{ used: number; limit: number }> {
	const limit = storageLimitBytes(plan);
	const used = await usedStorageBytes(db, userId);

	if (used + incomingBytes > limit) {
		refuse({
			code: 'plan_storage_exceeded',
			message: `The ${planName(plan)} plan includes ${getTierLimits(plan).storageGB} GB of storage, and this upload would exceed it.`,
			plan,
			metric: 'storage',
			limit,
			used
		});
	}

	return { used, limit };
}

// ─── Seats ───────────────────────────────────────────────────────────

/**
 * People who can reach this account's brands, the owner included.
 *
 * Counted distinctly across brands: one collaborator invited to three brands is one
 * seat, not three — that is what "3 team members" means to the person reading the
 * pricing page.
 */
export async function countSeats(db: D1Database, ownerId: string): Promise<number> {
	const row = await db
		.prepare(
			`SELECT COUNT(DISTINCT ba.user_id) AS n
			   FROM brand_access ba
			   JOIN brand_profiles bp ON bp.id = ba.brand_profile_id
			  WHERE bp.user_id = ? AND ba.user_id <> ?`
		)
		.bind(ownerId, ownerId)
		.first<{ n: number }>();
	return 1 + (row?.n ?? 0);
}

/**
 * Assert the account has room for one more collaborator.
 *
 * `granteeId` is checked first: re-granting or changing the role of somebody who
 * already has a seat must not be refused for want of a seat they are already using.
 */
export async function requireSeat(
	db: D1Database,
	ownerId: string,
	plan: TierId,
	granteeId: string
): Promise<void> {
	const limit = getTierLimits(plan).teamMembers;

	if (granteeId === ownerId) return;

	const existing = await db
		.prepare(
			`SELECT 1 AS hit
			   FROM brand_access ba
			   JOIN brand_profiles bp ON bp.id = ba.brand_profile_id
			  WHERE bp.user_id = ? AND ba.user_id = ?
			  LIMIT 1`
		)
		.bind(ownerId, granteeId)
		.first<{ hit: number }>();
	if (existing) return;

	const used = await countSeats(db, ownerId);
	if (used + 1 > limit) {
		refuse({
			code: 'plan_seats_exceeded',
			message:
				limit === 1
					? `The ${planName(plan)} plan is for a single user. Upgrade to invite people to your brands.`
					: `The ${planName(plan)} plan includes ${limit} team members, and they are all taken.`,
			plan,
			metric: 'teamMembers',
			limit,
			used
		});
	}
}

// ─── Reporting ───────────────────────────────────────────────────────

export interface UsageSnapshot {
	plan: TierId;
	period: string;
	metrics: Record<MeteredMetric, { used: number; limit: number; remaining: number }>;
	storage: { usedBytes: number; limitBytes: number };
	seats: { used: number; limit: number };
	features: Record<TierFeature, boolean>;
}

/**
 * Everything the account page needs to show where a user stands, in one round trip.
 * Read-only — it must never be the thing that spends a unit.
 */
export async function usageSnapshot(
	db: D1Database,
	userId: string,
	plan: TierId
): Promise<UsageSnapshot> {
	const period = currentPeriod();

	const rows = await db
		.prepare('SELECT metric, used FROM usage_counters WHERE user_id = ? AND period = ?')
		.bind(userId, period)
		.all<{ metric: string; used: number }>();

	const counted = new Map<string, number>();
	for (const row of rows.results ?? []) {
		counted.set(row.metric, row.used);
	}

	const metrics = {} as UsageSnapshot['metrics'];
	for (const metric of METERED_METRICS) {
		const limit = tierAllowance(plan, metric);
		const used = counted.get(metric) ?? 0;
		metrics[metric] = { used, limit, remaining: Math.max(0, limit - used) };
	}

	const features = {} as UsageSnapshot['features'];
	for (const feature of Object.keys(FEATURE_LABELS) as TierFeature[]) {
		features[feature] = tierHasFeature(plan, feature);
	}

	const [usedBytes, seatsUsed] = await Promise.all([
		usedStorageBytes(db, userId),
		countSeats(db, userId)
	]);

	return {
		plan,
		period,
		metrics,
		storage: { usedBytes, limitBytes: storageLimitBytes(plan) },
		seats: { used: seatsUsed, limit: getTierLimits(plan).teamMembers },
		features
	};
}
