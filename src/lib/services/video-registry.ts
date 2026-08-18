/**
 * Video Provider Registry
 * Factory for getting video providers and managing API keys
 */

import type { VideoProvider, VideoModel } from './video-provider';
import { OpenAIVideoProvider } from './providers/openai-video';
import { WaveSpeedVideoProvider } from './providers/wavespeed-video';

// Provider instances (singletons)
const providers: Record<string, VideoProvider> = {
	openai: new OpenAIVideoProvider(),
	wavespeed: new WaveSpeedVideoProvider()
};

/**
 * Get a video provider by name
 */
export function getVideoProvider(providerName: string): VideoProvider | null {
	return providers[providerName] ?? null;
}

/**
 * Get all available video models across all providers
 */
export function getAllVideoModels(): VideoModel[] {
	const models: VideoModel[] = [];
	for (const provider of Object.values(providers)) {
		models.push(...provider.getAvailableModels());
	}
	return models;
}

export interface VideoAIKey {
	id: string;
	name: string;
	provider: string;
	apiKey: string;
	enabled: boolean;
	videoEnabled?: boolean;
	videoModels?: string[];
}

/**
 * Get the first enabled video-capable API key from KV storage
 */
export async function getEnabledVideoKey(
	platform: App.Platform,
	preferredProvider?: string
): Promise<VideoAIKey | null> {
	try {
		const keysList = await platform.env.KV.get('ai_keys_list');
		if (!keysList) return null;

		const keyIds = JSON.parse(keysList);

		for (const keyId of keyIds) {
			const keyData = await platform.env.KV.get(`ai_key:${keyId}`);
			if (keyData) {
				const key = JSON.parse(keyData) as VideoAIKey;
				if (
					key.enabled !== false &&
					key.videoEnabled === true &&
					(!preferredProvider || key.provider === preferredProvider)
				) {
					return key;
				}
			}
		}

		return null;
	} catch (err) {
		console.error('Failed to get video API key:', err);
		return null;
	}
}

/**
 * Get all enabled video-capable API keys from KV storage
 */
export async function getAllEnabledVideoKeys(platform: App.Platform): Promise<VideoAIKey[]> {
	try {
		const keysList = await platform.env.KV.get('ai_keys_list');
		if (!keysList) return [];

		const keyIds = JSON.parse(keysList);
		const enabledKeys: VideoAIKey[] = [];

		for (const keyId of keyIds) {
			const keyData = await platform.env.KV.get(`ai_key:${keyId}`);
			if (keyData) {
				const key = JSON.parse(keyData) as VideoAIKey;
				if (key.enabled !== false && key.videoEnabled === true) {
					enabledKeys.push(key);
				}
			}
		}

		return enabledKeys;
	} catch (err) {
		console.error('Failed to get video API keys:', err);
		return [];
	}
}

/**
 * Legacy model ID mapping for backwards compatibility.
 * When resolution-specific model IDs were consolidated (e.g., wan-2.1/t2v-720p +
 * wan-2.1/t2v-480p → wan-2.1/t2v), users may still have old IDs saved in KV.
 * This map ensures those old IDs still match the consolidated model.
 */
const LEGACY_MODEL_IDS: Record<string, string> = {
	'wan-2.1/t2v-720p': 'wan-2.1/t2v',
	'wan-2.1/t2v-480p': 'wan-2.1/t2v',
	'wan-2.2/t2v-720p': 'wan-2.2/t2v'
};

/**
 * Get video models available for a specific API key
 */
export function getModelsForKey(key: VideoAIKey): VideoModel[] {
	const provider = getVideoProvider(key.provider);
	if (!provider) return [];

	const allModels = provider.getAvailableModels();

	// If specific models are configured, filter to those
	if (key.videoModels && key.videoModels.length > 0) {
		// Normalize configured model IDs through the legacy map so old saved
		// IDs like "wan-2.1/t2v-720p" still match the consolidated "wan-2.1/t2v"
		const normalizedIds = new Set(key.videoModels.map((id) => LEGACY_MODEL_IDS[id] || id));
		return allModels.filter((m) => normalizedIds.has(m.id));
	}

	return allModels;
}
