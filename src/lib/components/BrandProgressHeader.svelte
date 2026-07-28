<script lang="ts">
	/**
	 * The one progress header for brand onboarding.
	 *
	 * It replaces two stacked rails that both drew circles-with-labels: one for the
	 * conversation's step, one for the brand's completeness. Same visual language for
	 * two unrelated measures read as a single broken thing — and it cost ~300px of a
	 * chat screen before a word of conversation.
	 *
	 * Two ideas do the unifying:
	 *
	 * **A sequence gets a line; a set gets dots.** The steps are ordered, so they are a
	 * segmented bar. Segments flex to the container, so ten of them fit any width —
	 * which is also what fixes the old rail wrapping and orphaning "Done" onto a second
	 * row. The 24 foundation items have no order, so they stay dots, grouped by their
	 * six real sections; the wider gap between groups is the only structure drawn,
	 * because it is the only structure that exists.
	 *
	 * **One accent.** Both rails used to fill in green, which left the header a wall of
	 * checkmarks reading "done" while the brand itself was 19% complete. Progress is
	 * brand teal here and nothing else: filled means done, hollow means outstanding,
	 * ringed means next.
	 */
	import { createEventDispatcher } from 'svelte';
	import type { BrandProfile, OnboardingStep } from '$lib/types/onboarding';
	import {
		BRAND_COMPLETION_ITEMS,
		computeBrandCompletion,
		type CompletionGroup,
		type CompletionItem
	} from '$lib/services/brand-completion';

	export let currentStep: OnboardingStep = 'welcome';
	/** Null while the profile loads; the meter renders at 0 rather than hiding. */
	export let profile: BrandProfile | null = null;

	const dispatch = createEventDispatcher<{ stepClick: OnboardingStep; resolve: CompletionItem }>();

	/**
	 * Full labels, not the abbreviations the old rail needed. Nothing has to fit under a
	 * 36px circle any more, so "Personality" can be itself.
	 */
	const steps: { id: OnboardingStep; label: string }[] = [
		{ id: 'welcome', label: 'Welcome' },
		{ id: 'brand_assessment', label: 'Assessment' },
		{ id: 'brand_identity', label: 'Identity' },
		{ id: 'target_audience', label: 'Audience' },
		{ id: 'brand_personality', label: 'Personality' },
		{ id: 'visual_identity', label: 'Visual identity' },
		{ id: 'market_positioning', label: 'Positioning' },
		{ id: 'brand_story', label: 'Story' },
		{ id: 'style_guide', label: 'Style guide' },
		{ id: 'complete', label: 'Complete' }
	];

	$: currentIndex = Math.max(
		0,
		steps.findIndex((s) => s.id === currentStep)
	);
	$: currentLabel = steps[currentIndex]?.label ?? 'Welcome';

	function goBackTo(stepId: OnboardingStep, index: number) {
		// Only steps already passed. The current one is where you are, and the rest have
		// not happened yet.
		if (index < currentIndex) dispatch('stepClick', stepId);
	}

	$: completion = computeBrandCompletion(profile);
	$: nextBest = completion.nextBest;
	$: done = completion.percent === 100;
	$: remaining = completion.missing.length;

	/**
	 * Consecutive runs of items sharing a group, in the checklist's own order.
	 *
	 * Built by walking the list rather than bucketing by group, so the dots always
	 * follow the order the brand comes together in. A reordered checklist splits into
	 * more runs instead of silently rearranging what the user sees.
	 */
	$: itemGroups = BRAND_COMPLETION_ITEMS.reduce<
		{ group: CompletionGroup; items: CompletionItem[] }[]
	>((runs, item) => {
		const last = runs[runs.length - 1];
		if (last && last.group === item.group) last.items.push(item);
		else runs.push({ group: item.group, items: [item] });
		return runs;
	}, []);
</script>

<header class="progress-header">
	<div class="inner">
		<!-- ── Where you are in the conversation ─────────────────────────────── -->
		<div class="journey">
			<p class="journey-caption">
				<span class="journey-now">{currentLabel}</span>
				<span class="journey-count">Step {currentIndex + 1} of {steps.length}</span>
			</p>

			<ol class="journey-track" aria-label="Onboarding steps">
				{#each steps as step, i (step.id)}
					{@const state = i < currentIndex ? 'completed' : i === currentIndex ? 'active' : 'future'}
					<li>
						<button
							class="seg"
							class:completed={state === 'completed'}
							class:active={state === 'active'}
							disabled={state !== 'completed'}
							title={state === 'completed' ? `Go back to ${step.label}` : step.label}
							aria-label="{step.label} — {state === 'completed'
								? 'completed, click to go back'
								: state === 'active'
									? 'current step'
									: 'upcoming'}"
							aria-current={state === 'active' ? 'step' : undefined}
							on:click={() => goBackTo(step.id, i)}
						>
							<span class="seg-bar"></span>
						</button>
					</li>
				{/each}
			</ol>
		</div>

		<!-- ── How much of the brand actually exists ──────────────────────────
		     Separate from the steps on purpose: a step can be walked past without
		     answering everything, so these two diverge and must not be conflated. -->
		<div class="foundation">
			<div class="foundation-head">
				<span class="eyebrow">
					{done ? 'Brand foundation complete' : 'Brand foundation'}
				</span>
				<span class="stat">
					<span class="stat-percent">{completion.percent}%</span>
					{#if !done}
						<span class="stat-left">{remaining} left</span>
					{/if}
				</span>
			</div>

			<div
				class="foundation-track"
				role="progressbar"
				aria-valuenow={completion.percent}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-label="Brand foundation completion"
			>
				<div class="foundation-fill" style="width: {completion.percent}%"></div>
			</div>

			<nav class="dots" aria-label="Brand foundation items">
				{#each itemGroups as run, runIndex (runIndex)}
					<span class="dot-group">
						{#each run.items as item (item.key)}
							{@const isDone = completion.completed.includes(item)}
							<button
								class="dot"
								class:done={isDone}
								class:next={item === nextBest}
								title={isDone ? `${item.label} — done, click to revise` : item.prompt}
								aria-label="{item.label} — {isDone ? 'done, click to revise' : 'not filled in yet'}"
								on:click={() => dispatch('resolve', item)}
							>
								<span class="dot-mark"></span>
							</button>
						{/each}
					</span>
				{/each}
			</nav>

			{#if nextBest}
				<div class="nudge">
					<p class="nudge-prompt">{nextBest.prompt}</p>
					<button class="nudge-action" on:click={() => dispatch('resolve', nextBest)}>
						{nextBest.label}
						<span class="arrow" aria-hidden="true">→</span>
					</button>
				</div>
			{:else if done}
				<p class="nudge-prompt">
					Every part of the foundation is filled in. Anything you change from here just refines it.
				</p>
			{/if}
		</div>
	</div>
</header>

<style>
	.progress-header {
		position: sticky;
		top: 0;
		z-index: 20;
		background-color: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
	}

	/* Padding matches the message composer's, so the header, the conversation and the
	   composer share one left edge. A centred reading column was tried first and read
	   as a misalignment: this chat is edge-to-edge, and a narrower header just looked
	   like it had slipped. */
	.inner {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		width: 100%;
		padding: var(--spacing-sm) var(--spacing-md);
	}

	/* ── The journey ──────────────────────────────────────────────────────── */

	.journey {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--spacing-xs) var(--spacing-md);
	}

	.journey-caption {
		display: flex;
		align-items: baseline;
		gap: var(--spacing-sm);
		margin: 0;
		flex-shrink: 0;
	}

	.journey-now {
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.journey-count {
		font-size: 0.68rem;
		color: var(--color-text-secondary);
		/* Tabular figures stop the count shifting as it climbs. */
		font-variant-numeric: tabular-nums;
	}

	.journey-track {
		display: flex;
		/* `1 1 8rem` rather than `1`: on a narrow screen the track drops to its own line
		   instead of being crushed to a few pixels beside the caption. */
		flex: 1 1 8rem;
		gap: 3px;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.journey-track li {
		display: flex;
		flex: 1;
	}

	/* The visible bar is 3px; the button around it is 20px, so a past step is a real
	   target rather than a hairline. */
	.seg {
		display: flex;
		align-items: center;
		flex: 1;
		padding: 8px 0;
		border: none;
		background: none;
		cursor: default;
	}

	.seg.completed {
		cursor: pointer;
	}

	.seg:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
		border-radius: var(--radius-sm);
	}

	.seg-bar {
		display: block;
		width: 100%;
		height: 3px;
		border-radius: 999px;
		background-color: var(--color-border);
		transition: background-color var(--transition-fast);
	}

	/* Behind you, ahead of you, and here — one hue, three weights. */
	.seg.completed .seg-bar {
		background-color: color-mix(in srgb, var(--color-primary) 45%, transparent);
	}

	.seg.active .seg-bar {
		background-color: var(--color-primary);
	}

	.seg.completed:hover .seg-bar {
		background-color: var(--color-primary);
	}

	/* ── The foundation ───────────────────────────────────────────────────── */

	.foundation {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.foundation-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--spacing-sm);
	}

	.eyebrow {
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-secondary);
	}

	.stat {
		display: flex;
		align-items: baseline;
		gap: var(--spacing-sm);
		font-variant-numeric: tabular-nums;
	}

	.stat-percent {
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--color-primary);
	}

	/* A count you can act on, next to a percentage that only says how it is going. */
	.stat-left {
		font-size: 0.68rem;
		color: var(--color-text-secondary);
	}

	.foundation-track {
		height: 4px;
		border-radius: 999px;
		background-color: var(--color-border);
		overflow: hidden;
		/* The eyebrow's descenders eat most of the 6px gap, which left the bar looking
		   welded to the label. */
		margin-top: 3px;
	}

	.foundation-fill {
		height: 100%;
		border-radius: 999px;
		background-color: var(--color-primary);
		transition: width var(--transition-base, 240ms) ease;
	}

	/* ── The dots ─────────────────────────────────────────────────────────── */

	/* No labels, unlike the rail this replaces. That rail carried a glyph per circle
	   and needed words to decode them; a filled or hollow dot is a state, not a
	   pictogram, so there is nothing to read. The prompt below always names the one
	   that matters, and every dot carries its own title and accessible name. */
	.dots {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		/* The only structure drawn: 2px within a section, 14px between them. */
		gap: 0 14px;
		margin-top: 2px;
	}

	.dot-group {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.dot {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: none;
		cursor: pointer;
	}

	.dot:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 0;
	}

	.dot-mark {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		border: 1.5px solid var(--color-border);
		background-color: transparent;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			transform var(--transition-fast),
			box-shadow var(--transition-fast);
	}

	.dot.done .dot-mark {
		background-color: var(--color-primary);
		border-color: var(--color-primary);
	}

	/* The one the prompt is pointing at, so the sentence and the dots agree. */
	.dot.next .dot-mark {
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 22%, transparent);
	}

	.dot:hover .dot-mark {
		border-color: var(--color-primary);
		transform: scale(1.3);
	}

	/* ── The nudge ────────────────────────────────────────────────────────── */

	.nudge {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--spacing-xs) var(--spacing-sm);
		margin-top: 2px;
	}

	.nudge-prompt {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		margin: 0;
	}

	.nudge-action {
		flex-shrink: 0;
		/* The page's main call to action should not be its smallest target. */
		min-height: 34px;
		padding: 5px var(--spacing-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: none;
		color: var(--color-primary);
		font-size: 0.72rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			border-color var(--transition-fast),
			background-color var(--transition-fast);
	}

	.nudge-action:hover {
		border-color: var(--color-primary);
		background-color: color-mix(in srgb, var(--color-primary) 8%, transparent);
	}

	.nudge-action:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.arrow {
		margin-left: 2px;
	}

	@media (prefers-reduced-motion: reduce) {
		.foundation-fill,
		.seg-bar,
		.dot-mark {
			transition: none;
		}

		.dot:hover .dot-mark {
			transform: none;
		}
	}

	@media (min-width: 900px) {
		.inner {
			padding: var(--spacing-sm) var(--spacing-lg);
		}

		.journey-now {
			font-size: 0.82rem;
		}
	}
</style>
