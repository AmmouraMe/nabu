/**
 * POST /api/namer/generate — six brand names, from the public generator.
 *
 * Deliberately reachable without an account: the generator is a way in, and
 * putting a login in front of it would defeat the point. That makes it the one
 * AI endpoint here not covered by the entitlements gate, which has no plan to
 * consult for a stranger — so it carries its own hourly ceiling instead, and
 * never touches `usage_counters`. A visitor cannot spend a paying user's
 * allowance, and a signed-in user cannot lose their AI text generations to an
 * afternoon of naming things.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildNamingPrompt, parseNames, validateInput } from '$lib/server/namer/naming';
import type { GeneratedName } from '$lib/server/namer/naming';
import { consume, rateLimitIdentity } from '$lib/server/namer/rate-limit';
import { AI_MODEL, MAX_TOKENS, TEMPERATURE, responseText } from '$lib/server/namer/ai';
import type { AiResult } from '$lib/server/namer/ai';

export const POST: RequestHandler = async ({ request, platform, locals, getClientAddress }) => {
	const kv = platform?.env?.KV;
	const ai = platform?.env?.AI;

	// Fails closed rather than serving an unmetered public AI endpoint.
	if (!kv) return json({ error: 'The name generator is unavailable right now.' }, { status: 503 });
	if (!ai) return json({ error: 'The name generator is unavailable right now.' }, { status: 503 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Expected a JSON body.' }, { status: 400 });
	}

	const validated = validateInput(body);
	if (!validated.ok) return json({ error: validated.error }, { status: 400 });

	const identity = rateLimitIdentity(locals.user?.id, getClientAddress());
	const limit = await consume(kv, identity.key, Date.now(), identity.limit);

	if (!limit.allowed) {
		const minutes = Math.ceil(limit.resetSeconds / 60);
		return json(
			{
				error: identity.signedIn
					? `That's ${identity.limit} sets of names this hour. Try again in ${minutes} minutes.`
					: `That's ${identity.limit} sets of names this hour. Sign in for more, or try again in ${minutes} minutes.`,
				signInHelps: !identity.signedIn
			},
			{ status: 429, headers: { 'Retry-After': String(limit.resetSeconds) } }
		);
	}

	const { system, user } = buildNamingPrompt(validated.value);

	let names: GeneratedName[] = [];
	try {
		const result = (await ai.run(AI_MODEL, {
			messages: [
				{ role: 'system', content: system },
				{ role: 'user', content: user }
			],
			max_tokens: MAX_TOKENS,
			temperature: TEMPERATURE
		})) as AiResult;
		names = parseNames(responseText(result));
	} catch {
		return json({ error: 'The model did not answer. Try again in a moment.' }, { status: 502 });
	}

	if (names.length === 0) {
		return json(
			{ error: 'That came back unreadable — try rephrasing what you are building.' },
			{ status: 502 }
		);
	}

	return json({ names, remaining: limit.remaining, limit: identity.limit });
};
