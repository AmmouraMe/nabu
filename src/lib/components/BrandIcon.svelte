<script lang="ts">
	/**
	 * Monochrome line icons for the onboarding rails.
	 *
	 * Replaces the emoji that used to sit in the step and foundation rails. Two dozen
	 * multicoloured emoji side by side read as noise, and worse, they are inconsistent
	 * — different vendors draw them at different weights and hues, so the row never
	 * looked like one set. These inherit `currentColor`, so a circle's state (done,
	 * next, outstanding) is what colours its icon.
	 *
	 * Geometry is stored as data rather than raw markup so nothing is injected as HTML.
	 * 24×24, stroke-width 2, round caps — the same conventions as the SVGs already
	 * inline elsewhere in the app.
	 */

	type Glyph = {
		paths?: string[];
		circles?: [number, number, number][];
		lines?: [number, number, number, number][];
		polylines?: string[];
	};

	export let name: string;
	export let size = 16;

	/**
	 * Each glyph aims to say what the thing *is*, not merely decorate it: a target for
	 * the mission, a compass for values, a seal for the promise, crossed blades for
	 * rivals. Where a concept has no obvious picture, the icon leans on the nearest
	 * concrete object rather than an abstract shape.
	 */
	const GLYPHS: Record<string, Glyph> = {
		// ── Identity ──
		// A luggage tag: the thing a name is written on.
		name: {
			paths: [
				'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 3 12V5a2 2 0 0 1 2-2h7a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.6Z'
			],
			circles: [[7.5, 7.5, 1.5]]
		},
		// A speech bubble: a line people repeat.
		tagline: {
			paths: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z']
		},
		// Concentric rings: what the brand is aiming at.
		mission: {
			circles: [
				[12, 12, 9],
				[12, 12, 5],
				[12, 12, 1.5]
			]
		},
		// A megaphone: the short version you say out loud.
		pitch: {
			paths: ['M3 11 21 6v12L3 13v-2Z', 'M11.5 16.5a3 3 0 1 1-5.5-1.4']
		},
		// A telescope pointed out: where this is heading.
		vision: {
			paths: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z'],
			circles: [[12, 12, 3]]
		},

		// ── Audience ──
		// Two figures: the people it is for.
		audience: {
			paths: ['M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M17 14a4 4 0 0 1 4 4v2'],
			circles: [
				[9, 7, 3.2],
				[17, 7, 2.6]
			]
		},
		// A cut gem: the worth being offered.
		value: {
			paths: ['M6 3h12l4 6-10 12L2 9Z', 'M2 9h20']
		},
		// A warning: what hurts before they find you.
		pains: {
			paths: ['M10.3 4 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0Z'],
			lines: [[12, 10, 12, 14]],
			circles: [[12, 17.5, 0.8]]
		},

		// ── Personality ──
		// A stage mask: the character the brand plays.
		archetype: {
			paths: ['M4 5h16v6a8 8 0 0 1-16 0V5Z'],
			circles: [
				[9, 10, 1],
				[15, 10, 1]
			]
		},
		// Sound bars: how it sounds when it speaks.
		tone: {
			lines: [
				[4, 10, 4, 14],
				[8, 7, 8, 17],
				[12, 4, 12, 20],
				[16, 8, 16, 16],
				[20, 11, 20, 13]
			]
		},
		// A checked list: the handful of adjectives that stick.
		traits: {
			polylines: ['3 7 5 9 9 5', '3 17 5 19 9 15'],
			lines: [
				[13, 7, 21, 7],
				[13, 17, 21, 17]
			]
		},

		// ── Visual identity ──
		// A single drop of colour.
		primary: {
			paths: ['M12 21a6 6 0 0 0 6-6c0-4-6-12-6-12S6 11 6 15a6 6 0 0 0 6 6Z']
		},
		// A second drop beside the first.
		secondary: {
			paths: [
				'M9 21a5 5 0 0 0 5-5c0-3.5-5-10-5-10S4 12.5 4 16a5 5 0 0 0 5 5Z',
				'M18 13a3 3 0 0 0 3-3c0-2-3-6-3-6s-3 4-3 6a3 3 0 0 0 3 3Z'
			]
		},
		// A spark: the colour used sparingly, to draw the eye.
		accent: {
			paths: ['M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z'],
			lines: [
				[19, 17, 19, 21],
				[17, 19, 21, 19]
			]
		},
		// Large letterform: the type used for headings.
		headings: {
			paths: ['M5 20 12 4l7 16', 'M8 14h8']
		},
		// Lines of running text: the type used for body copy.
		'body-font': {
			lines: [
				[4, 7, 20, 7],
				[4, 12, 20, 12],
				[4, 17, 14, 17]
			]
		},
		// A framed picture: the mark itself.
		logo: {
			paths: ['M3 5h18v14H3Z', 'M3 16l5-5 4 4 3-3 6 6'],
			circles: [[8.5, 9, 1.4]]
		},

		// ── Positioning ──
		// A building: the trade being worked in.
		industry: {
			paths: ['M3 21V9l6-4v4l6-4v16', 'M15 21V11h6v10'],
			lines: [
				[6, 13, 6, 13],
				[18, 15, 18, 15]
			]
		},
		// A star: the reason to choose you.
		usps: {
			paths: ['M12 3.5l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.5l-5.4 2.9 1-6.1L3.2 10l6.1-.9Z']
		},
		// Ascending bars: where you sit against the field.
		position: {
			lines: [
				[6, 20, 6, 14],
				[12, 20, 12, 9],
				[18, 20, 18, 5],
				[3, 20, 21, 20]
			]
		},
		// Crossed blades: who you are up against.
		rivals: {
			paths: ['M5 19 19 5', 'M19 19 5 5'],
			lines: [
				[16, 4, 20, 8],
				[4, 16, 8, 20]
			]
		},

		// ── Story ──
		// An open book: where it began.
		origin: {
			paths: ['M12 6c-2-1.5-4.5-2-8-2v14c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2V4c-3.5 0-6 .5-8 2Z'],
			lines: [[12, 6, 12, 20]]
		},
		// A compass: what it will not compromise on.
		values: {
			circles: [[12, 12, 9]],
			paths: ['M15.5 8.5l-2 5-5 2 2-5Z']
		},
		// A stamped seal: what every customer can count on.
		promise: {
			paths: [
				'M12 3l2.5 1.8 3-.2.9 2.9 2.4 1.8-1.2 2.8 1.2 2.8-2.4 1.8-.9 2.9-3-.2L12 21l-2.5-1.8-3 .2-.9-2.9L3.2 15l1.2-2.8L3.2 9.4 5.6 7.6l.9-2.9 3 .2Z'
			],
			polylines: ['9 12.5 11 14.5 15.5 10']
		},

		// ── Onboarding steps ──
		welcome: { paths: ['M4 20V6a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2Z', 'M14 4v6h6'] },
		assess: { circles: [[10.5, 10.5, 6.5]], lines: [[15.5, 15.5, 21, 21]] },
		identity: {
			paths: ['M9 18h6', 'M10 21h4', 'M12 3a6 6 0 0 1 3.5 10.9V16h-7v-2.1A6 6 0 0 1 12 3Z']
		},
		visual: {
			paths: [
				'M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.9 1.5-1.7 0-1.9 2-1.6 3.3-1.6A4.2 4.2 0 0 0 21 13.5C21 7.7 17 3 12 3Z'
			],
			circles: [
				[8, 10, 1.2],
				[12, 7.5, 1.2],
				[16, 10, 1.2]
			]
		},
		guide: {
			paths: [
				'M8 4h8v3H8Z',
				'M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2'
			],
			lines: [
				[8, 12, 16, 12],
				[8, 16, 13, 16]
			]
		},
		done: { paths: ['M5 21V4', 'M5 4h11l-1.5 4L16 12H5'] },

		// ── Asset kinds ──
		// Used by the brand workspace tabs, which previously ran on emoji: 📋📝🖼️🔊🎬.
		// Same objection as the rails — different vendors, different weights and hues,
		// so five of them side by side never read as one set.
		// A record card: the brand's own details.
		profile: {
			paths: ['M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z'],
			circles: [[9, 10, 2]],
			lines: [
				[14, 9, 18, 9],
				[14, 13, 18, 13],
				[6, 16, 12, 16]
			]
		},
		// A page with lines on it.
		text: {
			paths: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z', 'M14 3v5h5'],
			lines: [
				[9, 13, 15, 13],
				[9, 17, 15, 17]
			]
		},
		// A framed picture: horizon and sun.
		image: {
			paths: ['M3 5h18v14H3z', 'm3 16 5-5 4 4 3-3 6 6'],
			circles: [[8.5, 8.5, 1.5]]
		},
		// A speaker with one wave — two would crowd at 16px.
		audio: {
			paths: ['M4 9h4l5-4v14l-5-4H4V9Z', 'M17 9.5a4 4 0 0 1 0 5']
		},
		// A clapperboard.
		video: {
			paths: ['M3 7h18v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z', 'm3 7 2-4h14l-2 4'],
			lines: [
				[9, 3, 7, 7],
				[15, 3, 13, 7]
			]
		}
	};

	$: glyph = GLYPHS[name] ?? null;
</script>

{#if glyph}
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
		focusable="false"
	>
		{#each glyph.paths ?? [] as d}
			<path {d} />
		{/each}
		{#each glyph.circles ?? [] as [cx, cy, r]}
			<circle {cx} {cy} {r} />
		{/each}
		{#each glyph.lines ?? [] as [x1, y1, x2, y2]}
			<line {x1} {y1} {x2} {y2} />
		{/each}
		{#each glyph.polylines ?? [] as points}
			<polyline {points} />
		{/each}
	</svg>
{/if}
