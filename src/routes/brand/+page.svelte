<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import type { BrandProfile } from '$lib/types/onboarding';

	export let data: PageData;
	// SvelteKit page data (used for server-side auth redirect)
	$: _pageData = data;
	void _pageData;

	let brands: BrandProfile[] = [];
	let isLoading = true;
	let error: string | null = null;
	let loadedFonts = new Set<string>();

	function loadGoogleFont(family: string) {
		if (!family || loadedFonts.has(family)) return;
		loadedFonts.add(family);
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;700&display=swap`;
		document.head.appendChild(link);
	}

	$: if (brands.length > 0) {
		for (const b of brands) {
			if (b.typographyLogo) loadGoogleFont(b.typographyLogo);
			if (b.typographyHeading) loadGoogleFont(b.typographyHeading);
			if (b.typographyBody) loadGoogleFont(b.typographyBody);
		}
	}

	// Action states
	let archivingId: string | null = null;
	let confirmArchiveId: string | null = null;
	let creatingBrand = false;

	// Archived brands state
	let archivedBrands: BrandProfile[] = [];
	let showArchived = false;
	let isLoadingArchived = false;
	let restoringId: string | null = null;
	let confirmRestoreId: string | null = null;

	// Sort/filter state
	type SortMode =
		| 'custom'
		| 'newest'
		| 'oldest'
		| 'most-complete'
		| 'least-complete'
		| 'alpha-az'
		| 'alpha-za';
	let sortMode: SortMode = 'custom';

	$: displayBrands = sortBrands(brands, sortMode);

	function sortBrands(list: BrandProfile[], mode: SortMode): BrandProfile[] {
		if (mode === 'custom') return list;
		const sorted = [...list];
		switch (mode) {
			case 'newest':
				return sorted.sort(
					(a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
				);
			case 'oldest':
				return sorted.sort(
					(a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
				);
			case 'most-complete':
				return sorted.sort((a, b) => getCompletionStats(b).percent - getCompletionStats(a).percent);
			case 'least-complete':
				return sorted.sort((a, b) => getCompletionStats(a).percent - getCompletionStats(b).percent);
			case 'alpha-az':
				return sorted.sort((a, b) => (a.brandName || '').localeCompare(b.brandName || ''));
			case 'alpha-za':
				return sorted.sort((a, b) => (b.brandName || '').localeCompare(a.brandName || ''));
			default:
				return sorted;
		}
	}

	// Drag-and-drop state
	let dragIndex: number | null = null;
	let dropSlot: number | null = null; // insertion index (between cards)
	let isSavingOrder = false;
	let isDragging = false;
	let gridEl: HTMLElement;
	let indicatorStyle = '';

	// Touch drag state
	let touchDragging = false;
	let touchClone: HTMLElement | null = null;
	let touchStartTimer: ReturnType<typeof setTimeout> | null = null;
	let touchStartX = 0;
	let touchStartY = 0;

	function getCardElements(): HTMLElement[] {
		if (!gridEl) return [];
		return Array.from(gridEl.querySelectorAll('.brand-card'));
	}

	function calcDropSlot(clientX: number, clientY: number) {
		const cards = getCardElements();
		if (cards.length === 0) return;

		// Build an array of card rects
		const rects = cards.map((c) => c.getBoundingClientRect());

		// Group cards by visual row (same top offset ± tolerance)
		const rows: { indices: number[]; rects: DOMRect[] }[] = [];
		for (let i = 0; i < rects.length; i++) {
			const r = rects[i];
			const lastRow = rows[rows.length - 1];
			if (lastRow && Math.abs(r.top - lastRow.rects[0].top) < 20) {
				lastRow.indices.push(i);
				lastRow.rects.push(r);
			} else {
				rows.push({ indices: [i], rects: [r] });
			}
		}

		// Find closest gap
		let bestSlot: number | null = null;
		let bestDist = Infinity;
		let bestX = 0;
		let bestY = 0;
		let bestH = 0;

		for (const row of rows) {
			const rowTop = Math.min(...row.rects.map((r) => r.top));
			const rowBottom = Math.max(...row.rects.map((r) => r.bottom));
			const rowH = rowBottom - rowTop;

			// Check gap before each card in this row + gap after last card
			for (let j = 0; j <= row.indices.length; j++) {
				const slotIndex = j === 0 ? row.indices[0] : row.indices[j - 1] + 1;

				// Skip no-op positions (adjacent to dragged card)
				if (dragIndex !== null && (slotIndex === dragIndex || slotIndex === dragIndex + 1))
					continue;

				let gapX: number;
				if (j === 0) {
					gapX = row.rects[0].left - 4;
				} else if (j === row.indices.length) {
					gapX = row.rects[j - 1].right + 4;
				} else {
					gapX = (row.rects[j - 1].right + row.rects[j].left) / 2;
				}
				const gapY = rowTop + rowH / 2;

				const dist = Math.hypot(clientX - gapX, clientY - gapY);
				if (dist < bestDist) {
					bestDist = dist;
					bestSlot = slotIndex;
					bestX = gapX;
					bestY = rowTop;
					bestH = rowH;
				}
			}
		}

		// Only show indicator if cursor is reasonably close
		if (bestSlot !== null && bestDist < 300) {
			dropSlot = bestSlot;
			const gridRect = gridEl.getBoundingClientRect();
			const x = bestX - gridRect.left;
			const y = bestY - gridRect.top;
			indicatorStyle = `left: ${x}px; top: ${y}px; height: ${bestH}px; opacity: 1;`;
		} else {
			dropSlot = null;
			indicatorStyle = 'opacity: 0;';
		}
	}

	function handleDragStart(event: DragEvent, index: number) {
		if (sortMode !== 'custom') return;
		dragIndex = index;
		isDragging = true;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', String(index));
		}
	}

	function handleGridDragOver(event: DragEvent) {
		if (!isDragging || dragIndex === null) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		calcDropSlot(event.clientX, event.clientY);
	}

	async function handleGridDrop(event: DragEvent) {
		event.preventDefault();
		if (dragIndex === null || dropSlot === null) {
			handleDragEnd();
			return;
		}
		if (dropSlot === dragIndex || dropSlot === dragIndex + 1) {
			handleDragEnd();
			return;
		}

		const reordered = [...brands];
		const [moved] = reordered.splice(dragIndex, 1);
		const insertAt = dropSlot > dragIndex ? dropSlot - 1 : dropSlot;
		reordered.splice(insertAt, 0, moved);
		brands = reordered;
		handleDragEnd();
		await saveOrder(reordered);
	}

	function handleDragEnd() {
		dragIndex = null;
		dropSlot = null;
		isDragging = false;
		indicatorStyle = 'opacity: 0;';
	}

	// Touch drag support — long press to initiate
	function handleTouchStart(event: TouchEvent, index: number) {
		if (sortMode !== 'custom') return;
		const touch = event.touches[0];
		touchStartX = touch.clientX;
		touchStartY = touch.clientY;

		touchStartTimer = setTimeout(() => {
			touchDragging = true;
			isDragging = true;
			dragIndex = index;

			const card = event.currentTarget as HTMLElement;
			const rect = card.getBoundingClientRect();

			touchClone = card.cloneNode(true) as HTMLElement;
			touchClone.classList.add('touch-drag-clone');
			touchClone.style.width = `${rect.width}px`;
			touchClone.style.height = `${rect.height}px`;
			touchClone.style.left = `${rect.left}px`;
			touchClone.style.top = `${rect.top}px`;
			document.body.appendChild(touchClone);

			if (navigator.vibrate) navigator.vibrate(30);
		}, 250);

		const cancelTouch = () => {
			if (touchStartTimer) {
				clearTimeout(touchStartTimer);
				touchStartTimer = null;
			}
		};

		const earlyMove = (e: TouchEvent) => {
			const dx = Math.abs(e.touches[0].clientX - touchStartX);
			const dy = Math.abs(e.touches[0].clientY - touchStartY);
			if (!touchDragging && (dx > 8 || dy > 8)) {
				cancelTouch();
				document.removeEventListener('touchmove', earlyMove);
			}
		};

		document.addEventListener('touchmove', earlyMove, { passive: true });
		document.addEventListener(
			'touchend',
			() => {
				cancelTouch();
				document.removeEventListener('touchmove', earlyMove);
			},
			{ once: true }
		);
	}

	function handleTouchMove(event: TouchEvent) {
		if (!touchDragging || dragIndex === null) return;
		event.preventDefault();

		const touch = event.touches[0];

		if (touchClone) {
			touchClone.style.left = `${touch.clientX - touchClone.offsetWidth / 2}px`;
			touchClone.style.top = `${touch.clientY - touchClone.offsetHeight / 2}px`;
		}

		calcDropSlot(touch.clientX, touch.clientY);
	}

	async function handleTouchEnd() {
		if (!touchDragging) return;

		if (touchClone) {
			touchClone.remove();
			touchClone = null;
		}

		if (
			dragIndex !== null &&
			dropSlot !== null &&
			dropSlot !== dragIndex &&
			dropSlot !== dragIndex + 1
		) {
			const reordered = [...brands];
			const [moved] = reordered.splice(dragIndex, 1);
			const insertAt = dropSlot > dragIndex ? dropSlot - 1 : dropSlot;
			reordered.splice(insertAt, 0, moved);
			brands = reordered;
			await saveOrder(reordered);
		}

		touchDragging = false;
		isDragging = false;
		dragIndex = null;
		dropSlot = null;
		indicatorStyle = 'opacity: 0;';
	}

	async function saveOrder(ordered: BrandProfile[]) {
		isSavingOrder = true;
		try {
			const res = await fetch('/api/brand/profiles/reorder', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ orderedIds: ordered.map((b) => b.id) })
			});
			if (!res.ok) throw new Error('Failed to save order');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save order';
		} finally {
			isSavingOrder = false;
		}
	}

	onMount(async () => {
		await loadBrands();
	});

	async function loadBrands() {
		isLoading = true;
		error = null;
		try {
			const res = await fetch('/api/brand/profiles');
			if (!res.ok) throw new Error('Failed to load brands');
			const result = await res.json();
			brands = result.profiles || [];
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load brands';
		} finally {
			isLoading = false;
		}
	}

	async function archiveBrand(profileId: string) {
		archivingId = profileId;
		try {
			const res = await fetch(`/api/brand/profile/${profileId}`, {
				method: 'DELETE'
			});

			if (!res.ok) throw new Error('Failed to archive brand');

			confirmArchiveId = null;
			await loadBrands();
			// Refresh archived list if it's visible
			if (showArchived) {
				await loadArchivedBrands();
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to archive';
		} finally {
			archivingId = null;
		}
	}

	function getCompletionStats(brand: BrandProfile) {
		const fields = [
			brand.brandName,
			brand.tagline,
			brand.missionStatement,
			brand.visionStatement,
			brand.elevatorPitch,
			brand.brandArchetype,
			brand.brandPersonalityTraits,
			brand.toneOfVoice,
			brand.communicationStyle,
			brand.targetAudience,
			brand.customerPainPoints,
			brand.valueProposition,
			brand.primaryColor,
			brand.secondaryColor,
			brand.accentColor,
			brand.backgroundColor,
			brand.surfaceColor,
			brand.textColor,
			brand.textSecondaryColor,
			brand.borderColor,
			brand.successColor,
			brand.warningColor,
			brand.errorColor,
			brand.colorPalette,
			brand.typographyLogo,
			brand.typographyHeading,
			brand.typographyBody,
			brand.logoConcept,
			brand.industry,
			brand.competitors,
			brand.uniqueSellingPoints,
			brand.marketPosition,
			brand.originStory,
			brand.brandValues,
			brand.brandPromise
		];

		const filled = fields.filter((f) => f != null && f !== '').length;
		const total = fields.length;
		return { filled, total, percent: Math.round((filled / total) * 100) };
	}

	function formatDate(dateStr: string) {
		const d = new Date(dateStr);
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	async function createNewBrand() {
		creatingBrand = true;
		error = null;
		try {
			const res = await fetch('/api/onboarding/start', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});
			if (!res.ok) throw new Error('Failed to create brand');
			const data = await res.json();
			await goto(`/onboarding?brand=${data.profile.id}`);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create brand';
		} finally {
			creatingBrand = false;
		}
	}

	async function toggleArchived() {
		showArchived = !showArchived;
		if (showArchived && archivedBrands.length === 0) {
			await loadArchivedBrands();
		}
	}

	async function loadArchivedBrands() {
		isLoadingArchived = true;
		try {
			const res = await fetch('/api/brand/profiles/archived');
			if (!res.ok) throw new Error('Failed to load archived brands');
			const result = await res.json();
			archivedBrands = result.profiles || [];
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load archived brands';
		} finally {
			isLoadingArchived = false;
		}
	}

	async function restoreBrand(profileId: string) {
		restoringId = profileId;
		try {
			const res = await fetch(`/api/brand/profile/${profileId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'unarchive' })
			});

			if (!res.ok) throw new Error('Failed to restore brand');

			confirmRestoreId = null;
			await loadBrands();
			await loadArchivedBrands();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to restore brand';
		} finally {
			restoringId = null;
		}
	}
</script>

<svelte:head>
	<title>Brands — NebulaKit</title>
	<meta name="description" content="Manage all your brand profiles in one place." />
</svelte:head>

<div class="brands-page">
	<header class="page-header">
		<div class="header-left">
			<h1 class="page-title">Brands</h1>
			<p class="page-subtitle">Manage your brand profiles</p>
		</div>
		<div class="header-actions">
			{#if brands.length > 1}
				<div class="sort-control">
					<label for="sort-select" class="sort-label">Sort</label>
					<select id="sort-select" class="sort-select" bind:value={sortMode}>
						<option value="custom">Custom Order</option>
						<option value="newest">Newest First</option>
						<option value="oldest">Oldest First</option>
						<option value="most-complete">Most Complete</option>
						<option value="least-complete">Least Complete</option>
						<option value="alpha-az">A → Z</option>
						<option value="alpha-za">Z → A</option>
					</select>
					{#if isSavingOrder}
						<span class="sort-saving">Saving…</span>
					{/if}
				</div>
			{/if}
			<button class="create-button" on:click={createNewBrand} disabled={creatingBrand}>
				{#if creatingBrand}
					<div class="button-spinner"></div>
					Creating…
				{:else}
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<line x1="12" y1="5" x2="12" y2="19" />
						<line x1="5" y1="12" x2="19" y2="12" />
					</svg>
					New Brand
				{/if}
			</button>
		</div>
	</header>

	{#if error}
		<div class="error-banner">
			<span>{error}</span>
			<button on:click={() => (error = null)} aria-label="Dismiss error">×</button>
		</div>
	{/if}

	{#if isLoading}
		<div class="loading-state">
			<div class="spinner"></div>
			<p>Loading your brands...</p>
		</div>
	{:else if brands.length === 0}
		<div class="empty-state">
			<div class="empty-icon">✨</div>
			<h2>No Brands Yet</h2>
			<p>Start building your first brand with our AI-powered Brand Architect.</p>
			<button class="cta-button" on:click={createNewBrand} disabled={creatingBrand}>
				{creatingBrand ? 'Creating…' : 'Launch Brand Architect →'}
			</button>
		</div>
	{:else}
		<div
			class="brands-grid"
			class:is-dragging={isDragging}
			bind:this={gridEl}
			on:dragover={handleGridDragOver}
			on:drop={handleGridDrop}
			role="list"
			aria-label="Brand cards"
		>
			<!-- Floating drop indicator line -->
			{#if isDragging}
				<div class="drop-indicator-line" style={indicatorStyle}></div>
			{/if}
			{#each displayBrands as brand, i (brand.id)}
				{@const stats = getCompletionStats(brand)}
				<article
					class="brand-card"
					class:has-logo={brand.logoUrl}
					class:dragging={dragIndex === i}
					draggable={sortMode === 'custom'}
					on:dragstart={(e) => handleDragStart(e, i)}
					on:dragend={handleDragEnd}
					on:touchstart={(e) => handleTouchStart(e, i)}
					on:touchmove|nonpassive={handleTouchMove}
					on:touchend={handleTouchEnd}
					style="{brand.typographyBody
						? `font-family: '${brand.typographyBody}', sans-serif;`
						: ''}{brand.logoUrl ? `--card-bg-image: url(${brand.logoUrl});` : ''}"
				>
					{#if confirmArchiveId === brand.id}
						<div class="close-confirm">
							<span>Archive?</span>
							<button
								class="confirm-yes"
								disabled={archivingId === brand.id}
								on:click|stopPropagation={() => archiveBrand(brand.id)}
							>
								{archivingId === brand.id ? '...' : 'Yes'}
							</button>
							<button class="confirm-no" on:click|stopPropagation={() => (confirmArchiveId = null)}>
								No
							</button>
						</div>
					{:else}
						<button
							class="close-btn"
							title="Archive brand"
							on:click|stopPropagation={() => (confirmArchiveId = brand.id)}
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<line x1="18" y1="6" x2="6" y2="18" />
								<line x1="6" y1="6" x2="18" y2="18" />
							</svg>
						</button>
					{/if}
					{#if sortMode === 'custom'}
						<div class="drag-handle" aria-label="Drag to reorder">
							<svg
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<circle cx="9" cy="6" r="1" fill="currentColor" /><circle
									cx="15"
									cy="6"
									r="1"
									fill="currentColor"
								/>
								<circle cx="9" cy="12" r="1" fill="currentColor" /><circle
									cx="15"
									cy="12"
									r="1"
									fill="currentColor"
								/>
								<circle cx="9" cy="18" r="1" fill="currentColor" /><circle
									cx="15"
									cy="18"
									r="1"
									fill="currentColor"
								/>
							</svg>
						</div>
					{/if}
					<a href="/brand/{brand.id}" class="card-link">
						<h2
							class="brand-name"
							class:codename={!brand.brandNameConfirmed}
							style={brand.typographyLogo
								? `font-family: '${brand.typographyLogo}', sans-serif`
								: brand.typographyHeading
									? `font-family: '${brand.typographyHeading}', sans-serif`
									: ''}
						>
							{#if brand.logoUrl}
								<img src={brand.logoUrl} alt="" class="brand-name-icon" />
							{/if}
							{brand.brandName || 'New Brand'}
							{#if !brand.brandNameConfirmed}
								<span class="codename-badge">Codename</span>
							{/if}
						</h2>

						<div class="brand-colors">
							{#if brand.primaryColor}
								<span class="color-dot" style="background-color: {brand.primaryColor}"></span>
							{/if}
							{#if brand.secondaryColor}
								<span class="color-dot" style="background-color: {brand.secondaryColor}"></span>
							{/if}
							{#if brand.accentColor}
								<span class="color-dot" style="background-color: {brand.accentColor}"></span>
							{/if}
							{#if !brand.primaryColor && !brand.secondaryColor && !brand.accentColor && !brand.logoUrl}
								<span class="color-dot placeholder-dot"></span>
							{/if}
						</div>

						{#if brand.tagline}
							<p
								class="brand-tagline"
								style={brand.typographyBody
									? `font-family: '${brand.typographyBody}', sans-serif`
									: ''}
							>
								{brand.tagline}
							</p>
						{/if}

						{#if brand.industry}
							<span class="brand-industry">{brand.industry}</span>
						{/if}

						<div class="card-bottom">
							<div class="completion-bar">
								<div class="completion-info">
									<span class="completion-text">{stats.percent}% complete</span>
									<span class="completion-count">{stats.filled}/{stats.total}</span>
								</div>
								<div class="progress-track">
									<div class="progress-fill" style="width: {stats.percent}%"></div>
								</div>
							</div>

							<div class="card-meta">
								<span class="meta-date">Updated {formatDate(brand.updatedAt)}</span>
							</div>
						</div>
					</a>
				</article>
			{/each}
		</div>
	{/if}

	<!-- Archived Brands Section -->
	<section class="archived-section">
		<button class="archived-toggle" on:click={toggleArchived} aria-expanded={showArchived}>
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="toggle-icon"
				class:rotated={showArchived}
			>
				<polyline points="6 9 12 15 18 9" />
			</svg>
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M21 8V21H3V8" />
				<rect x="1" y="3" width="22" height="5" />
				<line x1="10" y1="12" x2="14" y2="12" />
			</svg>
			Archived Brands
			{#if showArchived && archivedBrands.length > 0}
				<span class="archived-count">{archivedBrands.length}</span>
			{/if}
		</button>

		{#if showArchived}
			{#if isLoadingArchived}
				<div class="archived-loading">
					<div class="spinner small"></div>
					<span>Loading archived brands...</span>
				</div>
			{:else if archivedBrands.length === 0}
				<div class="archived-empty">
					<p>No archived brands</p>
				</div>
			{:else}
				<div class="archived-grid">
					{#each archivedBrands as brand (brand.id)}
						<article class="archived-card">
							<div class="archived-card-content">
								<div class="archived-brand-info">
									<div class="brand-colors">
										{#if brand.primaryColor}
											<span class="color-dot" style="background-color: {brand.primaryColor}"></span>
										{/if}
										{#if brand.secondaryColor}
											<span class="color-dot" style="background-color: {brand.secondaryColor}"
											></span>
										{/if}
										{#if brand.accentColor}
											<span class="color-dot" style="background-color: {brand.accentColor}"></span>
										{/if}
									</div>
									<div class="archived-text">
										<h3 class="archived-brand-name" class:codename={!brand.brandNameConfirmed}>
											{brand.brandName || 'Unnamed Brand'}
											{#if !brand.brandNameConfirmed}
												<span class="codename-badge">Codename</span>
											{/if}
										</h3>
										{#if brand.industry}
											<span class="brand-industry">{brand.industry}</span>
										{/if}
										<span class="meta-date">Archived {formatDate(brand.updatedAt)}</span>
									</div>
								</div>
								<div class="archived-actions">
									{#if confirmRestoreId === brand.id}
										<div class="confirm-archive">
											<span>Restore?</span>
											<button
												class="confirm-yes restore"
												disabled={restoringId === brand.id}
												on:click={() => restoreBrand(brand.id)}
											>
												{restoringId === brand.id ? '...' : 'Yes'}
											</button>
											<button class="confirm-no" on:click={() => (confirmRestoreId = null)}>
												No
											</button>
										</div>
									{:else}
										<button
											class="restore-btn"
											title="Restore brand"
											on:click={() => (confirmRestoreId = brand.id)}
										>
											<svg
												width="14"
												height="14"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
											>
												<polyline points="1 4 1 10 7 10" />
												<path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
											</svg>
											Restore
										</button>
									{/if}
								</div>
							</div>
						</article>
					{/each}
				</div>
			{/if}
		{/if}
	</section>
</div>

<style>
	.brands-page {
		max-width: 1200px;
		margin: 0 auto;
		padding: var(--spacing-lg) var(--spacing-md);
		min-height: calc(100vh - 60px);
	}

	/* Header */
	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-xl);
	}

	.page-title {
		font-size: 1.8rem;
		font-weight: 800;
		color: var(--color-text);
		margin: 0;
		line-height: 1.2;
	}

	.page-subtitle {
		color: var(--color-text-secondary);
		font-size: 0.9rem;
		margin: var(--spacing-xs) 0 0;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	/* Sort controls */
	.sort-control {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.sort-label {
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--color-text-secondary);
		white-space: nowrap;
	}

	.sort-select {
		font-size: 0.8rem;
		padding: 4px 8px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background-color: var(--color-surface);
		color: var(--color-text);
		cursor: pointer;
	}

	.sort-saving {
		font-size: 0.7rem;
		color: var(--color-text-secondary);
		white-space: nowrap;
	}

	.create-button {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-sm) var(--spacing-lg);
		background-color: var(--color-primary);
		color: var(--color-background);
		border: none;
		border-radius: var(--radius-md);
		cursor: pointer;
		font-weight: 600;
		font-size: 0.85rem;
		white-space: nowrap;
		transition: background-color var(--transition-fast);
	}

	.create-button:hover:not(:disabled) {
		background-color: var(--color-primary-hover);
	}

	.create-button:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	.button-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid var(--color-background);
		border-top-color: transparent;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	/* Error banner */
	.error-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background-color: var(--color-error);
		color: var(--color-background);
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-md);
		font-size: 0.85rem;
	}

	.error-banner button {
		background: none;
		border: none;
		color: var(--color-background);
		cursor: pointer;
		font-size: 1.2rem;
		padding: 0 var(--spacing-xs);
	}

	/* Loading */
	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 400px;
		gap: var(--spacing-md);
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--color-border);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.loading-state p {
		color: var(--color-text-secondary);
		font-size: 0.9rem;
	}

	/* Empty state */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 400px;
		text-align: center;
		gap: var(--spacing-sm);
	}

	.empty-icon {
		font-size: 3rem;
		margin-bottom: var(--spacing-sm);
	}

	.empty-state h2 {
		color: var(--color-text);
		font-size: 1.5rem;
		font-weight: 700;
	}

	.empty-state p {
		color: var(--color-text-secondary);
		font-size: 0.95rem;
		max-width: 360px;
		line-height: 1.5;
	}

	.cta-button {
		display: inline-block;
		margin-top: var(--spacing-md);
		padding: var(--spacing-sm) var(--spacing-xl);
		background-color: var(--color-primary);
		color: var(--color-background);
		border: none;
		border-radius: var(--radius-md);
		cursor: pointer;
		font-weight: 600;
		font-size: 0.9rem;
		transition: background-color var(--transition-fast);
	}

	.cta-button:hover:not(:disabled) {
		background-color: var(--color-primary-hover);
	}

	.cta-button:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	/* Brands grid */
	.brands-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--spacing-md);
		position: relative;
	}

	@media (min-width: 640px) {
		.brands-grid {
			grid-template-columns: 1fr 1fr;
		}
	}

	@media (min-width: 960px) {
		.brands-grid {
			grid-template-columns: 1fr 1fr 1fr;
		}
	}

	/* Brand card */
	.brand-card {
		position: relative;
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		transition:
			border-color var(--transition-fast),
			box-shadow var(--transition-fast);
	}

	.brand-card.has-logo::before {
		content: '';
		position: absolute;
		inset: 0;
		background-image: var(--card-bg-image);
		background-position: center;
		background-repeat: no-repeat;
		background-size: cover;
		opacity: 0.12;
		pointer-events: none;
		z-index: 0;
	}

	.brand-card:hover {
		border-color: var(--color-primary);
		box-shadow: var(--shadow-md);
	}

	.brand-card.dragging {
		opacity: 0.25;
		transform: scale(0.96);
		border: 2px dashed var(--color-text-secondary);
		box-shadow: none;
	}

	.brand-card.dragging:hover {
		box-shadow: none;
		border-color: var(--color-text-secondary);
	}

	/* Floating drop indicator — a vertical line that follows the cursor between cards */
	.drop-indicator-line {
		position: absolute;
		width: 3px;
		background-color: var(--color-primary);
		border-radius: 3px;
		z-index: 10;
		pointer-events: none;
		opacity: 0;
		transition:
			opacity 0.12s ease,
			left 0.1s ease,
			top 0.1s ease,
			height 0.1s ease;
		transform: translateX(-50%);
	}

	.drop-indicator-line::before,
	.drop-indicator-line::after {
		content: '';
		position: absolute;
		left: 50%;
		width: 10px;
		height: 10px;
		background-color: var(--color-primary);
		border-radius: 50%;
		transform: translateX(-50%);
		box-shadow: 0 0 8px var(--color-primary);
	}

	.drop-indicator-line::before {
		top: -4px;
	}

	.drop-indicator-line::after {
		bottom: -4px;
	}

	/* Touch drag clone */
	:global(.touch-drag-clone) {
		position: fixed;
		z-index: 9999;
		opacity: 0.8;
		pointer-events: none;
		border-radius: var(--radius-lg);
		box-shadow:
			0 20px 60px rgba(0, 0, 0, 0.3),
			0 0 0 2px var(--color-primary);
		transform: rotate(1.5deg) scale(1.05);
		transition: none;
	}

	.drag-handle {
		position: absolute;
		top: var(--spacing-xs);
		left: var(--spacing-xs);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		color: var(--color-text-secondary);
		opacity: 0;
		cursor: grab;
		z-index: 1;
		transition: opacity var(--transition-fast);
	}

	.brand-card:hover .drag-handle {
		opacity: 0.6;
	}

	.drag-handle:hover {
		opacity: 1 !important;
	}

	.card-link {
		display: flex;
		flex-direction: column;
		padding: var(--spacing-lg);
		text-decoration: none;
		color: inherit;
		position: relative;
		flex: 1;
	}

	.card-bottom {
		margin-top: auto;
	}

	.brand-card.has-logo .card-link {
		position: relative;
		z-index: 1;
	}

	.brand-colors {
		display: flex;
		gap: 6px;
		margin-bottom: var(--spacing-sm);
	}

	.color-dot {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 1px solid var(--color-border);
	}

	.placeholder-dot {
		background-color: var(--color-border);
	}

	.brand-name-icon {
		width: 1.35rem;
		height: 1.35rem;
		object-fit: contain;
		border-radius: var(--radius-sm);
		flex-shrink: 0;
	}

	.brand-name {
		font-size: 1.35rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0 0 var(--spacing-xs);
		line-height: 1.3;
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		flex-wrap: wrap;
	}

	.brand-name.codename {
		font-style: italic;
	}

	.codename-badge {
		font-size: 0.6rem;
		font-weight: 500;
		font-style: normal;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-secondary);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: 0.1em 0.4em;
		white-space: nowrap;
	}

	.brand-tagline {
		color: var(--color-text-secondary);
		font-size: 0.8rem;
		margin: 0 0 var(--spacing-xs);
		font-style: italic;
		line-height: 1.4;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.brand-industry {
		display: inline-block;
		font-size: 0.7rem;
		font-weight: 500;
		color: var(--color-text-secondary);
		background-color: var(--color-border);
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		margin-bottom: var(--spacing-sm);
	}

	/* Completion */
	.completion-bar {
		margin-top: var(--spacing-sm);
	}

	.completion-info {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 4px;
	}

	.completion-text {
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--color-text-secondary);
	}

	.completion-count {
		font-size: 0.7rem;
		color: var(--color-text-secondary);
	}

	.progress-track {
		height: 4px;
		background-color: var(--color-border);
		border-radius: 2px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--color-primary), var(--color-secondary));
		border-radius: 2px;
		transition: width var(--transition-base);
	}

	.card-meta {
		margin-top: var(--spacing-sm);
	}

	.meta-date {
		font-size: 0.7rem;
		color: var(--color-text-secondary);
	}

	/* Close button (top-right X) */
	.close-btn {
		position: absolute;
		top: var(--spacing-xs);
		right: var(--spacing-xs);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		background: none;
		border: none;
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		cursor: pointer;
		opacity: 0;
		z-index: 2;
		transition:
			opacity var(--transition-fast),
			color var(--transition-fast),
			background-color var(--transition-fast);
	}

	.brand-card:hover .close-btn {
		opacity: 0.7;
	}

	.close-btn:hover {
		opacity: 1 !important;
		color: var(--color-error);
		background-color: var(--color-surface-hover);
	}

	/* Close confirm (top-right) */
	.close-confirm {
		position: absolute;
		top: var(--spacing-xs);
		right: var(--spacing-xs);
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: 2px var(--spacing-xs);
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		z-index: 2;
	}

	.confirm-yes,
	.confirm-no {
		padding: 2px 8px;
		font-size: 0.7rem;
		font-weight: 600;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
		background: none;
		transition: all var(--transition-fast);
	}

	.confirm-yes {
		color: var(--color-error);
		border-color: var(--color-error);
	}

	.confirm-yes.restore {
		color: var(--color-primary);
		border-color: var(--color-primary);
	}

	.confirm-yes:hover {
		background-color: var(--color-error);
		color: var(--color-background);
	}

	.confirm-yes.restore:hover {
		background-color: var(--color-primary);
		color: var(--color-background);
	}

	.confirm-no {
		color: var(--color-text-secondary);
	}

	.confirm-no:hover {
		background-color: var(--color-surface-hover);
	}

	/* Archived brands section */
	.archived-section {
		margin-top: var(--spacing-xl);
		border-top: 1px solid var(--color-border);
		padding-top: var(--spacing-md);
	}

	.archived-toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		background: none;
		border: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		font-size: 0.85rem;
		font-weight: 500;
		padding: var(--spacing-xs) 0;
		transition: color var(--transition-fast);
	}

	.archived-toggle:hover {
		color: var(--color-text);
	}

	.toggle-icon {
		transition: transform var(--transition-fast);
	}

	.toggle-icon.rotated {
		transform: rotate(180deg);
	}

	.archived-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		font-size: 0.7rem;
		font-weight: 600;
		background-color: var(--color-border);
		color: var(--color-text-secondary);
		border-radius: 10px;
	}

	.archived-loading {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-md) 0;
		color: var(--color-text-secondary);
		font-size: 0.85rem;
	}

	.spinner.small {
		width: 16px;
		height: 16px;
		border-width: 2px;
	}

	.archived-empty {
		padding: var(--spacing-md) 0;
	}

	.archived-empty p {
		color: var(--color-text-secondary);
		font-size: 0.85rem;
		font-style: italic;
	}

	.archived-grid {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
		margin-top: var(--spacing-sm);
	}

	.archived-card {
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		opacity: 0.8;
		transition:
			opacity var(--transition-fast),
			border-color var(--transition-fast);
	}

	.archived-card:hover {
		opacity: 1;
		border-color: var(--color-primary);
	}

	.archived-card-content {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm) var(--spacing-md);
		gap: var(--spacing-md);
	}

	.archived-brand-info {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		min-width: 0;
	}

	.archived-text {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
		min-width: 0;
	}

	.archived-brand-name {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.archived-brand-name.codename {
		font-style: italic;
	}

	.archived-actions {
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}

	.restore-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		background: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		cursor: pointer;
		font-size: 0.75rem;
		font-weight: 500;
		transition:
			color var(--transition-fast),
			border-color var(--transition-fast),
			background-color var(--transition-fast);
	}

	.restore-btn:hover {
		color: var(--color-primary);
		border-color: var(--color-primary);
		background-color: var(--color-surface-hover);
	}

	@media (max-width: 480px) {
		.page-header {
			flex-direction: column;
		}

		.page-title {
			font-size: 1.4rem;
		}

		.archived-card-content {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
