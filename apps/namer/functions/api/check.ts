/**
 * POST /api/check — availability for one generated name.
 *
 * Separate from /api/generate, and one name per call, for two reasons. A
 * Cloudflare Worker may make 50 subrequests per request; ten checks across six
 * names would exceed that. And the page can render names immediately and let
 * each card's badges arrive on their own, rather than holding the whole result
 * behind the slowest registry.
 *
 * Its own rate limit, more generous than the generator's, because one
 * generation legitimately produces six of these.
 */

import { checkAvailability, normalizeSelection, type CheckCache } from '../../src/availability';
import { MAX_FIELD_LENGTH } from '../../src/naming';
import { consume, rateLimitIdentity, type RateLimitStore } from '../../src/rate-limit';
import { SESSION_COOKIE, readCookie, verifySession } from '../../src/auth';

/**
 * Ten checks per generation's worth of names, so this scales off whatever the
 * caller's generate allowance is rather than being a second number to keep in
 * step with it.
 */
const CHECKS_PER_GENERATION = 10;

export interface Env {
	RATE_LIMIT?: RateLimitStore & CheckCache;
	/** Set only when Discord sign-in is configured. */
	SESSION_SECRET?: string;
	/** Lifts GitHub's anonymous per-IP ceiling. Optional; without it GitHub reports unchecked. */
	GITHUB_TOKEN?: string;
	/** Trademark provider endpoint. Optional; without it trademarks report unchecked. */
	TRADEMARK_API_URL?: string;
	TRADEMARK_API_KEY?: string;
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', ...headers }
	});
}

export async function handleCheck(request: Request, env: Env, now: number): Promise<Response> {
	if (!env.RATE_LIMIT) {
		return json({ error: 'This checker is not fully configured yet.' }, 503);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Expected a JSON body.' }, 400);
	}

	const raw = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
	const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, MAX_FIELD_LENGTH) : '';
	if (!name) {
		return json({ error: 'Expected a name to check.' }, 400);
	}

	const session = await verifySession(
		readCookie(request, SESSION_COOKIE),
		env.SESSION_SECRET ?? ''
	);
	const identity = rateLimitIdentity(request, session?.discordId);

	// A separate window from generate's, so opening a lot of cards never eats
	// into the allowance for asking for more names.
	const limit = await consume(
		env.RATE_LIMIT,
		`check:${identity.key}`,
		now,
		identity.limit * CHECKS_PER_GENERATION
	);
	if (!limit.allowed) {
		return json({ error: 'Too many availability checks this hour.' }, 429, {
			'Retry-After': String(limit.resetSeconds)
		});
	}

	// What the caller actually wants looked up. Omitted or malformed means all of
	// it, so an older client keeps working unchanged.
	const selection = normalizeSelection(raw.checks);

	const availability = await checkAvailability(
		{
			// Bound, not passed bare. A detached `fetch` called as `deps.fetch(...)`
			// takes `deps` as its `this`, which throws "Illegal invocation" on the
			// Workers runtime — and every lookup then degrades to unchecked. Unit
			// tests inject a stub and never see this, so it only showed up in prod.
			fetch: globalThis.fetch.bind(globalThis),
			cache: env.RATE_LIMIT,
			githubToken: env.GITHUB_TOKEN,
			trademark:
				env.TRADEMARK_API_URL && env.TRADEMARK_API_KEY
					? { url: env.TRADEMARK_API_URL, key: env.TRADEMARK_API_KEY }
					: undefined
		},
		name,
		selection
	);

	return json({ name, ...availability }, 200);
}

export const onRequest: (context: { request: Request; env: Env }) => Promise<Response> = async ({
	request,
	env
}) => {
	if (request.method !== 'POST') {
		return json({ error: 'Use POST.' }, 405, { Allow: 'POST' });
	}
	return handleCheck(request, env, Date.now());
};
