/**
 * Cost Calculation Utility
 * Calculates costs for OpenAI API usage (text, voice, and video)
 */

import { getVideoProvider } from '$lib/services/video-registry';

// OpenAI pricing per 1M tokens (as of February 2026)
// Source: https://developers.openai.com/api/docs/pricing
export const MODEL_PRICING: Record<
	string,
	{
		inputPer1M: number;
		outputPer1M: number;
		type: 'text' | 'voice' | 'video';
		displayName: string;
	}
> = {
	// GPT-5.2 (latest flagship)
	'gpt-5.2': {
		inputPer1M: 1.75,
		outputPer1M: 14.0,
		type: 'text',
		displayName: 'GPT-5.2'
	},
	'gpt-5.2-pro': {
		inputPer1M: 21.0,
		outputPer1M: 168.0,
		type: 'text',
		displayName: 'GPT-5.2 Pro'
	},
	// GPT-5.1
	'gpt-5.1': {
		inputPer1M: 1.25,
		outputPer1M: 10.0,
		type: 'text',
		displayName: 'GPT-5.1'
	},
	// GPT-5 models
	'gpt-5': {
		inputPer1M: 1.25,
		outputPer1M: 10.0,
		type: 'text',
		displayName: 'GPT-5'
	},
	'gpt-5-mini': {
		inputPer1M: 0.25,
		outputPer1M: 2.0,
		type: 'text',
		displayName: 'GPT-5 mini'
	},
	'gpt-5-nano': {
		inputPer1M: 0.05,
		outputPer1M: 0.4,
		type: 'text',
		displayName: 'GPT-5 nano'
	},
	'gpt-5-pro': {
		inputPer1M: 15.0,
		outputPer1M: 120.0,
		type: 'text',
		displayName: 'GPT-5 Pro'
	},
	// GPT-4.1 models
	'gpt-4.1': {
		inputPer1M: 2.0,
		outputPer1M: 8.0,
		type: 'text',
		displayName: 'GPT-4.1'
	},
	'gpt-4.1-mini': {
		inputPer1M: 0.4,
		outputPer1M: 1.6,
		type: 'text',
		displayName: 'GPT-4.1 mini'
	},
	'gpt-4.1-nano': {
		inputPer1M: 0.1,
		outputPer1M: 0.4,
		type: 'text',
		displayName: 'GPT-4.1 nano'
	},
	// GPT-4o models
	'gpt-4o': {
		inputPer1M: 2.5,
		outputPer1M: 10.0,
		type: 'text',
		displayName: 'GPT-4o'
	},
	'gpt-4o-2024-11-20': {
		inputPer1M: 2.5,
		outputPer1M: 10.0,
		type: 'text',
		displayName: 'GPT-4o'
	},
	'gpt-4o-2024-08-06': {
		inputPer1M: 2.5,
		outputPer1M: 10.0,
		type: 'text',
		displayName: 'GPT-4o'
	},
	// GPT-4o mini
	'gpt-4o-mini': {
		inputPer1M: 0.15,
		outputPer1M: 0.6,
		type: 'text',
		displayName: 'GPT-4o mini'
	},
	'gpt-4o-mini-2024-07-18': {
		inputPer1M: 0.15,
		outputPer1M: 0.6,
		type: 'text',
		displayName: 'GPT-4o mini'
	},
	// o4-mini (reasoning)
	'o4-mini': {
		inputPer1M: 1.1,
		outputPer1M: 4.4,
		type: 'text',
		displayName: 'o4-mini'
	},
	// o3 models (reasoning)
	o3: {
		inputPer1M: 2.0,
		outputPer1M: 8.0,
		type: 'text',
		displayName: 'o3'
	},
	'o3-pro': {
		inputPer1M: 20.0,
		outputPer1M: 80.0,
		type: 'text',
		displayName: 'o3 Pro'
	},
	'o3-mini': {
		inputPer1M: 1.1,
		outputPer1M: 4.4,
		type: 'text',
		displayName: 'o3 mini'
	},
	// o1 models (reasoning)
	o1: {
		inputPer1M: 15.0,
		outputPer1M: 60.0,
		type: 'text',
		displayName: 'o1'
	},
	'o1-pro': {
		inputPer1M: 150.0,
		outputPer1M: 600.0,
		type: 'text',
		displayName: 'o1 Pro'
	},
	'o1-mini': {
		inputPer1M: 1.1,
		outputPer1M: 4.4,
		type: 'text',
		displayName: 'o1 mini'
	},
	// GPT-4 Turbo (legacy)
	'gpt-4-turbo': {
		inputPer1M: 10.0,
		outputPer1M: 30.0,
		type: 'text',
		displayName: 'GPT-4 Turbo'
	},
	'gpt-4-turbo-2024-04-09': {
		inputPer1M: 10.0,
		outputPer1M: 30.0,
		type: 'text',
		displayName: 'GPT-4 Turbo'
	},
	// GPT-4 (legacy)
	'gpt-4': {
		inputPer1M: 30.0,
		outputPer1M: 60.0,
		type: 'text',
		displayName: 'GPT-4'
	},
	// GPT-3.5 Turbo (legacy)
	'gpt-3.5-turbo': {
		inputPer1M: 0.5,
		outputPer1M: 1.5,
		type: 'text',
		displayName: 'GPT-3.5 Turbo'
	},
	'gpt-3.5-turbo-0125': {
		inputPer1M: 0.5,
		outputPer1M: 1.5,
		type: 'text',
		displayName: 'GPT-3.5 Turbo'
	},
	// Realtime API (voice) — text token pricing per 1M
	'gpt-realtime': {
		inputPer1M: 4.0,
		outputPer1M: 16.0,
		type: 'voice',
		displayName: 'GPT Realtime'
	},
	'gpt-realtime-mini': {
		inputPer1M: 0.6,
		outputPer1M: 2.4,
		type: 'voice',
		displayName: 'GPT Realtime mini'
	},
	'gpt-4o-realtime-preview': {
		inputPer1M: 5.0,
		outputPer1M: 20.0,
		type: 'voice',
		displayName: 'GPT-4o Realtime'
	},
	'gpt-4o-realtime-preview-2024-10-01': {
		inputPer1M: 5.0,
		outputPer1M: 20.0,
		type: 'voice',
		displayName: 'GPT-4o Realtime'
	},
	'gpt-4o-realtime-preview-2024-12-17': {
		inputPer1M: 5.0,
		outputPer1M: 20.0,
		type: 'voice',
		displayName: 'GPT-4o Realtime'
	},
	'gpt-4o-mini-realtime-preview': {
		inputPer1M: 0.6,
		outputPer1M: 2.4,
		type: 'voice',
		displayName: 'GPT-4o mini Realtime'
	},
	'gpt-4o-mini-realtime-preview-2024-12-17': {
		inputPer1M: 0.6,
		outputPer1M: 2.4,
		type: 'voice',
		displayName: 'GPT-4o mini Realtime'
	},
	// ── Anthropic Claude models ──
	'claude-sonnet-4-20250514': {
		inputPer1M: 3.0,
		outputPer1M: 15.0,
		type: 'text' as const,
		displayName: 'Claude Sonnet 4'
	},
	'claude-3-5-sonnet-20241022': {
		inputPer1M: 3.0,
		outputPer1M: 15.0,
		type: 'text' as const,
		displayName: 'Claude 3.5 Sonnet'
	},
	'claude-3-5-sonnet-latest': {
		inputPer1M: 3.0,
		outputPer1M: 15.0,
		type: 'text' as const,
		displayName: 'Claude 3.5 Sonnet'
	},
	'claude-3-opus-20240229': {
		inputPer1M: 15.0,
		outputPer1M: 75.0,
		type: 'text' as const,
		displayName: 'Claude 3 Opus'
	},
	'claude-3-haiku-20240307': {
		inputPer1M: 0.25,
		outputPer1M: 1.25,
		type: 'text' as const,
		displayName: 'Claude 3 Haiku'
	},
	'claude-3-5-haiku-20241022': {
		inputPer1M: 1.0,
		outputPer1M: 5.0,
		type: 'text' as const,
		displayName: 'Claude 3.5 Haiku'
	}
};

// Default pricing for unknown models (use gpt-4o pricing as fallback)
const DEFAULT_PRICING = {
	inputPer1M: 2.5,
	outputPer1M: 10.0,
	type: 'text' as const,
	displayName: 'Unknown Model'
};

export interface TokenUsage {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
}

export interface CostResult {
	inputCost: number;
	outputCost: number;
	totalCost: number;
	model: string;
	displayName: string;
	usage: TokenUsage;
}

/**
 * Calculate the cost for a given model and token usage
 */
export function calculateCost(
	model: string,
	inputTokens: number,
	outputTokens: number
): CostResult {
	const pricing = MODEL_PRICING[model] || DEFAULT_PRICING;

	const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
	const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;
	const totalCost = inputCost + outputCost;

	return {
		inputCost,
		outputCost,
		totalCost,
		model,
		displayName: pricing.displayName,
		usage: {
			inputTokens,
			outputTokens,
			totalTokens: inputTokens + outputTokens
		}
	};
}

/**
 * Format cost for display (e.g., "$0.0012" or "<$0.0001")
 */
export function formatCost(cost: number): string {
	if (cost === 0) {
		return '$0.00';
	}
	if (cost < 0.0001) {
		return '<$0.0001';
	}
	if (cost < 0.01) {
		return `$${cost.toFixed(4)}`;
	}
	return `$${cost.toFixed(2)}`;
}

/**
 * Format cost with full details for tooltip
 */
export function formatCostDetails(result: CostResult): string {
	const lines = [
		`Model: ${result.displayName}`,
		`Input: ${result.usage.inputTokens.toLocaleString()} tokens (${formatCost(result.inputCost)})`,
		`Output: ${result.usage.outputTokens.toLocaleString()} tokens (${formatCost(result.outputCost)})`,
		`Total: ${result.usage.totalTokens.toLocaleString()} tokens (${formatCost(result.totalCost)})`
	];
	return lines.join('\n');
}

/**
 * Estimate tokens from text (rough approximation: ~4 chars per token for English)
 * This is only used when actual token count is not available
 */
export function estimateTokens(text: string): number {
	// OpenAI generally uses ~4 characters per token for English text
	// This is a rough estimate; actual tokenization varies
	return Math.ceil(text.length / 4);
}

/**
 * Get model display name
 */
export function getModelDisplayName(model: string): string {
	return MODEL_PRICING[model]?.displayName || model;
}

/**
 * Check if a model is a voice/realtime model
 */
export function isVoiceModel(model: string): boolean {
	return MODEL_PRICING[model]?.type === 'voice';
}

/**
 * Check if a model is a video generation model
 */
export function isVideoModel(model: string): boolean {
	return MODEL_PRICING[model]?.type === 'video';
}

// Legacy VIDEO_PRICING map — kept for backward compatibility but prefer
// calculateVideoCostFromPricing() which uses the provider registry's
// VideoModelPricing directly.
export const VIDEO_PRICING: Record<
	string,
	{
		perSecond: number;
		displayName: string;
	}
> = {
	sora: {
		perSecond: 0.5,
		displayName: 'Sora'
	}
};

/**
 * Calculate cost for a video generation (legacy — uses VIDEO_PRICING map)
 */
export function calculateVideoCost(
	model: string,
	durationSeconds: number
): { cost: number; displayName: string } {
	const pricing = VIDEO_PRICING[model];
	if (!pricing) {
		return { cost: 0, displayName: model };
	}

	return {
		cost: durationSeconds * pricing.perSecond,
		displayName: pricing.displayName
	};
}

/**
 * Format a video generation cost
 */
export function formatVideoCost(model: string, durationSeconds: number): string {
	const { cost, displayName } = calculateVideoCost(model, durationSeconds);
	return `${displayName}: ${formatCost(cost)} (${durationSeconds}s)`;
}

/**
 * Calculate cost from VideoModelPricing (from provider registry).
 *
 * Supports two pricing models:
 * - estimatedCostPerSecond: cost = rate × duration (e.g. OpenAI Sora)
 * - estimatedCostPerGeneration: flat cost per generation (e.g. WaveSpeed)
 *
 * When pricingByResolution is present and a matching resolution is given,
 * the resolution-specific override replaces the top-level rates.
 *
 * When both per-second and per-generation are present, per-second pricing
 * takes priority. Returns 0 when pricing is undefined or has no rate fields.
 */
export function calculateVideoCostFromPricing(
	pricing:
		| {
				estimatedCostPerSecond?: number;
				estimatedCostPerGeneration?: number;
				pricingByResolution?: Record<
					string,
					{ estimatedCostPerSecond?: number; estimatedCostPerGeneration?: number }
				>;
				currency?: string;
		  }
		| undefined
		| null,
	durationSeconds: number,
	resolution?: string
): number {
	if (!pricing) return 0;

	// Resolve effective rates: resolution-specific overrides first, then top-level
	let effectiveCostPerSecond = pricing.estimatedCostPerSecond;
	let effectiveCostPerGeneration = pricing.estimatedCostPerGeneration;

	if (resolution && pricing.pricingByResolution?.[resolution]) {
		const resPricing = pricing.pricingByResolution[resolution];
		if (resPricing.estimatedCostPerSecond != null) {
			effectiveCostPerSecond = resPricing.estimatedCostPerSecond;
		}
		if (resPricing.estimatedCostPerGeneration != null) {
			effectiveCostPerGeneration = resPricing.estimatedCostPerGeneration;
		}
	}

	if (effectiveCostPerSecond != null && effectiveCostPerSecond > 0) {
		return (durationSeconds || 0) * effectiveCostPerSecond;
	}

	if (effectiveCostPerGeneration != null && effectiveCostPerGeneration > 0) {
		return effectiveCostPerGeneration;
	}

	return 0;
}

/**
 * Look up a video model's pricing from the provider registry and compute cost.
 *
 * @param providerName - Provider key (e.g. 'openai', 'wavespeed')
 * @param modelId - Model identifier (e.g. 'sora-2', 'wan2.1-t2v-turbo')
 * @param durationSeconds - Video duration in seconds
 * @param resolution - Optional resolution (e.g. '480p', '720p', '1080p') for resolution-aware pricing
 * @returns Calculated cost, or 0 if provider/model not found
 */
export function lookupVideoModelCost(
	providerName: string,
	modelId: string,
	durationSeconds: number,
	resolution?: string
): number {
	const provider = getVideoProvider(providerName);
	if (!provider) return 0;

	const model = provider.getAvailableModels().find((m) => m.id === modelId);
	if (!model?.pricing) return 0;

	return calculateVideoCostFromPricing(model.pricing, durationSeconds, resolution);
}

/**
 * Calculate voice session cost based on audio duration
 * Realtime API pricing: ~$5/hour for audio input, ~$20/hour for audio output
 * Approximation: 1 second of audio ≈ 50 tokens
 */
export function calculateVoiceCost(
	model: string,
	inputDurationSeconds: number,
	outputDurationSeconds: number
): CostResult {
	// Approximate tokens from audio duration
	// OpenAI Realtime: roughly 50 tokens per second of audio
	const TOKENS_PER_SECOND = 50;

	const inputTokens = Math.ceil(inputDurationSeconds * TOKENS_PER_SECOND);
	const outputTokens = Math.ceil(outputDurationSeconds * TOKENS_PER_SECOND);

	return calculateCost(model, inputTokens, outputTokens);
}
