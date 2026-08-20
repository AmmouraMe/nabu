<script lang="ts">
	/**
	 * Every tag a link needs to look like something worth clicking.
	 *
	 * Before this, one page in the app had partial Open Graph tags and nothing had
	 * an image, so a shared Nabu link rendered as a grey box with a URL in it on
	 * every platform. That is a worse advertisement than not being shared.
	 *
	 * ── Why absolute URLs, from a constant ──────────────────────────────────────
	 * Crawlers do not resolve relative paths for `og:image`; a root-relative path
	 * is simply dropped, and the card falls back to the grey box. The host comes
	 * from `$lib/site` rather than the request, so a preview deploy never claims
	 * to be canonical and never unfurls with a preview URL on the card.
	 *
	 * ── Why `noindex` and social tags are exclusive ─────────────────────────────
	 * Half this app is somebody's private brand workspace. A link to a brand
	 * dashboard should not render a rich preview in whatever chat it gets pasted
	 * into, and should not be indexed at all — so `noindex` suppresses the social
	 * tags rather than sitting alongside them.
	 */
	import { SITE_NAME, absoluteUrl } from '$lib/site';

	/** Page title, without the site name — this appends it. */
	export let title: string;
	export let description: string;
	/** This page's path, e.g. `/name`. Used for the canonical and og:url. */
	export let path: string;
	/** Path under /og/, without extension. Falls back to the generic card. */
	export let image: 'default' | 'name' | 'pricing' = 'default';
	/** An absolute image URL, for content that has its own (a blog post's). */
	export let imageUrl: string | null = null;
	export let type: 'website' | 'article' = 'website';
	/** Private pages: no indexing, and no share card either. */
	export let noindex = false;
	/** Overrides the canonical, for a page reachable at more than one path. */
	export let canonical: string | null = null;

	$: fullTitle = title.includes(SITE_NAME) ? title : `${title} — ${SITE_NAME}`;
	$: canonicalUrl = canonical ?? absoluteUrl(path);
	$: shareImage = imageUrl ?? absoluteUrl(`/og/${image}.png`);
</script>

<svelte:head>
	<title>{fullTitle}</title>
	<meta name="description" content={description} />

	{#if noindex}
		<meta name="robots" content="noindex, nofollow" />
	{:else}
		<link rel="canonical" href={canonicalUrl} />

		<meta property="og:site_name" content={SITE_NAME} />
		<meta property="og:type" content={type} />
		<meta property="og:url" content={canonicalUrl} />
		<meta property="og:title" content={fullTitle} />
		<meta property="og:description" content={description} />
		<meta property="og:image" content={shareImage} />
		<!-- Dimensions let a platform reserve the space before the image loads,
		     which is the difference between a card that pops in and one that
		     jumps the layout. -->
		<meta property="og:image:width" content="1200" />
		<meta property="og:image:height" content="630" />
		<meta property="og:image:alt" content={fullTitle} />

		<!-- summary_large_image, not summary: the small card crops a 1200×630 to a
		     square thumbnail and throws away the headline. -->
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:title" content={fullTitle} />
		<meta name="twitter:description" content={description} />
		<meta name="twitter:image" content={shareImage} />
		<meta name="twitter:image:alt" content={fullTitle} />
	{/if}
</svelte:head>
