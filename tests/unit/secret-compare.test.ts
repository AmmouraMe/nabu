import { describe, expect, it } from 'vitest';
import { bearerToken, secretsEqual } from '../../src/lib/server/secret-compare';

describe('secretsEqual', () => {
	it('matches identical secrets', async () => {
		expect(await secretsEqual('s3cret', 's3cret')).toBe(true);
	});

	it('rejects a different secret, a prefix, and a longer value', async () => {
		expect(await secretsEqual('s3creT', 's3cret')).toBe(false);
		expect(await secretsEqual('s3cre', 's3cret')).toBe(false);
		expect(await secretsEqual('s3cret!', 's3cret')).toBe(false);
	});

	it('never matches when the configured secret is empty or missing', async () => {
		expect(await secretsEqual('', '')).toBe(false);
		expect(await secretsEqual('', undefined)).toBe(false);
		expect(await secretsEqual('anything', null)).toBe(false);
	});

	it('never matches a missing presented value', async () => {
		expect(await secretsEqual(null, 's3cret')).toBe(false);
		expect(await secretsEqual(undefined, 's3cret')).toBe(false);
	});
});

describe('bearerToken', () => {
	it('extracts the token', () => {
		expect(bearerToken('Bearer abc')).toBe('abc');
		expect(bearerToken('Bearer ')).toBe('');
	});

	it('returns null for anything else', () => {
		expect(bearerToken(null)).toBeNull();
		expect(bearerToken(undefined)).toBeNull();
		expect(bearerToken('Basic abc')).toBeNull();
		expect(bearerToken('bearer abc')).toBeNull();
	});
});
