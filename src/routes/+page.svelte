<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { page } from '$app/stores';
	import { openCommandPalette } from '$lib/stores/commandPalette';
	import PricingSection from '$lib/components/PricingSection.svelte';
	import { onMount } from 'svelte';

	export let data: { user: App.Locals['user']; hasAIProviders: boolean };

	let mounted = false;
	let toastMessage = '';
	let showToast = false;

	const errorMessages: Record<string, string> = {
		forbidden: 'You do not have permission to access that page.',
		unauthorized: 'Please log in to access that page.',
		oauth_failed: 'Authentication failed. Please try again.'
	};

	$: isAdmin = data.user?.isOwner || data.user?.isAdmin;

	onMount(() => {
		mounted = true;

		const errorCode = $page.url.searchParams.get('error');
		if (errorCode && errorMessages[errorCode]) {
			toastMessage = errorMessages[errorCode];
			showToast = true;

			const url = new URL(window.location.href);
			url.searchParams.delete('error');
			window.history.replaceState({}, '', url);

			setTimeout(() => {
				showToast = false;
			}, 5000);
		}
	});

	function dismissToast() {
		showToast = false;
	}
</script>

<Seo
	path="/"
	title="Nabu — Build your brand. Automate your marketing."
	description="No brand? No problem. Nabu builds a complete brand identity from scratch — name, voice, colours, typography — then turns it into marketing that runs itself."
	image="default"
/>

<div class="landing" class:mounted>
	<!-- ======== HERO ======== -->
	<section class="hero">
		<div class="hero-glow" aria-hidden="true"></div>
		<div class="hero-content">
			<div class="hero-badge">
				<span class="badge-dot" aria-hidden="true"></span>
				Brand Building &amp; Marketing Automation
			</div>
			<h1 class="hero-title">Got Brand?</h1>
			<p class="hero-description">
				Whether you're starting from zero or refining what you already have, Nabu walks you through
				building a brand's complete identity — logo, colors, voice, typography — then helps you
				market it with content connected and automated across multiple platforms.
			</p>
			<div class="hero-actions">
				{#if data.user}
					<a href="/onboarding" class="btn btn-primary btn-lg">
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M12 2L2 7l10 5 10-5-10-5z" />
							<path d="M2 17l10 5 10-5" />
							<path d="M2 12l10 5 10-5" />
						</svg>
						Build Your Brand
					</a>
					<a href="/brand" class="btn btn-secondary btn-lg"> Go to Dashboard </a>
				{:else}
					<a href="/auth/signup" class="btn btn-primary btn-lg">
						Start Building Your Brand
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<line x1="5" y1="12" x2="19" y2="12" />
							<polyline points="12 5 19 12 12 19" />
						</svg>
					</a>
					<a href="/auth/login" class="btn btn-secondary btn-lg"> Sign In </a>
				{/if}
			</div>
			<button
				class="search-trigger"
				on:click={() => openCommandPalette()}
				aria-label="Open command palette"
			>
				<svg width="15" height="15" viewBox="0 0 20 20" fill="none">
					<circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="2" />
					<path d="M13 13l5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
				</svg>
				<span>Search or jump to&hellip;</span>
				<kbd>Ctrl+K</kbd>
			</button>
		</div>
	</section>

	<!-- ======== VALUE PROPS ======== -->
	<section class="social-proof" aria-label="Platform highlights">
		<div class="proof-grid">
			<div class="proof-item">
				<span class="proof-number">Zero</span>
				<span class="proof-label">Brand Required to Start</span>
			</div>
			<div class="proof-divider" aria-hidden="true"></div>
			<div class="proof-item">
				<span class="proof-number">Complete</span>
				<span class="proof-label">Brand Identity System</span>
			</div>
			<div class="proof-divider" aria-hidden="true"></div>
			<div class="proof-item">
				<span class="proof-number">Auto</span>
				<span class="proof-label">Social Media Publishing</span>
			</div>
			<div class="proof-divider" aria-hidden="true"></div>
			<div class="proof-item">
				<span class="proof-number">All-in-One</span>
				<span class="proof-label">Text, Audio, Image &amp; Video</span>
			</div>
		</div>
	</section>

	<!-- ======== BRAND IDENTITY SECTION ======== -->
	<section class="features" id="features">
		<div class="section-header">
			<h2 class="section-title">Build a brand identity that&rsquo;s truly yours</h2>
			<p class="section-subtitle">
				Start with nothing or bring what you have. Nabu helps you create, gather, organize, and
				refine every piece of your brand until it&rsquo;s complete.
			</p>
		</div>

		<div class="features-grid">
			<div class="feature-card feature-highlight">
				<div class="feature-icon icon-brand" aria-hidden="true">
					<!-- sparkle/wand icon -->
					<svg
						width="28"
						height="28"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M12 2L2 7l10 5 10-5-10-5z" />
						<path d="M2 17l10 5 10-5" />
						<path d="M2 12l10 5 10-5" />
					</svg>
				</div>
				<h3>Start From Scratch</h3>
				<p>
					Don&rsquo;t have a brand yet? Perfect. Nabu&rsquo;s guided onboarding walks you through
					the entire process — from picking a name and defining your personality to generating a
					full visual identity. Answer a few questions and watch your brand come to life.
				</p>
				<ul class="feature-list" role="list">
					<li>Conversational brand-building wizard</li>
					<li>Name, mission, and positioning guidance</li>
					<li>Personality and voice definition</li>
					<li>Works for new ideas or existing businesses</li>
				</ul>
			</div>

			<div class="feature-card">
				<div class="feature-icon icon-palette" aria-hidden="true">
					<!-- palette icon -->
					<svg
						width="28"
						height="28"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<circle cx="12" cy="12" r="10" />
						<circle cx="12" cy="7" r="1.5" fill="currentColor" />
						<circle cx="7.5" cy="11" r="1.5" fill="currentColor" />
						<circle cx="9" cy="16" r="1.5" fill="currentColor" />
						<path d="M15.4 15.4a3 3 0 0 0 4.2-4.2" />
					</svg>
				</div>
				<h3>Colors &amp; Visual Identity</h3>
				<p>
					Build a complete color system with an interactive harmony wheel. Primary, secondary,
					accent, and extended palettes that work together beautifully across light and dark
					contexts.
				</p>
			</div>

			<div class="feature-card">
				<div class="feature-icon icon-logo" aria-hidden="true">
					<!-- star/diamond icon -->
					<svg
						width="28"
						height="28"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<polygon
							points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
						/>
					</svg>
				</div>
				<h3>Logo &amp; Typography</h3>
				<p>
					Upload existing logos or create new ones. Manage variants for different contexts. Choose
					fonts for headings, body text, and logo treatments from a curated type library.
				</p>
			</div>

			<div class="feature-card">
				<div class="feature-icon icon-voice" aria-hidden="true">
					<!-- megaphone icon -->
					<svg
						width="28"
						height="28"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M11 5L6 9H2v6h4l5 4V5z" />
						<path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
						<path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
					</svg>
				</div>
				<h3>Brand Voice &amp; Copy</h3>
				<p>
					Define how your brand sounds. Generate taglines, bios, social copy, and legal text that
					all stay true to your voice. Every piece is revision-tracked so nothing gets lost.
				</p>
			</div>

			<div class="feature-card">
				<div class="feature-icon icon-media" aria-hidden="true">
					<!-- image/gallery icon -->
					<svg
						width="28"
						height="28"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
						<circle cx="8.5" cy="8.5" r="1.5" />
						<polyline points="21 15 16 10 5 21" />
					</svg>
				</div>
				<h3>Media &amp; Asset Library</h3>
				<p>
					One organized home for every brand asset — logos, photos, graphics, and generated images.
					Upload, browse, and manage everything from a single gallery.
				</p>
			</div>

			<div class="feature-card">
				<div class="feature-icon icon-history" aria-hidden="true">
					<!-- clock/history icon -->
					<svg
						width="28"
						height="28"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<circle cx="12" cy="12" r="10" />
						<polyline points="12 6 12 12 16 14" />
					</svg>
				</div>
				<h3>Version History &amp; Multi-Brand</h3>
				<p>
					Every change you make is tracked. Compare revisions, roll back to previous versions, and
					manage multiple brands from a single account without losing a thing.
				</p>
			</div>
		</div>
	</section>

	<!-- ======== MARKETING & AUTOMATION ======== -->
	<section class="automation-section">
		<div class="section-header">
			<h2 class="section-title">Then put that brand to work</h2>
			<p class="section-subtitle">
				Once your identity is set, Nabu uses it to create on-brand content and automatically publish
				it everywhere your audience lives.
			</p>
		</div>

		<div class="automation-grid">
			<div class="auto-card">
				<div class="auto-icon" aria-hidden="true">
					<!-- document/edit icon -->
					<svg
						width="32"
						height="32"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
						<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
					</svg>
				</div>
				<h3>Text &amp; Copy</h3>
				<p>
					Social posts, blog content, taglines, and marketing copy — all written in your brand
					voice.
				</p>
			</div>
			<div class="auto-card">
				<div class="auto-icon" aria-hidden="true">
					<!-- microphone icon -->
					<svg
						width="32"
						height="32"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
						<path d="M19 10v2a7 7 0 0 1-14 0v-2" />
						<line x1="12" y1="19" x2="12" y2="23" />
						<line x1="8" y1="23" x2="16" y2="23" />
					</svg>
				</div>
				<h3>Audio</h3>
				<p>
					Voice narrations and audio snippets with text-to-speech, ready for podcasts and reels.
				</p>
			</div>
			<div class="auto-card">
				<div class="auto-icon" aria-hidden="true">
					<!-- image icon -->
					<svg
						width="32"
						height="32"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
						<circle cx="8.5" cy="8.5" r="1.5" />
						<polyline points="21 15 16 10 5 21" />
					</svg>
				</div>
				<h3>Images</h3>
				<p>Generated graphics, branded templates, and curated visuals for posts and campaigns.</p>
			</div>
			<div class="auto-card">
				<div class="auto-icon" aria-hidden="true">
					<!-- video icon -->
					<svg
						width="32"
						height="32"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<polygon points="23 7 16 12 23 17 23 7" />
						<rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
					</svg>
				</div>
				<h3>Videos</h3>
				<p>
					Short-form and long-form video from scripts, with brand-consistent visuals and narration.
				</p>
			</div>
		</div>

		<div class="publish-banner">
			<div class="publish-icon" aria-hidden="true">
				<!-- calendar/clock icon -->
				<svg
					width="28"
					height="28"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
					<line x1="16" y1="2" x2="16" y2="6" />
					<line x1="8" y1="2" x2="8" y2="6" />
					<line x1="3" y1="10" x2="21" y2="10" />
				</svg>
			</div>
			<div class="publish-text">
				<h3>Schedule &amp; auto-publish to social media</h3>
				<p>
					Set it and forget it. Nabu uploads your text, audio, images, and videos to your social
					accounts on a regular schedule — keeping your brand visible without the daily grind.
				</p>
			</div>
		</div>
	</section>

	<!-- ======== HOW IT WORKS ======== -->
	<section class="how-it-works">
		<div class="section-header">
			<h2 class="section-title">From nothing to everywhere</h2>
			<p class="section-subtitle">
				Three phases that take you from a blank slate to an automated marketing presence.
			</p>
		</div>

		<div class="steps-grid">
			<div class="step-card">
				<div class="step-number" aria-hidden="true">1</div>
				<h3>Create Your Brand</h3>
				<p>
					Start with just an idea — or nothing at all. Nabu&rsquo;s onboarding guides you through
					naming, positioning, personality, colors, typography, and logo to build a complete
					identity from the ground up.
				</p>
			</div>
			<div class="step-connector" aria-hidden="true">
				<svg width="40" height="24" viewBox="0 0 40 24" fill="none">
					<path
						d="M0 12h32M28 6l6 6-6 6"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</div>
			<div class="step-card">
				<div class="step-number" aria-hidden="true">2</div>
				<h3>Create Your Content</h3>
				<p>
					Generate on-brand marketing copy, images, audio, and videos. Everything is automatically
					aligned with your brand guidelines so it always looks and sounds like you.
				</p>
			</div>
			<div class="step-connector" aria-hidden="true">
				<svg width="40" height="24" viewBox="0 0 40 24" fill="none">
					<path
						d="M0 12h32M28 6l6 6-6 6"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</div>
			<div class="step-card">
				<div class="step-number" aria-hidden="true">3</div>
				<h3>Automate &amp; Publish</h3>
				<p>
					Schedule posts across your social channels. Nabu handles the uploads — text, images,
					audio, and video — on a regular basis so your brand stays active while you focus
					elsewhere.
				</p>
			</div>
		</div>
	</section>

	<!-- ======== WHO IT'S FOR ======== -->
	<section class="audience-section">
		<div class="section-header">
			<h2 class="section-title">Built for people who are building something</h2>
			<p class="section-subtitle">
				Whether you&rsquo;re just getting started or ready to level up, Nabu meets you where you
				are.
			</p>
		</div>

		<div class="audience-grid">
			<div class="audience-card">
				<div class="audience-emoji" aria-hidden="true">
					<svg
						width="28"
						height="28"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path
							d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 12 18.469c-.874 0-1.712.346-2.331.966l-.205.205a5.002 5.002 0 0 1-.801-.64z"
						/>
					</svg>
				</div>
				<h3>New Founders</h3>
				<p>
					You have an idea but no brand. Nabu helps you build one from the ground up and start
					marketing immediately.
				</p>
			</div>
			<div class="audience-card">
				<div class="audience-emoji" aria-hidden="true">
					<svg
						width="28"
						height="28"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
						<line x1="8" y1="21" x2="16" y2="21" />
						<line x1="12" y1="17" x2="12" y2="21" />
					</svg>
				</div>
				<h3>Small Business Owners</h3>
				<p>
					Your brand exists but needs organizing. Bring your assets in and let Nabu refine and
					systematize everything.
				</p>
			</div>
			<div class="audience-card">
				<div class="audience-emoji" aria-hidden="true">
					<svg
						width="28"
						height="28"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<polygon points="23 7 16 12 23 17 23 7" />
						<rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
					</svg>
				</div>
				<h3>Content Creators</h3>
				<p>
					You create but struggle with consistency. Nabu keeps your brand tight and automates your
					posting schedule.
				</p>
			</div>
		</div>
	</section>

	<!-- ======== PRICING ======== -->
	<PricingSection isLoggedIn={!!data.user} />

	<!-- ======== CTA ======== -->
	<section class="cta-section">
		<div class="cta-card">
			<h2>Your brand starts here</h2>
			<p>
				No logo, no colors, no problem. Walk in with nothing and walk out with a complete brand
				identity and an automated marketing engine behind it.
			</p>
			<div class="cta-actions">
				{#if data.user}
					<a href="/onboarding" class="btn btn-primary btn-lg"> Build Your Brand </a>
					{#if isAdmin}
						<a href="/admin" class="btn btn-secondary btn-lg"> Admin Dashboard </a>
					{/if}
				{:else}
					<a href="/auth/signup" class="btn btn-primary btn-lg">
						Get Started Free
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<line x1="5" y1="12" x2="19" y2="12" />
							<polyline points="12 5 19 12 12 19" />
						</svg>
					</a>
					<a href="/auth/login" class="btn btn-secondary btn-lg"> Sign In </a>
				{/if}
			</div>
		</div>
	</section>
</div>

{#if showToast}
	<div class="toast toast-error" role="alert" aria-live="polite">
		<span class="toast-message">{toastMessage}</span>
		<button class="toast-dismiss" on:click={dismissToast} aria-label="Dismiss notification">
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
				<path
					d="M4 4l8 8M12 4l-8 8"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
				/>
			</svg>
		</button>
	</div>
{/if}

<style>
	/* ===== LAYOUT ===== */
	.landing {
		opacity: 0;
		transform: translateY(12px);
		transition:
			opacity 0.5s ease,
			transform 0.5s ease;
	}

	.landing.mounted {
		opacity: 1;
		transform: translateY(0);
	}

	/* ===== HERO ===== */
	.hero {
		position: relative;
		text-align: center;
		padding: var(--spacing-2xl) var(--spacing-md);
		overflow: hidden;
	}

	.hero-glow {
		position: absolute;
		top: -120px;
		left: 50%;
		transform: translateX(-50%);
		width: 600px;
		height: 400px;
		background: radial-gradient(
			ellipse at center,
			color-mix(in srgb, var(--color-primary) 12%, transparent) 0%,
			color-mix(in srgb, var(--color-secondary) 6%, transparent) 40%,
			transparent 70%
		);
		border-radius: 50%;
		pointer-events: none;
		filter: blur(60px);
	}

	.hero-content {
		position: relative;
		max-width: 720px;
		margin: 0 auto;
	}

	.hero-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: 6px 16px;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface));
		border: 1px solid color-mix(in srgb, var(--color-primary) 20%, var(--color-border));
		border-radius: 100px;
		margin-bottom: var(--spacing-lg);
	}

	.badge-dot {
		width: 6px;
		height: 6px;
		background: var(--color-primary);
		border-radius: 50%;
		animation: pulse-dot 2s ease-in-out infinite;
	}

	@keyframes pulse-dot {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.4;
		}
	}

	.hero-title {
		font-size: 2.4rem;
		font-weight: 800;
		line-height: 1.1;
		letter-spacing: -0.03em;
		color: var(--color-text);
		margin: 0 0 var(--spacing-lg);
	}

	.hero-description {
		font-size: 1.05rem;
		line-height: 1.7;
		color: var(--color-text-secondary);
		max-width: 580px;
		margin: 0 auto var(--spacing-xl);
	}

	.hero-actions {
		display: flex;
		justify-content: center;
		gap: var(--spacing-md);
		flex-wrap: wrap;
		margin-bottom: var(--spacing-lg);
	}

	/* ===== BUTTONS ===== */
	.btn {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-weight: 600;
		text-decoration: none;
		border-radius: var(--radius-md);
		transition: all var(--transition-fast);
		cursor: pointer;
		border: none;
		white-space: nowrap;
	}

	.btn-lg {
		padding: 12px 28px;
		font-size: 0.95rem;
	}

	.btn-primary {
		background: var(--color-primary);
		color: var(--color-background);
	}

	.btn-primary:hover {
		background: var(--color-primary-hover);
		transform: translateY(-1px);
		box-shadow: 0 4px 16px color-mix(in srgb, var(--color-primary) 30%, transparent);
		color: var(--color-background);
	}

	.btn-secondary {
		background: var(--color-surface);
		color: var(--color-text);
		border: 1px solid var(--color-border);
	}

	.btn-secondary:hover {
		background: var(--color-surface-hover);
		border-color: var(--color-text-secondary);
		transform: translateY(-1px);
		color: var(--color-text);
	}

	/* ===== SEARCH TRIGGER ===== */
	.search-trigger {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: 8px 16px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		color: var(--color-text-secondary);
		font-size: 0.8rem;
		cursor: pointer;
		transition:
			border-color var(--transition-fast),
			box-shadow var(--transition-fast);
	}

	.search-trigger:hover {
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 12%, transparent);
	}

	.search-trigger kbd {
		display: inline-block;
		padding: 2px 6px;
		font-size: 0.7rem;
		font-family: var(--font-mono);
		background: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
	}

	/* ===== SOCIAL PROOF ===== */
	.social-proof {
		padding: var(--spacing-xl) var(--spacing-md);
		border-top: 1px solid var(--color-border);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	.proof-grid {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: var(--spacing-xl);
		max-width: 800px;
		margin: 0 auto;
		flex-wrap: wrap;
	}

	.proof-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		text-align: center;
	}

	.proof-number {
		font-size: 1.3rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		color: var(--color-text);
	}

	.proof-label {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 500;
	}

	.proof-divider {
		width: 1px;
		height: 36px;
		background: var(--color-border);
		display: none;
	}

	/* ===== SECTIONS ===== */
	.section-header {
		text-align: center;
		max-width: 600px;
		margin: 0 auto var(--spacing-2xl);
	}

	.section-title {
		font-size: 1.6rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: var(--color-text);
		margin: 0 0 var(--spacing-sm);
	}

	.section-subtitle {
		font-size: 1rem;
		line-height: 1.6;
		color: var(--color-text-secondary);
		margin: 0;
	}

	/* ===== FEATURES ===== */
	.features {
		padding: var(--spacing-2xl) var(--spacing-md);
		max-width: 1100px;
		margin: 0 auto;
	}

	.features-grid {
		display: grid;
		gap: var(--spacing-md);
		grid-template-columns: 1fr;
	}

	.feature-card {
		padding: var(--spacing-lg);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		transition:
			border-color var(--transition-fast),
			box-shadow var(--transition-fast),
			transform var(--transition-fast);
	}

	.feature-card:hover {
		border-color: color-mix(in srgb, var(--color-primary) 40%, var(--color-border));
		box-shadow: var(--shadow-md);
		transform: translateY(-2px);
	}

	.feature-highlight {
		border-color: color-mix(in srgb, var(--color-primary) 25%, var(--color-border));
		background: color-mix(in srgb, var(--color-primary) 3%, var(--color-surface));
	}

	.feature-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-md);
	}

	.icon-brand {
		background: color-mix(in srgb, var(--color-primary) 12%, var(--color-surface));
		color: var(--color-primary);
	}
	.icon-palette {
		background: color-mix(in srgb, var(--color-secondary) 12%, var(--color-surface));
		color: var(--color-secondary);
	}
	.icon-logo {
		background: color-mix(in srgb, var(--color-warning) 12%, var(--color-surface));
		color: var(--color-warning);
	}
	.icon-voice {
		background: color-mix(in srgb, var(--color-success) 12%, var(--color-surface));
		color: var(--color-success);
	}
	.icon-media {
		background: color-mix(in srgb, var(--color-error) 10%, var(--color-surface));
		color: var(--color-error);
	}
	.icon-history {
		background: color-mix(in srgb, var(--color-secondary) 12%, var(--color-surface));
		color: var(--color-secondary);
	}

	.feature-card h3 {
		font-size: 1.05rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0 0 var(--spacing-sm);
	}

	.feature-card p {
		font-size: 0.9rem;
		line-height: 1.6;
		color: var(--color-text-secondary);
		margin: 0;
	}

	.feature-list {
		margin: var(--spacing-md) 0 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.feature-list li {
		font-size: 0.85rem;
		color: var(--color-text-secondary);
		padding-left: var(--spacing-md);
		position: relative;
	}

	.feature-list li::before {
		content: '';
		position: absolute;
		left: 0;
		top: 8px;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--color-primary);
	}

	/* ===== HOW IT WORKS ===== */
	.how-it-works {
		padding: var(--spacing-2xl) var(--spacing-md);
		background: var(--color-surface);
		border-top: 1px solid var(--color-border);
		border-bottom: 1px solid var(--color-border);
	}

	.steps-grid {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-md);
		max-width: 900px;
		margin: 0 auto;
	}

	.step-card {
		text-align: center;
		padding: var(--spacing-lg);
		background: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		max-width: 340px;
		width: 100%;
	}

	.step-number {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--color-primary);
		color: var(--color-background);
		font-size: 1rem;
		font-weight: 700;
		margin-bottom: var(--spacing-md);
	}

	.step-card h3 {
		font-size: 1.05rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0 0 var(--spacing-sm);
	}

	.step-card p {
		font-size: 0.85rem;
		line-height: 1.6;
		color: var(--color-text-secondary);
		margin: 0;
	}

	.step-connector {
		color: var(--color-border);
		transform: rotate(90deg);
	}

	/* ===== AUTOMATION SECTION ===== */
	.automation-section {
		padding: var(--spacing-2xl) var(--spacing-md);
		max-width: 1100px;
		margin: 0 auto;
	}

	.automation-grid {
		display: grid;
		gap: var(--spacing-md);
		grid-template-columns: 1fr;
		margin-bottom: var(--spacing-xl);
	}

	.auto-card {
		text-align: center;
		padding: var(--spacing-lg);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		transition:
			border-color var(--transition-fast),
			transform var(--transition-fast),
			box-shadow var(--transition-fast);
	}

	.auto-card:hover {
		border-color: color-mix(in srgb, var(--color-primary) 40%, var(--color-border));
		transform: translateY(-2px);
		box-shadow: var(--shadow-md);
	}

	.auto-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface));
		color: var(--color-primary);
		margin-bottom: var(--spacing-md);
	}

	.auto-card h3 {
		font-size: 1rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0 0 var(--spacing-xs);
	}

	.auto-card p {
		font-size: 0.85rem;
		line-height: 1.6;
		color: var(--color-text-secondary);
		margin: 0;
	}

	.publish-banner {
		display: flex;
		align-items: center;
		gap: var(--spacing-lg);
		padding: var(--spacing-lg);
		background: color-mix(in srgb, var(--color-primary) 4%, var(--color-surface));
		border: 1px solid color-mix(in srgb, var(--color-primary) 20%, var(--color-border));
		border-radius: var(--radius-lg);
	}

	.publish-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: var(--color-primary);
		color: var(--color-background);
	}

	.publish-text h3 {
		font-size: 1.05rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0 0 var(--spacing-xs);
	}

	.publish-text p {
		font-size: 0.9rem;
		line-height: 1.6;
		color: var(--color-text-secondary);
		margin: 0;
	}

	/* ===== AUDIENCE SECTION ===== */
	.audience-section {
		padding: var(--spacing-2xl) var(--spacing-md);
		max-width: 1000px;
		margin: 0 auto;
	}

	.audience-grid {
		display: grid;
		gap: var(--spacing-md);
		grid-template-columns: 1fr;
	}

	.audience-card {
		padding: var(--spacing-lg);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		transition:
			border-color var(--transition-fast),
			transform var(--transition-fast);
	}

	.audience-card:hover {
		border-color: color-mix(in srgb, var(--color-primary) 40%, var(--color-border));
		transform: translateY(-2px);
	}

	.audience-emoji {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface));
		color: var(--color-primary);
		margin-bottom: var(--spacing-md);
	}

	.audience-card h3 {
		font-size: 1rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0 0 var(--spacing-sm);
	}

	.audience-card p {
		font-size: 0.9rem;
		line-height: 1.6;
		color: var(--color-text-secondary);
		margin: 0;
	}

	/* ===== CTA ===== */
	.cta-section {
		padding: var(--spacing-2xl) var(--spacing-md);
	}

	.cta-card {
		text-align: center;
		max-width: 640px;
		margin: 0 auto;
		padding: var(--spacing-2xl) var(--spacing-lg);
		background: color-mix(in srgb, var(--color-primary) 4%, var(--color-surface));
		border: 1px solid color-mix(in srgb, var(--color-primary) 20%, var(--color-border));
		border-radius: var(--radius-xl);
	}

	.cta-card h2 {
		font-size: 1.4rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0 0 var(--spacing-sm);
		letter-spacing: -0.01em;
	}

	.cta-card p {
		font-size: 0.95rem;
		color: var(--color-text-secondary);
		line-height: 1.6;
		margin: 0 0 var(--spacing-xl);
		max-width: 480px;
		margin-left: auto;
		margin-right: auto;
	}

	.cta-actions {
		display: flex;
		justify-content: center;
		gap: var(--spacing-md);
		flex-wrap: wrap;
	}

	/* ===== TOAST ===== */
	.toast {
		position: fixed;
		bottom: var(--spacing-lg);
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		z-index: 1000;
		animation: toast-in 0.3s ease;
	}

	.toast-error {
		background: var(--color-error);
		color: var(--color-background);
	}

	.toast-message {
		flex: 1;
	}

	.toast-dismiss {
		background: none;
		border: none;
		color: inherit;
		cursor: pointer;
		padding: 2px;
		display: flex;
		align-items: center;
		opacity: 0.8;
	}

	.toast-dismiss:hover {
		opacity: 1;
	}

	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}

	/* ===== RESPONSIVE ===== */
	@media (min-width: 641px) {
		.hero {
			padding: var(--spacing-2xl) var(--spacing-lg) var(--spacing-xl);
		}

		.hero-title {
			font-size: 3rem;
		}

		.features-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.feature-highlight {
			grid-column: 1 / -1;
		}

		.steps-grid {
			flex-direction: row;
			align-items: stretch;
		}

		.step-connector {
			transform: none;
			display: flex;
			align-items: center;
		}

		.automation-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.audience-grid {
			grid-template-columns: repeat(3, 1fr);
		}

		.proof-grid {
			flex-wrap: nowrap;
		}

		.proof-divider {
			display: block;
		}
	}

	@media (min-width: 960px) {
		.hero-title {
			font-size: 3.4rem;
		}

		.features-grid {
			grid-template-columns: repeat(3, 1fr);
		}

		.feature-highlight {
			grid-column: 1 / -1;
			display: grid;
			grid-template-columns: auto 1fr;
			grid-template-rows: auto auto 1fr;
			column-gap: var(--spacing-lg);
		}

		.feature-highlight .feature-icon {
			grid-row: 1 / 2;
		}

		.feature-highlight h3 {
			grid-column: 2;
			grid-row: 1;
			align-self: center;
		}

		.feature-highlight p {
			grid-column: 1 / -1;
		}

		.feature-highlight .feature-list {
			grid-column: 1 / -1;
			flex-direction: row;
			flex-wrap: wrap;
			gap: var(--spacing-sm) var(--spacing-lg);
		}

		.automation-grid {
			grid-template-columns: repeat(4, 1fr);
		}
	}
</style>
