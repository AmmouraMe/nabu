import { error } from '@sveltejs/kit';
import { buildDatabaseSessionCookieHeader } from '$lib/server/session';
import { createSession } from '$lib/utils/db';
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

	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Development session database is unavailable');
	try {
		await db
			.prepare(
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
	} catch {
		throw error(503, 'Development session database is unavailable');
	}
	const session = await createSession(db, id, 7);
	const destination = redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/';

	return new Response(null, {
		status: 302,
		headers: {
			Location: new URL(destination, url.origin).toString(),
			'Set-Cookie': await buildDatabaseSessionCookieHeader(
				session.token,
				url,
				platform.env.SESSION_SECRET
			)
		}
	});
};
