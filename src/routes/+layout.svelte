<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import {
		closeCommandPalette,
		showCommandPalette,
		toggleCommandPalette
	} from '$lib/stores/commandPalette';
	import { resolvedTheme } from '$lib/stores/theme';
	import { onMount } from 'svelte';
	import '../app.css';
	import type { PageData } from './$types';

	export let data: PageData;

	// Pages where we don't show the footer (full-screen experiences)
	$: hideFooter =
		$page.url.pathname.startsWith('/chat') ||
		$page.url.pathname.startsWith('/admin') ||
		$page.url.pathname.startsWith('/setup') ||
		$page.url.pathname.startsWith('/onboarding') ||
		$page.url.pathname.startsWith('/brand');

	// Full-screen pages that need height-constrained main (no body scroll)
	$: fullScreenPage =
		$page.url.pathname.startsWith('/chat') || $page.url.pathname.startsWith('/onboarding');

	// Subscribe to theme changes and apply to DOM
	if (browser) {
		resolvedTheme.subscribe((theme) => {
			document.documentElement.setAttribute('data-theme', theme);
		});
	}

	onMount(() => {
		// Listen for keyboard shortcut (Cmd/Ctrl + K)
		const handleKeydown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				toggleCommandPalette();
			}
			if (e.key === 'Escape') {
				closeCommandPalette();
			}
		};

		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});
</script>

<div class="app" class:full-screen={fullScreenPage}>
	<Navigation user={data.user} onCommandPaletteClick={toggleCommandPalette} />

	<main class:full-screen={fullScreenPage}>
		<slot />
	</main>

	{#if !hideFooter}
		<Footer />
	{/if}

	<CommandPalette bind:show={$showCommandPalette} hasAIProviders={data.hasAIProviders} />
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
	}

	.app.full-screen {
		height: 100vh;
		max-height: 100vh;
		overflow: hidden;
	}

	main {
		flex: 1;
		width: 100%;
		display: flex;
		flex-direction: column;
		padding-bottom: var(--spacing-2xl);
	}

	main.full-screen {
		padding-bottom: 0;
		overflow: hidden;
		min-height: 0;
	}
</style>
