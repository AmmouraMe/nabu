/**
 * GET /api/onboarding/messages/[profileId] - Get onboarding messages for a profile
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getOnboardingMessages } from '$lib/services/onboarding';
import { requireBrandAccess } from '$lib/server/brand-access';
import type { OnboardingStep } from '$lib/types/onboarding';

export const GET: RequestHandler = async ({ locals, platform, params, url }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const { profileId } = params;
	if (!profileId) {
		throw error(400, 'profileId is required');
	}

	await requireBrandAccess(platform!.env.DB, locals.user.id, profileId, 'read');

	const step = url.searchParams.get('step') as OnboardingStep | null;
	const messages = await getOnboardingMessages(platform!.env.DB, profileId, step || undefined);

	return json({ messages });
};
