<script lang="ts">
	import { page } from '$app/stores';
	import { afterNavigate } from '$app/navigation';

	const navItems = [
		{ path: '/admin', label: 'Dashboard', icon: 'home' },
		{ path: '/admin/users', label: 'Users', icon: 'users' },
		{ path: '/admin/brands', label: 'Brands', icon: 'brand' },
		{ path: '/admin/auth-keys', label: 'Auth Keys', icon: 'key' },
		{ path: '/admin/ai-keys', label: 'AI Keys', icon: 'sparkles' },
		{ path: '/admin/core-principle-questions', label: 'Core Principles Questions', icon: 'list' },
		{ path: '/admin/cms', label: 'CMS', icon: 'document' }
	];

	let sidebarOpen = false;

	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
	}

	// Close sidebar on navigation
	afterNavigate(() => {
		sidebarOpen = false;
	});
</script>

<div class="admin-layout">
	<button class="mobile-menu-btn" on:click={toggleSidebar} aria-label="Toggle navigation menu">
		{#if sidebarOpen}
			<svg
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<path d="M18 6L6 18M6 6l12 12" />
			</svg>
		{:else}
			<svg
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<line x1="3" y1="6" x2="21" y2="6" />
				<line x1="3" y1="12" x2="21" y2="12" />
				<line x1="3" y1="18" x2="21" y2="18" />
			</svg>
		{/if}
	</button>

	{#if sidebarOpen}
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div class="sidebar-overlay" on:click={() => (sidebarOpen = false)}></div>
	{/if}

	<aside class="admin-sidebar" class:open={sidebarOpen}>
		<h2 class="admin-title">Admin Settings</h2>
		<nav class="admin-nav">
			{#each navItems as item}
				<a
					href={item.path}
					class="nav-item"
					class:active={item.path === '/admin'
						? $page.url.pathname === '/admin'
						: $page.url.pathname.startsWith(item.path)}
					aria-current={$page.url.pathname === item.path ||
					(item.path !== '/admin' && $page.url.pathname.startsWith(item.path))
						? 'page'
						: undefined}
				>
					{#if item.icon === 'home'}
						<svg
							class="nav-icon"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
							<polyline points="9 22 9 12 15 12 15 22" />
						</svg>
					{:else if item.icon === 'users'}
						<svg
							class="nav-icon"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
							<circle cx="9" cy="7" r="4" />
							<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
							<path d="M16 3.13a4 4 0 0 1 0 7.75" />
						</svg>
					{:else if item.icon === 'brand'}
						<svg
							class="nav-icon"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
							<line x1="8" y1="21" x2="16" y2="21" />
							<line x1="12" y1="17" x2="12" y2="21" />
						</svg>
					{:else if item.icon === 'key'}
						<svg
							class="nav-icon"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"
							/>
						</svg>
					{:else if item.icon === 'sparkles'}
						<svg
							class="nav-icon"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M12 3v18m0-18l-3 3m3-3l3 3M3 12h18M3 12l3-3m-3 3l3 3m12-3l-3-3m3 3l-3 3" />
						</svg>
					{:else if item.icon === 'document'}
						<svg
							class="nav-icon"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
							<polyline points="14 2 14 8 20 8" />
							<line x1="16" y1="13" x2="8" y2="13" />
							<line x1="16" y1="17" x2="8" y2="17" />
							<polyline points="10 9 9 9 8 9" />
						</svg>
					{:else if item.icon === 'list'}
						<svg
							class="nav-icon"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<line x1="8" y1="6" x2="21" y2="6" />
							<line x1="8" y1="12" x2="21" y2="12" />
							<line x1="8" y1="18" x2="21" y2="18" />
							<circle cx="4" cy="6" r="1" />
							<circle cx="4" cy="12" r="1" />
							<circle cx="4" cy="18" r="1" />
						</svg>
					{/if}
					<span>{item.label}</span>
				</a>
			{/each}
		</nav>
	</aside>
	<main class="admin-content">
		<slot />
	</main>
</div>

<style>
	.admin-layout {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		background: var(--color-background);
	}

	/* Mobile hamburger button */
	.mobile-menu-btn {
		position: fixed;
		top: var(--spacing-sm);
		left: var(--spacing-sm);
		z-index: 1002;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border: none;
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text);
		cursor: pointer;
		transition: background var(--transition-fast);
		box-shadow: var(--shadow-sm);
	}

	.mobile-menu-btn:hover {
		background: var(--color-surface-hover);
	}

	/* Overlay behind sidebar on mobile */
	.sidebar-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 999;
	}

	.admin-sidebar {
		position: fixed;
		top: 0;
		left: 0;
		bottom: 0;
		width: 260px;
		background: var(--color-surface);
		border-right: 1px solid var(--color-border);
		padding: var(--spacing-xl);
		z-index: 1001;
		transform: translateX(-100%);
		transition: transform var(--transition-base);
		overflow-y: auto;
	}

	.admin-sidebar.open {
		transform: translateX(0);
	}

	.admin-title {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--color-text);
		margin-bottom: var(--spacing-xl);
		padding-top: var(--spacing-lg);
	}

	.admin-nav {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		color: var(--color-text-secondary);
		text-decoration: none;
		transition: all var(--transition-fast);
		font-size: 0.9rem;
	}

	.nav-item:hover {
		background: var(--color-background);
		color: var(--color-text);
	}

	.nav-item.active {
		background: var(--color-primary);
		color: var(--color-background);
	}

	.nav-item span {
		display: inline;
	}

	.nav-icon {
		flex-shrink: 0;
	}

	.admin-content {
		flex: 1;
		padding: var(--spacing-md);
		padding-top: calc(var(--spacing-md) + 48px);
		max-width: 100%;
		width: 100%;
		box-sizing: border-box;
		overflow-x: hidden;
	}

	@media (min-width: 769px) {
		.mobile-menu-btn {
			display: none;
		}

		.sidebar-overlay {
			display: none;
		}

		.admin-layout {
			flex-direction: row;
		}

		.admin-sidebar {
			position: sticky;
			top: 65px;
			height: calc(100vh - 65px);
			transform: none;
			flex-shrink: 0;
		}

		.admin-title {
			padding-top: 0;
			font-size: 1.5rem;
		}

		.admin-content {
			padding: var(--spacing-2xl);
			padding-top: var(--spacing-2xl);
		}
	}
</style>
