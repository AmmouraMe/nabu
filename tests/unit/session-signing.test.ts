import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	encodePayload,
	resolveSessionSecret,
	signSession,
	verifySession
} from '../../src/lib/server/session';

const SECRET = 'test-secret-value';

describe('session cookie signing', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('round-trips a signed session', async () => {
		const data = { id: '123', login: 'david', isOwner: true, isAdmin: true };
		const cookie = await signSession(data, SECRET);

		expect(cookie).toContain('.');
		await expect(verifySession(cookie, SECRET)).resolves.toEqual(data);
	});

	it('produces a URL-safe cookie value', async () => {
		// Payload chosen to make the base64 hit + and / before the URL-safe swap.
		const cookie = await signSession({ id: '???>>>???', name: 'ü~/+' }, SECRET);
		expect(cookie).toMatch(/^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/);
	});

	// The actual vulnerability: a bare base64 payload with no signature was accepted
	// as a session, so anyone could self-assign isOwner.
	it('rejects an unsigned legacy cookie', async () => {
		const forged = encodePayload({ id: 'attacker', isOwner: true, isAdmin: true });
		await expect(verifySession(forged, SECRET)).resolves.toBeNull();
	});

	it('rejects a tampered payload', async () => {
		const cookie = await signSession({ id: '123', isOwner: false }, SECRET);
		const signature = cookie.slice(cookie.lastIndexOf('.') + 1);
		const swapped = encodePayload({ id: '123', isOwner: true });

		await expect(verifySession(`${swapped}.${signature}`, SECRET)).resolves.toBeNull();
	});

	it('rejects a cookie signed with a different secret', async () => {
		const cookie = await signSession({ id: '123' }, 'attacker-secret');
		await expect(verifySession(cookie, SECRET)).resolves.toBeNull();
	});

	it('rejects malformed cookies without throwing', async () => {
		for (const bad of ['', 'no-separator', '.leading', 'trailing.', 'a.b', 'not base64 at all']) {
			await expect(verifySession(bad, SECRET)).resolves.toBeNull();
		}
		await expect(verifySession(undefined, SECRET)).resolves.toBeNull();
		await expect(verifySession(null, SECRET)).resolves.toBeNull();
	});

	it('rejects a validly signed cookie whose payload is not JSON', async () => {
		// Signature is genuine, so this exercises the post-verify JSON.parse guard.
		const payload = encodePayload('plain string');
		const signed = await signSession('plain string', SECRET);
		expect(signed.startsWith(payload)).toBe(true);
		await expect(verifySession(signed, SECRET)).resolves.toBe('plain string');
	});
});

describe('secret resolution', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('prefers a configured secret', () => {
		expect(resolveSessionSecret('real')).toBe('real');
	});

	it('falls back to the dev secret and warns when unset', () => {
		// import.meta.env.DEV is true under vitest, mirroring `vite dev`.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(resolveSessionSecret(undefined)).toBeTruthy();
		expect(resolveSessionSecret('')).toBeTruthy();
		expect(warn).toHaveBeenCalled();
	});

	it('verifies nothing when no secret can be resolved', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const cookie = await signSession({ id: '1' }, SECRET);
		// Simulate production-without-secret: the dev fallback is compiled out there,
		// so resolution returns null and verification must fail closed.
		const original = import.meta.env.DEV;
		try {
			(import.meta.env as { DEV: boolean }).DEV = false;
			await expect(verifySession(cookie, undefined)).resolves.toBeNull();
			await expect(signSession({ id: '1' }, undefined)).rejects.toThrow(/SESSION_SECRET/);
		} finally {
			(import.meta.env as { DEV: boolean }).DEV = original;
		}
	});
});
