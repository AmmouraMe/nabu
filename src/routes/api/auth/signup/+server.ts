/**
 * POST /api/auth/signup — create an email/password account.
 *
 * The page at `/auth/signup` used to collect a name, an email and a password, wait a
 * second on a `setTimeout`, log them to the browser console and tell the user
 * nothing. No account was created; the only working way in was OAuth. This is the
 * endpoint that page should always have been calling.
 *
 * Two things it deliberately does not do:
 *
 * - **It cannot make an admin.** `is_admin` is written as 0, never from the request.
 *   Ownership is decided by matching an OAuth account id against GITHUB_OWNER_ID /
 *   DISCORD_OWNER_ID, and there is no self-service path to it.
 * - **It cannot choose a plan.** `plan` is left to the column default (`starter`),
 *   so a new account arrives on the free tier and everything in
 *   `$lib/server/entitlements` applies to it from the first request.
 */

import { error, json } from '@sveltejs/kit';
import { buildSessionCookie } from '$lib/server/auth-cookie';
import { hashPassword, passwordProblem, resolveIterations } from '$lib/server/password';
import { FREE_TIER } from '$lib/utils/pricing';
import type { RequestHandler } from './$types';

/** Good enough to reject a typo; the address is not trusted for anything yet. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_NAME_LENGTH = 100;

// Not exported: SvelteKit rejects any export from a `+server.ts` that is not a
// method handler or one of its known options, and does so at request time — which
// unit tests calling POST() directly never see.
function normalizeEmail(raw: unknown): string {
	return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

export const POST: RequestHandler = async ({ request, platform, url }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Account creation is unavailable right now.');

	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		throw error(400, 'Expected a JSON body.');
	}

	const email = normalizeEmail(body.email);
	if (!EMAIL_PATTERN.test(email)) {
		throw error(400, 'Enter a valid email address.');
	}

	const password = body.password;
	const problem = passwordProblem(password);
	if (problem) throw error(400, problem);

	const rawName = typeof body.name === 'string' ? body.name.trim() : '';
	if (rawName.length > MAX_NAME_LENGTH) {
		throw error(400, `Name must be at most ${MAX_NAME_LENGTH} characters.`);
	}
	const name = rawName || email.split('@')[0];

	// Checked before hashing so a probe for an existing address does not cost us
	// 100,000 rounds of PBKDF2. The unique index below is what actually prevents a
	// duplicate — this is only the fast path.
	const existing = await db
		.prepare('SELECT id FROM users WHERE email = ?')
		.bind(email)
		.first<{ id: string }>();
	if (existing) {
		throw error(409, 'An account with that email already exists. Try signing in.');
	}

	const id = crypto.randomUUID();
	const passwordHash = await hashPassword(
		password as string,
		resolveIterations(platform?.env?.PASSWORD_ITERATIONS)
	);

	try {
		await db
			.prepare(
				`INSERT INTO users (id, email, name, password_hash, is_admin, plan, created_at, updated_at)
				 VALUES (?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
			)
			.bind(id, email, name, passwordHash, FREE_TIER)
			.run();
	} catch (err) {
		// The unique index on `email` is the real guard against two signups racing for
		// the same address; both would pass the SELECT above.
		const message = err instanceof Error ? err.message : '';
		if (/UNIQUE|constraint/i.test(message)) {
			throw error(409, 'An account with that email already exists. Try signing in.');
		}
		throw err;
	}

	const cookie = await buildSessionCookie(
		{
			id,
			login: email.split('@')[0],
			name,
			email,
			isOwner: false,
			isAdmin: false,
			plan: FREE_TIER
		},
		platform?.env?.SESSION_SECRET,
		url
	);

	return json(
		{ ok: true, user: { id, email, name }, plan: FREE_TIER, redirect: '/onboarding' },
		{ status: 201, headers: { 'Set-Cookie': cookie } }
	);
};
