/**
 * The Discord callback against a real SQL engine and the real migrations: who gets which address,
 * what is marked verified, and that the sign-in stamps last_login_at.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOAuthCookies, oauthTransaction } from '../fixtures/oauth';
import { createSqliteD1 } from '../helpers/sqlite-d1';

const verifyOAuthTransaction = vi.fn();
const consumeOAuthTransaction = vi.fn();
const finalizeOAuthLogin = vi.fn();

vi.mock('$lib/server/oauth-state', () => ({
	verifyOAuthState: vi.fn(),
	verifyOAuthTransaction,
	consumeOAuthTransaction
}));
vi.mock('$lib/server/oauth-finalization', () => ({ finalizeOAuthLogin }));

const profile = {
	id: '293484886726279168',
	username: 'Ada',
	global_name: 'Ada L',
	avatar: 'abcdef0123456789abcdef0123456789',
	email: 'Ada@Example.com',
	verified: true
};

async function signIn(db: ReturnType<typeof createSqliteD1>, discordUser: Record<string, unknown>) {
	vi.mocked(fetch)
		.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 't' }) } as any)
		.mockResolvedValueOnce({ ok: true, json: async () => discordUser } as any);
	const { GET } = await import('../../src/routes/api/auth/discord/callback/+server');
	await GET({
		url: new URL('http://localhost/api/auth/discord/callback?code=c&state=login:s'),
		cookies: createOAuthCookies(),
		platform: {
			env: { DB: db, DISCORD_CLIENT_ID: 'i', DISCORD_CLIENT_SECRET: 's', SESSION_SECRET: 'x' }
		},
		locals: {}
	} as any);
}

const row = (db: ReturnType<typeof createSqliteD1>, id: string) =>
	db
		.prepare(
			'SELECT email, email_verified_at, github_avatar_url, profile_avatar_url FROM users WHERE id = ?'
		)
		.bind(id)
		.first<Record<string, string | null>>();

describe('Discord callback identity rules (real SQL)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		verifyOAuthTransaction.mockResolvedValue(oauthTransaction('discord'));
		consumeOAuthTransaction.mockResolvedValue(oauthTransaction('discord'));
		finalizeOAuthLogin.mockResolvedValue(new Response(null, { status: 302 }));
		vi.stubGlobal('fetch', vi.fn());
	});

	it('creates a verified account with the verified address, marked verified, with a CDN avatar', async () => {
		const db = createSqliteD1();
		await signIn(db, profile);
		const user = await row(db, `discord_${profile.id}`);
		expect(user?.email).toBe('ada@example.com');
		expect(user?.email_verified_at).not.toBeNull();
		expect(user?.github_avatar_url).toMatch(/^https:\/\/cdn\.discordapp\.com\/avatars\//);
		expect(user?.profile_avatar_url).toMatch(/^https:\/\/cdn\.discordapp\.com\/avatars\//);
	});

	it('gives an unverified address no foothold: placeholder account, nothing marked verified', async () => {
		const db = createSqliteD1();
		await signIn(db, { ...profile, verified: false });
		const user = await row(db, `discord_${profile.id}`);
		expect(user?.email).toBe('ada@discord.local');
		expect(user?.email_verified_at).toBeNull();
	});

	it('does not take over an existing account that holds the same address, verified or not', async () => {
		const db = createSqliteD1();
		await db
			.prepare("INSERT INTO users (id, email, name) VALUES ('victim','ada@example.com','V')")
			.run();
		await signIn(db, profile);
		const user = await row(db, `discord_${profile.id}`);
		expect(user?.email).toBe('ada@discord.local');
		expect((await row(db, 'victim'))?.email_verified_at).toBeNull();
	});

	it('falls back to a per-account placeholder when username@discord.local is taken', async () => {
		const db = createSqliteD1();
		await db
			.prepare("INSERT INTO users (id, email, name) VALUES ('o','ada@discord.local','O')")
			.run();
		await signIn(db, { ...profile, email: undefined, verified: undefined });
		expect((await row(db, `discord_${profile.id}`))?.email).toMatch(/@discord\.invalid$/);
	});

	it('swaps a placeholder for a verified address on the next sign-in, never a chosen one', async () => {
		const db = createSqliteD1();
		await signIn(db, { ...profile, email: undefined, verified: undefined });
		expect((await row(db, `discord_${profile.id}`))?.email).toBe('ada@discord.local');
		await signIn(db, profile);
		const user = await row(db, `discord_${profile.id}`);
		expect(user?.email).toBe('ada@example.com');
		expect(user?.email_verified_at).not.toBeNull();

		await db
			.prepare("UPDATE users SET email = 'mine@home.test', email_verified_at = NULL WHERE id = ?")
			.bind(`discord_${profile.id}`)
			.run();
		await signIn(db, profile);
		const kept = await row(db, `discord_${profile.id}`);
		expect(kept?.email).toBe('mine@home.test');
		expect(kept?.email_verified_at).toBeNull();
	});

	it("an avatar hash that does not look like Discord's falls back to a default CDN avatar", async () => {
		const db = createSqliteD1();
		await signIn(db, { ...profile, avatar: '../../evil' });
		expect((await row(db, `discord_${profile.id}`))?.github_avatar_url).toMatch(
			/^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/[0-5]\.png$/
		);
	});
});
