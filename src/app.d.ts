// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
import type { D1Database, KVNamespace, Queue, R2Bucket } from '@cloudflare/workers-types';

declare global {
	namespace App {
		interface Locals {
			user?: {
				id: string;
				login: string;
				email: string;
				name?: string;
				avatarUrl?: string;
				isOwner: boolean;
				isAdmin?: boolean;
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
				TURNSTILE_SITE_KEY?: string;
				SETUP_SECRET?: string;
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
			};
			context: {
				waitUntil(promise: Promise<any>): void;
			};
			caches: CacheStorage & { default: Cache };
		}
	}
}

export {};
