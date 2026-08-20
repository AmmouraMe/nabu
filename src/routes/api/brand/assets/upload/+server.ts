import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { requireBrandAccess } from '$lib/server/brand-access';
import { requireStorage, resolvePlan } from '$lib/server/entitlements';

/**
 * POST /api/brand/assets/upload
 * Upload a file to R2 and create a brand media asset with revision tracking.
 */
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB || !platform?.env?.BUCKET) throw error(500, 'Platform not available');

	const formData = await request.formData();
	const file = formData.get('file') as File | null;
	const brandProfileId = formData.get('brandProfileId') as string | null;
	const mediaType = formData.get('mediaType') as string | null;
	const category = formData.get('category') as string | null;
	const name = formData.get('name') as string | null;
	const description = formData.get('description') as string | null;
	const isPrimary = formData.get('isPrimary') === 'true';

	if (!file) throw error(400, 'No file provided');
	if (!brandProfileId) throw error(400, 'brandProfileId required');
	if (!mediaType || !['image', 'audio', 'video'].includes(mediaType)) {
		throw error(400, 'Valid mediaType required (image, audio, video)');
	}
	if (!category) throw error(400, 'category required');

	// Before the object is written: the R2 key is built from `brandProfileId`, so an
	// unauthorised call would plant a file inside another brand's namespace.
	await requireBrandAccess(platform.env.DB, locals.user.id, brandProfileId, 'write');

	// Storage is a ceiling on what is currently held, not a monthly spend, so it is
	// measured against the live total and checked before the `put` — R2 has no undo
	// that leaves the quota consistent, and a rejected upload that already landed
	// would count against the user until something else deleted it.
	const plan = await resolvePlan(platform.env.DB, locals.user.id);
	await requireStorage(platform.env.DB, locals.user.id, plan, file.size);

	const assetName = name || file.name;

	// Generate R2 key
	const ext = file.name.split('.').pop() || 'bin';
	const r2Key = `brands/${brandProfileId}/${mediaType}/${crypto.randomUUID()}.${ext}`;

	// Upload to R2
	const arrayBuffer = await file.arrayBuffer();
	await platform.env.BUCKET.put(r2Key, arrayBuffer, {
		httpMetadata: { contentType: file.type }
	});

	// Create the media asset record
	const { createBrandMedia } = await import('$lib/services/brand-assets');
	const media = await createBrandMedia(platform.env.DB, {
		brandProfileId,
		mediaType: mediaType as 'image' | 'audio' | 'video',
		category,
		name: assetName,
		description: description || undefined,
		r2Key,
		mimeType: file.type,
		fileSize: file.size,
		isPrimary
	});

	// Create initial revision
	const { createMediaRevision } = await import('$lib/services/media-history');
	await createMediaRevision(platform.env.DB, {
		brandMediaId: media.id,
		r2Key,
		mimeType: file.type,
		fileSize: file.size,
		source: 'upload',
		userId: locals.user.id,
		changeNote: 'Initial upload'
	});

	// Log the activity
	const { logMediaActivity } = await import('$lib/services/media-history');
	await logMediaActivity(platform.env.DB, {
		brandProfileId,
		brandMediaId: media.id,
		userId: locals.user.id,
		action: 'uploaded',
		description: `Uploaded ${mediaType}: ${assetName}`,
		details: { fileName: file.name, fileSize: file.size, mimeType: file.type },
		source: 'upload'
	});

	return json({ media }, { status: 201 });
};
