<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher<{
		upload: { file: File; mediaType: string; category: string; name: string };
	}>();

	export let mediaType: 'image' | 'audio' | 'video' = 'image';
	export let categories: string[] = [];
	export let disabled = false;

	let selectedCategory = categories[0] || '';
	let assetName = '';
	let dragging = false;
	let fileInput: HTMLInputElement;
	let selectedFile: File | null = null;
	let previewUrl: string | null = null;

	$: acceptTypes =
		mediaType === 'image' ? 'image/*' : mediaType === 'audio' ? 'audio/*' : 'video/*';

	$: if (categories.length > 0 && !selectedCategory) {
		selectedCategory = categories[0];
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		dragging = true;
	}

	function handleDragLeave() {
		dragging = false;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		const file = e.dataTransfer?.files[0];
		if (file) selectFile(file);
	}

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) selectFile(file);
	}

	function selectFile(file: File) {
		selectedFile = file;
		if (!assetName) assetName = file.name.replace(/\.[^.]+$/, '');

		// Create preview
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		if (mediaType === 'image' || mediaType === 'video' || mediaType === 'audio') {
			previewUrl = URL.createObjectURL(file);
		}
	}

	function handleUpload() {
		if (!selectedFile || !selectedCategory) return;
		dispatch('upload', {
			file: selectedFile,
			mediaType,
			category: selectedCategory,
			name: assetName || selectedFile.name
		});
		reset();
	}

	function reset() {
		selectedFile = null;
		assetName = '';
		if (previewUrl) {
			URL.revokeObjectURL(previewUrl);
			previewUrl = null;
		}
		if (fileInput) fileInput.value = '';
	}

	function formatFileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / 1048576).toFixed(1)} MB`;
	}
</script>

<div class="upload-container" class:disabled>
	<!-- Drop Zone -->
	<div
		class="dropzone"
		class:dragging
		class:has-file={selectedFile}
		role="button"
		tabindex="0"
		on:dragover={handleDragOver}
		on:dragleave={handleDragLeave}
		on:drop={handleDrop}
		on:click={() => fileInput?.click()}
		on:keydown={(e) => e.key === 'Enter' && fileInput?.click()}
		aria-label="Drop a file here or click to browse"
	>
		{#if selectedFile && previewUrl}
			<div class="preview">
				{#if mediaType === 'image'}
					<img src={previewUrl} alt="Preview of {selectedFile.name}" class="preview-image" />
				{:else if mediaType === 'audio'}
					<!-- svelte-ignore a11y-media-has-caption -->
					<audio controls src={previewUrl} class="preview-audio"></audio>
				{:else if mediaType === 'video'}
					<!-- svelte-ignore a11y-media-has-caption -->
					<video controls src={previewUrl} class="preview-video"></video>
				{/if}
				<div class="file-info">
					<span class="file-name">{selectedFile.name}</span>
					<span class="file-size">{formatFileSize(selectedFile.size)}</span>
				</div>
			</div>
		{:else}
			<div class="dropzone-content">
				<svg
					class="upload-icon"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<path d="M12 16V4m0 0L8 8m4-4l4 4" stroke-linecap="round" stroke-linejoin="round" />
					<path
						d="M20 16.7V19a2 2 0 01-2 2H6a2 2 0 01-2-2v-2.3"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				<p class="dropzone-text">
					Drop your {mediaType} here, or <span class="browse-link">browse</span>
				</p>
				<p class="dropzone-hint">
					{#if mediaType === 'image'}PNG, JPG, SVG, WebP up to 10MB
					{:else if mediaType === 'audio'}MP3, WAV, OGG, AAC up to 50MB
					{:else}MP4, WebM, MOV up to 100MB
					{/if}
				</p>
			</div>
		{/if}
	</div>

	<input
		bind:this={fileInput}
		type="file"
		accept={acceptTypes}
		on:change={handleFileSelect}
		class="hidden-input"
		aria-hidden="true"
		tabindex="-1"
	/>

	<!-- Options -->
	{#if selectedFile}
		<div class="upload-options">
			<div class="field">
				<label for="asset-name">Name</label>
				<input id="asset-name" type="text" bind:value={assetName} placeholder="Asset name" />
			</div>

			<div class="field">
				<label for="asset-category">Category</label>
				<select id="asset-category" bind:value={selectedCategory}>
					{#each categories as cat}
						<option value={cat}>{cat.replace(/_/g, ' ')}</option>
					{/each}
				</select>
			</div>

			<div class="upload-actions">
				<button class="btn-secondary" on:click={reset}>Cancel</button>
				<button
					class="btn-primary"
					on:click={handleUpload}
					disabled={!selectedFile || !selectedCategory}
				>
					Upload
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.upload-container {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.upload-container.disabled {
		opacity: 0.5;
		pointer-events: none;
	}

	.dropzone {
		border: 2px dashed var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-xl);
		text-align: center;
		cursor: pointer;
		transition:
			border-color var(--transition-fast),
			background-color var(--transition-fast);
		min-height: 160px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.dropzone:hover,
	.dropzone:focus-visible {
		border-color: var(--color-primary);
		background-color: var(--color-surface-hover);
	}

	.dropzone.dragging {
		border-color: var(--color-primary);
		background-color: var(--color-surface-hover);
		border-style: solid;
	}

	.dropzone.has-file {
		border-style: solid;
		border-color: var(--color-primary);
		padding: var(--spacing-md);
	}

	.dropzone-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.upload-icon {
		width: 2.5rem;
		height: 2.5rem;
		color: var(--color-text-secondary);
	}

	.dropzone-text {
		color: var(--color-text);
		margin: 0;
	}

	.browse-link {
		color: var(--color-primary);
		text-decoration: underline;
	}

	.dropzone-hint {
		color: var(--color-text-secondary);
		font-size: 0.8125rem;
		margin: 0;
	}

	.preview {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-sm);
		width: 100%;
	}

	.preview-image {
		max-width: 200px;
		max-height: 150px;
		border-radius: var(--radius-md);
		object-fit: contain;
	}

	.preview-audio {
		width: 100%;
		max-width: 400px;
	}

	.preview-video {
		max-width: 100%;
		max-height: 200px;
		border-radius: var(--radius-md);
	}

	.file-info {
		display: flex;
		gap: var(--spacing-sm);
		color: var(--color-text-secondary);
		font-size: 0.8125rem;
	}

	.file-name {
		font-weight: 500;
		color: var(--color-text);
	}

	.hidden-input {
		display: none;
	}

	.upload-options {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
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

	.field input,
	.field select {
		background-color: var(--color-surface);
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--spacing-sm) var(--spacing-md);
		font-size: 0.875rem;
	}

	.field input:focus,
	.field select:focus {
		border-color: var(--color-primary);
		outline: 2px solid var(--color-primary);
		outline-offset: 1px;
	}

	.upload-actions {
		display: flex;
		gap: var(--spacing-sm);
		justify-content: flex-end;
		padding-top: var(--spacing-sm);
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

	.btn-secondary {
		background-color: var(--color-surface);
		color: var(--color-text);
		border-color: var(--color-border);
	}

	.btn-secondary:hover {
		background-color: var(--color-surface-hover);
	}
</style>
