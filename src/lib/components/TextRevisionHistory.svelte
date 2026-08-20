<script lang="ts">
	import { onMount, createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	export let brandTextId: string;
	export let textLabel: string;
	export let brandProfileId: string = '';
	export let canPushToProfile: boolean = false;

	interface TextRevision {
		id: string;
		brandTextId: string;
		revisionNumber: number;
		value: string;
		label?: string;
		changeSource: 'manual' | 'ai' | 'import' | 'revert';
		userId: string;
		changeNote?: string;
		isCurrent: boolean;
		createdAt: string;
	}

	let revisions: TextRevision[] = [];
	let isLoading = true;
	let error: string | null = null;
	let isReverting = false;
	let isPushing = false;

	onMount(async () => {
		await loadRevisions();
	});

	async function loadRevisions() {
		isLoading = true;
		error = null;
		try {
			const res = await fetch(`/api/brand/assets/texts/revisions?brandTextId=${brandTextId}`);
			if (!res.ok) throw new Error('Failed to load revisions');
			const data = await res.json();
			revisions = data.revisions || [];
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load';
		} finally {
			isLoading = false;
		}
	}

	async function revertTo(revisionId: string) {
		isReverting = true;
		try {
			const res = await fetch('/api/brand/assets/texts/revisions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'revert',
					revisionId
				})
			});
			if (!res.ok) throw new Error('Failed to revert');

			dispatch('revert');
			dispatch('close');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to revert';
		} finally {
			isReverting = false;
		}
	}

	async function pushToProfile(revisionId: string) {
		if (!brandProfileId) return;
		isPushing = true;
		try {
			const res = await fetch('/api/brand/push-to-profile', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					brandProfileId,
					textId: brandTextId,
					revisionId
				})
			});
			if (!res.ok) throw new Error('Failed to push to profile');

			const result = await res.json();
			dispatch('pushed', { field: result.pushedField, label: result.pushedLabel });
			dispatch('close');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to push to profile';
		} finally {
			isPushing = false;
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
			case 'revert':
				return '↩️';
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
			case 'revert':
				return 'Reverted';
			default:
				return source;
		}
	}

	function truncateValue(val: string | null, maxLen = 200): string {
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

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
<div
	class="modal-backdrop"
	on:click={handleBackdropClick}
	role="dialog"
	aria-modal="true"
	aria-label="Text revision history"
>
	<div class="modal-content">
		<div class="modal-header">
			<div class="modal-title-block">
				<h3>Revision History</h3>
				<span class="modal-subtitle">{textLabel}</span>
			</div>
			<button class="close-btn" on:click={() => dispatch('close')} aria-label="Close">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
			</button>
		</div>

		<div class="modal-body">
			{#if isLoading}
				<div class="loading-state">
					<div class="spinner"></div>
					<p>Loading revision history…</p>
				</div>
			{:else if error}
				<div class="error-state">
					<p>{error}</p>
					<button class="retry-btn" on:click={loadRevisions}>Retry</button>
				</div>
			{:else if revisions.length === 0}
				<div class="empty-state">
					<span class="empty-icon">📋</span>
					<p>No revision history yet</p>
					<p class="empty-hint">Edits to this text will be tracked here.</p>
				</div>
			{:else}
				<div class="revision-list">
					{#each [...revisions].reverse() as rev (rev.id)}
						<div class="revision-item" class:current={rev.isCurrent}>
							<div class="revision-header">
								<span class="revision-number">v{rev.revisionNumber}</span>
								{#if rev.isCurrent}
									<span class="current-badge">Current</span>
								{/if}
								<span
									class="revision-source"
									class:ai={rev.changeSource === 'ai'}
									class:revert={rev.changeSource === 'revert'}
								>
									{getSourceIcon(rev.changeSource)}
									{getSourceLabel(rev.changeSource)}
								</span>
							</div>

							<div class="revision-value">
								{truncateValue(rev.value)}
							</div>

							{#if rev.changeNote}
								<span class="revision-note">{rev.changeNote}</span>
							{/if}

							<div class="revision-footer">
								<span class="revision-date">{formatDate(rev.createdAt)}</span>
								<div class="revision-actions">
									{#if canPushToProfile}
										<button
											class="push-btn"
											on:click={() => pushToProfile(rev.id)}
											disabled={isPushing || isReverting}
											title="Push this revision's value to the profile"
										>
											{isPushing ? '⏳...' : '📤 Push to Profile'}
										</button>
									{/if}
									{#if !rev.isCurrent}
										<button
											class="revert-btn"
											on:click={() => revertTo(rev.id)}
											disabled={isReverting || isPushing}
										>
											{isReverting ? 'Reverting…' : '↩️ Revert to this version'}
										</button>
									{/if}
								</div>
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
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: var(--spacing-md);
	}

	.modal-content {
		background-color: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		max-width: 560px;
		width: 100%;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.24);
	}

	.modal-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding: var(--spacing-md) var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
	}

	.modal-title-block h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.modal-subtitle {
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		background: none;
		cursor: pointer;
		color: var(--color-text-secondary);
		border-radius: var(--radius-sm);
		transition: background-color var(--transition-fast);
	}

	.close-btn:hover {
		background-color: var(--color-surface-hover);
	}

	.close-btn svg {
		width: 18px;
		height: 18px;
	}

	.modal-body {
		padding: var(--spacing-md) var(--spacing-lg);
		overflow-y: auto;
		flex: 1;
	}

	/* States */
	.loading-state,
	.empty-state,
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--spacing-xl);
		text-align: center;
		color: var(--color-text-secondary);
		gap: var(--spacing-xs);
	}

	.spinner {
		width: 24px;
		height: 24px;
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

	.empty-icon {
		font-size: 2rem;
	}

	.empty-hint {
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
	}

	.retry-btn {
		padding: var(--spacing-xs) var(--spacing-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background-color: var(--color-surface);
		color: var(--color-text);
		cursor: pointer;
		font-size: 0.8125rem;
	}

	.retry-btn:hover {
		background-color: var(--color-surface-hover);
	}

	/* Revision List */
	.revision-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.revision-item {
		padding: var(--spacing-sm) var(--spacing-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.revision-item.current {
		border-color: var(--color-primary);
		background-color: var(--color-surface);
	}

	.revision-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
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

	.revision-source.revert {
		background-color: var(--color-surface-hover);
		color: var(--color-text);
	}

	.revision-value {
		font-size: 0.8125rem;
		color: var(--color-text);
		line-height: 1.5;
		padding: var(--spacing-xs) 0;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.revision-note {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	.revision-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.revision-actions {
		display: flex;
		gap: var(--spacing-xs);
		align-items: center;
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

	.revert-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.push-btn {
		font-size: 0.75rem;
		padding: 2px 8px;
		border: none;
		border-radius: var(--radius-sm);
		background-color: var(--color-primary);
		color: var(--color-background);
		cursor: pointer;
		transition: background-color var(--transition-fast);
	}

	.push-btn:hover {
		background-color: var(--color-primary-hover);
	}

	.push-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
