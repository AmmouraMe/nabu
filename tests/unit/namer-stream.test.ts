/**
 * Streaming names as they are written, and the domain requirement that decides
 * which ones are worth showing.
 *
 * The buffering tests are not ceremony: chunk boundaries fall wherever the
 * network puts them, and every bug in a streaming reader lives at the seam
 * between two chunks. Each one below splits its input somewhere awkward on
 * purpose.
 */

import { describe, it, expect, vi } from 'vitest';
import {
	createNameAccumulator,
	createNdjsonReader,
	createSseReader,
	encodeEvent,
	meetsDomainRequirement,
	type NamerEvent
} from '../../src/lib/server/namer/stream';
import type { CheckDeps } from '../../src/lib/server/namer/availability';

/** Workers AI's wire format. */
function sse(text: string): string {
	return `data: ${JSON.stringify({ response: text })}\n`;
}

describe('createSseReader', () => {
	it('yields the text of each data frame', () => {
		const reader = createSseReader();
		expect(reader.push(sse('Hello') + sse(' world'))).toEqual(['Hello', ' world']);
	});

	it('reassembles a frame split across chunks', () => {
		const reader = createSseReader();
		const frame = sse('complete');
		const cut = frame.length - 8;

		// The first half contains no newline, so nothing can be emitted yet.
		expect(reader.push(frame.slice(0, cut))).toEqual([]);
		expect(reader.push(frame.slice(cut))).toEqual(['complete']);
	});

	it('ignores [DONE], blank lines and keep-alives', () => {
		const reader = createSseReader();
		expect(reader.push(`\n: keep-alive\n${sse('x')}data: [DONE]\n`)).toEqual(['x']);
	});

	it('drops a malformed frame without losing the ones around it', () => {
		const reader = createSseReader();
		// One lost token beats one lost generation.
		expect(reader.push(`${sse('a')}data: {not json}\n${sse('b')}`)).toEqual(['a', 'b']);
	});

	it('reads the OpenAI-style delta shape too', () => {
		const reader = createSseReader();
		const frame = `data: ${JSON.stringify({ choices: [{ delta: { content: 'hi' } }] })}\n`;
		expect(reader.push(frame)).toEqual(['hi']);
	});

	it('skips a frame carrying no text', () => {
		const reader = createSseReader();
		expect(reader.push(`data: ${JSON.stringify({ usage: { tokens: 3 } })}\n`)).toEqual([]);
	});
});

describe('createNameAccumulator', () => {
	const ARDOR = '{"name":"Ardor","meaning":"A burning."}';
	const ALBA = '{"name":"Alba","meaning":"Dawn."}';

	it('reports a name only once its object closes', () => {
		const acc = createNameAccumulator();

		expect(acc.push('[{"name":"Ardor","meanin')).toEqual([]);
		const fresh = acc.push('g":"A burning."}');
		expect(fresh.map((n) => n.name)).toEqual(['Ardor']);
	});

	it('returns only what is newly finished on each push', () => {
		const acc = createNameAccumulator();

		expect(acc.push(`[${ARDOR}`).map((n) => n.name)).toEqual(['Ardor']);
		// Ardor is complete but already sent; only Alba is new.
		expect(acc.push(`,${ALBA}`).map((n) => n.name)).toEqual(['Alba']);
		expect(acc.push(']')).toEqual([]);
	});

	it('computes the checks on a streamed name, same as a whole reply', () => {
		const acc = createNameAccumulator();
		const [name] = acc.push(`[${ARDOR}}`.replace('}}', '}'));

		expect(name.checks).toEqual({
			syllables: 2,
			alphabeticalRank: 1,
			initial: 'A',
			typable: true
		});
	});

	it('exposes everything so far, and the raw buffer', () => {
		const acc = createNameAccumulator();
		acc.push(`[${ARDOR},${ALBA}]`);

		expect(acc.all().map((n) => n.name)).toEqual(['Ardor', 'Alba']);
		expect(acc.raw()).toContain('Ardor');
	});
});

describe('encodeEvent / createNdjsonReader', () => {
	it('round-trips events, including across a split line', () => {
		const events: NamerEvent[] = [
			{
				type: 'rejected',
				name: 'Ardor',
				reason: 'ardor.com already registered',
				kind: 'taken'
			},
			{ type: 'done', total: 1, remaining: 11, limit: 12 }
		];
		const wire = events.map(encodeEvent).join('');

		const reader = createNdjsonReader();
		const cut = wire.indexOf('\n') + 6;
		const first = reader.push(wire.slice(0, cut));
		const rest = reader.push(wire.slice(cut));

		expect([...first, ...rest]).toEqual(events);
	});

	it('ignores blank lines and corrupt ones', () => {
		const reader = createNdjsonReader();
		expect(reader.push('\n{bad}\n{"type":"error","error":"x"}\n')).toEqual([
			{ type: 'error', error: 'x' }
		]);
	});
});

describe('meetsDomainRequirement', () => {
	function deps(status: Record<string, number>): CheckDeps {
		return {
			fetch: vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				const tld = Object.keys(status).find((t) => url.endsWith(`.${t}`));
				return new Response(null, { status: tld ? status[tld] : 500 });
			}) as unknown as typeof fetch
		};
	}

	it('passes when every required TLD is free', async () => {
		const verdict = await meetsDomainRequirement(deps({ com: 404, net: 404 }), 'Ardor', [
			'com',
			'net'
		]);
		expect(verdict).toEqual({ ok: true });
	});

	it('passes trivially when nothing is required', async () => {
		const fetchFn = vi.fn();
		expect(await meetsDomainRequirement({ fetch: fetchFn as never }, 'Ardor', [])).toEqual({
			ok: true
		});
		// And costs no lookups at all.
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('rejects a registered domain, naming it', async () => {
		const verdict = await meetsDomainRequirement(deps({ com: 200 }), 'Ardor', ['com']);
		expect(verdict).toEqual({
			ok: false,
			reason: 'ardor.com already registered',
			kind: 'taken'
		});
	});

	it('rejects when a registry did not answer, rather than assuming free', async () => {
		// The whole point: `unchecked` is not `available`. Accepting a registry blip
		// as "free" is how somebody ends up building a brand on a taken domain.
		const verdict = await meetsDomainRequirement(deps({ com: 429 }), 'Ardor', ['com']);
		expect(verdict.ok).toBe(false);
		if (verdict.ok) return;
		expect(verdict.reason).toMatch(/could not verify/);
		expect(verdict.kind).toBe('unverifiable');
	});

	it('reports the taken one when a name fails on several counts', async () => {
		const verdict = await meetsDomainRequirement(deps({ com: 200, net: 500 }), 'Ardor', [
			'com',
			'net'
		]);
		expect(verdict.ok).toBe(false);
		if (verdict.ok) return;
		// "Taken" is the more useful of the two, so it leads.
		expect(verdict.reason).toContain('already registered');
		// But retry orchestration must still learn that another required registry
		// failed, or it will burn every round against the same outage.
		expect(verdict.registryUnverifiable).toBe(true);
	});
});
