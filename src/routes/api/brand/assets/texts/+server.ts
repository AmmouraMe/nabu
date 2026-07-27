import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import {
	createBrandText,
	getBrandTexts,
	getBrandTextsByCategory,
	updateBrandText,
	deleteBrandText
} from '$lib/services/brand-assets';
import { updateBrandFieldWithVersion } from '$lib/services/brand';
import { brandOfText, requireAssetAccess, requireBrandAccess } from '$lib/server/brand-access';

/**
 * GET /api/brand/assets/texts
 * List text assets for a brand profile
 */
export const GET: RequestHandler = async ({ url, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB) throw error(500, 'Platform not available');

	const brandProfileId = url.searchParams.get('brandProfileId');
	if (!brandProfileId) throw error(400, 'brandProfileId required');

	await requireBrandAccess(platform.env.DB, locals.user.id, brandProfileId, 'read');

	const category = url.searchParams.get('category');

	const texts = category
		? await getBrandTextsByCategory(platform.env.DB, brandProfileId, category)
		: await getBrandTexts(platform.env.DB, brandProfileId);

	return json({ texts });
};

/**
 * POST /api/brand/assets/texts
 * Create a text asset.
 * If setAsProfileField=true and profileFieldName is provided,
 * also updates the corresponding brand_profiles field with version tracking.
 */
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB) throw error(500, 'Platform not available');

	const body = await request.json();
	const {
		brandProfileId,
		category,
		key,
		label,
		value,
		language,
		setAsProfileField,
		profileFieldName
	} = body;

	if (!brandProfileId || !category || !key || !label || !value) {
		throw error(400, 'Missing required fields');
	}

	// Write access covers both effects below: the text asset, and the profile field
	// this can optionally overwrite.
	await requireBrandAccess(platform.env.DB, locals.user.id, brandProfileId, 'write');

	const text = await createBrandText(platform.env.DB, {
		brandProfileId,
		category,
		key,
		label,
		value,
		language,
		userId: locals.user.id,
		changeSource: 'manual'
	});

	// Optionally set the profile field to this value
	let profileFieldUpdated = false;
	if (setAsProfileField && profileFieldName) {
		try {
			await updateBrandFieldWithVersion(platform.env.DB, {
				profileId: brandProfileId,
				userId: locals.user.id,
				fieldName: profileFieldName,
				newValue: value,
				changeSource: 'ai',
				changeReason: `Set from generated text asset: ${label}`
			});
			profileFieldUpdated = true;
		} catch {
			// Non-fatal: text was still saved, just field update failed
		}
	}

	return json({ text, profileFieldUpdated }, { status: 201 });
};

/**
 * PATCH /api/brand/assets/texts
 * Update a text asset. Automatically creates a revision when value changes.
 */
export const PATCH: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB) throw error(500, 'Platform not available');

	const body = await request.json();
	const { id, changeSource, changeNote, ...updates } = body;

	if (!id) throw error(400, 'id required');

	await requireAssetAccess(
		platform.env.DB,
		locals.user.id,
		await brandOfText(platform.env.DB, id),
		'write'
	);

	await updateBrandText(platform.env.DB, id, {
		...updates,
		userId: locals.user.id,
		changeSource: changeSource || 'manual',
		changeNote
	});
	return json({ success: true });
};

/**
 * DELETE /api/brand/assets/texts
 * Delete a text asset
 */
export const DELETE: RequestHandler = async ({ url, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB) throw error(500, 'Platform not available');

	const id = url.searchParams.get('id');
	if (!id) throw error(400, 'id required');

	await requireAssetAccess(
		platform.env.DB,
		locals.user.id,
		await brandOfText(platform.env.DB, id),
		'write'
	);

	await deleteBrandText(platform.env.DB, id);
	return json({ success: true });
};
