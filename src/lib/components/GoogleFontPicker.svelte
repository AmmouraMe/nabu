<script lang="ts">
	/**
	 * GoogleFontPicker — Browse and select Google Fonts.
	 *
	 * Fetches the font catalog from our API proxy, lets users search/filter
	 * by category, shows a live preview of each font, and dispatches a
	 * `select` event with the chosen font family name.
	 */
	import { createEventDispatcher, onMount } from 'svelte';

	const dispatch = createEventDispatcher();

	export let field: 'typographyLogo' | 'typographyHeading' | 'typographyBody';
	export let currentFont: string | undefined = undefined;

	interface GoogleFont {
		family: string;
		category: string;
		variants: string[];
	}

	const CATEGORIES = [
		{ label: 'All', value: 'all' },
		{ label: 'Sans Serif', value: 'sans-serif' },
		{ label: 'Serif', value: 'serif' },
		{ label: 'Display', value: 'display' },
		{ label: 'Handwriting', value: 'handwriting' },
		{ label: 'Monospace', value: 'monospace' }
	];

	let fonts: GoogleFont[] = [];
	let isLoading = true;
	let errorMessage = '';
	let searchQuery = '';
	let activeCategory = 'all';
	let loadedFontFamilies = new Set<string>();

	$: filteredFonts = fonts.filter((f) => {
		const matchesSearch = f.family.toLowerCase().includes(searchQuery.toLowerCase());
		const matchesCategory = activeCategory === 'all' || f.category === activeCategory;
		return matchesSearch && matchesCategory;
	});

	$: title =
		field === 'typographyLogo'
			? 'Choose Logo Font'
			: field === 'typographyHeading'
				? 'Choose Heading Font'
				: 'Choose Body Font';

	async function loadFonts() {
		try {
			const res = await fetch('/api/google-fonts');
			if (!res.ok) throw new Error('Failed to load fonts');
			const data = await res.json();
			fonts = data.items ?? [];
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Failed to load fonts';
		} finally {
			isLoading = false;
		}
	}

	// Start loading immediately
	loadFonts();

	function loadFontPreview(family: string) {
		if (loadedFontFamilies.has(family)) return;
		loadedFontFamilies.add(family);

		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;700&display=swap`;
		document.head.appendChild(link);
	}

	function handleSelect(font: GoogleFont) {
		dispatch('select', { field, font: font.family });
	}

	function handleClose() {
		dispatch('close');
	}

	function handleFontVisible(family: string) {
		loadFontPreview(family);
	}
</script>

<div class="font-picker" role="dialog" aria-label={title}>
	<div class="picker-header">
		<h3 class="picker-title">{title}</h3>
		<button class="close-btn" on:click={handleClose} aria-label="Close font picker">✕</button>
	</div>

	<div class="picker-search">
		<input
			type="search"
			placeholder="Search fonts..."
			bind:value={searchQuery}
			class="search-input"
		/>
	</div>

	<div class="category-filters">
		{#each CATEGORIES as cat}
			<button
				class="category-btn"
				class:active={activeCategory === cat.value}
				on:click={() => (activeCategory = cat.value)}
			>
				{cat.label}
			</button>
		{/each}
	</div>

	<div class="font-list">
		{#if isLoading}
			<p class="status-message">Loading fonts...</p>
		{:else if errorMessage}
			<p class="status-message error">{errorMessage}</p>
		{:else if filteredFonts.length === 0}
			<p class="status-message">No fonts found</p>
		{:else}
			{#each filteredFonts as font (font.family)}
				<button
					class="font-item"
					class:active={currentFont === font.family}
					aria-pressed={currentFont === font.family}
					on:click={() => handleSelect(font)}
					on:mouseenter={() => handleFontVisible(font.family)}
					on:focus={() => handleFontVisible(font.family)}
				>
					<span class="font-name">{font.family}</span>
					<span class="font-preview" style="font-family: '{font.family}', {font.category}">
						The quick brown fox jumps over the lazy dog
					</span>
					<span class="font-category">{font.category}</span>
				</button>
			{/each}
		{/if}
	</div>
</div>

<style>
	.font-picker {
		display: flex;
		flex-direction: column;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
		max-height: 28rem;
	}

	.picker-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm) var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
	}

	.picker-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 1rem;
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: var(--spacing-xs);
		border-radius: var(--radius-sm);
		line-height: 1;
		transition: color var(--transition-fast);
	}

	.close-btn:hover {
		color: var(--color-text);
	}

	.picker-search {
		padding: var(--spacing-sm) var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
	}

	.search-input {
		width: 100%;
		padding: var(--spacing-xs) var(--spacing-sm);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-background);
		color: var(--color-text);
		font-size: 0.85rem;
		outline: none;
		transition: border-color var(--transition-fast);
	}

	.search-input:focus {
		border-color: var(--color-primary);
	}

	.search-input::placeholder {
		color: var(--color-text-secondary);
	}

	.category-filters {
		display: flex;
		gap: var(--spacing-xs);
		padding: var(--spacing-sm) var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
		flex-wrap: wrap;
	}

	.category-btn {
		font-size: 0.7rem;
		padding: 2px var(--spacing-sm);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: all var(--transition-fast);
		white-space: nowrap;
	}

	.category-btn:hover {
		border-color: var(--color-text-secondary);
		color: var(--color-text);
	}

	.category-btn.active {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: var(--color-background);
	}

	.font-list {
		flex: 1;
		overflow-y: auto;
		padding: var(--spacing-xs) 0;
	}

	.status-message {
		text-align: center;
		padding: var(--spacing-lg);
		color: var(--color-text-secondary);
		font-size: 0.85rem;
		margin: 0;
	}

	.status-message.error {
		color: var(--color-error);
	}

	.font-item {
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: 100%;
		padding: var(--spacing-sm) var(--spacing-md);
		border: none;
		background: none;
		cursor: pointer;
		text-align: left;
		transition: background var(--transition-fast);
		border-left: 3px solid transparent;
	}

	.font-item:hover {
		background: var(--color-background);
	}

	.font-item.active {
		background: var(--color-background);
		border-left-color: var(--color-primary);
	}

	.font-name {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.font-preview {
		font-size: 0.95rem;
		color: var(--color-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.font-category {
		font-size: 0.65rem;
		color: var(--color-text-secondary);
		text-transform: capitalize;
	}
</style>
