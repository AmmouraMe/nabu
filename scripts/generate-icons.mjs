#!/usr/bin/env node
/**
 * Generate the full web-app icon set from the Nabu logo.
 *
 * A tab favicon alone is not enough: phone home-screen tiles and PWA installs
 * ignore <link rel="icon"> and read apple-touch-icon + the web manifest. Without
 * the files below, phones show a generated letter monogram instead of the Nabu
 * mark. See nabu/CLAUDE.md "Web App Icons — Full Set Required".
 *
 * Regenerate after changing the logo:  node scripts/generate-icons.mjs
 *
 * Outputs (into static/):
 *   apple-touch-icon.png  180  teal N on solid dark, for iOS home screen
 *   icon-192.png          192  PWA manifest icon
 *   icon-512.png          512  PWA manifest icon
 *   favicon-light.png      96  tab favicon for light UA color scheme
 *   favicon-dark.png       96  tab favicon for dark UA color scheme (brightened)
 *   favicon.ico         16/32/48 legacy multi-res favicon
 * favicon.svg (scalable, theme-agnostic) stays the primary <link rel="icon">.
 */
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const STATIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'static');

// Solid background for opaque tiles — the app's dark --color-background, which
// is also the manifest/theme-color, so the tile and the browser chrome agree.
const BG = '#0a0a0a';

// The interlocking-N mark. Two teal tones give the interlock its depth.
// `light`/`dark` name the two shapes, not a UA color scheme.
const TEAL = { light: '#3ba99f', dark: '#1e7d72' };
// Brightened pair for the dark-scheme tab favicon, so the darker shape doesn't
// sink into a near-black tab strip.
const TEAL_ON_DARK = { light: '#5fc9be', dark: '#3ba99f' };

/** The mark on a transparent background, optionally scaled to leave a margin. */
function markSVG({ light, dark }, scale = 1) {
	// Content already sits at 76–436 / 36–476 within the 512 box (~10% inset).
	// `scale` shrinks it further around the center for extra breathing room.
	const t = (1 - scale) * 256; // translate to keep it centered while scaling
	const g = scale === 1 ? '' : ` transform="translate(${t} ${t}) scale(${scale})"`;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none"><g${g}>
<path d="M330 36 L436 36 L436 476 L330 476 L330 270 L182 476 L76 476 Z" fill="${light}"/>
<path d="M76 36 L182 36 L182 242 L330 36 L436 36 L76 476 L76 36 Z" fill="${dark}"/>
</g></svg>`;
}

/** Rasterize an SVG string to a PNG buffer at the given pixel size. */
function raster(svg, size) {
	// density high enough that the vector is oversampled, then downscaled clean.
	return sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png();
}

/** teal N centered on a solid opaque square (for iOS / PWA tiles). */
async function tile(size, out) {
	const fg = await raster(markSVG(TEAL, 0.82), size).toBuffer();
	await sharp({
		create: { width: size, height: size, channels: 4, background: BG }
	})
		.composite([{ input: fg }])
		.png()
		.toFile(join(STATIC, out));
	console.log(`  ${out}  ${size}×${size}`);
}

/** transparent teal N (for tab favicons). */
async function favicon(colors, out, size = 96) {
	await raster(markSVG(colors), size).toFile(join(STATIC, out));
	console.log(`  ${out}  ${size}×${size}`);
}

console.log('Generating icons into static/');
await tile(180, 'apple-touch-icon.png');
await tile(192, 'icon-192.png');
await tile(512, 'icon-512.png');
await favicon(TEAL, 'favicon-light.png');
await favicon(TEAL_ON_DARK, 'favicon-dark.png');

// favicon.ico — 16/32/48 multi-res. sharp can't write .ico, so render PNGs and
// let ImageMagick pack them. The favicon shows on both light and dark tabs, so
// use the brightened pair (legible on dark, still fine on light).
const tmp = mkdtempSync(join(tmpdir(), 'nabu-ico-'));
try {
	const sizes = [16, 32, 48];
	const files = [];
	for (const s of sizes) {
		const p = join(tmp, `f${s}.png`);
		await raster(markSVG(TEAL_ON_DARK), s).toFile(p);
		files.push(p);
	}
	execFileSync('magick', [...files, join(STATIC, 'favicon.ico')]);
	console.log('  favicon.ico  16/32/48');
} finally {
	rmSync(tmp, { recursive: true, force: true });
}

console.log('Done.');
