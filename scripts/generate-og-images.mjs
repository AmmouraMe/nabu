#!/usr/bin/env node
/**
 * Generate the Open Graph / Twitter share images.
 *
 * A link with no `og:image` is rendered by every social platform as a bare grey
 * box with a URL in it, which is a worse advertisement than not being shared at
 * all. These are the 1200×630 cards that appear instead.
 *
 * Committed as PNGs rather than rendered on the edge on purpose. Rasterising at
 * request time means shipping satori + resvg WASM into a Worker that otherwise
 * has no image pipeline, for images that change roughly never — while a crawler
 * fetching a static PNG from the CDN gets it in one hop with no cold start. The
 * cost is remembering to re-run this after a copy or logo change.
 *
 * Regenerate:  node scripts/generate-og-images.mjs
 * Needs `sharp`, same as scripts/generate-icons.mjs — installed ad hoc rather
 * than as a dependency, since neither CI nor the deploy has any use for it.
 *
 * Outputs (into static/og/):
 *   default.png   every page without one of its own
 *   name.png      /name, the public brand-name generator
 *   pricing.png   /pricing
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'og');
mkdirSync(OUT, { recursive: true });

// The app's own tokens — dark background, the two teal tones of the mark.
const BG = '#0a0a0a';
const SURFACE = '#141414';
const TEAL = '#3ba99f';
const TEAL_DEEP = '#1e7d72';
const TEXT = '#f8f9fa';
const DIM = '#adb5bd';

const W = 1200;
const H = 630;

/**
 * A font stack rather than one family: this runs on whatever machine happens to
 * regenerate the images, and a missing family silently falls back to something
 * with different metrics. Liberation Sans is metric-compatible with Arial and is
 * present on essentially every Linux box; the rest are there for macOS.
 */
const SANS = 'Liberation Sans, Helvetica Neue, Helvetica, Arial, sans-serif';
const MONO = 'Liberation Mono, DejaVu Sans Mono, Menlo, monospace';

/** The interlocking N, at an arbitrary size and position. */
function mark(x, y, size) {
	const s = size / 512;
	return `
		<g transform="translate(${x} ${y}) scale(${s})">
			<path d="M330 36 L436 36 L436 476 L330 476 L330 270 L182 476 L76 476 Z" fill="${TEAL}"/>
			<path d="M76 36 L182 36 L182 242 L330 36 L436 36 L76 476 L76 36 Z" fill="${TEAL_DEEP}"/>
		</g>`;
}

/** Escape for XML text nodes — a stray & or < in copy would break the SVG. */
function esc(s) {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * One card. `eyebrow` is the small teal line above the headline, `lines` is the
 * headline broken by hand — there is no text layout engine here, so wrapping is
 * a judgement made per card rather than computed.
 */
function card({ eyebrow, lines, sub, chips = [] }) {
	const headline = lines
		.map(
			(line, i) =>
				`<text x="80" y="${268 + i * 78}" font-family="${SANS}" font-size="68" font-weight="700" fill="${TEXT}" letter-spacing="-2">${esc(line)}</text>`
		)
		.join('\n');

	const chipRow = chips
		.map((chip, i) => {
			const x = 80 + i * 210;
			return `
				<rect x="${x}" y="${H - 150}" width="190" height="46" rx="23" fill="${SURFACE}" stroke="${TEAL}" stroke-opacity="0.35"/>
				<text x="${x + 95}" y="${H - 119}" font-family="${MONO}" font-size="19" fill="${TEAL}" text-anchor="middle">${esc(chip)}</text>`;
		})
		.join('\n');

	return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
		<rect width="${W}" height="${H}" fill="${BG}"/>
		<!-- A teal rule down the left edge, so the card reads as Nabu's at thumbnail size
		     where the wordmark is already illegible. -->
		<rect x="0" y="0" width="10" height="${H}" fill="${TEAL_DEEP}"/>

		${mark(80, 70, 62)}
		<text x="158" y="118" font-family="${SANS}" font-size="40" font-weight="700" fill="${TEXT}" letter-spacing="-1">Nabu</text>

		<text x="80" y="196" font-family="${MONO}" font-size="22" fill="${TEAL}" letter-spacing="3">${esc(eyebrow.toUpperCase())}</text>
		${headline}
		<text x="80" y="${268 + lines.length * 78 + 26}" font-family="${SANS}" font-size="27" fill="${DIM}">${esc(sub)}</text>

		${chipRow}
	</svg>`);
}

const CARDS = {
	default: card({
		eyebrow: 'Brand, built properly',
		lines: ['Everything around', 'your brand, in one place.'],
		sub: 'Identity, voice, visuals and content — guided, not guessed.',
		chips: ['Brand identity', 'AI content', 'Publish anywhere']
	}),
	name: card({
		eyebrow: 'Free tool',
		lines: ['Name your brand.'],
		sub: 'Six names against nine real heuristics — then we check what is actually free.',
		chips: ['Domains', 'Handles', 'Trademarks']
	}),
	pricing: card({
		eyebrow: 'Pricing',
		lines: ['Start free.', 'Pay per brand.'],
		sub: 'Every plan priced per brand, so one project never subsidises another.',
		chips: ['No card needed', 'Per brand', 'Cancel anytime']
	})
};

for (const [name, svg] of Object.entries(CARDS)) {
	const file = join(OUT, `${name}.png`);
	await sharp(svg).png({ compressionLevel: 9 }).toFile(file);
	const { size } = await sharp(file)
		.metadata()
		.then(async (m) => ({ ...m, size: (await sharp(file).toBuffer()).length }));
	console.log(`  ${name}.png  ${W}×${H}  ${(size / 1024).toFixed(1)} KB`);
}

console.log('\nOG images written to static/og/');
