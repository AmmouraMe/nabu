/**
 * POST /api/brand/push-to-profile
 * Push a text asset's current value (or a specific revision's value) to the
 * corresponding brand profile field. Uses the reverse mapping from text
 * category/key → profile field name.
 *
 * Body:
 *   - brandProfileId: string (required)
 *   - textId: string (required) — the brand_texts row id
 *   - revisionId?: string (optional) — push a specific revision's value instead of current
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBrandProfile } from '$lib/services/onboarding';
import { getMatchingProfileField, updateBrandFieldWithVersion } from '$lib/services/brand';
import { getBrandTextById } from '$lib/services/brand-assets';
import { getRevisionById } from '$lib/services/text-history';

export const POST: RequestHandler = async ({ locals, platform, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}
	if (!platform?.env?.DB) {
		throw error(500, 'Platform not available');
	}

	const body = await request.json();
	const { brandProfileId, textId, revisionId } = body;

	if (!brandProfileId || !textId) {
		throw error(400, 'brandProfileId and textId are required');
	}

	// Verify profile belongs to user
	const profile = await getBrandProfile(platform.env.DB, brandProfileId);
	if (!profile) {
		throw error(404, 'Profile not found');
	}
	if (profile.userId !== locals.user.id) {
		throw error(403, 'Forbidden');
	}

	// Get the text asset
	const textAsset = await getBrandTextById(platform.env.DB, textId);
	if (!textAsset) {
		throw error(404, 'Text asset not found');
	}

	// Determine the value to push: from a specific revision, or from the text asset itself
	let valueToPush = textAsset.value;

	if (revisionId) {
		const revision = await getRevisionById(platform.env.DB, revisionId);
		if (!revision) {
			throw error(404, 'Revision not found');
		}
		if (revision.brandTextId !== textId) {
			throw error(400, 'Revision does not belong to this text asset');
		}
		valueToPush = revision.value;
	}

	// Find the matching profile field
	const fieldMatch = getMatchingProfileField(textAsset.category, textAsset.key);
	if (!fieldMatch) {
		throw error(400, `No profile field mapping for ${textAsset.category}/${textAsset.key}`);
	}

	// Update the profile field with version tracking
	await updateBrandFieldWithVersion(platform.env.DB, {
		profileId: brandProfileId,
		userId: locals.user.id,
		fieldName: fieldMatch.fieldName,
		newValue: valueToPush,
		changeSource: 'manual',
		syncTextAsset: false,
		changeReason: revisionId
			? `Pushed from text revision`
			: `Pushed from text asset "${textAsset.label}"`
	});

	// Return updated profile
	const updatedProfile = await getBrandProfile(platform.env.DB, brandProfileId);

	return json({
		profile: updatedProfile,
		pushedField: fieldMatch.fieldName,
		pushedLabel: fieldMatch.fieldLabel,
		value: valueToPush
	});
};
