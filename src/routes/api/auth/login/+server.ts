/**
 * POST /api/auth/login — sign in with an email and password.
 *
 * The counterpart to `/api/auth/signup`. Like it, the page at `/auth/login` used to
 * collect credentials and `console.log` them.
 *
 * The failure path is uniform on purpose. An unknown address, an address that exists
 * but only has OAuth linked, and a genuinely wrong password all answer 401 with the
 * same sentence — and all three take the same time, because the no-such-user branch
 * still runs a PBKDF2 derivation against a decoy hash. Skipping that work would
 * return in a millisecond instead of forty and turn the endpoint into a way to
 * enumerate which addresses have accounts.
 */

import { error, json } from '@sveltejs/kit';
import { buildSessionCookie } from '$lib/server/auth-cookie';
import {
	clearFailures,
	clientAddress,
	isThrottled,
	recordFailure
} from '$lib/server/login-throttle';
import { hashPassword, needsRehash, resolveIterations, verifyPassword } from '$lib/server/password';
import { normalizeTier } from '$lib/utils/pricing';
import type { RequestHandler } from './$types';

/** One message for every way logging in can fail. */
const REJECTED = 'Email or password is incorrect.';

/**
 * A real hash of a value nobody knows, used to spend the same CPU on a missing
 * account as on a wrong password. Built once per isolate, at the default work
 * factor — the point is the derivation, not the secret.
 */
let decoyHash: Promise<string> | null = null;
function decoy(): Promise<string> {
	decoyHash ??= hashPassword(crypto.randomUUID());
	return decoyHash;
}

export const POST: RequestHandler = async ({ request, platform, url }) => {
	const db = platform?.env?.DB;
	if (!db) throw error(503, 'Signing in is unavailable right now.');

	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		throw error(400, 'Expected a JSON body.');
	}

	const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
	const password = typeof body.password === 'string' ? body.password : '';
	if (!email || !password) {
		throw error(400, 'Email and password are required.');
	}

	const kv = platform?.env?.KV;
	const ip = clientAddress(request);

	if (await isThrottled(kv, ip, email)) {
		throw error(429, 'Too many sign-in attempts. Try again in a few minutes.');
	}

	const row = await db
		.prepare('SELECT id, email, name, password_hash, is_admin, plan FROM users WHERE email = ?')
		.bind(email)
		.first<{
			id: string;
			email: string;
			name: string | null;
			password_hash: string | null;
			is_admin: number;
			plan: string | null;
		}>();

	// `row?.password_hash` is null for OAuth-only accounts, and verifyPassword
	// returns false for it — so those fall through to the decoy too, and an attacker
	// cannot tell "no account" from "account without a password".
	const stored = row?.password_hash ?? (await decoy());
	const valid = await verifyPassword(password, stored);

	if (!row || !valid) {
		await recordFailure(kv, ip, email);
		throw error(401, REJECTED);
	}

	await clearFailures(kv, ip, email);

	// Opportunistic upgrade: the plaintext is in hand exactly once per login, so a
	// hash minted at an older work factor is re-derived at the current one here or
	// not at all. Failure is not the user's problem — they authenticated.
	if (needsRehash(row.password_hash, resolveIterations(platform?.env?.PASSWORD_ITERATIONS))) {
		try {
			const upgraded = await hashPassword(
				password,
				resolveIterations(platform?.env?.PASSWORD_ITERATIONS)
			);
			await db
				.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
				.bind(upgraded, row.id)
				.run();
		} catch {
			// Keep the old hash; it still verifies.
		}
	}

	const plan = normalizeTier(row.plan);
	const isAdmin = row.is_admin === 1;

	const cookie = await buildSessionCookie(
		{
			id: row.id,
			login: row.email.split('@')[0],
			name: row.name ?? undefined,
			email: row.email,
			// Owner is an OAuth-identity fact (GITHUB_OWNER_ID / DISCORD_OWNER_ID), so a
			// password login never claims it. An owner who is also an admin in the row
			// still gets isAdmin, which is what the admin routes actually check.
			isOwner: false,
			isAdmin,
			plan
		},
		platform?.env?.SESSION_SECRET,
		url
	);

	return json(
		{
			ok: true,
			user: { id: row.id, email: row.email, name: row.name },
			plan,
			redirect: isAdmin ? '/admin' : '/'
		},
		{ headers: { 'Set-Cookie': cookie } }
	);
};
