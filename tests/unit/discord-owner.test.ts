import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifySession } from '../../src/lib/server/session';

// Mock console to avoid noise
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

const SECRET = 'test-session-secret';
const OWNER_ID = '293484886726279168';

/**
 * Owner rights for Discord logins.
 *
 * Before `DISCORD_OWNER_ID` existed, the callback hardcoded `isOwner: false` for
 * every Discord-only session, because owner was derived solely from a GitHub
 * account id and a Discord snowflake can never equal one. These cover the new
 * path and, just as importantly, that it stays closed by default.
 */
describe('Discord callback - owner rights', () => {
	let mockFetch: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
		vi.stubGlobal('crypto', {
			randomUUID: () => 'test-uuid-123',
			subtle: globalThis.__REAL_SUBTLE__
		});
		mockFetch = vi.fn();
		vi.stubGlobal('fetch', mockFetch);
	});

	/** Queue the two upstream calls the callback makes: token exchange, then user. */
	function mockDiscordUser(id: string) {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ access_token: 'test-token' })
		});
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					id,
					username: 'davis9001',
					global_name: 'David',
					email: 'david@example.com',
					avatar: 'abcdef'
				})
		});
	}

	function buildEvent(env: Record<string, unknown>) {
		return {
			url: new URL('http://localhost/api/auth/discord/callback?code=test-code'),
			cookies: { get: vi.fn().mockReturnValue(null), set: vi.fn() },
			platform: {
				env: {
					DISCORD_CLIENT_ID: 'cid',
					DISCORD_CLIENT_SECRET: 'csecret',
					SESSION_SECRET: SECRET,
					...env
				}
			}
		};
	}

	/** Pull the signed session out of Set-Cookie and verify it properly. */
	async function sessionFrom(response: Response) {
		const setCookie = response.headers.get('Set-Cookie') ?? '';
		const raw = setCookie.split(';')[0].replace(/^session=/, '');
		return verifySession<Record<string, unknown>>(raw, SECRET);
	}

	it('grants owner and admin when the Discord id matches DISCORD_OWNER_ID', async () => {
		mockDiscordUser(OWNER_ID);
		const { GET } = await import('../../src/routes/api/auth/discord/callback/+server');

		const response = await GET(buildEvent({ DISCORD_OWNER_ID: OWNER_ID }) as any);
		const session = await sessionFrom(response);

		expect(session).not.toBeNull();
		expect(session!.isOwner).toBe(true);
		// isAdmin must ride along, or the owner still cannot reach admin-only routes.
		expect(session!.isAdmin).toBe(true);
		expect(session!.id).toBe(`discord_${OWNER_ID}`);
	});

	it('does not grant owner to a different Discord account', async () => {
		mockDiscordUser('999999999999999999');
		const { GET } = await import('../../src/routes/api/auth/discord/callback/+server');

		const response = await GET(buildEvent({ DISCORD_OWNER_ID: OWNER_ID }) as any);
		const session = await sessionFrom(response);

		expect(session!.isOwner).toBe(false);
		expect(session!.isAdmin).toBe(false);
	});

	it('fails closed when DISCORD_OWNER_ID is unset and KV has nothing', async () => {
		mockDiscordUser(OWNER_ID);
		const { GET } = await import('../../src/routes/api/auth/discord/callback/+server');

		const response = await GET(buildEvent({ KV: { get: vi.fn().mockResolvedValue(null) } }) as any);
		const session = await sessionFrom(response);

		expect(session!.isOwner).toBe(false);
	});

	it('falls back to the KV discord_owner_id when the env var is unset', async () => {
		mockDiscordUser(OWNER_ID);
		const kv = {
			get: vi.fn().mockImplementation((key: string) => {
				if (key === 'discord_owner_id') return Promise.resolve(OWNER_ID);
				return Promise.resolve(null);
			})
		};
		const { GET } = await import('../../src/routes/api/auth/discord/callback/+server');

		const response = await GET(buildEvent({ KV: kv }) as any);
		const session = await sessionFrom(response);

		expect(kv.get).toHaveBeenCalledWith('discord_owner_id');
		expect(session!.isOwner).toBe(true);
	});

	it('survives a KV failure without granting owner', async () => {
		mockDiscordUser(OWNER_ID);
		const kv = { get: vi.fn().mockRejectedValue(new Error('KV down')) };
		const { GET } = await import('../../src/routes/api/auth/discord/callback/+server');

		const response = await GET(buildEvent({ KV: kv }) as any);
		const session = await sessionFrom(response);

		expect(session!.isOwner).toBe(false);
	});

	it('compares snowflakes as strings, beyond MAX_SAFE_INTEGER', async () => {
		// Two ids that are distinct as strings but collide once coerced to Number.
		const a = '9007199254740993';
		const b = '9007199254740992';
		expect(Number(a)).toBe(Number(b)); // the trap this guards against

		mockDiscordUser(a);
		const { GET } = await import('../../src/routes/api/auth/discord/callback/+server');

		const response = await GET(buildEvent({ DISCORD_OWNER_ID: b }) as any);
		const session = await sessionFrom(response);

		expect(session!.isOwner).toBe(false);
	});
});
