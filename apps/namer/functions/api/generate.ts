/**
 * POST /api/generate — the only endpoint the name generator has.
 *
 * Runs on Cloudflare Pages Functions so the page itself is served from the CDN
 * as static HTML and only this path costs anything. Uses the Workers AI binding
 * rather than an API key: the model is on Cloudflare's free allowance, and a
 * public tool holding no third-party key is a public tool that cannot leak one.
 *
 * The handler is exported separately from `onRequestPost` so tests can drive it
 * with a fake env and a fixed clock.
 */

import { buildNamingPrompt, parseNames, validateInput, type GeneratedName } from '../../src/naming';
import { clientIp, consume, HOURLY_LIMIT, type RateLimitStore } from '../../src/rate-limit';

/** Same model the app's content generator uses — free tier, good enough at JSON. */
const AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

/** Long enough for six rationales, short of the model rambling into a timeout. */
const MAX_TOKENS = 1400;

export interface AiBinding {
	run(model: string, inputs: Record<string, unknown>): Promise<{ response?: string } | string>;
}

export interface Env {
	AI: AiBinding;
	/** KV namespace backing the per-IP hourly limit. */
	RATE_LIMIT?: RateLimitStore;
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', ...headers }
	});
}

/**
 * Workers AI returns `{ response }` for chat models, but the binding's own types
 * allow a bare string and some models have done exactly that. Normalising here
 * keeps the parser dealing with one shape.
 */
function responseText(result: { response?: string } | string): string {
	if (typeof result === 'string') return result;
	return typeof result?.response === 'string' ? result.response : '';
}

export async function handleGenerate(request: Request, env: Env, now: number): Promise<Response> {
	// No store means the namespace was never created — see README step 1. Failing
	// closed here is deliberate: the alternative is quietly serving an
	// unmetered public AI endpoint, which is the one outcome worth refusing.
	if (!env.RATE_LIMIT) {
		return json({ error: 'This generator is not fully configured yet. Try again later.' }, 503);
	}

	if (!env.AI) {
		return json({ error: 'Name generation is unavailable right now.' }, 503);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Expected a JSON body.' }, 400);
	}

	const validated = validateInput(body);
	if (!validated.ok) {
		return json({ error: validated.error }, 400);
	}

	const limit = await consume(env.RATE_LIMIT, clientIp(request), now);
	if (!limit.allowed) {
		return json(
			{
				error: `That's ${HOURLY_LIMIT} sets of names this hour — the limit while this stays free. Try again in ${Math.ceil(limit.resetSeconds / 60)} minutes.`
			},
			429,
			{ 'Retry-After': String(limit.resetSeconds) }
		);
	}

	const { system, user } = buildNamingPrompt(validated.value);

	let names: GeneratedName[] = [];
	try {
		const result = await env.AI.run(AI_MODEL, {
			messages: [
				{ role: 'system', content: system },
				{ role: 'user', content: user }
			],
			max_tokens: MAX_TOKENS,
			// Naming wants range, not the single likeliest word. Low temperature here
			// produces six variations on one idea.
			temperature: 0.9
		});
		names = parseNames(responseText(result));
	} catch {
		return json({ error: 'The model did not answer. Try again in a moment.' }, 502);
	}

	if (names.length === 0) {
		return json(
			{ error: 'That came back unreadable — try rephrasing what you are building.' },
			502
		);
	}

	return json({ names, remaining: limit.remaining }, 200, {
		'X-RateLimit-Remaining': String(limit.remaining)
	});
}

/**
 * One export, dispatching on the method itself.
 *
 * Pages also supports method-named exports (`onRequestPost`), but exporting both
 * those and `onRequest` leaves the precedence between them up to the wrangler
 * version doing the bundling. An explicit check has no such ambiguity.
 */
export const onRequest: (context: { request: Request; env: Env }) => Promise<Response> = async ({
	request,
	env
}) => {
	if (request.method !== 'POST') {
		return json({ error: 'Use POST.' }, 405, { Allow: 'POST' });
	}
	return handleGenerate(request, env, Date.now());
};
