import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// POST - Reorder AI keys (changes priority order)
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user?.isOwner && !locals.user?.isAdmin) {
		throw error(403, 'Admin access required');
	}

	try {
		const data = await request.json();

		if (!Array.isArray(data.order) || data.order.length === 0) {
			throw error(400, 'Invalid order: must be a non-empty array of key IDs');
		}

		if (!platform?.env?.KV) {
			throw error(500, 'KV storage not available');
		}

		// Validate that all IDs in the new order exist in the current list
		const keysList = await platform.env.KV.get('ai_keys_list');
		if (!keysList) {
			throw error(404, 'No AI keys found');
		}

		const currentKeyIds: string[] = JSON.parse(keysList);
		const newOrder: string[] = data.order;

		// Ensure the new order contains exactly the same IDs as the current list
		const currentSet = new Set(currentKeyIds);
		const newSet = new Set(newOrder);

		if (currentSet.size !== newSet.size) {
			throw error(400, 'New order must contain the same keys as the current list');
		}

		for (const id of newOrder) {
			if (!currentSet.has(id)) {
				throw error(400, `Key ID "${id}" not found in current key list`);
			}
		}

		// Check for duplicates
		if (newOrder.length !== newSet.size) {
			throw error(400, 'Duplicate key IDs in order');
		}

		// Save the new order
		await platform.env.KV.put('ai_keys_list', JSON.stringify(newOrder));

		return json({ success: true, order: newOrder });
	} catch (err) {
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		console.error('Failed to reorder AI keys:', err);
		throw error(500, 'Failed to reorder AI provider keys');
	}
};
