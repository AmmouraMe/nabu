<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	// ─── Types ────────────────────────────────────────────────────────

	interface ContentItem {
		id: string;
		brand_id: string;
		type: string;
		platform: string;
		title: string | null;
		body: string | null;
		status: string;
		scheduled_for: string | null;
		published_at: string | null;
		external_url: string | null;
		error_message: string | null;
		created_at: string;
	}

	// ─── State ────────────────────────────────────────────────────────

	let items: ContentItem[] = [];
	let isLoading = true;
	let pageError: string | null = null;
	let activeTab: 'draft' | 'scheduled' | 'published' = 'draft';

	// Generate form
	let topic = '';
	let selectedPlatforms: string[] = ['devto', 'linkedin'];
	let isGenerating = false;
	let generateError: string | null = null;
	let generateSuccess: string | null = null;
	let showGenerateForm = false;

	// Publish state
	let publishingId: string | null = null;
	let publishSuccess: string | null = null;
	let publishError: string | null = null;

	// Preview modal
	let previewItem: ContentItem | null = null;

	const platforms = ['devto', 'linkedin'];
	const platformLabels: Record<string, string> = { devto: 'Dev.to', linkedin: 'LinkedIn' };
	const platformIcons: Record<string, string> = { devto: '📝', linkedin: '💼' };
	const statusColors: Record<string, string> = {
		draft: 'var(--color-text-secondary)',
		scheduled: 'var(--color-primary)',
		published: 'var(--color-success, #22c55e)',
		failed: 'var(--color-error)'
	};

	// ─── Load / Derived ───────────────────────────────────────────────

	$: draftItems = items.filter((i) => i.status === 'draft');
	$: scheduledItems = items.filter((i) => i.status === 'scheduled');
	$: publishedItems = items.filter((i) => i.status === 'published');
	$: activeItems =
		activeTab === 'draft' ? draftItems : activeTab === 'scheduled' ? scheduledItems : publishedItems;

	import { onMount } from 'svelte';

	onMount(() => loadItems());

	async function loadItems() {
		isLoading = true;
		pageError = null;
		try {
			const res = await fetch(`/api/content/items?brandId=${data.brandId}`);
			if (!res.ok) throw new Error('Failed to load content');
			const result = await res.json();
			items = result.items ?? [];
		} catch (err) {
			pageError = err instanceof Error ? err.message : 'Failed to load';
		} finally {
			isLoading = false;
		}
	}

	// ─── Generate ─────────────────────────────────────────────────────

	function togglePlatform(plt: string) {
		if (selectedPlatforms.includes(plt)) {
			selectedPlatforms = selectedPlatforms.filter((p) => p !== plt);
		} else {
			selectedPlatforms = [...selectedPlatforms, plt];
		}
	}

	async function generateContent() {
		if (!topic.trim() || selectedPlatforms.length === 0 || isGenerating) return;
		isGenerating = true;
		generateError = null;
		generateSuccess = null;

		try {
			const res = await fetch('/api/content/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					brandId: data.brandId,
					topic: topic.trim(),
					platforms: selectedPlatforms
				})
			});

			const result = await res.json();

			if (!res.ok) {
				throw new Error(result.message ?? 'Generation failed');
			}

			const count = result.created?.length ?? 0;
			generateSuccess = `Generated ${count} draft${count !== 1 ? 's' : ''}`;
			topic = '';
			showGenerateForm = false;
			await loadItems();
		} catch (err) {
			generateError = err instanceof Error ? err.message : 'Generation failed';
		} finally {
			isGenerating = false;
		}
	}

	// ─── Publish ──────────────────────────────────────────────────────

	async function publishItem(itemId: string) {
		if (publishingId) return;
		publishingId = itemId;
		publishSuccess = null;
		publishError = null;

		try {
			const res = await fetch('/api/content/publish', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ itemId })
			});

			const result = await res.json();

			if (!res.ok) {
				throw new Error(result.message ?? 'Publish failed');
			}

			publishSuccess = `Published! ${result.externalUrl ? '→ ' + result.externalUrl : ''}`;
			await loadItems();
			setTimeout(() => (publishSuccess = null), 5000);
		} catch (err) {
			publishError = err instanceof Error ? err.message : 'Publish failed';
		} finally {
			publishingId = null;
		}
	}

	// ─── Helpers ──────────────────────────────────────────────────────

	function formatDate(dateStr: string | null) {
		if (!dateStr) return '';
		return new Date(dateStr).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function switchTab(tab: string) {
		activeTab = tab as typeof activeTab;
	}

	function excerpt(text: string | null, maxLen = 120) {
		if (!text) return '';
		return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
	}
</script>

<svelte:head>
	<title>Content Calendar — {data.brandName} | Nabu</title>
</svelte:head>

<div class="content-page">
	<!-- Header -->
	<header class="page-header">
		<div class="header-left">
			<a href="/brand/{data.brandProfileId}" class="back-link">← {data.brandName}</a>
			<h1 class="page-title">Content Calendar</h1>
		</div>
		<div class="header-actions">
			<a href="/brand/{data.brandProfileId}/connect" class="connect-link">Connect Accounts</a>
			<button class="generate-btn" on:click={() => (showGenerateForm = !showGenerateForm)}>
				{showGenerateForm ? '✕ Cancel' : '✨ Generate Content'}
			</button>
		</div>
	</header>

	<!-- Success/Error banners -->
	{#if generateSuccess}
		<div class="banner success">
			{generateSuccess}
			<button on:click={() => (generateSuccess = null)} aria-label="Dismiss">×</button>
		</div>
	{/if}
	{#if publishSuccess}
		<div class="banner success">{publishSuccess}</div>
	{/if}
	{#if publishError}
		<div class="banner error">
			{publishError}
			<button on:click={() => (publishError = null)} aria-label="Dismiss">×</button>
		</div>
	{/if}

	<!-- Generate Form -->
	{#if showGenerateForm}
		<div class="generate-form">
			<h2 class="form-title">Generate Content</h2>
			<label class="form-label">
				Topic
				<input
					type="text"
					bind:value={topic}
					placeholder="e.g. How to ship faster with CI/CD"
					class="form-input"
				/>
			</label>

			<div class="platform-group">
				<span class="form-label">Platforms</span>
				<div class="platform-toggles">
					{#each platforms as plt}
						<button
							class="platform-toggle"
							class:active={selectedPlatforms.includes(plt)}
							on:click={() => togglePlatform(plt)}
							type="button"
						>
							{platformIcons[plt]}
							{platformLabels[plt]}
						</button>
					{/each}
				</div>
			</div>

			{#if generateError}
				<div class="inline-error">{generateError}</div>
			{/if}

			<button
				class="submit-btn"
				on:click={generateContent}
				disabled={!topic.trim() || selectedPlatforms.length === 0 || isGenerating}
			>
				{#if isGenerating}
					<span class="spinner-sm"></span> Generating…
				{:else}
					✨ Generate Drafts
				{/if}
			</button>
		</div>
	{/if}

	<!-- Tab Nav -->
	<div class="tab-nav" role="tablist">
		{#each ['draft', 'scheduled', 'published'] as tab}
			{@const count = tab === 'draft' ? draftItems.length : tab === 'scheduled' ? scheduledItems.length : publishedItems.length}
			<button
				class="tab-btn"
				class:active={activeTab === tab}
				on:click={() => switchTab(tab)}
				role="tab"
				aria-selected={activeTab === tab}
			>
				{tab.charAt(0).toUpperCase() + tab.slice(1)}
				{#if count > 0}
					<span class="tab-badge">{count}</span>
				{/if}
			</button>
		{/each}
	</div>

	<!-- Content List -->
	{#if isLoading}
		<div class="loading-state">
			<div class="spinner"></div>
			<p>Loading content…</p>
		</div>
	{:else if pageError}
		<div class="error-state">{pageError}</div>
	{:else if activeItems.length === 0}
		<div class="empty-state">
			<span class="empty-icon">📭</span>
			<p>No {activeTab} content yet</p>
			{#if activeTab === 'draft'}
				<p class="empty-hint">Click "Generate Content" to create drafts with AI.</p>
			{/if}
		</div>
	{:else}
		<div class="content-list">
			{#each activeItems as item (item.id)}
				<div class="content-card">
					<div class="card-meta">
						<span class="platform-badge">
							{platformIcons[item.platform] ?? '📄'}
							{platformLabels[item.platform] ?? item.platform}
						</span>
						<span class="type-badge">{item.type}</span>
						<span class="status-badge" style="color: {statusColors[item.status] ?? 'inherit'}">
							{item.status}
						</span>
						<span class="date-label">{formatDate(item.created_at)}</span>
					</div>

					{#if item.title}
						<h3 class="card-title">{item.title}</h3>
					{/if}
					<p class="card-body">{excerpt(item.body)}</p>

					{#if item.error_message}
						<p class="card-error">Error: {item.error_message}</p>
					{/if}

					<div class="card-actions">
						<button class="action-btn preview" on:click={() => (previewItem = item)}>
							Preview
						</button>
						{#if item.status === 'draft' || item.status === 'failed'}
							<button
								class="action-btn publish"
								on:click={() => publishItem(item.id)}
								disabled={publishingId === item.id}
							>
								{publishingId === item.id ? 'Publishing…' : '🚀 Publish'}
							</button>
						{/if}
						{#if item.external_url}
							<a href={item.external_url} target="_blank" rel="noopener" class="action-btn external">
								View →
							</a>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Preview Modal -->
{#if previewItem}
	<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
	<div
		class="modal-overlay"
		role="presentation"
		on:click={(event) => {
			if (event.target === event.currentTarget) previewItem = null;
		}}
	>
		<div class="modal" role="dialog" aria-modal="true">
			<div class="modal-header">
				<span class="modal-platform">
					{platformIcons[previewItem.platform] ?? ''} {platformLabels[previewItem.platform] ?? previewItem.platform}
				</span>
				<button
					class="modal-close"
					aria-label="Close preview"
					on:click={() => (previewItem = null)}>×</button
				>
			</div>
			{#if previewItem.title}
				<h2 class="modal-title">{previewItem.title}</h2>
			{/if}
			<pre class="modal-body">{previewItem.body ?? ''}</pre>
			{#if previewItem.status === 'draft' || previewItem.status === 'failed'}
				<button
					class="submit-btn"
					on:click={() => {
						const id = previewItem && previewItem.id;
						if (id) publishItem(id);
						previewItem = null;
					}}
					disabled={!!publishingId}
				>
					🚀 Publish
				</button>
			{/if}
		</div>
	</div>
{/if}

<style>
	.content-page {
		max-width: 900px;
		margin: 0 auto;
		padding: var(--spacing-lg) var(--spacing-md);
		min-height: calc(100vh - 60px);
	}

	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-lg);
	}

	.header-left {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.back-link {
		color: var(--color-primary);
		text-decoration: none;
		font-size: 0.85rem;
		font-weight: 500;
	}

	.page-title {
		font-size: 1.6rem;
		font-weight: 800;
		color: var(--color-text);
		margin: 0;
	}

	.header-actions {
		display: flex;
		gap: var(--spacing-sm);
		align-items: center;
		flex-wrap: wrap;
	}

	.connect-link {
		padding: var(--spacing-xs) var(--spacing-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text);
		text-decoration: none;
	}

	.generate-btn {
		padding: var(--spacing-xs) var(--spacing-md);
		background-color: var(--color-primary);
		color: var(--color-background);
		border: none;
		border-radius: var(--radius-md);
		font-weight: 600;
		font-size: 0.85rem;
		cursor: pointer;
	}

	.generate-btn:hover {
		background-color: var(--color-primary-hover);
	}

	/* Banners */
	.banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-md);
		font-size: 0.85rem;
	}

	.banner.success {
		background-color: var(--color-success, #22c55e);
		color: var(--color-background);
	}

	.banner.error {
		background-color: var(--color-error);
		color: var(--color-background);
	}

	.banner button {
		background: none;
		border: none;
		color: inherit;
		cursor: pointer;
		font-size: 1.2rem;
	}

	/* Generate form */
	.generate-form {
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
		margin-bottom: var(--spacing-lg);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.form-title {
		font-size: 1rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0;
	}

	.form-label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text-secondary);
	}

	.form-input {
		background-color: var(--color-background);
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: var(--spacing-sm);
		font-size: 0.85rem;
		font-family: inherit;
	}

	.form-input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.platform-group {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.platform-toggles {
		display: flex;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
	}

	.platform-toggle {
		padding: var(--spacing-xs) var(--spacing-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background-color: var(--color-background);
		color: var(--color-text-secondary);
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.platform-toggle.active {
		border-color: var(--color-primary);
		background-color: var(--color-primary);
		color: var(--color-background);
	}

	.submit-btn {
		padding: var(--spacing-sm) var(--spacing-lg);
		background-color: var(--color-primary);
		color: var(--color-background);
		border: none;
		border-radius: var(--radius-md);
		font-weight: 700;
		font-size: 0.9rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		align-self: flex-start;
	}

	.submit-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.inline-error {
		font-size: 0.8rem;
		color: var(--color-error);
		padding: var(--spacing-xs) var(--spacing-sm);
		background-color: color-mix(in srgb, var(--color-error) 10%, transparent);
		border-radius: var(--radius-sm);
	}

	/* Tab nav */
	.tab-nav {
		display: flex;
		gap: var(--spacing-xs);
		margin-bottom: var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
	}

	.tab-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: var(--spacing-sm) var(--spacing-md);
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--color-text-secondary);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.tab-btn.active {
		color: var(--color-primary);
		border-bottom-color: var(--color-primary);
	}

	.tab-badge {
		background-color: var(--color-primary);
		color: var(--color-background);
		font-size: 0.7rem;
		font-weight: 700;
		padding: 1px 6px;
		border-radius: 10px;
	}

	/* Loading / empty */
	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 200px;
		gap: var(--spacing-md);
		color: var(--color-text-secondary);
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--color-border);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.spinner-sm {
		display: inline-block;
		width: 14px;
		height: 14px;
		border: 2px solid var(--color-background);
		border-top-color: transparent;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.error-state {
		color: var(--color-error);
		padding: var(--spacing-md);
		background-color: color-mix(in srgb, var(--color-error) 10%, transparent);
		border-radius: var(--radius-md);
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--spacing-2xl) var(--spacing-md);
		text-align: center;
		color: var(--color-text-secondary);
		background-color: var(--color-surface);
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-lg);
	}

	.empty-icon {
		font-size: 2.5rem;
		margin-bottom: var(--spacing-sm);
	}

	.empty-hint {
		font-size: 0.8rem;
		margin-top: var(--spacing-xs);
	}

	/* Content list */
	.content-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.content-card {
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.card-meta {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
	}

	.platform-badge,
	.type-badge {
		font-size: 0.75rem;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: 999px;
		background-color: var(--color-border);
		color: var(--color-text);
	}

	.status-badge {
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.date-label {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		margin-left: auto;
	}

	.card-title {
		font-size: 1rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0;
	}

	.card-body {
		font-size: 0.85rem;
		color: var(--color-text-secondary);
		margin: 0;
		line-height: 1.5;
	}

	.card-error {
		font-size: 0.8rem;
		color: var(--color-error);
		margin: 0;
	}

	.card-actions {
		display: flex;
		gap: var(--spacing-xs);
		flex-wrap: wrap;
		margin-top: var(--spacing-xs);
	}

	.action-btn {
		padding: 6px 14px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		background-color: var(--color-background);
		color: var(--color-text);
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		transition: all var(--transition-fast);
	}

	.action-btn:hover:not(:disabled) {
		background-color: var(--color-border);
	}

	.action-btn.publish {
		background-color: var(--color-primary);
		color: var(--color-background);
		border-color: var(--color-primary);
	}

	.action-btn.publish:hover:not(:disabled) {
		background-color: var(--color-primary-hover);
	}

	.action-btn.publish:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.action-btn.external {
		color: var(--color-primary);
	}

	/* Modal */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background-color: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		padding: var(--spacing-md);
	}

	.modal {
		background-color: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
		max-width: 640px;
		width: 100%;
		max-height: 80vh;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.modal-platform {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text-secondary);
	}

	.modal-close {
		background: none;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
		color: var(--color-text-secondary);
		padding: 0;
		line-height: 1;
	}

	.modal-title {
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0;
	}

	.modal-body {
		font-size: 0.85rem;
		color: var(--color-text);
		white-space: pre-wrap;
		word-break: break-word;
		line-height: 1.6;
		margin: 0;
		font-family: inherit;
		background-color: var(--color-surface);
		border-radius: var(--radius-md);
		padding: var(--spacing-md);
	}

	@media (max-width: 600px) {
		.page-header {
			flex-direction: column;
		}
	}
</style>
