<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	let mode: 'light' | 'dark' = 'light';
	let generating = false;
	let generateError: string | null = null;
	let lightAvailable = data.lightAvailable;
	let darkAvailable = data.darkAvailable;
	let lastGenerated = data.generatedAt;

	function selectMode(m: string) {
		mode = m === 'dark' ? 'dark' : 'light';
	}

	function isAvailable(m: 'light' | 'dark'): boolean {
		return m === 'light' ? lightAvailable : darkAvailable;
	}

	async function generate() {
		if (generating) return;
		generating = true;
		generateError = null;
		try {
			const res = await fetch(`/api/brand/${data.brandProfileId}/brand-book`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mode })
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error((err as { message?: string }).message ?? 'Generation failed');
			}
			if (mode === 'light') lightAvailable = true;
			else darkAvailable = true;
			lastGenerated = new Date().toISOString();
		} catch (err) {
			generateError = err instanceof Error ? err.message : 'Generation failed';
		} finally {
			generating = false;
		}
	}

	function downloadUrl(m: 'light' | 'dark'): string {
		return `/api/brand/${data.brandProfileId}/brand-book?mode=${m}`;
	}

	function formatDate(iso: string | null): string {
		if (!iso) return '';
		return new Date(iso).toLocaleDateString('en-US', {
			month: 'long',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	const primaryColor = data.primaryColor ?? '#4b2d76';
	const secondaryColor = data.secondaryColor ?? '#e7406a';
	const accentColor = data.accentColor ?? '#f1b527';
</script>

<svelte:head>
	<title>Brand Book — {data.brandName} | Nabu</title>
</svelte:head>

<div class="brand-book-page">
	<header class="page-header">
		<div class="header-left">
			<a href="/brand/{data.brandProfileId}" class="back-link">← Brand Profile</a>
			<h1 class="page-title">Brand Book Generator</h1>
			<p class="page-subtitle">
				Generate a beautiful, print-ready brand style guide for <strong>{data.brandName}</strong>
			</p>
		</div>
	</header>

	<div class="main-grid">
		<!-- Preview card -->
		<div class="preview-card" style="--preview-primary: {primaryColor}; --preview-secondary: {secondaryColor}; --preview-accent: {accentColor};">
			<div class="preview-cover">
				<div class="preview-glow"></div>
				<div class="preview-stars">
					{#each Array(12) as _, i}
						<span class="preview-star" style="top:{7 + i * 7.5}%;left:{(i % 2 === 0 ? 15 + i * 5 : 75 - i * 4)}%;width:{i % 3 === 0 ? 5 : 3}px;height:{i % 3 === 0 ? 5 : 3}px;"></span>
					{/each}
				</div>
				<div class="preview-body">
					{#if data.logoUrl}
						<img class="preview-logo" src={data.logoUrl} alt={data.brandName} />
					{:else}
						<div class="preview-initial">{data.brandName.charAt(0)}</div>
					{/if}
					<h2 class="preview-name">{data.brandName}</h2>
					<p class="preview-sub">Brand Style Guide</p>
					{#if data.tagline}
						<p class="preview-tagline">{data.tagline}</p>
					{/if}
				</div>
			</div>
			<div class="preview-footer">
				<div class="preview-swatches">
					<span class="swatch" style="background:{primaryColor};" title="Primary"></span>
					<span class="swatch" style="background:{secondaryColor};" title="Secondary"></span>
					<span class="swatch" style="background:{accentColor};" title="Accent"></span>
				</div>
				<span class="preview-meta">{data.headingFont ?? 'Fraunces'} · {data.toneOfVoice ?? 'brand voice'}</span>
			</div>
		</div>

		<!-- Controls -->
		<div class="controls-panel">
			<div class="section-card">
				<h2 class="section-title">Generate</h2>

				<div class="mode-toggle">
					<button
						class="mode-btn"
						class:active={mode === 'light'}
						on:click={() => selectMode('light')}
					>
						&#9788; Light Mode
					</button>
					<button
						class="mode-btn"
						class:active={mode === 'dark'}
						on:click={() => selectMode('dark')}
					>
						&#9790; Dark Mode
					</button>
				</div>

				<p class="generate-hint">
					Generates a self-contained HTML file stored in your account.
					Open it in any browser, then <strong>File → Print → Save as PDF</strong>
					for a perfect print-quality brand book.
				</p>

				{#if generateError}
					<p class="field-error">{generateError}</p>
				{/if}

				<button
					class="generate-btn"
					on:click={generate}
					disabled={generating}
				>
					{#if generating}
						Generating…
					{:else}
						Generate {mode === 'dark' ? 'Dark' : 'Light'} Mode Brand Book
					{/if}
				</button>
			</div>

			<!-- Downloads -->
			{#if lightAvailable || darkAvailable}
				<div class="section-card downloads-card">
					<h2 class="section-title">
						Downloads
						{#if lastGenerated}
							<span class="generated-at">Last generated {formatDate(lastGenerated)}</span>
						{/if}
					</h2>

					{#if lightAvailable}
						<div class="download-row">
							<div class="download-info">
								<span class="download-icon">☀️</span>
								<div>
									<p class="download-name">Light Mode Brand Book</p>
									<p class="download-hint">Open → File → Print → Save as PDF</p>
								</div>
							</div>
							<a
								href={downloadUrl('light')}
								download="{data.brandName.replace(/\s+/g, '-')}-brand-book-light.html"
								class="download-btn"
							>
								Download HTML
							</a>
						</div>
					{/if}

					{#if darkAvailable}
						<div class="download-row">
							<div class="download-info">
								<span class="download-icon">🌙</span>
								<div>
									<p class="download-name">Dark Mode Brand Book</p>
									<p class="download-hint">Open → File → Print → Save as PDF</p>
								</div>
							</div>
							<a
								href={downloadUrl('dark')}
								download="{data.brandName.replace(/\s+/g, '-')}-brand-book-dark.html"
								class="download-btn"
							>
								Download HTML
							</a>
						</div>
					{/if}
				</div>
			{/if}

			<!-- What's included -->
			<div class="section-card whats-inside">
				<h2 class="section-title">What's included</h2>
				<ul class="inside-list">
					<li>
						<span class="inside-icon">&#9670;</span>
						<div>
							<strong>Cover page</strong>
							<p>Brand name, tagline, star field, radial glow</p>
						</div>
					</li>
					<li>
						<span class="inside-icon">&#9670;</span>
						<div>
							<strong>Color palette</strong>
							<p>Full 8-color system with hex values and roles</p>
						</div>
					</li>
					<li>
						<span class="inside-icon">&#9670;</span>
						<div>
							<strong>Typography</strong>
							<p>Display, body, and script font specimens</p>
						</div>
					</li>
					<li>
						<span class="inside-icon">&#9670;</span>
						<div>
							<strong>Voice &amp; tone</strong>
							<p>Avoid vs. Prefer comparison cards for your brand voice</p>
						</div>
					</li>
					<li>
						<span class="inside-icon">&#9670;</span>
						<div>
							<strong>Content strategy</strong>
							<p>Pillars, audience, brand archetype, channel guidance</p>
						</div>
					</li>
				</ul>
			</div>
		</div>
	</div>
</div>

<style>
	.brand-book-page {
		max-width: 1100px;
		margin: 0 auto;
		padding: var(--spacing-lg) var(--spacing-md);
		min-height: calc(100vh - 60px);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xl, 2rem);
	}

	.page-header {
		display: flex;
		align-items: flex-start;
		gap: var(--spacing-md);
	}

	.header-left {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.back-link {
		color: var(--color-primary);
		text-decoration: none;
		font-size: 0.85rem;
		font-weight: 500;
	}

	.page-title {
		font-size: 1.6rem;
		font-weight: 800;
		color: var(--color-text);
		margin: 0;
	}

	.page-subtitle {
		color: var(--color-text-secondary);
		font-size: 0.9rem;
		margin: 0;
	}

	/* ── Main layout ──────────────────────────────────────── */
	.main-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--spacing-lg);
	}

	@media (min-width: 720px) {
		.main-grid {
			grid-template-columns: 320px 1fr;
		}
	}

	/* ── Preview card ─────────────────────────────────────── */
	.preview-card {
		border-radius: var(--radius-lg);
		overflow: hidden;
		border: 1px solid var(--color-border);
		position: sticky;
		top: 1rem;
		align-self: flex-start;
	}

	.preview-cover {
		position: relative;
		background: linear-gradient(
			160deg,
			color-mix(in srgb, var(--preview-primary) 8%, var(--color-background)) 0%,
			color-mix(in srgb, var(--preview-primary) 14%, var(--color-background)) 55%,
			color-mix(in srgb, var(--preview-primary) 8%, var(--color-background)) 100%
		);
		padding: 2.5rem 1.5rem;
		min-height: 320px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
	}

	.preview-glow {
		position: absolute;
		inset: 0;
		background: radial-gradient(
			circle at 50% 35%,
			color-mix(in srgb, var(--preview-primary) 22%, transparent) 0%,
			transparent 60%
		);
		pointer-events: none;
	}

	.preview-star {
		position: absolute;
		border-radius: 50%;
		background: var(--preview-accent);
		opacity: 0.6;
	}

	.preview-body {
		position: relative;
		z-index: 1;
	}

	.preview-logo {
		width: 64px;
		height: 64px;
		object-fit: contain;
		margin-bottom: 1rem;
	}

	.preview-initial {
		width: 64px;
		height: 64px;
		border-radius: 16px;
		background: linear-gradient(135deg, var(--preview-primary), var(--preview-secondary));
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.75rem;
		font-weight: 800;
		color: white;
		margin: 0 auto 1rem;
	}

	.preview-name {
		font-size: 1.6rem;
		font-weight: 800;
		color: var(--preview-primary);
		margin: 0 0 0.15rem;
		line-height: 1.1;
	}

	.preview-sub {
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.25em;
		text-transform: uppercase;
		color: var(--color-text-secondary);
		margin: 0;
	}

	.preview-tagline {
		font-size: 1.1rem;
		color: var(--preview-secondary);
		margin: 0.75rem 0 0;
		font-style: italic;
	}

	.preview-footer {
		padding: 0.75rem 1rem;
		background-color: var(--color-surface);
		border-top: 1px solid var(--color-border);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-sm);
	}

	.preview-swatches {
		display: flex;
		gap: 6px;
	}

	.swatch {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		border: 2px solid var(--color-border);
		display: inline-block;
	}

	.preview-meta {
		font-size: 0.68rem;
		color: var(--color-text-secondary);
		text-overflow: ellipsis;
		overflow: hidden;
		white-space: nowrap;
	}

	/* ── Controls panel ───────────────────────────────────── */
	.controls-panel {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.section-card {
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.section-title {
		font-size: 1rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0;
		display: flex;
		align-items: baseline;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
	}

	.generated-at {
		font-size: 0.72rem;
		font-weight: 400;
		color: var(--color-text-secondary);
	}

	/* ── Mode toggle ──────────────────────────────────────── */
	.mode-toggle {
		display: flex;
		gap: 0;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.mode-btn {
		flex: 1;
		padding: var(--spacing-sm) var(--spacing-md);
		background: none;
		border: none;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: background-color 0.15s, color 0.15s;
	}

	.mode-btn.active {
		background-color: var(--color-primary);
		color: var(--color-background);
	}

	.mode-btn:not(.active):hover {
		background-color: var(--color-border);
		color: var(--color-text);
	}

	.generate-hint {
		font-size: 0.82rem;
		color: var(--color-text-secondary);
		line-height: 1.55;
		margin: 0;
	}

	.field-error {
		font-size: 0.8rem;
		color: var(--color-error);
		margin: 0;
	}

	.generate-btn {
		padding: var(--spacing-sm) var(--spacing-lg);
		background-color: var(--color-primary);
		color: var(--color-background);
		border: none;
		border-radius: var(--radius-md);
		font-weight: 700;
		font-size: 0.9rem;
		cursor: pointer;
		align-self: flex-start;
	}

	.generate-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.generate-btn:not(:disabled):hover {
		background-color: var(--color-primary-hover);
	}

	/* ── Downloads ────────────────────────────────────────── */
	.downloads-card {
		border-color: color-mix(in srgb, var(--color-primary) 30%, var(--color-border));
	}

	.download-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-md);
		padding: var(--spacing-sm) 0;
		border-bottom: 1px solid var(--color-border);
	}

	.download-row:last-of-type { border-bottom: none; }

	.download-info {
		display: flex;
		align-items: flex-start;
		gap: var(--spacing-sm);
	}

	.download-icon { font-size: 1.1rem; }

	.download-name {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.download-hint {
		font-size: 0.72rem;
		color: var(--color-text-secondary);
		margin: 0;
	}

	.download-btn {
		flex-shrink: 0;
		padding: 6px 14px;
		background-color: var(--color-primary);
		color: var(--color-background);
		border-radius: var(--radius-sm);
		font-size: 0.78rem;
		font-weight: 700;
		text-decoration: none;
	}

	.download-btn:hover {
		background-color: var(--color-primary-hover);
	}

	/* ── What's inside ────────────────────────────────────── */
	.inside-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.inside-list li {
		display: flex;
		align-items: flex-start;
		gap: var(--spacing-sm);
	}

	.inside-icon {
		color: var(--color-primary);
		font-size: 0.6rem;
		margin-top: 5px;
		flex-shrink: 0;
	}

	.inside-list strong {
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--color-text);
		display: block;
	}

	.inside-list p {
		font-size: 0.78rem;
		color: var(--color-text-secondary);
		margin: 0;
	}
</style>
