import type { ServerLoad } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';

export const load: ServerLoad = async ({ platform, locals }) => {
	// Require authentication
	if (!locals.user) {
		throw redirect(302, '/auth/login?redirect=/onboarding');
	}

	// Check if AI providers are available
	let hasAIProviders = false;
	try {
		if (platform?.env?.KV) {
			const keysList = await platform.env.KV.get('ai_keys_list');
			if (keysList) {
				const keyIds = JSON.parse(keysList);
				for (const keyId of keyIds) {
					const keyData = await platform.env.KV.get(`ai_key:${keyId}`);
					if (keyData) {
						const key = JSON.parse(keyData);
						if (
							key.enabled !== false &&
							(key.provider === 'openai' || key.provider === 'anthropic')
						) {
							hasAIProviders = true;
							break;
						}
					}
				}
			}
		}
	} catch (err) {
		console.error('Failed to check AI providers:', err);
	}

	return {
		userId: locals.user.id,
		hasAIProviders
	};
};
