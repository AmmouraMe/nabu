import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const CACHE_KEY = 'wavespeed_pricing_cache';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

interface WaveSpeedModel {
	model_id: string;
	name: string;
	base_price: number;
	description: string;
	type: string;
}

interface CachedPricing {
	models: WaveSpeedModel[];
	fetchedAt: number;
}

/**
 * GET - Fetch WaveSpeed model pricing with daily caching
 * Uses KV to cache the pricing data for 24 hours
 * Supports ?refresh=true to force a cache refresh
 */
export const GET: RequestHandler = async ({ platform, locals, url }) => {
	if (!locals.user?.isOwner && !locals.user?.isAdmin) {
		throw error(403, 'Admin access required');
	}

	const forceRefresh = url.searchParams.get('refresh') === 'true';
	const kv = platform?.env?.KV;

	if (!kv) {
		return json({ models: [], error: 'KV storage not available', cached: false });
	}

	// Check cache first (unless force refresh)
	if (!forceRefresh) {
		try {
			const cachedRaw = await kv.get(CACHE_KEY);
			if (cachedRaw) {
				const cached: CachedPricing = JSON.parse(cachedRaw);
				const age = Date.now() - cached.fetchedAt;

				if (age < CACHE_DURATION_MS) {
					return json({
						models: cached.models,
						cached: true,
						fetchedAt: cached.fetchedAt
					});
				}
			}
		} catch {
			// Cache read failed, proceed to fetch
		}
	}

	// Get WaveSpeed API key from stored keys
	let apiKey: string | null = null;
	try {
		const keysRaw = await kv.get('ai_keys');
		if (keysRaw) {
			const keys = JSON.parse(keysRaw);
			const wsKey = keys.find((k: any) => k.provider === 'wavespeed' && k.enabled && k.apiKey);
			if (wsKey) {
				apiKey = wsKey.apiKey;
			}
		}
	} catch {
		// Failed to read keys
	}

	if (!apiKey) {
		return json({
			models: [],
			error: 'No WaveSpeed API key configured. Add a WaveSpeed key first.',
			cached: false
		});
	}

	// Fetch from WaveSpeed API
	try {
		const response = await fetch('https://api.wavespeed.ai/api/v3/models', {
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			}
		});

		if (!response.ok) {
			const errorText = await response.text().catch(() => 'Unknown error');
			return json({
				models: [],
				error: `WaveSpeed API error (${response.status}): ${errorText}`,
				cached: false
			});
		}

		const result = await response.json();
		const models: WaveSpeedModel[] = (result.data || []).map((m: any) => ({
			model_id: m.model_id,
			name: m.name,
			base_price: m.base_price,
			description: m.description,
			type: m.type
		}));

		// Cache the results
		const cacheData: CachedPricing = {
			models,
			fetchedAt: Date.now()
		};

		try {
			await kv.put(CACHE_KEY, JSON.stringify(cacheData));
		} catch {
			// Cache write failed, not critical
		}

		return json({
			models,
			cached: false,
			fetchedAt: cacheData.fetchedAt
		});
	} catch (err) {
		return json({
			models: [],
			error: err instanceof Error ? err.message : 'Failed to fetch pricing',
			cached: false
		});
	}
};
