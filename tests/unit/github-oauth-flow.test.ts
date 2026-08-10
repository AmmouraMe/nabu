import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalUser, createOAuthCookies, createOAuthDb } from '../fixtures/oauth';

const createSession = vi.fn();
const replaceSession = vi.fn();
const deleteSession = vi.fn();
const resolveOwnerStatus = vi.fn();

vi.mock('$lib/utils/db', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/utils/db')>()),
	createSession,
	replaceSession,
	deleteSession
}));
vi.mock('$lib/server/auth-identity', () => ({ resolveOwnerStatus }));

describe('OAuth session finalization', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		createSession.mockResolvedValue({ token: 'new-session-token' });
		replaceSession.mockResolvedValue({ token: 'rotated-session-token' });
		resolveOwnerStatus.mockResolvedValue(false);
	});

	function setup(user = canonicalUser) {
		const db = createOAuthDb((query) => ({ first: query.includes('FROM users') ? user : null }));
		const KV = { get: vi.fn().mockResolvedValue(null), put: vi.fn() };
		return {
			db,
			platform: { env: { DB: db, KV, SESSION_SECRET: 'test-session-secret' } } as any,
			KV
		};
	}

	it('creates a revocable database session and redirects regular users home', async () => {
		const { db, platform } = setup();
		const { finalizeOAuthLogin } = await import('../../src/lib/server/oauth-finalization');
		const response = await finalizeOAuthLogin({
			db: db as any,
			platform,
			url: new URL('http://localhost/api/auth/github/callback'),
			userId: canonicalUser.id
		});
		expect(createSession).toHaveBeenCalledWith(db, canonicalUser.id, 7);
		expect(response.headers.get('Location')).toBe('http://localhost/');
		expect(response.headers.get('Set-Cookie')).toMatch(/session=.*HttpOnly.*SameSite=Lax/);
	});

	it('rotates the bound session after linking and redirects to profile', async () => {
		const { db, platform } = setup();
		const { finalizeOAuthLogin } = await import('../../src/lib/server/oauth-finalization');
		const response = await finalizeOAuthLogin({
			db: db as any,
			platform,
			url: new URL('https://nabu.example/api/auth/github/callback'),
			userId: canonicalUser.id,
			currentSessionToken: 'old-token',
			linkedProvider: 'github'
		});
		expect(replaceSession).toHaveBeenCalledWith(db, canonicalUser.id, 'old-token', 7);
		expect(response.headers.get('Location')).toBe('https://nabu.example/profile?linked=github');
		expect(response.headers.get('Set-Cookie')).toContain('Secure');
	});

	it('redirects admins to admin and records an owner first login once', async () => {
		resolveOwnerStatus.mockResolvedValue(true);
		const { db, platform, KV } = setup({ ...canonicalUser, is_admin: 1 });
		const { finalizeOAuthLogin } = await import('../../src/lib/server/oauth-finalization');
		const response = await finalizeOAuthLogin({
			db: db as any,
			platform,
			url: new URL('http://localhost/callback'),
			userId: canonicalUser.id
		});
		expect(response.headers.get('Location')).toBe('http://localhost/admin');
		expect(KV.put).toHaveBeenCalledWith('admin_first_login_completed', 'true');
	});

	it('fails when reconciliation returns a missing user', async () => {
		const { db, platform } = setup(null as any);
		const { finalizeOAuthLogin } = await import('../../src/lib/server/oauth-finalization');
		await expect(
			finalizeOAuthLogin({
				db: db as any,
				platform,
				url: new URL('http://localhost/callback'),
				userId: 'missing'
			})
		).rejects.toThrow('OAuth user disappeared');
	});
});

describe('logout revocation', () => {
	it.each(['GET', 'POST'] as const)('revokes the D1 session on %s', async (method) => {
		const cookies = createOAuthCookies();
		const db = createOAuthDb();
		const session = await import('../../src/lib/server/session');
		const signed = await session.signSession({ token: 'session-token' }, 'test-session-secret');
		cookies.get.mockReturnValue(signed);
		const route = await import('../../src/routes/api/auth/logout/+server');
		await expect(
			route[method]({
				cookies,
				platform: { env: { DB: db, SESSION_SECRET: 'test-session-secret' } }
			} as any)
		).rejects.toMatchObject({ status: 302, location: '/auth/login' });
		expect(deleteSession).toHaveBeenCalledWith(db, 'session-token');
		expect(cookies.delete).toHaveBeenCalledWith('session', { path: '/' });
	});
});
