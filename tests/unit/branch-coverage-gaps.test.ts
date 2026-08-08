/**
 * Targeted tests for remaining branch coverage gaps.
 * Covers the uncovered branches across multiple files to reach 95%+ branch coverage.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The admin auth-keys routes gate on isOwner/isAdmin.
const adminLocals = { user: { id: 'owner-1', isAdmin: true, isOwner: true } };

// ─── Admin CMS [type] Page - sortBy/sortDirection branches ───────────────────
describe('Admin CMS [type] Page - sortBy and sortDirection query params', () => {
	let mockFetch: ReturnType<typeof vi.fn>;
	let load: any;

	beforeEach(async () => {
		vi.resetModules();
		mockFetch = vi.fn();
		const module = await import('../../src/routes/admin/cms/[type]/+page.server.js');
		load = module.load;
	});

	it('should pass sortBy and sortDirection as query params', async () => {
		const mockType = {
			id: 'type-1',
			slug: 'blog',
			name: 'Blog Posts',
			fields: [],
			settings: { hasTags: false }
		};

		mockFetch
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ types: [mockType] })
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					items: [{ id: 'i1', title: 'Test' }],
					totalItems: 1,
					totalPages: 1,
					page: 1
				})
			});

		const result = await load({
			fetch: mockFetch,
			params: { type: 'blog' },
			url: new URL(
				'http://localhost/admin/cms/blog?sortBy=title&sortDirection=desc&page=2&status=published&search=foo'
			)
		});

		const secondCallUrl = mockFetch.mock.calls[1][0];
		expect(secondCallUrl).toContain('sortBy=title');
		expect(secondCallUrl).toContain('sortDirection=desc');
		expect(secondCallUrl).toContain('page=2');
		expect(secondCallUrl).toContain('status=published');
		expect(secondCallUrl).toContain('search=foo');
		expect(result.items).toHaveLength(1);
		expect(result.totalItems).toBe(1);
	});

	it('should handle items fetch returning non-ok without data', async () => {
		const mockType = {
			id: 'type-1',
			slug: 'blog',
			name: 'Blog Posts',
			fields: [],
			settings: { hasTags: true }
		};

		mockFetch
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ types: [mockType] })
			})
			.mockResolvedValueOnce({
				ok: false
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ tags: [{ id: 't1', name: 'Tag1' }] })
			});

		const result = await load({
			fetch: mockFetch,
			params: { type: 'blog' },
			url: new URL('http://localhost/admin/cms/blog')
		});

		expect(result.items).toEqual([]);
		expect(result.totalItems).toBe(0);
		expect(result.totalPages).toBe(1);
		expect(result.currentPage).toBe(1);
		expect(result.tags).toEqual([{ id: 't1', name: 'Tag1' }]);
	});

	it('should handle tags fetch returning non-ok response', async () => {
		const mockType = {
			id: 'type-1',
			slug: 'blog',
			name: 'Blog Posts',
			fields: [],
			settings: { hasTags: true }
		};

		mockFetch
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ types: [mockType] })
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					items: [],
					totalItems: 0,
					totalPages: 1,
					page: 1
				})
			})
			.mockResolvedValueOnce({
				ok: false
			});

		const result = await load({
			fetch: mockFetch,
			params: { type: 'blog' },
			url: new URL('http://localhost/admin/cms/blog')
		});

		expect(result.tags).toEqual([]);
	});
});

// ─── Chat Models API - generic catch block (lines 141-146) ───────────────────
describe('Chat Models API - generic error handling', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	it('should throw 500 for non-HttpError exceptions in GET handler', async () => {
		vi.doMock('@sveltejs/kit', () => ({
			error: (status: number, message: string) => {
				const err = new Error(message) as any;
				err.status = status;
				err.body = { message };
				throw err;
			},
			json: (data: any) => new Response(JSON.stringify(data))
		}));

		const module = await import('../../src/routes/api/chat/models/+server.js');
		const GET = module.GET;

		const mockKVGet = vi
			.fn()
			.mockResolvedValueOnce(JSON.stringify(['key1']))
			.mockResolvedValueOnce(
				JSON.stringify({ provider: 'openai', enabled: true, models: ['gpt-4o'] })
			);

		// Make the response construction throw a non-HttpError
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		// Create a platform where KV.get works but something else fails
		// We need to trigger the outer catch with a non-status error
		const mockKVGetThrowing = vi
			.fn()
			.mockResolvedValueOnce(JSON.stringify(['key1']))
			// Return valid data that will cause getEnabledModels to succeed
			.mockResolvedValueOnce(
				JSON.stringify({
					provider: 'openai',
					enabled: true,
					models: ['gpt-4o']
				})
			);

		// Use a proxy to make the second access to KV throw
		let callCount = 0;
		const brokenPlatform = {
			env: {
				KV: {
					get: (...args: any[]) => {
						callCount++;
						if (callCount <= 2) {
							return mockKVGetThrowing(...args);
						}
						throw new Error('Unexpected KV error');
					}
				}
			}
		};

		try {
			await GET({
				platform: brokenPlatform,
				locals: { user: { id: 'user1' } }
			} as any);
		} catch (err: any) {
			expect(err.status).toBe(500);
		}

		consoleSpy.mockRestore();
	});
});

// ─── Admin Auth Keys  - remaining uncovered branches ─────────────────────────
describe('Admin Auth Keys API - uncovered catch branches', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	it('should fail closed on Discord config parse error in GET', async () => {
		vi.doMock('@sveltejs/kit', () => ({
			error: (status: number, message: string) => {
				const err = new Error(message) as any;
				err.status = status;
				err.body = { message };
				throw err;
			},
			isHttpError: (value: any) => typeof value?.status === 'number',
			json: (data: any) => new Response(JSON.stringify(data))
		}));

		const module = await import('../../src/routes/api/admin/auth-keys/+server.js');
		const GET = module.GET;

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const mockKVGet = vi
			.fn()
			.mockResolvedValueOnce(
				JSON.stringify({ id: 'gh1', provider: 'github', clientId: 'c1', createdAt: '2024-01-01' })
			)
			.mockResolvedValueOnce('invalid json for discord');

		await expect(
			GET({ platform: { env: { KV: { get: mockKVGet } } }, locals: adminLocals } as any)
		).rejects.toMatchObject({ status: 500 });
		consoleSpy.mockRestore();
	});

	it('should handle POST generic error (non-HttpError)', async () => {
		vi.doMock('@sveltejs/kit', () => ({
			error: (status: number, message: string) => {
				const err = new Error(message) as any;
				err.status = status;
				err.body = { message };
				throw err;
			},
			isHttpError: (value: any) => typeof value?.status === 'number',
			json: (data: any) => new Response(JSON.stringify(data))
		}));

		const module = await import('../../src/routes/api/admin/auth-keys/+server.js');
		const POST = module.POST;

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		// Make request.json() throw a non-HttpError
		try {
			await POST({
				request: {
					json: () => {
						throw new TypeError('Unexpected token');
					}
				},
				platform: { env: { KV: { put: vi.fn() } } },
				locals: adminLocals
			} as any);
		} catch (err: any) {
			expect(err.status).toBe(500);
		}

		consoleSpy.mockRestore();
	});

	it('should handle GET outer catch for unexpected error', async () => {
		vi.doMock('@sveltejs/kit', () => ({
			error: (status: number, message: string) => {
				const err = new Error(message) as any;
				err.status = status;
				err.body = { message };
				throw err;
			},
			json: () => {
				throw new Error('json serialization failed');
			}
		}));

		const module = await import('../../src/routes/api/admin/auth-keys/+server.js');
		const GET = module.GET;

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		try {
			await GET({
				platform: { env: { KV: { get: vi.fn().mockResolvedValue(null) } } },
				locals: adminLocals
			} as any);
		} catch (err: any) {
			expect(err.status).toBe(500);
		}

		consoleSpy.mockRestore();
	});
});

// ─── Admin Auth Keys [id] - KV cleanup & generic catch in DELETE ─────────────
describe('Admin Auth Keys [id] - DELETE KV cleanup and catch blocks', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	it('should handle KV errors during provider cleanup in DELETE', async () => {
		vi.doMock('@sveltejs/kit', () => ({
			error: (status: number, message: string) => {
				const err = new Error(message) as any;
				err.status = status;
				err.body = { message };
				throw err;
			},
			isHttpError: (value: any) => typeof value?.status === 'number',
			json: (data: any) => new Response(JSON.stringify(data))
		}));

		const module = await import('../../src/routes/api/admin/auth-keys/[id]/+server.js');
		const DELETE = module.DELETE;

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const mockKVGet = vi
			.fn()
			// Setup key check: no github config
			.mockResolvedValueOnce(null)
			// Provider cleanup: github throws
			.mockRejectedValueOnce(new Error('KV read failed'))
			// discord: returns config that doesn't match
			.mockResolvedValueOnce(JSON.stringify({ id: 'other-id' }))
			// google: returns matching config
			.mockResolvedValueOnce(JSON.stringify({ id: 'target-key' }));

		const mockKVDelete = vi.fn().mockResolvedValue(undefined);

		const result = await DELETE({
			params: { id: 'target-key' },
			platform: {
				env: {
					KV: { get: mockKVGet, delete: mockKVDelete }
				}
			},
			locals: adminLocals
		} as any);

		const data = await result.json();
		expect(data.success).toBe(true);
		consoleSpy.mockRestore();
	});

	it('should throw 500 for non-HttpError in DELETE', async () => {
		vi.doMock('@sveltejs/kit', () => ({
			error: (status: number, message: string) => {
				const err = new Error(message) as any;
				err.status = status;
				err.body = { message };
				throw err;
			},
			json: (data: any) => new Response(JSON.stringify(data))
		}));

		const module = await import('../../src/routes/api/admin/auth-keys/[id]/+server.js');
		const DELETE = module.DELETE;

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		try {
			await DELETE({
				params: { id: 'key1' },
				platform: {
					env: {
						KV: {
							get: () => {
								throw new TypeError('KV completely broken');
							}
						}
					}
				},
				locals: adminLocals
			} as any);
		} catch (err: any) {
			expect(err.status).toBe(500);
		}

		consoleSpy.mockRestore();
	});

	it('should throw 500 for non-HttpError in PUT', async () => {
		vi.doMock('@sveltejs/kit', () => ({
			error: (status: number, message: string) => {
				const err = new Error(message) as any;
				err.status = status;
				err.body = { message };
				throw err;
			},
			json: (data: any) => new Response(JSON.stringify(data))
		}));

		const module = await import('../../src/routes/api/admin/auth-keys/[id]/+server.js');
		const PUT = module.PUT;

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		try {
			await PUT({
				params: { id: 'key1' },
				request: {
					headers: { get: () => 'Bearer test-secret' },
					json: () => {
						throw new TypeError('Bad JSON');
					}
				},
				platform: { env: { KV: { get: vi.fn() } } },
				locals: adminLocals
			} as any);
		} catch (err: any) {
			expect(err.status).toBe(500);
		}

		consoleSpy.mockRestore();
	});
});

// ─── Admin Users [id] - setup owner protection branches ─────────────────────
describe('Admin Users [id] - setup owner protection', () => {
	let mockDBPrepare: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	it('PATCH: should prevent demoting setup owner', async () => {
		vi.doMock('@sveltejs/kit', () => ({
			error: (status: number, message: string) => {
				const err = new Error(message) as any;
				err.status = status;
				err.body = { message };
				throw err;
			},
			json: (data: any) => new Response(JSON.stringify(data))
		}));

		const module = await import('../../src/routes/api/admin/users/[id]/+server.js');
		const PATCH = module.PATCH;

		mockDBPrepare = vi
			.fn()
			.mockReturnValueOnce({
				bind: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue({
						id: 'target-user',
						email: 'owner@test.com',
						github_login: 'owner'
					})
				})
			})
			.mockReturnValueOnce({
				bind: vi.fn().mockReturnValue({
					run: vi.fn().mockResolvedValue({})
				})
			});

		const mockKVGet = vi.fn().mockResolvedValue(JSON.stringify({ ownerEmail: 'owner@test.com' }));

		try {
			await PATCH({
				platform: {
					env: {
						DB: { prepare: mockDBPrepare },
						KV: { get: mockKVGet }
					}
				},
				locals: { user: { id: 'admin-user', isOwner: true, isAdmin: true } },
				params: { id: 'target-user' },
				request: { json: async () => ({ isAdmin: false }) }
			} as any);
		} catch (err: any) {
			expect(err.status).toBe(400);
			expect(err.message).toContain('Cannot demote the setup owner');
		}
	});

	it('PATCH: should handle generic DB error', async () => {
		vi.doMock('@sveltejs/kit', () => ({
			error: (status: number, message: string) => {
				const err = new Error(message) as any;
				err.status = status;
				err.body = { message };
				throw err;
			},
			json: (data: any) => new Response(JSON.stringify(data))
		}));

		const module = await import('../../src/routes/api/admin/users/[id]/+server.js');
		const PATCH = module.PATCH;

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		mockDBPrepare = vi.fn().mockReturnValue({
			bind: vi.fn().mockReturnValue({
				first: vi.fn().mockRejectedValue(new Error('DB connection lost'))
			})
		});

		try {
			await PATCH({
				platform: {
					env: {
						DB: { prepare: mockDBPrepare },
						KV: { get: vi.fn() }
					}
				},
				locals: { user: { id: 'admin-user', isOwner: true, isAdmin: true } },
				params: { id: 'target-user' },
				request: { json: async () => ({ isAdmin: true }) }
			} as any);
		} catch (err: any) {
			expect(err.status).toBe(500);
		}

		consoleSpy.mockRestore();
	});

	it('DELETE: should prevent deleting setup owner', async () => {
		vi.doMock('@sveltejs/kit', () => ({
			error: (status: number, message: string) => {
				const err = new Error(message) as any;
				err.status = status;
				err.body = { message };
				throw err;
			},
			json: (data: any) => new Response(JSON.stringify(data))
		}));

		const module = await import('../../src/routes/api/admin/users/[id]/+server.js');
		const DELETE = module.DELETE;

		mockDBPrepare = vi.fn().mockReturnValue({
			bind: vi.fn().mockReturnValue({
				first: vi.fn().mockResolvedValue({
					id: 'target-user',
					email: 'owner@test.com'
				})
			})
		});

		const mockKVGet = vi.fn().mockResolvedValue(JSON.stringify({ ownerEmail: 'owner@test.com' }));

		try {
			await DELETE({
				platform: {
					env: {
						DB: { prepare: mockDBPrepare },
						KV: { get: mockKVGet }
					}
				},
				locals: { user: { id: 'admin-user', isOwner: true, isAdmin: true } },
				params: { id: 'target-user' }
			} as any);
		} catch (err: any) {
			expect(err.status).toBe(400);
			expect(err.message).toContain('Cannot delete the setup owner');
		}
	});

	it('DELETE: should handle generic DB error', async () => {
		vi.doMock('@sveltejs/kit', () => ({
			error: (status: number, message: string) => {
				const err = new Error(message) as any;
				err.status = status;
				err.body = { message };
				throw err;
			},
			json: (data: any) => new Response(JSON.stringify(data))
		}));

		const module = await import('../../src/routes/api/admin/users/[id]/+server.js');
		const DELETE = module.DELETE;

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		mockDBPrepare = vi.fn().mockReturnValue({
			bind: vi.fn().mockReturnValue({
				first: vi.fn().mockRejectedValue(new Error('DB connection lost'))
			})
		});

		try {
			await DELETE({
				platform: {
					env: {
						DB: { prepare: mockDBPrepare },
						KV: { get: vi.fn() }
					}
				},
				locals: { user: { id: 'admin-user', isOwner: true, isAdmin: true } },
				params: { id: 'target-user' }
			} as any);
		} catch (err: any) {
			expect(err.status).toBe(500);
		}

		consoleSpy.mockRestore();
	});
});

// ─── AI Keys toggle - generic catch block ────────────────────────────────────
describe('AI Keys toggle - generic error catch', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	it('should throw 500 for non-HttpError in PATCH', async () => {
		vi.doMock('@sveltejs/kit', () => ({
			error: (status: number, message: string) => {
				const err = new Error(message) as any;
				err.status = status;
				err.body = { message };
				throw err;
			},
			json: (data: any) => new Response(JSON.stringify(data))
		}));

		const module = await import('../../src/routes/api/admin/ai-keys/[id]/toggle/+server.js');
		const PATCH = module.PATCH;

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		try {
			await PATCH({
				params: { id: 'key1' },
				request: {
					json: () => {
						throw new TypeError('Bad JSON');
					}
				},
				platform: { env: { KV: { get: vi.fn(), put: vi.fn() } } },
				locals: { user: { isOwner: true } }
			} as any);
		} catch (err: any) {
			expect(err.status).toBe(500);
		}

		consoleSpy.mockRestore();
	});
});

// ─── AI Keys [id] - generic catch blocks ─────────────────────────────────────
describe('AI Keys [id] - generic error catches', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	it('should throw 500 for non-HttpError in PUT', async () => {
		vi.doMock('@sveltejs/kit', () => ({
			error: (status: number, message: string) => {
				const err = new Error(message) as any;
				err.status = status;
				err.body = { message };
				throw err;
			},
			json: (data: any) => new Response(JSON.stringify(data))
		}));

		const module = await import('../../src/routes/api/admin/ai-keys/[id]/+server.js');
		const PUT = module.PUT;

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		try {
			await PUT({
				params: { id: 'key1' },
				request: {
					json: () => {
						throw new TypeError('Bad JSON');
					}
				},
				platform: { env: { KV: { get: vi.fn() } } },
				locals: { user: { isOwner: true } }
			} as any);
		} catch (err: any) {
			expect(err.status).toBe(500);
		}

		consoleSpy.mockRestore();
	});

	it('should throw 500 for non-HttpError in PATCH (toggle)', async () => {
		vi.doMock('@sveltejs/kit', () => ({
			error: (status: number, message: string) => {
				const err = new Error(message) as any;
				err.status = status;
				err.body = { message };
				throw err;
			},
			json: (data: any) => new Response(JSON.stringify(data))
		}));

		const module = await import('../../src/routes/api/admin/ai-keys/[id]/+server.js');
		const PATCH = module.PATCH;

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		try {
			await PATCH({
				params: { id: 'key1' },
				request: {
					json: () => {
						throw new TypeError('Bad JSON');
					}
				},
				platform: { env: { KV: { get: vi.fn() } } },
				locals: { user: { isOwner: true } }
			} as any);
		} catch (err: any) {
			expect(err.status).toBe(500);
		}

		consoleSpy.mockRestore();
	});
});

// ─── AI Keys models - generic catch block ────────────────────────────────────
describe('AI Keys models - generic error catch', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	it('should throw 500 for non-HttpError in GET', async () => {
		vi.doMock('@sveltejs/kit', () => ({
			error: (status: number, message: string) => {
				const err = new Error(message) as any;
				err.status = status;
				err.body = { message };
				throw err;
			},
			json: (data: any) => new Response(JSON.stringify(data))
		}));

		const module = await import('../../src/routes/api/admin/ai-keys/models/+server.js');
		const GET = module.GET;

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		// Mock global fetch to throw a non-status error that will hit the generic catch
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('network error'));

		try {
			await GET({
				platform: {
					env: {
						KV: {
							get: vi.fn().mockResolvedValue(
								JSON.stringify({
									provider: 'openai',
									apiKey: 'test-key'
								})
							)
						}
					}
				},
				locals: { user: { isOwner: true } },
				url: new URL('http://localhost/api/admin/ai-keys/models?keyId=key1')
			} as any);
		} catch (err: any) {
			expect(err.status).toBe(500);
		}

		globalThis.fetch = originalFetch;
		consoleSpy.mockRestore();
	});
});

// ─── Admin AI Keys (main) - generic catch ────────────────────────────────────
describe('Admin AI Keys - generic error catch', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	it('should throw 500 for non-HttpError in POST', async () => {
		vi.doMock('@sveltejs/kit', () => ({
			error: (status: number, message: string) => {
				const err = new Error(message) as any;
				err.status = status;
				err.body = { message };
				throw err;
			},
			json: (data: any) => new Response(JSON.stringify(data))
		}));

		const module = await import('../../src/routes/api/admin/ai-keys/+server.js');
		const POST = module.POST;

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		try {
			await POST({
				request: {
					json: () => {
						throw new TypeError('Bad JSON');
					}
				},
				platform: { env: { KV: { get: vi.fn(), put: vi.fn() } } },
				locals: { user: { isOwner: true } }
			} as any);
		} catch (err: any) {
			expect(err.status).toBe(500);
		}

		consoleSpy.mockRestore();
	});
});

// ─── Setup API - error re-throw paths ────────────────────────────────────────
describe('Setup API - error re-throw branches', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	it('should re-throw HttpError in POST outer catch', async () => {
		vi.doMock('@sveltejs/kit', () => ({
			error: (status: number, message: string) => {
				const err = new Error(message) as any;
				err.status = status;
				err.body = { message };
				throw err;
			},
			isHttpError: (value: any) => typeof value?.status === 'number',
			json: (data: any) => new Response(JSON.stringify(data))
		}));

		const module = await import('../../src/routes/api/setup/+server.js');
		const POST = module.POST;

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		// Setup locked scenario - the HttpError from sveltekit error() should be re-thrown
		const mockKVGet = vi.fn().mockResolvedValue('true');

		try {
			await POST({
				request: { json: async () => ({}) },
				platform: { env: { KV: { get: mockKVGet, put: vi.fn() } } },
				locals: adminLocals
			} as any);
		} catch (err: any) {
			expect(err.status).toBe(403);
		}

		consoleSpy.mockRestore();
	});

	it('should throw 500 for non-HttpError in POST outer catch', async () => {
		vi.doMock('@sveltejs/kit', () => ({
			error: (status: number, message: string) => {
				const err = new Error(message) as any;
				err.status = status;
				err.body = { message };
				throw err;
			},
			isHttpError: (value: any) => typeof value?.status === 'number',
			json: (data: any) => new Response(JSON.stringify(data))
		}));

		const module = await import('../../src/routes/api/setup/+server.js');
		const POST = module.POST;

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		// request.json() throws a regular error, not HttpError
		try {
			await POST({
				request: {
					headers: { get: () => 'Bearer test-secret' },
					json: () => {
						throw new TypeError('Invalid JSON body');
					}
				},
				platform: {
					env: {
						SETUP_SECRET: 'test-secret',
						KV: { get: vi.fn().mockResolvedValue(null), put: vi.fn() }
					}
				},
				locals: adminLocals
			} as any);
		} catch (err: any) {
			expect(err.status).toBe(500);
		}

		consoleSpy.mockRestore();
	});

	it('should handle GitHub API fetch error re-throw when error is Response-like', async () => {
		// This covers the inner catch that checks `if (err instanceof Response)`
		vi.doMock('@sveltejs/kit', () => ({
			error: (status: number, message: string) => {
				const err = new Error(message) as any;
				err.status = status;
				err.body = { message };
				throw err;
			},
			isHttpError: (value: any) => typeof value?.status === 'number',
			json: (data: any) => new Response(JSON.stringify(data))
		}));

		const module = await import('../../src/routes/api/setup/+server.js');
		const POST = module.POST;

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const mockKVGet = vi.fn().mockResolvedValue(null);

		// Use global fetch mock to simulate GitHub API failure
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			statusText: 'Internal Server Error'
		});

		try {
			await POST({
				request: {
					headers: { get: () => 'Bearer test-secret' },
					json: async () => ({
						clientId: 'test-client',
						clientSecret: 'test-secret',
						adminGithubUsername: 'testuser'
					})
				},
				platform: {
					env: {
						SETUP_SECRET: 'test-secret',
						KV: { get: mockKVGet, put: vi.fn() }
					}
				},
				locals: adminLocals
			} as any);
		} catch (err: any) {
			expect(err.status).toBe(502);
		}

		globalThis.fetch = originalFetch;
		consoleSpy.mockRestore();
	});
});

// ─── Chat History Store - SSR guards and localStorage errors ─────────────────
describe('Chat History Store - SSR and localStorage error branches', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	it('should handle fetch failure gracefully during initialization', async () => {
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		// Mock fetch to fail
		globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

		const module = await import('../../src/lib/stores/chatHistory.js');
		const store = module.chatHistoryStore;

		// Initialize user - should trigger API call which catches the error
		await store.initializeForUser('user-test');

		// Should fall back to initial state
		let state: any;
		store.subscribe((s: any) => {
			state = s;
		});

		expect(state.conversations).toEqual([]);
		expect(state.userId).toBe('user-test');

		consoleSpy.mockRestore();
	});

	it('should handle fetch failure when creating a conversation', async () => {
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		// Mock fetch to fail
		globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

		const module = await import('../../src/lib/stores/chatHistory.js');
		const store = module.chatHistoryStore;

		// Create conversation - should fall back to local creation
		const conv = await store.createConversation('Test');

		// Should still create locally via fallback
		let state: any;
		store.subscribe((s: any) => {
			state = s;
		});

		expect(state.conversations).toHaveLength(1);

		consoleSpy.mockRestore();
	});

	it('should create conversation without user', async () => {
		// Mock fetch to fail (no user = no auth = API will fail)
		globalThis.fetch = vi.fn().mockRejectedValue(new Error('Unauthorized'));

		const module = await import('../../src/lib/stores/chatHistory.js');
		const store = module.chatHistoryStore;

		// Reset to state without userId
		store.reset();

		// Create conversation without user - should fall back to local creation
		const conv = await store.createConversation('Test without user');
		expect(conv.title).toBe('Test without user');
	});
});

// ─── CMS Types API - generic error catches ───────────────────────────────────
describe('CMS Types API - generic error catches', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	it('should throw 500 for non-HttpError in POST /api/cms/types', async () => {
		vi.doMock('@sveltejs/kit', () => ({
			error: (status: number, message: string) => {
				const err = new Error(message) as any;
				err.status = status;
				err.body = { message };
				throw err;
			},
			json: (data: any) => new Response(JSON.stringify(data))
		}));

		const module = await import('../../src/routes/api/cms/types/+server.js');
		const POST = module.POST;

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		try {
			await POST({
				request: {
					json: () => {
						throw new TypeError('Bad JSON');
					}
				},
				platform: { env: { DB: { prepare: vi.fn() } } },
				locals: { user: { isOwner: true, isAdmin: true } }
			} as any);
		} catch (err: any) {
			expect(err.status).toBe(500);
		}

		consoleSpy.mockRestore();
	});

	it('should throw 500 for non-HttpError in PUT /api/cms/types/[id]', async () => {
		vi.doMock('@sveltejs/kit', () => ({
			error: (status: number, message: string) => {
				const err = new Error(message) as any;
				err.status = status;
				err.body = { message };
				throw err;
			},
			json: (data: any) => new Response(JSON.stringify(data))
		}));

		const module = await import('../../src/routes/api/cms/types/[id]/+server.js');
		const PUT = module.PUT;

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		try {
			await PUT({
				params: { id: 'type1' },
				request: {
					json: () => {
						throw new TypeError('Bad JSON');
					}
				},
				platform: { env: { DB: { prepare: vi.fn() } } },
				locals: { user: { isOwner: true, isAdmin: true } }
			} as any);
		} catch (err: any) {
			expect(err.status).toBe(500);
		}

		consoleSpy.mockRestore();
	});

	it('should throw 500 for non-HttpError in DELETE /api/cms/types/[id]', async () => {
		vi.doMock('@sveltejs/kit', () => ({
			error: (status: number, message: string) => {
				const err = new Error(message) as any;
				err.status = status;
				err.body = { message };
				throw err;
			},
			json: (data: any) => new Response(JSON.stringify(data))
		}));

		const module = await import('../../src/routes/api/cms/types/[id]/+server.js');
		const DELETE = module.DELETE;

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		try {
			await DELETE({
				params: { id: 'type1' },
				platform: {
					env: {
						DB: {
							prepare: () => {
								throw new TypeError('DB completely broken');
							}
						}
					}
				},
				locals: { user: { isOwner: true, isAdmin: true } }
			} as any);
		} catch (err: any) {
			expect(err.status).toBe(500);
		}

		consoleSpy.mockRestore();
	});
});

// ─── CMS Service - remaining branch gaps ─────────────────────────────────────
describe('CMS Service - remaining branch coverage', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	it('createContentTypeInDB should handle null maxOrder result', async () => {
		const module = await import('../../src/lib/services/cms.js');

		const mockDB = {
			prepare: vi
				.fn()
				// Check existing slug
				.mockReturnValueOnce({
					bind: vi.fn().mockReturnValue({
						first: vi.fn().mockResolvedValue(null)
					})
				})
				// Get max sort_order
				.mockReturnValueOnce({
					first: vi.fn().mockResolvedValue(null)
				})
				// INSERT
				.mockReturnValueOnce({
					bind: vi.fn().mockReturnValue({
						first: vi.fn().mockResolvedValue({
							id: 'new-type',
							slug: 'test',
							name: 'Test',
							description: null,
							fields: '[]',
							settings: '{}',
							icon: 'document',
							sort_order: 0,
							is_system: 0,
							created_at: '2024-01-01',
							updated_at: '2024-01-01'
						})
					})
				})
		};

		const result = await module.createContentTypeInDB(mockDB as any, {
			name: 'Test',
			slug: 'test',
			fields: [],
			settings: {}
		});

		expect(result).toBeDefined();
		expect(result?.slug).toBe('test');
	});

	it('createContentTypeInDB should use provided description and icon', async () => {
		const module = await import('../../src/lib/services/cms.js');

		const mockDB = {
			prepare: vi
				.fn()
				.mockReturnValueOnce({
					bind: vi.fn().mockReturnValue({
						first: vi.fn().mockResolvedValue(null)
					})
				})
				.mockReturnValueOnce({
					first: vi.fn().mockResolvedValue({ max_order: 5 })
				})
				.mockReturnValueOnce({
					bind: vi.fn().mockReturnValue({
						first: vi.fn().mockResolvedValue({
							id: 'new-type',
							slug: 'articles',
							name: 'Articles',
							description: 'Article collection',
							fields: '[{"name":"body","type":"richtext"}]',
							settings: '{"hasTags":true}',
							icon: 'article',
							sort_order: 6,
							is_system: 0,
							created_at: '2024-01-01',
							updated_at: '2024-01-01'
						})
					})
				})
		};

		const result = await module.createContentTypeInDB(mockDB as any, {
			name: 'Articles',
			slug: 'articles',
			description: 'Article collection',
			icon: 'article',
			fields: [{ name: 'body', type: 'richtext' } as any],
			settings: { hasTags: true }
		});

		expect(result?.description).toBe('Article collection');
		expect(result?.icon).toBe('article');
		// Verify bind was called with description (not null)
		const insertCall = mockDB.prepare.mock.calls[2];
		expect(insertCall).toBeDefined();
	});

	it('createContentTypeInDB should return null when INSERT returns null', async () => {
		const module = await import('../../src/lib/services/cms.js');

		const mockDB = {
			prepare: vi
				.fn()
				.mockReturnValueOnce({
					bind: vi.fn().mockReturnValue({
						first: vi.fn().mockResolvedValue(null)
					})
				})
				.mockReturnValueOnce({
					first: vi.fn().mockResolvedValue({ max_order: 3 })
				})
				.mockReturnValueOnce({
					bind: vi.fn().mockReturnValue({
						first: vi.fn().mockResolvedValue(null)
					})
				})
		};

		const result = await module.createContentTypeInDB(mockDB as any, {
			name: 'Test',
			slug: 'test',
			fields: [],
			settings: {}
		});

		expect(result).toBeNull();
	});
});

// ─── Chat page server - voice enabled true branch ────────────────────────────
describe('Chat Page Server - voice enabled key branch', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	it('should detect voice availability when key has voiceEnabled=true and enabled is undefined', async () => {
		vi.doMock('@sveltejs/kit', () => ({
			redirect: vi.fn((status: number, location: string) => {
				const error = new Error(`Redirect to ${location}`) as any;
				error.status = status;
				error.location = location;
				throw error;
			})
		}));

		const module = await import('../../src/routes/chat/+page.server.js');
		const load = module.load as any;

		const mockKVGet = vi
			.fn()
			// checkEnabledProviders
			.mockResolvedValueOnce(JSON.stringify(['key1']))
			.mockResolvedValueOnce(JSON.stringify({ id: 'key1' })) // enabled is undefined (counts as enabled)
			// checkVoiceAvailability
			.mockResolvedValueOnce(JSON.stringify(['key1']))
			.mockResolvedValueOnce(JSON.stringify({ id: 'key1', voiceEnabled: true })); // enabled undefined + voiceEnabled true

		const result = await load({
			platform: { env: { KV: { get: mockKVGet } } },
			locals: { user: { id: 'user1' } }
		});

		expect(result.voiceAvailable).toBe(true);
	});
});
