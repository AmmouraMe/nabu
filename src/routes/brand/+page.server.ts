import type { ServerLoad } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { getAllEnabledAIKeys } from '$lib/services/openai-chat';

export const load: ServerLoad = async ({ platform, locals }) => {
	// Require authentication
	if (!locals.user) {
		throw redirect(302, '/auth/login?redirect=/brand');
	}

	// Check if any text-chat-capable AI provider is available (for the onboarding
	// link). Reuse the same helper the chat path uses so this gate stays in sync
	// with what the Brand Architect can actually call — including keyless Workers
	// AI (which only counts when its binding is present).
	let hasAIProviders = false;
	try {
		if (platform?.env?.KV) {
			const keys = await getAllEnabledAIKeys(platform);
			hasAIProviders = keys.length > 0;
		}
	} catch (err) {
		console.error('Failed to check AI providers:', err);
	}

	return {
		userId: locals.user.id,
		hasAIProviders
	};
};
