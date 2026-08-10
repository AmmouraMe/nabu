import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import {
	generateImage,
	generateAudio,
	requestAIVideoGeneration,
	getAIGeneration,
	getAIGenerationsByBrand,
	updateAIGenerationStatus,
	AI_IMAGE_MODELS,
	AI_AUDIO_MODELS,
	isWorkersAIModel,
	runWorkersAIImage
} from '$lib/services/ai-media-generation';
import { createBrandMedia } from '$lib/services/brand-assets';
import { logMediaActivity, createMediaRevision } from '$lib/services/media-history';
import { getEnabledVideoKey } from '$lib/services/video-registry';
import { getBrandProfile, buildBrandContextString } from '$lib/services/onboarding';
import { requireBrandAccess, resolveUserBrandRole } from '$lib/server/brand-access';
import type { AIGenerationProvider } from '$lib/types/brand-assets';

const ALLOWED_IMAGE_MODELS = new Set([
	'dall-e-2',
	'dall-e-3',
	...AI_IMAGE_MODELS.map((model) => model.id)
]);
const ALLOWED_AUDIO_MODELS = new Set([
	'tts-1',
	'tts-1-hd',
	...AI_AUDIO_MODELS.map((model) => model.id)
]);

/**
 * GET /api/brand/assets/generate
 * List AI generations for a brand, or get a specific generation by ID.
 *
 * Both forms are authorised against the brand: this route used to hand any
 * generation, and any brand's whole generation history, to any logged-in user who
 * named an id. Unreachable answers 404 rather than 403 so it cannot be used to
 * discover which ids exist.
 */
export const GET: RequestHandler = async ({ url, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB) throw error(500, 'Platform not available');

	const generationId = url.searchParams.get('id');
	if (generationId) {
		const generation = await getAIGeneration(platform.env.DB, generationId);
		if (!generation) throw error(404, 'Generation not found');
		const role = await resolveUserBrandRole(
			platform.env.DB,
			locals.user.id,
			generation.brandProfileId
		);
		// Same answer as a missing generation — the caller learns nothing either way.
		if (!role) throw error(404, 'Generation not found');
		return json({ generation });
	}

	const brandProfileId = url.searchParams.get('brandProfileId');
	if (!brandProfileId) throw error(400, 'brandProfileId required');

	await requireBrandAccess(platform.env.DB, locals.user.id, brandProfileId, 'read');

	const type = url.searchParams.get('type') as 'image' | 'audio' | 'video' | null;
	const generations = await getAIGenerationsByBrand(
		platform.env.DB,
		brandProfileId,
		type || undefined
	);

	return json({ generations });
};

/**
 * POST /api/brand/assets/generate
 * Start an AI generation job (image, audio, or video).
 */
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!platform?.env?.DB || !platform?.env?.KV) throw error(500, 'Platform not available');

	const body = await request.json();
	const { type, brandProfileId } = body;
	let prompt: string = body.prompt || '';

	if (!type || !['image', 'audio', 'video'].includes(type)) {
		throw error(400, 'Valid type required (image, audio, video)');
	}
	if (!brandProfileId) throw error(400, 'brandProfileId required');
	if (type === 'image' && body.model && !ALLOWED_IMAGE_MODELS.has(body.model)) {
		throw error(400, 'Unsupported image model');
	}
	if (type === 'audio' && body.model && !ALLOWED_AUDIO_MODELS.has(body.model)) {
		throw error(400, 'Unsupported audio model');
	}

	// Before anything is generated: this writes assets into the brand and spends the
	// AI budget, so it needs write access, not merely a session.
	await requireBrandAccess(platform.env.DB, locals.user.id, brandProfileId, 'write');

	// Audio is text-to-speech — the prompt IS the content, so it's always required
	if (type === 'audio' && !prompt.trim()) {
		throw error(400, 'prompt required');
	}

	// For image/video: enrich prompt with brand profile context
	if (type === 'image' || type === 'video') {
		try {
			const brandProfile = await getBrandProfile(platform.env.DB, brandProfileId);
			if (brandProfile) {
				const brandContext = buildBrandContextString(brandProfile);
				if (brandContext) {
					if (prompt.trim()) {
						// User provided a prompt — append brand context
						prompt = `${prompt.trim()}\n\nBrand context:\n${brandContext}`;
					} else {
						// No user prompt — build a default one from brand data
						const category = body.category || 'brand_elements';
						const brandName = brandProfile.brandName || 'the brand';
						prompt = `Create a professional ${category.replace(/_/g, ' ')} asset for ${brandName}.\n\nBrand context:\n${brandContext}`;
					}
				}
			}
		} catch {
			// If brand profile loading fails, continue with whatever prompt we have
		}

		// After enrichment, if we still have no prompt at all, use a generic fallback
		if (!prompt.trim()) {
			prompt = `Create a professional ${(body.category || 'brand_elements').replace(/_/g, ' ')} asset`;
		}
	}

	let generation;

	if (type === 'image') {
		// Workers AI runs on the account's `AI` binding, so it needs no API key at
		// all — only the OpenAI models do.
		const useWorkersAI = isWorkersAIModel(body.model);

		const apiKey = useWorkersAI ? null : await getOpenAIKey(platform);
		if (!useWorkersAI && !apiKey) {
			throw error(400, 'No OpenAI API key configured. Add one in Admin → AI Keys.');
		}

		generation = await generateImage(platform.env.DB, {
			brandProfileId,
			prompt,
			negativePrompt: body.negativePrompt,
			model: body.model,
			size: body.size,
			style: body.style,
			quality: body.quality,
			category: body.category || 'brand_elements',
			name: body.name || 'AI Generated Image'
		});

		// ── Workers AI (keyless) ──────────────────────────────────────────
		if (useWorkersAI) {
			const model = body.model as string;
			const [width, height] = (body.size || '1024x1024').split('x').map((n: string) => parseInt(n));

			try {
				// flux-1-schnell returns { image: <base64 jpeg> }; steps caps at 8.
				// Retries the nondeterministic NSFW false positives — see runWorkersAIImage.
				const result = await runWorkersAIImage(platform.env.AI, model, {
					prompt,
					steps: Math.min(Number(body.steps) || 4, 8)
				});

				if (!result?.image) {
					const errMsg = 'Workers AI returned no image';
					await updateAIGenerationStatus(platform.env.DB, generation.id, {
						status: 'failed',
						errorMessage: errMsg
					});
					return json(
						{ generation: { ...generation, status: 'failed', errorMessage: errMsg } },
						{ status: 200 }
					);
				}

				// base64 → bytes, without Buffer (not available on Workers).
				const binary = atob(result.image);
				const imageBuffer = new Uint8Array(binary.length);
				for (let i = 0; i < binary.length; i++) imageBuffer[i] = binary.charCodeAt(i);

				const r2Key = `brands/${brandProfileId}/image/${generation.id}.jpg`;
				await platform.env.BUCKET.put(r2Key, imageBuffer, {
					httpMetadata: { contentType: 'image/jpeg' }
				});

				const assetName = body.name || 'AI Generated Image';
				const media = await createBrandMedia(platform.env.DB, {
					brandProfileId,
					mediaType: 'image',
					category: body.category || 'brand_elements',
					name: assetName,
					description: `AI-generated: ${prompt}`,
					r2Key,
					mimeType: 'image/jpeg',
					fileSize: imageBuffer.byteLength,
					width,
					height,
					metadata: { aiGenerated: true, prompt, model }
				});

				// Free allocation covers this; cost stays 0 until the daily
				// Neuron budget is exhausted.
				await updateAIGenerationStatus(platform.env.DB, generation.id, {
					status: 'complete',
					r2Key,
					brandMediaId: media.id,
					cost: 0,
					progress: 100
				});

				await createMediaRevision(platform.env.DB, {
					brandMediaId: media.id,
					r2Key,
					mimeType: 'image/jpeg',
					fileSize: imageBuffer.byteLength,
					width,
					height,
					source: 'ai_generated',
					userId: locals.user.id,
					changeNote: `AI generated with ${model}: ${prompt.substring(0, 100)}`
				});

				await logMediaActivity(platform.env.DB, {
					brandProfileId,
					brandMediaId: media.id,
					userId: locals.user.id,
					action: 'ai_generated',
					description: `AI generated image: ${assetName}`,
					details: { model, prompt, cost: 0, size: `${width}x${height}` },
					source: 'ai_generated'
				});

				return json(
					{
						generation: {
							...generation,
							status: 'complete',
							r2Key,
							brandMediaId: media.id,
							cost: 0
						},
						media
					},
					{ status: 201 }
				);
			} catch (err) {
				const errMsg = err instanceof Error ? err.message : 'Workers AI generation failed';
				console.error('Workers AI image generation failed:', err);
				await updateAIGenerationStatus(platform.env.DB, generation.id, {
					status: 'failed',
					errorMessage: errMsg
				});
				return json(
					{ generation: { ...generation, status: 'failed', errorMessage: errMsg } },
					{ status: 200 }
				);
			}
		}

		// Actually call OpenAI DALL-E API
		try {
			const model = body.model || 'dall-e-3';
			const response = await fetch('https://api.openai.com/v1/images/generations', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${apiKey}`
				},
				body: JSON.stringify({
					model,
					prompt,
					n: 1,
					size: body.size || '1024x1024',
					style: body.style || 'vivid',
					quality: body.quality || 'standard',
					response_format: 'url'
				})
			});

			if (!response.ok) {
				const err = await response.json().catch(() => ({}));
				const errMsg =
					(err as Record<string, Record<string, string>>)?.error?.message ||
					`API error: ${response.status}`;
				await updateAIGenerationStatus(platform.env.DB, generation.id, {
					status: 'failed',
					errorMessage: errMsg
				});
				return json(
					{ generation: { ...generation, status: 'failed', errorMessage: errMsg } },
					{ status: 200 }
				);
			}

			const data = (await response.json()) as {
				data: Array<{ url: string; revised_prompt?: string }>;
			};

			const imageUrl = data.data[0]?.url;
			if (!imageUrl) {
				await updateAIGenerationStatus(platform.env.DB, generation.id, {
					status: 'failed',
					errorMessage: 'No image URL in response'
				});
				return json({ generation: { ...generation, status: 'failed' } });
			}

			// Download and store in R2
			const imageResponse = await fetch(imageUrl);
			const imageBuffer = await imageResponse.arrayBuffer();
			const r2Key = `brands/${brandProfileId}/image/${generation.id}.png`;

			await platform.env.BUCKET.put(r2Key, imageBuffer, {
				httpMetadata: { contentType: 'image/png' }
			});

			// Estimate cost
			const cost = model === 'dall-e-3' ? (body.quality === 'hd' ? 0.08 : 0.04) : 0.02;

			// Create the brand media asset
			const assetName = body.name || 'AI Generated Image';
			const media = await createBrandMedia(platform.env.DB, {
				brandProfileId,
				mediaType: 'image',
				category: body.category || 'brand_elements',
				name: assetName,
				description: `AI-generated: ${prompt}`,
				r2Key,
				mimeType: 'image/png',
				fileSize: imageBuffer.byteLength,
				width: parseInt((body.size || '1024x1024').split('x')[0]),
				height: parseInt((body.size || '1024x1024').split('x')[1]),
				metadata: { aiGenerated: true, prompt, model, revisedPrompt: data.data[0]?.revised_prompt }
			});

			// Update generation status
			await updateAIGenerationStatus(platform.env.DB, generation.id, {
				status: 'complete',
				resultUrl: imageUrl,
				r2Key,
				brandMediaId: media.id,
				cost,
				progress: 100
			});

			// Create revision
			await createMediaRevision(platform.env.DB, {
				brandMediaId: media.id,
				r2Key,
				mimeType: 'image/png',
				fileSize: imageBuffer.byteLength,
				width: parseInt((body.size || '1024x1024').split('x')[0]),
				height: parseInt((body.size || '1024x1024').split('x')[1]),
				source: 'ai_generated',
				userId: locals.user.id,
				changeNote: `AI generated with ${model}: ${prompt.substring(0, 100)}`
			});

			// Log activity
			await logMediaActivity(platform.env.DB, {
				brandProfileId,
				brandMediaId: media.id,
				userId: locals.user.id,
				action: 'ai_generated',
				description: `AI generated image: ${assetName}`,
				details: { model, prompt, cost, size: body.size || '1024x1024' },
				source: 'ai_generated'
			});

			return json(
				{
					generation: { ...generation, status: 'complete', r2Key, brandMediaId: media.id, cost },
					media
				},
				{ status: 201 }
			);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : 'Unknown error';
			await updateAIGenerationStatus(platform.env.DB, generation.id, {
				status: 'failed',
				errorMessage: errMsg
			});
			return json({ generation: { ...generation, status: 'failed', errorMessage: errMsg } });
		}
	} else if (type === 'audio') {
		// Audio generation requires an OpenAI key
		const apiKey = await getOpenAIKey(platform);
		if (!apiKey) {
			throw error(400, 'No OpenAI API key configured. Add one in Admin → AI Keys.');
		}

		generation = await generateAudio(platform.env.DB, {
			brandProfileId,
			prompt,
			model: body.model,
			voice: body.voice,
			speed: body.speed,
			responseFormat: body.responseFormat,
			category: body.category || 'voiceover',
			name: body.name || 'AI Generated Audio'
		});

		// Call OpenAI TTS API
		try {
			const model = body.model || 'tts-1';
			const voice = body.voice || 'alloy';
			const responseFormat = body.responseFormat || 'mp3';

			const response = await fetch('https://api.openai.com/v1/audio/speech', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${apiKey}`
				},
				body: JSON.stringify({
					model,
					input: prompt,
					voice,
					speed: body.speed || 1.0,
					response_format: responseFormat
				})
			});

			if (!response.ok) {
				const err = await response.json().catch(() => ({}));
				const errMsg =
					(err as Record<string, Record<string, string>>)?.error?.message ||
					`API error: ${response.status}`;
				await updateAIGenerationStatus(platform.env.DB, generation.id, {
					status: 'failed',
					errorMessage: errMsg
				});
				return json({ generation: { ...generation, status: 'failed', errorMessage: errMsg } });
			}

			const audioBuffer = await response.arrayBuffer();
			const mimeType =
				responseFormat === 'mp3'
					? 'audio/mpeg'
					: responseFormat === 'opus'
						? 'audio/opus'
						: responseFormat === 'aac'
							? 'audio/aac'
							: responseFormat === 'flac'
								? 'audio/flac'
								: 'audio/wav';

			const r2Key = `brands/${brandProfileId}/audio/${generation.id}.${responseFormat}`;
			await platform.env.BUCKET.put(r2Key, audioBuffer, {
				httpMetadata: { contentType: mimeType }
			});

			// Estimate cost (per 1M chars at $15/1M for tts-1, $30/1M for tts-1-hd)
			const charCount = prompt.length;
			const cost =
				model === 'tts-1-hd' ? (charCount / 1_000_000) * 30 : (charCount / 1_000_000) * 15;

			const assetName = body.name || 'AI Generated Audio';
			const media = await createBrandMedia(platform.env.DB, {
				brandProfileId,
				mediaType: 'audio',
				category: body.category || 'voiceover',
				name: assetName,
				description: `AI-generated TTS: ${prompt.substring(0, 200)}`,
				r2Key,
				mimeType,
				fileSize: audioBuffer.byteLength,
				metadata: { aiGenerated: true, prompt, model, voice }
			});

			await updateAIGenerationStatus(platform.env.DB, generation.id, {
				status: 'complete',
				r2Key,
				brandMediaId: media.id,
				cost,
				progress: 100
			});

			await createMediaRevision(platform.env.DB, {
				brandMediaId: media.id,
				r2Key,
				mimeType,
				fileSize: audioBuffer.byteLength,
				source: 'ai_generated',
				userId: locals.user.id,
				changeNote: `AI generated with ${model} (${voice}): ${prompt.substring(0, 100)}`
			});

			await logMediaActivity(platform.env.DB, {
				brandProfileId,
				brandMediaId: media.id,
				userId: locals.user.id,
				action: 'ai_generated',
				description: `AI generated audio: ${assetName}`,
				details: { model, voice, prompt, cost },
				source: 'ai_generated'
			});

			return json(
				{
					generation: { ...generation, status: 'complete', r2Key, brandMediaId: media.id, cost },
					media
				},
				{ status: 201 }
			);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : 'Unknown error';
			await updateAIGenerationStatus(platform.env.DB, generation.id, {
				status: 'failed',
				errorMessage: errMsg
			});
			return json({ generation: { ...generation, status: 'failed', errorMessage: errMsg } });
		}
	} else {
		// Video — validate that a video-capable key exists for the requested provider
		const videoKey = await getEnabledVideoKey(platform, body.provider || undefined);
		if (!videoKey) {
			throw error(
				400,
				'No video API key configured. Add one in Admin → AI Keys and enable Video Generation.'
			);
		}
		const videoProvider = videoKey.provider as AIGenerationProvider;

		// Save the generation record — actual generation uses existing video pipeline
		generation = await requestAIVideoGeneration(platform.env.DB, {
			brandProfileId,
			prompt,
			model: body.model,
			provider: videoProvider,
			aspectRatio: body.aspectRatio,
			duration: body.duration,
			resolution: body.resolution,
			category: body.category || 'brand',
			name: body.name || 'AI Generated Video'
		});

		await logMediaActivity(platform.env.DB, {
			brandProfileId,
			userId: locals.user.id,
			action: 'ai_generated',
			description: `Requested AI video generation: ${body.name || 'AI Generated Video'}`,
			details: { prompt, model: body.model, provider: body.provider },
			source: 'ai_generated'
		});

		return json({ generation }, { status: 201 });
	}
};

/**
 * Get available AI generation models
 */
export const PUT: RequestHandler = async ({ platform, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	return json({
		imageModels: AI_IMAGE_MODELS,
		audioModels: AI_AUDIO_MODELS
	});
};

// ─── Helpers ─────────────────────────────────────────────────────

async function getOpenAIKey(platform: App.Platform): Promise<string | null> {
	try {
		const keysList = await platform.env.KV.get('ai_keys_list');
		if (!keysList) return null;

		const keyIds = JSON.parse(keysList);
		for (const keyId of keyIds) {
			const keyData = await platform.env.KV.get(`ai_key:${keyId}`);
			if (keyData) {
				const key = JSON.parse(keyData);
				if (key.enabled !== false && key.provider === 'openai') {
					return key.apiKey;
				}
			}
		}
		return null;
	} catch {
		return null;
	}
}
