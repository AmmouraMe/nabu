import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface BalanceResult {
	available: boolean;
	amount?: number;
	currency?: string;
	reason?: string;
	rateLimits?: {
		requestsLimit?: number;
		requestsRemaining?: number;
		tokensLimit?: number;
		tokensRemaining?: number;
	};
	label?: string;
}

interface UsageDay {
	date: string;
	cost: number;
	requests: number;
}

interface UsageResult {
	available: boolean;
	daily: UsageDay[];
	totalCost?: number;
	totalRequests?: number;
}

/**
 * Fetch WaveSpeed account balance
 */
async function getWaveSpeedBalance(apiKey: string): Promise<BalanceResult> {
	try {
		const response = await fetch('https://api.wavespeed.ai/api/v3/balance', {
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			}
		});

		if (!response.ok) {
			const errorText = await response.text().catch(() => 'Unknown error');
			return { available: false, reason: `API returned ${response.status}: ${errorText}` };
		}

		const result = await response.json();
		const balance = result.data?.balance;

		if (balance != null) {
			return { available: true, amount: balance, currency: 'usd' };
		}

		return { available: false, reason: 'Balance data not found in response' };
	} catch (err) {
		return {
			available: false,
			reason: err instanceof Error ? err.message : 'Failed to fetch balance'
		};
	}
}

/**
 * Fetch OpenAI organization costs (last 30 days)
 * Uses the Administration API: GET /v1/organization/costs
 */
async function getOpenAIBalance(apiKey: string): Promise<BalanceResult> {
	try {
		const now = Math.floor(Date.now() / 1000);
		const thirtyDaysAgo = now - 30 * 24 * 60 * 60;

		const url = `https://api.openai.com/v1/organization/costs?start_time=${thirtyDaysAgo}&end_time=${now}&bucket_width=1d`;

		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			}
		});

		if (!response.ok) {
			const errorText = await response.text().catch(() => 'Unknown error');
			return { available: false, reason: `API returned ${response.status}: ${errorText}` };
		}

		const result = await response.json();

		// Sum up total costs from the response
		let totalCost = 0;
		if (result.data && Array.isArray(result.data)) {
			for (const bucket of result.data) {
				if (bucket.results && Array.isArray(bucket.results)) {
					for (const r of bucket.results) {
						if (r.amount?.value) {
							// OpenAI returns costs in cents
							totalCost += r.amount.value / 100;
						}
					}
				}
			}
		}

		return {
			available: true,
			amount: Math.round(totalCost * 100) / 100,
			currency: 'usd'
		};
	} catch (err) {
		return {
			available: false,
			reason: err instanceof Error ? err.message : 'Failed to fetch costs'
		};
	}
}

/**
 * Fetch Anthropic account info via token counting endpoint
 * Anthropic doesn't have a public billing API, but we can validate
 * the key and extract rate limit info from response headers
 */
async function getAnthropicBalance(apiKey: string): Promise<BalanceResult> {
	try {
		const response = await fetch('https://api.anthropic.com/v1/messages/count_tokens', {
			method: 'POST',
			headers: {
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01',
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: 'claude-3-haiku-20240307',
				messages: [{ role: 'user', content: 'hi' }]
			})
		});

		if (!response.ok) {
			const errorText = await response.text().catch(() => 'Unknown error');
			return { available: false, reason: `API returned ${response.status}: ${errorText}` };
		}

		// Extract rate limit info from headers
		const rateLimits = {
			requestsLimit:
				parseInt(response.headers.get('anthropic-ratelimit-requests-limit') || '0') || undefined,
			requestsRemaining:
				parseInt(response.headers.get('anthropic-ratelimit-requests-remaining') || '0') ||
				undefined,
			tokensLimit:
				parseInt(response.headers.get('anthropic-ratelimit-tokens-limit') || '0') || undefined,
			tokensRemaining:
				parseInt(response.headers.get('anthropic-ratelimit-tokens-remaining') || '0') || undefined
		};

		return {
			available: true,
			rateLimits,
			label: 'Rate Limits'
		};
	} catch (err) {
		return {
			available: false,
			reason: err instanceof Error ? err.message : 'Failed to fetch Anthropic account info'
		};
	}
}

/**
 * Get local usage data from D1 ai_media_generations table
 */
async function getLocalUsage(db: any, provider: string): Promise<UsageResult> {
	try {
		const results = await db
			.prepare(
				`SELECT
					date(created_at) as day,
					COALESCE(SUM(cost), 0) as total_cost,
					COUNT(*) as request_count
				FROM ai_media_generations
				WHERE provider = ?
					AND created_at >= datetime('now', '-30 days')
				GROUP BY date(created_at)
				ORDER BY day ASC`
			)
			.bind(provider)
			.all();

		const daily: UsageDay[] = (results.results || []).map((row: any) => ({
			date: row.day,
			cost: row.total_cost || 0,
			requests: row.request_count || 0
		}));

		const totalCost = daily.reduce((sum, d) => sum + d.cost, 0);
		const totalRequests = daily.reduce((sum, d) => sum + d.requests, 0);

		return {
			available: true,
			daily,
			totalCost: Math.round(totalCost * 100) / 100,
			totalRequests
		};
	} catch (err) {
		console.error('Failed to query local usage:', err);
		return { available: false, daily: [] };
	}
}

/**
 * GET - Fetch account info (balance + usage) for a specific AI provider key
 */
export const GET: RequestHandler = async ({ params, platform, locals }) => {
	if (!locals.user?.isOwner && !locals.user?.isAdmin) {
		throw error(403, 'Admin access required');
	}

	const { id } = params;

	if (!platform?.env?.KV) {
		throw error(500, 'KV storage not available');
	}

	// Load key data (including apiKey) from KV
	const keyData = await platform.env.KV.get(`ai_key:${id}`);
	if (!keyData) {
		throw error(404, 'Key not found');
	}

	const key = JSON.parse(keyData);
	const provider = key.provider;
	const apiKey = key.apiKey;

	// Fetch balance based on provider
	let balance: BalanceResult;

	switch (provider) {
		case 'wavespeed':
			balance = await getWaveSpeedBalance(apiKey);
			break;
		case 'openai':
			balance = await getOpenAIBalance(apiKey);
			break;
		case 'anthropic':
			balance = await getAnthropicBalance(apiKey);
			break;
		default:
			balance = {
				available: false,
				reason: `Balance check not supported for ${provider}`
			};
	}

	// Fetch local usage data from D1
	let usage: UsageResult;
	if (platform?.env?.DB) {
		usage = await getLocalUsage(platform.env.DB, provider);
	} else {
		usage = { available: false, daily: [] };
	}

	return json({ balance, usage });
};
