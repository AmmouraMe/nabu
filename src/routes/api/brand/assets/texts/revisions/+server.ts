import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import {
	getTextRevisions,
	getCurrentTextRevision,
	revertTextToRevision,
	createTextRevision
} from '$lib/services/text-history';
import { updateBrandText } from '$lib/services/brand-assets';
import { brandOfText, brandOfTextRevision, requireAssetAccess } from '$lib/server/brand-access';

/**
 * GET /api/brand/assets/texts/revisions
 * Get revision history for a text asset.
 */
export const GET: RequestHandler = async ({ url, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB) throw error(500, 'Platform not available');

	const brandTextId = url.searchParams.get('brandTextId');
	if (!brandTextId) throw error(400, 'brandTextId required');

	await requireAssetAccess(
		platform.env.DB,
		locals.user.id,
		await brandOfText(platform.env.DB, brandTextId),
		'read'
	);

	const current = url.searchParams.get('current') === 'true';
	if (current) {
		const revision = await getCurrentTextRevision(platform.env.DB, brandTextId);
		return json({ revision });
	}

	const revisions = await getTextRevisions(platform.env.DB, brandTextId);
	return json({ revisions });
};

/**
 * POST /api/brand/assets/texts/revisions
 * Revert a text asset to a previous revision, or create a new revision.
 */
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB) throw error(500, 'Platform not available');

	const body = await request.json();
	const { action } = body;

	if (action === 'revert') {
		const { revisionId } = body;
		if (!revisionId) throw error(400, 'revisionId required');

		await requireAssetAccess(
			platform.env.DB,
			locals.user.id,
			await brandOfTextRevision(platform.env.DB, revisionId),
			'write'
		);

		const newRevision = await revertTextToRevision(platform.env.DB, revisionId, locals.user.id);

		// Update the text asset to the reverted value
		await updateBrandText(platform.env.DB, newRevision.brandTextId, {
			value: newRevision.value,
			label: newRevision.label
			// Don't pass userId here to avoid creating a duplicate revision
		});

		return json({ revision: newRevision });
	}

	// Default: create a new revision
	const { brandTextId, value, label, changeSource, changeNote } = body;
	if (!brandTextId) throw error(400, 'brandTextId required');
	if (!value) throw error(400, 'value required');

	await requireAssetAccess(
		platform.env.DB,
		locals.user.id,
		await brandOfText(platform.env.DB, brandTextId),
		'write'
	);

	const revision = await createTextRevision(platform.env.DB, {
		brandTextId,
		value,
		label,
		changeSource: changeSource || 'manual',
		userId: locals.user.id,
		changeNote
	});

	return json({ revision }, { status: 201 });
};
