/**
 * Password hashing — `src/lib/server/password.ts` and the shared rules it re-exports.
 *
 * Iteration counts are kept low in these tests where the count is not the point:
 * PBKDF2 at the production factor is ~40ms of CPU per call by design, and a suite
 * that hashes thirty times would spend a second doing nothing interesting.
 */
import { describe, it, expect } from 'vitest';
import {
	DEFAULT_ITERATIONS,
	hashPassword,
	MAX_PASSWORD_LENGTH,
	MIN_PASSWORD_LENGTH,
	needsRehash,
	passwordProblem,
	resolveIterations,
	verifyPassword
} from '../../src/lib/server/password';

const FAST = 1_000;

describe('passwordProblem', () => {
	it('accepts a reasonable password', () => {
		expect(passwordProblem('correct horse battery')).toBeNull();
		expect(passwordProblem('a'.repeat(MIN_PASSWORD_LENGTH))).toBeNull();
	});

	it('rejects nothing at all', () => {
		expect(passwordProblem(undefined)).toBe('Password is required.');
		expect(passwordProblem(null)).toBe('Password is required.');
		expect(passwordProblem('')).toBe('Password is required.');
		expect(passwordProblem(12345678901)).toBe('Password is required.');
	});

	it('rejects one that is too short', () => {
		const problem = passwordProblem('a'.repeat(MIN_PASSWORD_LENGTH - 1));
		expect(problem).toContain(String(MIN_PASSWORD_LENGTH));
	});

	it('rejects one long enough to be a denial of service', () => {
		const problem = passwordProblem('a'.repeat(MAX_PASSWORD_LENGTH + 1));
		expect(problem).toContain(String(MAX_PASSWORD_LENGTH));
	});

	it('rejects whitespace padding masquerading as length', () => {
		expect(passwordProblem('              ')).toBe('Password cannot be only whitespace.');
	});
});

describe('hashPassword', () => {
	it('produces a self-describing hash', async () => {
		const hash = await hashPassword('correct horse battery', FAST);
		const parts = hash.split('$');

		expect(parts).toHaveLength(5);
		expect(parts[0]).toBe('pbkdf2');
		expect(parts[1]).toBe('sha256');
		expect(Number(parts[2])).toBe(FAST);
		expect(parts[3].length).toBeGreaterThan(0);
		expect(parts[4].length).toBeGreaterThan(0);
	});

	it('never stores the password', async () => {
		const hash = await hashPassword('correct horse battery', FAST);
		expect(hash).not.toContain('correct');
		expect(hash).not.toContain('horse');
	});

	it('salts, so the same password hashes differently every time', async () => {
		const a = await hashPassword('correct horse battery', FAST);
		const b = await hashPassword('correct horse battery', FAST);
		expect(a).not.toBe(b);
		// …and both still verify.
		expect(await verifyPassword('correct horse battery', a)).toBe(true);
		expect(await verifyPassword('correct horse battery', b)).toBe(true);
	});

	it('defaults to the production work factor', async () => {
		const hash = await hashPassword('correct horse battery');
		expect(Number(hash.split('$')[2])).toBe(DEFAULT_ITERATIONS);
	});
});

describe('verifyPassword', () => {
	it('accepts the right password', async () => {
		const hash = await hashPassword('correct horse battery', FAST);
		expect(await verifyPassword('correct horse battery', hash)).toBe(true);
	});

	it('rejects the wrong one', async () => {
		const hash = await hashPassword('correct horse battery', FAST);
		expect(await verifyPassword('correct horse batter', hash)).toBe(false);
		expect(await verifyPassword('Correct horse battery', hash)).toBe(false);
		expect(await verifyPassword('', hash)).toBe(false);
	});

	it('verifies a hash made at a different work factor', async () => {
		// The count travels with the hash, so raising it never locks anyone out.
		const old = await hashPassword('correct horse battery', FAST);
		const newer = await hashPassword('correct horse battery', FAST * 2);
		expect(await verifyPassword('correct horse battery', old)).toBe(true);
		expect(await verifyPassword('correct horse battery', newer)).toBe(true);
	});

	it('returns false for an account with no password rather than throwing', async () => {
		// An OAuth-only row has password_hash NULL; "you cannot log in this way" is the
		// right answer, not a 500.
		expect(await verifyPassword('anything', null)).toBe(false);
		expect(await verifyPassword('anything', undefined)).toBe(false);
		expect(await verifyPassword('anything', '')).toBe(false);
	});

	it('returns false for a malformed or unknown hash', async () => {
		expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
		expect(await verifyPassword('x', 'pbkdf2$sha256$1000$onlyfour')).toBe(false);
		expect(await verifyPassword('x', 'bcrypt$sha256$1000$c2FsdA==$aGFzaA==')).toBe(false);
		expect(await verifyPassword('x', 'pbkdf2$sha512$1000$c2FsdA==$aGFzaA==')).toBe(false);
		expect(await verifyPassword('x', 'pbkdf2$sha256$zero$c2FsdA==$aGFzaA==')).toBe(false);
		expect(await verifyPassword('x', 'pbkdf2$sha256$0$c2FsdA==$aGFzaA==')).toBe(false);
		expect(await verifyPassword('x', 'pbkdf2$sha256$-5$c2FsdA==$aGFzaA==')).toBe(false);
	});

	it('returns false for base64 that will not decode', async () => {
		expect(await verifyPassword('x', 'pbkdf2$sha256$1000$!!!!$!!!!')).toBe(false);
	});
});

describe('needsRehash', () => {
	it('is true for a hash weaker than the target', async () => {
		expect(needsRehash(await hashPassword('correct horse battery', FAST), FAST * 2)).toBe(true);
	});

	it('is false for a hash at or above the target', async () => {
		expect(needsRehash(await hashPassword('correct horse battery', FAST), FAST)).toBe(false);
		expect(needsRehash(await hashPassword('correct horse battery', FAST * 2), FAST)).toBe(false);
	});

	it('is true for anything it cannot read, so it gets replaced', () => {
		expect(needsRehash('garbage')).toBe(true);
		expect(needsRehash('bcrypt$sha256$1000$c2FsdA==$aGFzaA==')).toBe(true);
		expect(needsRehash('pbkdf2$sha512$1000$c2FsdA==$aGFzaA==')).toBe(true);
		expect(needsRehash('pbkdf2$sha256$nope$c2FsdA==$aGFzaA==')).toBe(true);
	});

	it('is false when there is no password to rehash', () => {
		expect(needsRehash(null)).toBe(false);
		expect(needsRehash(undefined)).toBe(false);
	});
});

describe('resolveIterations', () => {
	it('uses a configured count', () => {
		expect(resolveIterations('250000')).toBe(250_000);
	});

	it('falls back to the default for anything unusable', () => {
		expect(resolveIterations(undefined)).toBe(DEFAULT_ITERATIONS);
		expect(resolveIterations(null)).toBe(DEFAULT_ITERATIONS);
		expect(resolveIterations('')).toBe(DEFAULT_ITERATIONS);
		expect(resolveIterations('lots')).toBe(DEFAULT_ITERATIONS);
		expect(resolveIterations('1.5')).toBe(DEFAULT_ITERATIONS);
	});

	it('refuses a count low enough to be pointless', () => {
		// A misconfigured `PASSWORD_ITERATIONS=1` must not silently weaken every hash.
		expect(resolveIterations('1')).toBe(DEFAULT_ITERATIONS);
		expect(resolveIterations('999')).toBe(DEFAULT_ITERATIONS);
		expect(resolveIterations('-100000')).toBe(DEFAULT_ITERATIONS);
	});
});
