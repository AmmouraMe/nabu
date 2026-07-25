import { error } from '@sveltejs/kit';
import { signSession } from '$lib/server/session';
import type { RequestHandler } from './$types';

/**
 * Dev-only "virtual login" — mints an authenticated session without any OAuth
 * provider keys. Handy on the dev tunnel, where real GitHub/Discord OAuth
 * secrets aren't configured.
 *
 * Hard-gated to the Vite dev build via `import.meta.env.DEV`, which is
 * statically `false` in `vite build` / production, so this endpoint returns 404
 * once deployed. A deployed dev/staging Worker can still opt in explicitly by
 * setting `ALLOW_DEV_LOGIN=true`.
 *
 * Usage:
 *   /api/auth/dev                         → log in as an admin dev user
 *   /api/auth/dev?admin=0                 → log in as a regular (non-admin) user
 *   /api/auth/dev?email=a@b.co&name=Ann   → custom identity
 *   /api/auth/dev?redirect=/brand         → where to land after login
 */
export const GET: RequestHandler = async ({ url, platform }) => {
	const devAllowed = import.meta.env.DEV || platform?.env?.ALLOW_DEV_LOGIN === 'true';
	if (!devAllowed) {
		throw error(404, 'Not found');
	}

	const asAdmin = url.searchParams.get('admin') !== '0';
	const email =
		url.searchParams.get('email')?.trim() ||
		(asAdmin ? 'dev-admin@nabu.local' : 'dev-user@nabu.local');
	const name = url.searchParams.get('name')?.trim() || (asAdmin ? 'Dev Admin' : 'Dev User');
	const login = url.searchParams.get('login')?.trim() || email.split('@')[0];
	// Stable id per identity so repeated logins reuse the same user row.
	const id = url.searchParams.get('id')?.trim() || `dev:${email.toLowerCase()}`;
	const redirectTo = url.searchParams.get('redirect') || (asAdmin ? '/admin' : '/');

	const sessionData = {
		id,
		login,
		name,
		email,
		avatarUrl: `https://api.dicebear.com/9.x/identicon/svg?seed=${encodeURIComponent(id)}`,
		isOwner: asAdmin,
		isAdmin: asAdmin
	};

	// If a D1 binding is available (local miniflare in dev), upsert the user so
	// the auth hook — which re-reads is_admin from the DB — agrees with the
	// cookie. Falls back to cookie-only auth if the DB is unavailable.
	if (platform?.env?.DB) {
		try {
			await platform.env.DB.prepare(
				`INSERT INTO users (id, email, name, is_admin, created_at, updated_at)
				 VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
				 ON CONFLICT(id) DO UPDATE SET
				   email = excluded.email,
				   name = excluded.name,
				   is_admin = excluded.is_admin,
				   updated_at = CURRENT_TIMESTAMP`
			)
				.bind(id, email, name, asAdmin ? 1 : 0)
				.run();
		} catch (err) {
			console.error('[dev-login] user upsert failed, continuing on cookie only:', err);
		}
	}

	// Signed, matching the real OAuth callbacks' cookie format.
	const sessionCookie = await signSession(sessionData, platform?.env?.SESSION_SECRET);

	const isSecure = url.protocol === 'https:';
	const cookieParts = [
		`session=${sessionCookie}`,
		'Path=/',
		'HttpOnly',
		'SameSite=Lax',
		`Max-Age=${60 * 60 * 24 * 7}` // 7 days
	];
	if (isSecure) {
		cookieParts.push('Secure');
	}

	return new Response(null, {
		status: 302,
		headers: {
			Location: new URL(redirectTo, url.origin).toString(),
			'Set-Cookie': cookieParts.join('; ')
		}
	});
};
