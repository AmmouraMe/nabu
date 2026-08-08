<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	interface VideoModel {
		id: string;
		displayName: string;
		provider: string;
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

	export let schedules: Schedule[] = [];
	export let models: VideoModel[] = [];

	let showCreateForm = false;
	let newName = '';
	let newPrompt = '';
	let newFrequency = 'daily';
	let newAspectRatio = '16:9';
	let newModel = '';
	let creating = false;

	const frequencies = ['hourly', 'daily', 'weekly', 'monthly'];

	const dispatch = createEventDispatcher<{
		create: {
			name: string;
			prompt: string;
			frequency: string;
			model: string;
			provider: string;
			aspectRatio: string;
		};
		toggle: { id: string; enabled: boolean };
		delete: { id: string };
	}>();

	$: hasModels = models.length > 0;
	$: if (hasModels && !newModel) {
		newModel = models[0].id;
	}

	function handleCreate() {
		if (!newName.trim() || !newPrompt.trim()) return;
		const model = models.find((m) => m.id === newModel);
		if (!model) return;

		creating = true;
		dispatch('create', {
			name: newName.trim(),
			prompt: newPrompt.trim(),
			frequency: newFrequency,
			model: newModel,
			provider: model.provider,
			aspectRatio: newAspectRatio
		});

		newName = '';
		newPrompt = '';
		newFrequency = 'daily';
		showCreateForm = false;
		creating = false;
	}

	function handleToggle(schedule: Schedule) {
		dispatch('toggle', { id: schedule.id, enabled: !schedule.enabled });
	}

	function handleDelete(schedule: Schedule) {
		dispatch('delete', { id: schedule.id });
	}

	function formatFrequency(freq: string): string {
		return freq.charAt(0).toUpperCase() + freq.slice(1);
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div class="schedule-manager" role="region" aria-label="Video schedules">
	<div class="manager-header">
		<h2>Schedules</h2>
		{#if hasModels}
			<button
				type="button"
				class="new-schedule-btn"
				on:click={() => (showCreateForm = !showCreateForm)}
			>
				{#if showCreateForm}
					Cancel
				{:else}
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<line x1="12" y1="5" x2="12" y2="19" />
						<line x1="5" y1="12" x2="19" y2="12" />
					</svg>
					New Schedule
				{/if}
			</button>
		{/if}
	</div>

	{#if showCreateForm}
		<div class="create-schedule-form">
			<div class="form-row">
				<label class="form-label" for="schedule-name">Name</label>
				<input
					id="schedule-name"
					type="text"
					bind:value={newName}
					placeholder="e.g., Daily Product Promo"
					class="form-input"
				/>
			</div>
			<div class="form-row">
				<label class="form-label" for="schedule-prompt">Prompt</label>
				<textarea
					id="schedule-prompt"
					bind:value={newPrompt}
					placeholder="Describe the video to generate..."
					rows="2"
					class="form-textarea"
				></textarea>
			</div>
			<div class="form-row-inline">
				<div class="form-row">
					<label class="form-label" for="schedule-frequency">Frequency</label>
					<select id="schedule-frequency" bind:value={newFrequency} class="form-select">
						{#each frequencies as freq}
							<option value={freq}>{formatFrequency(freq)}</option>
						{/each}
					</select>
				</div>
				<div class="form-row">
					<span class="form-label">Aspect Ratio</span>
					<div class="ratio-options" role="radiogroup" aria-label="Aspect ratio">
						{#each ['16:9', '9:16', '1:1'] as ratio}
							<button
								type="button"
								class="ratio-chip"
								class:active={newAspectRatio === ratio}
								on:click={() => (newAspectRatio = ratio)}
							>
								{ratio}
							</button>
						{/each}
					</div>
				</div>
			</div>
			<button
				type="button"
				class="create-btn"
				disabled={!newName.trim() || !newPrompt.trim() || creating}
				on:click={handleCreate}
			>
				Create Schedule
			</button>
		</div>
	{/if}

	{#if schedules.length === 0}
		<div class="empty-state">
			<svg
				width="32"
				height="32"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
			>
				<rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
				<line x1="16" y1="2" x2="16" y2="6" />
				<line x1="8" y1="2" x2="8" y2="6" />
				<line x1="3" y1="10" x2="21" y2="10" />
			</svg>
			<p>No schedules configured. Create one to automate video generation.</p>
		</div>
	{:else}
		<div class="schedule-list">
			{#each schedules as schedule (schedule.id)}
				<div class="schedule-item" class:disabled={!schedule.enabled}>
					<div class="schedule-info">
						<div class="schedule-name">{schedule.name}</div>
						<div class="schedule-meta">
							<span class="frequency-badge">{formatFrequency(schedule.frequency)}</span>
							<span class="run-count">{schedule.totalRuns} runs</span>
							{#if schedule.nextRunAt}
								<span class="next-run">Next: {formatDate(schedule.nextRunAt)}</span>
							{/if}
						</div>
						<div class="schedule-prompt">{schedule.prompt}</div>
					</div>
					<div class="schedule-actions">
						<button
							type="button"
							class="toggle-btn"
							class:active={schedule.enabled}
							on:click={() => handleToggle(schedule)}
							aria-label={schedule.enabled ? 'Disable schedule' : 'Enable schedule'}
						>
							<div class="toggle-track">
								<div class="toggle-thumb"></div>
							</div>
						</button>
						<button
							type="button"
							class="delete-schedule-btn"
							on:click={() => handleDelete(schedule)}
							aria-label="Delete schedule"
						>
							<svg
								width="16"
								height="16"
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
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	/* ===== MOBILE-FIRST BASE STYLES ===== */

	.schedule-manager {
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-md);
	}

	.manager-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-md);
	}

	.manager-header h2 {
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.new-schedule-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-sm) var(--spacing-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background-color: var(--color-background);
		color: var(--color-text);
		font-size: 0.8rem;
		cursor: pointer;
		transition: all var(--transition-fast);
		min-height: 44px;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.new-schedule-btn:hover {
		background-color: var(--color-surface-hover);
	}

	/* Create schedule form — stacked on mobile */
	.create-schedule-form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		padding: var(--spacing-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-md);
		background-color: var(--color-background);
	}

	.form-row {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	/* Inline row — stacked on mobile, row on tablet+ */
	.form-row-inline {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.form-label {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.form-input,
	.form-textarea,
	.form-select {
		padding: var(--spacing-sm);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background-color: var(--color-surface);
		color: var(--color-text);
		font-size: 0.9rem;
		font-family: var(--font-sans);
		min-height: 44px;
		width: 100%;
	}

	.form-input:focus,
	.form-textarea:focus,
	.form-select:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.ratio-options {
		display: flex;
		gap: var(--spacing-xs);
	}

	.ratio-chip {
		padding: var(--spacing-sm) var(--spacing-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background-color: var(--color-surface);
		color: var(--color-text);
		font-size: 0.85rem;
		cursor: pointer;
		transition: all var(--transition-fast);
		min-height: 44px;
		min-width: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.ratio-chip.active {
		background-color: var(--color-primary);
		color: var(--color-background);
		border-color: var(--color-primary);
	}

	/* Create button — full-width on mobile */
	.create-btn {
		padding: var(--spacing-sm) var(--spacing-md);
		border: none;
		border-radius: var(--radius-sm);
		background-color: var(--color-primary);
		color: var(--color-background);
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: background-color var(--transition-fast);
		min-height: 44px;
		width: 100%;
	}

	.create-btn:hover:not(:disabled) {
		background-color: var(--color-primary-hover);
	}

	.create-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-lg);
		color: var(--color-text-secondary);
		text-align: center;
	}

	.empty-state p {
		font-size: 0.85rem;
	}

	.schedule-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	/* Schedule items — column layout on mobile */
	.schedule-item {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		padding: var(--spacing-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background-color: var(--color-background);
		transition: opacity var(--transition-fast);
	}

	.schedule-item.disabled {
		opacity: 0.6;
	}

	.schedule-info {
		flex: 1;
		min-width: 0;
	}

	.schedule-name {
		font-weight: 600;
		font-size: 0.9rem;
		color: var(--color-text);
		margin-bottom: var(--spacing-xs);
	}

	.schedule-meta {
		display: flex;
		gap: var(--spacing-sm);
		align-items: center;
		flex-wrap: wrap;
		margin-bottom: var(--spacing-xs);
	}

	.frequency-badge {
		display: inline-block;
		padding: 2px var(--spacing-sm);
		border-radius: var(--radius-sm);
		background-color: var(--color-primary);
		color: var(--color-background);
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.run-count,
	.next-run {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.schedule-prompt {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Actions — row at bottom of card on mobile */
	.schedule-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--spacing-sm);
		flex-shrink: 0;
		padding-top: var(--spacing-xs);
		border-top: 1px solid var(--color-border);
	}

	.toggle-btn {
		background: none;
		border: none;
		cursor: pointer;
		padding: var(--spacing-xs);
		min-width: 44px;
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.toggle-track {
		width: 36px;
		height: 20px;
		border-radius: 10px;
		background-color: var(--color-border);
		position: relative;
		transition: background-color var(--transition-fast);
	}

	.toggle-btn.active .toggle-track {
		background-color: var(--color-success);
	}

	.toggle-thumb {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background-color: var(--color-background);
		position: absolute;
		top: 2px;
		left: 2px;
		transition: transform var(--transition-fast);
	}

	.toggle-btn.active .toggle-thumb {
		transform: translateX(16px);
	}

	.delete-schedule-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--spacing-xs);
		border: none;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: color var(--transition-fast);
		min-width: 44px;
		min-height: 44px;
	}

	.delete-schedule-btn:hover {
		color: var(--color-error);
	}

	/* ===== TABLET (min-width: 640px) ===== */
	@media (min-width: 640px) {
		.schedule-manager {
			padding: var(--spacing-lg);
		}

		.manager-header h2 {
			font-size: 1.1rem;
		}

		.new-schedule-btn {
			padding: var(--spacing-xs) var(--spacing-sm);
			min-height: 36px;
		}

		.form-row-inline {
			flex-direction: row;
			gap: var(--spacing-md);
		}

		.form-input,
		.form-textarea,
		.form-select {
			padding: var(--spacing-xs) var(--spacing-sm);
			font-size: 0.85rem;
			min-height: 36px;
		}

		.ratio-chip {
			padding: var(--spacing-xs) var(--spacing-sm);
			font-size: 0.8rem;
			min-height: 36px;
			min-width: auto;
		}

		.create-btn {
			width: auto;
			align-self: flex-start;
		}

		/* Schedule items — row layout on tablet+ */
		.schedule-item {
			flex-direction: row;
			align-items: flex-start;
			justify-content: space-between;
			gap: var(--spacing-md);
		}

		.schedule-actions {
			padding-top: 0;
			border-top: none;
		}

		.toggle-btn {
			padding: 2px;
			min-width: auto;
			min-height: auto;
		}

		.delete-schedule-btn {
			min-width: auto;
			min-height: auto;
			padding: var(--spacing-xs);
		}
	}
</style>
