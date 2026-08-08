import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { getEnabledVideoKey, getVideoProvider } from '$lib/services/video-registry';
import { calculateVideoCostFromPricing } from '$lib/utils/cost';

/**
 * POST /api/video/generate
 * Start a video generation job
 */
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!platform?.env) {
		throw error(500, 'Platform not available');
	}

	const body = await request.json();
	const {
		prompt,
		model,
		aspectRatio,
		duration,
		resolution,
		conversationId,
		messageId,
		provider: preferredProvider
	} = body as {
		prompt: string;
		model?: string;
		aspectRatio?: '16:9' | '9:16' | '1:1';
		duration?: number;
		resolution?: string;
		conversationId?: string;
		messageId?: string;
		provider?: string;
	};

	if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
		throw error(400, 'Prompt is required');
	}

	if (prompt.length > 4000) {
		throw error(400, 'Prompt too long (max 4000 characters)');
	}

	// Get an enabled video API key, preferring the user-selected provider
	const videoKey = await getEnabledVideoKey(platform, preferredProvider);
	if (!videoKey) {
		throw error(503, 'No video generation provider is currently available');
	}

	const provider = getVideoProvider(videoKey.provider);
	if (!provider) {
		throw error(503, `Video provider "${videoKey.provider}" is not supported`);
	}

	const selectedModel = model || provider.getAvailableModels()[0]?.id || 'sora-2';

	// Generate a generation ID for tracking
	const generationId = crypto.randomUUID();

	// Validate duration — allow reasonable video durations (provider will enforce its own limits)
	const validDurations = [4, 5, 8, 10, 12];
	const videoDuration = duration && validDurations.includes(duration) ? duration : undefined;

	// Start video generation
	const result = await provider.generateVideo(videoKey.apiKey, {
		prompt: prompt.trim(),
		model: selectedModel,
		aspectRatio: aspectRatio || '16:9',
		duration: videoDuration,
		resolution: resolution || undefined
	});

	if (result.status === 'error') {
		// Store the failed generation record
		try {
			await platform.env.DB.prepare(
				`INSERT INTO video_generations (id, user_id, message_id, conversation_id, prompt, provider, model, status, error, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, 'error', ?, datetime('now'))`
			)
				.bind(
					generationId,
					locals.user.id,
					messageId || null,
					conversationId || null,
					prompt.trim(),
					videoKey.provider,
					selectedModel,
					result.error || 'Unknown error'
				)
				.run();
		} catch {
			// Don't fail the request if DB logging fails
		}

		throw error(502, result.error || 'Video generation failed');
	}

	// Store the generation record
	// Map provider status to DB-allowed values: 'pending', 'generating', 'complete', 'error'
	const dbStatus =
		result.status === 'queued'
			? 'pending'
			: result.status === 'processing'
				? 'generating'
				: result.status === 'complete'
					? 'complete'
					: 'pending';

	// Calculate cost if the video completed immediately
	let generationCost = 0;
	if (dbStatus === 'complete') {
		try {
			const modelInfo = provider.getAvailableModels().find((m) => m.id === selectedModel);
			if (modelInfo?.pricing) {
				generationCost = calculateVideoCostFromPricing(
					modelInfo.pricing,
					result.duration || 0,
					resolution || undefined
				);
			}
		} catch {
			// Non-critical: default to 0 if pricing lookup fails
		}
	}

	try {
		await platform.env.DB.prepare(
			`INSERT INTO video_generations (id, user_id, message_id, conversation_id, prompt, provider, provider_job_id, model, status, video_url, aspect_ratio, resolution, duration_seconds, cost, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
		)
			.bind(
				generationId,
				locals.user.id,
				messageId || null,
				conversationId || null,
				prompt.trim(),
				videoKey.provider,
				result.providerJobId,
				selectedModel,
				dbStatus,
				result.videoUrl || null,
				aspectRatio || '16:9',
				resolution || null,
				result.duration || videoDuration || null,
				generationCost
			)
			.run();
	} catch (err) {
		console.error('Failed to store video generation record:', err);
	}

	// If video completed immediately, update the message with the URL
	if (result.status === 'complete' && result.videoUrl && messageId && conversationId) {
		try {
			await platform.env.DB.prepare(
				`UPDATE chat_messages
				 SET media_status = 'complete', media_url = ?, media_type = 'video'
				 WHERE id = ? AND conversation_id = ?`
			)
				.bind(result.videoUrl, messageId, conversationId)
				.run();
		} catch {
			// Non-critical
		}
	}

	return json({
		id: generationId,
		status: result.status,
		providerJobId: result.providerJobId,
		videoUrl: result.videoUrl || null,
		thumbnailUrl: result.thumbnailUrl || null
	});
};
