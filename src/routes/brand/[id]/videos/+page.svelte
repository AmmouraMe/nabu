<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	interface VideoItem {
		id: string;
		title: string | null;
		body: string | null;
		platform: string;
		status: string;
		created_at: string;
		external_url: string | null;
		error_message: string | null;
	}

	let videos: VideoItem[] = data.videos as VideoItem[];
	let prompt = '';
	let platform = 'generic';
	let aspectRatio = '16:9';
	let durationSeconds = 5;

	let generating = false;
	let generateError: string | null = null;
	let pendingItems: { itemId: string; operationName: string | null; prompt: string }[] = [];

	const PLATFORM_OPTIONS = [
		{ value: 'youtube', label: 'YouTube' },
		{ value: 'tiktok', label: 'TikTok' },
		{ value: 'generic', label: 'Generic / Download' }
	];

	const ASPECT_OPTIONS = [
		{ value: '16:9', label: '16:9 Landscape' },
		{ value: '9:16', label: '9:16 Portrait' },
		{ value: '1:1', label: '1:1 Square' }
	];

	async function generateVideoItem() {
		if (!prompt.trim() || !data.brandId || generating) return;
		generating = true;
		generateError = null;
		try {
			const res = await fetch('/api/video/veo3/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					brandId: data.brandId,
					prompt: prompt.trim(),
					platform,
					aspectRatio,
					durationSeconds
				})
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error((err as { message?: string }).message ?? 'Generation failed');
			}
			const result = (await res.json()) as {
				itemId: string;
				operationName: string | null;
				videoUrl: string | null;
				status: string;
			};
			if (result.status === 'pending' && result.operationName) {
				pendingItems = [
					...pendingItems,
					{ itemId: result.itemId, operationName: result.operationName, prompt: prompt.trim() }
				];
			} else if (result.status === 'complete' && result.videoUrl) {
				videos = [
					{
						id: result.itemId,
						title: prompt.slice(0, 80),
						body: result.videoUrl,
						platform,
						status: 'published',
						created_at: new Date().toISOString(),
						external_url: result.videoUrl,
						error_message: null
					},
					...videos
				];
			}
			prompt = '';
		} catch (err) {
			generateError = err instanceof Error ? err.message : 'Generation failed';
		} finally {
			generating = false;
		}
	}

	async function pollStatus(itemId: string, operationName: string) {
		const params = new URLSearchParams({ operationName, itemId });
		const res = await fetch(`/api/video/veo3/status?${params}`);
		if (!res.ok) return null;
		return res.json() as Promise<{ done: boolean; videoUrl: string | null; error: string | null }>;
	}

	async function checkPending(item: (typeof pendingItems)[0]) {
		const result = await pollStatus(item.itemId, item.operationName ?? '');
		if (!result) return;
		if (result.done) {
			pendingItems = pendingItems.filter((p) => p.itemId !== item.itemId);
			if (result.videoUrl) {
				videos = [
					{
						id: item.itemId,
						title: item.prompt.slice(0, 80),
						body: result.videoUrl,
						platform,
						status: 'published',
						created_at: new Date().toISOString(),
						external_url: result.videoUrl,
						error_message: null
					},
					...videos
				];
			}
		}
	}

	function formatDate(dateStr: string): string {
		const d = new Date(dateStr);
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function isVideoUrl(url: string | null): boolean {
		if (!url) return false;
		return url.startsWith('http') && (url.includes('.mp4') || url.includes('googleapis') || url.includes('storage'));
	}

	function getStatusClass(status: string): string {
		if (status === 'published') return 'status-published';
		if (status === 'failed') return 'status-failed';
		return 'status-draft';
	}
</script>

<svelte:head>
	<title>Videos — {data.brandName} | Nabu</title>
</svelte:head>

<div class="videos-page">
	<header class="page-header">
		<div class="header-left">
			<a href="/brand/{data.brandProfileId}/content" class="back-link">← Content Calendar</a>
			<h1 class="page-title">Video Generation</h1>
			<p class="page-subtitle">Generate short-form videos with Google Veo 3</p>
		</div>
		{#if !data.googleConnected}
			<a href="/brand/{data.brandProfileId}/connect" class="setup-cta">
				Connect Google AI Key to generate videos
			</a>
		{/if}
	</header>

	<!-- Generate form -->
	<div class="generate-card">
		<h2 class="section-title">New Video</h2>
		<div class="generate-form">
			<label class="form-label">
				Video Prompt
				<textarea
					bind:value={prompt}
					rows="3"
					placeholder="Describe the video you want to generate…"
					class="form-textarea"
				></textarea>
			</label>

			<div class="form-row">
				<label class="form-label narrow">
					Platform
					<select bind:value={platform} class="form-select">
						{#each PLATFORM_OPTIONS as opt}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
				</label>

				<label class="form-label narrow">
					Aspect Ratio
					<select bind:value={aspectRatio} class="form-select">
						{#each ASPECT_OPTIONS as opt}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
				</label>

				<label class="form-label narrow">
					Duration (s)
					<input
						type="number"
						bind:value={durationSeconds}
						min="5"
						max="30"
						step="5"
						class="form-input"
					/>
				</label>
			</div>

			{#if generateError}
				<p class="field-error">{generateError}</p>
			{/if}

			<button
				class="generate-btn"
				on:click={generateVideoItem}
				disabled={!prompt.trim() || !data.brandId || !data.googleConnected || generating}
			>
				{#if generating}
					Generating…
				{:else if !data.googleConnected}
					Google AI Not Connected
				{:else}
					Generate Video
				{/if}
			</button>
		</div>
	</div>

	<!-- Pending operations -->
	{#if pendingItems.length > 0}
		<div class="pending-section">
			<h2 class="section-title">In Progress</h2>
			{#each pendingItems as item}
				<div class="pending-card">
					<span class="pending-label">{item.prompt.slice(0, 80)}</span>
					<span class="pending-badge">Processing…</span>
					<button class="poll-btn" on:click={() => checkPending(item)}>Check Status</button>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Video list -->
	<div class="videos-section">
		<h2 class="section-title">Generated Videos ({videos.length})</h2>

		{#if videos.length === 0}
			<p class="empty-state">No videos yet. Generate your first one above.</p>
		{:else}
			<div class="video-grid">
				{#each videos as video}
					<div class="video-card">
						<div class="video-preview">
							{#if isVideoUrl(video.external_url)}
								<!-- svelte-ignore a11y-media-has-caption -->
								<video src={video.external_url} controls class="video-player"></video>
							{:else}
								<div class="video-placeholder">
									<span class="placeholder-icon">&#x1F3A5;</span>
								</div>
							{/if}
						</div>
						<div class="video-info">
							<p class="video-title">{video.title ?? 'Untitled'}</p>
							<div class="video-meta">
								<span class="platform-badge">{video.platform}</span>
								<span class="status-chip {getStatusClass(video.status)}">{video.status}</span>
								<span class="video-date">{formatDate(video.created_at)}</span>
							</div>
							{#if video.error_message}
								<p class="video-error">{video.error_message}</p>
							{/if}
							{#if video.external_url && isVideoUrl(video.external_url)}
								<a href={video.external_url} target="_blank" rel="noopener" class="download-link">
									Download / View
								</a>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.videos-page {
		max-width: 960px;
		margin: 0 auto;
		padding: var(--spacing-lg) var(--spacing-md);
		min-height: calc(100vh - 60px);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xl, 2rem);
	}

	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--spacing-md);
		flex-wrap: wrap;
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

	.page-subtitle {
		color: var(--color-text-secondary);
		font-size: 0.9rem;
		margin: 0;
	}

	.setup-cta {
		display: inline-block;
		padding: var(--spacing-sm) var(--spacing-md);
		background-color: color-mix(in srgb, var(--color-warning, #f59e0b) 15%, transparent);
		border: 1px solid var(--color-warning, #f59e0b);
		border-radius: var(--radius-md);
		color: var(--color-warning, #f59e0b);
		text-decoration: none;
		font-size: 0.8rem;
		font-weight: 600;
		white-space: nowrap;
	}

	.generate-card {
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
	}

	.section-title {
		font-size: 1rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0 0 var(--spacing-md);
	}

	.generate-form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.form-label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text-secondary);
	}

	.form-label.narrow {
		flex: 1;
		min-width: 120px;
	}

	.form-textarea,
	.form-input,
	.form-select {
		background-color: var(--color-background);
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: var(--spacing-sm);
		font-size: 0.85rem;
		font-family: inherit;
	}

	.form-textarea {
		resize: vertical;
	}

	.form-textarea:focus,
	.form-input:focus,
	.form-select:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.form-row {
		display: flex;
		gap: var(--spacing-md);
		flex-wrap: wrap;
	}

	.field-error {
		font-size: 0.8rem;
		color: var(--color-error);
		margin: 0;
	}

	.generate-btn {
		padding: var(--spacing-sm) var(--spacing-lg);
		background-color: var(--color-primary);
		color: var(--color-background);
		border: none;
		border-radius: var(--radius-md);
		font-weight: 700;
		font-size: 0.85rem;
		cursor: pointer;
		align-self: flex-start;
	}

	.generate-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.generate-btn:not(:disabled):hover {
		background-color: var(--color-primary-hover);
	}

	.pending-section {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.pending-card {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		padding: var(--spacing-md);
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.pending-label {
		flex: 1;
		font-size: 0.85rem;
		color: var(--color-text);
	}

	.pending-badge {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}

	.poll-btn {
		padding: 4px 12px;
		background: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		cursor: pointer;
	}

	.poll-btn:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.videos-section {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.empty-state {
		text-align: center;
		color: var(--color-text-secondary);
		font-size: 0.9rem;
		padding: var(--spacing-xl, 2rem);
	}

	.video-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--spacing-md);
	}

	@media (min-width: 640px) {
		.video-grid {
			grid-template-columns: 1fr 1fr;
		}
	}

	@media (min-width: 900px) {
		.video-grid {
			grid-template-columns: 1fr 1fr 1fr;
		}
	}

	.video-card {
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.video-preview {
		background-color: var(--color-background);
		aspect-ratio: 16 / 9;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.video-player {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.video-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
	}

	.placeholder-icon {
		font-size: 2.5rem;
		opacity: 0.3;
	}

	.video-info {
		padding: var(--spacing-md);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.video-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.video-meta {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		flex-wrap: wrap;
	}

	.platform-badge {
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 2px 8px;
		border-radius: 999px;
		background-color: var(--color-border);
		color: var(--color-text-secondary);
	}

	.status-chip {
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 2px 8px;
		border-radius: 999px;
	}

	.status-published {
		background-color: color-mix(in srgb, var(--color-success, #22c55e) 20%, transparent);
		color: var(--color-success, #22c55e);
	}

	.status-failed {
		background-color: color-mix(in srgb, var(--color-error) 20%, transparent);
		color: var(--color-error);
	}

	.status-draft {
		background-color: var(--color-border);
		color: var(--color-text-secondary);
	}

	.video-date {
		font-size: 0.7rem;
		color: var(--color-text-secondary);
		margin-left: auto;
	}

	.video-error {
		font-size: 0.75rem;
		color: var(--color-error);
		margin: 0;
	}

	.download-link {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-primary);
		text-decoration: none;
		align-self: flex-start;
	}

	.download-link:hover {
		text-decoration: underline;
	}
</style>
