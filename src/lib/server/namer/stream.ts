/**
 * Turning a token stream into names, one at a time.
 *
 * Generating six names takes fifteen to twenty seconds. Waiting for the whole
 * reply and then showing all six at once means the page sits dead for the entire
 * time, which reads as broken — and the honest fix is not a fake progress bar
 * but showing each name at the moment it actually exists.
 *
 * The model emits one JSON array, so a name is "ready" when its object closes.
 * `parseNames` already recovers the complete objects from a truncated array —
 * it was written to salvage replies cut off by the token limit — and a stream
 * mid-flight is exactly a truncated array. So the same parser, run against a
 * growing buffer, is the whole mechanism.
 *
 * Both readers below are factories holding a private buffer rather than pure
 * functions, because chunk boundaries fall wherever the network puts them: a
 * single `data:` line can arrive in three pieces, and a name's closing brace can
 * be split from its comma.
 */

import { parseNames, type GeneratedName, type NameRejectionKind } from './naming';
import { checkDomain, type CheckDeps } from './availability';

/**
 * Reassembles Server-Sent Events across arbitrary chunk boundaries and yields
 * the text deltas.
 *
 * Workers AI sends `data: {"response":"…"}` per token and a final
 * `data: [DONE]`. Anything that is not a parseable data line is skipped rather
 * than thrown on: a keep-alive comment or a blank line is normal traffic, not a
 * failure worth aborting a half-finished generation over.
 */
export function createSseReader(): { push(chunk: string): string[] } {
	let buffer = '';

	return {
		push(chunk: string): string[] {
			buffer += chunk;

			// The last element is whatever precedes the next newline — possibly half a
			// line — so it stays in the buffer for the following chunk.
			const lines = buffer.split('\n');
			// `split` always yields at least one element, so this is a string. The
			// `??` TypeScript would otherwise want is a branch that cannot be taken.
			buffer = lines.pop() as string;

			const deltas: string[] = [];
			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed || trimmed === 'data: [DONE]' || !trimmed.startsWith('data: ')) continue;

				try {
					const payload = JSON.parse(trimmed.slice(6)) as {
						response?: unknown;
						choices?: { delta?: { content?: unknown } }[];
					};

					// Workers AI uses `response`; the OpenAI-compatible path uses
					// choices[].delta.content. Both appear depending on the model, and
					// accepting both costs one line.
					const text =
						typeof payload?.response === 'string'
							? payload.response
							: typeof payload?.choices?.[0]?.delta?.content === 'string'
								? payload.choices[0].delta.content
								: null;

					if (text) deltas.push(text);
				} catch {
					// A malformed frame is one lost token, not a lost generation.
				}
			}
			return deltas;
		}
	};
}

/**
 * Accumulates model text and reports names as they complete.
 *
 * `push` returns only what is newly finished, so a caller can forward each name
 * the moment it lands. Names already sent are tracked by count rather than by
 * value: the parser returns them in a stable order and only ever appends, so the
 * count is enough and comparing objects would be busywork.
 */
export function createNameAccumulator(): {
	push(text: string): GeneratedName[];
	all(): GeneratedName[];
	raw(): string;
} {
	let buffer = '';
	let emitted = 0;

	return {
		push(text: string): GeneratedName[] {
			buffer += text;
			const names = parseNames(buffer);
			if (names.length <= emitted) return [];

			const fresh = names.slice(emitted);
			emitted = names.length;
			return fresh;
		},
		all: () => parseNames(buffer),
		raw: () => buffer
	};
}

/** One line of the NDJSON the endpoint streams to the browser. */
export type NamerEvent =
	| { type: 'name'; index: number; name: GeneratedName }
	/**
	 * A name the model produced but the domain requirement rejected. Sent rather
	 * than swallowed: a generation that quietly discards four of six looks stalled,
	 * and watching candidates get struck off is the clearest possible account of
	 * what the wait is buying.
	 */
	| {
			type: 'rejected';
			name: string;
			reason: string;
			kind: NameRejectionKind;
			/** Another required registry was uncertain even if this name was also taken. */
			registryUnverifiable?: true;
	  }
	| {
			type: 'status';
			message: string;
			round: number;
			maxRounds: number;
			delivered: number;
			target: number;
	  }
	| {
			type: 'done';
			total: number;
			remaining: number;
			limit: number;
			target?: number;
			complete?: boolean;
			rounds?: number;
			message?: string;
	  }
	| { type: 'error'; error: string };

/**
 * NDJSON rather than SSE on the way out.
 *
 * The browser side is a `for await` over lines; SSE would buy retry semantics
 * and an EventSource API that cannot POST, which is the wrong shape for a
 * request that carries a brief in its body.
 */
export function encodeEvent(event: NamerEvent): string {
	return `${JSON.stringify(event)}\n`;
}

/**
 * Splits an NDJSON body into whole lines across chunk boundaries.
 *
 * Exported because the same buffering problem exists on the receiving side, and
 * a second hand-rolled splitter in the page is a second place to get it subtly
 * wrong.
 */
export function createNdjsonReader(): { push(chunk: string): NamerEvent[] } {
	let buffer = '';

	return {
		push(chunk: string): NamerEvent[] {
			buffer += chunk;
			const lines = buffer.split('\n');
			// `split` always yields at least one element, so this is a string. The
			// `??` TypeScript would otherwise want is a branch that cannot be taken.
			buffer = lines.pop() as string;

			const events: NamerEvent[] = [];
			for (const line of lines) {
				if (!line.trim()) continue;
				try {
					events.push(JSON.parse(line) as NamerEvent);
				} catch {
					// A truncated line cannot happen here — split() guarantees whole lines
					// — so this only fires on genuine corruption, where dropping the line
					// beats failing the whole generation.
				}
			}
			return events;
		}
	};
}

/** A name that passed the domain requirement, or why it did not. */
export type Verdict =
	| { ok: true }
	| {
			ok: false;
			reason: string;
			kind: Extract<NameRejectionKind, 'taken' | 'unverifiable'>;
			/** A required registry failed, even when a different TLD was definitively taken. */
			registryUnverifiable?: true;
	  };

/**
 * Does this name meet the caller's domain requirement?
 *
 * **`unchecked` fails.** A registry that did not answer tells us nothing, and
 * the one thing this must never do is show a name under a promise that its .com
 * is free when we could not confirm it. Rejecting on a registry blip costs a
 * good candidate; accepting on one costs somebody a brand.
 *
 * Checks run concurrently and the first refusal decides, so a name failing on
 * .com does not wait on .net.
 */
export async function meetsDomainRequirement(
	deps: CheckDeps,
	name: string,
	tlds: string[]
): Promise<Verdict> {
	if (!tlds.length) return { ok: true };

	const checks = await Promise.all(tlds.map((tld) => checkDomain(deps, name, tld)));

	const taken = checks.filter((c) => c.state === 'taken').map((c) => c.label);
	const unknown = checks.filter((c) => c.state === 'unchecked').map((c) => c.label);
	if (taken.length)
		return {
			ok: false,
			reason: `${taken.join(', ')} already registered`,
			kind: 'taken',
			...(unknown.length ? { registryUnverifiable: true as const } : {})
		};

	if (unknown.length)
		return {
			ok: false,
			reason: `could not verify ${unknown.join(', ')}`,
			kind: 'unverifiable',
			registryUnverifiable: true
		};

	return { ok: true };
}

/** Everything the event generator needs that is not the model's output. */
export interface NameEventOptions {
	/**
	 * Claims a name globally, returning false if somebody already has it.
	 *
	 * Injected rather than imported so the generator stays testable without a
	 * database, and so the uniqueness rule has exactly one implementation to audit.
	 * Omitted means no uniqueness check at all.
	 */
	reserve?: (name: string) => Promise<boolean>;
	/** TLDs that must be free, or empty to accept every name. */
	requireTlds: string[];
	/** Reported on the closing `done` event, for the "n left this hour" counter. */
	remaining: number;
	limit: number;
	/** Index offset when several model rounds feed one delivered set. */
	startIndex?: number;
	/** Stop accepting once the request-wide delivery floor is full. */
	maxNames?: number;
	/** Never spend domain lookups on more candidates than the budget allows. */
	maxCandidates?: number;
	/** Reject a candidate already attempted in an earlier model round. */
	exclude?: (name: string) => boolean;
}

/**
 * The whole generation, as a sequence of events.
 *
 * Split out of the route so it can be tested by collecting what it yields.
 * Driving it through a `Response` instead would mean testing the streaming
 * contract through a `ReadableStream` that the test environment's `Response`
 * does not consume — and the route is left doing nothing but wrapping this in a
 * stream, which is the part with no logic in it.
 *
 * `source` is either the model's whole reply or its token stream; a model that
 * ignores `stream: true` still has to work, and both go through one accumulator.
 */
export async function* streamNameEvents(
	deps: CheckDeps,
	source: ReadableStream<Uint8Array> | string,
	options: NameEventOptions
): AsyncGenerator<NamerEvent> {
	const sse = createSseReader();
	const names = createNameAccumulator();
	let sent = 0;
	let considered = 0;
	let unverifiable = 0;

	/** Check the requirement, claim the name, then forward it or say why not. */
	async function* offer(name: GeneratedName): AsyncGenerator<NamerEvent> {
		if (sent >= (options.maxNames ?? Number.POSITIVE_INFINITY)) return;
		if (considered >= (options.maxCandidates ?? Number.POSITIVE_INFINITY)) return;
		considered += 1;

		if (options.exclude?.(name.name)) {
			yield {
				type: 'rejected',
				name: name.name,
				reason: 'already considered in this request',
				kind: 'duplicate'
			};
			return;
		}

		const verdict = await meetsDomainRequirement(deps, name.name, options.requireTlds);
		if (!verdict.ok) {
			if (verdict.registryUnverifiable) unverifiable += 1;
			yield {
				type: 'rejected',
				name: name.name,
				reason: verdict.reason,
				kind: verdict.kind,
				...(verdict.registryUnverifiable ? { registryUnverifiable: true as const } : {})
			};
			return;
		}

		// Claimed before it is shown, and only after it has passed everything else —
		// reserving a name we were about to reject anyway would burn it for the next
		// person for no reason.
		//
		// The reason says only that the name is spoken for. It deliberately does not
		// say by whom or for what: the table being consulted does not know, and the
		// message must not imply more than the check actually learned.
		if (options.reserve && !(await options.reserve(name.name))) {
			yield {
				type: 'rejected',
				name: name.name,
				reason: 'already suggested before',
				kind: 'duplicate'
			};
			return;
		}

		yield { type: 'name', index: (options.startIndex ?? 0) + sent++, name };
	}

	try {
		if (typeof source === 'string') {
			for (const name of names.push(source)) yield* offer(name);
		} else {
			const reader = source.getReader();
			const decoder = new TextDecoder();
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				for (const delta of sse.push(decoder.decode(value, { stream: true }))) {
					// Awaited in order, so names appear as the model wrote them rather
					// than in whatever order the registries happen to answer.
					for (const name of names.push(delta)) yield* offer(name);
				}
			}
		}
	} catch {
		yield { type: 'error', error: 'The model stopped part-way. Try again.' };
		return;
	}

	if (sent > 0) {
		yield {
			type: 'done',
			total: (options.startIndex ?? 0) + sent,
			remaining: options.remaining,
			limit: options.limit
		};
		return;
	}

	// Failures that would otherwise look identical: nothing usable came back,
	// every name was unavailable, or a required registry could not be verified.
	const produced = considered;
	if (!produced) {
		yield {
			type: 'error',
			error: 'That came back unreadable — try rephrasing what you are building.'
		};
		return;
	}

	yield {
		type: 'error',
		error: unverifiable
			? `Could not verify the required .${options.requireTlds.join(', .')} registry, so no unconfirmed names were shown.`
			: options.requireTlds.length
				? `All ${produced} names were already taken on .${options.requireTlds.join(', .')}. Try again — or relax the domain requirement.`
				: `All ${produced} names had been suggested before. Try again for a fresh set.`
	};
}
