<script lang="ts">
	import { onMount, createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	export let profileId: string;
	export let fieldName: string;
	export let fieldLabel: string;

	interface FieldVersion {
		id: string;
		brandProfileId: string;
		userId: string;
		fieldName: string;
		oldValue: string | null;
		newValue: string | null;
		changeSource: 'manual' | 'ai' | 'import';
		changeReason: string | null;
		versionNumber: number;
		createdAt: string;
	}

	let history: FieldVersion[] = [];
	let isLoading = true;
	let error: string | null = null;

	onMount(async () => {
		await loadHistory();
	});

	async function loadHistory() {
		isLoading = true;
		error = null;
		try {
			const res = await fetch(`/api/brand/field-history/${profileId}/${fieldName}`);
			if (!res.ok) throw new Error('Failed to load history');
			const data = await res.json();
			history = data.history || [];
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load';
		} finally {
			isLoading = false;
		}
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

	function getSourceIcon(source: string): string {
		switch (source) {
			case 'ai':
				return '🤖';
			case 'manual':
				return '✏️';
			case 'import':
				return '📥';
			default:
				return '📝';
		}
	}

	function getSourceLabel(source: string): string {
		switch (source) {
			case 'ai':
				return 'AI Generated';
			case 'manual':
				return 'Manual Edit';
			case 'import':
				return 'Imported';
			default:
				return source;
		}
	}

	function truncateValue(val: string | null, maxLen = 120): string {
		if (!val) return '(empty)';
		if (val.length <= maxLen) return val;
		return val.substring(0, maxLen) + '…';
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			dispatch('close');
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			dispatch('close');
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="modal-backdrop" on:click={handleBackdropClick}>
	<div class="modal" role="dialog" aria-label="Version history for {fieldLabel}">
		<div class="modal-header">
			<h3>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<circle cx="12" cy="12" r="10" />
					<polyline points="12 6 12 12 16 14" />
				</svg>
				Version History — {fieldLabel}
			</h3>
			<button class="close-btn" on:click={() => dispatch('close')} aria-label="Close">
				<svg
					width="18"
					height="18"
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
			{#if isLoading}
				<div class="loading">Loading history...</div>
			{:else if error}
				<div class="error">{error}</div>
			{:else if history.length === 0}
				<div class="empty">
					<p>No version history yet.</p>
					<p class="empty-hint">Changes will be tracked here as you edit this field.</p>
				</div>
			{:else}
				<div class="timeline">
					{#each [...history].reverse() as version, i}
						<div class="version-entry" class:latest={i === 0}>
							<div class="version-marker">
								<div class="version-dot" class:latest={i === 0}></div>
								{#if i < history.length - 1}
									<div class="version-line"></div>
								{/if}
							</div>

							<div class="version-content">
								<div class="version-header">
									<span class="version-number">v{version.versionNumber}</span>
									<span class="version-source">
										{getSourceIcon(version.changeSource)}
										{getSourceLabel(version.changeSource)}
									</span>
									<span class="version-date">{formatDate(version.createdAt)}</span>
								</div>

								{#if version.changeReason}
									<div class="version-reason">{version.changeReason}</div>
								{/if}

								<div class="version-value">
									<span class="value-label">Value:</span>
									<span class="value-text">{truncateValue(version.newValue)}</span>
								</div>

								{#if i > 0}
									<button
										class="revert-btn"
										on:click={() => dispatch('revert', { versionId: version.id })}
									>
										Restore this version
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background-color: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: var(--spacing-md);
	}

	.modal {
		background-color: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		width: 100%;
		max-width: 560px;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		box-shadow: var(--shadow-xl);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-md) var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
	}

	.modal-header h3 {
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0;
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		border: none;
		background: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		border-radius: var(--radius-sm);
		transition: all var(--transition-fast);
	}

	.close-btn:hover {
		background-color: var(--color-surface-hover);
		color: var(--color-text);
	}

	.modal-body {
		padding: var(--spacing-lg);
		overflow-y: auto;
		flex: 1;
	}

	.loading,
	.error,
	.empty {
		text-align: center;
		padding: var(--spacing-xl);
		color: var(--color-text-secondary);
		font-size: 0.9rem;
	}

	.error {
		color: var(--color-error);
	}

	.empty-hint {
		font-size: 0.8rem;
		margin-top: var(--spacing-xs);
	}

	/* Timeline */
	.timeline {
		display: flex;
		flex-direction: column;
	}

	.version-entry {
		display: flex;
		gap: var(--spacing-md);
		position: relative;
	}

	.version-marker {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 16px;
		flex-shrink: 0;
	}

	.version-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background-color: var(--color-border);
		border: 2px solid var(--color-surface);
		z-index: 1;
	}

	.version-dot.latest {
		background-color: var(--color-primary);
	}

	.version-line {
		width: 2px;
		flex: 1;
		background-color: var(--color-border);
	}

	.version-content {
		flex: 1;
		padding-bottom: var(--spacing-md);
	}

	.version-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
		margin-bottom: var(--spacing-xs);
	}

	.version-number {
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--color-primary);
		background-color: var(--color-surface);
		padding: 1px var(--spacing-xs);
		border-radius: var(--radius-sm);
	}

	.version-source {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.version-date {
		font-size: 0.7rem;
		color: var(--color-text-secondary);
		margin-left: auto;
	}

	.version-reason {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		font-style: italic;
		margin-bottom: var(--spacing-xs);
	}

	.version-value {
		background-color: var(--color-surface);
		border-radius: var(--radius-sm);
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: 0.8rem;
		margin-bottom: var(--spacing-xs);
	}

	.value-label {
		color: var(--color-text-secondary);
		font-weight: 600;
		margin-right: var(--spacing-xs);
	}

	.value-text {
		color: var(--color-text);
		word-break: break-word;
	}

	.revert-btn {
		font-size: 0.75rem;
		padding: 2px var(--spacing-sm);
		border: 1px solid var(--color-border);
		background: none;
		color: var(--color-primary);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.revert-btn:hover {
		border-color: var(--color-primary);
		background-color: var(--color-surface);
	}
</style>
