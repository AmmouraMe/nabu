<script lang="ts">
	/**
	 * Inline colour card for the chat.
	 *
	 * Deliberately *not* `BrandColorEditor` — that is a full composer (harmony wheel,
	 * contrast matrix, live site preview, preset library) and dropping it into a chat
	 * bubble would bury the conversation. This resolves exactly one colour, offers a
	 * few suggestions derived from the colours already chosen, and gets out of the way.
	 * The full editor stays one link away for anyone who wants it.
	 */
	import { createEventDispatcher } from 'svelte';
	import {
		isValidHex,
		normalizeHex,
		generateComplementary,
		generateAnalogous,
		generateTriadic,
		getContrastRatio
	} from '$lib/utils/brand-colors';
	import type { BrandProfile } from '$lib/types/onboarding';

	/** Profile field being set, e.g. `primaryColor`. */
	export let field: string;
	export let label: string;
	export let profile: BrandProfile | null = null;
	export let saving = false;

	const dispatch = createEventDispatcher<{
		save: { field: string; value: string };
		dismiss: void;
	}>();

	/** Colours already chosen, used both as context and to seed suggestions. */
	$: existing = [
		{ key: 'primaryColor', label: 'Primary', value: profile?.primaryColor },
		{ key: 'secondaryColor', label: 'Secondary', value: profile?.secondaryColor },
		{ key: 'accentColor', label: 'Accent', value: profile?.accentColor }
	].filter((c) => c.value && isValidHex(c.value) && c.key !== field);

	// Seed from whatever is already set so the picker opens somewhere sensible rather
	// than on black. Falls back to a mid teal only when the brand has no colours yet.
	let value = '';
	let touched = false;
	$: if (!touched) {
		value = (profile?.[field as keyof BrandProfile] as string) || existing[0]?.value || '#3aa79b';
	}

	$: normalized = normalizeHex(value);
	$: valid = normalized !== null;

	/**
	 * Suggestions built from the first colour already chosen. Harmony only means
	 * something relative to an existing colour, so with an empty palette this stays
	 * empty rather than inventing arbitrary swatches.
	 */
	$: suggestions = (() => {
		const base = existing[0]?.value;
		if (!base || !isValidHex(base)) return [] as string[];
		const pool = [
			...generateComplementary(base),
			...generateAnalogous(base),
			...generateTriadic(base)
		];
		const used = new Set(
			[base, ...existing.map((e) => e.value)].filter(Boolean).map((c) => c!.toLowerCase())
		);
		// De-duplicate and drop anything already in the palette.
		return [...new Set(pool.map((c) => c.toLowerCase()))].filter((c) => !used.has(c)).slice(0, 6);
	})();

	/** Contrast against the app's dark canvas, as a legibility hint rather than a gate. */
	$: contrast = valid ? getContrastRatio(normalized!, '#0a0a0a') : 0;

	function pick(hex: string) {
		touched = true;
		value = hex;
	}

	function save() {
		if (!valid || saving) return;
		dispatch('save', { field, value: normalized! });
	}
</script>

<div class="color-card">
	<div class="card-head">
		<span class="card-title">Choose your {label.toLowerCase()}</span>
		<button class="dismiss" on:click={() => dispatch('dismiss')} aria-label="Dismiss">×</button>
	</div>

	{#if existing.length}
		<div class="existing" aria-label="Colors already chosen">
			{#each existing as c (c.key)}
				<span class="existing-chip" title="{c.label} {c.value}">
					<span class="chip-dot" style="background-color: {c.value}"></span>
					{c.label}
				</span>
			{/each}
		</div>
	{/if}

	<div class="picker-row">
		<!-- Native colour input: free accessibility and a familiar OS picker. -->
		<input
			type="color"
			class="native-picker"
			value={valid ? normalized : '#000000'}
			on:input={(e) => pick(e.currentTarget.value)}
			aria-label="{label} color picker"
		/>
		<input
			type="text"
			class="hex-input"
			class:invalid={value.length > 0 && !valid}
			bind:value
			on:input={() => (touched = true)}
			placeholder="#3498db"
			aria-label="{label} hex value"
			spellcheck="false"
		/>
		<button class="save-btn" on:click={save} disabled={!valid || saving}>
			{saving ? 'Saving…' : 'Save'}
		</button>
	</div>

	{#if value.length > 0 && !valid}
		<p class="hint invalid-hint">That is not a hex colour — try something like #3498db.</p>
	{:else if valid && contrast < 3}
		<!-- A warning, not a block: a low-contrast colour is a legitimate choice for a
		     brand, it just should not be a surprise. -->
		<p class="hint">Low contrast on dark backgrounds — fine for accents, hard to read as text.</p>
	{/if}

	{#if suggestions.length}
		<div class="suggestions">
			<span class="sugg-label">Goes with what you have</span>
			<div class="sugg-row">
				{#each suggestions as s (s)}
					<button
						class="sugg-swatch"
						class:selected={normalized === s}
						style="background-color: {s}"
						title={s}
						aria-label="Use {s}"
						on:click={() => pick(s)}
					></button>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.color-card {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		padding: var(--spacing-sm) var(--spacing-md);
		margin-top: var(--spacing-xs);
	}

	.card-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-xs);
	}

	.card-title {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.dismiss {
		background: none;
		border: none;
		color: var(--color-text-secondary);
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
		padding: 0 4px;
	}

	.dismiss:hover {
		color: var(--color-text);
	}

	.existing {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs);
		margin-bottom: var(--spacing-xs);
	}

	.existing-chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 0.7rem;
		color: var(--color-text-secondary);
	}

	.chip-dot {
		width: 0.75em;
		height: 0.75em;
		border-radius: 3px;
		/* Same trick as the message swatches: keeps near-black/near-white visible. */
		box-shadow: inset 0 0 0 1px rgb(127 127 127 / 0.6);
	}

	.picker-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		flex-wrap: wrap;
	}

	.native-picker {
		width: 34px;
		height: 30px;
		padding: 0;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm, 4px);
		background: none;
		cursor: pointer;
		flex-shrink: 0;
	}

	.hex-input {
		flex: 1 1 7rem;
		min-width: 6rem;
		padding: 5px var(--spacing-xs);
		background: var(--color-background);
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm, 4px);
		font-family: var(--font-mono, monospace);
		font-size: 0.75rem;
	}

	.hex-input.invalid {
		border-color: var(--color-error, #e5534b);
	}

	.save-btn {
		padding: 5px var(--spacing-md);
		background: var(--color-primary);
		color: var(--color-background);
		border: none;
		border-radius: var(--radius-sm, 4px);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		flex-shrink: 0;
	}

	.save-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.hint {
		font-size: 0.68rem;
		color: var(--color-text-secondary);
		margin: var(--spacing-xs) 0 0;
	}

	.invalid-hint {
		color: var(--color-error, #e5534b);
	}

	.suggestions {
		margin-top: var(--spacing-xs);
	}

	.sugg-label {
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
	}

	.sugg-row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 5px;
	}

	.sugg-swatch {
		width: 26px;
		height: 26px;
		border-radius: var(--radius-sm, 4px);
		border: 1px solid transparent;
		box-shadow: inset 0 0 0 1px rgb(127 127 127 / 0.5);
		cursor: pointer;
		padding: 0;
	}

	.sugg-swatch.selected {
		border-color: var(--color-primary);
		box-shadow:
			inset 0 0 0 1px rgb(127 127 127 / 0.5),
			0 0 0 2px var(--color-primary);
	}
</style>
