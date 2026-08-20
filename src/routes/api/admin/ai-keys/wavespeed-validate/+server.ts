import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * POST - Validate a WaveSpeed AI API key
 * Calls the WaveSpeed balance endpoint to verify the key is valid
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.isOwner && !locals.user?.isAdmin) {
		throw error(403, 'Admin access required');
	}

	const data = await request.json();

	if (!data.apiKey) {
		throw error(400, 'API key is required');
	}

	try {
		const response = await fetch('https://api.wavespeed.ai/api/v3/balance', {
			headers: {
				Authorization: `Bearer ${data.apiKey}`,
				'Content-Type': 'application/json'
			}
		});

		if (!response.ok) {
			const errorText = await response.text().catch(() => 'Unknown error');
			return json({
				valid: false,
				error: `WaveSpeed API returned ${response.status}: ${errorText}`
			});
		}

		const result = await response.json();

		return json({
			valid: true,
			balance: result.data?.balance ?? null
		});
	} catch (err) {
		return json({
			valid: false,
			error: err instanceof Error ? err.message : 'Failed to validate key'
		});
	}
};
