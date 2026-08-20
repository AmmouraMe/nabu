<!--
  AITextQuickGenerate.svelte
  Streamlined modal for AI-powered brand text generation.
  Pick a category, pick a preset (or enter custom prompt), generate, review, save.
-->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { labelToKey } from '$lib/utils/text';

	export let brandProfileId: string;
	/** Optional fetch function override (for testing) */
	export let fetchFn: typeof fetch = fetch;

	const dispatch = createEventDispatcher<{
		close: void;
		saved: void;
	}>();

	// ─── Types ───────────────────────────────────────────────

	interface Preset {
		key: string;
		label: string;
		promptTemplate: string;
	}

	// ─── State ───────────────────────────────────────────────

	let selectedCategory = 'messaging';
	let presets: Preset[] = [];
	let presetsLoading = false;

	// Generation state
	let generatingPresetKey: string | null = null;
	let generatedText = '';
	let generatedPreset: Preset | null = null;
	let generating = false;
	let error: string | null = null;

	// Custom prompt
	let showCustomPrompt = false;
	let customPromptText = '';
	let customLabel = '';

	// Profile field auto-set state
	let fieldStatus: {
		matchesField: boolean;
		fieldName?: string;
		fieldLabel?: string;
		currentValue?: string | null;
	} | null = null;
	let setAsProfileField = false;

	// Category config
	const categories: Array<{ key: string; label: string; icon: string }> = [
		{ key: 'names', label: 'Names', icon: '🏷️' },
		{ key: 'messaging', label: 'Messaging', icon: '💬' },
		{ key: 'descriptions', label: 'Descriptions', icon: '📝' },
		{ key: 'legal', label: 'Legal', icon: '⚖️' },
		{ key: 'social', label: 'Social', icon: '📱' },
		{ key: 'voice', label: 'Voice', icon: '🎤' }
	];

	// ─── Load Presets ────────────────────────────────────────

	// Load presets immediately when component initializes
	loadPresets(selectedCategory);

	async function loadPresets(category: string) {
		presetsLoading = true;
		try {
			const res = await fetchFn(`/api/brand/assets/generate-text?category=${category}`);
			if (res.ok) {
				const result = await res.json();
				presets = result.presets || [];
			} else {
				presets = [];
			}
		} catch {
			presets = [];
		} finally {
			presetsLoading = false;
		}
	}

	function selectCategory(category: string) {
		selectedCategory = category;
		// Reset state when switching categories
		generatedText = '';
		generatedPreset = null;
		error = null;
		showCustomPrompt = false;
		customPromptText = '';
		fieldStatus = null;
		setAsProfileField = false;
		loadPresets(category);
	}

	// ─── AI Generation ──────────────────────────────────────

	/** Check if a text key maps to a brand profile field and its current status */
	async function checkFieldStatus(category: string, key: string) {
		fieldStatus = null;
		setAsProfileField = false;
		try {
			const res = await fetchFn(
				`/api/brand/assets/texts/field-status?brandProfileId=${brandProfileId}&category=${category}&key=${key}`
			);
			if (res.ok) {
				fieldStatus = await res.json();
				// Auto-enable when field is empty
				if (fieldStatus?.matchesField && !fieldStatus.currentValue) {
					setAsProfileField = true;
				}
			}
		} catch {
			// Non-critical — just won't show field status UI
		}
	}

	async function generateFromPreset(preset: Preset) {
		generating = true;
		generatingPresetKey = preset.key;
		error = null;
		generatedPreset = preset;

		try {
			const res = await fetchFn('/api/brand/assets/generate-text', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					brandProfileId,
					category: selectedCategory,
					key: preset.key,
					label: preset.label,
					customPrompt: preset.promptTemplate
				})
			});

			if (res.ok) {
				const result = await res.json();
				generatedText = result.text;
				// Check if this text maps to a profile field
				await checkFieldStatus(selectedCategory, preset.key);
			} else {
				const err = await res.json().catch(() => ({ message: 'Generation failed' }));
				error = err.message || 'Failed to generate text';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to generate text';
		} finally {
			generating = false;
			generatingPresetKey = null;
		}
	}

	async function generateWithCustomPrompt() {
		if (!customPromptText.trim()) return;

		generating = true;
		error = null;
		const key = customLabel ? labelToKey(customLabel) : 'custom_generated';
		const label = customLabel || 'Custom Generated';
		generatedPreset = { key, label, promptTemplate: customPromptText };

		try {
			const res = await fetchFn('/api/brand/assets/generate-text', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					brandProfileId,
					category: selectedCategory,
					key,
					label,
					customPrompt: customPromptText
				})
			});

			if (res.ok) {
				const result = await res.json();
				generatedText = result.text;
				// Check if this text maps to a profile field
				await checkFieldStatus(selectedCategory, key);
			} else {
				const err = await res.json().catch(() => ({ message: 'Generation failed' }));
				error = err.message || 'Failed to generate text';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to generate text';
		} finally {
			generating = false;
		}
	}

	async function regenerate() {
		if (generatedPreset) {
			await generateFromPreset(generatedPreset);
		}
	}

	// ─── Save ───────────────────────────────────────────────

	async function saveGeneratedText() {
		if (!generatedText || !generatedPreset) return;

		try {
			const saveBody: Record<string, unknown> = {
				brandProfileId,
				category: selectedCategory,
				key: generatedPreset.key,
				label: generatedPreset.label,
				value: generatedText
			};

			// Include profile field update if applicable
			if (setAsProfileField && fieldStatus?.matchesField && fieldStatus.fieldName) {
				saveBody.setAsProfileField = true;
				saveBody.profileFieldName = fieldStatus.fieldName;
			}

			const res = await fetchFn('/api/brand/assets/texts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(saveBody)
			});

			if (res.ok) {
				dispatch('saved');
				// Reset for next generation
				generatedText = '';
				generatedPreset = null;
				fieldStatus = null;
				setAsProfileField = false;
			} else {
				const err = await res.json().catch(() => ({ message: 'Save failed' }));
				error = err.message || 'Failed to save text';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save text';
		}
	}
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="modal-backdrop" on:click|self={() => dispatch('close')}>
	<div class="modal-panel" role="dialog" aria-label="AI Generate Text">
		<!-- Header -->
		<div class="modal-header">
			<h2 class="modal-title">✨ AI Generate Text</h2>
			<button class="close-btn" on:click={() => dispatch('close')} aria-label="Close">✕</button>
		</div>

		<!-- Category chips -->
		<div class="category-chips" role="tablist">
			{#each categories as cat}
				<button
					class="category-chip"
					class:active={selectedCategory === cat.key}
					on:click={() => selectCategory(cat.key)}
					role="tab"
					aria-selected={selectedCategory === cat.key}
				>
					<span class="chip-icon">{cat.icon}</span>
					<span>{cat.label}</span>
				</button>
			{/each}
		</div>

		<!-- Error -->
		{#if error}
			<div class="error-banner">
				<span>{error}</span>
				<button class="error-dismiss" on:click={() => (error = null)}>✕</button>
			</div>
		{/if}

		<!-- Generated text result -->
		{#if generatedText}
			<div class="result-section">
				<div class="result-header">
					<span class="result-label">{generatedPreset?.label || 'Generated Text'}</span>
					<span class="result-category">{selectedCategory}</span>
				</div>
				<textarea class="result-textarea" bind:value={generatedText} rows="4"></textarea>

				<!-- Profile field auto-set notice or toggle -->
				{#if fieldStatus?.matchesField && fieldStatus.fieldLabel}
					{#if !fieldStatus.currentValue}
						<!-- Field is empty — will auto-set -->
						<div class="field-notice auto-set">
							<span class="field-notice-icon">📌</span>
							<span class="field-notice-text">
								Saving will also set your <strong>{fieldStatus.fieldLabel}</strong> on the brand profile.
							</span>
						</div>
					{:else}
						<!-- Field has a value — show toggle (default off) -->
						<label class="field-toggle">
							<input
								type="checkbox"
								bind:checked={setAsProfileField}
								aria-label="Update {fieldStatus.fieldLabel} on profile"
							/>
							<span class="field-toggle-text">
								Also update <strong>{fieldStatus.fieldLabel}</strong> on profile
								<span class="field-toggle-current">(current: "{fieldStatus.currentValue}")</span>
							</span>
						</label>
					{/if}
				{/if}

				<div class="result-actions">
					<button class="btn primary" on:click={saveGeneratedText} aria-label="Save text">
						💾 Save
					</button>
					<button
						class="btn secondary"
						on:click={regenerate}
						disabled={generating}
						aria-label="Regenerate text"
					>
						{generating ? '⏳...' : '🔄 Regenerate'}
					</button>
				</div>
			</div>
		{/if}

		<!-- Preset grid -->
		{#if !generatedText}
			<div class="presets-section">
				{#if presetsLoading}
					<div class="presets-loading">
						<div class="spinner"></div>
					</div>
				{:else}
					<div class="presets-grid">
						{#each presets as preset}
							<div class="preset-card">
								<div class="preset-info">
									<span class="preset-label">{preset.label}</span>
								</div>
								<button
									class="btn primary small"
									on:click={() => generateFromPreset(preset)}
									disabled={generating}
									aria-label="Generate {preset.label}"
								>
									{generating && generatingPresetKey === preset.key
										? '⏳ Generating...'
										: '✨ Generate'}
								</button>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Custom prompt section -->
		<div class="custom-prompt-section">
			<button class="custom-prompt-toggle" on:click={() => (showCustomPrompt = !showCustomPrompt)}>
				{showCustomPrompt ? '▾' : '▸'} Custom Prompt
			</button>

			{#if showCustomPrompt}
				<div class="custom-prompt-form">
					<input
						type="text"
						class="custom-label-input"
						bind:value={customLabel}
						placeholder="Label (e.g. Welcome Message)"
					/>
					<textarea
						class="custom-prompt-textarea"
						bind:value={customPromptText}
						placeholder="Describe what you want AI to generate..."
						rows="3"
					></textarea>
					<button
						class="btn primary"
						on:click={generateWithCustomPrompt}
						disabled={generating || !customPromptText.trim()}
						aria-label="Generate from custom prompt"
					>
						{generating ? '⏳ Generating...' : '✨ Generate'}
					</button>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background-color: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: var(--spacing-md);
	}

	.modal-panel {
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		width: 100%;
		max-width: 600px;
		max-height: 85vh;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
		padding: var(--spacing-lg);
	}

	/* Header */
	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.modal-title {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0;
	}

	.close-btn {
		background: none;
		border: none;
		color: var(--color-text-secondary);
		font-size: 1.2rem;
		cursor: pointer;
		padding: var(--spacing-xs);
		border-radius: var(--radius-sm);
		transition: all var(--transition-fast);
	}

	.close-btn:hover {
		color: var(--color-text);
		background-color: var(--color-border);
	}

	/* Category chips */
	.category-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs);
	}

	.category-chip {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		background-color: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: 20px;
		color: var(--color-text-secondary);
		font-size: 0.78rem;
		font-weight: 500;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.category-chip:hover {
		border-color: var(--color-primary);
		color: var(--color-text);
	}

	.category-chip.active {
		background-color: var(--color-primary);
		border-color: var(--color-primary);
		color: var(--color-background);
	}

	.chip-icon {
		font-size: 0.85rem;
	}

	/* Error */
	.error-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-sm);
		padding: var(--spacing-xs) var(--spacing-sm);
		background-color: var(--color-error);
		color: var(--color-background);
		border-radius: var(--radius-sm);
		font-size: 0.8rem;
	}

	.error-dismiss {
		background: none;
		border: none;
		color: var(--color-background);
		cursor: pointer;
		padding: 0;
		font-size: 0.9rem;
	}

	/* Presets */
	.presets-section {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.presets-loading {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--spacing-lg);
	}

	.spinner {
		width: 24px;
		height: 24px;
		border: 2px solid var(--color-border);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.presets-grid {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.preset-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm) var(--spacing-md);
		background-color: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		transition: border-color var(--transition-fast);
	}

	.preset-card:hover {
		border-color: var(--color-primary);
	}

	.preset-info {
		flex: 1;
	}

	.preset-label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text);
	}

	/* Result */
	.result-section {
		background-color: var(--color-background);
		border: 1px solid var(--color-primary);
		border-radius: var(--radius-md);
		padding: var(--spacing-md);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.result-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.result-label {
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--color-text);
	}

	.result-category {
		font-size: 0.7rem;
		font-weight: 500;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.result-textarea {
		width: 100%;
		background-color: var(--color-surface);
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: var(--spacing-sm);
		font-size: 0.85rem;
		font-family: inherit;
		resize: vertical;
		line-height: 1.5;
	}

	.result-textarea:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.result-actions {
		display: flex;
		gap: var(--spacing-xs);
		justify-content: flex-end;
	}

	/* Profile field notice */
	.field-notice {
		display: flex;
		align-items: flex-start;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		font-size: 0.78rem;
		line-height: 1.4;
		color: var(--color-text);
	}

	.field-notice.auto-set {
		background-color: var(--color-primary);
		color: var(--color-background);
	}

	.field-notice-icon {
		flex-shrink: 0;
		font-size: 0.85rem;
	}

	.field-notice-text {
		flex: 1;
	}

	.field-toggle {
		display: flex;
		align-items: flex-start;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) var(--spacing-sm);
		background-color: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.78rem;
		cursor: pointer;
		transition: border-color var(--transition-fast);
	}

	.field-toggle:hover {
		border-color: var(--color-primary);
	}

	.field-toggle input[type='checkbox'] {
		margin-top: 2px;
		flex-shrink: 0;
		accent-color: var(--color-primary);
	}

	.field-toggle-text {
		flex: 1;
		line-height: 1.4;
		color: var(--color-text);
	}

	.field-toggle-current {
		display: block;
		color: var(--color-text-secondary);
		font-size: 0.72rem;
		margin-top: 2px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 100%;
	}

	/* Buttons */
	.btn {
		padding: var(--spacing-xs) var(--spacing-md);
		border: none;
		border-radius: var(--radius-sm);
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: all var(--transition-fast);
		white-space: nowrap;
	}

	.btn.primary {
		background-color: var(--color-primary);
		color: var(--color-background);
	}

	.btn.primary:hover:not(:disabled) {
		background-color: var(--color-primary-hover);
	}

	.btn.secondary {
		background-color: var(--color-border);
		color: var(--color-text);
	}

	.btn.secondary:hover:not(:disabled) {
		background-color: var(--color-text-secondary);
		color: var(--color-background);
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn.small {
		padding: 3px 10px;
		font-size: 0.75rem;
	}

	/* Custom prompt */
	.custom-prompt-section {
		border-top: 1px solid var(--color-border);
		padding-top: var(--spacing-sm);
	}

	.custom-prompt-toggle {
		background: none;
		border: none;
		color: var(--color-text-secondary);
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		padding: 0;
		transition: color var(--transition-fast);
	}

	.custom-prompt-toggle:hover {
		color: var(--color-text);
	}

	.custom-prompt-form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		margin-top: var(--spacing-sm);
	}

	.custom-label-input {
		background-color: var(--color-background);
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: var(--spacing-sm);
		font-size: 0.85rem;
		font-family: inherit;
	}

	.custom-label-input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.custom-prompt-textarea {
		background-color: var(--color-background);
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: var(--spacing-sm);
		font-size: 0.85rem;
		font-family: inherit;
		resize: vertical;
	}

	.custom-prompt-textarea:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	/* Responsive */
	@media (max-width: 480px) {
		.modal-panel {
			max-height: 95vh;
			padding: var(--spacing-md);
		}

		.category-chips {
			gap: 4px;
		}

		.category-chip {
			font-size: 0.72rem;
			padding: 3px 8px;
		}
	}
</style>
