<script lang="ts">
	import FileArchive from '$lib/components/FileArchive.svelte';
	import type { PageData } from './$types';

	export let data: PageData;
</script>

<svelte:head>
	<title>File Archive — Brand Architect | NebulaKit</title>
	<meta
		name="description"
		content="Browse all files from your Brand Architect AI conversations — uploads, AI-generated images, audio, and video."
	/>
</svelte:head>

<div class="archive-page">
	{#if data.brandProfileId}
		<FileArchive brandProfileId={data.brandProfileId} />
	{:else}
		<div class="no-brand-notice">
			<div class="notice-content">
				<span class="notice-icon">📂</span>
				<h2>No Brand Profile Found</h2>
				<p>Start a brand onboarding session first to create your file archive.</p>
				<a href="/onboarding" class="start-link">Start Brand Architect →</a>
			</div>
		</div>
	{/if}
</div>

<style>
	.archive-page {
		flex: 1;
		display: flex;
		flex-direction: column;
		height: calc(100vh - 60px);
		overflow: hidden;
	}

	.no-brand-notice {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
		padding: var(--spacing-xl);
	}

	.notice-content {
		text-align: center;
		max-width: 400px;
	}

	.notice-icon {
		font-size: 3rem;
		display: block;
		margin-bottom: var(--spacing-md);
	}

	.notice-content h2 {
		font-size: 1.2rem;
		color: var(--color-text);
		margin-bottom: var(--spacing-sm);
	}

	.notice-content p {
		font-size: 0.85rem;
		color: var(--color-text-secondary);
		margin-bottom: var(--spacing-md);
		line-height: 1.5;
	}

	.start-link {
		display: inline-block;
		padding: var(--spacing-sm) var(--spacing-lg);
		background-color: var(--color-primary);
		color: var(--color-background);
		text-decoration: none;
		border-radius: var(--radius-md);
		font-size: 0.85rem;
		font-weight: 500;
		transition: background-color var(--transition-fast);
	}

	.start-link:hover {
		background-color: var(--color-primary-hover);
	}
</style>
