/**
 * POST /api/archive/ai-save
 * Save AI-generated content (images, audio, etc.) to the file archive.
 * Called when the AI generates media that should be preserved.
 */
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { createFileArchiveEntry } from '$lib/services/file-archive';
import type { FileType, FileContext } from '$lib/services/file-archive';

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB || !platform?.env?.BUCKET) {
		throw error(500, 'Platform not available');
	}

	const body = await request.json();
	const {
		brandProfileId,
		sourceUrl,
		fileName,
		fileType,
		context,
		conversationId,
		messageId,
		onboardingStep,
		aiPrompt,
		aiModel,
		aiGenerationId,
		description
	} = body;

	if (!brandProfileId) throw error(400, 'brandProfileId required');
	if (!sourceUrl) throw error(400, 'sourceUrl required');
	if (!fileName) throw error(400, 'fileName required');
	if (!fileType) throw error(400, 'fileType required');

	// Fetch the generated content from the source URL
	let contentBuffer: ArrayBuffer;
	let mimeType = 'application/octet-stream';

	if (sourceUrl.startsWith('data:')) {
		// Handle data URL (base64 encoded)
		const matches = sourceUrl.match(/^data:([^;]+);base64,(.+)$/);
		if (!matches) throw error(400, 'Invalid data URL');
		mimeType = matches[1];
		const binaryString = atob(matches[2]);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}
		contentBuffer = bytes.buffer;
	} else {
		// Fetch from external URL (e.g., DALL-E output URL)
		const response = await fetch(sourceUrl);
		if (!response.ok) throw error(502, 'Failed to fetch generated content');
		mimeType = response.headers.get('content-type') || mimeType;
		contentBuffer = await response.arrayBuffer();
	}

	// Determine extension from mimeType
	const extMap: Record<string, string> = {
		'image/png': 'png',
		'image/jpeg': 'jpg',
		'image/webp': 'webp',
		'image/gif': 'gif',
		'audio/mpeg': 'mp3',
		'audio/mp4': 'm4a',
		'audio/wav': 'wav',
		'video/mp4': 'mp4',
		'video/webm': 'webm'
	};
	const ext = extMap[mimeType] || fileName.split('.').pop() || 'bin';

	// Generate R2 key
	const timestamp = new Date().toISOString().slice(0, 10);
	const uniqueId = crypto.randomUUID().slice(0, 8);
	const ctxPath = context || 'chat';
	const r2Key = `archive/${brandProfileId}/ai-generated/${fileType}s/${timestamp}_${uniqueId}.${ext}`;

	// Upload to R2
	await platform.env.BUCKET.put(r2Key, contentBuffer, {
		httpMetadata: { contentType: mimeType }
	});

	// Create file archive entry
	const entry = await createFileArchiveEntry(platform.env.DB, {
		brandProfileId,
		userId: locals.user.id,
		fileName,
		mimeType,
		fileSize: contentBuffer.byteLength,
		r2Key,
		fileType: fileType as FileType,
		source: 'ai_generated',
		context: (context as FileContext) || 'chat',
		conversationId: conversationId || undefined,
		messageId: messageId || undefined,
		onboardingStep: onboardingStep || undefined,
		aiPrompt: aiPrompt || undefined,
		aiModel: aiModel || undefined,
		aiGenerationId: aiGenerationId || undefined,
		description: description || undefined
	});

	return json(
		{
			id: entry.id,
			r2Key: entry.r2Key,
			url: `/api/archive/file?key=${encodeURIComponent(entry.r2Key)}`,
			fileName: entry.fileName,
			fileType: entry.fileType,
			folder: entry.folder
		},
		{ status: 201 }
	);
};
