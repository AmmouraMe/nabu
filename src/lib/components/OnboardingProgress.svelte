<script lang="ts">
	/**
	 * OnboardingProgress - Sticky step progress indicator for the brand onboarding wizard.
	 * Mobile-first responsive: compact dots on small screens, full labels on desktop.
	 */
	import { createEventDispatcher } from 'svelte';
	import type { OnboardingStep } from '$lib/types/onboarding';
	import BrandIcon from './BrandIcon.svelte';

	export let currentStep: OnboardingStep = 'welcome';

	const dispatch = createEventDispatcher<{ stepClick: OnboardingStep }>();

	function handleStepClick(stepId: OnboardingStep, index: number) {
		// Only allow clicking completed (past) steps
		if (index < currentIndex) {
			dispatch('stepClick', stepId);
		}
	}

	const steps: { id: OnboardingStep; label: string; icon: string; shortLabel: string }[] = [
		{ id: 'welcome', label: 'Welcome', shortLabel: 'Welcome', icon: 'welcome' },
		{ id: 'brand_assessment', label: 'Assessment', shortLabel: 'Assess', icon: 'assess' },
		{ id: 'brand_identity', label: 'Identity', shortLabel: 'Identity', icon: 'identity' },
		{ id: 'target_audience', label: 'Audience', shortLabel: 'Audience', icon: 'audience' },
		{ id: 'brand_personality', label: 'Personality', shortLabel: 'Persona', icon: 'archetype' },
		{ id: 'visual_identity', label: 'Visual Identity', shortLabel: 'Visual', icon: 'visual' },
		{ id: 'market_positioning', label: 'Positioning', shortLabel: 'Position', icon: 'position' },
		{ id: 'brand_story', label: 'Story', shortLabel: 'Story', icon: 'origin' },
		{ id: 'style_guide', label: 'Style Guide', shortLabel: 'Guide', icon: 'guide' },
		{ id: 'complete', label: 'Complete', shortLabel: 'Done', icon: 'done' }
	];

	$: currentIndex = steps.findIndex((s) => s.id === currentStep);
	$: progress = Math.round((currentIndex / (steps.length - 1)) * 100);
	$: currentLabel = steps[currentIndex]?.label || 'Welcome';
</script>

<header class="progress-header" role="navigation" aria-label="Onboarding progress">
	<!-- Mobile: compact current-step display -->
	<div class="mobile-summary">
		<span class="mobile-step-icon"><BrandIcon name={steps[currentIndex]?.icon ?? 'welcome'} size={16} /></span>
		<span class="mobile-step-label">{currentLabel}</span>
		<span class="mobile-step-count">{currentIndex + 1}/{steps.length}</span>
	</div>

	<!-- Progress bar -->
	<div class="progress-track">
		<div
			class="progress-fill"
			style="width: {progress}%"
			role="progressbar"
			aria-valuenow={progress}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-label="{progress}% complete"
		></div>
	</div>

	<!-- Step indicators -->
	<nav class="steps" aria-label="Onboarding steps">
		{#each steps as step, i}
			{@const state = i < currentIndex ? 'completed' : i === currentIndex ? 'active' : 'future'}
			<button
				class="step"
				class:active={state === 'active'}
				class:completed={state === 'completed'}
				class:future={state === 'future'}
				disabled={state === 'future' || state === 'active'}
				title={state === 'completed' ? `Go back to ${step.label}` : step.label}
				aria-label="{step.label} — {state === 'completed' ? 'completed, click to go back' : state === 'active' ? 'current step' : 'upcoming'}"
				aria-current={state === 'active' ? 'step' : undefined}
				on:click={() => handleStepClick(step.id, i)}
			>
				<span class="step-dot">
					{#if state === 'completed'}
						<svg class="check-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="3 8.5 6.5 12 13 4" />
						</svg>
					{:else}
						<BrandIcon name={step.icon} size={15} />
					{/if}
				</span>
				<span class="step-label">{step.shortLabel}</span>
			</button>

			<!-- Connector line between steps -->
			{#if i < steps.length - 1}
				<div class="connector" class:filled={i < currentIndex}></div>
			{/if}
		{/each}
	</nav>
</header>

<style>
	/* ─── Sticky header ─── */
	.progress-header {
		position: sticky;
		top: 0;
		z-index: 20;
		background-color: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
	}

	/* ─── Mobile summary (visible < 640px) ─── */
	.mobile-summary {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
	}

	.mobile-step-icon {
		font-size: 1.1rem;
		line-height: 1;
	}

	.mobile-step-label {
		flex: 1;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text);
		letter-spacing: 0.01em;
	}

	.mobile-step-count {
		font-size: 0.65rem;
		font-weight: 500;
		color: var(--color-text-secondary);
		background-color: var(--color-surface-hover);
		padding: 2px 8px;
		border-radius: var(--radius-xl);
	}

	/* ─── Progress bar ─── */
	.progress-track {
		height: 3px;
		background-color: var(--color-border);
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--color-primary), var(--color-secondary));
		transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
	}

	/* ─── Steps nav ─── */
	/* Wraps rather than scrolls. It used to be overflow-x:auto, which meant the last
	   step sat 2px off the right edge at 320px and could only be reached by dragging
	   — the same trap as the pricing table. Wrapping keeps every step reachable at
	   any width. */
	.steps {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: center;
		padding: var(--spacing-xs) var(--spacing-sm);
		gap: 2px;
	}

	.steps::-webkit-scrollbar {
		display: none; /* Chrome/Safari */
	}

	/* Mobile: smaller dots, no labels */
	.step-label {
		display: none;
	}

	/* ─── Step button ─── */
	.step {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		/* Padding on the button rather than the dot: the circle keeps its 26px look
		   while the tap area reaches a thumb-friendly 40px. */
		padding: 7px 5px;
		min-width: 40px;
		min-height: 40px;
		border: none;
		background: none;
		cursor: pointer;
		flex-shrink: 0;
		position: relative;
	}

	.step:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 4px;
		border-radius: var(--radius-sm);
	}

	.step.future {
		cursor: default;
	}

	/* ─── Step dot ─── */
	.step-dot {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 2px solid var(--color-border);
		background-color: var(--color-background);
		/* Monochrome glyphs inherit this, so a circle's state colours its icon. */
		color: var(--color-text-secondary);
		transition: all var(--transition-fast);
		position: relative;
	}

	.step.active .step-dot {
		border-color: var(--color-primary);
		background-color: var(--color-primary);
		color: var(--color-background);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 20%, transparent);
	}

	.step.completed .step-dot {
		border-color: var(--color-success);
		background-color: var(--color-success);
		color: var(--color-background);
	}

	.step.future .step-dot {
		border-color: var(--color-border);
		opacity: 0.5;
	}

	.step:hover:not(:disabled) .step-dot {
		border-color: var(--color-primary);
		transform: scale(1.08);
	}



	.check-icon {
		width: 14px;
		height: 14px;
		color: var(--color-background);
	}

	/* ─── Step label ─── */
	.step-label {
		font-size: 0.55rem;
		font-weight: 500;
		color: var(--color-text-secondary);
		white-space: nowrap;
		letter-spacing: 0.02em;
		transition: color var(--transition-fast);
	}

	.step.active .step-label {
		color: var(--color-primary);
		font-weight: 700;
	}

	.step.completed .step-label {
		color: var(--color-success);
	}

	.step.future .step-label {
		opacity: 0.4;
	}

	/* ─── Connectors between steps ─── */
	.connector {
		display: none;
		flex: 1;
		height: 2px;
		background-color: var(--color-border);
		align-self: center;
		margin-bottom: 0;
		min-width: 6px;
		border-radius: 1px;
		transition: background-color var(--transition-fast);
	}

	.connector.filled {
		background-color: var(--color-success);
	}

	/* ─── Tablet: hide mobile summary, more step spacing ─── */
	@media (min-width: 640px) {
		/* Enough room for one unbroken row, so the connecting line is true again. */
		.connector {
			display: block;
		}

		.mobile-summary {
			display: none;
		}

		.steps {
			padding: var(--spacing-sm) var(--spacing-md);
			overflow-x: visible;
		}

		.step {
			padding: var(--spacing-xs) var(--spacing-xs);
		}

		.step-dot {
			width: 32px;
			height: 32px;
		}

	}

	/* ─── Desktop: show labels + more breathing room ─── */
	@media (min-width: 900px) {
		.steps {
			padding: var(--spacing-sm) var(--spacing-lg);
			justify-content: center;
		}

		.step-label {
			display: block;
		}

		.step-dot {
			width: 36px;
			height: 36px;
		}


		.check-icon {
			width: 16px;
			height: 16px;
		}

		.step-label {
			font-size: 0.58rem;
		}

		.connector {
			margin-bottom: 18px;
			min-width: 12px;
		}
	}

	/* ─── Wide Desktop: generous spacing ─── */
	@media (min-width: 1200px) {
		.steps {
			padding: var(--spacing-md) var(--spacing-xl);
			max-width: 900px;
			margin: 0 auto;
		}

		.connector {
			min-width: 20px;
		}

		.step-dot {
			width: 40px;
			height: 40px;
		}


		.step-label {
			font-size: 0.6rem;
		}
	}
</style>
