import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { getMatchingProfileField, getProfileFieldValue } from '$lib/services/brand';
import { requireBrandAccess } from '$lib/server/brand-access';

/**
 * GET /api/brand/assets/texts/field-status
 * Check whether a text asset key maps to a brand profile field,
 * and whether that field currently has a value.
 *
 * Query params: brandProfileId, category, key
 * Returns: { matchesField, fieldName?, fieldLabel?, currentValue? }
 */
export const GET: RequestHandler = async ({ url, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB) throw error(500, 'Platform not available');

	const brandProfileId = url.searchParams.get('brandProfileId');
	const category = url.searchParams.get('category');
	const key = url.searchParams.get('key');

	if (!brandProfileId || !category || !key) {
		throw error(400, 'brandProfileId, category, and key are required');
	}

	// Authorised before the mapping is even consulted: the reply leaks a profile
	// field's current value for whatever brand is named.
	await requireBrandAccess(platform.env.DB, locals.user.id, brandProfileId, 'read');

	const match = getMatchingProfileField(category, key);

	if (!match) {
		return json({ matchesField: false });
	}

	const currentValue = await getProfileFieldValue(platform.env.DB, brandProfileId, match.fieldName);

	return json({
		matchesField: true,
		fieldName: match.fieldName,
		fieldLabel: match.fieldLabel,
		currentValue
	});
};
