/**
 * Compare a presented credential against a configured secret without leaking,
 * through response timing, how much of it matched. Both sides are hashed first
 * so the comparison always runs over two 32-byte digests, whatever the lengths
 * of the inputs. An empty or missing secret never matches — an unset
 * `CRON_SECRET` must not turn `Authorization: Bearer ` into a valid call.
 */
const encoder = new TextEncoder();

async function digest(value: string): Promise<Uint8Array> {
	return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

export async function secretsEqual(
	presented: string | null | undefined,
	expected: string | null | undefined
): Promise<boolean> {
	if (!expected || typeof presented !== 'string') return false;
	const [a, b] = await Promise.all([digest(presented), digest(expected)]);
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
	return diff === 0;
}

/** The token from an `Authorization: Bearer <token>` header, or null. */
export function bearerToken(header: string | null | undefined): string | null {
	if (!header || !header.startsWith('Bearer ')) return null;
	return header.slice(7);
}
