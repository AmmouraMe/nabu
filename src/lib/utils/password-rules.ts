/**
 * What counts as an acceptable password.
 *
 * Shared rather than living in `$lib/server/password.ts` because the signup form
 * needs the same rule the endpoint enforces, and a Svelte component cannot import
 * from `$lib/server` — SvelteKit refuses, correctly, since that code would then ship
 * to the browser. Keeping the numbers here means the form and the server cannot
 * disagree about what it will accept.
 *
 * The client check is a courtesy that saves a round trip. The server runs the same
 * function on the way in and does not trust that the client ran it.
 */

/**
 * Length rather than composition ("one uppercase, one digit, one symbol"), because
 * composition rules reliably produce `Password1!` and are worth less than the extra
 * characters they cost.
 */
export const MIN_PASSWORD_LENGTH = 10;

/**
 * An upper bound so a very long string cannot be used to burn CPU. PBKDF2 reads its
 * input on every one of 100,000 iterations of HMAC.
 */
export const MAX_PASSWORD_LENGTH = 256;

/** Why a password was rejected, or null when it is fine. */
export function passwordProblem(password: unknown): string | null {
	if (typeof password !== 'string' || password.length === 0) {
		return 'Password is required.';
	}
	if (password.length < MIN_PASSWORD_LENGTH) {
		return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
	}
	if (password.length > MAX_PASSWORD_LENGTH) {
		return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
	}
	if (password.trim().length === 0) {
		return 'Password cannot be only whitespace.';
	}
	return null;
}
