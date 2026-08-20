import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for AI Keys Account Info Endpoint
 * TDD: Tests for balance checking and usage tracking per AI provider key
 */

// Mock global fetch for provider API calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('AI Keys Account Info API', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
		mockFetch.mockReset();
	});

	describe('GET /api/admin/ai-keys/[id]/account-info', () => {
		it('should return 403 when user is not admin', async () => {
			const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');

			await expect(
				GET({
					params: { id: 'test-id' },
					platform: {},
					locals: { user: { id: '1', isOwner: false, isAdmin: false } }
				} as any)
			).rejects.toThrow();
		});

		it('should return 404 when key not found in KV', async () => {
			const mockKV = {
				get: vi.fn().mockResolvedValue(null)
			};

			const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');

			await expect(
				GET({
					params: { id: 'nonexistent' },
					platform: { env: { KV: mockKV } },
					locals: { user: { id: '1', isOwner: true } }
				} as any)
			).rejects.toThrow();
		});

		it('should fetch WaveSpeed balance successfully', async () => {
			const mockKV = {
				get: vi.fn().mockResolvedValue(
					JSON.stringify({
						id: 'ws-key-1',
						provider: 'wavespeed',
						apiKey: 'ws-test-key-123',
						name: 'WaveSpeed Key'
					})
				)
			};

			const mockDB = {
				prepare: vi.fn().mockReturnValue({
					bind: vi.fn().mockReturnValue({
						all: vi.fn().mockResolvedValue({ results: [] })
					})
				})
			};

			// Mock the WaveSpeed balance API response
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ data: { balance: 45.23 } })
			});

			const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');

			const response = await GET({
				params: { id: 'ws-key-1' },
				platform: { env: { KV: mockKV, DB: mockDB } },
				locals: { user: { id: '1', isOwner: true } }
			} as any);

			const result = await response.json();
			expect(result.balance.available).toBe(true);
			expect(result.balance.amount).toBe(45.23);
			expect(mockFetch).toHaveBeenCalledWith(
				'https://api.wavespeed.ai/api/v3/balance',
				expect.objectContaining({
					headers: expect.objectContaining({
						Authorization: 'Bearer ws-test-key-123'
					})
				})
			);
		});

		it('should handle WaveSpeed balance API failure gracefully', async () => {
			const mockKV = {
				get: vi.fn().mockResolvedValue(
					JSON.stringify({
						id: 'ws-key-1',
						provider: 'wavespeed',
						apiKey: 'ws-bad-key',
						name: 'WaveSpeed Key'
					})
				)
			};

			const mockDB = {
				prepare: vi.fn().mockReturnValue({
					bind: vi.fn().mockReturnValue({
						all: vi.fn().mockResolvedValue({ results: [] })
					})
				})
			};

			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 401,
				text: async () => 'Unauthorized'
			});

			const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');

			const response = await GET({
				params: { id: 'ws-key-1' },
				platform: { env: { KV: mockKV, DB: mockDB } },
				locals: { user: { id: '1', isOwner: true } }
			} as any);

			const result = await response.json();
			expect(result.balance.available).toBe(false);
			expect(result.balance.reason).toContain('401');
		});

		it('should try OpenAI billing endpoint for OpenAI provider', async () => {
			const mockKV = {
				get: vi.fn().mockResolvedValue(
					JSON.stringify({
						id: 'oai-key-1',
						provider: 'openai',
						apiKey: 'sk-test-key-123',
						name: 'OpenAI Key'
					})
				)
			};

			const mockDB = {
				prepare: vi.fn().mockReturnValue({
					bind: vi.fn().mockReturnValue({
						all: vi.fn().mockResolvedValue({ results: [] })
					})
				})
			};

			// Mock OpenAI costs endpoint
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					object: 'page',
					data: [
						{
							start_time: 1709251200,
							end_time: 1709337600,
							results: [{ amount: { value: 250, currency: 'usd' } }]
						}
					]
				})
			});

			const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');

			const response = await GET({
				params: { id: 'oai-key-1' },
				platform: { env: { KV: mockKV, DB: mockDB } },
				locals: { user: { id: '1', isOwner: true } }
			} as any);

			const result = await response.json();
			// Should have attempted to fetch OpenAI costs
			expect(mockFetch).toHaveBeenCalled();
			// Result should have a balance property
			expect(result).toHaveProperty('balance');
			expect(result).toHaveProperty('usage');
		});

		it('should return local usage data from D1', async () => {
			const mockKV = {
				get: vi.fn().mockResolvedValue(
					JSON.stringify({
						id: 'oai-key-1',
						provider: 'openai',
						apiKey: 'sk-test-key-123',
						name: 'OpenAI Key'
					})
				)
			};

			const mockDB = {
				prepare: vi.fn().mockReturnValue({
					bind: vi.fn().mockReturnValue({
						all: vi.fn().mockResolvedValue({
							results: [
								{ day: '2026-03-10', total_cost: 2.5, request_count: 15 },
								{ day: '2026-03-11', total_cost: 1.8, request_count: 10 },
								{ day: '2026-03-12', total_cost: 3.2, request_count: 22 }
							]
						})
					})
				})
			};

			// Mock OpenAI - fail so we get local-only data
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 403,
				text: async () => 'Forbidden'
			});

			const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');

			const response = await GET({
				params: { id: 'oai-key-1' },
				platform: { env: { KV: mockKV, DB: mockDB } },
				locals: { user: { id: '1', isOwner: true } }
			} as any);

			const result = await response.json();
			expect(result.usage.available).toBe(true);
			expect(result.usage.daily).toHaveLength(3);
			expect(result.usage.daily[0]).toEqual({
				date: '2026-03-10',
				cost: 2.5,
				requests: 15
			});
		});

		it('should fetch Anthropic usage data successfully', async () => {
			const mockKV = {
				get: vi.fn().mockResolvedValue(
					JSON.stringify({
						id: 'ant-key-1',
						provider: 'anthropic',
						apiKey: 'sk-ant-test-key-123',
						name: 'Anthropic Key'
					})
				)
			};

			const mockDB = {
				prepare: vi.fn().mockReturnValue({
					bind: vi.fn().mockReturnValue({
						all: vi.fn().mockResolvedValue({ results: [] })
					})
				})
			};

			// Mock Anthropic token counting endpoint for key validation
			mockFetch.mockResolvedValueOnce({
				ok: true,
				headers: new Map([
					['anthropic-ratelimit-requests-limit', '1000'],
					['anthropic-ratelimit-requests-remaining', '950'],
					['anthropic-ratelimit-tokens-limit', '100000'],
					['anthropic-ratelimit-tokens-remaining', '98000']
				]),
				json: async () => ({ input_tokens: 4 })
			});

			const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');

			const response = await GET({
				params: { id: 'ant-key-1' },
				platform: { env: { KV: mockKV, DB: mockDB } },
				locals: { user: { id: '1', isOwner: true } }
			} as any);

			const result = await response.json();
			expect(result.balance.available).toBe(true);
			expect(result.balance).toHaveProperty('rateLimits');
			expect(mockFetch).toHaveBeenCalledWith(
				'https://api.anthropic.com/v1/messages/count_tokens',
				expect.objectContaining({
					headers: expect.objectContaining({
						'x-api-key': 'sk-ant-test-key-123'
					})
				})
			);
		});

		it('should handle Anthropic API failure gracefully', async () => {
			const mockKV = {
				get: vi.fn().mockResolvedValue(
					JSON.stringify({
						id: 'ant-key-2',
						provider: 'anthropic',
						apiKey: 'sk-ant-bad-key',
						name: 'Bad Anthropic Key'
					})
				)
			};

			const mockDB = {
				prepare: vi.fn().mockReturnValue({
					bind: vi.fn().mockReturnValue({
						all: vi.fn().mockResolvedValue({ results: [] })
					})
				})
			};

			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 401,
				text: async () => 'Invalid API key'
			});

			const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');

			const response = await GET({
				params: { id: 'ant-key-2' },
				platform: { env: { KV: mockKV, DB: mockDB } },
				locals: { user: { id: '1', isOwner: true } }
			} as any);

			const result = await response.json();
			expect(result.balance.available).toBe(false);
			expect(result.balance.reason).toContain('401');
		});

		it('should report balance not available for unsupported providers', async () => {
			const mockKV = {
				get: vi.fn().mockResolvedValue(
					JSON.stringify({
						id: 'mis-key-1',
						provider: 'mistral',
						apiKey: 'mistral-test-key',
						name: 'Mistral Key'
					})
				)
			};

			const mockDB = {
				prepare: vi.fn().mockReturnValue({
					bind: vi.fn().mockReturnValue({
						all: vi.fn().mockResolvedValue({ results: [] })
					})
				})
			};

			const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');

			const response = await GET({
				params: { id: 'mis-key-1' },
				platform: { env: { KV: mockKV, DB: mockDB } },
				locals: { user: { id: '1', isOwner: true } }
			} as any);

			const result = await response.json();
			expect(result.balance.available).toBe(false);
			expect(result.balance.reason).toContain('not supported');
		});

		it('should handle missing KV gracefully', async () => {
			const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');

			await expect(
				GET({
					params: { id: 'test-id' },
					platform: { env: {} },
					locals: { user: { id: '1', isOwner: true } }
				} as any)
			).rejects.toThrow();
		});

		it('should handle missing DB gracefully for usage', async () => {
			const mockKV = {
				get: vi.fn().mockResolvedValue(
					JSON.stringify({
						id: 'ant-key-1',
						provider: 'anthropic',
						apiKey: 'sk-ant-test',
						name: 'Anthropic Key'
					})
				)
			};

			// Mock Anthropic token counting endpoint
			mockFetch.mockResolvedValueOnce({
				ok: true,
				headers: new Map([
					['anthropic-ratelimit-requests-limit', '1000'],
					['anthropic-ratelimit-requests-remaining', '999'],
					['anthropic-ratelimit-tokens-limit', '100000'],
					['anthropic-ratelimit-tokens-remaining', '100000']
				]),
				json: async () => ({ input_tokens: 4 })
			});

			const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');

			const response = await GET({
				params: { id: 'ant-key-1' },
				platform: { env: { KV: mockKV } },
				locals: { user: { id: '1', isOwner: true } }
			} as any);

			const result = await response.json();
			expect(result.usage.available).toBe(false);
		});
	});
});
