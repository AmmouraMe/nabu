<script lang="ts">
	/**
	 * ColorHarmonyWheel — Interactive color wheel with harmony pattern visualization.
	 *
	 * Renders a circular hue wheel with individually draggable markers for P/S/A.
	 * Angular position = hue (rotating any marker rotates entire pattern).
	 * Radial position  = lightness (drag a marker toward center = darker, outward = brighter).
	 *
	 * Features:
	 * - Full 360° hue ring rendered on canvas
	 * - Per-marker brightness control via radial position
	 * - Visual harmony pattern overlay connecting markers
	 * - Drag any marker to rotate the whole hue pattern
	 * - Pull markers in/out to independently adjust lightness
	 * - Harmony type selector chips
	 * - Real-time color preview swatches
	 * - "Apply to palette" button to set all three focal colors at once
	 * - Accessible with ARIA labels and keyboard support
	 */
	import { createEventDispatcher, tick } from 'svelte';
	import {
		hexToHsl,
		hslToHex,
		normalizeHex,
		getColorName,
		shouldUseDarkText,
		getHarmonyAngles,
		type HarmonyType,
		type HarmonyTriple
	} from '$lib/utils/brand-colors';

	const dispatch = createEventDispatcher();

	// ─── Props ────────────────────────────────────────

	/** Current primary color hex */
	export let primaryColor: string = '#3b82f6';
	/** Currently selected harmony type */
	export let harmonyType: HarmonyType = 'triadic';

	// ─── Constants ───────────────────────────────────

	const SIZE = 280;
	const CENTER = SIZE / 2;
	const OUTER_RADIUS = SIZE / 2 - 4;
	const INNER_RADIUS = OUTER_RADIUS - 32;
	const MARKER_RADIUS = 12;
	const DISC_SATURATION = 85; // fixed saturation for the color disc

	// Lightness ↔ radial mapping
	const MIN_MARKER_R = 22; // closest to center a marker can sit
	const MAX_MARKER_R = OUTER_RADIUS - 2; // at the outer edge
	const LIGHT_AT_CENTER = 15; // very dark when at center
	const LIGHT_AT_EDGE = 85; // very bright at outer edge

	// ─── Helpers ─────────────────────────────────────

	function wrap(h: number): number {
		return ((h % 360) + 360) % 360;
	}

	function radiusToLightness(r: number): number {
		const clamped = Math.max(MIN_MARKER_R, Math.min(MAX_MARKER_R, r));
		const t = (clamped - MIN_MARKER_R) / (MAX_MARKER_R - MIN_MARKER_R);
		return Math.round(LIGHT_AT_CENTER + t * (LIGHT_AT_EDGE - LIGHT_AT_CENTER));
	}

	function lightnessToRadius(l: number): number {
		const t = (l - LIGHT_AT_CENTER) / (LIGHT_AT_EDGE - LIGHT_AT_CENTER);
		return MIN_MARKER_R + Math.max(0, Math.min(1, t)) * (MAX_MARKER_R - MIN_MARKER_R);
	}

	// ─── Per-marker state ────────────────────────────

	interface MarkerState {
		hue: number;
		sat: number;
		light: number;
	}

	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;
	let draggingMarker: number | null = null; // 0=P, 1=S, 2=A
	let dragMode: 'marker' | 'rotate' | null = null;
	let suppressReactiveReinit = false; // prevents snap-back after drag ends
	let cachedDiscCanvas: HTMLCanvasElement | null = null; // off-screen color disc cache

	const HARMONY_OPTIONS: { type: HarmonyType; label: string; icon: string }[] = [
		{ type: 'triadic', label: 'Triadic', icon: '△' },
		{ type: 'analogous', label: 'Analogous', icon: '≈' },
		{ type: 'complementary', label: 'Complement', icon: '↔' },
		{ type: 'split-complementary', label: 'Split-Comp', icon: '⑂' },
		{ type: 'tetradic', label: 'Tetradic', icon: '◇' },
		{ type: 'monochromatic', label: 'Mono', icon: '▥' }
	];

	/** Build markers from a base HSL and harmony type */
	function initMarkers(): [MarkerState, MarkerState, MarkerState] {
		const hsl = hexToHsl(primaryColor);
		const h = hsl?.h ?? 0;
		const s = hsl?.s ?? 70;
		const l = hsl?.l ?? 50;
		const angles = getHarmonyAngles(harmonyType);

		if (harmonyType === 'monochromatic') {
			return [
				{ hue: h, sat: s, light: l },
				{ hue: h, sat: s, light: Math.max(LIGHT_AT_CENTER, l - 20) },
				{ hue: h, sat: s, light: Math.min(LIGHT_AT_EDGE, l + 20) }
			];
		}
		if (harmonyType === 'complementary') {
			return [
				{ hue: h, sat: s, light: l },
				{ hue: wrap(h + 180), sat: s, light: l },
				{ hue: wrap(h + 90), sat: Math.round(s * 0.8), light: l }
			];
		}
		if (harmonyType === 'tetradic') {
			return [
				{ hue: h, sat: s, light: l },
				{ hue: wrap(h + angles[1]), sat: s, light: l },
				{ hue: wrap(h + angles[2]), sat: s, light: l }
			];
		}
		// triadic, analogous, split-complementary
		return [
			{ hue: h, sat: s, light: l },
			{ hue: wrap(h + angles[1]), sat: s, light: l },
			{ hue: wrap(h + angles[2]), sat: s, light: l }
		];
	}

	let markers: [MarkerState, MarkerState, MarkerState] = initMarkers();

	/** Derive the hex triple from current marker states */
	function getTriple(): HarmonyTriple {
		return {
			primary: hslToHex(markers[0].hue, markers[0].sat, markers[0].light),
			secondary: hslToHex(markers[1].hue, markers[1].sat, markers[1].light),
			accent: hslToHex(markers[2].hue, markers[2].sat, markers[2].light)
		};
	}

	let triple: HarmonyTriple = getTriple();

	// ─── Reactive ────────────────────────────────────

	let prevPrimaryColor = primaryColor;
	let prevHarmonyType = harmonyType;
	let drawQueued = false;

	function queueDraw() {
		if (drawQueued || !canvas) return;
		drawQueued = true;
		requestAnimationFrame(() => {
			drawQueued = false;
			draw();
		});
	}

	// Respond to external prop changes only — ignore round-trips from our own events
	$: {
		const normProp = normalizeHex(primaryColor) || primaryColor;
		const normPrev = normalizeHex(prevPrimaryColor) || prevPrimaryColor;
		const propsChanged = normProp !== normPrev || harmonyType !== prevHarmonyType;

		if (propsChanged) {
			// Always track current prop values to prevent stale comparisons
			prevPrimaryColor = primaryColor;
			prevHarmonyType = harmonyType;

			// Only reinit if truly external (not during or just-after a drag)
			if (draggingMarker === null && !suppressReactiveReinit) {
				markers = initMarkers();
				triple = getTriple();
				queueDraw();
			}
		}
	}

	// Initial draw once canvas is bound
	let initialDrawDone = false;
	$: if (canvas && !initialDrawDone) {
		initialDrawDone = true;
		tick().then(draw);
	}

	// ─── Drawing ─────────────────────────────────────

	function draw() {
		if (!canvas) return;
		if (!ctx) ctx = canvas.getContext('2d');
		if (!ctx) return;
		const c = ctx;

		c.clearRect(0, 0, SIZE, SIZE);
		drawHueRing(c);
		drawInnerCircle(c);
		drawCenterLabel(c);
		drawHarmonyPattern(c);
		drawMarkers(c);
	}

	// ─── HSL→RGB for pixel rendering ─────────────────

	function hslToRgbRaw(h: number, s: number, l: number): [number, number, number] {
		s /= 100;
		l /= 100;
		const ch = (1 - Math.abs(2 * l - 1)) * s;
		const x = ch * (1 - Math.abs(((h / 60) % 2) - 1));
		const m = l - ch / 2;
		let r = 0,
			g = 0,
			b = 0;
		if (h < 60) {
			r = ch;
			g = x;
		} else if (h < 120) {
			r = x;
			g = ch;
		} else if (h < 180) {
			g = ch;
			b = x;
		} else if (h < 240) {
			g = x;
			b = ch;
		} else if (h < 300) {
			r = x;
			b = ch;
		} else {
			r = ch;
			b = x;
		}
		return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
	}

	// ─── Cache the full-disc color image ─────────────

	function ensureDiscCache(): void {
		if (cachedDiscCanvas) return;
		try {
			cachedDiscCanvas = document.createElement('canvas');
			cachedDiscCanvas.width = SIZE;
			cachedDiscCanvas.height = SIZE;
			const dc = cachedDiscCanvas.getContext('2d');
			if (!dc || typeof dc.createImageData !== 'function') {
				cachedDiscCanvas = null;
				return;
			}

			const imageData = dc.createImageData(SIZE, SIZE);
			const data = imageData.data;
			const maxR = OUTER_RADIUS;

			for (let py = 0; py < SIZE; py++) {
				for (let px = 0; px < SIZE; px++) {
					const dx = px - CENTER;
					const dy = py - CENTER;
					const r = Math.sqrt(dx * dx + dy * dy);
					if (r > maxR || r < 1) continue;

					// Hue from angle (0° = top, clockwise) — matches hue ring
					let hue = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
					if (hue < 0) hue += 360;
					hue = hue % 360;

					// Lightness from radial position
					const lightness = radiusToLightness(r);

					// Saturation tapers toward center for a natural look
					const t = Math.min(1, r / maxR);
					const sat = 30 + t * (DISC_SATURATION - 30);

					const [cr, cg, cb] = hslToRgbRaw(hue, sat, lightness);
					const idx = (py * SIZE + px) * 4;
					data[idx] = cr;
					data[idx + 1] = cg;
					data[idx + 2] = cb;
					data[idx + 3] = 255;
				}
			}

			dc.putImageData(imageData, 0, 0);
		} catch {
			// Gracefully degrade if offscreen canvas APIs are unavailable (e.g. tests)
			cachedDiscCanvas = null;
		}
	}

	function drawHueRing(c: CanvasRenderingContext2D) {
		const segments = 360;
		const step = (Math.PI * 2) / segments;

		for (let i = 0; i < segments; i++) {
			const startAngle = i * step - Math.PI / 2;
			const endAngle = startAngle + step + 0.005;

			c.beginPath();
			c.arc(CENTER, CENTER, OUTER_RADIUS, startAngle, endAngle);
			c.arc(CENTER, CENTER, INNER_RADIUS, endAngle, startAngle, true);
			c.closePath();
			c.fillStyle = `hsl(${i}, 100%, 50%)`;
			c.fill();
		}

		// Subtle borders
		c.beginPath();
		c.arc(CENTER, CENTER, OUTER_RADIUS, 0, Math.PI * 2);
		c.strokeStyle = 'rgba(255, 255, 255, 0.08)';
		c.lineWidth = 1;
		c.stroke();

		c.beginPath();
		c.arc(CENTER, CENTER, INNER_RADIUS, 0, Math.PI * 2);
		c.strokeStyle = 'rgba(255, 255, 255, 0.12)';
		c.lineWidth = 1;
		c.stroke();
	}

	function drawInnerCircle(c: CanvasRenderingContext2D) {
		// Draw the cached full-color disc (hue=angle, lightness=radius)
		ensureDiscCache();
		if (cachedDiscCanvas) {
			c.save();
			// Clip to inner circle so the outer hue ring isn't covered
			c.beginPath();
			c.arc(CENTER, CENTER, INNER_RADIUS - 1, 0, Math.PI * 2);
			c.clip();
			c.drawImage(cachedDiscCanvas, 0, 0);
			c.restore();
		}
	}

	function getMarkerPos(m: MarkerState): { x: number; y: number } {
		const angle = ((m.hue - 90) * Math.PI) / 180;
		const r = lightnessToRadius(m.light);
		return {
			x: CENTER + Math.cos(angle) * r,
			y: CENTER + Math.sin(angle) * r
		};
	}

	function drawHarmonyPattern(c: CanvasRenderingContext2D) {
		const points = markers.map((m) => getMarkerPos(m));

		if (harmonyType === 'monochromatic') {
			// Dashed line connecting markers (same hue, different radii)
			c.beginPath();
			c.moveTo(points[0].x, points[0].y);
			for (let i = 1; i < points.length; i++) {
				c.lineTo(points[i].x, points[i].y);
			}
			c.strokeStyle = 'rgba(255, 255, 255, 0.25)';
			c.lineWidth = 1.5;
			c.setLineDash([4, 4]);
			c.stroke();
			c.setLineDash([]);
			return;
		}

		if (points.length < 2) return;

		c.beginPath();
		c.moveTo(points[0].x, points[0].y);
		for (let i = 1; i < points.length; i++) {
			c.lineTo(points[i].x, points[i].y);
		}
		if (points.length > 2) c.closePath();

		if (points.length > 2) {
			c.fillStyle = 'rgba(255, 255, 255, 0.04)';
			c.fill();
		}

		c.strokeStyle = 'rgba(255, 255, 255, 0.35)';
		c.lineWidth = 1.5;
		c.stroke();
	}

	function drawMarkers(c: CanvasRenderingContext2D) {
		const colors = [triple.primary, triple.secondary, triple.accent];
		const labels = ['P', 'S', 'A'];

		for (let i = 0; i < markers.length; i++) {
			const pos = getMarkerPos(markers[i]);
			const color = colors[i];
			const isActive = draggingMarker === i;

			// Outer glow (larger when being dragged)
			c.beginPath();
			c.arc(pos.x, pos.y, MARKER_RADIUS + (isActive ? 5 : 3), 0, Math.PI * 2);
			c.fillStyle = isActive
				? 'rgba(255, 255, 255, 0.25)'
				: i === 0
					? 'rgba(255, 255, 255, 0.15)'
					: 'rgba(255, 255, 255, 0.08)';
			c.fill();

			// Color-filled circle
			c.beginPath();
			c.arc(pos.x, pos.y, MARKER_RADIUS, 0, Math.PI * 2);
			c.fillStyle = color;
			c.fill();
			c.strokeStyle = i === 0 ? '#ffffff' : 'rgba(255, 255, 255, 0.8)';
			c.lineWidth = i === 0 ? 3 : 2;
			c.stroke();

			// Label
			c.fillStyle = shouldUseDarkText(color) ? '#000000' : '#ffffff';
			c.font = `bold ${i === 0 ? 11 : 10}px -apple-system, BlinkMacSystemFont, sans-serif`;
			c.textAlign = 'center';
			c.textBaseline = 'middle';
			c.fillText(labels[i], pos.x, pos.y);
		}
	}

	function drawCenterLabel(c: CanvasRenderingContext2D) {
		const option = HARMONY_OPTIONS.find((o) => o.type === harmonyType);
		if (!option) return;

		// Semi-transparent backdrop so text is readable over the color disc
		c.beginPath();
		c.arc(CENTER, CENTER, 28, 0, Math.PI * 2);
		c.fillStyle = 'rgba(0, 0, 0, 0.55)';
		c.fill();

		c.fillStyle = 'rgba(255, 255, 255, 0.85)';
		c.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
		c.textAlign = 'center';
		c.textBaseline = 'middle';
		c.fillText(option.icon, CENTER, CENTER - 10);

		c.fillStyle = 'rgba(255, 255, 255, 0.7)';
		c.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
		c.fillText(option.label, CENTER, CENTER + 6);

		c.fillStyle = 'rgba(255, 255, 255, 0.5)';
		c.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
		c.fillText(`${Math.round(markers[0].hue)}°`, CENTER, CENTER + 22);
	}

	// ─── Interaction ─────────────────────────────────

	function getPointerInfo(e: MouseEvent | PointerEvent): { angle: number; radius: number } {
		if (!canvas) return { angle: 0, radius: 0 };
		const rect = canvas.getBoundingClientRect();
		const scaleX = SIZE / rect.width;
		const scaleY = SIZE / rect.height;
		const x = (e.clientX - rect.left) * scaleX - CENTER;
		const y = (e.clientY - rect.top) * scaleY - CENTER;
		let angle = (Math.atan2(y, x) * 180) / Math.PI + 90;
		if (angle < 0) angle += 360;
		return { angle: Math.round(angle) % 360, radius: Math.sqrt(x * x + y * y) };
	}

	function hitTestMarker(e: MouseEvent | PointerEvent): number | null {
		if (!canvas) return null;
		const rect = canvas.getBoundingClientRect();
		const scaleX = SIZE / rect.width;
		const scaleY = SIZE / rect.height;
		const px = (e.clientX - rect.left) * scaleX;
		const py = (e.clientY - rect.top) * scaleY;
		const hitR = MARKER_RADIUS + 8;

		// Check in reverse order (topmost drawn first)
		for (let i = markers.length - 1; i >= 0; i--) {
			const pos = getMarkerPos(markers[i]);
			const dx = px - pos.x;
			const dy = py - pos.y;
			if (dx * dx + dy * dy <= hitR * hitR) return i;
		}
		return null;
	}

	function handlePointerDown(e: MouseEvent) {
		e.preventDefault(); // prevent browser drag / text-selection interference

		const hit = hitTestMarker(e);

		if (hit !== null) {
			draggingMarker = hit;
			dragMode = 'marker';
			return;
		}

		// Click on/near the ring — rotate the whole pattern to that angle
		const { angle, radius } = getPointerInfo(e);
		if (radius >= INNER_RADIUS - 15 && radius <= OUTER_RADIUS + 15) {
			draggingMarker = 0;
			dragMode = 'rotate';
			updateFromPointer(angle, radius);
		}
	}

	function handlePointerMove(e: MouseEvent) {
		if (draggingMarker === null) return;
		e.preventDefault(); // keep browser from interfering mid-drag
		const { angle, radius } = getPointerInfo(e);
		updateFromPointer(angle, radius);
	}

	function handlePointerUp() {
		if (draggingMarker !== null) {
			// Suppress the reactive reinit so releasing the drag doesn't snap back
			suppressReactiveReinit = true;
			draggingMarker = null;
			dragMode = null;
			dispatch('harmonychange', { ...triple });
			// Allow external prop changes to reinit again after framework settles
			tick().then(() => {
				tick().then(() => {
					suppressReactiveReinit = false;
					// Re-sync tracking to whatever the parent decided
					prevPrimaryColor = primaryColor;
					prevHarmonyType = harmonyType;
				});
			});
		}
	}

	function updateFromPointer(hue: number, radius: number) {
		if (draggingMarker === null) return;

		const idx = draggingMarker;
		const oldHue = markers[idx].hue;

		// Angular delta normalized to [-180, 180]
		let hueDelta = hue - oldHue;
		if (hueDelta > 180) hueDelta -= 360;
		if (hueDelta < -180) hueDelta += 360;

		// Rotate ALL markers' hues together (preserves harmony pattern)
		for (let i = 0; i < markers.length; i++) {
			markers[i] = { ...markers[i], hue: wrap(markers[i].hue + hueDelta) };
		}

		// Radial → lightness: update only the dragged marker (only in direct marker mode)
		if (dragMode === 'marker') {
			markers[idx] = { ...markers[idx], light: radiusToLightness(radius) };
		}

		markers = [...markers] as [MarkerState, MarkerState, MarkerState];
		triple = getTriple();
		dispatch('harmonypreview', { ...triple });
		queueDraw();
	}

	function handleHarmonyTypeChange(type: HarmonyType) {
		harmonyType = type;
		prevHarmonyType = type;

		// Recalculate hues from new harmony angles, preserving individual lightness
		const angles = getHarmonyAngles(type);
		const h = markers[0].hue;
		const s = markers[0].sat;

		if (type === 'monochromatic') {
			markers[1] = { ...markers[1], hue: h, sat: s };
			markers[2] = { ...markers[2], hue: h, sat: s };
		} else if (type === 'complementary') {
			markers[1] = { ...markers[1], hue: wrap(h + 180), sat: s };
			markers[2] = { ...markers[2], hue: wrap(h + 90), sat: Math.round(s * 0.8) };
		} else if (type === 'tetradic') {
			markers[1] = { ...markers[1], hue: wrap(h + angles[1]), sat: s };
			markers[2] = { ...markers[2], hue: wrap(h + angles[2]), sat: s };
		} else {
			markers[1] = { ...markers[1], hue: wrap(h + angles[1]), sat: s };
			markers[2] = { ...markers[2], hue: wrap(h + angles[2]), sat: s };
		}

		markers = [...markers] as [MarkerState, MarkerState, MarkerState];
		triple = getTriple();
		prevPrimaryColor = normalizeHex(triple.primary) || triple.primary;
		dispatch('harmonychange', { ...triple });
		queueDraw();
	}

	function handleApply() {
		dispatch('harmonyapply', { ...triple });
	}

	function rotateAll(degrees: number) {
		for (let i = 0; i < markers.length; i++) {
			markers[i] = { ...markers[i], hue: wrap(markers[i].hue + degrees) };
		}
		markers = [...markers] as [MarkerState, MarkerState, MarkerState];
		triple = getTriple();
		prevPrimaryColor = normalizeHex(triple.primary) || triple.primary;
		dispatch('harmonychange', { ...triple });
		queueDraw();
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
			e.preventDefault();
			rotateAll(-5);
		} else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
			e.preventDefault();
			rotateAll(5);
		}
	}
</script>

<svelte:window on:mousemove={handlePointerMove} on:mouseup={handlePointerUp} />

<div class="harmony-wheel-container">
	<!-- Harmony type selector -->
	<div class="wheel-types" role="radiogroup" aria-label="Color harmony pattern">
		{#each HARMONY_OPTIONS as opt}
			<button
				class="wheel-chip"
				class:active={harmonyType === opt.type}
				on:click={() => handleHarmonyTypeChange(opt.type)}
				role="radio"
				aria-checked={harmonyType === opt.type}
				title={opt.label}
			>
				<span class="wheel-chip-icon">{opt.icon}</span>
				<span class="wheel-chip-text">{opt.label}</span>
			</button>
		{/each}
	</div>

	<!-- The wheel canvas -->
	<div class="wheel-canvas-wrap">
		<canvas
			bind:this={canvas}
			width={SIZE}
			height={SIZE}
			class="wheel-canvas"
			on:mousedown={handlePointerDown}
			on:keydown={handleKeyDown}
			tabindex="0"
			role="slider"
			aria-label="Color harmony wheel — drag to rotate pattern"
			aria-valuemin={0}
			aria-valuemax={360}
			aria-valuenow={Math.round(markers[0].hue)}
		></canvas>
		<span class="wheel-hint">Drag markers in/out to adjust brightness</span>
	</div>

	<!-- Color preview swatches -->
	<div class="wheel-preview">
		{#each [{ color: triple.primary, label: 'Primary', key: 'P' }, { color: triple.secondary, label: 'Secondary', key: 'S' }, { color: triple.accent, label: 'Accent', key: 'A' }] as swatch}
			{@const isDark = !shouldUseDarkText(swatch.color)}
			<div class="wheel-swatch-card">
				<div class="wheel-swatch" style="background-color: {swatch.color}">
					<span class="wheel-swatch-key" class:light={isDark}>{swatch.key}</span>
				</div>
				<div class="wheel-swatch-info">
					<span class="wheel-swatch-label">{swatch.label}</span>
					<span class="wheel-swatch-hex">{swatch.color}</span>
					<span class="wheel-swatch-name">{getColorName(swatch.color)}</span>
				</div>
			</div>
		{/each}
	</div>

	<!-- Apply button -->
	<button
		class="wheel-apply-btn"
		on:click={handleApply}
		aria-label="Apply harmony colors to palette"
	>
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<polyline points="20 6 9 17 4 12" />
		</svg>
		Apply to Palette
	</button>
</div>

<style>
	.harmony-wheel-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-md);
	}

	/* ─── Harmony type chips ─── */

	.wheel-types {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		justify-content: center;
	}

	.wheel-chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 5px 10px;
		font-size: 0.68rem;
		border: 1px solid var(--color-border);
		border-radius: 20px;
		background: var(--color-background);
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: all var(--transition-fast);
		font-weight: 500;
	}

	.wheel-chip:hover {
		border-color: var(--color-primary);
		color: var(--color-text);
	}

	.wheel-chip.active {
		background: var(--color-primary);
		color: var(--color-background);
		border-color: var(--color-primary);
	}

	.wheel-chip-icon {
		font-size: 0.72rem;
		line-height: 1;
	}

	.wheel-chip-text {
		line-height: 1;
	}

	/* ─── Canvas ─── */

	.wheel-canvas-wrap {
		position: relative;
		line-height: 0;
	}

	.wheel-canvas {
		display: block;
		width: 240px;
		height: 240px;
		cursor: grab;
		border-radius: 50%;
		outline: none;
	}

	.wheel-canvas:focus-visible {
		box-shadow: 0 0 0 3px var(--color-primary);
	}

	.wheel-canvas:active {
		cursor: grabbing;
	}

	.wheel-hint {
		display: block;
		margin-top: 4px;
		font-size: 0.55rem;
		color: var(--color-text-secondary);
		text-align: center;
		opacity: 0.6;
	}

	/* ─── Preview swatches ─── */

	.wheel-preview {
		display: flex;
		gap: var(--spacing-sm);
		width: 100%;
	}

	.wheel-swatch-card {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 4px;
		align-items: center;
	}

	.wheel-swatch {
		width: 100%;
		height: 48px;
		border-radius: var(--radius-md);
		border: 2px solid var(--color-border);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all var(--transition-fast);
	}

	.wheel-swatch-key {
		font-size: 0.75rem;
		font-weight: 700;
		color: #000;
	}

	.wheel-swatch-key.light {
		color: #fff;
		text-shadow: 0 0 4px rgba(0, 0, 0, 0.6);
	}

	.wheel-swatch-info {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
	}

	.wheel-swatch-label {
		font-size: 0.68rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.wheel-swatch-hex {
		font-size: 0.6rem;
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		color: var(--color-text-secondary);
	}

	.wheel-swatch-name {
		font-size: 0.52rem;
		color: var(--color-text-secondary);
		text-align: center;
	}

	/* ─── Apply button ─── */

	.wheel-apply-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: 8px 20px;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-background);
		background: var(--color-primary);
		border: none;
		border-radius: 24px;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.wheel-apply-btn:hover {
		filter: brightness(1.1);
		transform: translateY(-1px);
		box-shadow: var(--shadow-md);
	}

	.wheel-apply-btn:active {
		transform: translateY(0);
	}

	/* The harmony chips are a row of six sitting side by side, so a 24px-tall target
	   is not only small but easy to mis-hit into its neighbour. */
	@media (pointer: coarse) {
		.wheel-chip {
			min-height: 44px;
			padding: 8px 14px;
		}
	}
</style>
