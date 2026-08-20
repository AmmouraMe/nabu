import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { getTextSuggestionsForField, FIELD_TO_TEXT_MAPPING } from '$lib/services/brand';

/**
 * GET /api/brand/text-suggestions
 * Returns saved brand text assets that can populate a specific brand profile field.
 * Query params:
 *   - brandProfileId: the brand profile ID
 *   - fieldName: the camelCase profile field name (e.g. 'tagline', 'missionStatement')
 */
export const GET: RequestHandler = async ({ url, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB) throw error(500, 'Platform not available');

	const brandProfileId = url.searchParams.get('brandProfileId');
	const fieldName = url.searchParams.get('fieldName');

	if (!brandProfileId) throw error(400, 'brandProfileId required');
	if (!fieldName) throw error(400, 'fieldName required');

	// Check if this field has a text mapping
	if (!FIELD_TO_TEXT_MAPPING[fieldName]) {
		return json({ suggestions: [], hasMappedTexts: false });
	}

	const suggestions = await getTextSuggestionsForField(platform.env.DB, brandProfileId, fieldName);

	return json({
		suggestions,
		hasMappedTexts: true,
		category: FIELD_TO_TEXT_MAPPING[fieldName].category
	});
};
