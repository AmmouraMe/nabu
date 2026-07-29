/**
 * GET /api/account/usage
 *
 * Where this account stands against its plan, this month.
 *
 * Exists because a limit nobody can see is indistinguishable from a bug. Every gate
 * in `$lib/server/entitlements` refuses with the numbers attached, but only at the
 * moment of refusal — this is how the app can say "1 of 2 videos left" *before*
 * someone writes a prompt and gets turned away.
 *
 * Read-only, and always about the caller: there is no `userId` parameter to pass,
 * so it cannot be used to inspect anyone else's consumption.
 */

import { error, json } from '@sveltejs/kit';
import { resolvePlan, usageSnapshot } from '$lib/server/entitlements';
import { getTier } from '$lib/utils/pricing';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, platform }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Usage is unavailable right now.');

	const plan = await resolvePlan(db, locals.user.id);
	const snapshot = await usageSnapshot(db, locals.user.id, plan);
	const tier = getTier(plan);

	return json({
		...snapshot,
		planName: tier.name,
		planDescription: tier.description
	});
};
