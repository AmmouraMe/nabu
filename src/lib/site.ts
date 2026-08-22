/**
 * Where Nabu lives, for anything that has to name itself absolutely.
 *
 * A constant rather than the request's own origin, because `canonical` and
 * `og:url` must always point at the production host. Deriving them from whatever
 * host served the response means a preview deploy emits canonical URLs pointing
 * at itself — telling search engines the preview is the real page — and a link
 * shared from a preview unfurls with a preview URL on it.
 *
 * It also keeps the tags out of `$app/stores`, which cannot be subscribed to
 * outside a SvelteKit request context. Components that do read `$page` mock the
 * store in unit tests (see `Navigation.test.ts` and `home-page.test.ts`).
 */
export const SITE_URL = 'https://nabu.ammoura.me';

export const SITE_NAME = 'Nabu';

/** Absolute URL for a path, for canonical tags and share images. */
export function absoluteUrl(path: string): string {
	return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
