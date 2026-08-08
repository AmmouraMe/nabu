<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fade } from 'svelte/transition';
	import VideoCreateForm from '$lib/components/VideoCreateForm.svelte';
	import ScheduleManager from '$lib/components/ScheduleManager.svelte';

	interface VideoItem {
		id: string;
		prompt: string;
		provider: string;
		providerJobId: string | null;
		model: string;
		status: string;
		videoUrl: string | null;
		thumbnailUrl: string | null;
		r2Key: string | null;
		duration: number | null;
		aspectRatio: string | null;
		resolution: string | null;
		cost: number | null;
		error: string | null;
		createdAt: string;
		completedAt: string | null;
		conversationId: string | null;
		messageId: string | null;
	}

	interface VideoModel {
		id: string;
		displayName: string;
		provider: string;
		maxDuration?: number;
		supportedDurations?: number[];
		pricing?: {
			estimatedCostPerSecond?: number;
			estimatedCostPerGeneration?: number;
			currency: string;
		};
	}

	interface Schedule {
		id: string;
		name: string;
		prompt: string;
		provider: string;
		model: string;
		aspectRatio: string;
		frequency: string;
		enabled: boolean;
		totalRuns: number;
		maxRuns: number | null;
		nextRunAt: string | null;
		lastRunAt: string | null;
		createdAt: string;
	}

	let videos: VideoItem[] = [];
	let models: VideoModel[] = [];
	let schedules: Schedule[] = [];
	let loading = true;
	let errorMessage = '';
	let total = 0;
	let offset = 0;
	const limit = 20;
	let filter: string | null = null;
	let activeTab: 'gallery' | 'create' | 'schedules' = 'gallery';
	let createFormRef: VideoCreateForm;
	let selectedVideo: VideoItem | null = null;

	// Live progress tracking via SSE
	let progressMap: Record<string, number> = {};
	let elapsedMap: Record<string, number> = {};
	let activeStreams: Record<string, EventSource> = {};
	let elapsedTimers: Record<string, ReturnType<typeof setInterval>> = {};

	function connectVideoStream(videoId: string) {
		// Don't reconnect if already streaming
		if (activeStreams[videoId]) return;

		const es = new EventSource(`/api/video/${videoId}/stream`);
		activeStreams[videoId] = es;

		// Track elapsed time since connection
		const startTime = Date.now();
		elapsedMap[videoId] = 0;
		elapsedTimers[videoId] = setInterval(() => {
			elapsedMap[videoId] = Math.floor((Date.now() - startTime) / 1000);
			elapsedMap = elapsedMap; // trigger reactivity
		}, 1000);

		es.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				progressMap[videoId] = data.progress || 0;
				progressMap = progressMap; // trigger reactivity

				if (data.status === 'complete' || data.status === 'error') {
					// Reload from API to get the final R2-backed URL
					refreshVideo(videoId);
					disconnectVideoStream(videoId);
				}
			} catch {
				// Ignore parse errors
			}
		};

		es.onerror = () => {
			disconnectVideoStream(videoId);
		};
	}

	function disconnectVideoStream(videoId: string) {
		if (activeStreams[videoId]) {
			activeStreams[videoId].close();
			delete activeStreams[videoId];
			activeStreams = activeStreams;
		}
		if (elapsedTimers[videoId]) {
			clearInterval(elapsedTimers[videoId]);
			delete elapsedTimers[videoId];
		}
	}

	function disconnectAllStreams() {
		for (const id of Object.keys(activeStreams)) {
			disconnectVideoStream(id);
		}
	}

	function connectActiveVideos() {
		for (const video of videos) {
			if (video.status === 'pending' || video.status === 'generating') {
				connectVideoStream(video.id);
			}
		}
	}

	/** Reload a single video from the API after SSE reports completion */
	async function refreshVideo(videoId: string) {
		try {
			const res = await fetch(`/api/video/${videoId}`);
			if (!res.ok) return;
			const updated: VideoItem = await res.json();
			videos = videos.map((v) => (v.id === videoId ? updated : v));
			if (selectedVideo?.id === videoId) {
				selectedVideo = updated;
			}
		} catch {
			// Fallback: just reload all
			await loadVideos();
		}
	}

	function formatElapsed(seconds: number): string {
		if (seconds < 60) return `${seconds}s`;
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}m ${secs}s`;
	}

	/** Resolve the playable/downloadable URL for a video, preferring R2 */
	function getVideoSrc(video: VideoItem): string | null {
		if (video.r2Key) return `/api/video/file/${video.r2Key}`;
		return video.videoUrl;
	}

	function openVideoDetail(video: VideoItem) {
		selectedVideo = video;
	}

	function closeVideoDetail() {
		selectedVideo = null;
	}

	function handleDetailKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closeVideoDetail();
	}

	function getStatusLabel(status: string): string {
		switch (status) {
			case 'complete':
				return 'Completed';
			case 'error':
				return 'Failed';
			case 'generating':
				return 'Generating';
			case 'processing':
				return 'Processing';
			case 'queued':
				return 'Queued';
			case 'pending':
				return 'Pending';
			default:
				return status;
		}
	}

	function getStatusClass(status: string): string {
		switch (status) {
			case 'complete':
				return 'status-complete';
			case 'error':
				return 'status-error';
			case 'generating':
			case 'processing':
			case 'queued':
			case 'pending':
				return 'status-processing';
			default:
				return '';
		}
	}

	function formatFullDate(dateStr: string): string {
		return new Date(dateStr).toLocaleString(undefined, {
			weekday: 'short',
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	function formatRelativeTime(dateStr: string): string {
		const now = Date.now();
		const then = new Date(dateStr).getTime();
		const diffMs = now - then;
		const diffSec = Math.floor(diffMs / 1000);
		if (diffSec < 60) return `${diffSec}s ago`;
		const diffMin = Math.floor(diffSec / 60);
		if (diffMin < 60) return `${diffMin}m ago`;
		const diffHr = Math.floor(diffMin / 60);
		if (diffHr < 24) return `${diffHr}h ago`;
		const diffDay = Math.floor(diffHr / 24);
		return `${diffDay}d ago`;
	}

	function computeDurationBetween(start: string, end: string): string {
		const ms = new Date(end).getTime() - new Date(start).getTime();
		if (ms < 1000) return `${ms}ms`;
		const secs = Math.floor(ms / 1000);
		if (secs < 60) return `${secs}s`;
		const mins = Math.floor(secs / 60);
		const remSecs = secs % 60;
		return `${mins}m ${remSecs}s`;
	}

	async function loadVideos(append = false) {
		try {
			const params = new URLSearchParams({
				limit: limit.toString(),
				offset: (append ? offset : 0).toString()
			});
			if (filter) params.set('status', filter);

			const res = await fetch(`/api/video?${params}`);
			if (!res.ok) throw new Error('Failed to load videos');

			const data = await res.json();
			if (append) {
				videos = [...videos, ...data.videos];
			} else {
				videos = data.videos;
			}
			total = data.total;
			offset = videos.length;
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Failed to load videos';
		}
	}

	async function loadModels() {
		try {
			const res = await fetch('/api/video/models');
			if (res.ok) {
				const data = await res.json();
				models = data.models || [];
			}
		} catch {
			// Models not available
		}
	}

	async function loadSchedules() {
		try {
			const res = await fetch('/api/video/schedules');
			if (res.ok) {
				const data = await res.json();
				schedules = data.schedules || [];
			}
		} catch {
			// Schedules not available
		}
	}

	async function loadAll() {
		loading = true;
		errorMessage = '';
		await Promise.all([loadVideos(), loadModels(), loadSchedules()]);
		loading = false;
		connectActiveVideos();
	}

	function setFilter(status: string | null) {
		filter = status;
		offset = 0;
		loadVideos();
	}

	async function handleGenerate(
		e: CustomEvent<{
			prompt: string;
			aspectRatio: string;
			duration: number;
			model: string;
			provider: string;
			resolution: string;
		}>
	) {
		const { prompt, aspectRatio, duration, model, provider, resolution } = e.detail;
		try {
			const res = await fetch('/api/video/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ prompt, aspectRatio, duration, model, provider, resolution })
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.message || data.error || 'Failed to generate video');
			}

			createFormRef?.resetForm();
			activeTab = 'gallery';
			filter = null;
			await loadVideos();
			connectActiveVideos();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Failed to generate video';
		}
	}

	async function handleDeleteVideo(videoId: string) {
		if (!confirm('Delete this video?')) return;
		try {
			const res = await fetch(`/api/video/${videoId}`, { method: 'DELETE' });
			if (!res.ok) throw new Error('Failed to delete video');
			videos = videos.filter((v) => v.id !== videoId);
			total--;
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Failed to delete video';
		}
	}

	async function handleCreateSchedule(
		e: CustomEvent<{
			name: string;
			prompt: string;
			frequency: string;
			model: string;
			provider: string;
			aspectRatio: string;
		}>
	) {
		try {
			const res = await fetch('/api/video/schedules', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(e.detail)
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Failed to create schedule');
			}

			await loadSchedules();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Failed to create schedule';
		}
	}

	async function handleToggleSchedule(e: CustomEvent<{ id: string; enabled: boolean }>) {
		try {
			const res = await fetch(`/api/video/schedules/${e.detail.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ enabled: e.detail.enabled })
			});

			if (!res.ok) throw new Error('Failed to update schedule');
			await loadSchedules();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Failed to update schedule';
		}
	}

	async function handleDeleteSchedule(e: CustomEvent<{ id: string }>) {
		if (!confirm('Delete this schedule?')) return;
		try {
			const res = await fetch(`/api/video/schedules/${e.detail.id}`, { method: 'DELETE' });
			if (!res.ok) throw new Error('Failed to delete schedule');
			schedules = schedules.filter((s) => s.id !== e.detail.id);
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Failed to delete schedule';
		}
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatDuration(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	function aspectRatioToCSS(ratio: string | null): string {
		if (!ratio) return '16 / 9';
		const parts = ratio.split(':');
		if (parts.length === 2) {
			const w = parseInt(parts[0], 10);
			const h = parseInt(parts[1], 10);
			if (!isNaN(w) && !isNaN(h) && h > 0) return `${w} / ${h}`;
		}
		return '16 / 9';
	}

	onMount(() => {
		loadAll();
	});

	onDestroy(() => {
		disconnectAllStreams();
	});
</script>

<svelte:head>
	<title>Videos - Nabu</title>
</svelte:head>

<div class="dashboard">
	<div class="dashboard-header">
		<h1>Videos</h1>
		<p class="subtitle">Create, manage, and schedule AI-generated videos</p>
	</div>

	{#if errorMessage}
		<div class="error-banner" transition:fade={{ duration: 200 }}>
			<p>{errorMessage}</p>
			<button on:click={() => (errorMessage = '')}>Dismiss</button>
		</div>
	{/if}

	<div class="tabs">
		<button
			class="tab"
			class:active={activeTab === 'gallery'}
			on:click={() => (activeTab = 'gallery')}
		>
			Gallery
			{#if total > 0}
				<span class="tab-count">{total}</span>
			{/if}
		</button>
		<button
			class="tab"
			class:active={activeTab === 'create'}
			on:click={() => (activeTab = 'create')}
		>
			Create
		</button>
		<button
			class="tab"
			class:active={activeTab === 'schedules'}
			on:click={() => (activeTab = 'schedules')}
		>
			Schedules
			{#if schedules.length > 0}
				<span class="tab-count">{schedules.length}</span>
			{/if}
		</button>
	</div>

	{#if loading}
		<div class="loading-state">
			<div class="loader"></div>
			<p>Loading...</p>
		</div>
	{:else if activeTab === 'create'}
		<div class="tab-content" transition:fade={{ duration: 150 }}>
			<VideoCreateForm bind:this={createFormRef} {models} on:generate={handleGenerate} />
		</div>
	{:else if activeTab === 'schedules'}
		<div class="tab-content" transition:fade={{ duration: 150 }}>
			<ScheduleManager
				{schedules}
				{models}
				on:create={handleCreateSchedule}
				on:toggle={handleToggleSchedule}
				on:delete={handleDeleteSchedule}
			/>
		</div>
	{:else}
		<div class="tab-content" transition:fade={{ duration: 150 }}>
			<div class="filter-bar">
				<button class="filter-btn" class:active={filter === null} on:click={() => setFilter(null)}>
					All
				</button>
				<button
					class="filter-btn"
					class:active={filter === 'complete'}
					on:click={() => setFilter('complete')}
				>
					Complete
				</button>
				<button
					class="filter-btn"
					class:active={filter === 'generating'}
					on:click={() => setFilter('generating')}
				>
					Generating
				</button>
				<button
					class="filter-btn"
					class:active={filter === 'pending'}
					on:click={() => setFilter('pending')}
				>
					Pending
				</button>
				<button
					class="filter-btn"
					class:active={filter === 'error'}
					on:click={() => setFilter('error')}
				>
					Failed
				</button>
			</div>

			{#if videos.length === 0}
				<div class="empty-gallery">
					<svg
						width="48"
						height="48"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1"
					>
						<rect x="2" y="4" width="20" height="16" rx="2" />
						<polygon points="10,9 16,12 10,15" />
					</svg>
					<p>No videos yet. Create your first video to get started!</p>
					<button class="create-first-btn" on:click={() => (activeTab = 'create')}>
						Create Video
					</button>
				</div>
			{:else}
				<div class="video-grid">
					{#each videos as video (video.id)}
						<button
							class="video-tile"
							class:error={video.status === 'error'}
							on:click={() => openVideoDetail(video)}
							aria-label="View details for: {video.prompt}"
						>
							<div class="tile-preview" style="aspect-ratio: {aspectRatioToCSS(video.aspectRatio)}">
								{#if video.status === 'complete' && (video.videoUrl || video.r2Key)}
									{#if video.thumbnailUrl}
										<img src={video.thumbnailUrl} alt={video.prompt} class="tile-thumb" />
									{:else}
										<!-- svelte-ignore a11y-media-has-caption -->
										<video src={getVideoSrc(video)} class="tile-video" preload="metadata"></video>
									{/if}
									<div class="play-overlay">
										<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
											<polygon points="5,3 19,12 5,21" />
										</svg>
									</div>
									{#if video.duration}
										<span class="tile-duration">{formatDuration(video.duration)}</span>
									{/if}
								{:else if video.status === 'generating' || video.status === 'pending'}
									<div class="tile-generating">
										<div class="gen-spinner"></div>
										{#if progressMap[video.id] !== undefined}
											<div class="tile-progress-bar">
												<div
													class="tile-progress-fill"
													style="width: {progressMap[video.id]}%"
												></div>
											</div>
											<span class="tile-progress-text">{progressMap[video.id]}%</span>
										{:else}
											<span>Starting...</span>
										{/if}
										{#if elapsedMap[video.id]}
											<span class="tile-elapsed">{formatElapsed(elapsedMap[video.id])}</span>
										{/if}
									</div>
								{:else if video.status === 'error'}
									<div class="tile-error">
										<svg
											width="24"
											height="24"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
										>
											<circle cx="12" cy="12" r="10" />
											<line x1="15" y1="9" x2="9" y2="15" />
											<line x1="9" y1="9" x2="15" y2="15" />
										</svg>
										<span>Failed</span>
									</div>
								{/if}
							</div>
							<div class="tile-info">
								<p class="tile-prompt" title={video.prompt}>{video.prompt}</p>
								<div class="tile-meta">
									<span class="tile-date">{formatDate(video.createdAt)}</span>
									{#if video.model}
										<span class="tile-model" title={video.model}>{video.model}</span>
									{/if}
									{#if video.cost !== null && video.cost !== undefined}
										<span class="tile-cost">${video.cost.toFixed(4)}</span>
									{/if}
									{#if video.resolution}
										<span class="tile-resolution">{video.resolution}</span>
									{/if}
									{#if video.aspectRatio}
										<span class="tile-ratio">
											<span
												class="ratio-icon"
												class:landscape={video.aspectRatio === '16:9'}
												class:portrait={video.aspectRatio === '9:16'}
												class:square={video.aspectRatio === '1:1'}
											></span>
											{video.aspectRatio}
										</span>
									{/if}
								</div>
							</div>
							<div class="tile-actions">
								{#if video.status === 'complete' && (video.videoUrl || video.r2Key)}
									<a
										href={getVideoSrc(video)}
										target="_blank"
										class="tile-action-btn"
										aria-label="Download video"
										on:click|stopPropagation
									>
										<svg
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
										>
											<path d="M21,15v4a2,2 0 0,1-2,2H5a2,2 0 0,1-2-2v-4" />
											<polyline points="7,10 12,15 17,10" />
											<line x1="12" y1="15" x2="12" y2="3" />
										</svg>
									</a>
								{/if}
								<button
									class="tile-action-btn delete"
									on:click|stopPropagation={() => handleDeleteVideo(video.id)}
									aria-label="Delete video"
								>
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
									>
										<polyline points="3,6 5,6 21,6" />
										<path
											d="M19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2"
										/>
									</svg>
								</button>
							</div>
						</button>
					{/each}
				</div>

				{#if videos.length < total}
					<div class="load-more">
						<button class="load-more-btn" on:click={() => loadVideos(true)}>
							Load More ({total - videos.length} remaining)
						</button>
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</div>

<!-- Video Detail Modal -->
{#if selectedVideo}
	<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
	<div
		class="modal-backdrop"
		role="dialog"
		aria-label="Video generation details"
		aria-modal="true"
		transition:fade={{ duration: 150 }}
		on:click={closeVideoDetail}
		on:keydown={handleDetailKeydown}
	>
		<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
		<div class="modal-content" on:click|stopPropagation on:keydown|stopPropagation>
			<div class="modal-header">
				<h2>Video Details</h2>
				<button class="modal-close" on:click={closeVideoDetail} aria-label="Close">
					<svg
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			</div>

			<div class="modal-body">
				<!-- Preview -->
				<div class="detail-preview">
					{#if selectedVideo.status === 'complete' && (selectedVideo.videoUrl || selectedVideo.r2Key)}
						<!-- svelte-ignore a11y-media-has-caption -->
						<video
							src={getVideoSrc(selectedVideo)}
							controls
							class="detail-video"
							style="aspect-ratio: {aspectRatioToCSS(selectedVideo.aspectRatio)}"
							preload="metadata"
						></video>
					{:else if selectedVideo.status === 'error'}
						<div class="detail-error-preview">
							<svg
								width="40"
								height="40"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
							>
								<circle cx="12" cy="12" r="10" />
								<line x1="15" y1="9" x2="9" y2="15" />
								<line x1="9" y1="9" x2="15" y2="15" />
							</svg>
							<span>Generation Failed</span>
						</div>
					{:else}
						<div class="detail-pending-preview">
							<div class="gen-spinner large"></div>
							<span>{getStatusLabel(selectedVideo.status)}</span>
							{#if progressMap[selectedVideo.id] !== undefined}
								<div class="detail-progress-container">
									<div class="detail-progress-bar">
										<div
											class="detail-progress-fill"
											style="width: {progressMap[selectedVideo.id]}%"
										></div>
									</div>
									<span class="detail-progress-text">{progressMap[selectedVideo.id]}% complete</span
									>
								</div>
							{/if}
							{#if elapsedMap[selectedVideo.id]}
								<span class="detail-elapsed"
									>Elapsed: {formatElapsed(elapsedMap[selectedVideo.id])}</span
								>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Status Badge -->
				<div class="detail-status-row">
					<span class="detail-status-badge {getStatusClass(selectedVideo.status)}">
						{getStatusLabel(selectedVideo.status)}
					</span>
					<span class="detail-time-ago">{formatRelativeTime(selectedVideo.createdAt)}</span>
				</div>

				<!-- Prompt -->
				<div class="detail-section">
					<h3 class="detail-label">Prompt</h3>
					<p class="detail-prompt">{selectedVideo.prompt}</p>
				</div>

				<!-- Error (if any) -->
				{#if selectedVideo.error}
					<div class="detail-section">
						<h3 class="detail-label">Error</h3>
						<p class="detail-error-text">{selectedVideo.error}</p>
					</div>
				{/if}

				<!-- Metadata Grid -->
				<div class="detail-grid">
					<div class="detail-field">
						<span class="detail-field-label">Generation ID</span>
						<span class="detail-field-value mono">{selectedVideo.id}</span>
					</div>

					<div class="detail-field">
						<span class="detail-field-label">Provider</span>
						<span class="detail-field-value">{selectedVideo.provider}</span>
					</div>

					<div class="detail-field">
						<span class="detail-field-label">Model</span>
						<span class="detail-field-value">{selectedVideo.model || '—'}</span>
					</div>

					{#if selectedVideo.providerJobId}
						<div class="detail-field">
							<span class="detail-field-label">Provider Job ID</span>
							<span class="detail-field-value mono">{selectedVideo.providerJobId}</span>
						</div>
					{/if}

					<div class="detail-field">
						<span class="detail-field-label">Aspect Ratio</span>
						<span class="detail-field-value">{selectedVideo.aspectRatio || '—'}</span>
					</div>

					{#if selectedVideo.resolution}
						<div class="detail-field">
							<span class="detail-field-label">Resolution</span>
							<span class="detail-field-value">{selectedVideo.resolution}</span>
						</div>
					{/if}

					{#if selectedVideo.duration}
						<div class="detail-field">
							<span class="detail-field-label">Video Length</span>
							<span class="detail-field-value">{formatDuration(selectedVideo.duration)}</span>
						</div>
					{/if}

					{#if selectedVideo.cost !== null && selectedVideo.cost !== undefined}
						<div class="detail-field">
							<span class="detail-field-label">Cost</span>
							<span class="detail-field-value">${selectedVideo.cost.toFixed(4)}</span>
						</div>
					{/if}

					<div class="detail-field">
						<span class="detail-field-label">Created</span>
						<span class="detail-field-value">{formatFullDate(selectedVideo.createdAt)}</span>
					</div>

					{#if selectedVideo.completedAt}
						<div class="detail-field">
							<span class="detail-field-label">Completed</span>
							<span class="detail-field-value">{formatFullDate(selectedVideo.completedAt)}</span>
						</div>
						<div class="detail-field">
							<span class="detail-field-label">Render Time</span>
							<span class="detail-field-value"
								>{computeDurationBetween(selectedVideo.createdAt, selectedVideo.completedAt)}</span
							>
						</div>
					{/if}

					{#if selectedVideo.conversationId}
						<div class="detail-field">
							<span class="detail-field-label">Conversation</span>
							<a
								href="/chat?id={selectedVideo.conversationId}"
								class="detail-field-value detail-link mono">{selectedVideo.conversationId}</a
							>
						</div>
					{/if}

					{#if selectedVideo.messageId}
						<div class="detail-field">
							<span class="detail-field-label">Message ID</span>
							<span class="detail-field-value mono">{selectedVideo.messageId}</span>
						</div>
					{/if}

					{#if selectedVideo.r2Key}
						<div class="detail-field">
							<span class="detail-field-label">Storage Key</span>
							<span class="detail-field-value mono">{selectedVideo.r2Key}</span>
						</div>
					{/if}
				</div>
			</div>

			<div class="modal-footer">
				{#if selectedVideo.status === 'complete' && (selectedVideo.videoUrl || selectedVideo.r2Key)}
					<a href={getVideoSrc(selectedVideo)} target="_blank" class="modal-btn primary" download>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M21,15v4a2,2 0 0,1-2,2H5a2,2 0 0,1-2-2v-4" />
							<polyline points="7,10 12,15 17,10" />
							<line x1="12" y1="15" x2="12" y2="3" />
						</svg>
						Download
					</a>
				{/if}
				<button
					class="modal-btn danger"
					on:click={() => {
						if (selectedVideo) {
							handleDeleteVideo(selectedVideo.id);
							closeVideoDetail();
						}
					}}
				>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<polyline points="3,6 5,6 21,6" />
						<path
							d="M19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2"
						/>
					</svg>
					Delete
				</button>
				<button class="modal-btn" on:click={closeVideoDetail}>Close</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* ===== MOBILE-FIRST BASE STYLES ===== */

	.dashboard {
		max-width: 1100px;
		margin: 0 auto;
		padding: var(--spacing-md) var(--spacing-sm);
	}

	.dashboard-header {
		margin-bottom: var(--spacing-md);
	}

	.dashboard-header h1 {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--color-text);
	}

	.subtitle {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		margin-top: var(--spacing-xs);
	}

	.error-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		background-color: var(--color-error);
		color: var(--color-background);
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-md);
		font-size: 0.85rem;
	}

	.error-banner button {
		background: none;
		border: 1px solid var(--color-background);
		color: var(--color-background);
		padding: 2px var(--spacing-sm);
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		cursor: pointer;
		white-space: nowrap;
		flex-shrink: 0;
	}

	/* Tabs — horizontally scrollable on mobile */
	.tabs {
		display: flex;
		gap: 0;
		border-bottom: 1px solid var(--color-border);
		margin-bottom: var(--spacing-md);
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none;
	}

	.tabs::-webkit-scrollbar {
		display: none;
	}

	.tab {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-sm) var(--spacing-md);
		border: none;
		background: none;
		color: var(--color-text-secondary);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		transition: all var(--transition-fast);
		white-space: nowrap;
		min-height: 44px;
	}

	.tab:hover {
		color: var(--color-text);
	}

	.tab.active {
		color: var(--color-primary);
		border-bottom-color: var(--color-primary);
	}

	.tab-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		border-radius: 10px;
		background-color: var(--color-surface);
		font-size: 0.7rem;
		font-weight: 600;
	}

	.tab.active .tab-count {
		background-color: var(--color-primary);
		color: var(--color-background);
	}

	.tab-content {
		min-height: 200px;
	}

	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-md);
		padding: var(--spacing-xl);
		color: var(--color-text-secondary);
	}

	.loader {
		width: 32px;
		height: 32px;
		border: 3px solid var(--color-border);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	/* Filter bar — scrollable on mobile */
	.filter-bar {
		display: flex;
		gap: var(--spacing-xs);
		margin-bottom: var(--spacing-md);
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none;
		padding-bottom: var(--spacing-xs);
	}

	.filter-bar::-webkit-scrollbar {
		display: none;
	}

	.filter-btn {
		padding: var(--spacing-xs) var(--spacing-sm);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background-color: var(--color-background);
		color: var(--color-text-secondary);
		font-size: 0.8rem;
		cursor: pointer;
		transition: all var(--transition-fast);
		white-space: nowrap;
		min-height: 36px;
		flex-shrink: 0;
	}

	.filter-btn.active {
		background-color: var(--color-primary);
		color: var(--color-background);
		border-color: var(--color-primary);
	}

	.filter-btn:hover:not(.active) {
		background-color: var(--color-surface-hover);
	}

	/* Empty gallery */
	.empty-gallery {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-md);
		padding: var(--spacing-xl) var(--spacing-md);
		color: var(--color-text-secondary);
		text-align: center;
	}

	.empty-gallery p {
		font-size: 0.9rem;
	}

	.create-first-btn {
		padding: var(--spacing-sm) var(--spacing-lg);
		border: none;
		border-radius: var(--radius-md);
		background-color: var(--color-primary);
		color: var(--color-background);
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: background-color var(--transition-fast);
		min-height: 44px;
		width: 100%;
	}

	.create-first-btn:hover {
		background-color: var(--color-primary-hover);
	}

	/* Video grid — single column on mobile */
	.video-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--spacing-md);
	}

	.video-tile {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
		background-color: var(--color-surface);
		transition: box-shadow var(--transition-fast);
		/* Remove default button styles */
		text-align: left;
		width: 100%;
	}

	.video-tile:hover {
		box-shadow: var(--shadow-md);
	}

	.video-tile.error {
		border-color: var(--color-error);
	}

	.tile-preview {
		position: relative;
		aspect-ratio: 16 / 9;
		background-color: var(--color-background);
		overflow: hidden;
	}

	.tile-thumb,
	.tile-video {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.play-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: rgb(0 0 0 / 0.3);
		color: var(--color-background);
		opacity: 0;
		transition: opacity var(--transition-fast);
	}

	.video-tile:hover .play-overlay {
		opacity: 1;
	}

	.tile-duration {
		position: absolute;
		bottom: var(--spacing-xs);
		right: var(--spacing-xs);
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		background-color: rgb(0 0 0 / 0.7);
		color: #fff;
		font-size: 0.7rem;
		font-weight: 600;
	}

	.tile-generating {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		gap: var(--spacing-sm);
		color: var(--color-text-secondary);
		font-size: 0.8rem;
	}

	.gen-spinner {
		width: 24px;
		height: 24px;
		border: 2px solid var(--color-border);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.gen-spinner.large {
		width: 36px;
		height: 36px;
		border-width: 3px;
	}

	/* Tile progress bar */
	.tile-progress-bar {
		width: 80%;
		height: 4px;
		background-color: var(--color-border);
		border-radius: 2px;
		overflow: hidden;
	}

	.tile-progress-fill {
		height: 100%;
		background-color: var(--color-primary);
		border-radius: 2px;
		transition: width 0.5s ease;
	}

	.tile-progress-text {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-primary);
	}

	.tile-elapsed {
		font-size: 0.65rem;
		color: var(--color-text-secondary);
		opacity: 0.8;
	}

	.tile-error {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		gap: var(--spacing-xs);
		color: var(--color-error);
		font-size: 0.8rem;
	}

	.tile-info {
		padding: var(--spacing-sm);
	}

	.tile-prompt {
		font-size: 0.8rem;
		color: var(--color-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		margin-bottom: var(--spacing-xs);
	}

	.tile-meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs);
		font-size: 0.7rem;
		color: var(--color-text-secondary);
	}

	.tile-model {
		max-width: 120px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tile-cost {
		font-variant-numeric: tabular-nums;
	}

	.tile-resolution {
		padding: 1px 4px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-variant-numeric: tabular-nums;
	}

	.tile-ratio {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 1px 4px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}

	.ratio-icon {
		display: inline-block;
		border: 1px solid var(--color-text-secondary);
		border-radius: 1px;
	}

	.ratio-icon.landscape {
		width: 10px;
		height: 6px;
	}

	.ratio-icon.portrait {
		width: 6px;
		height: 10px;
	}

	.ratio-icon.square {
		width: 8px;
		height: 8px;
	}

	.tile-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) var(--spacing-sm) var(--spacing-sm);
	}

	.tile-action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background-color: var(--color-background);
		color: var(--color-text-secondary);
		cursor: pointer;
		text-decoration: none;
		transition: all var(--transition-fast);
	}

	.tile-action-btn:hover {
		background-color: var(--color-surface-hover);
		color: var(--color-text);
	}

	.tile-action-btn.delete:hover {
		border-color: var(--color-error);
		color: var(--color-error);
	}

	/* Load more */
	.load-more {
		display: flex;
		justify-content: center;
		padding: var(--spacing-md);
	}

	.load-more-btn {
		padding: var(--spacing-sm) var(--spacing-lg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background-color: var(--color-background);
		color: var(--color-text);
		font-size: 0.85rem;
		cursor: pointer;
		transition: background-color var(--transition-fast);
		min-height: 44px;
		width: 100%;
	}

	.load-more-btn:hover {
		background-color: var(--color-surface-hover);
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Video Detail Modal — full-screen on mobile */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: flex-end;
		justify-content: center;
		z-index: 1000;
		padding: 0;
		backdrop-filter: blur(2px);
	}

	.modal-content {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		width: 100%;
		max-height: 95vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
	}

	.modal-header h2 {
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.modal-close {
		background: none;
		border: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: var(--spacing-xs);
		border-radius: var(--radius-sm);
		display: flex;
		align-items: center;
		min-width: 44px;
		min-height: 44px;
		justify-content: center;
	}

	.modal-close:hover {
		color: var(--color-text);
		background: var(--color-background);
	}

	.modal-body {
		padding: var(--spacing-md);
		overflow-y: auto;
		flex: 1;
		-webkit-overflow-scrolling: touch;
	}

	/* Preview */
	.detail-preview {
		margin-bottom: var(--spacing-md);
		border-radius: var(--radius-md);
		overflow: hidden;
		background: var(--color-background);
		border: 1px solid var(--color-border);
	}

	.detail-video {
		width: 100%;
		display: block;
		max-height: 50vh;
		object-fit: contain;
		background: var(--color-background);
	}

	.detail-error-preview,
	.detail-pending-preview {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-lg) var(--spacing-md);
		color: var(--color-text-secondary);
		font-size: 0.9rem;
	}

	.detail-error-preview {
		color: var(--color-error);
	}

	/* Detail modal progress */
	.detail-progress-container {
		width: 100%;
		max-width: 280px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.detail-progress-bar {
		width: 100%;
		height: 6px;
		background-color: var(--color-border);
		border-radius: 3px;
		overflow: hidden;
	}

	.detail-progress-fill {
		height: 100%;
		background-color: var(--color-primary);
		border-radius: 3px;
		transition: width 0.5s ease;
	}

	.detail-progress-text {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-primary);
	}

	.detail-elapsed {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
	}

	/* Status Row */
	.detail-status-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--spacing-md);
	}

	.detail-status-badge {
		padding: 2px 10px;
		border-radius: 12px;
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: capitalize;
	}

	.detail-status-badge.status-complete {
		background: rgba(56, 161, 105, 0.15);
		color: var(--color-success, #38a169);
	}

	.detail-status-badge.status-error {
		background: rgba(229, 62, 62, 0.15);
		color: var(--color-error);
	}

	.detail-status-badge.status-generating,
	.detail-status-badge.status-pending,
	.detail-status-badge.status-processing {
		background: rgba(214, 158, 46, 0.15);
		color: var(--color-warning, #d69e2e);
	}

	.detail-time-ago {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
	}

	/* Sections */
	.detail-section {
		margin-bottom: var(--spacing-md);
	}

	.detail-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin: 0 0 var(--spacing-xs) 0;
	}

	.detail-prompt {
		font-size: 0.9rem;
		color: var(--color-text);
		line-height: 1.5;
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.detail-error-text {
		font-size: 0.85rem;
		color: var(--color-error);
		background: rgba(229, 62, 62, 0.08);
		padding: var(--spacing-sm);
		border-radius: var(--radius-sm);
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
	}

	/* Metadata Grid — single column on mobile */
	.detail-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--spacing-sm);
		padding-top: var(--spacing-sm);
		border-top: 1px solid var(--color-border);
	}

	.detail-field {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.detail-field-label {
		font-size: 0.7rem;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-weight: 500;
	}

	.detail-field-value {
		font-size: 0.85rem;
		color: var(--color-text);
		word-break: break-all;
	}

	.detail-field-value.mono {
		font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
		font-size: 0.78rem;
	}

	.detail-link {
		color: var(--color-primary);
		text-decoration: none;
		transition: color var(--transition-fast);
	}

	.detail-link:hover {
		text-decoration: underline;
		color: var(--color-primary-hover);
	}

	/* Footer — stacked buttons on mobile */
	.modal-footer {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
		padding: var(--spacing-md);
		border-top: 1px solid var(--color-border);
	}

	.modal-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-sm);
		font-size: 0.85rem;
		font-weight: 500;
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-text);
		cursor: pointer;
		text-decoration: none;
		transition: background var(--transition-fast);
		min-height: 44px;
	}

	.modal-btn:hover {
		background: var(--color-background);
	}

	.modal-btn.primary {
		background: var(--color-primary);
		color: var(--color-background);
		border-color: var(--color-primary);
	}

	.modal-btn.primary:hover {
		opacity: 0.9;
	}

	.modal-btn.danger {
		color: var(--color-error);
		border-color: var(--color-error);
	}

	.modal-btn.danger:hover {
		background: rgba(229, 62, 62, 0.1);
	}

	/* ===== TABLET (min-width: 640px) ===== */
	@media (min-width: 640px) {
		.dashboard {
			padding: var(--spacing-lg) var(--spacing-md);
		}

		.dashboard-header {
			margin-bottom: var(--spacing-lg);
		}

		.dashboard-header h1 {
			font-size: 1.5rem;
		}

		.subtitle {
			font-size: 0.85rem;
		}

		.tab-content {
			min-height: 300px;
		}

		.create-first-btn {
			width: auto;
		}

		/* Two-column grid on tablet */
		.video-grid {
			grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		}

		.tile-info {
			padding: var(--spacing-sm) var(--spacing-md);
		}

		.tile-meta {
			gap: var(--spacing-sm);
		}

		.tile-actions {
			padding: var(--spacing-xs) var(--spacing-md) var(--spacing-sm);
		}

		.tile-action-btn {
			width: 28px;
			height: 28px;
		}

		.load-more-btn {
			width: auto;
		}

		/* Modal — centered dialog on tablet+ */
		.modal-backdrop {
			align-items: center;
			padding: var(--spacing-md);
		}

		.modal-content {
			max-width: 600px;
			max-height: 90vh;
			border-radius: var(--radius-lg);
		}

		.modal-header {
			padding: var(--spacing-md) var(--spacing-lg);
		}

		.modal-header h2 {
			font-size: 1.1rem;
		}

		.modal-body {
			padding: var(--spacing-lg);
		}

		.detail-video {
			max-height: 70vh;
		}

		/* Two-column metadata on tablet+ */
		.detail-grid {
			grid-template-columns: 1fr 1fr;
			gap: var(--spacing-sm) var(--spacing-md);
		}

		/* Footer — row layout on tablet+ */
		.modal-footer {
			flex-direction: row;
			justify-content: flex-end;
			gap: var(--spacing-sm);
			padding: var(--spacing-md) var(--spacing-lg);
		}
	}

	/* ===== DESKTOP (min-width: 1024px) ===== */
	@media (min-width: 1024px) {
		.dashboard {
			padding: var(--spacing-lg) var(--spacing-lg);
		}

		.video-grid {
			grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		}
	}
</style>
