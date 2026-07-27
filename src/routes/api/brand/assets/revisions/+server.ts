import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import {
	getMediaRevisions,
	getCurrentRevision,
	revertToRevision,
	createMediaRevision
} from '$lib/services/media-history';
import { logMediaActivity } from '$lib/services/media-history';
import { updateBrandMedia } from '$lib/services/brand-assets';
import { brandOfMedia, brandOfMediaRevision, requireAssetAccess } from '$lib/server/brand-access';

/**
 * GET /api/brand/assets/revisions
 * Get revision history for a media asset.
 */
export const GET: RequestHandler = async ({ url, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB) throw error(500, 'Platform not available');

	const brandMediaId = url.searchParams.get('brandMediaId');
	if (!brandMediaId) throw error(400, 'brandMediaId required');

	await requireAssetAccess(
		platform.env.DB,
		locals.user.id,
		await brandOfMedia(platform.env.DB, brandMediaId),
		'read'
	);

	const current = url.searchParams.get('current') === 'true';
	if (current) {
		const revision = await getCurrentRevision(platform.env.DB, brandMediaId);
		return json({ revision });
	}

	const revisions = await getMediaRevisions(platform.env.DB, brandMediaId);
	return json({ revisions });
};

/**
 * POST /api/brand/assets/revisions
 * Revert a media asset to a previous revision, or create a new revision.
 */
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB) throw error(500, 'Platform not available');

	const body = await request.json();
	const { action } = body;

	if (action === 'revert') {
		const { revisionId, brandProfileId } = body;
		if (!revisionId) throw error(400, 'revisionId required');
		if (!brandProfileId) throw error(400, 'brandProfileId required');

		// The revision's own brand decides access — `brandProfileId` from the body is a
		// claim. It is still required by the contract and used for the activity log, so
		// it must match, or the revert would write its audit entry into another brand.
		const owningBrand = await brandOfMediaRevision(platform.env.DB, revisionId);
		await requireAssetAccess(platform.env.DB, locals.user.id, owningBrand, 'write');
		if (brandProfileId !== owningBrand) throw error(404, 'Revision not found');

		const newRevision = await revertToRevision(platform.env.DB, revisionId, locals.user.id);

		// Update the media asset to point to the reverted version's data
		await updateBrandMedia(platform.env.DB, newRevision.brandMediaId, {
			url: newRevision.url,
			r2Key: newRevision.r2Key,
			mimeType: newRevision.mimeType,
			fileSize: newRevision.fileSize,
			width: newRevision.width,
			height: newRevision.height,
			durationSeconds: newRevision.durationSeconds
		});

		// Log the revert
		await logMediaActivity(platform.env.DB, {
			brandProfileId,
			brandMediaId: newRevision.brandMediaId,
			userId: locals.user.id,
			action: 'revision_reverted',
			description: `Reverted to revision ${newRevision.changeNote?.replace('Reverted to revision ', '#') || 'previous'}`,
			details: { revisionId, newRevisionNumber: newRevision.revisionNumber },
			source: newRevision.source
		});

		return json({ revision: newRevision });
	}

	// Default: create a new revision
	const {
		brandMediaId,
		brandProfileId,
		url: assetUrl,
		r2Key,
		mimeType,
		fileSize,
		width,
		height,
		durationSeconds,
		source,
		changeNote
	} = body;
	if (!brandMediaId) throw error(400, 'brandMediaId required');
	if (!brandProfileId) throw error(400, 'brandProfileId required');

	const owningBrand = await brandOfMedia(platform.env.DB, brandMediaId);
	await requireAssetAccess(platform.env.DB, locals.user.id, owningBrand, 'write');
	if (brandProfileId !== owningBrand) throw error(404, 'Asset not found');

	const revision = await createMediaRevision(platform.env.DB, {
		brandMediaId,
		url: assetUrl,
		r2Key,
		mimeType,
		fileSize,
		width,
		height,
		durationSeconds,
		source: source || 'upload',
		userId: locals.user.id,
		changeNote
	});

	await logMediaActivity(platform.env.DB, {
		brandProfileId,
		brandMediaId,
		userId: locals.user.id,
		action: 'revision_created',
		description: `Created revision #${revision.revisionNumber}${changeNote ? ': ' + changeNote : ''}`,
		details: { revisionNumber: revision.revisionNumber, mimeType, fileSize },
		source: source || 'upload'
	});

	return json({ revision }, { status: 201 });
};
