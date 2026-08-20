/**
 * The one place that decides what a session cookie looks like.
 *
 * The OAuth callbacks each build this string by hand, and they have already drifted
 * from one another — the GitHub callback tests `url.protocol` directly for the
 * `Secure` flag while its own linked-account branch uses `isSecureRequest`, which
 * behind the dev tunnel disagree (the tunnel terminates TLS, so the Worker sees
 * plain HTTP on an https origin). New auth routes go through here instead of
 * copying a fourth variant.
 */

import { isSecureRequest } from '$lib/server/origin';
import { signSession } from '$lib/server/session';

/** Seven days, matching the OAuth callbacks. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export const SESSION_COOKIE_NAME = 'session';

/**
 * Sign `data` and render the `Set-Cookie` header for it.
 *
 * `HttpOnly` so script cannot read it, `SameSite=Lax` so it survives the OAuth
 * redirect back but is not sent on cross-site POSTs, and `Secure` whenever the
 * browser-visible origin is https.
 */
export async function buildSessionCookie(
	data: unknown,
	secret: string | undefined | null,
	url: URL
): Promise<string> {
	const value = await signSession(data, secret);
	const parts = [
		`${SESSION_COOKIE_NAME}=${value}`,
		'Path=/',
		'HttpOnly',
		'SameSite=Lax',
		`Max-Age=${SESSION_MAX_AGE_SECONDS}`
	];
	if (isSecureRequest(url)) parts.push('Secure');
	return parts.join('; ');
}
