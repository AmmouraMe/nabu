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
				GITHUB_CLIENT_ID?: string;
				GITHUB_CLIENT_SECRET?: string;
				GITHUB_OWNER_ID?: string;
				DISCORD_CLIENT_ID?: string;
				DISCORD_CLIENT_SECRET?: string;
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
