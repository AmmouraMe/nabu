/**
 * The login brake — `src/lib/server/login-throttle.ts`.
 *
 * The behaviour worth pinning down is not "it counts": it is that the count is kept
 * per IP *and* per email (so one attacker cannot lock a real user out), and that a
 * KV outage fails open instead of taking sign-in down with it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import {
	clearFailures,
	clientAddress,
	isThrottled,
	MAX_ATTEMPTS,
	recordFailure,
	WINDOW_SECONDS
} from '../../src/lib/server/login-throttle';

function fakeKv() {
	const store = new Map<string, string>();
	const ttls = new Map<string, number>();
	return {
		store,
		ttls,
		kv: {
			get: vi.fn(async (key: string) => store.get(key) ?? null),
			put: vi.fn(async (key: string, value: string, opts?: { expirationTtl?: number }) => {
				store.set(key, value);
				if (opts?.expirationTtl) ttls.set(key, opts.expirationTtl);
			}),
			delete: vi.fn(async (key: string) => {
				store.delete(key);
			})
		} as unknown as KVNamespace
	};
}

const brokenKv = {
	get: vi.fn(async () => {
		throw new Error('kv down');
	}),
	put: vi.fn(async () => {
		throw new Error('kv down');
	}),
	delete: vi.fn(async () => {
		throw new Error('kv down');
	})
} as unknown as KVNamespace;

describe('clientAddress', () => {
	it('prefers the Cloudflare header', () => {
		const request = new Request('http://x', {
			headers: { 'cf-connecting-ip': '203.0.113.7', 'x-real-ip': '10.0.0.1' }
		});
		expect(clientAddress(request)).toBe('203.0.113.7');
	});

	it('falls back to x-real-ip', () => {
		const request = new Request('http://x', { headers: { 'x-real-ip': '10.0.0.1' } });
		expect(clientAddress(request)).toBe('10.0.0.1');
	});

	it('has a stable value when the address is unknown', () => {
		// Everyone unidentifiable shares one bucket, which is the conservative choice.
		expect(clientAddress(new Request('http://x'))).toBe('unknown');
	});
});

describe('isThrottled', () => {
	let fake: ReturnType<typeof fakeKv>;

	beforeEach(() => {
		fake = fakeKv();
	});

	it('lets a fresh caller through', async () => {
		expect(await isThrottled(fake.kv, '1.2.3.4', 'a@b.co')).toBe(false);
	});

	it('closes after the allowed number of failures', async () => {
		for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
			await recordFailure(fake.kv, '1.2.3.4', 'a@b.co');
		}
		expect(await isThrottled(fake.kv, '1.2.3.4', 'a@b.co')).toBe(false);

		await recordFailure(fake.kv, '1.2.3.4', 'a@b.co');
		expect(await isThrottled(fake.kv, '1.2.3.4', 'a@b.co')).toBe(true);
	});

	it('follows the address even when the email changes', async () => {
		// Credential stuffing works through a list of addresses, so counting only by
		// email would miss it entirely.
		for (let i = 0; i < MAX_ATTEMPTS; i++) {
			await recordFailure(fake.kv, '1.2.3.4', `victim${i}@b.co`);
		}
		expect(await isThrottled(fake.kv, '1.2.3.4', 'someone-new@b.co')).toBe(true);
	});

	it('follows the email even when the address changes', async () => {
		for (let i = 0; i < MAX_ATTEMPTS; i++) {
			await recordFailure(fake.kv, `10.0.0.${i}`, 'a@b.co');
		}
		expect(await isThrottled(fake.kv, '198.51.100.1', 'a@b.co')).toBe(true);
	});

	it('treats the email case-insensitively', async () => {
		for (let i = 0; i < MAX_ATTEMPTS; i++) {
			await recordFailure(fake.kv, '1.2.3.4', 'A@B.CO');
		}
		expect(await isThrottled(fake.kv, '9.9.9.9', 'a@b.co')).toBe(true);
	});

	it('expires the count rather than blocking forever', async () => {
		await recordFailure(fake.kv, '1.2.3.4', 'a@b.co');
		for (const ttl of fake.ttls.values()) {
			expect(ttl).toBe(WINDOW_SECONDS);
		}
	});

	it('forgets the failures after a successful sign-in', async () => {
		for (let i = 0; i < MAX_ATTEMPTS; i++) {
			await recordFailure(fake.kv, '1.2.3.4', 'a@b.co');
		}
		await clearFailures(fake.kv, '1.2.3.4', 'a@b.co');
		expect(await isThrottled(fake.kv, '1.2.3.4', 'a@b.co')).toBe(false);
	});

	it('ignores a corrupted counter value', async () => {
		fake.store.set('login_attempts:ip:1.2.3.4', 'banana');
		expect(await isThrottled(fake.kv, '1.2.3.4', 'a@b.co')).toBe(false);
	});
});

describe('when KV is unavailable', () => {
	it('does not throttle, so sign-in keeps working', async () => {
		// A brake that fails closed would take the whole app down with the KV binding.
		expect(await isThrottled(undefined, '1.2.3.4', 'a@b.co')).toBe(false);
		expect(await isThrottled(brokenKv, '1.2.3.4', 'a@b.co')).toBe(false);
	});

	it('swallows write failures', async () => {
		await expect(recordFailure(undefined, '1.2.3.4', 'a@b.co')).resolves.toBeUndefined();
		await expect(recordFailure(brokenKv, '1.2.3.4', 'a@b.co')).resolves.toBeUndefined();
		await expect(clearFailures(undefined, '1.2.3.4', 'a@b.co')).resolves.toBeUndefined();
		await expect(clearFailures(brokenKv, '1.2.3.4', 'a@b.co')).resolves.toBeUndefined();
	});
});
