/**
 * Nabu weekly content-calendar scheduler.
 *
 * Cloudflare Pages projects reject a `[triggers]` block outright, so Nabu itself
 * cannot own a cron trigger — the one that used to sit in its wrangler.toml
 * (`crons = ["0 9 * * 1"]`) never scheduled anything, it only ever broke deploys.
 * This standalone Worker is the scheduler instead: it calls Nabu's cron endpoint
 * on the same weekly cadence with the shared bearer secret.
 *
 * The endpoint is a **GET** (`src/routes/api/cron/content/+server.ts` exports
 * `GET`), despite older notes calling it a POST. It generates a 4-week calendar
 * for every brand with `auto_schedule = 1` and saves the entries as drafts.
 */

export interface Env {
	/** Absolute URL of Nabu's cron endpoint. */
	NABU_CRON_URL: string;
	/** Shared secret; must match the Pages project's CRON_SECRET. */
	CRON_SECRET: string;
}

interface RunResult {
	ok: boolean;
	status: number;
	body: string;
}

/**
 * Call the cron endpoint once. Never throws — a scheduled invocation should log
 * and exit rather than surface an unhandled rejection, and the caller decides
 * what to do with a failure.
 */
async function runCalendar(env: Env): Promise<RunResult> {
	if (!env.CRON_SECRET) {
		return { ok: false, status: 0, body: 'CRON_SECRET is not set on this Worker' };
	}
	if (!env.NABU_CRON_URL) {
		return { ok: false, status: 0, body: 'NABU_CRON_URL is not set on this Worker' };
	}

	try {
		const response = await fetch(env.NABU_CRON_URL, {
			method: 'GET',
			headers: { Authorization: `Bearer ${env.CRON_SECRET}` }
		});
		// Truncated: this only ever goes to logs, and the calendar payload is large.
		const body = (await response.text()).slice(0, 2000);
		return { ok: response.ok, status: response.status, body };
	} catch (cause) {
		return { ok: false, status: 0, body: `fetch failed: ${String(cause)}` };
	}
}

export default {
	/**
	 * Weekly trigger. `waitUntil` keeps the request alive past the handler so a
	 * slow calendar generation is not cut off when `scheduled` returns.
	 */
	async scheduled(_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
		ctx.waitUntil(
			runCalendar(env).then((result) => {
				if (result.ok) {
					console.log(`✓ content calendar run: ${result.status} ${result.body}`);
				} else {
					console.error(`✗ content calendar failed: ${result.status} ${result.body}`);
				}
			})
		);
	},

	/**
	 * Manual "run now", gated on the same bearer secret as the endpoint it calls,
	 * so it adds no weaker path than already exists. It matters because this job
	 * has never once run in production: without a way to fire it on demand, the
	 * only feedback loop is waiting until Monday.
	 *
	 * Not reachable from the internet — `workers_dev = false` and no route are set
	 * deliberately, so this is a `wrangler dev` affordance. Adding a route later
	 * would expose it, which is fine given the bearer check but should be a choice.
	 */
	async fetch(request: Request, env: Env): Promise<Response> {
		const auth = request.headers.get('Authorization') ?? '';
		const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
		if (!env.CRON_SECRET || token !== env.CRON_SECRET) {
			return new Response('Not found', { status: 404 });
		}

		const result = await runCalendar(env);
		return new Response(JSON.stringify(result, null, 2), {
			status: result.ok ? 200 : 502,
			headers: { 'content-type': 'application/json' }
		});
	}
};
