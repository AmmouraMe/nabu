import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { ensureSessionUserRecord } from '$lib/utils/db';
import { verifySession } from '$lib/server/session';
import { normalizeTier } from '$lib/utils/pricing';

// Auth handling hook
const authHandler: Handle = async ({ event, resolve }) => {
	const sessionCookie = event.cookies.get('session');

	if (sessionCookie) {
		// The cookie carries the session itself, so it must be proven server-issued
		// before any of it is trusted. This previously base64-decoded the cookie
		// straight into locals.user, which let anyone self-assign isOwner/isAdmin and
		// walk through every admin guard. verifySession returns null for a cookie that
		// is unsigned, tampered with, or signed by another secret.
		const sessionData = await verifySession<App.Locals['user']>(
			sessionCookie,
			event.platform?.env?.SESSION_SECRET
		);

		if (!sessionData) {
			event.cookies.delete('session', { path: '/' });
		} else {
			// Re-derive isAdmin from the database where possible. Note this is a
			// refresh, not a check: ensureSessionUserRecord seeds a new row from the
			// session, so it can only narrow rights that were legitimately issued —
			// the signature above is what makes the claim trustworthy in the first place.
			// Nothing signs a plan into the cookie, and nothing should start: dropping it
			// here means the only path to a paid tier is the users row read below, so a
			// cookie is never the reason someone is on Business.
			sessionData.plan = undefined;

			if (event.platform?.env?.DB) {
				try {
					await ensureSessionUserRecord(event.platform.env.DB, sessionData);

					const userRecord = await event.platform.env.DB.prepare(
						'SELECT is_admin, plan FROM users WHERE id = ?'
					)
						.bind(sessionData.id)
						.first<{ is_admin: number; plan: string | null }>();

					if (userRecord) {
						// Plan comes from the row and is never read back off the cookie: a
						// seven-day session outlives a downgrade, and a stale paid plan is
						// exactly the claim that must not survive one. Left undefined when
						// the lookup fails, which entitlements treats as the free tier.
						sessionData.plan = normalizeTier(userRecord.plan);

						// The owner is always an admin. Without the `|| isOwner`, this
						// refresh silently demotes them: an owner identified by
						// GITHUB_OWNER_ID / DISCORD_OWNER_ID need not carry is_admin = 1
						// in the row, so a freshly created owner would come back
						// isOwner: true, isAdmin: false and still be refused by every
						// admin route that gates on isAdmin. It also means an accidental
						// demote in Admin → Users cannot lock the owner out.
						sessionData.isAdmin = userRecord.is_admin === 1 || sessionData.isOwner === true;
					}
				} catch {
					// Database error - continue with session data from cookie
				}
			}

			event.locals.user = sessionData;
		}
	}

	return resolve(event);
};

// Combine all hooks
export const handle = sequence(authHandler);
