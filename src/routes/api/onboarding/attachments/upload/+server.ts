/**
 * POST /api/onboarding/attachments/upload
 * Upload a file attachment for the Brand Architect chat.
 * Stores the file in R2 and creates a file_archive entry.
 * Returns the R2 key and a serve URL for immediate display.
 */
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { createFileArchiveEntry } from '$lib/services/file-archive';
import { requireStorage, resolvePlan } from '$lib/server/entitlements';
import { getAttachmentType } from '$lib/utils/attachments';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB || !platform?.env?.BUCKET) {
		throw error(500, 'Platform not available');
	}

	const formData = await request.formData();
	const file = formData.get('file') as File | null;
	const brandProfileId = formData.get('brandProfileId') as string | null;
	const onboardingStep = formData.get('onboardingStep') as string | null;
	const messageId = formData.get('messageId') as string | null;

	if (!file) throw error(400, 'No file provided');
	if (!brandProfileId) throw error(400, 'brandProfileId required');
	if (file.size > MAX_FILE_SIZE) throw error(400, 'File too large (max 100MB)');

	const fileType = getAttachmentType(file.type);
	if (!fileType) {
		throw error(400, `Unsupported file type: ${file.type}`);
	}

	// Same storage ceiling as /api/brand/assets/upload. Both doors have to be locked:
	// a 100MB-per-file limit with no total means a free account on 1 GB can walk past
	// it ten times, and chat attachments are the easier of the two to loop.
	const plan = await resolvePlan(platform.env.DB, locals.user.id);
	await requireStorage(platform.env.DB, locals.user.id, plan, file.size);

	// Generate R2 key with smart path
	const ext = file.name.split('.').pop() || 'bin';
	const timestamp = new Date().toISOString().slice(0, 10);
	const uniqueId = crypto.randomUUID().slice(0, 8);
	const r2Key = `archive/${brandProfileId}/onboarding/${fileType}s/${timestamp}_${uniqueId}.${ext}`;

	// Upload to R2
	const arrayBuffer = await file.arrayBuffer();
	await platform.env.BUCKET.put(r2Key, arrayBuffer, {
		httpMetadata: { contentType: file.type }
	});

	// Create file archive entry
	const entry = await createFileArchiveEntry(platform.env.DB, {
		brandProfileId,
		userId: locals.user.id,
		fileName: file.name,
		mimeType: file.type,
		fileSize: file.size,
		r2Key,
		fileType,
		source: 'user_upload',
		context: 'onboarding',
		onboardingStep: onboardingStep || undefined,
		messageId: messageId || undefined
	});

	return json(
		{
			id: entry.id,
			r2Key: entry.r2Key,
			fileName: entry.fileName,
			mimeType: entry.mimeType,
			fileSize: entry.fileSize,
			fileType: entry.fileType,
			url: `/api/archive/file?key=${encodeURIComponent(entry.r2Key)}`
		},
		{ status: 201 }
	);
};
