import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for Reset API
 * TDD: Testing the reset configuration endpoint
 */

// Mock SvelteKit
vi.mock('@sveltejs/kit', () => ({
	error: (status: number, message: string) => {
		const err = new Error(message) as Error & { status: number; body: { message: string } };
		err.status = status;
		err.body = { message };
		throw err;
	},
	json: (data: unknown) =>
		new Response(JSON.stringify(data), {
			headers: { 'Content-Type': 'application/json' }
		})
}));

describe('Reset API', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('POST /api/reset', () => {
		it('should return 500 when KV is not available', async () => {
			const { POST } = await import('../../src/routes/api/reset/+server');

			const mockCookies = {
				delete: vi.fn()
			};

			await expect(
				POST({
					platform: { env: {} },
					cookies: mockCookies
				} as any)
			).rejects.toMatchObject({ status: 500 });
		});

		it('should return 403 when reset route is disabled', async () => {
			const { POST } = await import('../../src/routes/api/reset/+server');

			const mockGet = vi.fn().mockResolvedValue('true');
			const mockCookies = {
				delete: vi.fn()
			};

			await expect(
				POST({
					platform: { env: { KV: { get: mockGet } } },
					cookies: mockCookies
				} as any)
			).rejects.toMatchObject({ status: 403 });

			expect(mockGet).toHaveBeenCalledWith('reset_route_disabled');
		});

		// Regression guard: this endpoint deletes admin_first_login_completed, the only
		// lock on /setup. Unauthenticated it was a full takeover — reset, then claim
		// admin through setup. Once an owner exists, only that owner may reset.
		describe('owner gate', () => {
			const ownerEstablishedKV = (extra: Record<string, string | null> = {}) => ({
				get: vi.fn().mockImplementation((key: string) => {
					if (key === 'github_owner_id') return Promise.resolve('12345');
					return Promise.resolve(extra[key] ?? null);
				}),
				delete: vi.fn().mockResolvedValue(undefined)
			});

			it('should reject an anonymous reset once an owner exists', async () => {
				const { POST } = await import('../../src/routes/api/reset/+server');
				const kv = ownerEstablishedKV();

				await expect(
					POST({
						platform: { env: { KV: kv } },
						cookies: { delete: vi.fn() },
						locals: {}
					} as any)
				).rejects.toMatchObject({ status: 403 });

				expect(kv.delete).not.toHaveBeenCalled();
			});

			it('should reject a signed-in non-owner', async () => {
				const { POST } = await import('../../src/routes/api/reset/+server');
				const kv = ownerEstablishedKV();

				await expect(
					POST({
						platform: { env: { KV: kv } },
						cookies: { delete: vi.fn() },
						locals: { user: { id: 'someone-else', isOwner: false, isAdmin: true } }
					} as any)
				).rejects.toMatchObject({ status: 403 });

				expect(kv.delete).not.toHaveBeenCalled();
			});

			it('should reject when only admin_first_login_completed marks the owner', async () => {
				const { POST } = await import('../../src/routes/api/reset/+server');
				const kv = {
					get: vi.fn().mockImplementation((key: string) => {
						if (key === 'admin_first_login_completed') return Promise.resolve('true');
						return Promise.resolve(null);
					}),
					delete: vi.fn().mockResolvedValue(undefined)
				};

				await expect(
					POST({
						platform: { env: { KV: kv } },
						cookies: { delete: vi.fn() },
						locals: {}
					} as any)
				).rejects.toMatchObject({ status: 403 });
			});

			it('should allow the owner to reset', async () => {
				const { POST } = await import('../../src/routes/api/reset/+server');
				const kv = ownerEstablishedKV();

				const response = await POST({
					platform: { env: { KV: kv } },
					cookies: { delete: vi.fn() },
					locals: { user: { id: '12345', isOwner: true } }
				} as any);

				expect((await response.json()).success).toBe(true);
				expect(kv.delete).toHaveBeenCalledWith('admin_first_login_completed');
			});

			it('should allow an anonymous reset before any owner exists', async () => {
				// Bootstrap state: nothing to protect, and /setup is openly claimable anyway.
				const { POST } = await import('../../src/routes/api/reset/+server');
				const kv = {
					get: vi.fn().mockResolvedValue(null),
					delete: vi.fn().mockResolvedValue(undefined)
				};

				const response = await POST({
					platform: { env: { KV: kv } },
					cookies: { delete: vi.fn() },
					locals: {}
				} as any);

				expect((await response.json()).success).toBe(true);
			});
		});

		it('should reset configuration successfully', async () => {
			const { POST } = await import('../../src/routes/api/reset/+server');

			const mockGet = vi.fn().mockResolvedValue(null);
			const mockDelete = vi.fn().mockResolvedValue(undefined);
			const mockCookiesDelete = vi.fn();

			const response = await POST({
				platform: {
					env: {
						KV: {
							get: mockGet,
							delete: mockDelete
						}
					}
				},
				cookies: { delete: mockCookiesDelete }
			} as any);

			const data = await response.json();
			expect(data.success).toBe(true);
			expect(data.message).toContain('reset successfully');

			// Should delete all setup-related KV keys
			expect(mockDelete).toHaveBeenCalledWith('auth_config:github');
			expect(mockDelete).toHaveBeenCalledWith('github_owner_id');
			expect(mockDelete).toHaveBeenCalledWith('github_owner_username');
			expect(mockDelete).toHaveBeenCalledWith('admin_first_login_completed');

			// Should clear session cookie
			expect(mockCookiesDelete).toHaveBeenCalledWith('session', { path: '/' });
		});

		it('should handle individual KV delete failures gracefully', async () => {
			const { POST } = await import('../../src/routes/api/reset/+server');

			const mockGet = vi.fn().mockResolvedValue(null);
			// First delete succeeds, second fails, rest succeed
			const mockDelete = vi
				.fn()
				.mockResolvedValueOnce(undefined)
				.mockRejectedValueOnce(new Error('Delete failed'))
				.mockResolvedValue(undefined);
			const mockCookiesDelete = vi.fn();

			const response = await POST({
				platform: {
					env: {
						KV: {
							get: mockGet,
							delete: mockDelete
						}
					}
				},
				cookies: { delete: mockCookiesDelete }
			} as any);

			const data = await response.json();
			// Should still succeed overall
			expect(data.success).toBe(true);
		});

		it('should handle unexpected errors', async () => {
			const { POST } = await import('../../src/routes/api/reset/+server');

			const mockGet = vi.fn().mockRejectedValue(new Error('Unexpected error'));
			const mockCookies = {
				delete: vi.fn()
			};

			await expect(
				POST({
					platform: { env: { KV: { get: mockGet } } },
					cookies: mockCookies
				} as any)
			).rejects.toMatchObject({ status: 500 });
		});

		it('should re-throw HTTP errors with status property', async () => {
			const { POST } = await import('../../src/routes/api/reset/+server');

			const httpError = new Error('Custom error') as Error & { status: number };
			httpError.status = 404;
			const mockGet = vi.fn().mockRejectedValue(httpError);
			const mockCookies = {
				delete: vi.fn()
			};

			await expect(
				POST({
					platform: { env: { KV: { get: mockGet } } },
					cookies: mockCookies
				} as any)
			).rejects.toMatchObject({ status: 404 });
		});
	});
});
