/**
 * Password hashing for email/password accounts.
 *
 * The `users.password_hash` column has existed since the initial schema and nothing
 * ever wrote to it: `/auth/signup` and `/auth/login` were both `console.log` stubs
 * that pretended to work, so the only real way into the app was OAuth. This is the
 * missing half.
 *
 * **PBKDF2-HMAC-SHA-256**, because it is what Workers actually have. bcrypt, scrypt
 * and Argon2 are not in WebCrypto and would each mean shipping WASM into every
 * request's cold start; PBKDF2 is native and constant-time by construction.
 *
 * **On the iteration count.** OWASP's guidance for PBKDF2-HMAC-SHA-256 is 600,000,
 * which we do not use, and the reason is CPU budget rather than judgement: hashing
 * runs inside the request, and a Worker gets 10ms of CPU on the free plan (30s on
 * paid). 100,000 iterations costs roughly 40ms of CPU — already past the free-plan
 * ceiling, and 600,000 would be six times that. The count is stored *inside* every
 * hash, so raising it is a one-line change that leaves existing logins working:
 * old hashes keep verifying at their own count, and `needsRehash()` says which ones
 * to upgrade next time the plaintext is in hand. Override with `PASSWORD_ITERATIONS`
 * once the deployment's plan is known.
 */

const encoder = new TextEncoder();

/** Default work factor. See the note above before changing it. */
export const DEFAULT_ITERATIONS = 100_000;

const SALT_BYTES = 16;
const KEY_BITS = 256;
const SCHEME = 'pbkdf2';
const DIGEST = 'sha256';

// The acceptance rules live in $lib/utils/password-rules so the signup form can
// apply the same ones — a component may not import from $lib/server. Re-exported
// here so server callers have a single import.
export {
	MIN_PASSWORD_LENGTH,
	MAX_PASSWORD_LENGTH,
	passwordProblem
} from '$lib/utils/password-rules';

function toBase64(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
		'deriveBits'
	]);
	const bits = await crypto.subtle.deriveBits(
		// Copied into a fresh view: TS 5.7 made `Uint8Array` generic over its buffer,
		// and a plain `Uint8Array` (backed by `ArrayBufferLike`, which admits
		// `SharedArrayBuffer`) no longer satisfies `BufferSource`.
		{ name: 'PBKDF2', salt: new Uint8Array(salt), iterations, hash: 'SHA-256' },
		key,
		KEY_BITS
	);
	return new Uint8Array(bits);
}

/**
 * Hash a password into a self-describing string:
 *
 *   pbkdf2$sha256$100000$<salt base64>$<derived key base64>
 *
 * Self-describing so the parameters can change without a migration — the verifier
 * reads them back out of the stored value rather than assuming today's constants.
 */
export async function hashPassword(
	password: string,
	iterations: number = DEFAULT_ITERATIONS
): Promise<string> {
	const salt = new Uint8Array(SALT_BYTES);
	crypto.getRandomValues(salt);
	const derived = await derive(password, salt, iterations);
	return [SCHEME, DIGEST, iterations, toBase64(salt), toBase64(derived)].join('$');
}

/** Constant-time equality. Compares every byte even once they differ. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
	return diff === 0;
}

/**
 * Check a password against a stored hash.
 *
 * Returns false — never throws — for a missing, malformed, or unknown-scheme hash.
 * A row whose `password_hash` is null is an OAuth-only account, and "you cannot log
 * in this way" is the correct answer for it, not a 500.
 */
export async function verifyPassword(
	password: string,
	stored: string | null | undefined
): Promise<boolean> {
	if (!stored) return false;

	const parts = stored.split('$');
	if (parts.length !== 5) return false;

	const [scheme, digest, iterationsRaw, saltRaw, hashRaw] = parts;
	if (scheme !== SCHEME || digest !== DIGEST) return false;

	const iterations = Number(iterationsRaw);
	if (!Number.isInteger(iterations) || iterations <= 0) return false;

	try {
		const salt = fromBase64(saltRaw);
		const expected = fromBase64(hashRaw);
		const actual = await derive(password, salt, iterations);
		return timingSafeEqual(actual, expected);
	} catch {
		return false;
	}
}

/** Whether a stored hash is weaker than what we mint today and should be upgraded. */
export function needsRehash(
	stored: string | null | undefined,
	target = DEFAULT_ITERATIONS
): boolean {
	if (!stored) return false;
	const parts = stored.split('$');
	if (parts.length !== 5) return true;
	if (parts[0] !== SCHEME || parts[1] !== DIGEST) return true;
	const iterations = Number(parts[2]);
	return !Number.isInteger(iterations) || iterations < target;
}

/** Read the configured work factor, falling back to the default for anything invalid. */
export function resolveIterations(raw: string | undefined | null): number {
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed < 1_000) return DEFAULT_ITERATIONS;
	return parsed;
}
