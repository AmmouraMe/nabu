import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for AI Keys Reorder API Endpoint
 * TDD: Tests for drag-and-drop reordering of AI provider keys
 */

describe('AI Keys Reorder API', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	describe('POST /api/admin/ai-keys/reorder', () => {
		it('should return 403 when user is not admin or owner', async () => {
			const { POST } = await import('../../src/routes/api/admin/ai-keys/reorder/+server');

			await expect(
				POST({
					request: new Request('http://localhost', {
						method: 'POST',
						body: JSON.stringify({ order: ['a', 'b'] })
					}),
					platform: {},
					locals: { user: { id: '1', isOwner: false, isAdmin: false } }
				} as any)
			).rejects.toThrow();
		});

		it('should return 403 when user is null', async () => {
			const { POST } = await import('../../src/routes/api/admin/ai-keys/reorder/+server');

			await expect(
				POST({
					request: new Request('http://localhost', {
						method: 'POST',
						body: JSON.stringify({ order: ['a'] })
					}),
					platform: {},
					locals: {}
				} as any)
			).rejects.toThrow();
		});

		it('should allow owner to reorder', async () => {
			const mockKV = {
				get: vi.fn().mockResolvedValue(JSON.stringify(['key-1', 'key-2', 'key-3'])),
				put: vi.fn().mockResolvedValue(undefined)
			};

			const { POST } = await import('../../src/routes/api/admin/ai-keys/reorder/+server');

			const response = await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ order: ['key-3', 'key-1', 'key-2'] })
				}),
				platform: { env: { KV: mockKV } },
				locals: { user: { id: '1', isOwner: true } }
			} as any);

			const result = await response.json();
			expect(result.success).toBe(true);
			expect(result.order).toEqual(['key-3', 'key-1', 'key-2']);
			expect(mockKV.put).toHaveBeenCalledWith(
				'ai_keys_list',
				JSON.stringify(['key-3', 'key-1', 'key-2'])
			);
		});

		it('should allow admin to reorder', async () => {
			const mockKV = {
				get: vi.fn().mockResolvedValue(JSON.stringify(['a', 'b'])),
				put: vi.fn().mockResolvedValue(undefined)
			};

			const { POST } = await import('../../src/routes/api/admin/ai-keys/reorder/+server');

			const response = await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ order: ['b', 'a'] })
				}),
				platform: { env: { KV: mockKV } },
				locals: { user: { id: '1', isOwner: false, isAdmin: true } }
			} as any);

			const result = await response.json();
			expect(result.success).toBe(true);
		});

		it('should reject empty order array', async () => {
			const { POST } = await import('../../src/routes/api/admin/ai-keys/reorder/+server');

			await expect(
				POST({
					request: new Request('http://localhost', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ order: [] })
					}),
					platform: { env: { KV: {} } },
					locals: { user: { id: '1', isOwner: true } }
				} as any)
			).rejects.toThrow();
		});

		it('should reject non-array order', async () => {
			const { POST } = await import('../../src/routes/api/admin/ai-keys/reorder/+server');

			await expect(
				POST({
					request: new Request('http://localhost', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ order: 'not-an-array' })
					}),
					platform: { env: { KV: {} } },
					locals: { user: { id: '1', isOwner: true } }
				} as any)
			).rejects.toThrow();
		});

		it('should reject when KV not available', async () => {
			const { POST } = await import('../../src/routes/api/admin/ai-keys/reorder/+server');

			await expect(
				POST({
					request: new Request('http://localhost', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ order: ['a'] })
					}),
					platform: { env: {} },
					locals: { user: { id: '1', isOwner: true } }
				} as any)
			).rejects.toThrow();
		});

		it('should reject when no existing keys list', async () => {
			const mockKV = {
				get: vi.fn().mockResolvedValue(null)
			};

			const { POST } = await import('../../src/routes/api/admin/ai-keys/reorder/+server');

			await expect(
				POST({
					request: new Request('http://localhost', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ order: ['a'] })
					}),
					platform: { env: { KV: mockKV } },
					locals: { user: { id: '1', isOwner: true } }
				} as any)
			).rejects.toThrow();
		});

		it('should reject order with missing keys', async () => {
			const mockKV = {
				get: vi.fn().mockResolvedValue(JSON.stringify(['key-1', 'key-2', 'key-3']))
			};

			const { POST } = await import('../../src/routes/api/admin/ai-keys/reorder/+server');

			await expect(
				POST({
					request: new Request('http://localhost', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ order: ['key-1', 'key-2'] })
					}),
					platform: { env: { KV: mockKV } },
					locals: { user: { id: '1', isOwner: true } }
				} as any)
			).rejects.toThrow();
		});

		it('should reject order with unknown keys', async () => {
			const mockKV = {
				get: vi.fn().mockResolvedValue(JSON.stringify(['key-1', 'key-2']))
			};

			const { POST } = await import('../../src/routes/api/admin/ai-keys/reorder/+server');

			await expect(
				POST({
					request: new Request('http://localhost', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ order: ['key-1', 'key-unknown'] })
					}),
					platform: { env: { KV: mockKV } },
					locals: { user: { id: '1', isOwner: true } }
				} as any)
			).rejects.toThrow();
		});

		it('should reject order with duplicate keys', async () => {
			const mockKV = {
				get: vi.fn().mockResolvedValue(JSON.stringify(['key-1', 'key-2']))
			};

			const { POST } = await import('../../src/routes/api/admin/ai-keys/reorder/+server');

			await expect(
				POST({
					request: new Request('http://localhost', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ order: ['key-1', 'key-1'] })
					}),
					platform: { env: { KV: mockKV } },
					locals: { user: { id: '1', isOwner: true } }
				} as any)
			).rejects.toThrow();
		});

		it('should preserve order with single key', async () => {
			const mockKV = {
				get: vi.fn().mockResolvedValue(JSON.stringify(['only-key'])),
				put: vi.fn().mockResolvedValue(undefined)
			};

			const { POST } = await import('../../src/routes/api/admin/ai-keys/reorder/+server');

			const response = await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ order: ['only-key'] })
				}),
				platform: { env: { KV: mockKV } },
				locals: { user: { id: '1', isOwner: true } }
			} as any);

			const result = await response.json();
			expect(result.success).toBe(true);
			expect(result.order).toEqual(['only-key']);
		});
	});

	describe('Priority order behavior', () => {
		it('should pick the first enabled key in list order (getEnabledOpenAIKey)', async () => {
			const mockKV = {
				get: vi.fn().mockImplementation((key: string) => {
					if (key === 'ai_keys_list')
						return JSON.stringify(['key-anthropic', 'key-openai-1', 'key-openai-2']);
					if (key === 'ai_key:key-anthropic')
						return JSON.stringify({
							id: 'key-anthropic',
							provider: 'anthropic',
							enabled: true,
							apiKey: 'sk-ant'
						});
					if (key === 'ai_key:key-openai-1')
						return JSON.stringify({
							id: 'key-openai-1',
							provider: 'openai',
							enabled: true,
							apiKey: 'sk-1'
						});
					if (key === 'ai_key:key-openai-2')
						return JSON.stringify({
							id: 'key-openai-2',
							provider: 'openai',
							enabled: true,
							apiKey: 'sk-2'
						});
					return null;
				})
			};

			const { getEnabledOpenAIKey } = await import('../../src/lib/services/openai-chat');

			const result = await getEnabledOpenAIKey({ env: { KV: mockKV } } as any);
			expect(result?.id).toBe('key-openai-1');
			expect(result?.apiKey).toBe('sk-1');
		});

		it('should skip disabled keys and use next enabled', async () => {
			const mockKV = {
				get: vi.fn().mockImplementation((key: string) => {
					if (key === 'ai_keys_list') return JSON.stringify(['key-1', 'key-2']);
					if (key === 'ai_key:key-1')
						return JSON.stringify({
							id: 'key-1',
							provider: 'openai',
							enabled: false,
							apiKey: 'sk-1'
						});
					if (key === 'ai_key:key-2')
						return JSON.stringify({
							id: 'key-2',
							provider: 'openai',
							enabled: true,
							apiKey: 'sk-2'
						});
					return null;
				})
			};

			const { getEnabledOpenAIKey } = await import('../../src/lib/services/openai-chat');

			const result = await getEnabledOpenAIKey({ env: { KV: mockKV } } as any);
			expect(result?.id).toBe('key-2');
		});

		it('should respect reordered list for priority', async () => {
			// Simulates after reorder: key-2 is now first
			const mockKV = {
				get: vi.fn().mockImplementation((key: string) => {
					if (key === 'ai_keys_list') return JSON.stringify(['key-2', 'key-1']);
					if (key === 'ai_key:key-1')
						return JSON.stringify({
							id: 'key-1',
							provider: 'openai',
							enabled: true,
							apiKey: 'sk-1'
						});
					if (key === 'ai_key:key-2')
						return JSON.stringify({
							id: 'key-2',
							provider: 'openai',
							enabled: true,
							apiKey: 'sk-2'
						});
					return null;
				})
			};

			const { getEnabledOpenAIKey } = await import('../../src/lib/services/openai-chat');

			const result = await getEnabledOpenAIKey({ env: { KV: mockKV } } as any);
			expect(result?.id).toBe('key-2');
			expect(result?.apiKey).toBe('sk-2');
		});
	});
});
