<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';

	interface VideoModelOption {
		id: string;
		displayName: string;
		provider: string;
		maxDuration?: number;
		supportedDurations?: number[];
		supportedAspectRatios?: string[];
		supportedResolutions?: string[];
		validSizes?: Record<string, Record<string, string>>;
		pricing?: {
			estimatedCostPerSecond?: number;
			estimatedCostPerGeneration?: number;
			pricingByResolution?: Record<
				string,
				{ estimatedCostPerSecond?: number; estimatedCostPerGeneration?: number }
			>;
			currency: string;
		};
	}

	const dispatch = createEventDispatcher<{
		generate: {
			type: string;
			prompt: string;
			model: string;
			category: string;
			name: string;
			brandProfileId: string;
			options: Record<string, unknown>;
		};
		close: void;
	}>();

	export let brandProfileId: string;
	export let generationType: 'image' | 'audio' | 'video' = 'image';
	export let open = false;

	$: void brandProfileId;

	let prompt = '';
	let assetName = '';
	let selectedCategory = '';
	let generating = false;
	let error = '';

	// Image options
	let imageSize: '1024x1024' | '1792x1024' | '1024x1792' = '1024x1024';
	let imageStyle: 'vivid' | 'natural' = 'vivid';
	let imageQuality: 'standard' | 'hd' = 'standard';
	let imageModel = 'dall-e-3';

	// Audio options
	let audioVoice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'alloy';
	let audioModel = 'tts-1';
	let audioSpeed = 1.0;

	// Video options — loaded dynamically from API
	let videoModels: VideoModelOption[] = [];
	let videoModelsLoaded = false;
	let videoModel = '';
	let selectedVideoProvider = '';
	let videoAspectRatio: '16:9' | '9:16' | '1:1' = '16:9';
	let videoDuration = 8;
	let videoResolution = '720p';

	const providerDisplayNames: Record<string, string> = {
		openai: 'OpenAI (Sora)',
		wavespeed: 'WaveSpeed AI'
	};

	// Derive unique providers from loaded video models
	$: videoProviders = [...new Set(videoModels.map((m) => m.provider))];
	$: hasMultipleVideoProviders = videoProviders.length > 1;

	// Auto-select first provider when models load
	$: if (
		videoProviders.length > 0 &&
		(!selectedVideoProvider || !videoProviders.includes(selectedVideoProvider))
	) {
		selectedVideoProvider = videoProviders[0];
	}

	// Filter models by selected provider
	$: filteredVideoModels = selectedVideoProvider
		? videoModels.filter((m) => m.provider === selectedVideoProvider)
		: videoModels;

	// Auto-select first model when provider changes
	$: if (
		filteredVideoModels.length > 0 &&
		(!videoModel || !filteredVideoModels.some((m) => m.id === videoModel))
	) {
		videoModel = filteredVideoModels[0].id;
	}

	// Current model for deriving available options
	$: currentVideoModel = filteredVideoModels.find((m) => m.id === videoModel);

	// Available aspect ratios from current model
	$: videoAspectRatios = currentVideoModel?.supportedAspectRatios || ['16:9', '9:16', '1:1'];
	$: if (videoAspectRatios.length > 0 && !videoAspectRatios.includes(videoAspectRatio)) {
		videoAspectRatio = videoAspectRatios[0] as '16:9' | '9:16' | '1:1';
	}

	// Available durations from current model
	$: videoDurations = currentVideoModel?.supportedDurations || [5, 8];
	$: if (videoDurations.length > 0 && !videoDurations.includes(videoDuration)) {
		videoDuration = videoDurations[0];
	}

	// Resolution / quality support: derive from validSizes, supportedResolutions, or hide
	$: videoResolutions = (() => {
		if (currentVideoModel?.validSizes) {
			const ratioSizes = currentVideoModel.validSizes[videoAspectRatio];
			return ratioSizes ? Object.keys(ratioSizes) : [];
		}
		return currentVideoModel?.supportedResolutions || [];
	})();
	$: hasQualitySelector = videoResolutions.length > 0;
	$: if (videoResolutions.length > 0 && !videoResolutions.includes(videoResolution)) {
		videoResolution = videoResolutions[videoResolutions.length - 1]; // default to highest
	}

	async function loadVideoModels() {
		try {
			const res = await fetch('/api/video/models');
			if (res.ok) {
				const data = await res.json();
				videoModels = data.models || [];
			}
		} catch {
			// Models not available — the no-models state handles this
		}
		videoModelsLoaded = true;
	}

	// Load video models when modal opens for video generation
	$: if (open && generationType === 'video' && !videoModelsLoaded) {
		loadVideoModels();
	}

	$: typeLabel =
		generationType === 'image' ? 'Image' : generationType === 'audio' ? 'Audio' : 'Video';

	$: defaultCategories =
		generationType === 'image'
			? ['logo', 'social', 'marketing', 'product', 'brand_elements', 'team']
			: generationType === 'audio'
				? ['sonic_identity', 'music', 'voiceover']
				: ['brand', 'social', 'marketing', 'content', 'internal'];

	$: if (defaultCategories.length > 0 && !selectedCategory) {
		selectedCategory = defaultCategories[0];
	}

	$: videoEstimatedCost = (() => {
		if (!currentVideoModel?.pricing) return '~$0.04-0.50/sec';
		const p = currentVideoModel.pricing;

		// Check resolution-specific pricing first
		const resPricing = p.pricingByResolution?.[videoResolution];
		if (resPricing) {
			if (resPricing.estimatedCostPerGeneration != null) {
				return `~$${resPricing.estimatedCostPerGeneration.toFixed(2)}/gen`;
			}
			if (resPricing.estimatedCostPerSecond != null) {
				const total = resPricing.estimatedCostPerSecond * videoDuration;
				return `~$${total.toFixed(2)}`;
			}
		}

		// Fall back to top-level pricing
		if (p.estimatedCostPerGeneration) return `~$${p.estimatedCostPerGeneration.toFixed(2)}/gen`;
		if (p.estimatedCostPerSecond) {
			const total = p.estimatedCostPerSecond * videoDuration;
			return `~$${total.toFixed(2)}`;
		}
		return '~$0.04-0.50/sec';
	})();

	$: estimatedCost =
		generationType === 'image'
			? imageModel === 'dall-e-3'
				? imageQuality === 'hd'
					? '$0.08'
					: '$0.04'
				: '$0.02'
			: generationType === 'audio'
				? audioModel === 'tts-1-hd'
					? '~$0.03/1K chars'
					: '~$0.015/1K chars'
				: videoEstimatedCost;

	function handleClose() {
		if (!generating) {
			open = false;
			dispatch('close');
			reset();
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) handleClose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') handleClose();
	}

	async function handleGenerate() {
		// Audio is text-to-speech — prompt is always required
		if (generationType === 'audio' && !prompt.trim()) {
			error = 'Please enter the text to speak';
			return;
		}

		error = '';

		const options: Record<string, unknown> = {};

		if (generationType === 'image') {
			options.size = imageSize;
			options.style = imageStyle;
			options.quality = imageQuality;
			options.model = imageModel;
		} else if (generationType === 'audio') {
			options.voice = audioVoice;
			options.model = audioModel;
			options.speed = audioSpeed;
		} else {
			options.model = videoModel;
			options.provider = selectedVideoProvider;
			options.aspectRatio = videoAspectRatio;
			options.duration = videoDuration;
			if (hasQualitySelector) {
				options.resolution = videoResolution;
			}
		}

		// Dispatch event with all form data, then close immediately.
		// The parent (MediaGallery) will make the API call and show a progress placeholder.
		dispatch('generate', {
			type: generationType,
			prompt: prompt.trim(),
			model: (options.model as string) || '',
			category: selectedCategory,
			name: assetName || `AI ${typeLabel}`,
			brandProfileId,
			options
		});

		open = false;
		reset();
	}

	function reset() {
		prompt = '';
		assetName = '';
		error = '';
		selectedCategory = defaultCategories[0] || '';
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
	<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
	<div
		class="modal-backdrop"
		on:click={handleBackdropClick}
		role="dialog"
		aria-modal="true"
		aria-label="AI {typeLabel} Generation"
	>
		<div class="modal">
			<header class="modal-header">
				<div class="header-content">
					<svg
						class="ai-icon"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
					>
						<path
							d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
						<path
							d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					<h2>Generate {typeLabel} with AI</h2>
				</div>
				<button class="close-btn" on:click={handleClose} aria-label="Close">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</button>
			</header>

			<div class="modal-body">
				{#if error}
					<div class="error-banner" role="alert">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
							<path
								d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
							<path
								d="M12 15.75h.007v.008H12v-.008z"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
						<span>{error}</span>
					</div>
				{/if}

				<!-- Prompt -->
				<div class="field">
					<label for="ai-prompt">
						{#if generationType === 'audio'}Text to speak{:else}Describe what you want <span
								class="optional-hint">(optional — brand context will be used)</span
							>{/if}
					</label>
					<textarea
						id="ai-prompt"
						bind:value={prompt}
						placeholder={generationType === 'image'
							? 'A modern minimalist logo with a blue gradient, clean geometric shapes...'
							: generationType === 'audio'
								? 'Welcome to our company. We help brands tell their story through innovative design...'
								: 'A cinematic brand intro with smooth camera movement, logo reveal...'}
						rows={generationType === 'audio' ? 5 : 3}
					></textarea>
				</div>

				<!-- Name -->
				<div class="field">
					<label for="ai-name">Asset Name</label>
					<input
						id="ai-name"
						type="text"
						bind:value={assetName}
						placeholder="AI Generated {typeLabel}"
					/>
				</div>

				<!-- Category -->
				<div class="field">
					<label for="ai-category">Category</label>
					<select id="ai-category" bind:value={selectedCategory}>
						{#each defaultCategories as cat}
							<option value={cat}>{cat.replace(/_/g, ' ')}</option>
						{/each}
					</select>
				</div>

				<!-- Type-specific options -->
				{#if generationType === 'image'}
					<div class="options-grid">
						<div class="field">
							<label for="ai-img-model">Model</label>
							<select id="ai-img-model" bind:value={imageModel}>
								<option value="dall-e-3">DALL·E 3</option>
								<option value="dall-e-2">DALL·E 2</option>
							</select>
						</div>
						<div class="field">
							<label for="ai-img-size">Size</label>
							<select id="ai-img-size" bind:value={imageSize}>
								<option value="1024x1024">1024 × 1024</option>
								<option value="1792x1024">1792 × 1024</option>
								<option value="1024x1792">1024 × 1792</option>
							</select>
						</div>
						<div class="field">
							<label for="ai-img-style">Style</label>
							<select id="ai-img-style" bind:value={imageStyle}>
								<option value="vivid">Vivid</option>
								<option value="natural">Natural</option>
							</select>
						</div>
						<div class="field">
							<label for="ai-img-quality">Quality</label>
							<select id="ai-img-quality" bind:value={imageQuality}>
								<option value="standard">Standard</option>
								<option value="hd">HD</option>
							</select>
						</div>
					</div>
				{:else if generationType === 'audio'}
					<div class="options-grid">
						<div class="field">
							<label for="ai-audio-model">Model</label>
							<select id="ai-audio-model" bind:value={audioModel}>
								<option value="tts-1">TTS-1</option>
								<option value="tts-1-hd">TTS-1 HD</option>
							</select>
						</div>
						<div class="field">
							<label for="ai-audio-voice">Voice</label>
							<select id="ai-audio-voice" bind:value={audioVoice}>
								<option value="alloy">Alloy</option>
								<option value="echo">Echo</option>
								<option value="fable">Fable</option>
								<option value="onyx">Onyx</option>
								<option value="nova">Nova</option>
								<option value="shimmer">Shimmer</option>
							</select>
						</div>
						<div class="field">
							<label for="ai-audio-speed">Speed</label>
							<input
								id="ai-audio-speed"
								type="range"
								min="0.25"
								max="4.0"
								step="0.25"
								bind:value={audioSpeed}
							/>
							<span class="range-value">{audioSpeed}x</span>
						</div>
					</div>
				{:else if videoModels.length === 0 && videoModelsLoaded}
					<div class="no-video-models">
						<p>
							No video models available. Go to <a href="/admin/ai-keys">Admin &rarr; AI Keys</a> and
							enable Video Generation on an API key.
						</p>
					</div>
				{:else}
					{#if hasMultipleVideoProviders}
						<div class="field">
							<label for="ai-vid-provider">Provider</label>
							<select id="ai-vid-provider" bind:value={selectedVideoProvider}>
								{#each videoProviders as prov}
									<option value={prov}>{providerDisplayNames[prov] || prov}</option>
								{/each}
							</select>
						</div>
					{/if}
					<div class="field">
						<label for="ai-vid-model">Model</label>
						<select id="ai-vid-model" bind:value={videoModel}>
							{#each filteredVideoModels as m}
								<option value={m.id}>{m.displayName}</option>
							{/each}
						</select>
					</div>
					<div class="options-grid">
						<div class="field">
							<label for="ai-vid-aspect">Aspect Ratio</label>
							<select id="ai-vid-aspect" bind:value={videoAspectRatio}>
								{#each videoAspectRatios as ratio}
									<option value={ratio}
										>{ratio === '16:9'
											? '16:9 Landscape'
											: ratio === '9:16'
												? '9:16 Portrait'
												: '1:1 Square'}</option
									>
								{/each}
							</select>
						</div>
						<div class="field">
							<label for="ai-vid-duration">Duration</label>
							<select id="ai-vid-duration" bind:value={videoDuration}>
								{#each videoDurations as d}
									<option value={d}>{d} seconds</option>
								{/each}
							</select>
						</div>
						{#if hasQualitySelector}
							<div class="field">
								<label for="ai-vid-quality">Quality</label>
								<select id="ai-vid-quality" bind:value={videoResolution}>
									{#each videoResolutions as res}
										<option value={res}>{res}</option>
									{/each}
								</select>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Cost estimate -->
				<div class="cost-estimate">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<path
							d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					<span>Estimated cost: <strong>{estimatedCost}</strong></span>
				</div>
			</div>

			<footer class="modal-footer">
				<button class="btn-secondary" on:click={handleClose} disabled={generating}> Cancel </button>
				<button
					class="btn-primary"
					on:click={handleGenerate}
					disabled={generating || (generationType === 'audio' && !prompt.trim())}
				>
					{#if generating}
						<span class="spinner"></span>
						Generating...
					{:else}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
							<path
								d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
						Generate {typeLabel}
					{/if}
				</button>
			</footer>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background-color: rgb(0 0 0 / 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		padding: var(--spacing-md);
	}

	.modal {
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-xl);
		width: 100%;
		max-width: 560px;
		max-height: 90vh;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
	}

	.header-content {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.ai-icon {
		width: 1.5rem;
		height: 1.5rem;
		color: var(--color-primary);
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.close-btn {
		background: none;
		border: none;
		cursor: pointer;
		padding: var(--spacing-xs);
		border-radius: var(--radius-md);
		color: var(--color-text-secondary);
		transition:
			color var(--transition-fast),
			background-color var(--transition-fast);
	}

	.close-btn:hover {
		color: var(--color-text);
		background-color: var(--color-surface-hover);
	}

	.close-btn svg {
		width: 1.25rem;
		height: 1.25rem;
	}

	.modal-body {
		padding: var(--spacing-lg);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.error-banner {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		background-color: var(--color-surface-hover);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		color: var(--color-text);
		font-size: 0.875rem;
	}

	.error-banner svg {
		width: 1.25rem;
		height: 1.25rem;
		flex-shrink: 0;
		color: var(--color-text-secondary);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.field label {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.optional-hint {
		font-weight: 400;
		font-size: 0.75rem;
		opacity: 0.7;
	}

	.field textarea,
	.field input[type='text'],
	.field select {
		background-color: var(--color-surface);
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--spacing-sm) var(--spacing-md);
		font-size: 0.875rem;
		font-family: inherit;
		resize: vertical;
	}

	.field textarea:focus,
	.field input:focus,
	.field select:focus {
		border-color: var(--color-primary);
		outline: 2px solid var(--color-primary);
		outline-offset: 1px;
	}

	.field textarea::placeholder,
	.field input::placeholder {
		color: var(--color-text-secondary);
	}

	.field input[type='range'] {
		accent-color: var(--color-primary);
	}

	.range-value {
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
		text-align: center;
	}

	.options-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--spacing-sm);
	}

	.no-video-models {
		padding: var(--spacing-md);
		text-align: center;
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	.no-video-models a {
		color: var(--color-primary);
	}

	.cost-estimate {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		background-color: var(--color-surface-hover);
		border-radius: var(--radius-md);
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
	}

	.cost-estimate svg {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
	}

	.cost-estimate strong {
		color: var(--color-text);
	}

	.modal-footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--spacing-sm);
		padding: var(--spacing-md) var(--spacing-lg);
		border-top: 1px solid var(--color-border);
	}

	.btn-primary,
	.btn-secondary {
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color var(--transition-fast);
		border: 1px solid transparent;
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.btn-primary {
		background-color: var(--color-primary);
		color: white;
		border-color: var(--color-primary);
	}

	.btn-primary:hover:not(:disabled) {
		background-color: var(--color-primary-hover);
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-primary svg {
		width: 1rem;
		height: 1rem;
	}

	.btn-secondary {
		background-color: var(--color-surface);
		color: var(--color-text);
		border-color: var(--color-border);
	}

	.btn-secondary:hover:not(:disabled) {
		background-color: var(--color-surface-hover);
	}

	.spinner {
		width: 1rem;
		height: 1rem;
		border: 2px solid transparent;
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Mobile responsive */
	@media (max-width: 600px) {
		.modal-backdrop {
			padding: 0;
			align-items: flex-end;
		}

		.modal {
			max-width: 100%;
			max-height: 95vh;
			border-radius: var(--radius-xl) var(--radius-xl) 0 0;
		}

		.modal-header {
			padding: var(--spacing-md);
		}

		.modal-body {
			padding: var(--spacing-md);
		}

		.options-grid {
			grid-template-columns: 1fr;
		}

		.modal-footer {
			padding: var(--spacing-md);
		}
	}
</style>
