/**
 * Extended tests for GitHub OAuth initiation endpoint
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock modules
vi.mock('@sveltejs/kit', async () => {
	const actual = await vi.importActual('@sveltejs/kit');
	return {
		...actual,
		redirect: vi.fn((status: number, location: string) => {
			const error = new Error(`Redirect to ${location}`) as Error & {
				status: number;
				location: string;
			};
			error.status = status;
			error.location = location;
			throw error;
		})
	};
});

import { GET } from '../../src/routes/api/auth/github/+server';

describe('GitHub OAuth Initiation - Extended Coverage', () => {
	let mockKVGet: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockKVGet = vi.fn();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	const createMockEvent = (
		overrides: {
			envClientId?: string | null;
			kvGet?: ReturnType<typeof vi.fn>;
			platform?: object | null;
		} = {}
	) => {
		const DB = {
			prepare: vi.fn().mockReturnValue({
				bind: vi.fn().mockReturnValue({ run: vi.fn().mockResolvedValue(undefined) })
			})
		};
		return {
			url: new URL('http://localhost/api/auth/github'),
			cookies: { get: vi.fn(), set: vi.fn() },
			locals: {},
			platform:
				overrides.platform !== null
					? {
							env: {
								DB,
								SESSION_SECRET: 'test-session-secret',
								GITHUB_CLIENT_ID: overrides.envClientId,
								KV: overrides.kvGet
									? {
											get: overrides.kvGet
										}
									: undefined
							}
						}
					: overrides.platform
		};
	};

	it('should use environment variable clientId when available', async () => {
		await expect(
			GET(createMockEvent({ envClientId: 'env-client-id' }) as unknown as Parameters<typeof GET>[0])
		).rejects.toThrow('Redirect to https://github.com/login/oauth/authorize');
	});

	it('should fetch clientId from KV when env variable not set', async () => {
		mockKVGet.mockResolvedValue(JSON.stringify({ clientId: 'kv-client-id' }));

		await expect(
			GET(createMockEvent({ kvGet: mockKVGet }) as unknown as Parameters<typeof GET>[0])
		).rejects.toThrow('Redirect to https://github.com/login/oauth/authorize');

		expect(mockKVGet).toHaveBeenCalledWith('auth_config:github');
	});

	it('should redirect to setup when no clientId is available', async () => {
		mockKVGet.mockResolvedValue(null);

		await expect(
			GET(createMockEvent({ kvGet: mockKVGet }) as unknown as Parameters<typeof GET>[0])
		).rejects.toThrow('Redirect to /setup?error=oauth_not_configured');
	});

	it('should fail closed when KV cannot be read', async () => {
		mockKVGet.mockRejectedValue(new Error('KV error'));

		await expect(
			GET(createMockEvent({ kvGet: mockKVGet }) as unknown as Parameters<typeof GET>[0])
		).rejects.toThrow('Redirect to /setup?error=oauth_not_configured');

	});

	it('should redirect to setup when platform is not available', async () => {
		await expect(
			GET(createMockEvent({ platform: null }) as unknown as Parameters<typeof GET>[0])
		).rejects.toThrow('Redirect to /setup?error=oauth_not_configured');
	});

	it('should handle null stored config from KV', async () => {
		mockKVGet.mockResolvedValue(null);

		await expect(
			GET(createMockEvent({ kvGet: mockKVGet }) as unknown as Parameters<typeof GET>[0])
		).rejects.toThrow('Redirect to /setup?error=oauth_not_configured');
	});
});
