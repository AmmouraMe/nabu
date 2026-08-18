<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	interface ResolutionPricing {
		estimatedCostPerSecond?: number;
		estimatedCostPerGeneration?: number;
	}

	interface VideoModelPricing {
		estimatedCostPerSecond?: number;
		estimatedCostPerGeneration?: number;
		pricingByResolution?: Record<string, ResolutionPricing>;
		currency: string;
	}

	interface VideoModel {
		id: string;
		displayName: string;
		provider: string;
		maxDuration?: number;
		supportedDurations?: number[];
		supportedAspectRatios?: string[];
		supportedResolutions?: string[];
		validSizes?: Record<string, Record<string, string>>;
		pricing?: VideoModelPricing;
	}

	export let models: VideoModel[] = [];

	let prompt = '';
	let aspectRatio = '16:9';
	let duration = 8;
	let selectedModel = '';
	let selectedProvider = '';
	let selectedResolution = '720p';
	let generating = false;

	const allAspectRatios = ['16:9', '9:16', '1:1'];
	const defaultDurations = [5, 8];

	const providerDisplayNames: Record<string, string> = {
		openai: 'OpenAI (Sora)',
		wavespeed: 'WaveSpeed AI'
	};

	const dispatch = createEventDispatcher<{
		generate: {
			prompt: string;
			aspectRatio: string;
			duration: number;
			model: string;
			provider: string;
			resolution: string;
		};
	}>();

	// Derive unique providers from models
	$: uniqueProviders = [...new Set(models.map((m) => m.provider))];
	$: hasMultipleProviders = uniqueProviders.length > 1;

	// Auto-select first provider when models change
	$: if (
		uniqueProviders.length > 0 &&
		(!selectedProvider || !uniqueProviders.includes(selectedProvider))
	) {
		selectedProvider = uniqueProviders[0];
	}

	// Filter models by selected provider
	$: filteredModels = selectedProvider
		? models.filter((m) => m.provider === selectedProvider)
		: models;

	$: hasModels = models.length > 0;
	$: if (
		filteredModels.length > 0 &&
		(!selectedModel || !filteredModels.some((m) => m.id === selectedModel))
	) {
		selectedModel = filteredModels[0].id;
	}
	$: canGenerate = prompt.trim().length > 0 && hasModels && !generating;

	// Pricing computation
	$: currentModel = filteredModels.find((m) => m.id === selectedModel);

	// Aspect ratio support: derive from validSizes or supportedAspectRatios
	$: availableAspectRatios = (() => {
		if (currentModel?.validSizes) {
			return allAspectRatios.filter((ar) => ar in currentModel!.validSizes!);
		}
		return currentModel?.supportedAspectRatios || allAspectRatios;
	})();

	// Auto-correct aspect ratio if current selection is not valid for this model
	$: if (availableAspectRatios.length > 0 && !availableAspectRatios.includes(aspectRatio)) {
		aspectRatio = availableAspectRatios[0];
	}

	// Resolution support: derive from validSizes (filtered by current aspect ratio) or supportedResolutions
	$: availableResolutions = (() => {
		if (currentModel?.validSizes) {
			const ratioSizes = currentModel.validSizes[aspectRatio];
			return ratioSizes ? Object.keys(ratioSizes) : [];
		}
		return currentModel?.supportedResolutions || [];
	})();
	$: hasResolutionSelector = availableResolutions.length > 1;

	// Duration support: derive from selected model or fall back to defaults
	$: availableDurations = currentModel?.supportedDurations || defaultDurations;

	// Reset duration when model changes and current selection isn't available
	$: if (availableDurations.length > 0 && !availableDurations.includes(duration)) {
		duration = availableDurations[0];
	}

	// Reset resolution when model changes and current selection isn't available
	$: if (availableResolutions.length > 0 && !availableResolutions.includes(selectedResolution)) {
		selectedResolution = availableResolutions[availableResolutions.length - 1]; // default to highest
	}

	$: hasPricing = currentModel?.pricing != null;
	$: estimatedCost = computeEstimatedCost(currentModel, duration, selectedResolution);
	$: effectiveRate = getEffectiveRate(currentModel, selectedResolution);

	function getEffectiveRate(model: VideoModel | undefined, resolution: string): number | null {
		if (!model?.pricing) return null;
		const p = model.pricing;

		// Check resolution-specific pricing first
		if (p.pricingByResolution?.[resolution]?.estimatedCostPerSecond != null) {
			return p.pricingByResolution[resolution].estimatedCostPerSecond!;
		}

		// Fall back to top-level
		if (typeof p.estimatedCostPerSecond === 'number') {
			return p.estimatedCostPerSecond;
		}

		return null;
	}

	function computeEstimatedCost(
		model: VideoModel | undefined,
		dur: number,
		resolution: string
	): string | null {
		if (!model?.pricing) return null;
		const p = model.pricing;

		// Resolve effective rates with resolution override
		let costPerSecond = p.estimatedCostPerSecond;
		let costPerGeneration = p.estimatedCostPerGeneration;

		if (p.pricingByResolution?.[resolution]) {
			const resPricing = p.pricingByResolution[resolution];
			if (resPricing.estimatedCostPerSecond != null) {
				costPerSecond = resPricing.estimatedCostPerSecond;
			}
			if (resPricing.estimatedCostPerGeneration != null) {
				costPerGeneration = resPricing.estimatedCostPerGeneration;
			}
		}

		let cost: number;
		if (typeof costPerSecond === 'number' && costPerSecond > 0) {
			cost = costPerSecond * dur;
		} else if (typeof costPerGeneration === 'number' && costPerGeneration > 0) {
			cost = costPerGeneration;
		} else {
			return null;
		}
		return `$${cost.toFixed(2)}`;
	}

	function handleGenerate() {
		if (!canGenerate) return;
		const model = filteredModels.find((m) => m.id === selectedModel);
		if (!model) return;

		generating = true;
		dispatch('generate', {
			prompt: prompt.trim(),
			aspectRatio,
			duration,
			model: selectedModel,
			provider: model.provider,
			resolution: selectedResolution
		});
	}

	export function resetForm() {
		prompt = '';
		generating = false;
	}
</script>

<div class="create-form" role="region" aria-label="Create video">
	{#if !hasModels}
		<div class="no-provider">
			<svg
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
			>
				<circle cx="12" cy="12" r="10" />
				<line x1="12" y1="8" x2="12" y2="12" />
				<line x1="12" y1="16" x2="12.01" y2="16" />
			</svg>
			<p>No video provider configured.</p>
			<p class="no-provider-hint">
				Go to <a href="/admin/ai-keys">Admin &rarr; AI Keys</a>, edit your API key (OpenAI or
				WaveSpeed), and enable the <strong>Video Generation</strong> toggle with a model selected.
			</p>
		</div>
	{:else}
		<div class="form-body">
			<div class="prompt-section">
				<textarea
					bind:value={prompt}
					placeholder="Describe your video..."
					rows="3"
					maxlength="4000"
					class="prompt-input"
				></textarea>
				<span class="char-count">{prompt.length}/4000</span>
			</div>

			<div class="form-options">
				{#if hasMultipleProviders}
					<div class="option-group">
						<label class="option-label" for="provider-select">Provider</label>
						<select
							id="provider-select"
							bind:value={selectedProvider}
							class="model-select"
							aria-label="Provider"
						>
							{#each uniqueProviders as prov}
								<option value={prov}>{providerDisplayNames[prov] || prov}</option>
							{/each}
						</select>
					</div>
				{/if}

				<div class="option-group">
					<span class="option-label">Aspect Ratio</span>
					<div class="ratio-selector" role="radiogroup" aria-label="Aspect ratio">
						{#each availableAspectRatios as ratio}
							<button
								type="button"
								class="ratio-btn"
								class:active={aspectRatio === ratio}
								on:click={() => (aspectRatio = ratio)}
								role="radio"
								aria-checked={aspectRatio === ratio}
							>
								{ratio}
							</button>
						{/each}
					</div>
				</div>

				<div class="option-group">
					<span class="option-label">Duration</span>
					<div class="ratio-selector" role="radiogroup" aria-label="Video duration">
						{#each availableDurations as d}
							<button
								type="button"
								class="ratio-btn"
								class:active={duration === d}
								on:click={() => (duration = d)}
								role="radio"
								aria-checked={duration === d}
							>
								{d}s
							</button>
						{/each}
					</div>
				</div>

				{#if hasResolutionSelector}
					<div class="option-group">
						<span class="option-label">Resolution</span>
						<div class="ratio-selector" role="radiogroup" aria-label="Video resolution">
							{#each availableResolutions as res}
								<button
									type="button"
									class="ratio-btn"
									class:active={selectedResolution === res}
									on:click={() => (selectedResolution = res)}
									role="radio"
									aria-checked={selectedResolution === res}
								>
									{res}
								</button>
							{/each}
						</div>
					</div>
				{/if}

				{#if filteredModels.length > 1 || hasMultipleProviders}
					<div class="option-group">
						<label class="option-label" for="model-select">Model</label>
						<select
							id="model-select"
							bind:value={selectedModel}
							class="model-select"
							aria-label="Model"
						>
							{#each filteredModels as model}
								<option value={model.id}>{model.displayName}</option>
							{/each}
						</select>
					</div>
				{/if}
			</div>

			{#if hasPricing && estimatedCost}
				<div class="pricing-preview" data-testid="pricing-preview">
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<circle cx="12" cy="12" r="10" />
						<line x1="12" y1="8" x2="12" y2="16" />
						<line x1="8" y1="12" x2="16" y2="12" />
					</svg>
					<span>Estimated cost: <strong>{estimatedCost}</strong></span>
					{#if effectiveRate != null}
						<span class="pricing-detail"
							>({duration}s &times; ${effectiveRate}/s{hasResolutionSelector
								? ` @ ${selectedResolution}`
								: ''})</span
						>
					{:else if currentModel?.pricing?.estimatedCostPerGeneration}
						<span class="pricing-detail">(per generation)</span>
					{/if}
				</div>
			{/if}

			<button type="button" class="generate-btn" disabled={!canGenerate} on:click={handleGenerate}>
				{#if generating}
					<span class="spinner"></span>
					Generating...
				{:else}
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<polygon points="5,3 19,12 5,21" />
					</svg>
					Generate Video
				{/if}
			</button>
		</div>
	{/if}
</div>

<style>
	/* ===== MOBILE-FIRST BASE STYLES ===== */

	.create-form {
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-md);
	}

	.no-provider {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-sm);
		color: var(--color-text-secondary);
		padding: var(--spacing-md);
		text-align: center;
	}

	.no-provider svg {
		flex-shrink: 0;
		color: var(--color-warning);
	}

	.no-provider-hint {
		font-size: 0.85rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.no-provider-hint a {
		color: var(--color-primary);
		text-decoration: underline;
	}

	.form-body {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.prompt-section {
		position: relative;
	}

	.prompt-input {
		width: 100%;
		padding: var(--spacing-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background-color: var(--color-background);
		color: var(--color-text);
		font-family: var(--font-sans);
		font-size: 1rem;
		resize: vertical;
		transition: border-color var(--transition-fast);
		min-height: 80px;
	}

	.prompt-input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.prompt-input::placeholder {
		color: var(--color-text-secondary);
	}

	.char-count {
		position: absolute;
		bottom: var(--spacing-sm);
		right: var(--spacing-sm);
		font-size: 0.7rem;
		color: var(--color-text-secondary);
	}

	/* Form options — stacked on mobile */
	.form-options {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.option-group {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.option-label {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	/* Ratio/duration/resolution selectors — scrollable on mobile */
	.ratio-selector {
		display: flex;
		gap: var(--spacing-xs);
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none;
	}

	.ratio-selector::-webkit-scrollbar {
		display: none;
	}

	.ratio-btn {
		padding: var(--spacing-sm) var(--spacing-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background-color: var(--color-background);
		color: var(--color-text);
		font-size: 0.85rem;
		cursor: pointer;
		transition: all var(--transition-fast);
		white-space: nowrap;
		min-height: 44px;
		min-width: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.ratio-btn.active {
		background-color: var(--color-primary);
		color: var(--color-background);
		border-color: var(--color-primary);
	}

	.ratio-btn:hover:not(.active) {
		background-color: var(--color-surface-hover);
	}

	.model-select {
		padding: var(--spacing-sm);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background-color: var(--color-background);
		color: var(--color-text);
		font-size: 0.85rem;
		min-height: 44px;
		width: 100%;
	}

	.pricing-preview {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-sm) var(--spacing-md);
		background-color: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		flex-wrap: wrap;
	}

	.pricing-preview svg {
		flex-shrink: 0;
		color: var(--color-primary);
	}

	.pricing-preview strong {
		color: var(--color-text);
		font-weight: 600;
	}

	.pricing-detail {
		font-size: 0.7rem;
		opacity: 0.7;
	}

	/* Generate button — full-width on mobile */
	.generate-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-lg);
		border: none;
		border-radius: var(--radius-md);
		background-color: var(--color-primary);
		color: var(--color-background);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: background-color var(--transition-fast);
		width: 100%;
		min-height: 48px;
	}

	.generate-btn:hover:not(:disabled) {
		background-color: var(--color-primary-hover);
	}

	.generate-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid var(--color-background);
		border-top-color: transparent;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* ===== TABLET (min-width: 640px) ===== */
	@media (min-width: 640px) {
		.create-form {
			padding: var(--spacing-lg);
		}

		.no-provider {
			padding: var(--spacing-lg);
		}

		.prompt-input {
			font-size: 0.9rem;
		}

		/* Form options — row layout on tablet+ */
		.form-options {
			flex-direction: row;
			flex-wrap: wrap;
			gap: var(--spacing-lg);
			align-items: flex-end;
		}

		.ratio-btn {
			padding: var(--spacing-xs) var(--spacing-sm);
			font-size: 0.8rem;
			min-height: 36px;
			min-width: auto;
		}

		.model-select {
			padding: var(--spacing-xs) var(--spacing-sm);
			font-size: 0.8rem;
			min-height: 36px;
			width: auto;
		}

		/* Generate button — auto-width on tablet+ */
		.generate-btn {
			width: auto;
			align-self: flex-start;
			font-size: 0.85rem;
			min-height: 40px;
		}
	}
</style>
