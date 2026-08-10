import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		// Allow Cloudflare tunnel hosts (dev-nabu-<hash>.ammoura.me) through
		// Vite 5's dev-server host check; without this the tunnel 403s.
		allowedHosts: ['.ammoura.me']
	},
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
		exclude: ['node_modules', 'tests/e2e/**'],
		environment: 'happy-dom',
		globals: true,
		setupFiles: ['./tests/setup.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html', 'lcov'],
			exclude: [
				'node_modules/',
				'tests/',
				'*.config.{js,ts}',
				'**/*.d.ts',
				'**/*.test.{js,ts}',
				'**/*.spec.{js,ts}',
				'.svelte-kit/',
				'build/',
				'scripts/',
				// Svelte components contain UI logic that's hard to unit test branches
				// These are tested via E2E tests for user interaction flows
				'**/*.svelte',
				// Page route type files that just define load types
				'src/routes/**/+page.ts'
			],
			thresholds: {
				lines: 95,
				functions: 95,
				branches: 95,
				statements: 95
			}
		},
		poolOptions: {
			threads: {
				singleThread: true
			}
		},
		pool: 'forks',
		teardownTimeout: 5000
	}
});
