import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for Layout Server Load
 * TDD: Tests for root layout data loading
 */

describe('Layout Server Load', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	describe('load function', () => {
		it('should return user from locals and check AI providers', async () => {
			const mockUser = {
				id: 'user-123',
				login: 'testuser',
				isAdmin: false
			};

			const mockKV = {
				get: vi
					.fn()
					.mockResolvedValueOnce(JSON.stringify(['key-1'])) // ai_keys_list
					.mockResolvedValueOnce(JSON.stringify({ enabled: true })) // ai_key:key-1
			};

			const { load } = await import('../../src/routes/+layout.server');
			const result = (await load({
				locals: { user: mockUser },
				platform: { env: { KV: mockKV } }
			} as any)) as { user: typeof mockUser | null; hasAIProviders: boolean };

			expect(result.user).toEqual(mockUser);
			expect(result.hasAIProviders).toBe(true);
		});

		it('should return null user when not authenticated', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ hasProviders: false })
			});

			const { load } = await import('../../src/routes/+layout.server');
			const result = (await load({
				locals: {},
				fetch: mockFetch
			} as any)) as { user: null; hasAIProviders: boolean };

			expect(result.user).toBeNull();
			expect(result.hasAIProviders).toBe(false);
		});

		it('should handle AI provider check failure gracefully', async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500
			});

			const { load } = await import('../../src/routes/+layout.server');
			const result = (await load({
				locals: { user: { id: 'user-123' } },
				fetch: mockFetch
			} as any)) as { hasAIProviders: boolean };

			expect(result.hasAIProviders).toBe(false);
		});

		it('should handle fetch error gracefully', async () => {
			const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));

			const { load } = await import('../../src/routes/+layout.server');
			const result = (await load({
				locals: { user: { id: 'user-123' } },
				fetch: mockFetch
			} as any)) as { hasAIProviders: boolean };

			expect(result.hasAIProviders).toBe(false);
		});
	});
});
