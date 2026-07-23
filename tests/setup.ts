import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/svelte';
import { afterEach } from 'vitest';

// Cleanup after each test
afterEach(() => {
	cleanup();
});

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
// the process was started with `--localstorage-file`. Vitest 1.6's happy-dom
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

// Mock matchMedia
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
