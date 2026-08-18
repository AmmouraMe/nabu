<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { BrandMediaAsset } from '$lib/types/brand-assets';

	const dispatch = createEventDispatcher<{
		close: void;
		setProfileImage: {
			asset: BrandMediaAsset;
			url: string;
			variant: 'icon' | 'horizontal' | 'vertical';
		};
		delete: BrandMediaAsset;
		revisions: BrandMediaAsset;
	}>();

	export let asset: BrandMediaAsset;
	export let open = false;
	export let showSetAsProfile = false;

	function getAssetUrl(a: BrandMediaAsset): string {
		if (a.url) return a.url;
		if (a.r2Key) return `/api/brand/assets/file?key=${encodeURIComponent(a.r2Key)}`;
		return '';
	}

	function formatFileSize(bytes?: number): string {
		if (bytes == null) return '';
		if (bytes === 0) return '0 B';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / 1048576).toFixed(1)} MB`;
	}

	function formatDimensions(width?: number, height?: number): string {
		if (!width || !height) return '';
		return `${width} × ${height}`;
	}

	function formatCategory(category: string): string {
		return category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}

	function isAIGenerated(a: BrandMediaAsset): boolean {
		return !!(a.metadata && a.metadata.aiGenerated);
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function handleClose() {
		dispatch('close');
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			handleClose();
		}
	}

	function handleBackdropKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			handleClose();
		}
	}

	let logoMenuOpen = false;

	function handleSetAsProfile(variant: 'icon' | 'horizontal' | 'vertical') {
		const url = getAssetUrl(asset);
		dispatch('setProfileImage', { asset, url, variant });
		logoMenuOpen = false;
	}

	$: imageUrl = getAssetUrl(asset);
	$: dimensions = formatDimensions(asset.width, asset.height);
	$: fileSize = formatFileSize(asset.fileSize);
	$: categoryLabel = formatCategory(asset.category);
	$: aiGenerated = isAIGenerated(asset);
	$: prompt = asset.metadata?.prompt as string | undefined;
</script>

{#if open}
	<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
	<div
		class="modal-backdrop"
		role="dialog"
		aria-modal="true"
		aria-label="Image detail: {asset.name}"
		on:click={handleBackdropClick}
		on:keydown={handleBackdropKeydown}
	>
		<div class="modal-content">
			<!-- Header -->
			<div class="modal-header">
				<h2 class="modal-title">{asset.name}</h2>
				<button class="close-btn" on:click={handleClose} aria-label="Close">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</button>
			</div>

			<!-- Body -->
			<div class="modal-body">
				<!-- Large image preview -->
				<div class="image-container">
					{#if imageUrl}
						<img src={imageUrl} alt={asset.name} class="detail-image" />
					{:else}
						<div class="no-image">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
								<path
									d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
							<span>No preview available</span>
						</div>
					{/if}
				</div>

				<!-- Metadata panel -->
				<div class="metadata-panel">
					<!-- Badges -->
					<div class="badge-row">
						<span class="category-badge">{categoryLabel}</span>
						{#if asset.isPrimary}
							<span class="primary-badge">Primary</span>
						{/if}
						{#if aiGenerated}
							<span class="ai-badge">AI Generated</span>
						{/if}
					</div>

					<!-- Description -->
					{#if asset.description}
						<div class="meta-section">
							<h4>Description</h4>
							<p>{asset.description}</p>
						</div>
					{/if}

					<!-- AI Prompt -->
					{#if prompt}
						<div class="meta-section">
							<h4>AI Prompt</h4>
							<p class="prompt-text">{prompt}</p>
						</div>
					{/if}

					<!-- File Details -->
					<div class="meta-section">
						<h4>Details</h4>
						<dl class="detail-list">
							{#if dimensions}
								<div class="detail-row">
									<dt>Dimensions</dt>
									<dd>{dimensions}</dd>
								</div>
							{/if}
							{#if fileSize}
								<div class="detail-row">
									<dt>File Size</dt>
									<dd>{fileSize}</dd>
								</div>
							{/if}
							{#if asset.mimeType}
								<div class="detail-row">
									<dt>Type</dt>
									<dd>{asset.mimeType}</dd>
								</div>
							{/if}
							<div class="detail-row">
								<dt>Created</dt>
								<dd>{formatDate(asset.createdAt)}</dd>
							</div>
							{#if asset.updatedAt !== asset.createdAt}
								<div class="detail-row">
									<dt>Updated</dt>
									<dd>{formatDate(asset.updatedAt)}</dd>
								</div>
							{/if}
						</dl>
					</div>

					<!-- Tags -->
					{#if asset.tags && asset.tags.length > 0}
						<div class="meta-section">
							<h4>Tags</h4>
							<div class="tag-list">
								{#each asset.tags as tag}
									<span class="tag">{tag}</span>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Actions -->
					<div class="modal-actions">
						{#if showSetAsProfile}
							<div class="logo-set-group">
								<button
									class="action-btn primary-action"
									on:click={() => {
										logoMenuOpen = !logoMenuOpen;
									}}
								>
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
										<path
											d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>
									Set as Brand Logo
									<svg
										class="chevron"
										class:open={logoMenuOpen}
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"><polyline points="6 9 12 15 18 9" /></svg
									>
								</button>
								{#if logoMenuOpen}
									<div class="logo-variant-menu">
										<button class="logo-variant-option" on:click={() => handleSetAsProfile('icon')}>
											<span class="variant-icon">◻️</span>
											Icon (Square)
										</button>
										<button
											class="logo-variant-option"
											on:click={() => handleSetAsProfile('horizontal')}
										>
											<span class="variant-icon">▬</span>
											Horizontal
										</button>
										<button
											class="logo-variant-option"
											on:click={() => handleSetAsProfile('vertical')}
										>
											<span class="variant-icon">▮</span>
											Vertical
										</button>
									</div>
								{/if}
							</div>
						{/if}
						<button class="action-btn" on:click={() => dispatch('revisions', asset)}>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
								<path
									d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
							Version History
						</button>
						<button class="action-btn danger-action" on:click={() => dispatch('delete', asset)}>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
								<path
									d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
							Delete
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: rgba(0, 0, 0, 0.6);
		padding: var(--spacing-md);
		animation: fadeIn 150ms ease;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.modal-content {
		background-color: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-xl);
		max-width: 900px;
		width: 100%;
		max-height: 90vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		box-shadow: var(--shadow-xl);
		animation: slideUp 200ms ease;
	}

	@keyframes slideUp {
		from {
			transform: translateY(1rem);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-md) var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
	}

	.modal-title {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border: none;
		background: none;
		cursor: pointer;
		border-radius: var(--radius-md);
		color: var(--color-text-secondary);
		transition: all var(--transition-fast);
		flex-shrink: 0;
	}

	.close-btn:hover {
		background-color: var(--color-surface-hover);
		color: var(--color-text);
	}

	.close-btn svg {
		width: 1.25rem;
		height: 1.25rem;
	}

	.modal-body {
		display: grid;
		grid-template-columns: 1fr 320px;
		overflow: hidden;
		flex: 1;
	}

	/* Image container */
	.image-container {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--spacing-lg);
		background-color: var(--color-surface);
		overflow: auto;
		min-height: 300px;
	}

	.detail-image {
		max-width: 100%;
		max-height: 70vh;
		object-fit: contain;
		border-radius: var(--radius-md);
	}

	.no-image {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-sm);
		color: var(--color-text-secondary);
	}

	.no-image svg {
		width: 3rem;
		height: 3rem;
	}

	.no-image span {
		font-size: 0.875rem;
	}

	/* Metadata panel */
	.metadata-panel {
		padding: var(--spacing-lg);
		overflow-y: auto;
		border-left: 1px solid var(--color-border);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.badge-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs);
	}

	.category-badge,
	.primary-badge,
	.ai-badge {
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.category-badge {
		background-color: var(--color-surface-hover);
		color: var(--color-text-secondary);
	}

	.primary-badge {
		background-color: var(--color-success);
		color: white;
	}

	.ai-badge {
		background-color: var(--color-primary);
		color: white;
	}

	.meta-section {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.meta-section h4 {
		margin: 0;
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
	}

	.meta-section p {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--color-text);
		line-height: 1.5;
	}

	.prompt-text {
		font-style: italic;
		color: var(--color-text-secondary) !important;
		background-color: var(--color-surface);
		padding: var(--spacing-sm);
		border-radius: var(--radius-md);
		font-size: 0.8125rem;
	}

	.detail-list {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--spacing-sm);
	}

	.detail-row dt {
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
		flex-shrink: 0;
	}

	.detail-row dd {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--color-text);
		text-align: right;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tag-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs);
	}

	.tag {
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		background-color: var(--color-surface);
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
	}

	/* Actions */
	.modal-actions {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
		margin-top: auto;
		padding-top: var(--spacing-md);
		border-top: 1px solid var(--color-border);
	}

	.action-btn {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background-color: var(--color-surface);
		color: var(--color-text);
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.action-btn:hover {
		background-color: var(--color-surface-hover);
	}

	.action-btn svg {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
	}

	.primary-action {
		background-color: var(--color-primary);
		color: white;
		border-color: var(--color-primary);
	}

	.primary-action:hover {
		background-color: var(--color-primary-hover);
	}

	.logo-set-group {
		position: relative;
	}

	.primary-action .chevron {
		width: 14px;
		height: 14px;
		transition: transform var(--transition-fast);
	}

	.primary-action .chevron.open {
		transform: rotate(180deg);
	}

	.logo-variant-menu {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		margin-top: 4px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
		z-index: 10;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}

	.logo-variant-option {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		width: 100%;
		padding: var(--spacing-sm) var(--spacing-md);
		border: none;
		background: none;
		color: var(--color-text);
		font-size: 0.85rem;
		cursor: pointer;
		text-align: left;
	}

	.logo-variant-option:hover {
		background: var(--color-surface-hover);
	}

	.logo-variant-option + .logo-variant-option {
		border-top: 1px solid var(--color-border);
	}

	.variant-icon {
		font-size: 1rem;
		width: 20px;
		text-align: center;
	}

	.danger-action:hover {
		color: var(--color-error);
		border-color: var(--color-error);
	}

	/* Responsive: stack on smaller screens */
	@media (max-width: 768px) {
		.modal-body {
			grid-template-columns: 1fr;
			grid-template-rows: auto 1fr;
		}

		.metadata-panel {
			border-left: none;
			border-top: 1px solid var(--color-border);
			max-height: 40vh;
		}

		.image-container {
			min-height: 200px;
			max-height: 40vh;
		}
	}
</style>
