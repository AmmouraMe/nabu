/**
 * Dev-only "virtual login" gating.
 *
 * `/api/auth/dev` mints a real, database-backed session without any OAuth
 * provider, so two properties have to hold wherever it is reachable:
 *
 * 1. It can only ever create or sign in to a *dev* account. Every account it
 *    touches has an id under `DEV_USER_ID_PREFIX`, derived from the requested
 *    email — never taken from the query string. A caller-chosen id could name a
 *    real user row (the upsert would then rewrite that user's email, name and
 *    admin flag) or the numeric GitHub id in `GITHUB_OWNER_ID`, which
 *    `resolveOwnerStatus` treats as the owner.
 * 2. A dev account only authenticates while dev login is enabled. Turning
 *    `ALLOW_DEV_LOGIN` off on a staging Worker must end every dev session at
 *    once, not leave admin sessions alive until their `Max-Age` runs out, and a
 *    dev row that reaches a production database authenticates nobody.
 *    `hooks.server.ts` enforces this on every request with `isDevUserId`.
 */

export const DEV_USER_ID_PREFIX = 'dev:';

/**
 * True under `vite dev` (`import.meta.env.DEV`, statically false in a
 * production build) or on a deployed dev/staging Worker that opts in with
 * `ALLOW_DEV_LOGIN=true`.
 */
export function isDevLoginEnabled(platform: App.Platform | undefined | null): boolean {
	return import.meta.env.DEV || platform?.env?.ALLOW_DEV_LOGIN === 'true';
}

/** The stable id of the dev account for an email address. */
export function devUserId(email: string): string {
	return `${DEV_USER_ID_PREFIX}${email.trim().toLowerCase()}`;
}

/** Whether a user row was created by the dev login. */
export function isDevUserId(id: string | null | undefined): boolean {
	return typeof id === 'string' && id.startsWith(DEV_USER_ID_PREFIX);
}
