/**
 * Google Fonts API proxy.
 *
 * Serves a curated catalog of popular Google Fonts.
 * If a GOOGLE_FONTS_API_KEY secret is configured, it fetches
 * the live catalog from Google and caches it in KV for 7 days.
 * Otherwise, it serves the bundled curated list.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Curated list of ~100 popular Google Fonts across all categories */
const CURATED_FONTS = [
	// Sans-serif
	{ family: 'Roboto', category: 'sans-serif', variants: ['300', 'regular', '500', '700', '900'] },
	{
		family: 'Open Sans',
		category: 'sans-serif',
		variants: ['300', 'regular', '600', '700', '800']
	},
	{ family: 'Lato', category: 'sans-serif', variants: ['300', 'regular', '700', '900'] },
	{
		family: 'Montserrat',
		category: 'sans-serif',
		variants: ['300', 'regular', '500', '600', '700', '800', '900']
	},
	{
		family: 'Poppins',
		category: 'sans-serif',
		variants: ['300', 'regular', '500', '600', '700', '800', '900']
	},
	{
		family: 'Inter',
		category: 'sans-serif',
		variants: ['300', 'regular', '500', '600', '700', '800', '900']
	},
	{ family: 'Oswald', category: 'sans-serif', variants: ['300', 'regular', '500', '600', '700'] },
	{
		family: 'Raleway',
		category: 'sans-serif',
		variants: ['300', 'regular', '500', '600', '700', '800', '900']
	},
	{
		family: 'Nunito',
		category: 'sans-serif',
		variants: ['300', 'regular', '600', '700', '800', '900']
	},
	{
		family: 'Nunito Sans',
		category: 'sans-serif',
		variants: ['300', 'regular', '600', '700', '800', '900']
	},
	{
		family: 'Work Sans',
		category: 'sans-serif',
		variants: ['300', 'regular', '500', '600', '700', '800', '900']
	},
	{
		family: 'Rubik',
		category: 'sans-serif',
		variants: ['300', 'regular', '500', '600', '700', '800', '900']
	},
	{
		family: 'Manrope',
		category: 'sans-serif',
		variants: ['300', 'regular', '500', '600', '700', '800']
	},
	{ family: 'DM Sans', category: 'sans-serif', variants: ['regular', '500', '700'] },
	{
		family: 'Quicksand',
		category: 'sans-serif',
		variants: ['300', 'regular', '500', '600', '700']
	},
	{
		family: 'Mulish',
		category: 'sans-serif',
		variants: ['300', 'regular', '500', '600', '700', '800', '900']
	},
	{
		family: 'Barlow',
		category: 'sans-serif',
		variants: ['300', 'regular', '500', '600', '700', '800', '900']
	},
	{
		family: 'Karla',
		category: 'sans-serif',
		variants: ['300', 'regular', '500', '600', '700', '800']
	},
	{ family: 'Cabin', category: 'sans-serif', variants: ['regular', '500', '600', '700'] },
	{
		family: 'Overpass',
		category: 'sans-serif',
		variants: ['300', 'regular', '600', '700', '800', '900']
	},
	{
		family: 'Source Sans 3',
		category: 'sans-serif',
		variants: ['300', 'regular', '600', '700', '900']
	},
	{
		family: 'Figtree',
		category: 'sans-serif',
		variants: ['300', 'regular', '500', '600', '700', '800', '900']
	},
	{
		family: 'Plus Jakarta Sans',
		category: 'sans-serif',
		variants: ['300', 'regular', '500', '600', '700', '800']
	},
	{
		family: 'Space Grotesk',
		category: 'sans-serif',
		variants: ['300', 'regular', '500', '600', '700']
	},
	{
		family: 'Outfit',
		category: 'sans-serif',
		variants: ['300', 'regular', '500', '600', '700', '800', '900']
	},
	{
		family: 'Sora',
		category: 'sans-serif',
		variants: ['300', 'regular', '500', '600', '700', '800']
	},
	{
		family: 'Lexend',
		category: 'sans-serif',
		variants: ['300', 'regular', '500', '600', '700', '800', '900']
	},
	{
		family: 'Albert Sans',
		category: 'sans-serif',
		variants: ['300', 'regular', '500', '600', '700', '800', '900']
	},
	{
		family: 'Red Hat Display',
		category: 'sans-serif',
		variants: ['300', 'regular', '500', '600', '700', '800', '900']
	},
	{
		family: 'Urbanist',
		category: 'sans-serif',
		variants: ['300', 'regular', '500', '600', '700', '800', '900']
	},
	{
		family: 'Archivo',
		category: 'sans-serif',
		variants: ['300', 'regular', '500', '600', '700', '800', '900']
	},
	{
		family: 'Noto Sans',
		category: 'sans-serif',
		variants: ['300', 'regular', '500', '700', '900']
	},
	{ family: 'PT Sans', category: 'sans-serif', variants: ['regular', '700'] },
	{ family: 'Ubuntu', category: 'sans-serif', variants: ['300', 'regular', '500', '700'] },
	{ family: 'Josefin Sans', category: 'sans-serif', variants: ['300', 'regular', '600', '700'] },
	{
		family: 'Libre Franklin',
		category: 'sans-serif',
		variants: ['300', 'regular', '500', '600', '700', '800', '900']
	},
	// Serif
	{
		family: 'Playfair Display',
		category: 'serif',
		variants: ['regular', '500', '600', '700', '800', '900']
	},
	{ family: 'Merriweather', category: 'serif', variants: ['300', 'regular', '700', '900'] },
	{ family: 'Lora', category: 'serif', variants: ['regular', '500', '600', '700'] },
	{
		family: 'Roboto Slab',
		category: 'serif',
		variants: ['300', 'regular', '500', '600', '700', '800', '900']
	},
	{ family: 'PT Serif', category: 'serif', variants: ['regular', '700'] },
	{ family: 'Noto Serif', category: 'serif', variants: ['regular', '700'] },
	{
		family: 'Source Serif 4',
		category: 'serif',
		variants: ['300', 'regular', '600', '700', '900']
	},
	{ family: 'EB Garamond', category: 'serif', variants: ['regular', '500', '600', '700', '800'] },
	{ family: 'Libre Baskerville', category: 'serif', variants: ['regular', '700'] },
	{
		family: 'Bitter',
		category: 'serif',
		variants: ['300', 'regular', '500', '600', '700', '800', '900']
	},
	{ family: 'Crimson Text', category: 'serif', variants: ['regular', '600', '700'] },
	{ family: 'DM Serif Display', category: 'serif', variants: ['regular'] },
	{ family: 'DM Serif Text', category: 'serif', variants: ['regular'] },
	{
		family: 'Cormorant Garamond',
		category: 'serif',
		variants: ['300', 'regular', '500', '600', '700']
	},
	{
		family: 'Fraunces',
		category: 'serif',
		variants: ['300', 'regular', '500', '600', '700', '800', '900']
	},
	{ family: 'Cardo', category: 'serif', variants: ['regular', '700'] },
	{
		family: 'Vollkorn',
		category: 'serif',
		variants: ['regular', '500', '600', '700', '800', '900']
	},
	{
		family: 'Spectral',
		category: 'serif',
		variants: ['300', 'regular', '500', '600', '700', '800']
	},
	{
		family: 'Newsreader',
		category: 'serif',
		variants: ['300', 'regular', '500', '600', '700', '800']
	},
	{
		family: 'Bodoni Moda',
		category: 'serif',
		variants: ['regular', '500', '600', '700', '800', '900']
	},
	{ family: 'Cormorant', category: 'serif', variants: ['300', 'regular', '500', '600', '700'] },
	{ family: 'Josefin Slab', category: 'serif', variants: ['300', 'regular', '600', '700'] },
	// Display
	{ family: 'Bebas Neue', category: 'display', variants: ['regular'] },
	{ family: 'Anton', category: 'display', variants: ['regular'] },
	{ family: 'Abril Fatface', category: 'display', variants: ['regular'] },
	{ family: 'Righteous', category: 'display', variants: ['regular'] },
	{ family: 'Lobster', category: 'display', variants: ['regular'] },
	{ family: 'Permanent Marker', category: 'display', variants: ['regular'] },
	{ family: 'Fredoka', category: 'display', variants: ['300', 'regular', '500', '600', '700'] },
	{ family: 'Comfortaa', category: 'display', variants: ['300', 'regular', '500', '600', '700'] },
	{ family: 'Alfa Slab One', category: 'display', variants: ['regular'] },
	{ family: 'Passion One', category: 'display', variants: ['regular', '700', '900'] },
	{ family: 'Lilita One', category: 'display', variants: ['regular'] },
	{ family: 'Bungee', category: 'display', variants: ['regular'] },
	{ family: 'Archivo Black', category: 'display', variants: ['regular'] },
	{ family: 'Staatliches', category: 'display', variants: ['regular'] },
	{ family: 'Russo One', category: 'display', variants: ['regular'] },
	{ family: 'Vina Sans', category: 'display', variants: ['regular'] },
	// Handwriting
	{ family: 'Dancing Script', category: 'handwriting', variants: ['regular', '500', '600', '700'] },
	{ family: 'Pacifico', category: 'handwriting', variants: ['regular'] },
	{ family: 'Caveat', category: 'handwriting', variants: ['regular', '500', '600', '700'] },
	{ family: 'Satisfy', category: 'handwriting', variants: ['regular'] },
	{ family: 'Great Vibes', category: 'handwriting', variants: ['regular'] },
	{ family: 'Sacramento', category: 'handwriting', variants: ['regular'] },
	{ family: 'Kalam', category: 'handwriting', variants: ['300', 'regular', '700'] },
	{ family: 'Handlee', category: 'handwriting', variants: ['regular'] },
	{ family: 'Indie Flower', category: 'handwriting', variants: ['regular'] },
	{ family: 'Shadows Into Light', category: 'handwriting', variants: ['regular'] },
	{ family: 'Patrick Hand', category: 'handwriting', variants: ['regular'] },
	{ family: 'Gloria Hallelujah', category: 'handwriting', variants: ['regular'] },
	// Monospace
	{ family: 'Fira Code', category: 'monospace', variants: ['300', 'regular', '500', '600', '700'] },
	{
		family: 'JetBrains Mono',
		category: 'monospace',
		variants: ['300', 'regular', '500', '600', '700', '800']
	},
	{
		family: 'Source Code Pro',
		category: 'monospace',
		variants: ['300', 'regular', '500', '600', '700', '900']
	},
	{
		family: 'IBM Plex Mono',
		category: 'monospace',
		variants: ['300', 'regular', '500', '600', '700']
	},
	{
		family: 'Roboto Mono',
		category: 'monospace',
		variants: ['300', 'regular', '500', '600', '700']
	},
	{ family: 'Space Mono', category: 'monospace', variants: ['regular', '700'] },
	{ family: 'Ubuntu Mono', category: 'monospace', variants: ['regular', '700'] },
	{
		family: 'Inconsolata',
		category: 'monospace',
		variants: ['300', 'regular', '500', '600', '700', '800', '900']
	}
];

const KV_CACHE_KEY = 'google-fonts-catalog';
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export const GET: RequestHandler = async ({ platform }) => {
	// Try to serve from KV cache first (if live data was previously fetched)
	if (platform?.env?.KV) {
		try {
			const cached = await platform.env.KV.get(KV_CACHE_KEY, 'json');
			if (cached) {
				return json(cached, {
					headers: { 'Cache-Control': 'public, max-age=86400' }
				});
			}
		} catch {
			// KV miss — fall through
		}
	}

	// If a Google Fonts API key is available, fetch the live catalog
	const apiKey = (platform?.env as Record<string, string> | undefined)?.GOOGLE_FONTS_API_KEY;
	if (apiKey) {
		try {
			const url = new URL('https://www.googleapis.com/webfonts/v1/webfonts');
			url.searchParams.set('key', apiKey);
			url.searchParams.set('sort', 'popularity');

			const res = await fetch(url.toString());
			if (res.ok) {
				const data = await res.json();
				const catalog = {
					items: (data.items ?? []).slice(0, 200).map((f: Record<string, unknown>) => ({
						family: f.family,
						category: f.category,
						variants: f.variants
					}))
				};

				// Cache in KV for future requests
				if (platform?.env?.KV) {
					platform.context.waitUntil(
						platform.env.KV.put(KV_CACHE_KEY, JSON.stringify(catalog), {
							expirationTtl: CACHE_TTL_SECONDS
						})
					);
				}

				return json(catalog, {
					headers: { 'Cache-Control': 'public, max-age=86400' }
				});
			}
		} catch {
			// API call failed — fall through to curated list
		}
	}

	// Serve the built-in curated list
	return json({ items: CURATED_FONTS }, { headers: { 'Cache-Control': 'public, max-age=604800' } });
};
