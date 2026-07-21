/**
 * AI Media Generation Service
 * Manages AI-powered generation of images, audio, and videos for brands.
 * Tracks generation jobs, providers, costs, and links results to brand media assets.
 */

import type { D1Database } from '@cloudflare/workers-types';
import type {
	AIMediaGeneration,
	AIImageGenerationParams,
	AIAudioGenerationParams,
	AIVideoGenerationParams,
	AIGenerationStatus,
	AIGenerationType,
	AIGenerationProvider
} from '$lib/types/brand-assets';

// Re-export types for test imports
export type { AIMediaGeneration };

// ─── AI Model Definitions ────────────────────────────────────────

export interface AIModel {
	id: string;
	displayName: string;
	provider: string;
	type: AIGenerationType;
	description: string;
	supportedSizes?: string[];
	pricing?: {
		estimatedCostPerGeneration?: number;
		currency: string;
	};
}

/** Available AI image generation models */
export const AI_IMAGE_MODELS: AIModel[] = [
	{
		id: 'dall-e-3',
		displayName: 'DALL·E 3',
		provider: 'openai',
		type: 'image',
		description: 'High-quality image generation with excellent prompt understanding',
		supportedSizes: ['1024x1024', '1792x1024', '1024x1792'],
		pricing: { estimatedCostPerGeneration: 0.04, currency: 'USD' }
	},
	{
		id: 'dall-e-2',
		displayName: 'DALL·E 2',
		provider: 'openai',
		type: 'image',
		description: 'Fast image generation, good for iterations',
		supportedSizes: ['256x256', '512x512', '1024x1024'],
		pricing: { estimatedCostPerGeneration: 0.02, currency: 'USD' }
	}
];

/** Available AI audio generation models */
export const AI_AUDIO_MODELS: AIModel[] = [
	{
		id: 'tts-1',
		displayName: 'TTS-1',
		provider: 'openai',
		type: 'audio',
		description: 'Fast text-to-speech, optimized for real-time use',
		pricing: { estimatedCostPerGeneration: 0.015, currency: 'USD' }
	},
	{
		id: 'tts-1-hd',
		displayName: 'TTS-1 HD',
		provider: 'openai',
		type: 'audio',
		description: 'High-definition text-to-speech with superior audio quality',
		pricing: { estimatedCostPerGeneration: 0.03, currency: 'USD' }
	}
];

// ─── Row Mapper ──────────────────────────────────────────────────

function mapRowToGeneration(row: Record<string, unknown>): AIMediaGeneration {
	return {
		id: row.id as string,
		brandProfileId: row.brand_profile_id as string,
		brandMediaId: (row.brand_media_id as string) || undefined,
		generationType: row.generation_type as AIGenerationType,
		provider: row.provider as AIGenerationProvider,
		model: row.model as string,
		prompt: row.prompt as string,
		negativePrompt: (row.negative_prompt as string) || undefined,
		status: row.status as AIGenerationStatus,
		providerJobId: (row.provider_job_id as string) || undefined,
		resultUrl: (row.result_url as string) || undefined,
		r2Key: (row.r2_key as string) || undefined,
		cost: (row.cost as number) || undefined,
		errorMessage: (row.error_message as string) || undefined,
		parameters: row.parameters ? JSON.parse(row.parameters as string) : undefined,
		progress: (row.progress as number) || 0,
		createdAt: row.created_at as string,
		completedAt: (row.completed_at as string) || undefined
	};
}

// ─── Image Generation ────────────────────────────────────────────

/**
 * Create an AI image generation job record.
 * The actual API call to the AI provider is handled separately by the API route.
 */
export async function generateImage(
	db: D1Database,
	params: AIImageGenerationParams
): Promise<AIMediaGeneration> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	const model = params.model || 'dall-e-3';
	const provider = 'openai';

	const parameters: Record<string, unknown> = {};
	if (params.size) parameters.size = params.size;
	if (params.style) parameters.style = params.style;
	if (params.quality) parameters.quality = params.quality;
	if (params.category) parameters.category = params.category;
	if (params.name) parameters.name = params.name;

	const parametersStr = Object.keys(parameters).length > 0 ? JSON.stringify(parameters) : null;

	await db
		.prepare(
			`INSERT INTO ai_media_generations
       (id, brand_profile_id, generation_type, provider, model, prompt, negative_prompt,
        status, parameters, created_at)
       VALUES (?, ?, 'image', ?, ?, ?, ?, 'pending', ?, ?)`
		)
		.bind(
			id,
			params.brandProfileId,
			provider,
			model,
			params.prompt,
			params.negativePrompt ?? null,
			parametersStr,
			now
		)
		.run();

	return {
		id,
		brandProfileId: params.brandProfileId,
		generationType: 'image',
		provider,
		model,
		prompt: params.prompt,
		negativePrompt: params.negativePrompt,
		status: 'pending',
		parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
		progress: 0,
		createdAt: now
	};
}

// ─── Audio Generation ────────────────────────────────────────────

/**
 * Create an AI audio generation (TTS) job record.
 */
export async function generateAudio(
	db: D1Database,
	params: AIAudioGenerationParams
): Promise<AIMediaGeneration> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	const model = params.model || 'tts-1';
	const provider = 'openai';

	const parameters: Record<string, unknown> = {
		voice: params.voice || 'alloy'
	};
	if (params.speed) parameters.speed = params.speed;
	if (params.responseFormat) parameters.responseFormat = params.responseFormat;
	if (params.category) parameters.category = params.category;
	if (params.name) parameters.name = params.name;

	const parametersStr = JSON.stringify(parameters);

	await db
		.prepare(
			`INSERT INTO ai_media_generations
       (id, brand_profile_id, generation_type, provider, model, prompt, status, parameters, created_at)
       VALUES (?, ?, 'audio', ?, ?, ?, 'pending', ?, ?)`
		)
		.bind(id, params.brandProfileId, provider, model, params.prompt, parametersStr, now)
		.run();

	return {
		id,
		brandProfileId: params.brandProfileId,
		generationType: 'audio',
		provider,
		model,
		prompt: params.prompt,
		status: 'pending',
		parameters,
		progress: 0,
		createdAt: now
	};
}

// ─── Video Generation ────────────────────────────────────────────

/**
 * Create an AI video generation job record.
 */
export async function requestAIVideoGeneration(
	db: D1Database,
	params: AIVideoGenerationParams
): Promise<AIMediaGeneration> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	const provider = params.provider || 'openai';
	const model = params.model || 'sora-2';

	const parameters: Record<string, unknown> = {};
	if (params.aspectRatio) parameters.aspectRatio = params.aspectRatio;
	if (params.duration) parameters.duration = params.duration;
	if (params.resolution) parameters.resolution = params.resolution;
	if (params.category) parameters.category = params.category;
	if (params.name) parameters.name = params.name;

	const parametersStr = Object.keys(parameters).length > 0 ? JSON.stringify(parameters) : null;

	await db
		.prepare(
			`INSERT INTO ai_media_generations
       (id, brand_profile_id, generation_type, provider, model, prompt, status, parameters, created_at)
       VALUES (?, ?, 'video', ?, ?, ?, 'pending', ?, ?)`
		)
		.bind(id, params.brandProfileId, provider, model, params.prompt, parametersStr, now)
		.run();

	return {
		id,
		brandProfileId: params.brandProfileId,
		generationType: 'video',
		provider,
		model,
		prompt: params.prompt,
		status: 'pending',
		parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
		progress: 0,
		createdAt: now
	};
}

// ─── Generation CRUD ─────────────────────────────────────────────

/**
 * Get an AI generation by ID.
 */
export async function getAIGeneration(
	db: D1Database,
	generationId: string
): Promise<AIMediaGeneration | null> {
	const row = await db
		.prepare('SELECT * FROM ai_media_generations WHERE id = ?')
		.bind(generationId)
		.first();

	if (!row) return null;
	return mapRowToGeneration(row as Record<string, unknown>);
}

/**
 * Get all AI generations for a brand, optionally filtered by type.
 */
export async function getAIGenerationsByBrand(
	db: D1Database,
	brandProfileId: string,
	generationType?: AIGenerationType
): Promise<AIMediaGeneration[]> {
	let query: string;
	let bindValues: unknown[];

	if (generationType) {
		query = `SELECT * FROM ai_media_generations
             WHERE brand_profile_id = ? AND generation_type = ?
             ORDER BY created_at DESC`;
		bindValues = [brandProfileId, generationType];
	} else {
		query = `SELECT * FROM ai_media_generations
             WHERE brand_profile_id = ?
             ORDER BY created_at DESC`;
		bindValues = [brandProfileId];
	}

	const result = await db
		.prepare(query)
		.bind(...bindValues)
		.all();
	return (result.results || []).map((row) => mapRowToGeneration(row as Record<string, unknown>));
}

/**
 * Update the status of an AI generation job.
 */
export async function updateAIGenerationStatus(
	db: D1Database,
	generationId: string,
	updates: {
		status: AIGenerationStatus;
		providerJobId?: string;
		resultUrl?: string;
		r2Key?: string;
		brandMediaId?: string;
		cost?: number;
		errorMessage?: string;
		progress?: number;
	}
): Promise<void> {
	const sets: string[] = ['status = ?'];
	const values: unknown[] = [updates.status];

	if (updates.providerJobId !== undefined) {
		sets.push('provider_job_id = ?');
		values.push(updates.providerJobId);
	}
	if (updates.resultUrl !== undefined) {
		sets.push('result_url = ?');
		values.push(updates.resultUrl);
	}
	if (updates.r2Key !== undefined) {
		sets.push('r2_key = ?');
		values.push(updates.r2Key);
	}
	if (updates.brandMediaId !== undefined) {
		sets.push('brand_media_id = ?');
		values.push(updates.brandMediaId);
	}
	if (updates.cost !== undefined) {
		sets.push('cost = ?');
		values.push(updates.cost);
	}
	if (updates.errorMessage !== undefined) {
		sets.push('error_message = ?');
		values.push(updates.errorMessage);
	}
	if (updates.progress !== undefined) {
		sets.push('progress = ?');
		values.push(updates.progress);
	}

	// Set completed_at when status is terminal
	if (updates.status === 'complete' || updates.status === 'failed') {
		sets.push("completed_at = datetime('now')");
	}

	values.push(generationId);

	await db
		.prepare(`UPDATE ai_media_generations SET ${sets.join(', ')} WHERE id = ?`)
		.bind(...values)
		.run();
}
