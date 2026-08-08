import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Discord OAuth Init - Extended Branch Coverage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	describe('GET /api/auth/discord', () => {
		it('should fail closed when KV cannot be read', async () => {
			const mockEvent = {
				platform: {
					env: {
						DISCORD_CLIENT_ID: undefined,
						SESSION_SECRET: 'test-session-secret',
						KV: {
							get: vi.fn().mockRejectedValue(new Error('KV Error'))
						}
					}
				},
				url: new URL('http://localhost:4277/api/auth/discord')
			};

			const { GET } = await import('../../src/routes/api/auth/discord/+server');

			try {
				await GET(mockEvent as any);
				expect.fail('Should have thrown redirect');
			} catch (err: any) {
				// Should redirect to setup with error
				expect(err.status).toBe(302);
				expect(err.location).toContain('/setup');
			}

		});

		it('should use KV clientId when env var not set', async () => {
			const mockEvent = {
				platform: {
					env: {
						DISCORD_CLIENT_ID: undefined,
						SESSION_SECRET: 'test-session-secret',
						DB: {
							prepare: vi.fn().mockReturnValue({
								bind: vi.fn().mockReturnValue({ run: vi.fn().mockResolvedValue(undefined) })
							})
						},
						KV: {
							get: vi.fn().mockResolvedValue(
								JSON.stringify({
									clientId: 'kv-client-id',
									clientSecret: 'kv-secret'
								})
							)
						}
					}
				},
				url: new URL('http://localhost:4277/api/auth/discord'),
				cookies: {
					get: vi.fn(),
					set: vi.fn()
				},
				locals: {}
			};

			const { GET } = await import('../../src/routes/api/auth/discord/+server');

			try {
				await GET(mockEvent as any);
				expect.fail('Should have thrown redirect');
			} catch (err: any) {
				// Should redirect to Discord OAuth
				expect(err.status).toBe(302);
				expect(err.location).toContain('discord.com');
				expect(err.location).toContain('kv-client-id');
			}
		});
	});
});
