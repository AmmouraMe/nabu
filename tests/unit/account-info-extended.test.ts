/**
 * Tests for AI Keys Account Info - Extended branch coverage
 * Covers Anthropic balance, OpenAI cost calculation, error paths, default provider
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('AI Keys Account Info - Extended Coverage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
		mockFetch.mockReset();
	});

	function createMockEnv(keyData: object) {
		return {
			KV: {
				get: vi.fn().mockResolvedValue(JSON.stringify(keyData))
			},
			DB: {
				prepare: vi.fn().mockReturnValue({
					bind: vi.fn().mockReturnValue({
						all: vi.fn().mockResolvedValue({ results: [] })
					})
				})
			}
		};
	}

	it('should fetch OpenAI cost data with bucket aggregation', async () => {
		const env = createMockEnv({
			id: 'key-1',
			provider: 'openai',
			apiKey: 'sk-test',
			name: 'OpenAI'
		});

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				data: [
					{
						results: [
							{ amount: { value: 500 } }, // 500 cents = $5
							{ amount: { value: 300 } } // 300 cents = $3
						]
					},
					{
						results: [
							{ amount: { value: 200 } } // 200 cents = $2
						]
					}
				]
			})
		});

		const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');
		const response = await GET({
			params: { id: 'key-1' },
			platform: { env },
			locals: { user: { id: '1', isOwner: true } }
		} as any);

		const data = await response.json();
		expect(data.balance.available).toBe(true);
		expect(data.balance.amount).toBe(10); // $5 + $3 + $2
		expect(data.balance.currency).toBe('usd');
	});

	it('should handle OpenAI API errors', async () => {
		const env = createMockEnv({
			id: 'key-1',
			provider: 'openai',
			apiKey: 'sk-test',
			name: 'OpenAI'
		});

		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 401,
			text: async () => 'Invalid API key'
		});

		const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');
		const response = await GET({
			params: { id: 'key-1' },
			platform: { env },
			locals: { user: { id: '1', isOwner: true } }
		} as any);

		const data = await response.json();
		expect(data.balance.available).toBe(false);
		expect(data.balance.reason).toContain('401');
	});

	it('should handle OpenAI fetch exception', async () => {
		const env = createMockEnv({
			id: 'key-1',
			provider: 'openai',
			apiKey: 'sk-test',
			name: 'OpenAI'
		});

		mockFetch.mockRejectedValueOnce(new Error('Network error'));

		const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');
		const response = await GET({
			params: { id: 'key-1' },
			platform: { env },
			locals: { user: { id: '1', isOwner: true } }
		} as any);

		const data = await response.json();
		expect(data.balance.available).toBe(false);
		expect(data.balance.reason).toBe('Network error');
	});

	it('should fetch Anthropic balance with rate limits from headers', async () => {
		const env = createMockEnv({
			id: 'key-1',
			provider: 'anthropic',
			apiKey: 'sk-ant-test',
			name: 'Anthropic'
		});

		const headers = new Headers({
			'anthropic-ratelimit-requests-limit': '1000',
			'anthropic-ratelimit-requests-remaining': '950',
			'anthropic-ratelimit-tokens-limit': '100000',
			'anthropic-ratelimit-tokens-remaining': '99000'
		});

		mockFetch.mockResolvedValueOnce({
			ok: true,
			headers,
			json: async () => ({ input_tokens: 5 })
		});

		const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');
		const response = await GET({
			params: { id: 'key-1' },
			platform: { env },
			locals: { user: { id: '1', isOwner: true } }
		} as any);

		const data = await response.json();
		expect(data.balance.available).toBe(true);
		expect(data.balance.rateLimits.requestsLimit).toBe(1000);
		expect(data.balance.rateLimits.tokensRemaining).toBe(99000);
	});

	it('should handle Anthropic API error response', async () => {
		const env = createMockEnv({
			id: 'key-1',
			provider: 'anthropic',
			apiKey: 'bad-key',
			name: 'Anthropic'
		});

		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 401,
			text: async () => 'Invalid API key'
		});

		const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');
		const response = await GET({
			params: { id: 'key-1' },
			platform: { env },
			locals: { user: { id: '1', isOwner: true } }
		} as any);

		const data = await response.json();
		expect(data.balance.available).toBe(false);
	});

	it('should handle Anthropic fetch exception', async () => {
		const env = createMockEnv({
			id: 'key-1',
			provider: 'anthropic',
			apiKey: 'bad-key',
			name: 'Anthropic'
		});

		mockFetch.mockRejectedValueOnce(new Error('Anthropic down'));

		const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');
		const response = await GET({
			params: { id: 'key-1' },
			platform: { env },
			locals: { user: { id: '1', isOwner: true } }
		} as any);

		const data = await response.json();
		expect(data.balance.available).toBe(false);
		expect(data.balance.reason).toBe('Anthropic down');
	});

	it('should handle unsupported provider', async () => {
		const env = createMockEnv({
			id: 'key-1',
			provider: 'unknown-provider',
			apiKey: 'key',
			name: 'Unknown'
		});

		const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');
		const response = await GET({
			params: { id: 'key-1' },
			platform: { env },
			locals: { user: { id: '1', isOwner: true } }
		} as any);

		const data = await response.json();
		expect(data.balance.available).toBe(false);
		expect(data.balance.reason).toContain('not supported');
	});

	it('should handle WaveSpeed balance with no data in response', async () => {
		const env = createMockEnv({
			id: 'key-1',
			provider: 'wavespeed',
			apiKey: 'ws-key',
			name: 'WaveSpeed'
		});

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ data: {} })
		});

		const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');
		const response = await GET({
			params: { id: 'key-1' },
			platform: { env },
			locals: { user: { id: '1', isOwner: true } }
		} as any);

		const data = await response.json();
		expect(data.balance.available).toBe(false);
		expect(data.balance.reason).toBe('Balance data not found in response');
	});

	it('should handle WaveSpeed API error', async () => {
		const env = createMockEnv({
			id: 'key-1',
			provider: 'wavespeed',
			apiKey: 'ws-key',
			name: 'WaveSpeed'
		});

		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 403,
			text: async () => 'Forbidden'
		});

		const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');
		const response = await GET({
			params: { id: 'key-1' },
			platform: { env },
			locals: { user: { id: '1', isOwner: true } }
		} as any);

		const data = await response.json();
		expect(data.balance.available).toBe(false);
		expect(data.balance.reason).toContain('403');
	});

	it('should handle WaveSpeed fetch exception with non-Error thrown', async () => {
		const env = createMockEnv({
			id: 'key-1',
			provider: 'wavespeed',
			apiKey: 'ws-key',
			name: 'WaveSpeed'
		});

		mockFetch.mockRejectedValueOnce('string error');

		const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');
		const response = await GET({
			params: { id: 'key-1' },
			platform: { env },
			locals: { user: { id: '1', isOwner: true } }
		} as any);

		const data = await response.json();
		expect(data.balance.available).toBe(false);
		expect(data.balance.reason).toBe('Failed to fetch balance');
	});

	it('should handle OpenAI response with empty data array', async () => {
		const env = createMockEnv({
			id: 'key-1',
			provider: 'openai',
			apiKey: 'sk-test',
			name: 'OpenAI'
		});

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ data: [] })
		});

		const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');
		const response = await GET({
			params: { id: 'key-1' },
			platform: { env },
			locals: { user: { id: '1', isOwner: true } }
		} as any);

		const data = await response.json();
		expect(data.balance.available).toBe(true);
		expect(data.balance.amount).toBe(0);
	});

	it('should handle OpenAI response with missing amount.value', async () => {
		const env = createMockEnv({
			id: 'key-1',
			provider: 'openai',
			apiKey: 'sk-test',
			name: 'OpenAI'
		});

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				data: [{ results: [{ amount: {} }, { amount: null }] }]
			})
		});

		const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');
		const response = await GET({
			params: { id: 'key-1' },
			platform: { env },
			locals: { user: { id: '1', isOwner: true } }
		} as any);

		const data = await response.json();
		expect(data.balance.available).toBe(true);
		expect(data.balance.amount).toBe(0);
	});

	it('should fetch local usage data with daily breakdown', async () => {
		const env = {
			KV: {
				get: vi.fn().mockResolvedValue(
					JSON.stringify({
						id: 'key-1',
						provider: 'wavespeed',
						apiKey: 'ws-key',
						name: 'WS'
					})
				)
			},
			DB: {
				prepare: vi.fn().mockReturnValue({
					bind: vi.fn().mockReturnValue({
						all: vi.fn().mockResolvedValue({
							results: [
								{ day: '2024-01-01', total_cost: 1.5, request_count: 10 },
								{ day: '2024-01-02', total_cost: 2.0, request_count: 15 }
							]
						})
					})
				})
			}
		};

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ data: { balance: 100 } })
		});

		const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');
		const response = await GET({
			params: { id: 'key-1' },
			platform: { env },
			locals: { user: { id: '1', isOwner: true } }
		} as any);

		const data = await response.json();
		expect(data.usage.available).toBe(true);
		expect(data.usage.totalCost).toBe(3.5);
		expect(data.usage.totalRequests).toBe(25);
	});

	it('should handle DB error in local usage gracefully', async () => {
		const env = {
			KV: {
				get: vi.fn().mockResolvedValue(
					JSON.stringify({
						id: 'key-1',
						provider: 'wavespeed',
						apiKey: 'ws-key',
						name: 'WS'
					})
				)
			},
			DB: {
				prepare: vi.fn().mockReturnValue({
					bind: vi.fn().mockReturnValue({
						all: vi.fn().mockRejectedValue(new Error('DB error'))
					})
				})
			}
		};

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ data: { balance: 100 } })
		});

		const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');
		const response = await GET({
			params: { id: 'key-1' },
			platform: { env },
			locals: { user: { id: '1', isOwner: true } }
		} as any);

		const data = await response.json();
		expect(data.usage.available).toBe(false);
	});

	it('should handle Anthropic non-Error exception', async () => {
		const env = createMockEnv({
			id: 'key-1',
			provider: 'anthropic',
			apiKey: 'sk-ant-test',
			name: 'Anthropic'
		});

		mockFetch.mockRejectedValueOnce('non-error value');

		const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');
		const response = await GET({
			params: { id: 'key-1' },
			platform: { env },
			locals: { user: { id: '1', isOwner: true } }
		} as any);

		const data = await response.json();
		expect(data.balance.available).toBe(false);
		expect(data.balance.reason).toBe('Failed to fetch Anthropic account info');
	});

	it('should handle Anthropic text() failure for error message', async () => {
		const env = createMockEnv({
			id: 'key-1',
			provider: 'anthropic',
			apiKey: 'sk-ant-test',
			name: 'Anthropic'
		});

		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 500,
			text: async () => {
				throw new Error('text() failed');
			}
		});

		const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');
		const response = await GET({
			params: { id: 'key-1' },
			platform: { env },
			locals: { user: { id: '1', isOwner: true } }
		} as any);

		const data = await response.json();
		expect(data.balance.available).toBe(false);
		expect(data.balance.reason).toContain('500');
	});

	it('should handle OpenAI non-Error exception', async () => {
		const env = createMockEnv({
			id: 'key-1',
			provider: 'openai',
			apiKey: 'sk-test',
			name: 'OpenAI'
		});

		mockFetch.mockRejectedValueOnce('string thrown');

		const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');
		const response = await GET({
			params: { id: 'key-1' },
			platform: { env },
			locals: { user: { id: '1', isOwner: true } }
		} as any);

		const data = await response.json();
		expect(data.balance.available).toBe(false);
		expect(data.balance.reason).toBe('Failed to fetch costs');
	});

	it('should handle WaveSpeed text() failure for error message', async () => {
		const env = createMockEnv({
			id: 'key-1',
			provider: 'wavespeed',
			apiKey: 'ws-key',
			name: 'WaveSpeed'
		});

		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 429,
			text: async () => {
				throw new Error('text() failed');
			}
		});

		const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');
		const response = await GET({
			params: { id: 'key-1' },
			platform: { env },
			locals: { user: { id: '1', isOwner: true } }
		} as any);

		const data = await response.json();
		expect(data.balance.available).toBe(false);
		expect(data.balance.reason).toContain('Unknown error');
	});
});
