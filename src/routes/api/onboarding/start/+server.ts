/**
 * POST /api/onboarding/start - Start the onboarding process
 * Creates a new brand profile and generates the initial AI welcome message
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createBrandProfile,
	addOnboardingMessage,
	getSystemPromptForStep
} from '$lib/services/onboarding';
import { getFirstEnabledAIKey, streamChatCompletionWithFallback } from '$lib/services/openai-chat';

export const POST: RequestHandler = async ({ locals, platform }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	// Create a new brand profile
	const profile = await createBrandProfile(platform!.env.DB, locals.user.id);

	// Get AI key (any supported provider)
	const aiKey = await getFirstEnabledAIKey(platform!);
	if (!aiKey) {
		// Still return the profile even without AI — user can configure later
		return json({
			profile,
			message: null,
			error: 'No AI provider configured'
		});
	}

	// Generate welcome message from AI
	const systemPrompt = getSystemPromptForStep('welcome');
	let welcomeMessage = '';

	try {
		for await (const chunk of streamChatCompletionWithFallback(
			[aiKey],
			[
				{ role: 'system', content: systemPrompt },
				{
					role: 'user',
					content:
						"I'm starting the brand onboarding process. Please welcome me and ask whether I have an existing brand or am starting from scratch."
				}
			],
			{ temperature: 0.8, maxTokens: 800 }
		)) {
			if (chunk.type === 'content' && chunk.content) {
				welcomeMessage += chunk.content;
			}
		}

		// Persist welcome message
		const savedMessage = await addOnboardingMessage(platform!.env.DB, {
			brandProfileId: profile.id,
			userId: locals.user.id,
			role: 'assistant',
			content: welcomeMessage,
			step: 'welcome'
		});

		return json({
			profile,
			message: savedMessage
		});
	} catch (err) {
		console.error('Failed to generate welcome message:', err);
		return json({
			profile,
			message: null,
			error: 'Failed to generate welcome message'
		});
	}
};
