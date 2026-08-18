<script lang="ts">
	/**
	 * FileArchive - Browse and manage all files from AI conversations.
	 * Shows uploads and AI-generated content organized by smart folders.
	 */
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { formatFileSize } from '$lib/utils/attachments';

	export let brandProfileId: string;

	interface ArchiveFile {
		id: string;
		brandProfileId: string;
		userId: string;
		fileName: string;
		mimeType: string;
		fileSize: number;
		r2Key: string;
		fileType: 'image' | 'video' | 'audio' | 'document';
		source: 'user_upload' | 'ai_generated' | 'ai_referenced';
		context: 'onboarding' | 'chat' | 'brand_assets';
		folder: string;
		tags: string[];
		description?: string;
		isStarred: boolean;
		aiPrompt?: string;
		aiModel?: string;
		createdAt: string;
		url: string;
	}

	interface FolderInfo {
		path: string;
		name: string;
		fileCount: number;
	}

	interface ArchiveStats {
		totalFiles: number;
		totalSize: number;
		byType: Record<string, number>;
		bySource: Record<string, number>;
		byContext: Record<string, number>;
	}

	let files: ArchiveFile[] = [];
	let folders: FolderInfo[] = [];
	let stats: ArchiveStats | null = null;
	let total = 0;
	let loading = true;
	let error: string | null = null;

	// Filters
	let activeFolder: string | null = null;
	let activeType: string | null = null;
	let activeSource: string | null = null;
	let searchQuery = '';
	let showStarredOnly = false;
	let viewMode: 'grid' | 'list' = 'grid';
	let selectedFile: ArchiveFile | null = null;

	onMount(async () => {
		await Promise.all([loadFiles(), loadFolders(), loadStats()]);
	});

	async function loadFiles() {
		loading = true;
		error = null;

		try {
			const params = new URLSearchParams({ brandProfileId });
			if (activeType) params.set('fileType', activeType);
			if (activeSource) params.set('source', activeSource);
			if (activeFolder) params.set('folder', activeFolder);
			if (searchQuery) params.set('search', searchQuery);
			if (showStarredOnly) params.set('starred', 'true');

			const res = await fetch(`/api/archive?${params}`);
			if (!res.ok) throw new Error('Failed to load files');

			const data = await res.json();
			files = data.files;
			total = data.total;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load archive';
		} finally {
			loading = false;
		}
	}

	async function loadFolders() {
		try {
			const res = await fetch(`/api/archive?brandProfileId=${brandProfileId}&action=folders`);
			if (res.ok) {
				const data = await res.json();
				folders = data.folders;
			}
		} catch {
			/* non-critical */
		}
	}

	async function loadStats() {
		try {
			const res = await fetch(`/api/archive?brandProfileId=${brandProfileId}&action=stats`);
			if (res.ok) {
				const data = await res.json();
				stats = data.stats;
			}
		} catch {
			/* non-critical */
		}
	}

	async function toggleStar(file: ArchiveFile) {
		try {
			const res = await fetch('/api/archive', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: file.id, action: 'star' })
			});
			if (res.ok) {
				const data = await res.json();
				files = files.map((f) => (f.id === file.id ? { ...f, isStarred: data.isStarred } : f));
			}
		} catch {
			/* non-critical */
		}
	}

	async function deleteFile(file: ArchiveFile) {
		if (!confirm(`Delete "${file.fileName}"? This cannot be undone.`)) return;

		try {
			const res = await fetch(`/api/archive?id=${file.id}`, { method: 'DELETE' });
			if (res.ok) {
				files = files.filter((f) => f.id !== file.id);
				total--;
				if (selectedFile?.id === file.id) selectedFile = null;
				await loadStats();
				await loadFolders();
			}
		} catch {
			/* non-critical */
		}
	}

	function setFolder(path: string | null) {
		activeFolder = path;
		loadFiles();
	}

	function setType(type: string | null) {
		activeType = type;
		loadFiles();
	}

	function setSource(source: string | null) {
		activeSource = source;
		loadFiles();
	}

	function handleSearch() {
		loadFiles();
	}

	function toggleStarredFilter() {
		showStarredOnly = !showStarredOnly;
		loadFiles();
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

	function sourceLabel(source: string): string {
		switch (source) {
			case 'user_upload':
				return 'Uploaded';
			case 'ai_generated':
				return 'AI Generated';
			case 'ai_referenced':
				return 'AI Referenced';
			default:
				return source;
		}
	}

	function contextLabel(context: string): string {
		switch (context) {
			case 'onboarding':
				return 'Brand Architect';
			case 'chat':
				return 'Chat';
			case 'brand_assets':
				return 'Brand Assets';
			default:
				return context;
		}
	}

	function fileTypeIcon(type: string): string {
		switch (type) {
			case 'image':
				return '🖼️';
			case 'video':
				return '🎬';
			case 'audio':
				return '🎵';
			case 'document':
				return '📄';
			default:
				return '📎';
		}
	}
</script>

<div class="archive-container">
	<!-- Header -->
	<div class="archive-header">
		<div class="header-left">
			<h2>📁 File Archive</h2>
			{#if stats}
				<span class="stats-summary">
					{stats.totalFiles} files · {formatFileSize(stats.totalSize)}
				</span>
			{/if}
		</div>
		<div class="header-right">
			<div class="search-box">
				<input
					type="text"
					bind:value={searchQuery}
					on:keydown={(e) => e.key === 'Enter' && handleSearch()}
					placeholder="Search files..."
					aria-label="Search archive"
				/>
				<button on:click={handleSearch} aria-label="Search">🔍</button>
			</div>
			<button
				class="view-toggle"
				on:click={() => (viewMode = viewMode === 'grid' ? 'list' : 'grid')}
				title="Toggle view"
			>
				{viewMode === 'grid' ? '☰' : '▦'}
			</button>
		</div>
	</div>

	<div class="archive-body">
		<!-- Sidebar: Folders + Filters -->
		<aside class="archive-sidebar">
			<!-- Folder tree -->
			<div class="sidebar-section">
				<h3>Folders</h3>
				<button class="folder-item" class:active={!activeFolder} on:click={() => setFolder(null)}>
					📁 All Files
					<span class="folder-count">{total}</span>
				</button>
				{#each folders as folder}
					<button
						class="folder-item"
						class:active={activeFolder === folder.path}
						on:click={() => setFolder(folder.path)}
					>
						📂 {folder.name}
						<span class="folder-count">{folder.fileCount}</span>
					</button>
				{/each}
			</div>

			<!-- Type filter -->
			<div class="sidebar-section">
				<h3>Type</h3>
				{#each [['image', '🖼️ Images'], ['video', '🎬 Videos'], ['audio', '🎵 Audio']] as [type, label]}
					<button
						class="filter-item"
						class:active={activeType === type}
						on:click={() => setType(activeType === type ? null : type)}
					>
						{label}
						{#if stats?.byType[type]}
							<span class="filter-count">{stats.byType[type]}</span>
						{/if}
					</button>
				{/each}
			</div>

			<!-- Source filter -->
			<div class="sidebar-section">
				<h3>Source</h3>
				{#each [['user_upload', '📤 Uploaded'], ['ai_generated', '🤖 AI Generated']] as [source, label]}
					<button
						class="filter-item"
						class:active={activeSource === source}
						on:click={() => setSource(activeSource === source ? null : source)}
					>
						{label}
						{#if stats?.bySource[source]}
							<span class="filter-count">{stats.bySource[source]}</span>
						{/if}
					</button>
				{/each}
			</div>

			<!-- Starred -->
			<div class="sidebar-section">
				<button class="filter-item" class:active={showStarredOnly} on:click={toggleStarredFilter}>
					⭐ Starred
				</button>
			</div>
		</aside>

		<!-- Main content area -->
		<main class="archive-main">
			{#if loading}
				<div class="loading-state">
					<div class="spinner"></div>
					<p>Loading archive...</p>
				</div>
			{:else if error}
				<div class="error-state">
					<p>⚠️ {error}</p>
					<button on:click={loadFiles}>Retry</button>
				</div>
			{:else if files.length === 0}
				<div class="empty-state">
					<span class="empty-icon">📂</span>
					<p>No files found</p>
					<span class="empty-hint"
						>Files from your Brand Architect conversations will appear here</span
					>
				</div>
			{:else}
				<div class="file-{viewMode}">
					{#each files as file (file.id)}
						<button
							class="file-card"
							class:selected={selectedFile?.id === file.id}
							on:click={() => (selectedFile = selectedFile?.id === file.id ? null : file)}
							in:fade={{ duration: 200 }}
						>
							<div class="file-preview">
								{#if file.fileType === 'image'}
									<img src={file.url} alt={file.fileName} loading="lazy" />
								{:else}
									<span class="file-type-icon">{fileTypeIcon(file.fileType)}</span>
								{/if}
							</div>
							<div class="file-info">
								<span class="file-name" title={file.fileName}>{file.fileName}</span>
								<div class="file-meta">
									<span class="file-source" class:ai={file.source === 'ai_generated'}>
										{sourceLabel(file.source)}
									</span>
									<span class="file-size">{formatFileSize(file.fileSize)}</span>
								</div>
								<span class="file-date">{formatDate(file.createdAt)}</span>
							</div>
							<button
								class="star-btn"
								class:starred={file.isStarred}
								on:click|stopPropagation={() => toggleStar(file)}
								title={file.isStarred ? 'Unstar' : 'Star'}
							>
								{file.isStarred ? '⭐' : '☆'}
							</button>
						</button>
					{/each}
				</div>
			{/if}
		</main>

		<!-- Detail panel (when file is selected) -->
		{#if selectedFile}
			<aside class="detail-panel" transition:fly={{ x: 20, duration: 200 }}>
				<div class="detail-header">
					<h3>{selectedFile.fileName}</h3>
					<button class="close-detail" on:click={() => (selectedFile = null)}>✕</button>
				</div>

				<div class="detail-preview">
					{#if selectedFile.fileType === 'image'}
						<img src={selectedFile.url} alt={selectedFile.fileName} />
					{:else if selectedFile.fileType === 'video'}
						<!-- svelte-ignore a11y-media-has-caption -->
						<video src={selectedFile.url} controls preload="metadata"></video>
					{:else if selectedFile.fileType === 'audio'}
						<!-- svelte-ignore a11y-media-has-caption -->
						<audio src={selectedFile.url} controls preload="metadata"></audio>
					{/if}
				</div>

				<div class="detail-info">
					<div class="detail-row">
						<span class="detail-label">Type</span>
						<span>{fileTypeIcon(selectedFile.fileType)} {selectedFile.fileType}</span>
					</div>
					<div class="detail-row">
						<span class="detail-label">Size</span>
						<span>{formatFileSize(selectedFile.fileSize)}</span>
					</div>
					<div class="detail-row">
						<span class="detail-label">Source</span>
						<span>{sourceLabel(selectedFile.source)}</span>
					</div>
					<div class="detail-row">
						<span class="detail-label">Context</span>
						<span>{contextLabel(selectedFile.context)}</span>
					</div>
					<div class="detail-row">
						<span class="detail-label">Folder</span>
						<span>{selectedFile.folder}</span>
					</div>
					<div class="detail-row">
						<span class="detail-label">Created</span>
						<span>{formatDate(selectedFile.createdAt)}</span>
					</div>
					{#if selectedFile.aiPrompt}
						<div class="detail-row vertical">
							<span class="detail-label">AI Prompt</span>
							<span class="detail-prompt">{selectedFile.aiPrompt}</span>
						</div>
					{/if}
					{#if selectedFile.aiModel}
						<div class="detail-row">
							<span class="detail-label">AI Model</span>
							<span>{selectedFile.aiModel}</span>
						</div>
					{/if}
					{#if selectedFile.tags.length > 0}
						<div class="detail-row vertical">
							<span class="detail-label">Tags</span>
							<div class="tag-list">
								{#each selectedFile.tags as tag}
									<span class="tag">{tag}</span>
								{/each}
							</div>
						</div>
					{/if}
				</div>

				<div class="detail-actions">
					<a href={selectedFile.url} download={selectedFile.fileName} class="action-btn primary">
						⬇️ Download
					</a>
					<button
						class="action-btn danger"
						on:click={() => selectedFile && deleteFile(selectedFile)}
					>
						🗑️ Delete
					</button>
				</div>
			</aside>
		{/if}
	</div>
</div>

<style>
	.archive-container {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
		background-color: var(--color-background);
	}

	/* Header */
	.archive-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-md) var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
		flex-wrap: wrap;
		gap: var(--spacing-sm);
	}

	.header-left {
		display: flex;
		align-items: baseline;
		gap: var(--spacing-sm);
	}

	.header-left h2 {
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.stats-summary {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.search-box {
		display: flex;
		align-items: center;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.search-box input {
		border: none;
		outline: none;
		background: none;
		color: var(--color-text);
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: 0.8rem;
		width: 180px;
	}

	.search-box input::placeholder {
		color: var(--color-text-secondary);
	}

	.search-box button {
		background: none;
		border: none;
		padding: var(--spacing-xs);
		cursor: pointer;
		font-size: 0.85rem;
	}

	.view-toggle {
		background: none;
		border: 1px solid var(--color-border);
		color: var(--color-text-secondary);
		width: 32px;
		height: 32px;
		border-radius: var(--radius-md);
		cursor: pointer;
		font-size: 1rem;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all var(--transition-fast);
	}

	.view-toggle:hover {
		border-color: var(--color-text-secondary);
		color: var(--color-text);
	}

	/* Body layout */
	.archive-body {
		display: flex;
		flex: 1;
		overflow: hidden;
	}

	/* Sidebar */
	.archive-sidebar {
		width: 200px;
		border-right: 1px solid var(--color-border);
		padding: var(--spacing-md) var(--spacing-sm);
		overflow-y: auto;
		flex-shrink: 0;
	}

	.sidebar-section {
		margin-bottom: var(--spacing-md);
	}

	.sidebar-section h3 {
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: var(--spacing-xs);
		padding: 0 var(--spacing-xs);
	}

	.folder-item,
	.filter-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: var(--spacing-xs) var(--spacing-sm);
		background: none;
		border: none;
		border-radius: var(--radius-md);
		cursor: pointer;
		font-size: 0.78rem;
		color: var(--color-text);
		text-align: left;
		transition: all var(--transition-fast);
	}

	.folder-item:hover,
	.filter-item:hover {
		background-color: var(--color-surface);
	}

	.folder-item.active,
	.filter-item.active {
		background-color: color-mix(in srgb, var(--color-primary) 10%, transparent);
		color: var(--color-primary);
	}

	.folder-count,
	.filter-count {
		font-size: 0.65rem;
		color: var(--color-text-secondary);
		background-color: var(--color-surface);
		padding: 1px 6px;
		border-radius: 999px;
	}

	/* Main content */
	.archive-main {
		flex: 1;
		overflow-y: auto;
		padding: var(--spacing-md);
	}

	.loading-state,
	.error-state,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 200px;
		gap: var(--spacing-sm);
		color: var(--color-text-secondary);
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

	.empty-icon {
		font-size: 2.5rem;
	}

	.empty-hint {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	/* Grid view */
	.file-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: var(--spacing-sm);
	}

	/* List view */
	.file-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.file-list .file-card {
		flex-direction: row;
		align-items: center;
	}

	.file-list .file-preview {
		width: 40px;
		height: 40px;
		flex-shrink: 0;
	}

	.file-list .file-info {
		flex-direction: row;
		align-items: center;
		gap: var(--spacing-md);
	}

	.file-card {
		display: flex;
		flex-direction: column;
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: all var(--transition-fast);
		overflow: hidden;
		position: relative;
		text-align: left;
	}

	.file-card:hover {
		border-color: var(--color-primary);
		transform: translateY(-1px);
	}

	.file-card.selected {
		border-color: var(--color-primary);
		box-shadow: 0 0 0 1px var(--color-primary);
	}

	.file-preview {
		width: 100%;
		height: 120px;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: var(--color-background);
		overflow: hidden;
	}

	.file-preview img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.file-type-icon {
		font-size: 2.5rem;
	}

	.file-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--spacing-xs) var(--spacing-sm);
		min-width: 0;
	}

	.file-name {
		font-size: 0.78rem;
		font-weight: 500;
		color: var(--color-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.file-meta {
		display: flex;
		gap: var(--spacing-xs);
		align-items: center;
	}

	.file-source {
		font-size: 0.65rem;
		padding: 1px 4px;
		border-radius: var(--radius-sm);
		background-color: var(--color-background);
		color: var(--color-text-secondary);
	}

	.file-source.ai {
		background-color: color-mix(in srgb, var(--color-primary) 10%, transparent);
		color: var(--color-primary);
	}

	.file-size {
		font-size: 0.65rem;
		color: var(--color-text-secondary);
	}

	.file-date {
		font-size: 0.65rem;
		color: var(--color-text-secondary);
	}

	.star-btn {
		position: absolute;
		top: var(--spacing-xs);
		right: var(--spacing-xs);
		background: none;
		border: none;
		cursor: pointer;
		font-size: 0.9rem;
		opacity: 0.4;
		transition: opacity var(--transition-fast);
	}

	.star-btn:hover,
	.star-btn.starred {
		opacity: 1;
	}

	/* Detail panel */
	.detail-panel {
		width: 280px;
		border-left: 1px solid var(--color-border);
		padding: var(--spacing-md);
		overflow-y: auto;
		flex-shrink: 0;
	}

	.detail-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: var(--spacing-md);
	}

	.detail-header h3 {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
		word-break: break-word;
	}

	.close-detail {
		background: none;
		border: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		font-size: 1rem;
		padding: 0;
	}

	.detail-preview {
		margin-bottom: var(--spacing-md);
	}

	.detail-preview img {
		width: 100%;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
	}

	.detail-preview video,
	.detail-preview audio {
		width: 100%;
		border-radius: var(--radius-md);
	}

	.detail-info {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
		margin-bottom: var(--spacing-md);
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.78rem;
	}

	.detail-row.vertical {
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
	}

	.detail-label {
		color: var(--color-text-secondary);
		font-size: 0.7rem;
		font-weight: 500;
	}

	.detail-prompt {
		font-size: 0.75rem;
		color: var(--color-text);
		background-color: var(--color-surface);
		padding: var(--spacing-xs);
		border-radius: var(--radius-sm);
		line-height: 1.4;
	}

	.tag-list {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.tag {
		font-size: 0.65rem;
		background-color: var(--color-surface);
		color: var(--color-text-secondary);
		padding: 1px 6px;
		border-radius: 999px;
		border: 1px solid var(--color-border);
	}

	.detail-actions {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) var(--spacing-sm);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: none;
		color: var(--color-text);
		font-size: 0.78rem;
		cursor: pointer;
		text-decoration: none;
		transition: all var(--transition-fast);
	}

	.action-btn:hover {
		background-color: var(--color-surface);
	}

	.action-btn.primary {
		background-color: var(--color-primary);
		color: var(--color-background);
		border-color: var(--color-primary);
	}

	.action-btn.primary:hover {
		background-color: var(--color-primary-hover);
	}

	.action-btn.danger:hover {
		border-color: var(--color-error);
		color: var(--color-error);
	}

	/* Responsive */
	@media (max-width: 768px) {
		.archive-sidebar {
			display: none;
		}

		.detail-panel {
			position: fixed;
			right: 0;
			top: 0;
			bottom: 0;
			width: 90%;
			max-width: 320px;
			z-index: 100;
			background-color: var(--color-background);
			box-shadow: -4px 0 20px rgba(0, 0, 0, 0.2);
		}

		.file-grid {
			grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		}
	}
</style>
