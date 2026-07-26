<script lang="ts">
	/**
	 * One cell of the pricing comparison: included, not included, or a limit.
	 *
	 * Shared by the mobile card layout and the desktop table so the two cannot drift
	 * apart — the same feature must never read as included in one and not the other.
	 */
	export let value: boolean | string;
</script>

{#if value === true}
	<svg
		class="icon-yes"
		width="18"
		height="18"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2.5"
		stroke-linecap="round"
		stroke-linejoin="round"
		role="img"
		aria-label="Included"
	>
		<polyline points="20 6 9 17 4 12" />
	</svg>
{:else if value === false}
	<svg
		class="icon-no"
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		role="img"
		aria-label="Not included"
	>
		<line x1="18" y1="6" x2="6" y2="18" />
		<line x1="6" y1="6" x2="18" y2="18" />
	</svg>
{:else}
	<span class="value-text">{value}</span>
{/if}

<style>
	.icon-yes {
		color: var(--color-primary);
	}

	/* Exclusions recede rather than shout: scanning should land on what you get,
	   not on what you do not. */
	.icon-no {
		color: var(--color-text-secondary);
		opacity: 0.45;
	}

	.value-text {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text);
		/* Limits like "Upload only" must wrap, never truncate — a clipped limit is
		   worse than no limit shown at all. */
		line-height: 1.25;
		text-wrap: balance;
	}
</style>
