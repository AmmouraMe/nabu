import { describe, expect, it } from 'vitest';
import {
	V1_ENDPOINTS,
	META_ENDPOINTS,
	KEY_ENDPOINTS,
	ALL_SCOPES,
	LOGO_STYLES,
	LOGO_STYLE_DESCRIPTIONS,
	SCOPE_DESCRIPTIONS,
	ERROR_CODES
} from '../../src/lib/api-spec';

/**
 * The mechanism that keeps the public docs true.
 *
 * `/docs/api` renders `api-spec.ts`, so the docs are only as accurate as that file.
 * These tests compare it against the routes that actually exist, in both directions:
 * a route with no spec entry fails, and a spec entry with no route fails. Adding an
 * endpoint without documenting it breaks the build rather than quietly shipping
 * incomplete docs.
 *
 * Routes are discovered through Vite's module graph rather than `node:fs`. That needs
 * no `@types/node` in a repo that otherwise has almost no dependencies, and it is the
 * stronger check: methods are read from the module's real exports instead of grepping
 * source for `export const GET`, so a handler that is defined but not exported cannot
 * pass.
 */

const v1Modules = import.meta.glob('../../src/routes/api/v1/**/+server.ts', { eager: true });
const keyModules = import.meta.glob('../../src/routes/api/keys/**/+server.ts', { eager: true });

const HTTP_METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const;

/** Glob key -> SvelteKit route path. */
function toRoutePath(globKey: string): string {
	const marker = '/src/routes';
	const idx = globKey.indexOf(marker);
	const fromRoutes = globKey.slice(idx + marker.length);
	return fromRoutes.replace(/\/\+server\.ts$/, '');
}

function describeRoutes(modules: Record<string, unknown>) {
	return Object.entries(modules).map(([key, mod]) => ({
		path: toRoutePath(key),
		methods: HTTP_METHODS.filter((m) => typeof (mod as Record<string, unknown>)[m] === 'function')
	}));
}

const routes = describeRoutes(v1Modules);
const keyRoutes = describeRoutes(keyModules);

describe('api-spec matches the routes that exist', () => {
	it('discovers the v1 routes at all (guards against a broken glob)', () => {
		expect(routes.length).toBeGreaterThan(0);
	});

	it('documents every /api/v1 route', () => {
		// Meta endpoints count as documented; they are declared separately only so the
		// scope assertion below can stay strict about data endpoints.
		const documented = new Set([...V1_ENDPOINTS, ...META_ENDPOINTS].map((e) => e.path));
		const undocumented = routes.map((r) => r.path).filter((p) => !documented.has(p));
		// A new endpoint must be added to api-spec.ts, or the public docs are already wrong.
		expect(undocumented).toEqual([]);
	});

	it('has no spec entry pointing at a route that does not exist', () => {
		const onDisk = new Set(routes.map((r) => r.path));
		const phantom = [...V1_ENDPOINTS, ...META_ENDPOINTS]
			.map((e) => e.path)
			.filter((p) => !onDisk.has(p));
		expect(phantom).toEqual([]);
	});

	it('declares exactly the methods each route exports', () => {
		const problems: string[] = [];
		for (const route of routes) {
			const actual = [...route.methods].sort();
			const declared = [...V1_ENDPOINTS, ...META_ENDPOINTS]
				.filter((e) => e.path === route.path)
				.map((e) => e.method)
				.sort();
			if (JSON.stringify(actual) !== JSON.stringify(declared)) {
				problems.push(`${route.path}: exports [${actual}], spec declares [${declared}]`);
			}
		}
		expect(problems).toEqual([]);
	});

	it('documents every key-management route', () => {
		const documented = new Set(KEY_ENDPOINTS.map((e) => e.path));
		expect(keyRoutes.map((r) => r.path).filter((p) => !documented.has(p))).toEqual([]);
	});

	it('declares exactly the methods each key route exports', () => {
		const problems: string[] = [];
		for (const route of keyRoutes) {
			const actual = [...route.methods].sort();
			const declared = KEY_ENDPOINTS.filter((e) => e.path === route.path)
				.map((e) => e.method)
				.sort();
			if (JSON.stringify(actual) !== JSON.stringify(declared)) {
				problems.push(`${route.path}: exports [${actual}], spec declares [${declared}]`);
			}
		}
		expect(problems).toEqual([]);
	});

	it('gives every v1 data endpoint a scope', () => {
		for (const e of V1_ENDPOINTS) {
			expect(e.scope, `${e.method} ${e.path}`).not.toBeNull();
			expect(ALL_SCOPES).toContain(e.scope!);
		}
	});

	it('marks key-management endpoints as session-authenticated', () => {
		// A key able to mint keys would outlive its own revocation.
		for (const e of KEY_ENDPOINTS) {
			expect(e.scope, `${e.method} ${e.path}`).toBeNull();
		}
	});
});

describe('api-spec is internally complete', () => {
	it('describes every scope it exposes', () => {
		for (const s of ALL_SCOPES) expect(SCOPE_DESCRIPTIONS[s]?.length).toBeGreaterThan(0);
	});

	it('describes every logo style it exposes', () => {
		for (const s of LOGO_STYLES) expect(LOGO_STYLE_DESCRIPTIONS[s]?.length).toBeGreaterThan(0);
	});

	it('gives every endpoint a summary, description and return shape', () => {
		for (const e of [...V1_ENDPOINTS, ...META_ENDPOINTS, ...KEY_ENDPOINTS]) {
			expect(e.summary.length, e.path).toBeGreaterThan(0);
			expect(e.description.length, e.path).toBeGreaterThan(0);
			expect(e.returns.length, e.path).toBeGreaterThan(0);
		}
	});

	it('has no duplicate error codes', () => {
		const codes = ERROR_CODES.map((e) => e.code);
		expect(new Set(codes).size).toBe(codes.length);
	});

	it('keeps the style list in step with the prompt builder', async () => {
		// The builder holds a direction string per style; a style with none would put
		// `undefined` into a prompt sent to the model.
		const { buildLogoPrompt } = await import('../../src/lib/server/logo-prompt');
		for (const style of LOGO_STYLES) {
			expect(buildLogoPrompt({ brandName: 'X' }, style), style).not.toContain('undefined');
		}
	});
});
