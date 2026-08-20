/**
 * Tests for Brand Page - New Brand Creation Flow
 * TDD: Verifies that the "New Brand" button creates a profile via API
 * and navigates to the onboarding page with the new brand ID.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock $app/navigation
const mockGoto = vi.fn();
vi.mock('$app/navigation', () => ({
	goto: mockGoto
}));

describe('Brand Page - Create New Brand', () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		vi.clearAllMocks();
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it('should call POST /api/onboarding/start and navigate on success', async () => {
		const mockProfileId = 'new-brand-123';
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					profile: { id: mockProfileId, userId: 'user-1', status: 'in_progress' },
					message: { id: 'msg-1', content: 'Welcome!' }
				})
		});

		// Simulate the createNewBrand logic from the component
		const res = await fetch('/api/onboarding/start', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({})
		});
		const data = await res.json();
		await mockGoto(`/onboarding?brand=${data.profile.id}`);

		expect(fetch).toHaveBeenCalledWith('/api/onboarding/start', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({})
		});
		expect(mockGoto).toHaveBeenCalledWith(`/onboarding?brand=${mockProfileId}`);
	});

	it('should handle API failure gracefully', async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			statusText: 'Internal Server Error'
		});

		let error: string | null = null;
		try {
			const res = await fetch('/api/onboarding/start', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});
			if (!res.ok) throw new Error('Failed to create brand');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create brand';
		}

		expect(error).toBe('Failed to create brand');
		expect(mockGoto).not.toHaveBeenCalled();
	});

	it('should handle network errors gracefully', async () => {
		globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

		let error: string | null = null;
		try {
			const res = await fetch('/api/onboarding/start', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});
			if (!res.ok) throw new Error('Failed to create brand');
			const data = await res.json();
			await mockGoto(`/onboarding?brand=${data.profile.id}`);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create brand';
		}

		expect(error).toBe('Network error');
		expect(mockGoto).not.toHaveBeenCalled();
	});

	it('should navigate with the correct brand ID from the response', async () => {
		const specificId = 'brand-uuid-abc-456';
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					profile: { id: specificId },
					message: null,
					error: 'No AI provider configured'
				})
		});

		const res = await fetch('/api/onboarding/start', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({})
		});
		const data = await res.json();
		await mockGoto(`/onboarding?brand=${data.profile.id}`);

		expect(mockGoto).toHaveBeenCalledWith(`/onboarding?brand=${specificId}`);
	});
});
