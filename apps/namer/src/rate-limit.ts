/**
 * Per-IP rate limiting for the public generate endpoint.
 *
 * This endpoint is unauthenticated and spends Workers AI neurons on every call,
 * so an open one is somebody else's free LLM. A fixed hourly window per IP is
 * enough to make that pointless without putting a login in front of a toy.
 *
 * **KV is eventually consistent**, so a burst of simultaneous requests from one
 * IP can read the same count and each write count+1 — a determined caller gets
 * some overage on the edge of a window. That is accepted: the limit exists to
 * stop sustained scraping, and the correct fix (Durable Object per IP) is a lot
 * of machinery for a name generator. If this ever needs to be exact, that is the
 * upgrade path.
 */

/** The subset of KVNamespace this uses, so tests need not fake the whole thing. */
export interface RateLimitStore {
	get(key: string): Promise<string | null>;
	put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/** Generations allowed per hour for an anonymous caller, keyed by IP. */
export const ANON_HOURLY_LIMIT = 12;

/**
 * Generations allowed per hour once signed in with Discord, keyed by account.
 *
 * Higher for two reasons, not one. An account is a much better identity than an
 * IP — a shared office or a phone network puts many people behind one address,
 * and they currently share those 12 between them — and signing in makes a
 * runaway caller identifiable rather than anonymous, so a bigger allowance is a
 * smaller risk than it looks.
 */
export const SIGNED_IN_HOURLY_LIMIT = 60;

/** @deprecated Use ANON_HOURLY_LIMIT. Kept so existing imports keep compiling. */
export const HOURLY_LIMIT = ANON_HOURLY_LIMIT;

const WINDOW_SECONDS = 3600;
/** Outlives the window so a key cannot expire mid-window and reset the count. */
const KEY_TTL_SECONDS = WINDOW_SECONDS + 300;

/**
 * Bucket key for an IP at a moment in time.
 *
 * `now` is injected rather than read from the clock so the window arithmetic is
 * testable without waiting an hour.
 */
export function windowKey(ip: string, now: number): string {
	return `rl:${ip}:${Math.floor(now / (WINDOW_SECONDS * 1000))}`;
}

export interface RateLimitResult {
	allowed: boolean;
	/** Calls left in this window after the current one. */
	remaining: number;
	/** Seconds until the window resets — the value for Retry-After. */
	resetSeconds: number;
}

/**
 * Count this request against the caller's hourly window.
 *
 * Fails **open** on a KV error: a broken rate-limit store should not take the
 * whole tool down, and the blast radius of a brief unlimited window is some
 * spent neurons. It fails *closed* only when there is no store at all, which is
 * a deployment mistake rather than a runtime blip — see the endpoint.
 */
export async function consume(
	store: RateLimitStore,
	ip: string,
	now: number,
	limit: number = ANON_HOURLY_LIMIT
): Promise<RateLimitResult> {
	const key = windowKey(ip, now);
	const elapsed = Math.floor((now % (WINDOW_SECONDS * 1000)) / 1000);
	const resetSeconds = WINDOW_SECONDS - elapsed;

	let used = 0;
	try {
		const stored = await store.get(key);
		const parsed = stored === null ? 0 : Number.parseInt(stored, 10);
		used = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
	} catch {
		return { allowed: true, remaining: limit - 1, resetSeconds };
	}

	if (used >= limit) {
		return { allowed: false, remaining: 0, resetSeconds };
	}

	try {
		await store.put(key, String(used + 1), { expirationTtl: KEY_TTL_SECONDS });
	} catch {
		// The read succeeded and said there was room; a failed write costs one
		// uncounted call, which is not worth refusing the user over.
	}

	return { allowed: true, remaining: limit - used - 1, resetSeconds };
}

/**
 * Caller identity. `CF-Connecting-IP` is set by Cloudflare's edge and cannot be
 * spoofed by the client — unlike `X-Forwarded-For`, which is why that header is
 * not consulted here. Requests without one (only reachable off-edge, e.g. under
 * `wrangler dev`) share a single bucket rather than escaping the limit.
 */
export function clientIp(request: Request): string {
	return request.headers.get('CF-Connecting-IP')?.trim() || 'unknown';
}

/**
 * What a caller's allowance is counted against.
 *
 * A signed-in caller is counted by Discord account, so their quota follows them
 * across networks — and, more to the point, so signing in on a shared IP stops
 * them competing with strangers for the same twelve. The `u:` prefix keeps
 * account keys in a different space from IP keys, so an account id that happens
 * to look like an address cannot collide with one.
 */
export function rateLimitIdentity(
	request: Request,
	discordId?: string | null
): {
	key: string;
	limit: number;
} {
	return discordId
		? { key: `u:${discordId}`, limit: SIGNED_IN_HOURLY_LIMIT }
		: { key: `ip:${clientIp(request)}`, limit: ANON_HOURLY_LIMIT };
}
