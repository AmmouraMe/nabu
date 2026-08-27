/**
 * Rate limiting for the public brand-name generator.
 *
 * The generator is reachable without an account — that is its point — so it
 * needs its own ceiling rather than the entitlements gate, which has no plan to
 * consult for an anonymous visitor. Nothing here touches `usage_counters`: a
 * stranger naming a brand must not spend a signed-in user's monthly allowance,
 * and a signed-in user playing with names must not lose AI text generations they
 * paid for.
 *
 * **KV is eventually consistent**, so a burst from one caller can read the same
 * count twice and slip past the edge of a window. Accepted: the limit exists to
 * stop sustained scraping, and the exact fix (a Durable Object per caller) is a
 * lot of machinery for a name generator.
 */

import type { KVNamespace } from '@cloudflare/workers-types';

/** Generations an hour for a visitor with no account, counted by IP. */
export const ANON_HOURLY_LIMIT = 12;

/**
 * Generations an hour once signed in, counted by user.
 *
 * Higher for two reasons. An account is a far better identity than an IP — an
 * office or a phone network puts many people behind one address, and they would
 * otherwise share a single allowance between them — and a signed-in caller who
 * abuses it is identifiable rather than anonymous, which makes the larger number
 * a smaller risk than it looks.
 */
export const SIGNED_IN_HOURLY_LIMIT = 60;

/** Availability lookups allowed per generation's worth of names. */
export const CHECKS_PER_GENERATION = 10;

const WINDOW_SECONDS = 3600;
/** Outlives the window, so a key cannot expire mid-window and reset the count. */
const KEY_TTL_SECONDS = WINDOW_SECONDS + 300;

export interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	resetSeconds: number;
}

/**
 * Who the allowance belongs to.
 *
 * The `u:` and `ip:` prefixes keep the two in separate keyspaces, so a user id
 * that happens to look like an address cannot collide with one.
 */
export function rateLimitIdentity(
	userId: string | undefined | null,
	ip: string
): { key: string; limit: number; signedIn: boolean } {
	return userId
		? { key: `u:${userId}`, limit: SIGNED_IN_HOURLY_LIMIT, signedIn: true }
		: { key: `ip:${ip}`, limit: ANON_HOURLY_LIMIT, signedIn: false };
}

/** Bucket key. `now` is injected so window arithmetic is testable. */
export function windowKey(identity: string, now: number): string {
	return `namer:rl:${identity}:${Math.floor(now / (WINDOW_SECONDS * 1000))}`;
}

/**
 * Count one user action against the caller's window.
 *
 * The generation route calls this exactly once before any model work. A single
 * action can use several bounded model rounds to replace rejected candidates,
 * but those internal retries do not silently consume several user-visible quota
 * units. Their cost is bounded separately by the Worker subrequest budget.
 *
 * Fails **open** on a KV error: a broken counter should not take the tool down,
 * and the cost of a brief unmetered window is some Workers AI neurons.
 */
export async function consume(
	kv: KVNamespace,
	identity: string,
	now: number,
	limit: number
): Promise<RateLimitResult> {
	const key = windowKey(identity, now);
	const elapsed = Math.floor((now % (WINDOW_SECONDS * 1000)) / 1000);
	const resetSeconds = WINDOW_SECONDS - elapsed;

	let used = 0;
	try {
		const stored = await kv.get(key);
		const parsed = stored === null ? 0 : Number.parseInt(stored, 10);
		used = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
	} catch {
		return { allowed: true, remaining: limit - 1, resetSeconds };
	}

	if (used >= limit) return { allowed: false, remaining: 0, resetSeconds };

	try {
		await kv.put(key, String(used + 1), { expirationTtl: KEY_TTL_SECONDS });
	} catch {
		// The read said there was room; a failed write costs one uncounted call,
		// which is not worth refusing the user over.
	}

	return { allowed: true, remaining: limit - used - 1, resetSeconds };
}
