import { afterEach } from 'vitest';

declare global {
	// eslint-disable-next-line no-var
	var __REAL_SUBTLE__: SubtleCrypto | undefined;
}

// This file is the setup for BOTH environments. Most suites run in `happy-dom`,
// but the server-route suites opt into `node` with a `@vitest-environment node`
// docblock — happy-dom's `Response` drops `Set-Cookie` at construction, which
// erases the header those suites assert on. So everything DOM-shaped below is
// loaded only when a `window` actually exists; importing `@testing-library/*`
// eagerly would throw `ReferenceError: window is not defined` under `node`.
const hasDom = typeof window !== 'undefined';

if (hasDom) {
	await import('@testing-library/jest-dom/vitest');
	const { cleanup } = await import('@testing-library/svelte');
	afterEach(() => {
		cleanup();
	});
}

// Setup global test utilities
globalThis.ResizeObserver = class ResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
};

// Mock IntersectionObserver
globalThis.IntersectionObserver = class IntersectionObserver {
	constructor() {}
	observe() {}
	unobserve() {}
	disconnect() {}
} as any;

// Working localStorage.
//
// Node 25 exposes its own global `localStorage`, which is an inert stub unless
// the process was started with `--localstorage-file`. Vitest's happy-dom
// bridge (`getWindowKeys`) skips any key that already exists on Node's global
// unless the key is in its own hardcoded list — and `localStorage` is not on
// that list — so happy-dom's real `Storage` never reaches the test global and
// every `localStorage.getItem/clear` call throws "is not a function".
// `sessionStorage` is unaffected because Node does not define it.
//
// Install a spec-shaped Storage ourselves. Keep it `configurable` so
// `vi.stubGlobal('localStorage', …)` / `vi.unstubAllGlobals()` still work.
class TestStorage implements Storage {
	#store = new Map<string, string>();

	get length(): number {
		return this.#store.size;
	}

	key(index: number): string | null {
		return [...this.#store.keys()][index] ?? null;
	}

	getItem(name: string): string | null {
		return this.#store.has(name) ? (this.#store.get(name) as string) : null;
	}

	setItem(name: string, value: string): void {
		this.#store.set(String(name), String(value));
	}

	removeItem(name: string): void {
		this.#store.delete(name);
	}

	clear(): void {
		this.#store.clear();
	}

	[key: string]: unknown;
}

Object.defineProperty(globalThis, 'localStorage', {
	value: new TestStorage(),
	writable: true,
	configurable: true
});

// Pristine WebCrypto SubtleCrypto, captured before any test can stub it out.
//
// Many suites do `vi.stubGlobal('crypto', { randomUUID: () => '…' })` to make UUIDs
// deterministic, which replaces the *whole* crypto global and takes `crypto.subtle`
// with it. That was harmless until session cookies started being HMAC-signed
// (src/lib/server/session.ts), which needs `crypto.subtle.importKey` — every auth
// callback test then failed with "Cannot read properties of undefined". Real Workers
// always have subtle, so this is a harness artifact, not a production concern.
//
// Stubs that need deterministic UUIDs should preserve subtle by spreading this:
//   vi.stubGlobal('crypto', { ...realCrypto, randomUUID: () => 'fixed' })
globalThis.__REAL_SUBTLE__ = globalThis.crypto?.subtle;

// Mock matchMedia (DOM-only; `node` suites have no window to define it on).
if (hasDom) {
	Object.defineProperty(window, 'matchMedia', {
		writable: true,
		value: (query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addListener: () => {},
			removeListener: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => true
		})
	});
}
