<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	export let brandProfileId: string;
	export let fieldName: string;
	export let fieldLabel: string;

	interface TextSuggestion {
		id: string;
		category: string;
		key: string;
		label: string;
		value: string;
		language: string;
	}

	let suggestions: TextSuggestion[] = [];
	let isLoading = true;
	let error: string | null = null;

	async function loadSuggestions() {
		isLoading = true;
		error = null;
		try {
			const res = await fetch(
				`/api/brand/text-suggestions?brandProfileId=${encodeURIComponent(brandProfileId)}&fieldName=${encodeURIComponent(fieldName)}`
			);
			if (!res.ok) throw new Error('Failed to load suggestions');
			const data = await res.json();
			suggestions = data.suggestions || [];
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load';
		} finally {
			isLoading = false;
		}
	}

	function selectText(suggestion: TextSuggestion) {
		dispatch('select', { value: suggestion.value, label: suggestion.label });
	}

	function close() {
		dispatch('close');
	}

	// Load on mount
	loadSuggestions();
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="picker-overlay" on:click|self={close} on:keydown={(e) => e.key === 'Escape' && close()}>
	<div class="picker-modal" role="dialog" aria-label="Pick text for {fieldLabel}">
		<div class="picker-header">
			<h3>Pick text for <em>{fieldLabel}</em></h3>
			<button class="close-btn" on:click={close} aria-label="Close">
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
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</div>

		<div class="picker-body">
			{#if isLoading}
				<div class="picker-loading">
					<span class="spinner"></span>
					<p>Loading saved texts…</p>
				</div>
			{:else if error}
				<div class="picker-error">
					<p>{error}</p>
					<button on:click={loadSuggestions}>Retry</button>
				</div>
			{:else if suggestions.length === 0}
				<div class="picker-empty">
					<p>No saved texts found for this field.</p>
					<p class="picker-hint">
						Add text assets in the <strong>Text</strong> tab first, then pick them here.
					</p>
				</div>
			{:else}
				<p class="picker-instructions">Select a saved text to use as <em>{fieldLabel}</em>:</p>
				<ul class="suggestion-list">
					{#each suggestions as suggestion}
						<li>
							<button
								class="suggestion-item"
								on:click={() => selectText(suggestion)}
								title="Use this text"
							>
								<div class="suggestion-meta">
									<span class="suggestion-label">{suggestion.label}</span>
									{#if suggestion.language && suggestion.language !== 'en'}
										<span class="lang-badge">{suggestion.language}</span>
									{/if}
								</div>
								<p class="suggestion-value">{suggestion.value}</p>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
</div>

<style>
	.picker-overlay {
		position: fixed;
		inset: 0;
		background-color: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: var(--spacing-lg);
	}

	.picker-modal {
		background-color: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		width: 100%;
		max-width: 520px;
		max-height: 70vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
	}

	.picker-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-md) var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
	}

	.picker-header h3 {
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.picker-header em {
		color: var(--color-primary);
		font-style: normal;
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		background: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		border-radius: var(--radius-sm);
		transition: all var(--transition-fast);
	}

	.close-btn:hover {
		background-color: var(--color-surface-hover);
		color: var(--color-text);
	}

	.picker-body {
		padding: var(--spacing-md) var(--spacing-lg);
		overflow-y: auto;
		flex: 1;
	}

	.picker-loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-xl) 0;
		color: var(--color-text-secondary);
	}

	.spinner {
		width: 24px;
		height: 24px;
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

	.picker-error {
		text-align: center;
		padding: var(--spacing-lg) 0;
		color: var(--color-error, #ef4444);
	}

	.picker-error button {
		margin-top: var(--spacing-sm);
		padding: var(--spacing-xs) var(--spacing-md);
		background-color: var(--color-primary);
		color: var(--color-background);
		border: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: 0.8rem;
	}

	.picker-empty {
		text-align: center;
		padding: var(--spacing-lg) 0;
		color: var(--color-text-secondary);
	}

	.picker-empty p {
		margin: 0 0 var(--spacing-xs);
		font-size: 0.85rem;
	}

	.picker-hint {
		font-size: 0.8rem;
		opacity: 0.7;
	}

	.picker-instructions {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		margin: 0 0 var(--spacing-sm);
	}

	.picker-instructions em {
		color: var(--color-primary);
		font-style: normal;
		font-weight: 600;
	}

	.suggestion-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.suggestion-item {
		width: 100%;
		text-align: left;
		background: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--spacing-sm) var(--spacing-md);
		cursor: pointer;
		transition: all var(--transition-fast);
		color: var(--color-text);
	}

	.suggestion-item:hover {
		border-color: var(--color-primary);
		background-color: var(--color-surface-hover);
	}

	.suggestion-meta {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		margin-bottom: 4px;
	}

	.suggestion-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.lang-badge {
		font-size: 0.65rem;
		padding: 1px 6px;
		background-color: var(--color-surface-hover);
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		text-transform: uppercase;
	}

	.suggestion-value {
		font-size: 0.85rem;
		color: var(--color-text);
		margin: 0;
		line-height: 1.5;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	@media (max-width: 480px) {
		.picker-overlay {
			padding: var(--spacing-sm);
		}

		.picker-modal {
			max-height: 85vh;
		}
	}
</style>
