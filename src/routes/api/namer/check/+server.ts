/**
 * POST /api/namer/check — availability for one generated name.
 *
 * One name per request, not six. A Worker may make 50 subrequests per request,
 * and six names at ten lookups apiece would exceed that; splitting it also lets
 * each card's badges arrive on their own rather than behind the slowest
 * registry.
 *
 * Its own window, separate from the generator's, so opening a lot of cards never
 * eats into the allowance for asking for more names.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkAvailability, normalizeSelection } from '$lib/server/namer/availability';
import { MAX_FIELD_LENGTH } from '$lib/server/namer/naming';
import { CHECKS_PER_GENERATION, consume, rateLimitIdentity } from '$lib/server/namer/rate-limit';

export const POST: RequestHandler = async ({ request, platform, locals, getClientAddress }) => {
	const kv = platform?.env?.KV;
	if (!kv)
		return json({ error: 'Availability checks are unavailable right now.' }, { status: 503 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Expected a JSON body.' }, { status: 400 });
	}

	const raw = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
	const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, MAX_FIELD_LENGTH) : '';
	if (!name) return json({ error: 'Expected a name to check.' }, { status: 400 });

	const identity = rateLimitIdentity(locals.user?.id, getClientAddress());
	const limit = await consume(
		kv,
		`check:${identity.key}`,
		Date.now(),
		identity.limit * CHECKS_PER_GENERATION
	);

	if (!limit.allowed) {
		return json(
			{ error: 'Too many availability checks this hour.' },
			{
				status: 429,
				headers: { 'Retry-After': String(limit.resetSeconds) }
			}
		);
	}

	const availability = await checkAvailability(
		{
			// Bound, not passed bare: a detached `fetch` called as `deps.fetch(...)`
			// takes `deps` as its `this` and throws on the Workers runtime, which the
			// cache wrapper would quietly turn into "unchecked" on every lookup.
			fetch: globalThis.fetch.bind(globalThis),
			cache: kv,
			githubToken: platform?.env?.GITHUB_TOKEN,
			trademark:
				platform?.env?.TRADEMARK_API_URL && platform?.env?.TRADEMARK_API_KEY
					? {
							url: platform.env.TRADEMARK_API_URL,
							key: platform.env.TRADEMARK_API_KEY
						}
					: undefined
		},
		name,
		normalizeSelection(raw.checks)
	);

	return json({ name, ...availability });
};
