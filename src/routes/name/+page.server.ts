/**
 * The public brand-name generator page.
 *
 * The archetype list and the heuristics are served from `$lib/server/namer/naming`
 * rather than repeated in the markup, so the words on the page and the words the
 * model is actually given cannot drift apart. `$lib/server` is server-only, which
 * is why they arrive through a load rather than an import in the component.
 */

import type { PageServerLoad } from './$types';
import { ARCHETYPES, NAMING_HEURISTICS } from '$lib/server/namer/naming';
import { UNVERIFIABLE_TLDS, CHECKED_TLDS } from '$lib/server/namer/availability';
import { ANON_HOURLY_LIMIT, SIGNED_IN_HOURLY_LIMIT } from '$lib/server/namer/rate-limit';

export const load: PageServerLoad = async ({ locals }) => ({
	archetypes: ARCHETYPES.map((a) => ({
		id: a.id,
		label: a.label,
		traits: a.traits
	})),
	heuristics: NAMING_HEURISTICS.map((h) => ({ label: h.label, guidance: h.guidance })),
	checkedTlds: [...CHECKED_TLDS],
	unverifiableTlds: [...UNVERIFIABLE_TLDS],
	limit: locals.user ? SIGNED_IN_HOURLY_LIMIT : ANON_HOURLY_LIMIT,
	anonLimit: ANON_HOURLY_LIMIT,
	signedInLimit: SIGNED_IN_HOURLY_LIMIT
});
