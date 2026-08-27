/**
 * POST /api/namer/generate — five checked brand names, streamed as they survive.
 *
 * Deliberately reachable without an account: the generator is a way in, and a
 * login in front of it would defeat the point. That makes it the one AI endpoint
 * here outside the entitlements gate, which has no plan to consult for a
 * stranger — so it carries its own hourly ceiling and never touches
 * `usage_counters`. A visitor cannot spend a paying user's allowance, and a
 * signed-in user cannot lose AI text generations to an afternoon of naming
 * things.
 *
 * The response is NDJSON, one event per line, because generation takes fifteen
 * to twenty seconds and holding the whole reply back leaves the page looking
 * dead for all of it. Each name is forwarded the moment its JSON object closes.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildNamingPrompt, MAX_AVOID, validateInput } from '$lib/server/namer/naming';
import { AI_MODEL, MAX_TOKENS, TEMPERATURE, responseText } from '$lib/server/namer/ai';
import type { AiResult } from '$lib/server/namer/ai';
import { consume, rateLimitIdentity } from '$lib/server/namer/rate-limit';
import { encodeEvent } from '$lib/server/namer/stream';
import { streamNameDelivery, type NameModelSource } from '$lib/server/namer/delivery';
import { reserveName, saveGeneration } from '$lib/server/namer/history';
import type { GeneratedName } from '$lib/server/namer/naming';

function modelSource(result: AiResult | ReadableStream): NameModelSource {
	return result instanceof ReadableStream ? result : responseText(result as AiResult);
}

export const POST: RequestHandler = async ({ request, platform, locals, getClientAddress }) => {
	const kv = platform?.env?.KV;
	const ai = platform?.env?.AI;

	// Fails closed rather than serving an unmetered public AI endpoint.
	if (!kv || !ai) {
		return json({ error: 'The name generator is unavailable right now.' }, { status: 503 });
	}

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

	const requireTlds = validated.value.requireTlds ?? [];
	const checkDeps = {
		// Bound, not passed bare: a detached `fetch` called as `deps.fetch(...)`
		// takes `deps` as its `this` and throws on the Workers runtime.
		fetch: globalThis.fetch.bind(globalThis),
		cache: kv
	};

	const prompt = buildNamingPrompt(validated.value);

	// Cast rather than widening the platform binding's declared type: three other
	// call sites take the narrow object-returning shape, and loosening it globally
	// to satisfy this one broke all of them.
	let result: AiResult | ReadableStream;
	try {
		result = (await ai.run(AI_MODEL, {
			messages: [
				{ role: 'system', content: prompt.system },
				{ role: 'user', content: prompt.user }
			],
			max_tokens: MAX_TOKENS,
			temperature: TEMPERATURE,
			stream: true
		})) as unknown as AiResult | ReadableStream;
	} catch {
		return json({ error: 'The model did not answer. Try again in a moment.' }, { status: 502 });
	}

	// Once the first byte is out the headers are gone, so a later failure cannot
	// change the status code — it travels as an `error` event instead, and the
	// page reports it exactly as it would a 502.
	const db = platform?.env?.DB;
	const generationId = crypto.randomUUID();

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const encoder = new TextEncoder();
			const delivered: GeneratedName[] = [];

			for await (const event of streamNameDelivery(checkDeps, modelSource(result), {
				requireTlds,
				remaining: limit.remaining,
				limit: identity.limit,
				initialAvoid: validated.value.avoid,
				// Request-local uniqueness is enforced by the delivery orchestrator even
				// without D1; this optional reservation adds cross-request uniqueness.
				reserve: db ? (name) => reserveName(db, name) : undefined,
				async runRetry(feedback, avoid) {
					const retryInput = {
						...validated.value,
						// Keep the newest evidence when a long session already supplied the
						// maximum avoid list. The delivery budget bounds this to one request.
						avoid: avoid.slice(-MAX_AVOID)
					};
					const retryPrompt = buildNamingPrompt(retryInput, feedback);
					const retryResult = (await ai.run(AI_MODEL, {
						messages: [
							{ role: 'system', content: retryPrompt.system },
							{ role: 'user', content: retryPrompt.user }
						],
						max_tokens: MAX_TOKENS,
						temperature: TEMPERATURE,
						stream: true
					})) as unknown as AiResult | ReadableStream;
					return modelSource(retryResult);
				}
			})) {
				if (event.type === 'name') delivered.push(event.name);
				controller.enqueue(encoder.encode(encodeEvent(event)));
			}

			// Saved after the fact, so a slow write never delays a name reaching the
			// page. `locals.user?.id ?? null` is the whole ownership rule: a
			// logged-out visitor's brief is stored against nobody and read back by
			// nobody.
			//
			// Handed to `waitUntil` where the runtime offers it, so the write outlives
			// the response instead of being cut short when the client disconnects —
			// the same reason api-guard.ts records key usage that way. Called through
			// `context` on purpose: pulling `waitUntil` into a local loses its `this`
			// binding and throws on invocation.
			if (db && delivered.length) {
				const write = saveGeneration(db, {
					id: generationId,
					userId: locals.user?.id ?? null,
					input: validated.value,
					names: delivered
				});

				const ctx = platform?.context;
				if (ctx && typeof ctx.waitUntil === 'function') {
					ctx.waitUntil(write);
				} else {
					await write;
				}
			}

			controller.close();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'application/x-ndjson; charset=utf-8',
			'Cache-Control': 'no-store',
			// Without this some proxies buffer the whole body and hand it over at the
			// end, which would undo the entire point of streaming.
			'X-Accel-Buffering': 'no'
		}
	});
};
