/** Request-wide delivery behavior for the public Name Builder. */

import { describe, expect, it, vi } from 'vitest';
import {
	generationRoundLimit,
	NAMES_DELIVERY_TARGET,
	streamNameDelivery,
	WORKER_SUBREQUEST_BUDGET
} from '../../src/lib/server/namer/delivery';
import { NAMES_REQUESTED, type RetryFeedback } from '../../src/lib/server/namer/naming';
import type { NamerEvent } from '../../src/lib/server/namer/stream';

function source(...names: string[]): string {
	return JSON.stringify(names.map((name) => ({ name, meaning: `${name} means something.` })));
}

async function collect(
	first: string,
	requireTlds: string[],
	fetchFn: typeof fetch,
	runRetry: (feedback: readonly RetryFeedback[], avoid: readonly string[]) => Promise<string>
): Promise<NamerEvent[]> {
	const events: NamerEvent[] = [];
	for await (const event of streamNameDelivery({ fetch: fetchFn }, first, {
		requireTlds,
		remaining: 11,
		limit: 12,
		runRetry
	})) {
		events.push(event);
	}
	return events;
}

function delivered(events: NamerEvent[]): string[] {
	return events
		.filter((event) => event.type === 'name')
		.map((event) => (event as Extract<NamerEvent, { type: 'name' }>).name.name);
}

describe('generationRoundLimit', () => {
	it('derives every supported TLD cap from the 50-subrequest budget', () => {
		for (let requiredTlds = 0; requiredTlds <= 6; requiredTlds += 1) {
			const rounds = generationRoundLimit(requiredTlds);
			const cost = NAMES_REQUESTED * Math.max(1, requiredTlds) * rounds;
			expect(rounds).toBeGreaterThanOrEqual(1);
			expect(cost).toBeLessThanOrEqual(WORKER_SUBREQUEST_BUDGET);
		}

		expect(generationRoundLimit(1)).toBe(8);
		expect(generationRoundLimit(2)).toBe(4);
		expect(generationRoundLimit(6)).toBe(1);
	});
});

describe('streamNameDelivery', () => {
	it('retries with rejection evidence until exactly five checked names survive', async () => {
		const taken = new Set(['alpha.com', 'beta.com', 'gamma.com', 'zeta.com']);
		const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
			const domain = decodeURIComponent(String(input).split('/').at(-1) ?? '');
			return new Response(null, { status: taken.has(domain) ? 200 : 404 });
		}) as unknown as typeof fetch;
		const retry = vi.fn(async (_feedback: readonly RetryFeedback[], _avoid: readonly string[]) =>
			source('Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Mu')
		);

		const events = await collect(
			source('Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'),
			['com'],
			fetchFn,
			retry
		);

		expect(delivered(events)).toEqual(['Delta', 'Epsilon', 'Eta', 'Theta', 'Iota']);
		expect(delivered(events)).toHaveLength(NAMES_DELIVERY_TARGET);
		expect(events.filter((event) => event.type === 'rejected')).toHaveLength(4);
		expect(events.find((event) => event.type === 'status')).toMatchObject({
			type: 'status',
			round: 2,
			delivered: 2,
			target: 5
		});
		expect(events.at(-1)).toMatchObject({
			type: 'done',
			total: 5,
			complete: true,
			rounds: 2
		});
		expect(retry).toHaveBeenCalledTimes(1);
		const [feedback, avoid] = retry.mock.calls[0];
		expect(feedback).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: 'Alpha',
					kind: 'taken',
					reason: expect.stringMatching(/registered/)
				})
			])
		);
		expect(avoid).toEqual(expect.arrayContaining(['Alpha', 'Delta', 'Epsilon', 'Zeta']));
		// Six checks in round one, then only the three needed to reach five.
		expect(fetchFn).toHaveBeenCalledTimes(9);
	});

	it('stops instead of burning retries against an unverifiable registry', async () => {
		const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
			const domain = String(input);
			return new Response(null, { status: domain.includes('alpha.com') ? 404 : 429 });
		}) as unknown as typeof fetch;
		const retry = vi.fn(async (_feedback: readonly RetryFeedback[], _avoid: readonly string[]) =>
			source('Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta')
		);

		const events = await collect(source('Alpha', 'Beta'), ['com'], fetchFn, retry);

		expect(delivered(events)).toEqual(['Alpha']);
		expect(retry).not.toHaveBeenCalled();
		expect(events.find((event) => event.type === 'rejected')).toMatchObject({
			type: 'rejected',
			name: 'Beta',
			kind: 'unverifiable'
		});
		expect(events.at(-1)).toMatchObject({
			type: 'done',
			total: 1,
			complete: false,
			message: expect.stringMatching(/could not be verified/i)
		});
	});

	it('stops on mixed taken and unchecked TLDs while preserving the taken reason', async () => {
		const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			return new Response(null, { status: url.endsWith('.com') ? 200 : 500 });
		}) as unknown as typeof fetch;
		const retry = vi.fn(async (_feedback: readonly RetryFeedback[], _avoid: readonly string[]) =>
			source('Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta')
		);

		const events = await collect(source('Alpha', 'Beta'), ['com', 'net'], fetchFn, retry);

		expect(retry).not.toHaveBeenCalled();
		expect(events.find((event) => event.type === 'rejected')).toMatchObject({
			type: 'rejected',
			kind: 'taken',
			reason: expect.stringMatching(/already registered/),
			registryUnverifiable: true
		});
		expect(events.at(-1)).toMatchObject({
			type: 'error',
			error: expect.stringMatching(/could not verify/i)
		});
	});

	it('delivers an honest partial set when another full round would exceed the cap', async () => {
		const fetchFn = vi.fn(
			async () => new Response(null, { status: 404 })
		) as unknown as typeof fetch;
		const retry = vi.fn(async (_feedback: readonly RetryFeedback[], _avoid: readonly string[]) =>
			source('Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota')
		);
		const tlds = ['com', 'net', 'org', 'app', 'dev', 'ai'];

		const events = await collect(source('Alpha', 'Beta', 'Gamma', 'Delta'), tlds, fetchFn, retry);

		expect(delivered(events)).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta']);
		expect(retry).not.toHaveBeenCalled();
		expect(events.at(-1)).toMatchObject({
			type: 'done',
			total: 4,
			target: 5,
			complete: false,
			rounds: 1,
			message: expect.stringMatching(/4 of 5.*space was crowded/i)
		});
		expect(fetchFn).toHaveBeenCalledTimes(24);
	});
});
