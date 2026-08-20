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

import { checkAvailability, type CheckCache } from '../../src/availability';
import { MAX_FIELD_LENGTH } from '../../src/naming';
import { clientIp, consume, type RateLimitStore } from '../../src/rate-limit';

/** Six names per generation, so this is ~20 generations' worth per hour. */
const CHECK_HOURLY_LIMIT = 120;

export interface Env {
	RATE_LIMIT?: RateLimitStore & CheckCache;
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

	const limit = await consume(env.RATE_LIMIT, clientIp(request), now, CHECK_HOURLY_LIMIT);
	if (!limit.allowed) {
		return json({ error: 'Too many availability checks this hour.' }, 429, {
			'Retry-After': String(limit.resetSeconds)
		});
	}

	const availability = await checkAvailability(
		{
			fetch,
			cache: env.RATE_LIMIT,
			githubToken: env.GITHUB_TOKEN,
			trademark:
				env.TRADEMARK_API_URL && env.TRADEMARK_API_KEY
					? { url: env.TRADEMARK_API_URL, key: env.TRADEMARK_API_KEY }
					: undefined
		},
		name
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
