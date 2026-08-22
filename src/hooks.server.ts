import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { findValidSession } from '$lib/utils/db';
import { decodeDatabaseSessionCookie } from '$lib/server/session';
import { resolveOwnerStatus } from '$lib/server/auth-identity';
import { normalizeTier } from '$lib/utils/pricing';

// Auth handling hook
export const authHandler: Handle = async ({ event, resolve }) => {
	const sessionCookie = event.cookies.get('session');

	if (sessionCookie) {
		try {
			const db = event.platform?.env?.DB;
			if (!db) throw new Error('Session database unavailable');
			const token = await decodeDatabaseSessionCookie(
				sessionCookie,
				event.platform?.env?.SESSION_SECRET
			);
			if (!token) throw new Error('Invalid session cookie');
			const session = await findValidSession(db, token);
			if (!session) throw new Error('Session expired or revoked');
			const user = await db
				.prepare(
					'SELECT id, email, name, profile_login, profile_avatar_url, github_login, github_avatar_url, is_admin, plan FROM users WHERE id = ?'
				)
				.bind(session.user_id)
				.first<{
					id: string;
					email: string;
					name: string | null;
					profile_login: string | null;
					profile_avatar_url: string | null;
					github_login: string | null;
					github_avatar_url: string | null;
					is_admin: number;
					plan: string | null;
				}>();
			if (!user) throw new Error('Session user missing');
			const isOwner = await resolveOwnerStatus(event.platform, user);
			event.locals.user = {
				id: user.id,
				login:
					user.profile_login ||
					user.github_login ||
					user.name ||
					user.email.split('@')[0] ||
					user.email,
				email: user.email,
				name: user.name || undefined,
				avatarUrl: user.profile_avatar_url || user.github_avatar_url || undefined,
				isOwner,
				// The owner is always an admin. Without `|| isOwner` a freshly created
				// owner — identified by GITHUB_OWNER_ID / DISCORD_OWNER_ID rather than by
				// is_admin = 1 — would be refused by every route that gates on isAdmin,
				// and an accidental demote in Admin → Users could lock them out.
				isAdmin: user.is_admin === 1 || isOwner,
				// Read from the row, every request. Under the database-backed session
				// the cookie carries nothing but an opaque token, so a stale paid plan
				// cannot survive a downgrade the way it could when the cookie held the
				// identity — the invariant the previous hook had to enforce by hand is
				// now structural. Undefined when the column is empty, which entitlements
				// treats as the free tier.
				plan: normalizeTier(user.plan)
			};
		} catch {
			delete event.locals.user;
			event.cookies.delete('session', { path: '/' });
		}
	}

	return resolve(event);
};

// Combine all hooks
export const handle = sequence(authHandler);
