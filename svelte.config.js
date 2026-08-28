import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			routes: {
				include: ['/*'],
				exclude: ['<all>']
			},
			// Dev-mode binding emulation must stay entirely local.
			//
			// In dev, this adapter's `emulate()` hook calls wrangler's
			// `getPlatformProxy()` to build `platform.env`. As of wrangler 4 that
			// option defaults to `remoteBindings: true`, and `[ai]` in wrangler.toml
			// is a remote-only binding — so the proxy opens a *remote* session
			// against the Cloudflare API before serving the first request.
			//
			// With no credentials that session throws, `emulate()` rejects, and
			// SvelteKit answers **every route with a 500** whose body is
			// "Failed to start the remote proxy session … it's necessary to set a
			// CLOUDFLARE_API_TOKEN". That is not a stray warning: it took the whole
			// E2E suite down (9/9 failed, `toHaveTitle` receiving `""`) the moment
			// wrangler moved 3 -> 4, because CI has no token by design.
			//
			// It hides from local testing — a developer logged in via `wrangler
			// login` has OAuth credentials in `~/.config/.wrangler`, so the remote
			// session succeeds and dev looks fine. Reproduce the CI failure with:
			//   CI=1 XDG_CONFIG_HOME=$(mktemp -d) npm run dev
			//
			// `false` restores the behaviour these tests were green under: no remote
			// proxy session is opened at startup, so serving a page never depends on
			// credentials. It does not make AI local — wrangler still warns that "AI
			// bindings always access remote resources", because that binding reaches
			// out when it is *called*. The difference is that the cost is now paid
			// lazily by the routes that use AI, instead of eagerly by every request.
			// Turning remote bindings back on is a deliberate opt-in that needs
			// CLOUDFLARE_API_TOKEN present everywhere dev runs, CI included.
			platformProxy: {
				remoteBindings: false
			}
		})
	}
};

export default config;
