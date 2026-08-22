import { vi } from 'vitest';

export interface QueryCall {
	query: string;
	bindings: unknown[];
}

export interface QueryResult {
	first?: unknown;
	run?: unknown;
	all?: { results?: unknown[] };
}

interface OAuthStatement {
	bind(...values: unknown[]): OAuthStatement;
	first(): Promise<unknown>;
	run(): Promise<unknown>;
	all(): Promise<{ results?: unknown[] }>;
}

export function createOAuthDb(
	resolve: (query: string, bindings: unknown[]) => QueryResult | Promise<QueryResult> = () => ({})
) {
	const calls: QueryCall[] = [];
	const prepare = vi.fn((query: string) => {
		let bindings: unknown[] = [];
		const statement: OAuthStatement = {
			bind: vi.fn((...values: unknown[]) => {
				bindings = values;
				return statement;
			}),
			first: vi.fn(async () => {
				calls.push({ query, bindings });
				return (await resolve(query, bindings)).first ?? null;
			}),
			run: vi.fn(async () => {
				calls.push({ query, bindings });
				return (await resolve(query, bindings)).run ?? { success: true, meta: {} };
			}),
			all: vi.fn(async () => {
				calls.push({ query, bindings });
				return (await resolve(query, bindings)).all ?? { results: [] };
			})
		};
		return statement;
	});
	return {
		calls,
		prepare,
		batch: vi.fn<[unknown[]], Promise<unknown[]>>(async (statements) =>
			statements.map(() => ({ success: true }))
		)
	};
}

export function createOAuthCookies(values: Record<string, string> = {}) {
	return {
		get: vi.fn((name: string) => values[name]),
		set: vi.fn(),
		delete: vi.fn()
	};
}

export function oauthTransaction(
	provider: 'github' | 'discord',
	intent: 'login' | 'link' = 'login',
	userId?: string
) {
	return {
		provider,
		state: `${intent}:test-state`,
		intent,
		...(userId ? { userId } : {}),
		issuedAt: Date.now()
	};
}

export const canonicalUser = {
	id: 'user-1',
	email: 'user@example.com',
	name: 'Test User',
	github_login: 'test-user',
	github_avatar_url: 'https://example.com/avatar.png',
	is_admin: 0
};
