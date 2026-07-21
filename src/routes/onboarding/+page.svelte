<script lang="ts">
	import { page } from '$app/stores';
	import OnboardingChat from '$lib/components/OnboardingChat.svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	// Get optional brand ID from query parameter for continuing onboarding on a specific brand
	$: brandId = $page.url.searchParams.get('brand') || undefined;
</script>

<svelte:head>
	<title>Brand Architect — Build Your Brand | NebulaKit</title>
	<meta
		name="description"
		content="AI-powered brand building wizard using psychology, philosophy, and world-class marketing expertise."
	/>
</svelte:head>

<div class="onboarding-page">
	{#if data.hasAIProviders}
		<OnboardingChat {brandId} />
	{:else}
		<div class="no-ai-notice">
			<div class="notice-content">
				<span class="notice-icon">⚙️</span>
				<h2>AI Provider Required</h2>
				<p>
					The Brand Architect needs an AI provider to work. Please configure an OpenAI API key in
					the admin panel first.
				</p>
				<a href="/admin" class="admin-link">Go to Admin Panel →</a>
			</div>
		</div>
	{/if}
</div>

<style>
	.onboarding-page {
		flex: 1;
		display: flex;
		flex-direction: column;
		height: calc(100vh - 60px);
		overflow: hidden;
	}

	.no-ai-notice {
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
		font-size: 2.5rem;
		margin-bottom: var(--spacing-md);
		display: block;
	}

	.notice-content h2 {
		color: var(--color-text);
		margin-bottom: var(--spacing-sm);
		font-size: 1.3rem;
	}

	.notice-content p {
		color: var(--color-text-secondary);
		font-size: 0.85rem;
		line-height: 1.6;
		margin-bottom: var(--spacing-lg);
	}

	.admin-link {
		display: inline-block;
		padding: var(--spacing-sm) var(--spacing-lg);
		background-color: var(--color-primary);
		color: var(--color-background);
		border-radius: var(--radius-md);
		text-decoration: none;
		font-weight: 600;
		font-size: 0.85rem;
		transition: background-color var(--transition-fast);
	}

	.admin-link:hover {
		background-color: var(--color-primary-hover);
	}
</style>
