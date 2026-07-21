/**
 * Returns the externally-visible origin for OAuth redirect URIs.
 *
 * Behind the Cloudflare dev tunnel the Vite dev server sees plain HTTP, so
 * `url.origin` comes out as `http://dev-nabu-*.ammoura.me` — which fails the
 * exact-match check against the https callback registered with GitHub/Discord.
 * Force https for any non-localhost host.
 */
export function externalOrigin(url: URL): string {
	const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
	if (!isLocalhost && url.protocol === 'http:') {
		return `https://${url.host}`;
	}
	return url.origin;
}

/**
 * Whether the externally-visible request is served over HTTPS. Behind the
 * dev tunnel the dev server sees plain HTTP even though the browser is on
 * HTTPS, so treat any non-localhost host as secure. Used to decide the
 * `Secure` cookie flag.
 */
export function isSecureRequest(url: URL): boolean {
	return externalOrigin(url).startsWith('https:');
}
