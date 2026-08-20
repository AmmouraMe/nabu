/**
 * Brand Onboarding Store
 * Manages the state of the AI-driven brand building wizard
 */

import { writable, get } from 'svelte/store';
import type {
	BrandProfile,
	OnboardingMessage,
	OnboardingStep,
	OnboardingAttachment
} from '$lib/types/onboarding';
import { STEP_COMPLETE_MARKER } from '$lib/services/onboarding';

interface OnboardingState {
	profile: BrandProfile | null;
	messages: OnboardingMessage[];
	currentStep: OnboardingStep;
	isLoading: boolean;
	isStreaming: boolean;
	streamingStatus: string;
	error: string | null;
}

const initialState: OnboardingState = {
	profile: null,
	messages: [],
	currentStep: 'welcome',
	isLoading: false,
	isStreaming: false,
	streamingStatus: '',
	error: null
};

export const onboardingStore = writable<OnboardingState>({ ...initialState });

/**
 * Start new onboarding — creates profile and gets the AI welcome message
 */
export async function startOnboarding(): Promise<void> {
	onboardingStore.update((s) => ({ ...s, isLoading: true, error: null }));

	try {
		const response = await fetch('/api/onboarding/start', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({})
		});

		if (!response.ok) {
			throw new Error(`Failed to start onboarding: ${response.statusText}`);
		}

		const data = await response.json();
		const messages: OnboardingMessage[] = [];

		if (data.message) {
			messages.push(data.message);
		}

		onboardingStore.update((s) => ({
			...s,
			profile: data.profile,
			messages,
			currentStep: 'welcome',
			isLoading: false
		}));
	} catch (err) {
		onboardingStore.update((s) => ({
			...s,
			isLoading: false,
			error: err instanceof Error ? err.message : 'Failed to start onboarding'
		}));
	}
}

/**
 * Load an existing brand profile and its messages.
 * If brandId is provided, loads that specific brand profile.
 * Otherwise, loads the most recently updated active profile (backward compatible).
 */
export async function loadExistingProfile(brandId?: string): Promise<BrandProfile | null> {
	onboardingStore.update((s) => ({ ...s, isLoading: true, error: null }));

	try {
		const profileUrl = brandId
			? `/api/onboarding/profile?id=${brandId}`
			: '/api/onboarding/profile';
		const profileRes = await fetch(profileUrl);
		if (!profileRes.ok) {
			throw new Error('Failed to load profile');
		}

		const profileData = await profileRes.json();
		if (!profileData.profile) {
			onboardingStore.update((s) => ({ ...s, isLoading: false }));
			return null;
		}

		// Load messages for this profile
		const messagesRes = await fetch(`/api/onboarding/messages/${profileData.profile.id}`);
		let messages: OnboardingMessage[] = [];
		if (messagesRes.ok) {
			const messagesData = await messagesRes.json();
			messages = messagesData.messages || [];
		}

		onboardingStore.update((s) => ({
			...s,
			profile: profileData.profile,
			messages,
			currentStep: profileData.profile.onboardingStep || 'welcome',
			isLoading: false
		}));

		return profileData.profile;
	} catch (err) {
		onboardingStore.update((s) => ({
			...s,
			isLoading: false,
			error: err instanceof Error ? err.message : 'Failed to load profile'
		}));
		return null;
	}
}

/**
 * Send a message in the onboarding conversation
 * Handles SSE streaming from the API
 * Supports file attachments (already uploaded to R2)
 */
export async function sendMessage(
	content: string,
	attachments?: OnboardingAttachment[]
): Promise<void> {
	const state = get(onboardingStore);
	if (!state.profile) return;

	// Add user message to store immediately
	const userMessage: OnboardingMessage = {
		id: crypto.randomUUID(),
		brandProfileId: state.profile.id,
		userId: state.profile.userId,
		role: 'user',
		content,
		step: state.currentStep,
		attachments: attachments || undefined,
		createdAt: new Date().toISOString()
	};

	onboardingStore.update((s) => ({
		...s,
		messages: [...s.messages, userMessage],
		isStreaming: true,
		error: null
	}));

	try {
		const response = await fetch('/api/onboarding/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				profileId: state.profile.id,
				message: content,
				step: state.currentStep,
				attachments: attachments || undefined
			})
		});

		if (!response.ok) {
			throw new Error(`Chat failed: ${response.statusText}`);
		}

		// Create a placeholder assistant message
		const assistantMessageId = crypto.randomUUID();
		const assistantMessage: OnboardingMessage = {
			id: assistantMessageId,
			brandProfileId: state.profile.id,
			userId: state.profile.userId,
			role: 'assistant',
			content: '',
			step: state.currentStep,
			createdAt: new Date().toISOString()
		};

		onboardingStore.update((s) => ({
			...s,
			messages: [...s.messages, assistantMessage]
		}));

		// Read SSE stream
		const reader = response.body?.getReader();
		if (!reader) throw new Error('No response body');

		const decoder = new TextDecoder();
		let buffer = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed || trimmed === 'data: [DONE]') continue;
				if (!trimmed.startsWith('data: ')) continue;

				try {
					const json = JSON.parse(trimmed.slice(6));

					if (json.content) {
						// Append content to the assistant message
						onboardingStore.update((s) => ({
							...s,
							streamingStatus: '',
							messages: s.messages.map((m) =>
								m.id === assistantMessageId ? { ...m, content: m.content + json.content } : m
							)
						}));
					}

					if (json.status) {
						onboardingStore.update((s) => ({
							...s,
							streamingStatus: json.status.message
						}));
					}

					if (json.stepAdvance) {
						// AI signaled step completion — strip the marker from the message and advance
						onboardingStore.update((s) => ({
							...s,
							messages: s.messages.map((m) =>
								m.id === assistantMessageId
									? { ...m, content: m.content.replace(STEP_COMPLETE_MARKER, '').trimEnd() }
									: m
							),
							currentStep: json.stepAdvance as OnboardingStep,
							profile: s.profile
								? { ...s.profile, onboardingStep: json.stepAdvance as OnboardingStep }
								: s.profile
						}));
					}

					if (json.brandDataExtracted) {
						// AI extracted brand data from the conversation — update the profile in the store
						onboardingStore.update((s) => {
							if (!s.profile) return s;
							const updates: Partial<BrandProfile> = {};
							for (const [key, value] of Object.entries(json.brandDataExtracted)) {
								if (value != null && value !== '') {
									(updates as Record<string, unknown>)[key] = value;
								}
							}
							// If brandName was extracted, mark it as confirmed
							if (updates.brandName) {
								updates.brandNameConfirmed = true;
							}
							return {
								...s,
								profile: { ...s.profile, ...updates }
							};
						});
					}

					if (json.error) {
						throw new Error(json.error);
					}
				} catch (parseErr) {
					// Skip malformed SSE chunks (JSON parse errors), but re-throw server errors
					if (parseErr instanceof SyntaxError) {
						continue;
					}
					throw parseErr;
				}
			}
		}

		onboardingStore.update((s) => ({ ...s, isStreaming: false, streamingStatus: '' }));
	} catch (err) {
		onboardingStore.update((s) => ({
			...s,
			isStreaming: false,
			streamingStatus: '',
			error: err instanceof Error ? err.message : 'Failed to send message'
		}));
	}
}

/**
 * Update the current onboarding step
 */
export async function updateStep(step: OnboardingStep): Promise<void> {
	const state = get(onboardingStore);
	if (!state.profile) return;

	try {
		const response = await fetch('/api/onboarding/profile', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				profileId: state.profile.id,
				updates: { onboardingStep: step }
			})
		});

		if (!response.ok) {
			throw new Error('Failed to update step');
		}

		const data = await response.json();

		onboardingStore.update((s) => ({
			...s,
			profile: data.profile || { ...s.profile, onboardingStep: step },
			currentStep: step
		}));
	} catch (err) {
		onboardingStore.update((s) => ({
			...s,
			error: err instanceof Error ? err.message : 'Failed to update step'
		}));
	}
}

/**
 * Update brand data in the profile
 */
export async function updateBrandData(updates: Partial<BrandProfile>): Promise<void> {
	const state = get(onboardingStore);
	if (!state.profile) return;

	try {
		const response = await fetch('/api/onboarding/profile', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				profileId: state.profile.id,
				updates
			})
		});

		if (!response.ok) {
			throw new Error('Failed to update brand data');
		}

		const data = await response.json();

		onboardingStore.update((s) => ({
			...s,
			profile: data.profile || s.profile
		}));
	} catch (err) {
		onboardingStore.update((s) => ({
			...s,
			error: err instanceof Error ? err.message : 'Failed to update brand data'
		}));
	}
}

/**
 * Reset onboarding store to initial state
 */
export function resetOnboarding(): void {
	onboardingStore.set({ ...initialState });
}
