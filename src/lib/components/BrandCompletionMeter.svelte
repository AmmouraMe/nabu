<script lang="ts">
	/**
	 * Brand completion meter — the "gently guided to 100%" surface.
	 *
	 * Shows how complete the brand foundation is and, more usefully, the single next
	 * best thing to do. Deliberately one suggestion at a time: a checklist of twenty
	 * outstanding items reads as a chore, whereas one invitation reads as a nudge.
	 */
	import { createEventDispatcher } from 'svelte';
	import { computeBrandCompletion, type CompletionItem } from '$lib/services/brand-completion';
	import type { BrandProfile } from '$lib/types/onboarding';

	/** Null while the profile is still loading; the meter renders at 0 rather than hiding. */
	export let profile: BrandProfile | null = null;
	/** Collapsed to just the bar — used where space is tight. */
	export let compact = false;

	const dispatch = createEventDispatcher<{ resolve: CompletionItem }>();

	$: completion = computeBrandCompletion(profile);
	$: nextBest = completion.nextBest;
	$: done = completion.percent === 100;
</script>

<div class="completion-meter" class:compact>
	<div class="meter-header">
		<span class="meter-label">
			{#if done}
				Brand foundation complete
			{:else}
				Brand foundation
			{/if}
		</span>
		<span class="meter-percent" class:done>{completion.percent}%</span>
	</div>

	<div
		class="meter-track"
		role="progressbar"
		aria-valuenow={completion.percent}
		aria-valuemin={0}
		aria-valuemax={100}
		aria-label="Brand foundation completion"
	>
		<div class="meter-fill" class:done style="width: {completion.percent}%"></div>
	</div>

	{#if !compact && nextBest}
		<div class="meter-next">
			<p class="next-prompt">{nextBest.prompt}</p>
			<button class="next-action" on:click={() => dispatch('resolve', nextBest)}>
				{nextBest.label}
				<span class="arrow">→</span>
			</button>
		</div>
	{:else if !compact && done}
		<p class="next-prompt done-note">
			Every part of the foundation is filled in. Anything you change from here just refines it.
		</p>
	{/if}
</div>

<style>
	.completion-meter {
		padding: var(--spacing-sm) var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	.meter-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--spacing-sm);
		margin-bottom: 6px;
	}

	.meter-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-secondary);
	}

	.meter-percent {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		/* Tabular figures stop the number jittering as it counts up. */
		font-variant-numeric: tabular-nums;
	}

	.meter-percent.done {
		color: var(--color-primary);
	}

	.meter-track {
		height: 4px;
		border-radius: 999px;
		background: var(--color-border);
		overflow: hidden;
	}

	.meter-fill {
		height: 100%;
		background: var(--color-primary);
		border-radius: 999px;
		transition: width var(--transition-base, 240ms) ease;
	}

	/* Respect users who have asked for less motion; the bar still fills, just instantly. */
	@media (prefers-reduced-motion: reduce) {
		.meter-fill {
			transition: none;
		}
	}

	.meter-next {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-sm);
		margin-top: var(--spacing-xs);
		flex-wrap: wrap;
	}

	.next-prompt {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		margin: 0;
	}

	.done-note {
		margin-top: var(--spacing-xs);
	}

	.next-action {
		flex-shrink: 0;
		padding: 4px var(--spacing-sm);
		background: none;
		color: var(--color-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-size: 0.7rem;
		font-weight: 600;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.next-action:hover {
		border-color: var(--color-primary);
	}

	.arrow {
		margin-left: 2px;
	}
</style>
