import { redirect } from '@sveltejs/kit';
import { configuredProviders } from '$lib/server/oauth-config';
import { FREE_TIER, getTier } from '$lib/utils/pricing';
import type { PageServerLoad } from './$types';

/**
 * The signup page had no server load at all, which is why it advertised OAuth
 * providers by guesswork: a hardcoded Google button (no login route exists for it)
 * and a GitHub one that appeared even when GitHub was unconfigured. It now asks the
 * same question the login page does.
 *
 * It also carries the free plan's limits, so the page can tell someone what they are
 * signing up for before they sign up rather than after they hit a wall.
 */
export const load: PageServerLoad = async ({ locals, platform }) => {
	if (locals.user) {
		throw redirect(302, '/');
	}

	const freeTier = getTier(FREE_TIER);

	return {
		configuredProviders: await configuredProviders(platform),
		freePlan: {
			name: freeTier.name,
			description: freeTier.description,
			limits: freeTier.limits
		}
	};
};
