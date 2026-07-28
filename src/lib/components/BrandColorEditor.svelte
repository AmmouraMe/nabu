<script lang="ts">
	/**
	 * BrandColorEditor — World-class theme color composer.
	 *
	 * A completely redesigned color picker with:
	 * - Large SV gradient picker with high-precision controls
	 * - Hue ring visualizer for spatial context
	 * - Tabbed color field editor (Focal / Layout / Status)
	 * - Color harmony engine with visual wheel overlay (comp, analogous, triadic, tetradic, split-comp, mono)
	 * - Smart auto-theme generation from a single color
	 * - Curated preset themes with mood/category filtering
	 * - Real-time live preview of a mini-website
	 * - WCAG AA/AAA contrast matrix with inline badges
	 * - HSL fine-tuning sliders with gradient tracks
	 * - Click-to-copy hex values
	 * - Native system color picker fallback on every swatch
	 * - Smooth animated transitions throughout
	 * - Fully accessible with ARIA labels and keyboard support
	 */
	import { createEventDispatcher, onMount, tick } from 'svelte';
	import {
		hexToHsl,
		hslToHex,
		hexToHsv,
		hsvToHex,
		isValidHex,
		normalizeHex,
		generateComplementary,
		generateAnalogous,
		generateTriadic,
		generateTetradic,
		generateSplitComplementary,
		generateMonochromatic,
		getContrastRatio,
		getColorName,
		generateFullTheme,
		derivedThemeFromBrandColors,
		buildContrastMatrix,
		shouldUseDarkText,
		blendColors,
		extractColorsFromPixels,
		scoreAndRankColors,
		buildPaletteFromExtracted,
		PRESET_THEMES,
		type HarmonyType,
		type BrandTheme,
		type ContrastPair,
		type HarmonyTriple
	} from '$lib/utils/brand-colors';
	import ColorHarmonyWheel from './ColorHarmonyWheel.svelte';
	import GoogleFontPicker from './GoogleFontPicker.svelte';

	const dispatch = createEventDispatcher();

	// ─── Props ────────────────────────────────────────────

	export let colors: Record<string, string | undefined> = {};
	export let logoUrl: string | undefined = undefined;
	export let logoHorizontalUrl: string | undefined = undefined;
	export let logoVerticalUrl: string | undefined = undefined;
	export let logoConcept: string | undefined = undefined;
	export let typographyLogo: string | undefined = undefined;
	export let typographyHeading: string | undefined = undefined;
	export let typographyBody: string | undefined = undefined;

	// ─── Color field definitions ─────────────────────────

	interface ColorFieldDef {
		key: string;
		label: string;
		desc: string;
		removable?: boolean;
	}

	/** The 3 core brand colors — always present */
	const CORE_BRAND_FIELDS: ColorFieldDef[] = [
		{ key: 'primaryColor', label: 'Brand Color 1', desc: 'Main brand color' },
		{ key: 'secondaryColor', label: 'Brand Color 2', desc: 'Supporting accent' },
		{ key: 'accentColor', label: 'Brand Color 3', desc: 'Highlight & CTA' }
	];

	/** Optional brand colors 4 & 5 */
	const EXTRA_BRAND_FIELDS: ColorFieldDef[] = [
		{ key: 'brandColor4', label: 'Brand Color 4', desc: 'Additional brand color', removable: true },
		{ key: 'brandColor5', label: 'Brand Color 5', desc: 'Additional brand color', removable: true }
	];

	const MAX_BRAND_COLORS = 5;

	const PALETTE_LABELS: Record<string, string> = {
		primaryColor: '1',
		secondaryColor: '2',
		accentColor: '3',
		brandColor4: '4',
		brandColor5: '5'
	};

	// ─── State ───────────────────────────────────────────

	let localColors: Record<string, string> = {};
	/** Derived layout/status colors auto-generated from brand colors */
	let derivedColors: Record<string, string> = {};
	let activeField: string | null = null;
	/** How many extra color slots are active (0, 1, or 2) */
	let extraColorCount = 0;

	// All possible brand keys (used for initialization)
	const ALL_POSSIBLE_KEYS = [...CORE_BRAND_FIELDS, ...EXTRA_BRAND_FIELDS].map((f) => f.key);

	// Harmony
	let harmonyType: HarmonyType = 'complementary';
	let harmonyResults: string[] = [];

	// Panels
	let showPresets = false;
	let showContrastMatrix = false;
	let showHarmony = true;

	// SV Picker
	let svCanvas: HTMLCanvasElement;
	let hueCanvas: HTMLCanvasElement;
	let svCtx: CanvasRenderingContext2D | null = null;
	let hueCtx: CanvasRenderingContext2D | null = null;
	const svWidth = 320;
	const svHeight = 220;
	const hueStripWidth = 24;
	let isDraggingSv = false;
	let isDraggingHue = false;

	// Active color state
	let activeHue = 0;
	let activeSatHsv = 100;
	let activeValHsv = 100;
	let activeSatHsl = 100;
	let activeLightHsl = 50;

	// Clipboard feedback
	let copyFeedbackField: string | null = null;

	// Logo color extraction
	let isExtractingColors = false;
	let extractedPalette: { primary: string; secondary: string; accent: string } | null = null;
	let logoExtractError: string | null = null;

	// ─── Reactivity ──────────────────────────────────────

	// Detect extra colors from parent and set count BEFORE visibleFields computes
	$: {
		let detected = 0;
		if (colors['brandColor5']) detected = 2;
		else if (colors['brandColor4']) detected = 1;
		if (detected > extraColorCount) extraColorCount = detected;
	}

	/** Reactive list of currently visible brand color fields */
	$: visibleFields = [...CORE_BRAND_FIELDS, ...EXTRA_BRAND_FIELDS.slice(0, extraColorCount)];
	$: ALL_BRAND_KEYS = visibleFields.map((f) => f.key);

	$: {
		const newLocal: Record<string, string> = {};
		for (const key of ALL_POSSIBLE_KEYS) {
			newLocal[key] = colors[key] || '';
		}
		localColors = newLocal;
	}

	// Track whether the component has fully mounted
	let hasMounted = false;
	/** Serialized snapshot of the last dispatched derived colors — used to prevent infinite loops */
	let lastDispatchedDerived = '';

	// Auto-derive layout/status colors whenever brand colors change
	$: {
		const primary = localColors['primaryColor'];
		if (primary && isValidHex(primary)) {
			derivedColors = derivedThemeFromBrandColors({ primary });
		}
	}

	// Persist derived layout/status colors to DB after mount
	// IMPORTANT: compare against the last dispatched snapshot to avoid
	// an infinite loop (dispatch → parent saves → loadProfile → new colors
	// prop → new localColors → new derivedColors → dispatch again).
	$: if (hasMounted && Object.keys(derivedColors).length > 0) {
		const _derived = { ...derivedColors };
		const snapshot = JSON.stringify(_derived);
		if (snapshot !== lastDispatchedDerived) {
			lastDispatchedDerived = snapshot;
			tick().then(() => {
				dispatch('colorsbatchchange', {
					colors: Object.entries(_derived).map(([key, value]) => ({ key, value }))
				});
			});
		}
	}

	// Build a merged view used by preview + contrast (brand + derived)
	$: mergedTheme = {
		...derivedColors,
		...Object.fromEntries(Object.entries(localColors).filter(([_, v]) => v && isValidHex(v)))
	} as Record<string, string>;

	$: if (activeField && localColors[activeField]) {
		updateHarmony(localColors[activeField], harmonyType);
	}

	$: if (
		!(isDraggingSv || isDraggingHue) &&
		activeField &&
		localColors[activeField] &&
		isValidHex(localColors[activeField])
	) {
		const _hex = localColors[activeField];
		const _hsv = hexToHsv(_hex);
		const _hsl = hexToHsl(_hex);
		if (_hsv) {
			activeHue = _hsv.h;
			activeSatHsv = _hsv.s;
			activeValHsv = _hsv.v;
		}
		if (_hsl) {
			activeSatHsl = _hsl.s;
			activeLightHsl = _hsl.l;
		}
	}

	$: filledCount = ALL_BRAND_KEYS.filter(
		(k) => localColors[k] && isValidHex(localColors[k])
	).length;
	$: hasAnyColor = filledCount > 0;
	$: contrastPairs = showContrastMatrix
		? buildContrastMatrix(mergedTheme as Partial<BrandTheme>)
		: [];

	$: if (
		svCtx &&
		(activeHue !== undefined ||
			activeSatHsv !== undefined ||
			activeValHsv !== undefined ||
			activeField !== undefined ||
			localColors)
	) {
		drawSvPicker();
	}
	$: if (hueCtx && activeHue !== undefined) {
		drawHueStrip();
	}

	// ─── Harmony ─────────────────────────────────────────

	function updateHarmony(hex: string, type: HarmonyType) {
		if (!isValidHex(hex)) {
			harmonyResults = [];
			return;
		}
		switch (type) {
			case 'complementary':
				harmonyResults = generateComplementary(hex);
				break;
			case 'analogous':
				harmonyResults = generateAnalogous(hex);
				break;
			case 'triadic':
				harmonyResults = generateTriadic(hex);
				break;
			case 'tetradic':
				harmonyResults = generateTetradic(hex);
				break;
			case 'split-complementary':
				harmonyResults = generateSplitComplementary(hex);
				break;
			case 'monochromatic':
				harmonyResults = generateMonochromatic(hex, 5);
				break;
		}
	}

	const HARMONY_TYPES: { type: HarmonyType; label: string; desc: string; icon: string }[] = [
		{ type: 'complementary', label: 'Complement', desc: 'Opposite on wheel', icon: '↔' },
		{ type: 'analogous', label: 'Analogous', desc: 'Adjacent hues', icon: '≈' },
		{ type: 'triadic', label: 'Triadic', desc: '3 equally spaced', icon: '△' },
		{ type: 'tetradic', label: 'Tetradic', desc: '4 at 90° intervals', icon: '◇' },
		{ type: 'split-complementary', label: 'Split', desc: 'Y-shaped split', icon: '⑂' },
		{ type: 'monochromatic', label: 'Mono', desc: 'Light → dark shades', icon: '▥' }
	];

	// ─── SV Picker Drawing ───────────────────────────────

	onMount(() => {
		drawSvPicker();
		drawHueStrip();
		hasMounted = true;
	});

	function drawSvPicker() {
		if (!svCanvas) return;
		if (!svCtx) {
			svCtx = svCanvas.getContext('2d');
		}
		if (!svCtx) return;
		const ctx = svCtx;
		const w = svWidth;
		const h = svHeight;

		// 1. Fill with pure hue
		ctx.fillStyle = `hsl(${Math.round(activeHue)}, 100%, 50%)`;
		ctx.fillRect(0, 0, w, h);

		// 2. White→transparent gradient (saturation)
		const whiteGrad = ctx.createLinearGradient(0, 0, w, 0);
		whiteGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
		whiteGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
		ctx.fillStyle = whiteGrad;
		ctx.fillRect(0, 0, w, h);

		// 3. Transparent→black gradient (value)
		const blackGrad = ctx.createLinearGradient(0, 0, 0, h);
		blackGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
		blackGrad.addColorStop(1, 'rgba(0, 0, 0, 1)');
		ctx.fillStyle = blackGrad;
		ctx.fillRect(0, 0, w, h);

		// 4. Active color marker
		if (activeField && localColors[activeField] && isValidHex(localColors[activeField])) {
			const mx = (activeSatHsv / 100) * w;
			const my = (1 - activeValHsv / 100) * h;

			// Outer glow
			ctx.beginPath();
			ctx.arc(mx, my, 12, 0, Math.PI * 2);
			ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
			ctx.lineWidth = 1;
			ctx.stroke();

			// White ring
			ctx.beginPath();
			ctx.arc(mx, my, 9, 0, Math.PI * 2);
			ctx.strokeStyle = '#ffffff';
			ctx.lineWidth = 2.5;
			ctx.stroke();

			// Color fill
			ctx.beginPath();
			ctx.arc(mx, my, 6.5, 0, Math.PI * 2);
			ctx.fillStyle = localColors[activeField];
			ctx.fill();
		}

		// 5. Harmony markers
		if (showHarmony && harmonyResults.length > 0) {
			for (const hc of harmonyResults) {
				const hsv = hexToHsv(hc);
				if (!hsv) continue;
				const mx = (hsv.s / 100) * w;
				const my = (1 - hsv.v / 100) * h;

				// Diamond shape
				ctx.save();
				ctx.translate(mx, my);
				ctx.rotate(Math.PI / 4);
				ctx.beginPath();
				ctx.rect(-4, -4, 8, 8);
				ctx.fillStyle = hc;
				ctx.fill();
				ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
				ctx.lineWidth = 1.5;
				ctx.stroke();
				ctx.restore();
			}
		}
	}

	function drawHueStrip() {
		if (!hueCanvas) return;
		if (!hueCtx) {
			hueCtx = hueCanvas.getContext('2d');
		}
		if (!hueCtx) return;
		const ctx = hueCtx;
		const w = hueStripWidth;
		const h = svHeight;

		// Rainbow gradient
		const gradient = ctx.createLinearGradient(0, 0, 0, h);
		const stops = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360];
		for (const stop of stops) {
			gradient.addColorStop(stop / 360, `hsl(${stop}, 100%, 50%)`);
		}
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, w, h);

		// Active hue indicator
		const y = Math.max(0, Math.min(h, (activeHue / 360) * h));
		const triSize = 5;

		// Bar
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(w, y);
		ctx.strokeStyle = '#ffffff';
		ctx.lineWidth = 2;
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(w, y);
		ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
		ctx.lineWidth = 1;
		ctx.stroke();

		// Left triangle
		ctx.beginPath();
		ctx.moveTo(0, y - triSize);
		ctx.lineTo(triSize + 1, y);
		ctx.lineTo(0, y + triSize);
		ctx.closePath();
		ctx.fillStyle = '#ffffff';
		ctx.fill();

		// Right triangle
		ctx.beginPath();
		ctx.moveTo(w, y - triSize);
		ctx.lineTo(w - triSize - 1, y);
		ctx.lineTo(w, y + triSize);
		ctx.closePath();
		ctx.fillStyle = '#ffffff';
		ctx.fill();
	}

	// ─── SV Picker Interaction ───────────────────────────

	function handleSvInteraction(e: MouseEvent | PointerEvent) {
		if (!activeField || !svCanvas) return;
		const rect = svCanvas.getBoundingClientRect();
		const scaleX = svWidth / rect.width;
		const scaleY = svHeight / rect.height;
		let x = (e.clientX - rect.left) * scaleX;
		let y = (e.clientY - rect.top) * scaleY;
		x = Math.max(0, Math.min(svWidth, x));
		y = Math.max(0, Math.min(svHeight, y));

		const s = Math.round((x / svWidth) * 100);
		const v = Math.round((1 - y / svHeight) * 100);

		activeSatHsv = s;
		activeValHsv = v;

		const hex = hsvToHex(Math.round(activeHue), s, v);
		setColor(activeField, hex);

		const hsl = hexToHsl(hex);
		if (hsl) {
			activeSatHsl = hsl.s;
			activeLightHsl = hsl.l;
		}
	}

	function handleSvPointerDown(e: MouseEvent | TouchEvent) {
		if (!activeField) {
			// Auto-select first empty brand color field on first tap
			const emptyField = visibleFields.find(
				(f) => !localColors[f.key] || localColors[f.key] === ''
			);
			if (emptyField) {
				activeField = emptyField.key;
			} else {
				activeField = 'primaryColor';
			}
		}
		isDraggingSv = true;
		if ('touches' in e) {
			e.preventDefault();
			handleTouchSv(e);
		} else {
			handleSvInteraction(e);
		}
	}

	function handleTouchSv(e: TouchEvent) {
		if (!activeField || !svCanvas || !e.touches[0]) return;
		const touch = e.touches[0];
		const rect = svCanvas.getBoundingClientRect();
		const scaleX = svWidth / rect.width;
		const scaleY = svHeight / rect.height;
		let x = (touch.clientX - rect.left) * scaleX;
		let y = (touch.clientY - rect.top) * scaleY;
		x = Math.max(0, Math.min(svWidth, x));
		y = Math.max(0, Math.min(svHeight, y));

		const s = Math.round((x / svWidth) * 100);
		const v = Math.round((1 - y / svHeight) * 100);
		activeSatHsv = s;
		activeValHsv = v;
		const hex = hsvToHex(Math.round(activeHue), s, v);
		setColor(activeField, hex);
		const hsl = hexToHsl(hex);
		if (hsl) {
			activeSatHsl = hsl.s;
			activeLightHsl = hsl.l;
		}
	}

	function handleTouchHue(e: TouchEvent) {
		if (!activeField || !hueCanvas || !e.touches[0]) return;
		const touch = e.touches[0];
		const rect = hueCanvas.getBoundingClientRect();
		const scaleY = svHeight / rect.height;
		let y = (touch.clientY - rect.top) * scaleY;
		y = Math.max(0, Math.min(svHeight, y));
		const h = Math.round((y / svHeight) * 360);
		activeHue = h;
		const hex = hsvToHex(h, Math.round(activeSatHsv), Math.round(activeValHsv));
		setColor(activeField, hex);
		const hsl = hexToHsl(hex);
		if (hsl) {
			activeSatHsl = hsl.s;
			activeLightHsl = hsl.l;
		}
	}

	function handleHueInteraction(e: MouseEvent | PointerEvent) {
		if (!activeField || !hueCanvas) return;
		const rect = hueCanvas.getBoundingClientRect();
		const scaleY = svHeight / rect.height;
		let y = (e.clientY - rect.top) * scaleY;
		y = Math.max(0, Math.min(svHeight, y));

		const h = Math.round((y / svHeight) * 360);
		activeHue = h;

		const hex = hsvToHex(h, Math.round(activeSatHsv), Math.round(activeValHsv));
		setColor(activeField, hex);

		const hsl = hexToHsl(hex);
		if (hsl) {
			activeSatHsl = hsl.s;
			activeLightHsl = hsl.l;
		}
	}

	function handleHuePointerDown(e: MouseEvent | TouchEvent) {
		if (!activeField) return;
		isDraggingHue = true;
		if ('touches' in e) {
			e.preventDefault();
			handleTouchHue(e);
		} else {
			handleHueInteraction(e);
		}
	}

	function handleGlobalPointerMove(e: MouseEvent | TouchEvent) {
		if ('touches' in e) {
			if (isDraggingSv) handleTouchSv(e);
			if (isDraggingHue) handleTouchHue(e);
		} else {
			if (isDraggingSv) handleSvInteraction(e);
			if (isDraggingHue) handleHueInteraction(e);
		}
	}

	function handleGlobalPointerUp() {
		isDraggingSv = false;
		isDraggingHue = false;
	}

	// ─── Color Operations ────────────────────────────────

	function setColor(key: string, value: string) {
		const normalized = normalizeHex(value);
		if (normalized) {
			localColors[key] = normalized;
			localColors = localColors;
			dispatch('colorchange', { key, value: normalized });
			tick().then(() => {
				drawSvPicker();
				drawHueStrip();
			});
		}
	}

	function handleHexInput(key: string, value: string) {
		localColors[key] = value;
		localColors = localColors;
		if (isValidHex(value)) {
			const n = normalizeHex(value);
			if (n) {
				localColors[key] = n;
				localColors = localColors;
				dispatch('colorchange', { key, value: n });
				tick().then(() => {
					drawSvPicker();
					drawHueStrip();
				});
			}
		}
	}

	function handleNativeColorPick(key: string, e: Event) {
		const target = e.target as HTMLInputElement;
		setColor(key, target.value);
	}

	function handleFieldClick(key: string) {
		activeField = key;

		const val = localColors[key];
		if (val && isValidHex(val)) {
			const hsv = hexToHsv(val);
			const hsl = hexToHsl(val);
			if (hsv) {
				activeHue = hsv.h;
				activeSatHsv = hsv.s;
				activeValHsv = hsv.v;
			}
			if (hsl) {
				activeSatHsl = hsl.s;
				activeLightHsl = hsl.l;
			}
		}
		tick().then(() => {
			drawSvPicker();
			drawHueStrip();
		});
	}

	function handleHslChange() {
		if (!activeField) return;
		const hex = hslToHex(
			Math.round(activeHue),
			Math.round(activeSatHsl),
			Math.round(activeLightHsl)
		);
		setColor(activeField, hex);
		const hsv = hexToHsv(hex);
		if (hsv) {
			activeSatHsv = hsv.s;
			activeValHsv = hsv.v;
		}
	}

	function handleHueSliderChange() {
		if (!activeField) return;
		const hex = hsvToHex(Math.round(activeHue), Math.round(activeSatHsv), Math.round(activeValHsv));
		setColor(activeField, hex);
		const hsl = hexToHsl(hex);
		if (hsl) {
			activeSatHsl = hsl.s;
			activeLightHsl = hsl.l;
		}
	}

	function clearColor(key: string) {
		localColors[key] = '';
		localColors = localColors;
		dispatch('colorchange', { key, value: '' });
	}

	// ─── Clipboard ──────────────────────────────────────

	async function copyHex(hex: string, key: string) {
		try {
			await navigator.clipboard.writeText(hex);
			copyFeedbackField = key;
			setTimeout(() => {
				if (copyFeedbackField === key) copyFeedbackField = null;
			}, 1500);
		} catch {
			// Silently handle
		}
	}

	// ─── Preset & Generation ─────────────────────────────

	function applyPreset(preset: (typeof PRESET_THEMES)[0]) {
		// Only apply brand color keys from the preset
		for (const key of ALL_BRAND_KEYS) {
			const value = (preset.colors as unknown as Record<string, string>)[key];
			if (value) setColor(key, value);
		}
		showPresets = false;
		activeField = 'primaryColor';
	}

	function generateFromPrimary() {
		const primary = localColors['primaryColor'];
		if (!primary || !isValidHex(primary)) return;
		const theme = generateFullTheme(primary);
		// Only fill empty brand color slots (not layout/status)
		for (const key of ALL_BRAND_KEYS) {
			if (key === 'primaryColor') continue;
			const value = (theme as unknown as Record<string, string>)[key];
			if (value && (!localColors[key] || localColors[key] === '')) {
				setColor(key, value);
			}
		}
	}

	function generateAll() {
		const primary = localColors['primaryColor'];
		if (!primary || !isValidHex(primary)) return;
		const theme = generateFullTheme(primary);
		// Only generate brand colors (layout/status are auto-derived)
		for (const key of ALL_BRAND_KEYS) {
			if (key === 'primaryColor') continue;
			const value = (theme as unknown as Record<string, string>)[key];
			if (value) setColor(key, value);
		}
	}

	function applyHarmonyColor(hex: string) {
		if (!activeField) return;
		const emptySlot = ALL_BRAND_KEYS.find((k) => !localColors[k] || localColors[k] === '');
		if (emptySlot && emptySlot !== activeField) {
			setColor(emptySlot, hex);
		} else {
			setColor(activeField, hex);
		}
	}

	function handleHarmonyApply(e: CustomEvent<HarmonyTriple>) {
		const { primary, secondary, accent } = e.detail;

		// Update local colors immediately for UI
		const normalized = [
			{ key: 'primaryColor', value: normalizeHex(primary) },
			{ key: 'secondaryColor', value: normalizeHex(secondary) },
			{ key: 'accentColor', value: normalizeHex(accent) }
		].filter((c) => c.value) as { key: string; value: string }[];

		for (const c of normalized) {
			localColors[c.key] = c.value;
		}
		localColors = localColors;

		// Dispatch a SINGLE batch event so the parent can save all fields sequentially
		// (avoids race condition with the isSaving mutex in saveField)
		dispatch('colorsbatchchange', {
			colors: normalized.map((c) => ({ key: c.key, value: c.value }))
		});

		// Activate primary field and sync picker/slider state to the new primary
		activeField = 'primaryColor';

		const newPrimary = normalized.find((c) => c.key === 'primaryColor')?.value;
		if (newPrimary) {
			const hsv = hexToHsv(newPrimary);
			const hsl = hexToHsl(newPrimary);
			if (hsv) {
				activeHue = hsv.h;
				activeSatHsv = hsv.s;
				activeValHsv = hsv.v;
			}
			if (hsl) {
				activeSatHsl = hsl.s;
				activeLightHsl = hsl.l;
			}
		}

		tick().then(() => {
			drawSvPicker();
			drawHueStrip();
		});
	}

	function handleHarmonyPreview(e: CustomEvent<HarmonyTriple>) {
		// Live preview while dragging the wheel — update local colors without dispatch
		const { primary, secondary, accent } = e.detail;
		localColors['primaryColor'] = normalizeHex(primary) || primary;
		localColors['secondaryColor'] = normalizeHex(secondary) || secondary;
		localColors['accentColor'] = normalizeHex(accent) || accent;
		localColors = localColors;
	}

	function clearAll() {
		for (const key of ALL_BRAND_KEYS) {
			localColors[key] = '';
		}
		localColors = localColors;
		for (const key of ALL_BRAND_KEYS) {
			dispatch('colorchange', { key, value: '' });
		}
	}

	function handleLogoClick() {
		dispatch('editlogo');
	}

	// ─── Logo Color Extraction ────────────────────────────

	async function extractColorsFromLogo() {
		if (!logoUrl || isExtractingColors) return;
		isExtractingColors = true;
		logoExtractError = null;
		extractedPalette = null;

		try {
			const img = new Image();
			img.crossOrigin = 'anonymous';

			await new Promise<void>((resolve, reject) => {
				img.onload = () => resolve();
				img.onerror = () => reject(new Error('Failed to load logo image'));
				img.src = logoUrl!;
			});

			// Draw to offscreen canvas and extract pixels
			const maxDim = 200; // downsample for performance
			const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
			const w = Math.round(img.width * scale);
			const h = Math.round(img.height * scale);

			const offscreen = document.createElement('canvas');
			offscreen.width = w;
			offscreen.height = h;
			const ctx = offscreen.getContext('2d');
			if (!ctx) throw new Error('Canvas not supported');

			ctx.drawImage(img, 0, 0, w, h);
			const imageData = ctx.getImageData(0, 0, w, h);

			const raw = extractColorsFromPixels(imageData.data, w, h, { maxColors: 8 });
			const ranked = scoreAndRankColors(raw);
			extractedPalette = buildPaletteFromExtracted(ranked);
		} catch (err) {
			logoExtractError = err instanceof Error ? err.message : 'Extraction failed';
		} finally {
			isExtractingColors = false;
		}
	}

	function applyExtractedColors() {
		if (!extractedPalette) return;
		const { primary, secondary, accent } = extractedPalette;

		const normalized = [
			{ key: 'primaryColor', value: normalizeHex(primary) },
			{ key: 'secondaryColor', value: normalizeHex(secondary) },
			{ key: 'accentColor', value: normalizeHex(accent) }
		].filter((c) => c.value) as { key: string; value: string }[];

		for (const c of normalized) {
			localColors[c.key] = c.value;
		}
		localColors = localColors;

		dispatch('colorsbatchchange', {
			colors: normalized.map((c) => ({ key: c.key, value: c.value }))
		});

		activeField = 'primaryColor';
		extractedPalette = null;

		const hsv = hexToHsv(normalized[0]?.value || primary);
		const hsl = hexToHsl(normalized[0]?.value || primary);
		if (hsv) {
			activeHue = hsv.h;
			activeSatHsv = hsv.s;
			activeValHsv = hsv.v;
		}
		if (hsl) {
			activeSatHsl = hsl.s;
			activeLightHsl = hsl.l;
		}

		tick().then(() => {
			drawSvPicker();
			drawHueStrip();
		});
	}

	function applyExtractedAndGenerate() {
		if (!extractedPalette) return;
		// Apply extracted colors (layout/status are auto-derived)
		applyExtractedColors();
	}

	let fontPickerField: 'typographyLogo' | 'typographyHeading' | 'typographyBody' | null = null;

	// Local font state for instant preview (before server round-trip)
	let localLogoFont: string | undefined = typographyLogo;
	let localHeadingFont: string | undefined = typographyHeading;
	let localBodyFont: string | undefined = typographyBody;
	$: localLogoFont = typographyLogo;
	$: localHeadingFont = typographyHeading;
	$: localBodyFont = typographyBody;

	const loadedPreviewFonts = new Set<string>();
	function loadGoogleFontForPreview(family: string) {
		if (!family || loadedPreviewFonts.has(family)) return;
		loadedPreviewFonts.add(family);
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;700;800&display=swap`;
		document.head.appendChild(link);
	}

	// Load fonts that arrive via props
	$: if (typographyLogo) loadGoogleFontForPreview(typographyLogo);
	$: if (typographyHeading) loadGoogleFontForPreview(typographyHeading);
	$: if (typographyBody) loadGoogleFontForPreview(typographyBody);

	function handleFontClick(field: 'typographyLogo' | 'typographyHeading' | 'typographyBody') {
		fontPickerField = fontPickerField === field ? null : field;
	}

	function handleFontSelect(e: CustomEvent<{ field: string; font: string }>) {
		fontPickerField = null;
		// Update local state immediately for instant preview
		if (e.detail.field === 'typographyLogo') {
			localLogoFont = e.detail.font;
		} else if (e.detail.field === 'typographyHeading') {
			localHeadingFont = e.detail.font;
		} else if (e.detail.field === 'typographyBody') {
			localBodyFont = e.detail.font;
		}
		loadGoogleFontForPreview(e.detail.font);
		dispatch('fontchange', { field: e.detail.field, value: e.detail.font });
	}

	function handleFontPickerClose() {
		fontPickerField = null;
	}

	// ─── Contrast helpers ────────────────────────────────

	function contrastRatingClass(ratio: number): string {
		if (ratio >= 7) return 'aaa';
		if (ratio >= 4.5) return 'aa';
		return 'fail';
	}
</script>

<svelte:window
	on:mousemove={handleGlobalPointerMove}
	on:mouseup={handleGlobalPointerUp}
	on:touchmove|passive={handleGlobalPointerMove}
	on:touchend={handleGlobalPointerUp}
/>

<div class="color-editor">
	<!-- ─── LOGO ─── -->
	<div class="editor-section">
		<h3 class="section-label">LOGO</h3>

		<!-- Logo Variants Grid -->
		<div class="logo-variants-grid">
			<!-- Icon (Square) -->
			<div class="logo-variant">
				<span class="logo-variant-label">Icon</span>
				<button
					class="logo-area logo-area--icon"
					on:click={handleLogoClick}
					aria-label="Edit icon logo"
				>
					{#if logoUrl}
						<img src={logoUrl} alt="Brand logo icon" class="logo-image" />
					{:else}
						<div class="logo-placeholder">
							<svg
								width="28"
								height="28"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
								<circle cx="8.5" cy="8.5" r="1.5" />
								<polyline points="21 15 16 10 5 21" />
							</svg>
						</div>
					{/if}
				</button>
			</div>

			<!-- Horizontal (Icon + Name side by side) -->
			<div class="logo-variant logo-variant--wide">
				<span class="logo-variant-label">Horizontal</span>
				<button
					class="logo-area logo-area--horizontal"
					on:click={() => dispatch('editlogo', { variant: 'horizontal' })}
					aria-label="Edit horizontal logo"
				>
					{#if logoHorizontalUrl}
						<img src={logoHorizontalUrl} alt="Horizontal brand logo" class="logo-image" />
					{:else}
						<div class="logo-placeholder">
							<svg
								width="28"
								height="28"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<rect x="1" y="5" width="14" height="14" rx="2" ry="2" />
								<line x1="17" y1="8" x2="23" y2="8" />
								<line x1="17" y1="12" x2="23" y2="12" />
								<line x1="17" y1="16" x2="21" y2="16" />
							</svg>
						</div>
					{/if}
				</button>
			</div>

			<!-- Vertical (Icon above Name) -->
			<div class="logo-variant">
				<span class="logo-variant-label">Vertical</span>
				<button
					class="logo-area logo-area--vertical"
					on:click={() => dispatch('editlogo', { variant: 'vertical' })}
					aria-label="Edit vertical logo"
				>
					{#if logoVerticalUrl}
						<img src={logoVerticalUrl} alt="Vertical brand logo" class="logo-image" />
					{:else}
						<div class="logo-placeholder">
							<svg
								width="28"
								height="28"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<rect x="5" y="2" width="14" height="14" rx="2" ry="2" />
								<line x1="6" y1="19" x2="18" y2="19" />
								<line x1="8" y1="22" x2="16" y2="22" />
							</svg>
						</div>
					{/if}
				</button>
			</div>
		</div>

		{#if logoConcept && !logoUrl}
			<p class="logo-concept-text">{logoConcept}</p>
		{/if}

		<!-- Extract Colors from Logo -->
		{#if logoUrl}
			<div class="logo-extract-section">
				{#if !extractedPalette && !isExtractingColors}
					<button
						class="extract-btn"
						on:click={extractColorsFromLogo}
						aria-label="Extract colors from logo"
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
							<path d="M12 2 L2 7 L12 12 L22 7 Z" />
							<path d="M2 17 L12 22 L22 17" />
							<path d="M2 12 L12 17 L22 12" />
						</svg>
						Extract Colors from Logo
					</button>
				{/if}

				{#if isExtractingColors}
					<div class="extract-loading">
						<span class="extract-spinner"></span>
						Analyzing logo colors...
					</div>
				{/if}

				{#if logoExtractError}
					<p class="extract-error">{logoExtractError}</p>
				{/if}

				{#if extractedPalette}
					<div class="extracted-preview">
						<span class="extract-label">Colors found in your logo:</span>
						<div class="extracted-swatches">
							{#each [{ color: extractedPalette.primary, label: 'Primary' }, { color: extractedPalette.secondary, label: 'Secondary' }, { color: extractedPalette.accent, label: 'Accent' }] as swatch}
								<div class="extracted-swatch-card">
									<span class="extracted-swatch" style="background-color: {swatch.color}"></span>
									<span class="extracted-swatch-label">{swatch.label}</span>
									<span class="extracted-swatch-hex">{swatch.color}</span>
								</div>
							{/each}
						</div>
						<div class="extracted-actions">
							<button class="extract-apply-btn" on:click={applyExtractedAndGenerate}>
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.5"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<polyline points="20 6 9 17 4 12" />
								</svg>
								Apply &amp; Build Full Theme
							</button>
							<button class="extract-focal-btn" on:click={applyExtractedColors}>
								Apply Focal Only
							</button>
							<button class="extract-dismiss-btn" on:click={() => (extractedPalette = null)}>
								Dismiss
							</button>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- ─── GETTING STARTED ─── -->
	{#if !hasAnyColor}
		<div class="getting-started">
			<h3 class="section-label">GET STARTED</h3>
			<p class="getting-started-hint">
				Choose a starting point for your palette, or build one from scratch below.
			</p>

			{#if logoUrl}
				<button
					class="starter-btn starter-btn--featured"
					on:click={extractColorsFromLogo}
					disabled={isExtractingColors}
				>
					<svg
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M12 2 L2 7 L12 12 L22 7 Z" />
						<path d="M2 17 L12 22 L22 17" />
						<path d="M2 12 L12 17 L22 12" />
					</svg>
					<div class="starter-text">
						<strong>{isExtractingColors ? 'Analyzing...' : 'Extract from Logo'}</strong>
						<span>Auto-detect brand colors from your logo</span>
					</div>
				</button>
			{/if}

			<button class="starter-btn" on:click={() => (showPresets = true)}>
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
					<rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
				</svg>
				<div class="starter-text">
					<strong>Start from a Preset</strong>
					<span>Curated themes you can customize</span>
				</div>
			</button>

			<p class="or-divider"><span>or pick a primary color below</span></p>
		</div>
	{/if}

	<!-- ─── PRESETS PANEL ─── -->
	{#if showPresets}
		<div class="presets-panel">
			<div class="presets-header">
				<h3 class="section-label">PRESET THEMES</h3>
				<button class="close-btn" on:click={() => (showPresets = false)} aria-label="Close presets">
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg
					>
				</button>
			</div>
			<div class="presets-grid">
				{#each PRESET_THEMES as preset}
					<button
						class="preset-card"
						on:click={() => applyPreset(preset)}
						aria-label="Apply {preset.name} theme"
					>
						<div class="preset-swatches">
							<span class="preset-swatch" style="background:{preset.colors.primaryColor}"></span>
							<span class="preset-swatch" style="background:{preset.colors.secondaryColor}"></span>
							<span class="preset-swatch" style="background:{preset.colors.accentColor}"></span>
							<span
								class="preset-swatch preset-swatch--bg"
								style="background:{preset.colors.backgroundColor}; border: 1px solid {preset.colors
									.borderColor}"
							></span>
						</div>
						<div class="preset-info">
							<strong>{preset.name}</strong>
							<span class="preset-desc">{preset.description}</span>
						</div>
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!--
		From here to the contrast matrix is the workbench: the tool on the left, the
		things it edits on the right. Stacked, choosing a colour meant scrolling away
		from the swatch you were judging it against.

		Both wrappers are `display: contents` until there is room for two columns, so on
		a phone this markup lays out exactly as it did before — same order, same rules,
		no second code path to keep in step.
	-->
	<div class="workbench">
		<div class="workbench-tool">
			<!-- ─── PALETTE OVERVIEW BAR ─── -->
			<div class="palette-bar" role="group" aria-label="Brand color palette overview">
				{#each visibleFields as field}
					{@const value = localColors[field.key] || ''}
					{@const isActive = activeField === field.key}
					<button
						class="pal-item"
						class:active={isActive}
						on:click={() => handleFieldClick(field.key)}
						title="{field.label}{value ? ': ' + value : ''}"
						aria-label="Select {field.label}"
					>
						<span
							class="pal-swatch"
							class:empty={!value}
							style="background: {value || 'transparent'}"
						>
							{#if !value}
								<svg
									width="10"
									height="10"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="3"
									stroke-linecap="round"
								>
									<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
								</svg>
							{/if}
						</span>
						<span class="pal-label">{PALETTE_LABELS[field.key] || ''}</span>
					</button>
				{/each}
				{#if visibleFields.length < MAX_BRAND_COLORS}
					<button
						class="pal-item pal-item--add"
						on:click={() => {
							extraColorCount = Math.min(
								extraColorCount + 1,
								MAX_BRAND_COLORS - CORE_BRAND_FIELDS.length
							);
						}}
						title="Add brand color"
						aria-label="Add brand color"
					>
						<span class="pal-swatch empty">
							<svg
								width="10"
								height="10"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="3"
								stroke-linecap="round"
							>
								<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
							</svg>
						</span>
						<span class="pal-label">+</span>
					</button>
				{/if}
			</div>

			<!-- ─── MAIN PICKER AREA ─── -->
			<div class="picker-section">
				<!-- SV gradient + hue strip -->
				<div class="picker-container">
					<div class="sv-wrap">
						<canvas
							bind:this={svCanvas}
							width={svWidth}
							height={svHeight}
							class="sv-picker"
							class:disabled={!activeField}
							on:mousedown={handleSvPointerDown}
							on:touchstart|preventDefault={handleSvPointerDown}
							aria-label="Color brightness and saturation picker"
						></canvas>
						{#if !activeField}
							<div class="sv-overlay">
								<span>Select a color field to start</span>
							</div>
						{/if}
					</div>
					<div class="hue-wrap">
						<canvas
							bind:this={hueCanvas}
							width={hueStripWidth}
							height={svHeight}
							class="hue-strip"
							class:disabled={!activeField}
							on:mousedown={handleHuePointerDown}
							on:touchstart|preventDefault={handleHuePointerDown}
							aria-label="Hue selector"
						></canvas>
					</div>
				</div>

				<!-- Active field info + hex copy -->
				{#if activeField}
					{@const val = localColors[activeField] || ''}
					{@const fieldDef = [...CORE_BRAND_FIELDS, ...EXTRA_BRAND_FIELDS].find(
						(f) => f.key === activeField
					)}
					<div class="active-bar">
						<label class="active-swatch-wrap">
							<span
								class="active-swatch"
								style="background: {val || 'transparent'}"
								class:empty={!val}
							></span>
							<input
								type="color"
								value={val || '#000000'}
								on:input={(e) => activeField && handleNativeColorPick(activeField, e)}
								class="native-picker"
								tabindex="-1"
								aria-label="Open system color picker"
							/>
						</label>
						<div class="active-info">
							<span class="active-label">{fieldDef?.label || activeField}</span>
							{#if val && isValidHex(val)}
								<span class="active-color-name">{getColorName(val)}</span>
							{:else}
								<span class="active-no-color">Pick from gradient or enter hex</span>
							{/if}
						</div>
						{#if val && isValidHex(val)}
							<button
								class="hex-copy"
								on:click={() => activeField && copyHex(val, activeField)}
								title="Copy hex"
							>
								<span class="hex-val">{val}</span>
								{#if copyFeedbackField === activeField}
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="var(--color-success)"
										stroke-width="2.5"
										stroke-linecap="round"
										stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg
									>
								{:else}
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path
											d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
										/></svg
									>
								{/if}
							</button>
						{/if}
					</div>
				{/if}

				<!-- HSL Fine-tune Sliders -->
				{#if activeField}
					{@const thumbColor =
						localColors[activeField] && isValidHex(localColors[activeField])
							? localColors[activeField]
							: '#888'}
					<div class="hsl-sliders">
						<div class="slider-header">
							<h4 class="slider-heading">FINE-TUNE</h4>
							<span class="slider-mode-label">HSL</span>
						</div>
						<div class="slider-row">
							<label class="slider-label" for="hsl-hue">H</label>
							<input
								id="hsl-hue"
								type="range"
								min="0"
								max="360"
								bind:value={activeHue}
								on:input={handleHueSliderChange}
								class="hsl-range hue-range"
								style="--thumb-color: hsl({activeHue}, 100%, 50%)"
							/>
							<input
								type="number"
								min="0"
								max="360"
								bind:value={activeHue}
								on:change={handleHueSliderChange}
								class="hsl-number"
								aria-label="Hue value"
							/>
							<span class="slider-unit">°</span>
						</div>
						<div class="slider-row">
							<label class="slider-label" for="hsl-sat">S</label>
							<input
								id="hsl-sat"
								type="range"
								min="0"
								max="100"
								bind:value={activeSatHsl}
								on:input={handleHslChange}
								class="hsl-range sat-range"
								style="--track-from: hsl({activeHue}, 0%, {activeLightHsl}%); --track-to: hsl({activeHue}, 100%, {activeLightHsl}%); --thumb-color: {thumbColor}"
							/>
							<input
								type="number"
								min="0"
								max="100"
								bind:value={activeSatHsl}
								on:change={handleHslChange}
								class="hsl-number"
								aria-label="Saturation value"
							/>
							<span class="slider-unit">%</span>
						</div>
						<div class="slider-row">
							<label class="slider-label" for="hsl-light">L</label>
							<input
								id="hsl-light"
								type="range"
								min="0"
								max="100"
								bind:value={activeLightHsl}
								on:input={handleHslChange}
								class="hsl-range light-range"
								style="--track-from: hsl({activeHue}, {activeSatHsl}%, 0%); --track-mid: hsl({activeHue}, {activeSatHsl}%, 50%); --track-to: hsl({activeHue}, {activeSatHsl}%, 100%); --thumb-color: {thumbColor}"
							/>
							<input
								type="number"
								min="0"
								max="100"
								bind:value={activeLightHsl}
								on:change={handleHslChange}
								class="hsl-number"
								aria-label="Lightness value"
							/>
							<span class="slider-unit">%</span>
						</div>
					</div>
				{/if}
			</div>

			<!-- ─── COLOR HARMONY ─── -->
			<div class="harmony-panel" class:open={showHarmony}>
				<button
					class="section-toggle"
					on:click={() => (showHarmony = !showHarmony)}
					aria-expanded={showHarmony}
				>
					<span class="section-toggle-title">
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
							<circle cx="12" cy="12" r="10" />
							<circle cx="12" cy="12" r="4" />
							<line x1="12" y1="2" x2="12" y2="6" />
							<line x1="12" y1="18" x2="12" y2="22" />
							<line x1="2" y1="12" x2="6" y2="12" />
							<line x1="18" y1="12" x2="22" y2="12" />
						</svg>
						Color Harmony
					</span>
					<svg
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="chevron"
						class:rotate={showHarmony}
					>
						<polyline points="6 9 12 15 18 9" />
					</svg>
				</button>
				{#if showHarmony}
					<div class="harmony-body">
						<ColorHarmonyWheel
							primaryColor={localColors['primaryColor'] || '#3b82f6'}
							{harmonyType}
							on:harmonyapply={handleHarmonyApply}
							on:harmonypreview={handleHarmonyPreview}
							on:harmonychange={(e) => {
								const { primary, secondary, accent } = e.detail;
								localColors['primaryColor'] = normalizeHex(primary) || primary;
								localColors['secondaryColor'] = normalizeHex(secondary) || secondary;
								localColors['accentColor'] = normalizeHex(accent) || accent;
								localColors = localColors;
							}}
						/>
					</div>
				{/if}
			</div>
		</div>

		<div class="workbench-targets">
			<!-- ─── BRAND COLOR FIELDS ─── -->
			<div class="color-fields-section">
				<div class="brand-fields-header">
					<span class="section-label">BRAND COLORS</span>
					<span class="filled-badge">{filledCount}/{visibleFields.length}</span>
				</div>

				<!-- Color field list -->
				<div class="tab-content" role="list">
					{#each visibleFields as field}
						{@const value = localColors[field.key] || ''}
						{@const isActive = activeField === field.key}
						<div class="color-row" class:active={isActive}>
							<button
								class="color-row-main"
								on:click={() => handleFieldClick(field.key)}
								aria-label="Edit {field.label} color"
							>
								<label class="swatch-wrap" aria-label="Pick {field.label} with color chooser">
									<span
										class="swatch"
										style="background:{value || 'transparent'}"
										class:empty={!value}
									></span>
									<input
										type="color"
										value={value || '#000000'}
										on:input={(e) => handleNativeColorPick(field.key, e)}
										class="native-picker"
										tabindex="-1"
										aria-label="Pick {field.label} with color chooser"
									/>
								</label>
								<div class="field-text">
									<span class="field-label">{field.label}</span>
									<span class="field-desc">{field.desc}</span>
								</div>
							</button>
							<div class="field-controls">
								<input
									type="text"
									{value}
									on:input={(e) => handleHexInput(field.key, e.currentTarget.value)}
									on:focus={() => handleFieldClick(field.key)}
									class="hex-input"
									placeholder="#000000"
									maxlength="7"
									spellcheck="false"
									aria-label="{field.label} hex value"
								/>
								{#if value}
									<button
										class="clear-btn"
										on:click|stopPropagation={() => clearColor(field.key)}
										aria-label="Clear {field.label}"
										title="Clear"
									>
										<svg
											width="12"
											height="12"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2.5"
											><line x1="18" y1="6" x2="6" y2="18" /><line
												x1="6"
												y1="6"
												x2="18"
												y2="18"
											/></svg
										>
									</button>
								{/if}
								{#if field.removable}
									<button
										class="remove-color-btn"
										on:click|stopPropagation={() => {
											clearColor(field.key);
											extraColorCount = Math.max(0, extraColorCount - 1);
										}}
										aria-label="Remove {field.label}"
										title="Remove color"
									>
										<svg
											width="12"
											height="12"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2.5"
											stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg
										>
									</button>
								{/if}
							</div>
						</div>
					{/each}

					<!-- Add color button -->
					{#if visibleFields.length < MAX_BRAND_COLORS}
						<button
							class="add-color-row"
							on:click={() => {
								extraColorCount = Math.min(
									extraColorCount + 1,
									MAX_BRAND_COLORS - CORE_BRAND_FIELDS.length
								);
							}}
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
								stroke-linecap="round"
							>
								<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
							</svg>
							Add Brand Color
						</button>
					{/if}

					<!-- Auto-generate buttons (shown when primary is set) -->
					{#if localColors['primaryColor'] && isValidHex(localColors['primaryColor'])}
						<div class="generate-row">
							<button
								class="gen-btn"
								on:click={generateFromPrimary}
								title="Fill empty fields automatically"
							>
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path
										d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
									/>
								</svg>
								Auto-fill empty colors from Primary
							</button>
							<button
								class="gen-btn gen-btn--secondary"
								on:click={generateAll}
								title="Regenerate all non-primary colors"
							>
								Regenerate All
							</button>
						</div>
					{/if}
				</div>
			</div>

			<!-- ─── LIVE PREVIEW ─── -->
			{#if hasAnyColor}
				<div class="preview-section">
					<h3 class="section-label">LIVE PREVIEW</h3>
					<div
						class="live-preview"
						style="
					background: {mergedTheme.backgroundColor || '#0a0a0a'};
					color: {mergedTheme.textColor || '#f8f9fa'};
					border-color: {mergedTheme.borderColor || '#333'};
					{localBodyFont ? `font-family: '${localBodyFont}', sans-serif;` : ''}
				"
					>
						<!-- Mini nav -->
						<div
							class="preview-nav"
							style="background: {mergedTheme.surfaceColor ||
								'#1a1a1a'}; border-bottom: 1px solid {mergedTheme.borderColor || '#333'};"
						>
							<span
								class="preview-brand"
								style="color: {localColors.primaryColor || '#3b82f6'}; {localLogoFont
									? `font-family: '${localLogoFont}', sans-serif`
									: localHeadingFont
										? `font-family: '${localHeadingFont}', sans-serif`
										: ''}">⬡ Brand</span
							>
							<div class="preview-links">
								<span style="color: {mergedTheme.textColor || '#f8f9fa'}">Home</span>
								<span style="color: {mergedTheme.textSecondaryColor || '#888'}">About</span>
								<span style="color: {localColors.accentColor || '#06b6d4'}">Contact</span>
							</div>
						</div>

						<!-- Hero section -->
						<div
							class="preview-hero"
							style="border-bottom: 1px solid {mergedTheme.borderColor || '#333'};"
						>
							<h4
								class="preview-hero-title"
								style="color: {mergedTheme.textColor || '#f8f9fa'}; {localHeadingFont
									? `font-family: '${localHeadingFont}', sans-serif`
									: ''}"
							>
								Your Brand,<br />Realized
							</h4>
							<p class="preview-hero-sub" style="color: {mergedTheme.textSecondaryColor || '#888'}">
								See how your colors work together in context.
							</p>
							<div class="preview-buttons">
								<span
									class="preview-btn"
									style="background: {localColors.primaryColor ||
										'#3b82f6'}; color: {localColors.primaryColor &&
									shouldUseDarkText(localColors.primaryColor)
										? '#000'
										: '#fff'}">Get Started</span
								>
								<span
									class="preview-btn preview-btn--outline"
									style="border-color: {localColors.secondaryColor ||
										'#8b5cf6'}; color: {localColors.secondaryColor || '#8b5cf6'}">Learn More</span
								>
							</div>
						</div>

						<!-- Content card -->
						<div
							class="preview-card"
							style="background: {mergedTheme.surfaceColor ||
								'#1a1a1a'}; border: 1px solid {mergedTheme.borderColor || '#333'};"
						>
							<h5
								class="preview-title"
								style="color: {mergedTheme.textColor || '#f8f9fa'}; {localHeadingFont
									? `font-family: '${localHeadingFont}', sans-serif`
									: ''}"
							>
								Feature Card
							</h5>
							<p class="preview-subtitle" style="color: {mergedTheme.textSecondaryColor || '#888'}">
								Components with your theme palette applied.
							</p>
							<div
								class="preview-input"
								style="background: {mergedTheme.backgroundColor ||
									'#0a0a0a'}; border: 1px solid {mergedTheme.borderColor ||
									'#333'}; color: {mergedTheme.textSecondaryColor || '#888'};"
							>
								Search or type a command...
							</div>
							<div class="preview-status">
								<span
									class="preview-badge"
									style="background: {mergedTheme.successColor || '#22c55e'}">Success</span
								>
								<span
									class="preview-badge"
									style="background: {mergedTheme.warningColor || '#f59e0b'}">Warning</span
								>
								<span
									class="preview-badge"
									style="background: {mergedTheme.errorColor || '#ef4444'}">Error</span
								>
							</div>
							<div class="preview-accent-bar">
								<span
									class="preview-accent-dot"
									style="background: {localColors.accentColor || '#06b6d4'}"
								></span>
								<span
									style="color: {localColors.accentColor ||
										'#06b6d4'}; font-size: 0.65rem; font-weight: 600;">Accent highlight</span
								>
							</div>
						</div>
					</div>
				</div>
			{/if}

			<!-- ─── CONTRAST MATRIX ─── -->
			{#if hasAnyColor}
				<div class="contrast-section">
					<button
						class="section-toggle"
						on:click={() => (showContrastMatrix = !showContrastMatrix)}
						aria-expanded={showContrastMatrix}
					>
						<span class="section-toggle-title">
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
								<circle cx="12" cy="12" r="10" />
								<path d="M12 2a10 10 0 0 1 0 20" fill="currentColor" opacity="0.3" />
							</svg>
							Contrast Check
						</span>
						<div class="contrast-toggle-right">
							{#if contrastPairs.length > 0}
								{@const passing = contrastPairs.filter((p) => p.passesAA).length}
								<span class="contrast-summary" class:all-pass={passing === contrastPairs.length}>
									{passing}/{contrastPairs.length} AA
								</span>
							{/if}
							<svg
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="chevron"
								class:rotate={showContrastMatrix}
							>
								<polyline points="6 9 12 15 18 9" />
							</svg>
						</div>
					</button>
					{#if showContrastMatrix && contrastPairs.length > 0}
						<div class="contrast-grid">
							{#each contrastPairs as pair}
								{@const rating = contrastRatingClass(pair.ratio)}
								<div class="contrast-pair" class:pass={pair.passesAA} class:fail={!pair.passesAA}>
									<div class="contrast-sample" style="background:{pair.bg}; color:{pair.fg}">
										Aa
									</div>
									<div class="contrast-detail">
										<span class="contrast-names">{pair.fgLabel} / {pair.bgLabel}</span>
										<span class="contrast-ratio">{pair.ratio.toFixed(1)}:1</span>
									</div>
									<span class="contrast-badge contrast-badge--{rating}">
										{pair.passesAAA ? 'AAA' : pair.passesAA ? 'AA' : 'Fail'}
									</span>
								</div>
							{/each}
						</div>
					{:else if showContrastMatrix}
						<p class="contrast-empty">Set text and background colors to check contrast</p>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<!-- ─── TYPOGRAPHY ─── -->
	<div class="editor-section">
		<h3 class="section-label">TYPOGRAPHY</h3>
		<button
			class="font-row"
			class:open={fontPickerField === 'typographyLogo'}
			on:click={() => handleFontClick('typographyLogo')}
		>
			<span class="font-label">Logo Font</span>
			<span
				class="font-value"
				class:empty={!localLogoFont}
				style={localLogoFont ? `font-family: '${localLogoFont}', sans-serif` : ''}
			>
				{localLogoFont || 'Choose logo font...'}
			</span>
		</button>
		{#if fontPickerField === 'typographyLogo'}
			<GoogleFontPicker
				field="typographyLogo"
				currentFont={localLogoFont}
				on:select={handleFontSelect}
				on:close={handleFontPickerClose}
			/>
		{/if}
		<button
			class="font-row"
			class:open={fontPickerField === 'typographyHeading'}
			on:click={() => handleFontClick('typographyHeading')}
		>
			<span class="font-label">Heading Font</span>
			<span
				class="font-value"
				class:empty={!localHeadingFont}
				style={localHeadingFont ? `font-family: '${localHeadingFont}', sans-serif` : ''}
			>
				{localHeadingFont || 'Choose heading font...'}
			</span>
		</button>
		{#if fontPickerField === 'typographyHeading'}
			<GoogleFontPicker
				field="typographyHeading"
				currentFont={localHeadingFont}
				on:select={handleFontSelect}
				on:close={handleFontPickerClose}
			/>
		{/if}
		<button
			class="font-row"
			class:open={fontPickerField === 'typographyBody'}
			on:click={() => handleFontClick('typographyBody')}
		>
			<span class="font-label">Body Font</span>
			<span
				class="font-value"
				class:empty={!localBodyFont}
				style={localBodyFont ? `font-family: '${localBodyFont}', sans-serif` : ''}
			>
				{localBodyFont || 'Choose body font...'}
			</span>
		</button>
		{#if fontPickerField === 'typographyBody'}
			<GoogleFontPicker
				field="typographyBody"
				currentFont={localBodyFont}
				on:select={handleFontSelect}
				on:close={handleFontPickerClose}
			/>
		{/if}
	</div>

	<!-- ─── FOOTER ACTIONS ─── -->
	{#if hasAnyColor}
		<div class="actions-row">
			{#if !showPresets}
				<button class="action-link" on:click={() => (showPresets = true)}>Browse presets</button>
			{/if}
			<button class="action-link action-link--danger" on:click={clearAll}>Clear all colors</button>
		</div>
	{/if}
</div>

<style>
	/* ═══════════════════════════════════════════════════
	   LAYOUT
	   ═══════════════════════════════════════════════════ */

	.color-editor {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.section-label {
		font-size: 0.6rem;
		font-weight: 700;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.14em;
		margin: 0 0 var(--spacing-sm) 0;
	}

	.editor-section {
		display: flex;
		flex-direction: column;
	}

	/* ═══════════════════════════════════════════════════
	   LOGO
	   ═══════════════════════════════════════════════════ */

	.logo-variants-grid {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: var(--spacing-sm);
		align-items: start;
	}

	.logo-variant {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.logo-variant--wide {
		min-width: 0;
	}

	.logo-variant-label {
		font-size: 0.65rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		text-align: center;
	}

	.logo-area {
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
		cursor: pointer;
		transition: all var(--transition-fast);
		overflow: hidden;
		padding: var(--spacing-sm);
	}

	.logo-area--icon {
		width: 80px;
		height: 80px;
		aspect-ratio: 1;
	}

	.logo-area--horizontal {
		width: 100%;
		min-height: 80px;
	}

	.logo-area--vertical {
		width: 80px;
		min-height: 100px;
	}

	.logo-area:hover {
		border-color: var(--color-primary);
		background: var(--color-surface-hover);
	}

	.logo-image {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}

	.logo-area--icon .logo-image {
		max-width: 72px;
		max-height: 72px;
	}

	.logo-area--horizontal .logo-image {
		max-height: 72px;
	}

	.logo-area--vertical .logo-image {
		max-width: 72px;
	}

	.logo-placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-xs);
		color: var(--color-text-secondary);
	}

	.logo-hint {
		font-size: 0.8rem;
	}

	.logo-concept-text {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		text-align: center;
		font-style: italic;
		line-height: 1.4;
		margin: var(--spacing-xs) 0 0;
	}

	/* ═══════════════════════════════════════════════════
	   GETTING STARTED
	   ═══════════════════════════════════════════════════ */

	.getting-started {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.getting-started-hint {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		margin: 0;
		line-height: 1.4;
	}

	.starter-btn {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		padding: var(--spacing-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text);
		cursor: pointer;
		text-align: left;
		transition: all var(--transition-fast);
	}

	.starter-btn:hover {
		border-color: var(--color-primary);
		background: var(--color-surface-hover);
	}

	.starter-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.starter-text strong {
		font-size: 0.85rem;
	}

	.starter-text span {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.or-divider {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: 0.7rem;
		color: var(--color-text-secondary);
		margin: var(--spacing-xs) 0;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.or-divider::before,
	.or-divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--color-border);
	}

	/* ═══════════════════════════════════════════════════
	   PRESETS
	   ═══════════════════════════════════════════════════ */

	.presets-panel {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--spacing-md);
		background: var(--color-surface);
	}

	.presets-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--spacing-sm);
	}

	.presets-header .section-label {
		margin: 0;
	}

	.close-btn {
		padding: 4px;
		background: none;
		border: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		border-radius: var(--radius-sm);
		transition: color var(--transition-fast);
	}

	.close-btn:hover {
		color: var(--color-text);
	}

	.presets-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(155px, 1fr));
		gap: var(--spacing-sm);
	}

	.preset-card {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
		padding: var(--spacing-sm);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-background);
		cursor: pointer;
		text-align: left;
		transition: all var(--transition-fast);
	}

	.preset-card:hover {
		border-color: var(--color-primary);
		transform: translateY(-1px);
		box-shadow: var(--shadow-sm);
	}

	.preset-swatches {
		display: flex;
		gap: 3px;
		height: 28px;
		border-radius: 4px;
		overflow: hidden;
	}

	.preset-swatch {
		flex: 1;
	}

	.preset-swatch--bg {
		flex: 0.6;
	}

	.preset-info {
		display: flex;
		flex-direction: column;
	}

	.preset-info strong {
		font-size: 0.8rem;
		color: var(--color-text);
	}

	.preset-desc {
		font-size: 0.7rem;
		color: var(--color-text-secondary);
	}

	/* ═══════════════════════════════════════════════════
	   PALETTE OVERVIEW BAR
	   ═══════════════════════════════════════════════════ */

	.palette-bar {
		display: flex;
		align-items: center;
		gap: 3px;
		padding: var(--spacing-xs);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none;
	}

	.palette-bar::-webkit-scrollbar {
		display: none;
	}

	.pal-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 3px;
		background: none;
		border: 2px solid transparent;
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: all var(--transition-fast);
		flex-shrink: 0;
	}

	.pal-item:hover {
		background: var(--color-surface-hover);
	}

	.pal-item.active {
		border-color: var(--color-primary);
		background: var(--color-background);
	}

	.pal-swatch {
		width: 26px;
		height: 26px;
		border-radius: 6px;
		border: 1px solid var(--color-border);
		transition: all var(--transition-fast);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-text-secondary);
	}

	.pal-swatch.empty {
		background: repeating-conic-gradient(var(--color-border) 0% 25%, transparent 0% 50%) 50% / 8px
			8px !important;
	}

	.pal-item.active .pal-swatch {
		transform: scale(1.1);
		box-shadow:
			0 0 0 2px var(--color-background),
			0 0 0 3px var(--color-primary);
	}

	.pal-label {
		font-size: 0.5rem;
		font-weight: 700;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.02em;
		line-height: 1;
	}

	.pal-item.active .pal-label {
		color: var(--color-primary);
	}

	.palette-sep {
		width: 1px;
		height: 20px;
		background: var(--color-border);
		margin: 0 2px;
		flex-shrink: 0;
		opacity: 0.5;
	}

	/* ═══════════════════════════════════════════════════
	   SV PICKER + HUE STRIP
	   ═══════════════════════════════════════════════════ */

	/* ═══════════════════════════════════════════════════
	   WORKBENCH — tool beside targets, once there is room
	   ═══════════════════════════════════════════════════ */

	/* `display: contents` on a phone: the wrappers disappear and every child lays out
	   in `.color-editor` exactly as it did before this split existed. */
	.workbench,
	.workbench-tool,
	.workbench-targets {
		display: contents;
	}

	/*
		A container query, not a media query, and in px.

		Two reasons. The editor sits inside the workspace's content column, so what
		decides whether two panes fit is *its* width, not the window's — on a 1024px
		laptop the rail leaves it about 540px, and splitting that gave a 21px column of
		colour fields. And `rem` in a media query resolves against 16px regardless of
		the app's 22px root, so `60rem` fired at 960px rather than the 1320 it reads as.
		px says what it means in both places.
	*/
	.color-editor {
		container-type: inline-size;
		container-name: coloreditor;
	}

	@container coloreditor (min-width: 900px) {
		.workbench {
			display: grid;
			/* The tool is a fixed instrument; the targets take whatever is left.
			   `minmax(0, …)` so the contrast matrix scrolls inside its own box instead of
			   widening the grid. */
			grid-template-columns: 340px minmax(0, 1fr);
			gap: var(--spacing-lg);
			align-items: start;
		}

		.workbench-tool,
		.workbench-targets {
			display: flex;
			flex-direction: column;
			gap: var(--spacing-md);
			min-width: 0;
		}

		/* Deliberately not sticky. With the harmony wheel open the tool column runs about
		   1400px, taller than the viewport it would stick inside — which makes a sticky
		   element scroll like a static one until its bottom lands, so the rule would
		   promise behaviour it cannot deliver. Two columns already removed the scrolling
		   this was meant to fix. */
	}

	.picker-section {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.picker-container {
		display: flex;
		gap: 10px;
		justify-content: center;
	}

	.sv-wrap {
		position: relative;
		border-radius: var(--radius-lg);
		overflow: hidden;
		border: 1px solid var(--color-border);
		line-height: 0;
		flex: 1;
		max-width: 320px;
	}

	/* In its own column the gradient fills the width it has — 320px was a cap for a
	   picker sharing a narrow page, and it left the square marooned in white space. */
	@container coloreditor (min-width: 900px) {
		.sv-wrap {
			max-width: none;
		}
	}

	.sv-picker {
		display: block;
		width: 100%;
		height: auto;
		cursor: crosshair;
		touch-action: none;
	}

	.sv-picker.disabled {
		opacity: 0.35;
		cursor: default;
		filter: saturate(0.2) brightness(0.7);
	}

	.sv-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.55);
		color: var(--color-text-secondary);
		font-size: 0.78rem;
		pointer-events: none;
		backdrop-filter: blur(3px);
	}

	.hue-wrap {
		border-radius: var(--radius-md);
		overflow: hidden;
		border: 1px solid var(--color-border);
		line-height: 0;
		flex-shrink: 0;
	}

	.hue-strip {
		display: block;
		width: 28px;
		height: auto;
		cursor: pointer;
		touch-action: none;
	}

	.hue-strip.disabled {
		opacity: 0.35;
		cursor: default;
	}

	/* ═══════════════════════════════════════════════════
	   ACTIVE COLOR BAR
	   ═══════════════════════════════════════════════════ */

	.active-bar {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.active-swatch-wrap {
		position: relative;
		cursor: pointer;
		display: block;
		flex-shrink: 0;
	}

	.active-swatch {
		display: block;
		width: 40px;
		height: 40px;
		border-radius: 10px;
		border: 2px solid var(--color-border);
		transition: border-color var(--transition-fast);
	}

	.active-swatch:hover {
		border-color: var(--color-text-secondary);
	}

	.active-swatch.empty {
		background: repeating-conic-gradient(var(--color-border) 0% 25%, transparent 0% 50%) 50% / 10px
			10px;
	}

	.active-info {
		display: flex;
		flex-direction: column;
		gap: 1px;
		flex: 1;
		min-width: 0;
	}

	.active-label {
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.active-color-name {
		font-size: 0.72rem;
		color: var(--color-text-secondary);
	}

	.active-no-color {
		font-size: 0.72rem;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	.hex-copy {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 5px 10px;
		background: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: all var(--transition-fast);
		flex-shrink: 0;
	}

	.hex-copy:hover {
		border-color: var(--color-primary);
		color: var(--color-text);
	}

	.hex-val {
		font-size: 0.78rem;
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
	}

	/* ═══════════════════════════════════════════════════
	   HSL SLIDERS
	   ═══════════════════════════════════════════════════ */

	.hsl-sliders {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: var(--spacing-sm) 0 0;
	}

	.slider-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.slider-heading {
		font-size: 0.55rem;
		font-weight: 700;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.14em;
		margin: 0;
	}

	.slider-mode-label {
		font-size: 0.55rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		background: var(--color-surface);
		padding: 1px 6px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-border);
		letter-spacing: 0.05em;
	}

	.slider-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.slider-label {
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		width: 12px;
		text-align: center;
		flex-shrink: 0;
	}

	.hsl-range {
		flex: 1;
		height: 12px;
		-webkit-appearance: none;
		appearance: none;
		border-radius: 6px;
		outline: none;
		cursor: pointer;
		border: 1px solid rgba(255, 255, 255, 0.08);
	}

	.hue-range {
		background: linear-gradient(
			to right,
			hsl(0, 100%, 50%),
			hsl(60, 100%, 50%),
			hsl(120, 100%, 50%),
			hsl(180, 100%, 50%),
			hsl(240, 100%, 50%),
			hsl(300, 100%, 50%),
			hsl(360, 100%, 50%)
		);
	}

	.sat-range {
		background: linear-gradient(to right, var(--track-from, #808080), var(--track-to, #ff0000));
	}

	.light-range {
		background: linear-gradient(
			to right,
			var(--track-from, #000),
			var(--track-mid, #808080),
			var(--track-to, #fff)
		);
	}

	.hsl-range::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--thumb-color, #fff);
		border: 2.5px solid #ffffff;
		box-shadow:
			0 0 0 1px rgba(0, 0, 0, 0.15),
			0 2px 4px rgba(0, 0, 0, 0.4);
		cursor: pointer;
		transition: transform 0.1s ease;
	}

	.hsl-range::-webkit-slider-thumb:hover {
		transform: scale(1.15);
	}

	.hsl-range::-moz-range-thumb {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--thumb-color, #fff);
		border: 2.5px solid #ffffff;
		box-shadow:
			0 0 0 1px rgba(0, 0, 0, 0.15),
			0 2px 4px rgba(0, 0, 0, 0.4);
		cursor: pointer;
	}

	.hsl-number {
		width: 44px;
		padding: 4px 5px;
		font-size: 0.72rem;
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		color: var(--color-text);
		background: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		text-align: center;
		outline: none;
		transition: border-color var(--transition-fast);
	}

	.hsl-number:focus {
		border-color: var(--color-primary);
	}

	.hsl-number::-webkit-inner-spin-button,
	.hsl-number::-webkit-outer-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.slider-unit {
		font-size: 0.6rem;
		color: var(--color-text-secondary);
		width: 10px;
		flex-shrink: 0;
	}

	/* ═══════════════════════════════════════════════════
	   HARMONY
	   ═══════════════════════════════════════════════════ */

	.harmony-panel,
	.contrast-section {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.section-toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-surface);
		border: none;
		color: var(--color-text);
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		transition: background var(--transition-fast);
	}

	.section-toggle:hover {
		background: var(--color-surface-hover);
	}

	.section-toggle-title {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.chevron {
		transition: transform var(--transition-fast);
	}

	.chevron.rotate {
		transform: rotate(180deg);
	}

	.harmony-body {
		padding: var(--spacing-sm) var(--spacing-md) var(--spacing-md);
		border-top: 1px solid var(--color-border);
	}

	.harmony-types {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-bottom: var(--spacing-sm);
	}

	.harm-chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 5px 12px;
		font-size: 0.7rem;
		border: 1px solid var(--color-border);
		border-radius: 20px;
		background: var(--color-background);
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: all var(--transition-fast);
		font-weight: 500;
	}

	.harm-chip:hover {
		border-color: var(--color-primary);
		color: var(--color-text);
	}

	.harm-chip.active {
		background: var(--color-primary);
		color: var(--color-background);
		border-color: var(--color-primary);
	}

	.harm-chip-icon {
		font-size: 0.7rem;
		line-height: 1;
	}

	.harmony-results {
		display: flex;
		gap: var(--spacing-xs);
		flex-wrap: wrap;
	}

	.harmony-swatch {
		flex: 1;
		min-width: 56px;
		max-width: 80px;
		height: 56px;
		border-radius: var(--radius-md);
		border: 2px solid var(--color-border);
		cursor: pointer;
		position: relative;
		overflow: hidden;
		transition: all var(--transition-fast);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-end;
		padding-bottom: 3px;
	}

	.harmony-swatch:hover {
		border-color: var(--color-text);
		transform: translateY(-2px);
		box-shadow: var(--shadow-md);
	}

	.harm-hex {
		font-size: 0.5rem;
		text-align: center;
		color: #000;
		pointer-events: none;
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		font-weight: 600;
	}

	.harm-hex.light {
		color: #fff;
		text-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
	}

	.harm-name {
		font-size: 0.42rem;
		text-align: center;
		color: rgba(0, 0, 0, 0.7);
		pointer-events: none;
		line-height: 1;
	}

	.harm-name.light {
		color: rgba(255, 255, 255, 0.75);
		text-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
	}

	.harmony-hint {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		margin: 0;
	}

	/* ═══════════════════════════════════════════════════
	   TABBED COLOR FIELDS
	   ═══════════════════════════════════════════════════ */

	.color-fields-section {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.brand-fields-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 12px;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	.filled-badge {
		font-size: 0.65rem;
		padding: 1px 6px;
		border-radius: 8px;
		background: var(--color-border);
		color: var(--color-text-secondary);
		font-weight: 700;
		line-height: 1.2;
	}

	.add-color-row {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 10px;
		background: none;
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		transition: all var(--transition-fast);
		margin-top: 2px;
	}

	.add-color-row:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
		background: var(--color-surface-hover);
	}

	.remove-color-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		padding: 0;
		background: none;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: all var(--transition-fast);
		flex-shrink: 0;
	}

	.remove-color-btn:hover {
		color: var(--color-error);
		border-color: var(--color-error);
		background: color-mix(in srgb, var(--color-error) 10%, transparent);
	}

	.pal-item--add {
		opacity: 0.5;
		transition: opacity var(--transition-fast);
	}

	.pal-item--add:hover {
		opacity: 1;
	}

	.tab-content {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--spacing-sm);
	}

	.color-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px var(--spacing-xs);
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		transition: all var(--transition-fast);
	}

	.color-row:hover {
		border-color: var(--color-border);
		background: var(--color-surface);
	}

	.color-row.active {
		border-color: var(--color-primary);
		background: var(--color-surface);
		box-shadow: inset 3px 0 0 var(--color-primary);
	}

	.color-row-main {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		flex: 0 0 auto;
	}

	.swatch-wrap {
		position: relative;
		cursor: pointer;
		display: block;
	}

	.swatch {
		display: block;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		border: 2px solid var(--color-border);
		transition: border-color var(--transition-fast);
	}

	.swatch.empty {
		background: repeating-conic-gradient(var(--color-border) 0% 25%, transparent 0% 50%) 50% / 10px
			10px;
	}

	.native-picker {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
		border: none;
		padding: 0;
	}

	.field-text {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.field-label {
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--color-text);
		line-height: 1.1;
	}

	.field-desc {
		font-size: 0.65rem;
		color: var(--color-text-secondary);
		line-height: 1.1;
	}

	.field-controls {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-left: auto;
	}

	.hex-input {
		width: 84px;
		padding: 5px 8px;
		font-size: 0.78rem;
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		color: var(--color-text);
		background: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		outline: none;
		transition: border-color var(--transition-fast);
	}

	.hex-input:focus {
		border-color: var(--color-primary);
	}

	.hex-input::placeholder {
		color: var(--color-text-secondary);
		opacity: 0.4;
	}

	.clear-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		border: none;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		opacity: 0.5;
		transition: all var(--transition-fast);
	}

	.clear-btn:hover {
		opacity: 1;
		color: var(--color-error);
	}

	/* ═══════════════════════════════════════════════════
	   GENERATE BUTTONS
	   ═══════════════════════════════════════════════════ */

	.generate-row {
		display: flex;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
		padding: var(--spacing-xs) 0 0;
	}

	.gen-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: 7px var(--spacing-md);
		font-size: 0.75rem;
		color: var(--color-primary);
		background: none;
		border: 1px solid var(--color-primary);
		border-radius: 20px;
		cursor: pointer;
		transition: all var(--transition-fast);
		font-weight: 500;
	}

	.gen-btn:hover {
		background: var(--color-primary);
		color: var(--color-background);
	}

	.gen-btn--secondary {
		color: var(--color-text-secondary);
		border-color: var(--color-border);
	}

	.gen-btn--secondary:hover {
		background: var(--color-surface-hover);
		color: var(--color-text);
		border-color: var(--color-text-secondary);
	}

	/* ═══════════════════════════════════════════════════
	   LIVE PREVIEW
	   ═══════════════════════════════════════════════════ */

	.preview-section {
		display: flex;
		flex-direction: column;
	}

	.live-preview {
		border: 1px solid;
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.preview-nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 14px;
		font-size: 0.65rem;
	}

	.preview-brand {
		font-weight: 700;
		font-size: 0.78rem;
	}

	.preview-links {
		display: flex;
		gap: 12px;
		font-size: 0.62rem;
	}

	.preview-hero {
		padding: 16px 14px;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.preview-hero-title {
		margin: 0;
		font-size: 1rem;
		font-weight: 800;
		line-height: 1.2;
	}

	.preview-hero-sub {
		margin: 0;
		font-size: 0.7rem;
		line-height: 1.4;
	}

	.preview-card {
		margin: 8px;
		border-radius: var(--radius-md);
		padding: var(--spacing-md);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.preview-title {
		font-size: 0.85rem;
		font-weight: 700;
		margin: 0;
	}

	.preview-subtitle {
		font-size: 0.7rem;
		margin: 0;
		line-height: 1.4;
	}

	.preview-buttons {
		display: flex;
		gap: var(--spacing-xs);
		flex-wrap: wrap;
	}

	.preview-btn {
		padding: 4px 12px;
		border-radius: var(--radius-sm);
		font-size: 0.68rem;
		font-weight: 600;
	}

	.preview-btn--outline {
		background: transparent;
		border: 1px solid;
	}

	.preview-input {
		padding: 7px 10px;
		border-radius: var(--radius-sm);
		font-size: 0.65rem;
	}

	.preview-status {
		display: flex;
		gap: var(--spacing-xs);
	}

	.preview-badge {
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-size: 0.6rem;
		font-weight: 600;
		color: #fff;
	}

	.preview-accent-bar {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding-top: 2px;
	}

	.preview-accent-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	/* ═══════════════════════════════════════════════════
	   CONTRAST
	   ═══════════════════════════════════════════════════ */

	.contrast-toggle-right {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.contrast-summary {
		font-size: 0.7rem;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		background: rgba(244, 63, 94, 0.15);
		color: var(--color-error);
	}

	.contrast-summary.all-pass {
		background: rgba(34, 197, 94, 0.15);
		color: var(--color-success);
	}

	.contrast-grid {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--spacing-sm) var(--spacing-md) var(--spacing-md);
		border-top: 1px solid var(--color-border);
	}

	.contrast-pair {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: 5px 0;
	}

	.contrast-sample {
		width: 36px;
		height: 28px;
		border-radius: 5px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		font-weight: 700;
		border: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	.contrast-detail {
		display: flex;
		gap: var(--spacing-sm);
		flex: 1;
		align-items: center;
	}

	.contrast-names {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		flex: 1;
	}

	.contrast-ratio {
		font-size: 0.75rem;
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		color: var(--color-text);
		font-weight: 500;
	}

	.contrast-badge {
		font-size: 0.6rem;
		font-weight: 700;
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		min-width: 32px;
		text-align: center;
	}

	.contrast-badge--aaa {
		background: rgba(34, 197, 94, 0.2);
		color: var(--color-success);
	}

	.contrast-badge--aa {
		background: rgba(34, 197, 94, 0.12);
		color: var(--color-success);
	}

	.contrast-badge--fail {
		background: rgba(244, 63, 94, 0.15);
		color: var(--color-error);
	}

	.contrast-empty {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		padding: var(--spacing-sm) var(--spacing-md);
		margin: 0;
		border-top: 1px solid var(--color-border);
	}

	/* ═══════════════════════════════════════════════════
	   TYPOGRAPHY
	   ═══════════════════════════════════════════════════ */

	.font-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-xs) var(--spacing-sm);
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		background: none;
		cursor: pointer;
		text-align: left;
		width: 100%;
		transition: all var(--transition-fast);
	}

	.font-row:hover {
		border-color: var(--color-border);
		background: var(--color-surface);
	}

	.font-row.open {
		border-color: var(--color-primary);
		background: var(--color-surface);
	}

	.font-label {
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--color-text);
	}

	.font-value {
		font-size: 0.85rem;
		color: var(--color-text);
	}

	.font-value.empty {
		color: var(--color-text-secondary);
		font-style: italic;
	}

	/* ═══════════════════════════════════════════════════
	   ACTIONS
	   ═══════════════════════════════════════════════════ */

	.actions-row {
		display: flex;
		gap: var(--spacing-md);
		justify-content: center;
	}

	.action-link {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		background: none;
		border: none;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 2px;
		padding: 0;
		transition: color var(--transition-fast);
	}

	.action-link:hover {
		color: var(--color-text);
	}

	.action-link--danger:hover {
		color: var(--color-error);
	}

	/* ═══════════════════════════════════════════════════
	   LOGO EXTRACTION UI
	   ═══════════════════════════════════════════════════ */

	.logo-extract-section {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		margin-top: var(--spacing-sm);
	}

	.extract-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: 7px var(--spacing-md);
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-primary);
		background: none;
		border: 1px solid var(--color-primary);
		border-radius: 20px;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.extract-btn:hover:not(:disabled) {
		background: var(--color-primary);
		color: var(--color-background);
	}

	.extract-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.extract-loading {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		padding: var(--spacing-xs) 0;
	}

	.extract-spinner {
		display: inline-block;
		width: 16px;
		height: 16px;
		border: 2px solid var(--color-border);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.extract-error {
		font-size: 0.75rem;
		color: var(--color-error);
		padding: var(--spacing-xs) 0;
	}

	.extracted-preview {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.extracted-label {
		font-size: 0.65rem;
		font-weight: 700;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.extracted-swatches {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}

	.extracted-swatch-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
	}

	.extracted-swatch-color {
		width: 36px;
		height: 36px;
		border-radius: 8px;
		border: 2px solid var(--color-border);
	}

	.extracted-swatch-hex {
		font-size: 0.55rem;
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		color: var(--color-text-secondary);
	}

	.extracted-actions {
		display: flex;
		gap: var(--spacing-xs);
		flex-wrap: wrap;
	}

	.extract-apply-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: 6px var(--spacing-md);
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--color-background);
		background: var(--color-primary);
		border: none;
		border-radius: 20px;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.extract-apply-btn:hover {
		filter: brightness(1.1);
	}

	.extract-focal-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: 6px var(--spacing-md);
		font-size: 0.72rem;
		font-weight: 500;
		color: var(--color-text);
		background: none;
		border: 1px solid var(--color-border);
		border-radius: 20px;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.extract-focal-btn:hover {
		border-color: var(--color-text-secondary);
		background: var(--color-surface-hover);
	}

	.extract-dismiss-btn {
		display: inline-flex;
		align-items: center;
		padding: 6px var(--spacing-sm);
		font-size: 0.72rem;
		color: var(--color-text-secondary);
		background: none;
		border: none;
		cursor: pointer;
		transition: color var(--transition-fast);
	}

	.extract-dismiss-btn:hover {
		color: var(--color-text);
	}

	.starter-btn--featured {
		border-color: var(--color-primary);
		background: rgba(var(--color-primary-rgb, 99, 102, 241), 0.06);
	}

	.starter-btn--featured:hover {
		background: rgba(var(--color-primary-rgb, 99, 102, 241), 0.12);
	}

	/* ═══════════════════════════════════════════════════
	   MOBILE-FIRST RESPONSIVE
	   ═══════════════════════════════════════════════════ */

	@media (max-width: 480px) {
		.picker-container {
			flex-direction: column;
			align-items: stretch;
		}

		.sv-wrap {
			max-width: 100%;
		}

		.hue-wrap {
			display: flex;
			justify-content: stretch;
		}

		.hue-strip {
			width: 100% !important;
			height: 28px !important;
		}

		.active-bar {
			flex-wrap: wrap;
			gap: var(--spacing-xs);
		}

		.hex-copy {
			margin-left: auto;
		}

		.color-row {
			flex-direction: column;
			align-items: flex-start;
			gap: var(--spacing-xs);
		}

		.field-controls {
			margin-left: 0;
			width: 100%;
			justify-content: space-between;
		}

		.hex-input {
			flex: 1;
		}

		.harmony-results {
			gap: var(--spacing-xs);
		}

		.harmony-swatch {
			min-width: 44px;
			height: 44px;
		}

		.presets-grid {
			grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
		}

		.contrast-pair {
			flex-wrap: wrap;
			gap: 4px;
		}

		.contrast-detail {
			flex-wrap: wrap;
		}

		.generate-row {
			flex-direction: column;
		}

		.gen-btn {
			justify-content: center;
		}

		.preview-links {
			display: none;
		}

		.extracted-swatches {
			justify-content: center;
		}

		.extracted-actions {
			justify-content: center;
		}

		.actions-row {
			flex-direction: column;
			align-items: center;
		}

		.starter-btn {
			gap: var(--spacing-sm);
		}
	}

	@media (max-width: 360px) {
		.palette-bar {
			gap: 2px;
			padding: 2px;
		}

		.pal-swatch {
			width: 22px;
			height: 22px;
		}

		.pal-label {
			display: none;
		}

		.active-swatch {
			width: 32px;
			height: 32px;
		}

		.swatch {
			width: 28px;
			height: 28px;
		}
	}

	/* Ensure tap targets on touch devices */
	@media (pointer: coarse) {
		.pal-item {
			min-width: 44px;
			min-height: 44px;
		}

		.color-row-main {
			min-height: 44px;
		}

		.harm-chip {
			padding: 8px 14px;
		}

		.gen-btn {
			padding: 10px var(--spacing-md);
		}

		.clear-btn {
			width: 32px;
			height: 32px;
		}

		.hsl-range::-webkit-slider-thumb {
			width: 24px;
			height: 24px;
		}

		.hsl-range::-moz-range-thumb {
			width: 24px;
			height: 24px;
		}

		.extract-btn,
		.extract-apply-btn,
		.extract-focal-btn {
			padding: 10px var(--spacing-md);
		}
	}
</style>
