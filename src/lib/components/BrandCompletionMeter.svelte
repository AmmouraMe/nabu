<script lang="ts">
	/**
	 * Brand completion meter — the "gently guided to 100%" surface.
	 *
	 * Shows how complete the brand foundation is and, more usefully, the single next
	 * best thing to do. Deliberately one suggestion at a time: a checklist of twenty
	 * outstanding items reads as a chore, whereas one invitation reads as a nudge.
	 */
	import { createEventDispatcher } from 'svelte';
	import {
		computeBrandCompletion,
		BRAND_COMPLETION_ITEMS,
		type CompletionItem
	} from '$lib/services/brand-completion';
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

	{#if !compact}
		<!--
			Second rail. The step rail above tracks where you are in the *conversation*,
			and it can read 100% complete while the brand itself is at 19% — a step can be
			walked past without answering everything. These circles track the brand.

			No connector lines, unlike the step rail: those steps are a sequence, these are
			a set you can fill in any order. Drawing a line between them would imply an
			order that does not exist.
		-->
		<nav class="foundation-rail" aria-label="Brand foundation items">
			{#each BRAND_COMPLETION_ITEMS as item (item.key)}
				{@const isDone = completion.completed.includes(item)}
				<button
					class="fi"
					class:done={isDone}
					class:next={item === nextBest}
					title={isDone ? `${item.label} — done, click to revise` : item.prompt}
					aria-label="{item.label} — {isDone ? 'done, click to revise' : 'not filled in yet'}"
					on:click={() => dispatch('resolve', item)}
				>
					<span class="fi-dot">
						{#if isDone}
							<svg
								class="fi-check"
								viewBox="0 0 16 16"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<polyline points="3 8.5 6.5 12 13 4" />
							</svg>
						{:else}
							<span class="fi-emoji">{item.icon}</span>
						{/if}
					</span>
					<span class="fi-label">{item.short}</span>
				</button>
			{/each}
		</nav>
	{/if}

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

	/* ── Foundation rail ──────────────────────────────────────────────────────
	   Same circle language as the step rail above, so the two read as siblings.
	   It wraps rather than scrolls: 24 items never fit one line on a phone, and
	   sideways scrolling would hide the tail exactly like the pricing table did. */
	.foundation-rail {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs) var(--spacing-sm);
		margin-top: var(--spacing-sm);
	}

	.fi {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		padding: 2px;
		background: none;
		border: none;
		cursor: pointer;
		/* Comfortable tap target on a phone even though the dot itself is 26px. */
		min-width: 40px;
	}

	/* Sized to match the step rail above, so the two rails read as one system rather
	   than a primary and an afterthought. */
	.fi-dot {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 2px solid var(--color-border);
		background-color: var(--color-background);
		transition: all var(--transition-fast);
	}

	.fi.done .fi-dot {
		border-color: var(--color-success);
		background-color: var(--color-success);
		color: var(--color-background);
	}

	/* Outstanding items recede, so the gaps read as gaps rather than as noise. */
	.fi:not(.done) .fi-dot {
		opacity: 0.55;
	}

	/* The one the meter is nudging toward gets the same ring the active step has,
	   so the written prompt and the rail point at the same thing. */
	.fi.next .fi-dot {
		border-color: var(--color-primary);
		opacity: 1;
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 20%, transparent);
	}

	.fi:hover .fi-dot {
		border-color: var(--color-primary);
		opacity: 1;
		transform: scale(1.08);
	}

	.fi:focus-visible .fi-dot {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	@media (prefers-reduced-motion: reduce) {
		.fi-dot {
			transition: none;
		}
		.fi:hover .fi-dot {
			transform: none;
		}
	}

	.fi-check {
		width: 15px;
		height: 15px;
	}

	.fi-emoji {
		font-size: 0.85rem;
		line-height: 1;
	}

	/* Labels stay visible at every width, unlike the step rail which drops them on
	   mobile. That rail is a sequence, so position hints at identity; these 24 items
	   are a set in no fixed order, and unlabelled they would be a wall of tiny emoji.
	   The rail wraps to more rows instead — cheaper than making them unreadable. */
	.fi-label {
		font-size: 0.55rem;
		font-weight: 500;
		color: var(--color-text-secondary);
		white-space: nowrap;
		letter-spacing: 0.02em;
	}

	.fi.done .fi-label {
		color: var(--color-success);
	}

	.fi.next .fi-label {
		color: var(--color-primary);
		font-weight: 700;
	}

	@media (min-width: 40rem) {
		.fi-dot {
			width: 36px;
			height: 36px;
		}

		.fi-emoji {
			font-size: 0.95rem;
		}

		.fi-check {
			width: 16px;
			height: 16px;
		}

		.fi {
			min-width: 46px;
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
