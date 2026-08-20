/**
 * POST /api/onboarding/chat - Send a message in the onboarding conversation
 * Streams AI response using SSE, persists both user and assistant messages
 */
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	addOnboardingMessage,
	getBrandProfile,
	getOnboardingMessages,
	buildConversationContext,
	updateBrandProfile,
	getNextStep,
	STEP_COMPLETE_MARKER,
	buildExtractionPrompt,
	parseExtractionResponse
} from '$lib/services/onboarding';
import type { BrandContentContext } from '$lib/services/onboarding';
import { updateBrandFieldWithVersion } from '$lib/services/brand';
import { getBrandTexts, getBrandAssetSummary } from '$lib/services/brand-assets';
import {
	getAllEnabledAIKeys,
	streamChatCompletionWithFallback,
	chatCompletionWithKey
} from '$lib/services/openai-chat';
import {
	buildCorePrincipleQuestionsPromptBlock,
	listCorePrincipleQuestions
} from '$lib/services/core-principle-questions';
import { calculateCost, getModelDisplayName } from '$lib/utils/cost';
import type { OnboardingStep } from '$lib/types/onboarding';

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const body = await request.json();
	const { profileId, message, step, attachments } = body;

	if (!profileId || !message || !step) {
		throw error(400, 'profileId, message, and step are required');
	}

	// Get the brand profile
	const profile = await getBrandProfile(platform!.env.DB, profileId);
	if (!profile) {
		throw error(404, 'Brand profile not found');
	}

	// Verify profile belongs to user
	if (profile.userId !== locals.user.id) {
		throw error(403, 'Forbidden');
	}

	// Get all enabled AI keys in priority order (any supported provider)
	const aiKeys = await getAllEnabledAIKeys(platform!);
	if (aiKeys.length === 0) {
		throw error(503, 'No AI provider configured. Add an API key in Admin → AI Keys.');
	}

	// Persist user message (with attachments metadata if any)
	const attachmentsJson =
		attachments && attachments.length > 0 ? JSON.stringify(attachments) : null;

	await addOnboardingMessage(platform!.env.DB, {
		brandProfileId: profileId,
		userId: locals.user.id,
		role: 'user',
		content: message,
		step: step as OnboardingStep,
		attachments: attachmentsJson
	});

	// Get all previous messages for context
	const previousMessages = await getOnboardingMessages(platform!.env.DB, profileId);

	// Fetch brand content (texts and asset summary) for richer AI context
	const [brandTexts, assetSummary] = await Promise.all([
		getBrandTexts(platform!.env.DB, profileId),
		getBrandAssetSummary(platform!.env.DB, profileId)
	]);

	const contentContext: BrandContentContext = {
		texts: brandTexts,
		assetSummary
	};

	// Build conversation context with full brand awareness
	const conversationMessages = buildConversationContext(
		step as OnboardingStep,
		previousMessages,
		profile,
		contentContext
	);

	if (step === 'brand_story' && typeof conversationMessages[0]?.content === 'string') {
		const activeCorePrincipleQuestions = await listCorePrincipleQuestions(platform!.env.DB, true);
		const corePrinciplePromptBlock = buildCorePrincipleQuestionsPromptBlock(
			activeCorePrincipleQuestions
		);

		if (corePrinciplePromptBlock) {
			conversationMessages[0].content =
				conversationMessages[0].content + `\n\n${corePrinciplePromptBlock}`;
		}
	}

	// Stream AI response
	let fullContent = '';
	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			try {
				for await (const chunk of streamChatCompletionWithFallback(aiKeys, conversationMessages, {
					temperature: 0.8,
					maxTokens: 1500
				})) {
					if (chunk.type === 'status' && chunk.status) {
						// Forward status events to client
						const statusData = `data: ${JSON.stringify({ status: chunk.status })}\n\n`;
						controller.enqueue(encoder.encode(statusData));
					} else if (chunk.type === 'content' && chunk.content) {
						fullContent += chunk.content;
						const data = `data: ${JSON.stringify({ content: chunk.content })}\n\n`;
						controller.enqueue(encoder.encode(data));
					} else if (chunk.type === 'usage' && chunk.usage) {
						const usedModel = chunk.model || 'gpt-4o';
						const costResult = calculateCost(
							usedModel,
							chunk.usage.promptTokens,
							chunk.usage.completionTokens
						);
						const usageData = `data: ${JSON.stringify({
							usage: {
								inputTokens: chunk.usage.promptTokens,
								outputTokens: chunk.usage.completionTokens,
								totalCost: costResult.totalCost,
								model: usedModel,
								displayName: getModelDisplayName(usedModel)
							}
						})}\n\n`;
						controller.enqueue(encoder.encode(usageData));
					}
				}

				// Check for step completion marker
				const shouldAdvance = fullContent.includes(STEP_COMPLETE_MARKER);
				const cleanContent = fullContent.replace(STEP_COMPLETE_MARKER, '').trimEnd();

				// Send step advance event before [DONE] so client can handle it
				if (shouldAdvance) {
					const nextStep = getNextStep(step as OnboardingStep);
					if (nextStep) {
						const advanceData = `data: ${JSON.stringify({ stepAdvance: nextStep })}\n\n`;
						controller.enqueue(encoder.encode(advanceData));
					}
				}

				// Extract brand data from the conversation using a lightweight AI call
				// Do this BEFORE [DONE] so we can send results to the client
				let extracted: Record<string, unknown> | null = null;
				try {
					const recentMessages = previousMessages
						.filter((m) => m.role === 'user' || m.role === 'assistant')
						.slice(-6)
						.map((m) => ({ role: m.role, content: m.content }));
					recentMessages.push({ role: 'user', content: message });
					recentMessages.push({ role: 'assistant', content: cleanContent });

					const extractionPrompt = buildExtractionPrompt(step as OnboardingStep, recentMessages);

					if (extractionPrompt) {
						const extractionResponse = await chatCompletionWithKey(
							aiKeys[0],
							[{ role: 'system', content: extractionPrompt }],
							{ temperature: 0.1, maxTokens: 512, jsonMode: true }
						);

						extracted = parseExtractionResponse(extractionResponse);
						if (extracted) {
							// Send extracted data to client so it can update the store
							const extractedData = `data: ${JSON.stringify({ brandDataExtracted: extracted })}\n\n`;
							controller.enqueue(encoder.encode(extractedData));
						}
					}
				} catch (extractionErr) {
					console.error('Brand data extraction failed:', extractionErr);
				}

				controller.enqueue(encoder.encode('data: [DONE]\n\n'));

				// Persist assistant message and extracted data (non-blocking)
				if (cleanContent && platform?.context) {
					platform.context.waitUntil(
						(async () => {
							await addOnboardingMessage(platform!.env.DB, {
								brandProfileId: profileId,
								userId: locals.user!.id,
								role: 'assistant',
								content: cleanContent,
								step: step as OnboardingStep
							});

							// Auto-advance to next step if marker was present
							if (shouldAdvance) {
								const nextStep = getNextStep(step as OnboardingStep);
								if (nextStep) {
									await updateBrandProfile(platform!.env.DB, profileId, {
										onboardingStep: nextStep
									});
								}
							}

							// Persist extracted brand data with version tracking
							if (extracted) {
								try {
									for (const [fieldName, value] of Object.entries(extracted)) {
										await updateBrandFieldWithVersion(platform!.env.DB, {
											profileId,
											userId: locals.user!.id,
											fieldName,
											newValue: value,
											changeSource: 'ai',
											changeReason: `Extracted from onboarding chat (${step} step)`
										});
									}
								} catch (dbErr) {
									console.error('Failed to persist extracted brand data:', dbErr);
								}
							}
						})()
					);
				}
			} catch (err) {
				console.error('Onboarding chat stream error:', err);
				const message = err instanceof Error ? err.message : 'Stream failed';
				const errorData = `data: ${JSON.stringify({ error: message })}\n\n`;
				controller.enqueue(encoder.encode(errorData));
			} finally {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
