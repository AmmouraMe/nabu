<script lang="ts">
	import { createEventDispatcher, onDestroy } from 'svelte';
	import MediaUpload from './MediaUpload.svelte';
	import AIGenerateModal from './AIGenerateModal.svelte';
	import ImageDetailModal from './ImageDetailModal.svelte';
	import type { BrandMediaAsset } from '$lib/types/brand-assets';

	const dispatch = createEventDispatcher<{
		select: BrandMediaAsset;
		setProfileImage: {
			asset: BrandMediaAsset;
			url: string;
			variant: 'icon' | 'horizontal' | 'vertical';
		};
		refresh: void;
	}>();

	export let brandProfileId: string;
	export let mediaType: 'image' | 'audio' | 'video' = 'image';
	export let assets: BrandMediaAsset[] = [];
	export let loading = false;
	export let showSetAsProfile = false;

	// Detail modal state
	let detailAsset: BrandMediaAsset | null = null;
	let detailOpen = false;

	function openDetail(asset: BrandMediaAsset) {
		detailAsset = asset;
		detailOpen = true;
	}

	function closeDetail() {
		detailOpen = false;
		detailAsset = null;
	}

	function handleSetProfileImage(
		e: CustomEvent<{
			asset: BrandMediaAsset;
			url: string;
			variant: 'icon' | 'horizontal' | 'vertical';
		}>
	) {
		closeDetail();
		dispatch('setProfileImage', e.detail);
	}

	function handleDetailDelete(e: CustomEvent<BrandMediaAsset>) {
		closeDetail();
		deleteAsset(e.detail);
	}

	function handleDetailRevisions(e: CustomEvent<BrandMediaAsset>) {
		closeDetail();
		loadRevisions(e.detail);
	}

	export let pendingGenerations: Array<{
		id: string;
		name: string;
		category: string;
		status: string;
		type: string;
	}> = [];

	let mode: 'gallery' | 'upload' | 'ai' = 'gallery';
	let aiModalOpen = false;
	let showActivityPanel = false;
	let activityLogs: Array<{
		id: string;
		action: string;
		description: string;
		source: string;
		createdAt: string;
	}> = [];
	let selectedAsset: BrandMediaAsset | null = null;
	let revisions: Array<{
		id: string;
		revisionNumber: number;
		source: string;
		changeNote?: string;
		isCurrent: boolean;
		createdAt: string;
	}> = [];
	let showRevisions = false;

	$: typeLabel = mediaType === 'image' ? 'Images' : mediaType === 'audio' ? 'Audio' : 'Videos';

	$: categories =
		mediaType === 'image'
			? ['logo', 'social', 'marketing', 'product', 'brand_elements', 'team']
			: mediaType === 'audio'
				? ['sonic_identity', 'music', 'voiceover']
				: ['brand', 'social', 'marketing', 'content', 'internal'];

	async function handleUpload(
		e: CustomEvent<{ file: File; mediaType: string; category: string; name: string }>
	) {
		const { file, category, name } = e.detail;

		const formData = new FormData();
		formData.append('file', file);
		formData.append('brandProfileId', brandProfileId);
		formData.append('mediaType', mediaType);
		formData.append('category', category);
		formData.append('name', name);

		try {
			const res = await fetch('/api/brand/assets/upload', {
				method: 'POST',
				body: formData
			});

			if (!res.ok) throw new Error('Upload failed');

			mode = 'gallery';
			dispatch('refresh');
		} catch (err) {
			console.error('Upload failed:', err);
		}
	}

	async function handleAIGenerate(
		e: CustomEvent<{
			type: string;
			prompt: string;
			model: string;
			name: string;
			category: string;
			brandProfileId: string;
			options: Record<string, unknown>;
		}>
	) {
		const { type, prompt, name, category, brandProfileId: bpId, options } = e.detail;

		// Show a placeholder immediately while the API call runs
		const tempId = `temp-${Date.now()}`;
		pendingGenerations = [
			...pendingGenerations,
			{ id: tempId, name, category, status: 'pending', type }
		];
		mode = 'gallery';

		try {
			const response = await fetch('/api/brand/assets/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					type,
					brandProfileId: bpId,
					prompt,
					name,
					category,
					...options
				})
			});

			const data = await response.json();

			if (data.generation?.status === 'failed') {
				// Remove the placeholder on failure
				pendingGenerations = pendingGenerations.filter((g) => g.id !== tempId);
				return;
			}

			const realId = data.generation?.id;
			if (realId) {
				// Swap temp ID for real ID and start polling
				pendingGenerations = pendingGenerations.map((g) =>
					g.id === tempId ? { ...g, id: realId } : g
				);
				pollGeneration(realId);
			} else {
				pendingGenerations = pendingGenerations.filter((g) => g.id !== tempId);
			}
		} catch {
			// Remove placeholder on network error
			pendingGenerations = pendingGenerations.filter((g) => g.id !== tempId);
		}
	}

	/** Poll for generation completion and refresh assets when done */
	let pollTimers: Record<string, ReturnType<typeof setTimeout>> = {};

	function pollGeneration(generationId: string) {
		const poll = async () => {
			try {
				const res = await fetch(
					`/api/brand/assets/generate?id=${encodeURIComponent(generationId)}`
				);
				if (!res.ok) return;
				const data = await res.json();
				const gen = data.generation;

				if (gen?.status === 'complete' || gen?.status === 'failed') {
					// Remove from pending
					pendingGenerations = pendingGenerations.filter((g) => g.id !== generationId);
					delete pollTimers[generationId];
					// Refresh the assets list
					if (gen.status === 'complete') {
						dispatch('refresh');
					}
					return;
				}
			} catch {
				// Network error — keep polling
			}
			// Poll again in 3 seconds
			pollTimers[generationId] = setTimeout(poll, 3000);
		};
		// Start first poll after 2 seconds
		pollTimers[generationId] = setTimeout(poll, 2000);
	}

	onDestroy(() => {
		// Clean up all polling timers
		Object.values(pollTimers).forEach(clearTimeout);
	});

	async function loadActivityLog() {
		try {
			const res = await fetch(`/api/brand/assets/activity?brandProfileId=${brandProfileId}`);
			if (res.ok) {
				const data = await res.json();
				activityLogs = data.logs || [];
			}
		} catch (err) {
			console.error('Failed to load activity log:', err);
		}
	}

	async function loadRevisions(asset: BrandMediaAsset) {
		selectedAsset = asset;
		try {
			const res = await fetch(`/api/brand/assets/revisions?brandMediaId=${asset.id}`);
			if (res.ok) {
				const data = await res.json();
				revisions = data.revisions || [];
				showRevisions = true;
			}
		} catch (err) {
			console.error('Failed to load revisions:', err);
		}
	}

	async function revertToRevision(revisionId: string) {
		if (!selectedAsset) return;
		try {
			const res = await fetch('/api/brand/assets/revisions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'revert',
					revisionId,
					brandProfileId
				})
			});

			if (res.ok) {
				showRevisions = false;
				selectedAsset = null;
				dispatch('refresh');
			}
		} catch (err) {
			console.error('Failed to revert:', err);
		}
	}

	async function deleteAsset(asset: BrandMediaAsset) {
		if (!confirm(`Delete "${asset.name}"? This cannot be undone.`)) return;

		try {
			const res = await fetch(`/api/brand/assets/media?id=${asset.id}`, {
				method: 'DELETE'
			});

			if (res.ok) dispatch('refresh');
		} catch (err) {
			console.error('Delete failed:', err);
		}
	}

	function toggleActivity() {
		showActivityPanel = !showActivityPanel;
		if (showActivityPanel) loadActivityLog();
	}

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatFileSize(bytes?: number): string {
		if (!bytes) return '';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / 1048576).toFixed(1)} MB`;
	}

	function getSourceBadge(source: string): string {
		if (source === 'ai_generated') return 'AI';
		if (source === 'url_import') return 'URL';
		return 'Upload';
	}

	function isAIGenerated(asset: BrandMediaAsset): boolean {
		return !!(asset.metadata && asset.metadata.aiGenerated);
	}

	function getAssetUrl(asset: BrandMediaAsset): string {
		if (asset.url) return asset.url;
		if (asset.r2Key) return `/api/brand/assets/file?key=${encodeURIComponent(asset.r2Key)}`;
		return '';
	}
</script>

<div class="media-gallery">
	<!-- Header -->
	<div class="gallery-header">
		<h3>{typeLabel}</h3>
		<div class="header-actions">
			<button
				class="action-btn"
				class:active={showActivityPanel}
				on:click={toggleActivity}
				aria-label="Activity log"
				title="Activity Log"
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path
						d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
			<button
				class="action-btn upload-btn"
				on:click={() => (mode = 'upload')}
				aria-label="Upload {mediaType}"
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M12 16V4m0 0L8 8m4-4l4 4" stroke-linecap="round" stroke-linejoin="round" />
					<path
						d="M20 16.7V19a2 2 0 01-2 2H6a2 2 0 01-2-2v-2.3"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				Upload
			</button>
			<button
				class="action-btn ai-btn"
				on:click={() => {
					aiModalOpen = true;
				}}
				aria-label="Generate with AI"
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path
						d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				AI Generate
			</button>
		</div>
	</div>

	<!-- Content area -->
	{#if mode === 'upload'}
		<div class="panel">
			<div class="panel-header">
				<h4>Upload {mediaType}</h4>
				<button class="close-panel-btn" on:click={() => (mode = 'gallery')} aria-label="Close">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</button>
			</div>
			<MediaUpload {mediaType} {categories} on:upload={handleUpload} />
		</div>
	{/if}

	<!-- Asset Grid -->
	{#if loading}
		<div class="loading">
			<span class="spinner"></span>
			Loading...
		</div>
	{:else if assets.length === 0 && pendingGenerations.length === 0 && mode === 'gallery'}
		<div class="empty-state">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
				{#if mediaType === 'image'}
					<path
						d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				{:else if mediaType === 'audio'}
					<path
						d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				{:else}
					<path
						d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				{/if}
			</svg>
			<p>No {typeLabel.toLowerCase()} yet</p>
			<div class="empty-actions">
				<button class="btn-secondary" on:click={() => (mode = 'upload')}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<path
							d="M12 16V4m0 0L8 8m4-4l4 4M20 16.7V19a2 2 0 01-2 2H6a2 2 0 01-2-2v-2.3"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					Upload
				</button>
				<button
					class="btn-primary"
					on:click={() => {
						aiModalOpen = true;
					}}
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<path
							d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					Generate with AI
				</button>
			</div>
		</div>
	{:else}
		<div class="asset-grid" class:audio-grid={mediaType === 'audio'}>
			<!-- Pending generation placeholders -->
			{#each pendingGenerations as gen (gen.id)}
				<div class="asset-card generating-card">
					<div class="asset-preview generating-preview">
						<div class="generation-placeholder">
							<span class="generation-spinner"></span>
							<span class="generation-label">Generating...</span>
						</div>
						<span class="source-badge ai">AI</span>
					</div>
					<div class="asset-info">
						<span class="asset-name" title={gen.name}>{gen.name}</span>
						<span class="asset-meta">{gen.category.replace(/_/g, ' ')}</span>
					</div>
				</div>
			{/each}

			<!-- Existing assets -->
			{#each assets as asset (asset.id)}
				<div class="asset-card">
					<!-- Preview -->
					<div
						class="asset-preview"
						on:click={() => openDetail(asset)}
						on:keydown={(e) => e.key === 'Enter' && openDetail(asset)}
						role="button"
						tabindex="0"
					>
						{#if mediaType === 'image'}
							<img src={getAssetUrl(asset)} alt={asset.name} loading="lazy" />
						{:else if mediaType === 'audio'}
							<div class="audio-placeholder">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
									<path
										d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							</div>
						{:else}
							<div class="video-placeholder">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
									<path
										d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							</div>
						{/if}

						<!-- Source badge -->
						{#if isAIGenerated(asset)}
							<span class="source-badge ai">AI</span>
						{/if}
					</div>

					<!-- Info -->
					<div class="asset-info">
						<span class="asset-name" title={asset.name}>{asset.name}</span>
						<span class="asset-meta">
							{asset.category.replace(/_/g, ' ')}
							{#if asset.fileSize}
								· {formatFileSize(asset.fileSize)}{/if}
						</span>
					</div>

					<!-- Actions -->
					<div class="asset-actions">
						<button
							class="icon-btn"
							on:click={() => loadRevisions(asset)}
							title="Version history"
							aria-label="Version history"
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
								<path
									d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
						</button>
						<button
							class="icon-btn danger"
							on:click={() => deleteAsset(asset)}
							title="Delete"
							aria-label="Delete {asset.name}"
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
								<path
									d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Activity Log Panel -->
	{#if showActivityPanel}
		<div class="activity-panel">
			<div class="panel-header">
				<h4>Activity Log</h4>
				<button
					class="close-panel-btn"
					on:click={() => (showActivityPanel = false)}
					aria-label="Close"
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</button>
			</div>
			<div class="activity-list">
				{#each activityLogs as log (log.id)}
					<div class="activity-item">
						<div
							class="activity-badge"
							class:ai={log.source === 'ai_generated'}
							class:upload={log.source === 'upload'}
						>
							{getSourceBadge(log.source)}
						</div>
						<div class="activity-content">
							<span class="activity-desc">{log.description}</span>
							<span class="activity-date">{formatDate(log.createdAt)}</span>
						</div>
					</div>
				{:else}
					<p class="empty-text">No activity recorded yet.</p>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Revision History Panel -->
	{#if showRevisions && selectedAsset}
		<div class="revision-panel">
			<div class="panel-header">
				<h4>Revisions: {selectedAsset.name}</h4>
				<button
					class="close-panel-btn"
					on:click={() => {
						showRevisions = false;
						selectedAsset = null;
					}}
					aria-label="Close"
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</button>
			</div>
			<div class="revision-list">
				{#each revisions as rev (rev.id)}
					<div class="revision-item" class:current={rev.isCurrent}>
						<div class="revision-header">
							<span class="revision-number">v{rev.revisionNumber}</span>
							{#if rev.isCurrent}
								<span class="current-badge">Current</span>
							{/if}
							<span class="revision-source" class:ai={rev.source === 'ai_generated'}>
								{getSourceBadge(rev.source)}
							</span>
						</div>
						{#if rev.changeNote}
							<span class="revision-note">{rev.changeNote}</span>
						{/if}
						<div class="revision-footer">
							<span class="revision-date">{formatDate(rev.createdAt)}</span>
							{#if !rev.isCurrent}
								<button class="revert-btn" on:click={() => revertToRevision(rev.id)}>
									Revert to this version
								</button>
							{/if}
						</div>
					</div>
				{:else}
					<p class="empty-text">No revision history available.</p>
				{/each}
			</div>
		</div>
	{/if}
</div>

<!-- AI Generate Modal -->
<AIGenerateModal
	{brandProfileId}
	generationType={mediaType}
	bind:open={aiModalOpen}
	on:generate={handleAIGenerate}
/>

<!-- Image Detail Modal -->
{#if detailAsset}
	<ImageDetailModal
		asset={detailAsset}
		open={detailOpen}
		{showSetAsProfile}
		on:close={closeDetail}
		on:setProfileImage={handleSetProfileImage}
		on:delete={handleDetailDelete}
		on:revisions={handleDetailRevisions}
	/>
{/if}

<style>
	.media-gallery {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.gallery-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--spacing-sm);
	}

	.gallery-header h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.header-actions {
		display: flex;
		gap: var(--spacing-xs);
	}

	.action-btn {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) var(--spacing-sm);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background-color: var(--color-surface);
		color: var(--color-text);
		font-size: 0.8125rem;
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast);
	}

	.action-btn:hover {
		background-color: var(--color-surface-hover);
	}

	.action-btn.active {
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.action-btn svg {
		width: 1rem;
		height: 1rem;
	}

	.ai-btn {
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.ai-btn:hover {
		background-color: var(--color-surface-hover);
	}

	/* Panel */
	.panel,
	.activity-panel,
	.revision-panel {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-md);
		background-color: var(--color-surface);
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--spacing-md);
	}

	.panel-header h4 {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.close-panel-btn {
		background: none;
		border: none;
		cursor: pointer;
		padding: var(--spacing-xs);
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		transition: color var(--transition-fast);
	}

	.close-panel-btn:hover {
		color: var(--color-text);
	}

	.close-panel-btn svg {
		width: 1rem;
		height: 1rem;
	}

	/* Asset Grid */
	.asset-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: var(--spacing-md);
	}

	.asset-grid.audio-grid {
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
	}

	.asset-card {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
		background-color: var(--color-surface);
		transition: box-shadow var(--transition-fast);
	}

	.asset-card:hover {
		box-shadow: var(--shadow-md);
	}

	/* Generation placeholder */
	.generating-card {
		border-color: var(--color-primary);
		border-style: dashed;
		opacity: 0.85;
	}

	.generating-preview {
		background: linear-gradient(
			135deg,
			var(--color-surface-hover) 0%,
			var(--color-surface) 50%,
			var(--color-surface-hover) 100%
		);
		background-size: 200% 200%;
		animation: shimmer 2s ease-in-out infinite;
	}

	.generation-placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-sm);
		width: 100%;
		height: 100%;
	}

	.generation-spinner {
		width: 2rem;
		height: 2rem;
		border: 3px solid var(--color-border);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.generation-label {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--color-primary);
	}

	@keyframes shimmer {
		0%,
		100% {
			background-position: 0% 50%;
		}
		50% {
			background-position: 100% 50%;
		}
	}

	.asset-preview {
		position: relative;
		aspect-ratio: 1;
		overflow: hidden;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: var(--color-surface-hover);
	}

	.asset-preview img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.audio-placeholder,
	.video-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
	}

	.audio-placeholder svg,
	.video-placeholder svg {
		width: 2.5rem;
		height: 2.5rem;
		color: var(--color-text-secondary);
	}

	.source-badge {
		position: absolute;
		top: var(--spacing-xs);
		right: var(--spacing-xs);
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.source-badge.ai {
		background-color: var(--color-primary);
		color: white;
	}

	.asset-info {
		padding: var(--spacing-sm);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.asset-name {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--color-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.asset-meta {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		text-transform: capitalize;
	}

	.asset-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--spacing-xs);
		padding: 0 var(--spacing-sm) var(--spacing-sm);
	}

	.icon-btn {
		background: none;
		border: none;
		cursor: pointer;
		padding: var(--spacing-xs);
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		transition:
			color var(--transition-fast),
			background-color var(--transition-fast);
	}

	.icon-btn:hover {
		color: var(--color-text);
		background-color: var(--color-surface-hover);
	}

	.icon-btn.danger:hover {
		color: var(--color-text);
	}

	.icon-btn svg {
		width: 1rem;
		height: 1rem;
	}

	/* Empty state */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-md);
		padding: var(--spacing-2xl);
		text-align: center;
	}

	.empty-state svg {
		width: 3rem;
		height: 3rem;
		color: var(--color-text-secondary);
	}

	.empty-state p {
		margin: 0;
		color: var(--color-text-secondary);
	}

	.empty-actions {
		display: flex;
		gap: var(--spacing-sm);
	}

	.btn-primary,
	.btn-secondary {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
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

	.btn-primary:hover {
		background-color: var(--color-primary-hover);
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

	.btn-secondary:hover {
		background-color: var(--color-surface-hover);
	}

	.btn-secondary svg {
		width: 1rem;
		height: 1rem;
	}

	/* Loading */
	.loading {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-xl);
		color: var(--color-text-secondary);
	}

	.spinner {
		width: 1.25rem;
		height: 1.25rem;
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

	/* Activity Log */
	.activity-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		max-height: 300px;
		overflow-y: auto;
	}

	.activity-item {
		display: flex;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm);
		border-radius: var(--radius-md);
		transition: background-color var(--transition-fast);
	}

	.activity-item:hover {
		background-color: var(--color-surface-hover);
	}

	.activity-badge {
		flex-shrink: 0;
		width: 2rem;
		height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-md);
		font-size: 0.625rem;
		font-weight: 700;
		text-transform: uppercase;
		background-color: var(--color-surface-hover);
		color: var(--color-text-secondary);
	}

	.activity-badge.ai {
		background-color: var(--color-primary);
		color: white;
	}

	.activity-content {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.activity-desc {
		font-size: 0.8125rem;
		color: var(--color-text);
	}

	.activity-date {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	/* Revision History */
	.revision-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		max-height: 400px;
		overflow-y: auto;
	}

	.revision-item {
		padding: var(--spacing-sm);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.revision-item.current {
		border-color: var(--color-primary);
	}

	.revision-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.revision-number {
		font-weight: 600;
		font-size: 0.875rem;
		color: var(--color-text);
	}

	.current-badge {
		font-size: 0.6875rem;
		padding: 1px 6px;
		border-radius: var(--radius-sm);
		background-color: var(--color-primary);
		color: white;
		font-weight: 500;
	}

	.revision-source {
		font-size: 0.6875rem;
		padding: 1px 6px;
		border-radius: var(--radius-sm);
		background-color: var(--color-surface-hover);
		color: var(--color-text-secondary);
		font-weight: 500;
	}

	.revision-source.ai {
		background-color: var(--color-primary);
		color: white;
	}

	.revision-note {
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
	}

	.revision-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.revision-date {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.revert-btn {
		font-size: 0.75rem;
		padding: 2px 8px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background-color: var(--color-surface);
		color: var(--color-primary);
		cursor: pointer;
		transition: background-color var(--transition-fast);
	}

	.revert-btn:hover {
		background-color: var(--color-surface-hover);
	}

	.empty-text {
		text-align: center;
		color: var(--color-text-secondary);
		font-size: 0.8125rem;
		padding: var(--spacing-md);
	}
</style>
