/**
 * Tests for Brand Onboarding Store
 * TDD: Tests first, then implement
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('Brand Onboarding Store', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
		mockFetch.mockReset();
	});

	describe('onboardingStore', () => {
		it('should initialize with default state', async () => {
			const { onboardingStore } = await import('$lib/stores/onboarding');
			const state = get(onboardingStore);

			expect(state.profile).toBeNull();
			expect(state.messages).toEqual([]);
			expect(state.currentStep).toBe('welcome');
			expect(state.isLoading).toBe(false);
			expect(state.isStreaming).toBe(false);
			expect(state.error).toBeNull();
		});
	});

	describe('startOnboarding', () => {
		it('should start onboarding and set profile', async () => {
			const mockProfile = {
				id: 'bp-123',
				userId: 'user-123',
				status: 'in_progress',
				onboardingStep: 'welcome'
			};
			const mockMessage = {
				id: 'msg-1',
				content: 'Welcome to brand building!',
				role: 'assistant',
				step: 'welcome'
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ profile: mockProfile, message: mockMessage })
			});

			const { startOnboarding, onboardingStore } = await import('$lib/stores/onboarding');
			await startOnboarding();

			const state = get(onboardingStore);
			expect(state.profile).toEqual(mockProfile);
			expect(state.messages).toHaveLength(1);
			expect(state.messages[0].content).toBe('Welcome to brand building!');
		});

		it('should set error when start fails', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: 'Internal Server Error'
			});

			const { startOnboarding, onboardingStore } = await import('$lib/stores/onboarding');
			await startOnboarding();

			const state = get(onboardingStore);
			expect(state.error).toBeTruthy();
		});
	});

	describe('loadExistingProfile', () => {
		it('should load an existing profile and messages', async () => {
			const mockProfile = {
				id: 'bp-123',
				userId: 'user-123',
				status: 'in_progress',
				onboardingStep: 'brand_identity'
			};
			const mockMessages = [
				{ id: 'msg-1', content: 'Welcome!', role: 'assistant', step: 'welcome' },
				{ id: 'msg-2', content: 'I have a brand', role: 'user', step: 'welcome' }
			];

			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve({ profile: mockProfile })
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve({ messages: mockMessages })
				});

			const { loadExistingProfile, onboardingStore } = await import('$lib/stores/onboarding');
			await loadExistingProfile();

			const state = get(onboardingStore);
			expect(state.profile).toEqual(mockProfile);
			expect(state.messages).toHaveLength(2);
			expect(state.currentStep).toBe('brand_identity');
		});

		it('should return null when no profile exists', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ profile: null })
			});

			const { loadExistingProfile, onboardingStore } = await import('$lib/stores/onboarding');
			const result = await loadExistingProfile();

			expect(result).toBeNull();
		});

		it('should make brandName available from the loaded profile', async () => {
			const mockProfile = {
				id: 'bp-456',
				userId: 'user-123',
				status: 'in_progress',
				brandName: 'Acme Corp',
				onboardingStep: 'brand_identity'
			};

			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve({ profile: mockProfile })
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve({ messages: [] })
				});

			const { loadExistingProfile, onboardingStore } = await import('$lib/stores/onboarding');
			await loadExistingProfile();

			const state = get(onboardingStore);
			expect(state.profile?.brandName).toBe('Acme Corp');
		});

		it('should have undefined brandName for a profile without one set', async () => {
			const mockProfile = {
				id: 'bp-789',
				userId: 'user-123',
				status: 'in_progress',
				onboardingStep: 'welcome'
			};

			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve({ profile: mockProfile })
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve({ messages: [] })
				});

			const { loadExistingProfile, onboardingStore } = await import('$lib/stores/onboarding');
			await loadExistingProfile();

			const state = get(onboardingStore);
			expect(state.profile).toBeTruthy();
			expect(state.profile?.brandName).toBeUndefined();
		});
	});

	describe('sendMessage', () => {
		it('should add user message to store immediately', async () => {
			// Setup a profile first
			const mockProfile = {
				id: 'bp-123',
				userId: 'user-123',
				status: 'in_progress',
				onboardingStep: 'welcome'
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						profile: mockProfile,
						message: { id: 'msg-1', content: 'Hi', role: 'assistant', step: 'welcome' }
					})
			});

			const { startOnboarding, sendMessage, onboardingStore } = await import(
				'$lib/stores/onboarding'
			);
			await startOnboarding();

			// Mock the SSE stream for sendMessage
			const mockReader = {
				read: vi
					.fn()
					.mockResolvedValueOnce({
						done: false,
						value: new TextEncoder().encode('data: {"content":"Sure"}\n\n')
					})
					.mockResolvedValueOnce({
						done: false,
						value: new TextEncoder().encode('data: [DONE]\n\n')
					})
					.mockResolvedValueOnce({ done: true, value: undefined })
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				body: { getReader: () => mockReader }
			});

			await sendMessage('I want to build a brand');

			const state = get(onboardingStore);
			// Should have: welcome message + user message + assistant streaming response
			expect(state.messages.length).toBeGreaterThanOrEqual(2);
		});

		it('should auto-advance step when stepAdvance event is received', async () => {
			// Setup a profile first
			const mockProfile = {
				id: 'bp-123',
				userId: 'user-123',
				status: 'in_progress',
				onboardingStep: 'welcome'
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						profile: mockProfile,
						message: { id: 'msg-1', content: 'Hi', role: 'assistant', step: 'welcome' }
					})
			});

			const { startOnboarding, sendMessage, onboardingStore } = await import(
				'$lib/stores/onboarding'
			);
			await startOnboarding();

			// Mock the SSE stream with a stepAdvance event
			const mockReader = {
				read: vi
					.fn()
					.mockResolvedValueOnce({
						done: false,
						value: new TextEncoder().encode('data: {"content":"Great, let me summarize..."}\n\n')
					})
					.mockResolvedValueOnce({
						done: false,
						value: new TextEncoder().encode('data: {"stepAdvance":"brand_assessment"}\n\n')
					})
					.mockResolvedValueOnce({
						done: false,
						value: new TextEncoder().encode('data: [DONE]\n\n')
					})
					.mockResolvedValueOnce({ done: true, value: undefined })
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				body: { getReader: () => mockReader }
			});

			await sendMessage('I have a brand already');

			const state = get(onboardingStore);
			expect(state.currentStep).toBe('brand_assessment');
			expect(state.profile?.onboardingStep).toBe('brand_assessment');
		});
	});

	describe('updateStep', () => {
		it('should update the current step', async () => {
			const mockProfile = {
				id: 'bp-123',
				userId: 'user-123',
				status: 'in_progress',
				onboardingStep: 'welcome'
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						profile: mockProfile,
						message: { id: 'msg-1', content: 'Hi', role: 'assistant', step: 'welcome' }
					})
			});

			const { startOnboarding, updateStep, onboardingStore } = await import(
				'$lib/stores/onboarding'
			);
			await startOnboarding();

			// Mock the PATCH request
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({ profile: { ...mockProfile, onboardingStep: 'brand_identity' } })
			});

			await updateStep('brand_identity');

			const state = get(onboardingStore);
			expect(state.currentStep).toBe('brand_identity');
		});
	});

	describe('updateBrandData', () => {
		it('should update brand data in the profile', async () => {
			const mockProfile = {
				id: 'bp-123',
				userId: 'user-123',
				status: 'in_progress',
				onboardingStep: 'welcome'
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						profile: mockProfile,
						message: { id: 'msg-1', content: 'Hi', role: 'assistant', step: 'welcome' }
					})
			});

			const { startOnboarding, updateBrandData, onboardingStore } = await import(
				'$lib/stores/onboarding'
			);
			await startOnboarding();

			const updatedProfile = { ...mockProfile, brandName: 'Acme Corp' };
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ profile: updatedProfile })
			});

			await updateBrandData({ brandName: 'Acme Corp' });

			const state = get(onboardingStore);
			expect(state.profile?.brandName).toBe('Acme Corp');
		});
	});

	describe('resetOnboarding', () => {
		it('should reset the store to initial state', async () => {
			const mockProfile = {
				id: 'bp-123',
				userId: 'user-123',
				status: 'in_progress',
				onboardingStep: 'welcome'
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						profile: mockProfile,
						message: { id: 'msg-1', content: 'Hi', role: 'assistant', step: 'welcome' }
					})
			});

			const { startOnboarding, resetOnboarding, onboardingStore } = await import(
				'$lib/stores/onboarding'
			);
			await startOnboarding();

			resetOnboarding();

			const state = get(onboardingStore);
			expect(state.profile).toBeNull();
			expect(state.messages).toEqual([]);
			expect(state.currentStep).toBe('welcome');
		});
	});
});
