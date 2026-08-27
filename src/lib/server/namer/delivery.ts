/**
 * Turning one accepted generation request into a useful set of names.
 *
 * A model round asks for six candidates, but six candidates are not the product:
 * domain and uniqueness checks can reject any of them. This module keeps asking
 * until five checked names have actually been delivered, or until a hard budget
 * boundary says another round would be dishonest.
 */

import { nameKey } from './history';
import { NAMES_REQUESTED, type RetryFeedback } from './naming';
import { streamNameEvents, type NameEventOptions, type NamerEvent } from './stream';
import type { CheckDeps } from './availability';

/** What the user should finish with; distinct from the per-round model request. */
export const NAMES_DELIVERY_TARGET = 5;

/** Cloudflare's request-wide ceiling that required-domain fetches consume. */
export const WORKER_SUBREQUEST_BUDGET = 50;

export type NameModelSource = ReadableStream<Uint8Array> | string;

/**
 * Maximum model rounds whose worst-case domain checks fit in one Worker request.
 *
 * Each round can produce `NAMES_REQUESTED` candidates and every candidate costs
 * one lookup per required TLD. With no required TLD, one conservative accounting
 * unit per candidate still provides a finite cap for duplicate or malformed
 * model output. The supported TLD allowlist tops out at six, so at least one
 * round always fits.
 */
export function generationRoundLimit(requiredTldCount: number): number {
	const lookupsPerCandidate = Math.max(1, Math.floor(requiredTldCount));
	return Math.max(
		1,
		Math.floor(WORKER_SUBREQUEST_BUDGET / (NAMES_REQUESTED * lookupsPerCandidate))
	);
}

export interface NameDeliveryOptions
	extends Pick<NameEventOptions, 'requireTlds' | 'remaining' | 'limit' | 'reserve'> {
	/** Names supplied by the caller as already seen. */
	initialAvoid?: string[];
	/**
	 * Ask for another model round. It receives every rejection and every name
	 * already considered, so the prompt can explain what failed instead of making
	 * a blind duplicate request.
	 */
	runRetry: (
		feedback: readonly RetryFeedback[],
		avoid: readonly string[]
	) => Promise<NameModelSource>;
}

function statusMessage(
	delivered: number,
	target: number,
	rejectedThisRound: number,
	nextRound: number,
	maxRounds: number,
	roundError: string | null
): string {
	const progress = delivered
		? `Found ${delivered} of ${target}.`
		: 'No checked names survived that set.';
	const reason = roundError
		? 'The model stopped early; asking for a fresh set.'
		: rejectedThisRound
			? `${rejectedThisRound} ${rejectedThisRound === 1 ? 'candidate was' : 'candidates were'} unavailable; asking for alternatives.`
			: 'The response did not contain enough usable names; asking for a fresh set.';
	return `${progress} ${reason} Round ${nextRound} of ${maxRounds}…`;
}

function partialMessage(
	delivered: number,
	target: number,
	rounds: number,
	requireTlds: string[],
	stop: 'registry' | 'budget' | 'model'
): string {
	const count = `${delivered} of ${target}`;
	if (stop === 'registry') {
		return `${count} names passed, then a required .${requireTlds.join(', .')} registry could not be verified. We stopped instead of treating uncertainty as availability; every name shown did pass.`;
	}
	if (stop === 'model') {
		return `${count} names passed before the model stopped answering. The names shown are still valid; try again for a full set.`;
	}
	if (requireTlds.length) {
		return `${count} names passed after ${rounds} ${rounds === 1 ? 'round' : 'rounds'}. The required .${requireTlds.join(', .')} space was crowded, and the rejected candidates are listed above.`;
	}
	return `${count} distinct names passed after ${rounds} ${rounds === 1 ? 'round' : 'rounds'}. The model did not produce enough new usable candidates to fill the set.`;
}

function emptyMessage(
	requireTlds: string[],
	feedback: readonly RetryFeedback[],
	stop: 'registry' | 'budget' | 'model'
): string {
	if (stop === 'registry') {
		return `We could not verify the required .${requireTlds.join(', .')} registry, so no unconfirmed names were shown. Try again when the registry is responding.`;
	}
	if (stop === 'model') return 'The model did not answer completely. Try again in a moment.';
	if (requireTlds.length && feedback.length) {
		return `None of the ${feedback.length} checked candidates survived the required .${requireTlds.join(', .')} availability checks. Try a less crowded extension or relax the requirement.`;
	}
	return 'The model did not produce a usable, distinct name. Try rephrasing what you are building.';
}

/**
 * Stream checked names across as many bounded model rounds as necessary.
 *
 * Rate limiting deliberately lives outside this generator: the caller consumes
 * one quota unit before entering, so one click remains one generation even when
 * fulfilling it needs more than one model call.
 */
export async function* streamNameDelivery(
	deps: CheckDeps,
	firstSource: NameModelSource,
	options: NameDeliveryOptions
): AsyncGenerator<NamerEvent> {
	const target = NAMES_DELIVERY_TARGET;
	const maxRounds = generationRoundLimit(options.requireTlds.length);
	const avoid = [...(options.initialAvoid ?? [])];
	const attempted = new Set(avoid.map(nameKey).filter(Boolean));
	const feedback: RetryFeedback[] = [];
	let source = firstSource;
	let delivered = 0;
	let round = 1;
	let stop: 'registry' | 'budget' | 'model' = 'budget';

	for (;;) {
		let rejectedThisRound = 0;
		let roundError: string | null = null;
		let registryUnverifiable = false;

		for await (const event of streamNameEvents(deps, source, {
			requireTlds: options.requireTlds,
			remaining: options.remaining,
			limit: options.limit,
			reserve: options.reserve,
			startIndex: delivered,
			maxNames: target - delivered,
			maxCandidates: NAMES_REQUESTED,
			exclude: (name) => attempted.has(nameKey(name))
		})) {
			if (event.type === 'name') {
				delivered += 1;
				const key = nameKey(event.name.name);
				if (!attempted.has(key)) avoid.push(event.name.name);
				attempted.add(key);
				yield event;
				continue;
			}

			if (event.type === 'rejected') {
				rejectedThisRound += 1;
				const key = nameKey(event.name);
				if (!attempted.has(key)) avoid.push(event.name);
				attempted.add(key);
				feedback.push({ name: event.name, reason: event.reason, kind: event.kind });
				if (event.registryUnverifiable) registryUnverifiable = true;
				yield event;
				continue;
			}

			// `done` and `error` here describe one model round. This orchestrator
			// owns the request-wide terminal event after deciding whether to retry.
			if (event.type === 'error') roundError = event.error;
		}

		if (delivered >= target) {
			yield {
				type: 'done',
				total: delivered,
				target,
				complete: true,
				rounds: round,
				remaining: options.remaining,
				limit: options.limit
			};
			return;
		}

		// An unavailable registry is infrastructure uncertainty, not evidence that
		// another batch of names is needed. More rounds would mostly repeat the same
		// failing lookup, add latency, and still be unable to certify a name.
		if (registryUnverifiable) {
			stop = 'registry';
			break;
		}

		if (round >= maxRounds) {
			stop = roundError && feedback.length === 0 ? 'model' : 'budget';
			break;
		}

		const nextRound = round + 1;
		yield {
			type: 'status',
			message: statusMessage(
				delivered,
				target,
				rejectedThisRound,
				nextRound,
				maxRounds,
				roundError
			),
			round: nextRound,
			maxRounds,
			delivered,
			target
		};

		try {
			source = await options.runRetry(feedback, avoid);
		} catch {
			stop = 'model';
			break;
		}
		round = nextRound;
	}

	if (delivered > 0) {
		yield {
			type: 'done',
			total: delivered,
			target,
			complete: false,
			rounds: round,
			remaining: options.remaining,
			limit: options.limit,
			message: partialMessage(delivered, target, round, options.requireTlds, stop)
		};
		return;
	}

	yield {
		type: 'error',
		error: emptyMessage(options.requireTlds, feedback, stop)
	};
}
