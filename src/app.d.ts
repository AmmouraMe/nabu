// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
import type { D1Database, KVNamespace, Queue, R2Bucket } from '@cloudflare/workers-types';

declare global {
	namespace App {
		/**
		 * Shape of a thrown `error()` body.
		 *
		 * Extended beyond `{ message }` so a plan refusal is machine-readable: the
		 * client needs to tell "you are out of AI videos this month" (show the counter,
		 * offer an upgrade) apart from "something broke", and a prose message alone
		 * cannot carry that. Populated by `src/lib/server/entitlements.ts`; every other
		 * `error()` call still passes a bare string.
		 */
		interface Error {
			message: string;
			code?: string;
			plan?: string;
			feature?: string;
			metric?: string;
			limit?: number;
			used?: number;
			upgradeUrl?: string;
		}
		interface Locals {
			user?: {
				id: string;
				login: string;
				email: string;
				name?: string;
				avatarUrl?: string;
				isOwner: boolean;
				isAdmin?: boolean;
				/**
				 * Pricing tier for this account, re-read from the users row on every
				 * request (see hooks.server.ts). Absent means the lookup did not run or
				 * failed, which callers must treat as the free tier — `planOf()` in
				 * `$lib/server/entitlements` does exactly that.
				 */
				plan?: string;
			};
		}
		interface Platform {
			env: {
				DB: D1Database;
				KV: KVNamespace;
				BUCKET: R2Bucket;
				QUEUE: Queue;
				AI: {
					run(
						model: string,
						inputs: Record<string, unknown>
					): Promise<{ response?: string; [k: string]: unknown }>;
				};
				TURNSTILE_SECRET_KEY: string;
				// HMAC key for signing the session cookie (see src/lib/server/session.ts).
				// REQUIRED in production: without it the app refuses to issue sessions and
				// verifies none, so nobody can log in. Set with:
				//   wrangler pages secret put SESSION_SECRET
				SESSION_SECRET?: string;
				GITHUB_CLIENT_ID?: string;
				GITHUB_CLIENT_SECRET?: string;
				GITHUB_OWNER_ID?: string;
				DISCORD_CLIENT_ID?: string;
				DISCORD_CLIENT_SECRET?: string;
				// Discord account id that gets owner/admin rights, the Discord-side
				// counterpart to GITHUB_OWNER_ID. It has to be its own variable: owner
				// used to be derived solely from a GitHub account id, so a Discord
				// snowflake could never match it and Discord-only logins were locked out
				// of admin no matter what. Falls back to KV `discord_owner_id`.
				DISCORD_OWNER_ID?: string;
				// Google Cloud OAuth client used by admin-side API-key provisioning
				// (see src/lib/server/gcp-provision.ts). Falls back to KV
				// `auth_config:gcp` when unset, like the GitHub/Discord routes.
				GCP_CLIENT_ID?: string;
				GCP_CLIENT_SECRET?: string;
				CRON_SECRET?: string;
				// Opt-in flag to enable the dev-only virtual login on a deployed
				// dev/staging Worker. Never set this in production.
				ALLOW_DEV_LOGIN?: string;
				// PBKDF2 work factor for password hashing (see src/lib/server/password.ts).
				// Unset uses the built-in default, which is tuned for the Workers CPU
				// budget rather than for OWASP's recommendation — raise it on a paid plan.
				PASSWORD_ITERATIONS?: string;

				/**
				 * Optional, for the public name generator's availability checks. Each is
				 * absent by default and the affected check then reports "not checked"
				 * rather than guessing — see src/lib/server/namer/availability.ts.
				 */
				// Lifts GitHub's anonymous 60/hour-per-IP ceiling, which a Worker shares
				// with every other Worker on its edge.
				GITHUB_TOKEN?: string;
				// A trademark search endpoint taking a term and returning a match count.
				// Configuration rather than a hard-coded URL because every USPTO API
				// refuses unauthenticated probes, so the response shape could not be
				// verified; the parser accepts the conventional count shapes and treats
				// anything else as unchecked.
				TRADEMARK_API_URL?: string;
				TRADEMARK_API_KEY?: string;
			};
			context: {
				waitUntil(promise: Promise<any>): void;
			};
			caches: CacheStorage & { default: Cache };
		}
	}
}

export {};
