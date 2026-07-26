<script lang="ts">
	import {
		PRICING_TIERS,
		PRICING_FEATURES,
		FREE_SOCIAL_ACCOUNTS_PER_BRAND,
		formatPrice,
		getAnnualPrice,
		getAnnualSavings,
		type PricingFeature,
		type TierId
	} from '$lib/utils/pricing';
	import PricingFeatureValue from './PricingFeatureValue.svelte';

	export let isLoggedIn = false;

	let annual = true;

	const categories: { id: PricingFeature['category']; label: string }[] = [
		{ id: 'brand', label: 'Brand Identity' },
		{ id: 'content', label: 'Content & AI' },
		{ id: 'publishing', label: 'Publishing & Automation' },
		{ id: 'support', label: 'Support & Infrastructure' }
	];

	function displayPrice(tier: (typeof PRICING_TIERS)[number]) {
		if (tier.monthlyPrice === 0) return 'Free';
		return annual ? formatPrice(getAnnualPrice(tier)) : formatPrice(tier.monthlyPrice);
	}

	function tierValue(feature: PricingFeature, tierId: TierId): boolean | string {
		return feature.tiers[tierId];
	}

	function ctaHref(tierId: TierId): string {
		if (isLoggedIn) return '/brand';
		if (tierId === 'business') return '/auth/signup?plan=business';
		if (tierId === 'pro') return '/auth/signup?plan=pro';
		return '/auth/signup';
	}
</script>

<section class="pricing" id="pricing" aria-label="Pricing plans">
	<!-- Header -->
	<div class="pricing-header">
		<div class="pricing-badge">
			<span class="badge-dot" aria-hidden="true"></span>
			Simple, Transparent Pricing
		</div>
		<h2 class="pricing-title">One plan per brand. Mix&nbsp;and&nbsp;match.</h2>
		<p class="pricing-subtitle">
			Every brand gets its own plan. Upgrade or downgrade each brand independently—pay only for what
			each one needs.
		</p>

		<!-- Billing toggle -->
		<div class="billing-toggle" role="radiogroup" aria-label="Billing period">
			<button
				class="toggle-option"
				class:active={!annual}
				on:click={() => (annual = false)}
				role="radio"
				aria-checked={!annual}
			>
				Monthly
			</button>
			<button
				class="toggle-option"
				class:active={annual}
				on:click={() => (annual = true)}
				role="radio"
				aria-checked={annual}
			>
				Annual
				<span class="save-badge">Save up to {getAnnualSavings(PRICING_TIERS[2])}%</span>
			</button>
		</div>
	</div>

	<!-- Tier Cards -->
	<div class="tier-grid">
		{#each PRICING_TIERS as tier (tier.id)}
			<div class="tier-card" class:highlighted={tier.highlighted} aria-label="{tier.name} plan">
				{#if tier.highlighted}
					<div class="popular-tag">Most Popular</div>
				{/if}

				<div class="tier-top">
					<h3 class="tier-name">{tier.name}</h3>
					<p class="tier-desc">{tier.description}</p>
				</div>

				<div class="tier-price">
					<span class="price-amount">{displayPrice(tier)}</span>
					{#if tier.monthlyPrice > 0}
						<span class="price-period">/ brand / month</span>
					{:else}
						<span class="price-period">per brand</span>
					{/if}
					{#if annual && tier.monthlyPrice > 0}
						<span class="price-annual">
							billed {formatPrice(tier.annualPrice)}/brand/year
						</span>
					{/if}
				</div>

				<a href={ctaHref(tier.id)} class="tier-cta" class:primary={tier.highlighted}>
					{tier.cta}
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<line x1="5" y1="12" x2="19" y2="12" />
						<polyline points="12 5 19 12 12 19" />
					</svg>
				</a>

				<!-- Highlights -->
				<ul class="tier-highlights" role="list">
					<li>
						<svg
							class="check"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg
						>
						Unlimited brands
					</li>
					<li>
						<svg
							class="check"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg
						>
						{tier.limits.aiTextGenerations.toLocaleString()} AI text generations/mo
					</li>
					<li>
						<svg
							class="check"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg
						>
						{tier.limits.aiImageGenerations.toLocaleString()} image generations/mo
					</li>
					<li>
						<svg
							class="check"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg
						>
						{tier.limits.aiVideoGenerations} video generations/mo
					</li>
					<li>
						<svg
							class="check"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg
						>
						{tier.limits.storageGB} GB storage
					</li>
					<li>
						<svg
							class="check"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg
						>
						{FREE_SOCIAL_ACCOUNTS_PER_BRAND} social accounts per brand
					</li>
					{#if tier.id !== 'starter'}
						<li>
							<svg
								class="check"
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg
							>
							Auto-publish to social
						</li>
					{/if}
					{#if tier.id === 'business'}
						<li>
							<svg
								class="check"
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg
							>
							Priority AI &amp; support
						</li>
					{/if}
				</ul>
			</div>
		{/each}
	</div>

	<!-- Feature Comparison Table -->
	<div class="comparison">
		<h3 class="comparison-title">Full feature comparison</h3>

		<!--
			Mobile layout. A three-plan table cannot fit a phone (200px feature column +
			3×120px = 560px against a 390px screen), and sideways scrolling hid the
			Business column entirely. So below the breakpoint each feature becomes its own
			block with a three-up plan strip.

			The one thing cards normally lose versus a table is the ability to follow a
			single plan down the page. The highlighted tier keeps a continuous tinted lane
			in both layouts to preserve exactly that.
		-->
		<div class="fc" aria-label="Feature comparison across plans">
			{#each categories as cat}
				<section class="fc-group">
					<h4 class="fc-cat">{cat.label}</h4>

					{#each PRICING_FEATURES.filter((f) => f.category === cat.id) as feature}
						<article class="fc-item">
							<h5 class="fc-name">
								{feature.name}
								{#if feature.tooltip}
									<span class="feature-tip" title={feature.tooltip}>
										<svg
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
											aria-hidden="true"
											><circle cx="12" cy="12" r="10" /><line
												x1="12"
												y1="16"
												x2="12"
												y2="12"
											/><line x1="12" y1="8" x2="12.01" y2="8" /></svg
										>
									</span>
								{/if}
							</h5>

							<div class="fc-plans">
								{#each PRICING_TIERS as tier}
									{@const val = tierValue(feature, tier.id)}
									<div class="fc-plan" class:lane={tier.highlighted}>
										<span class="fc-plan-name">{tier.name}</span>
										<span class="fc-plan-val">
											<PricingFeatureValue value={val} />
										</span>
									</div>
								{/each}
							</div>
						</article>
					{/each}
				</section>
			{/each}
		</div>

		<div class="comparison-table-wrapper">
			<table class="comparison-table" aria-label="Feature comparison across plans">
				<thead>
					<tr>
						<th class="feature-col">Feature</th>
						{#each PRICING_TIERS as tier}
							<th class="tier-col" class:lane={tier.highlighted}>{tier.name}</th>
						{/each}
					</tr>
				</thead>

				{#each categories as cat}
					<tbody>
						<tr class="category-row">
							<td colspan="4">{cat.label}</td>
						</tr>
						{#each PRICING_FEATURES.filter((f) => f.category === cat.id) as feature}
							<tr>
								<td class="feature-name">
									{feature.name}
									{#if feature.tooltip}
										<span class="feature-tip" title={feature.tooltip}>
											<svg
												width="14"
												height="14"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
												aria-hidden="true"
												><circle cx="12" cy="12" r="10" /><line
													x1="12"
													y1="16"
													x2="12"
													y2="12"
												/><line x1="12" y1="8" x2="12.01" y2="8" /></svg
											>
										</span>
									{/if}
								</td>
								{#each PRICING_TIERS as tier}
									{@const val = tierValue(feature, tier.id)}
									<td class="tier-cell" class:lane={tier.highlighted}>
										<PricingFeatureValue value={val} />
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				{/each}
			</table>
		</div>
	</div>

	<!-- FAQ -->
	<div class="faq">
		<h3 class="faq-title">Common questions</h3>
		<div class="faq-grid">
			<details class="faq-item">
				<summary>Can I switch plans later?</summary>
				<p>
					Yes. Upgrade or downgrade at any time. When upgrading, you'll be prorated for the
					remaining billing period. When downgrading, the change takes effect at your next billing
					cycle.
				</p>
			</details>
			<details class="faq-item">
				<summary>What happens when I hit my AI generation limits?</summary>
				<p>
					You'll receive a notification as you approach your limit. Once reached, you can upgrade
					your plan or wait for your limits to reset at the start of your next billing cycle.
				</p>
			</details>
			<details class="faq-item">
				<summary>Do I need a credit card for the free plan?</summary>
				<p>
					No. The Starter plan is completely free — no credit card required. Just create an account
					and start building your brand.
				</p>
			</details>
			<details class="faq-item">
				<summary>What AI models are used?</summary>
				<p>
					Nabu uses the latest OpenAI models for text (GPT-5.2), images (DALL-E), audio
					(text-to-speech), and video (Sora). Pro and Business plans let you choose specific models
					for different tasks.
				</p>
			</details>
			<details class="faq-item">
				<summary>Can I use Nabu for multiple brands?</summary>
				<p>
					The Starter plan covers one brand. Pro supports up to 5 brands with separate identities,
					and Business supports up to 25 — each with their own colors, typography, voice, and
					content.
				</p>
			</details>
			<details class="faq-item">
				<summary>Is there a trial for paid plans?</summary>
				<p>
					Pro comes with a 14-day free trial with full access. Business plans include a guided
					onboarding call and custom trial period.
				</p>
			</details>
		</div>
	</div>
</section>

<style>
	/* ===== SECTION ===== */
	.pricing {
		padding: var(--spacing-2xl) var(--spacing-md);
		max-width: 1100px;
		margin: 0 auto;
	}

	/* ===== HEADER ===== */
	.pricing-header {
		text-align: center;
		max-width: 600px;
		margin: 0 auto var(--spacing-2xl);
	}

	.pricing-badge {
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
	}

	.pricing-title {
		font-size: 1.6rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: var(--color-text);
		margin: 0 0 var(--spacing-sm);
	}

	.pricing-subtitle {
		font-size: 1rem;
		line-height: 1.6;
		color: var(--color-text-secondary);
		margin: 0 0 var(--spacing-xl);
	}

	/* ===== BILLING TOGGLE ===== */
	.billing-toggle {
		display: inline-flex;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 3px;
		gap: 2px;
	}

	.toggle-option {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: 8px 18px;
		font-size: 0.85rem;
		font-weight: 600;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.toggle-option.active {
		background: var(--color-background);
		color: var(--color-text);
		box-shadow: var(--shadow-sm);
	}

	.save-badge {
		font-size: 0.7rem;
		font-weight: 700;
		padding: 2px 8px;
		border-radius: 100px;
		background: color-mix(in srgb, var(--color-success) 12%, var(--color-surface));
		color: var(--color-success);
	}

	/* ===== TIER CARDS ===== */
	.tier-grid {
		display: grid;
		gap: var(--spacing-md);
		grid-template-columns: 1fr;
		margin-bottom: var(--spacing-2xl);
	}

	.tier-card {
		position: relative;
		display: flex;
		flex-direction: column;
		padding: var(--spacing-lg);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		transition:
			border-color var(--transition-fast),
			box-shadow var(--transition-fast),
			transform var(--transition-fast);
	}

	.tier-card:hover {
		transform: translateY(-2px);
		box-shadow: var(--shadow-md);
	}

	.tier-card.highlighted {
		border-color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 3%, var(--color-surface));
		box-shadow:
			0 0 0 1px var(--color-primary),
			var(--shadow-md);
	}

	.tier-card.highlighted:hover {
		box-shadow:
			0 0 0 1px var(--color-primary),
			var(--shadow-lg);
	}

	.popular-tag {
		position: absolute;
		top: -12px;
		left: 50%;
		transform: translateX(-50%);
		padding: 4px 14px;
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-background);
		background: var(--color-primary);
		border-radius: 100px;
		white-space: nowrap;
	}

	.tier-top {
		margin-bottom: var(--spacing-md);
	}

	.tier-name {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0 0 var(--spacing-xs);
	}

	.tier-desc {
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--color-text-secondary);
		margin: 0;
	}

	/* ===== PRICE ===== */
	.tier-price {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--spacing-xs);
		margin-bottom: var(--spacing-lg);
	}

	.price-amount {
		font-size: 2rem;
		font-weight: 800;
		letter-spacing: -0.03em;
		color: var(--color-text);
	}

	.price-period {
		font-size: 0.9rem;
		color: var(--color-text-secondary);
	}

	.price-annual {
		width: 100%;
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	/* ===== CTA ===== */
	.tier-cta {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-sm);
		padding: 10px 20px;
		font-size: 0.9rem;
		font-weight: 600;
		text-decoration: none;
		border-radius: var(--radius-md);
		background: var(--color-surface-hover);
		color: var(--color-text);
		border: 1px solid var(--color-border);
		transition: all var(--transition-fast);
		margin-bottom: var(--spacing-lg);
	}

	.tier-cta:hover {
		border-color: var(--color-text-secondary);
		transform: translateY(-1px);
	}

	.tier-cta.primary {
		background: var(--color-primary);
		color: var(--color-background);
		border-color: var(--color-primary);
	}

	.tier-cta.primary:hover {
		background: var(--color-primary-hover);
		border-color: var(--color-primary-hover);
		box-shadow: 0 4px 16px color-mix(in srgb, var(--color-primary) 30%, transparent);
	}

	/* ===== HIGHLIGHTS ===== */
	.tier-highlights {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		border-top: 1px solid var(--color-border);
		padding-top: var(--spacing-lg);
		flex: 1;
	}

	.tier-highlights li {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: 0.85rem;
		color: var(--color-text-secondary);
	}

	.check {
		flex-shrink: 0;
		color: var(--color-success);
	}

	/* ===== COMPARISON TABLE ===== */
	.comparison {
		margin-bottom: var(--spacing-2xl);
	}

	.comparison-title {
		text-align: center;
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0 0 var(--spacing-lg);
	}

	/* ── Mobile comparison ────────────────────────────────────────────────────
	   Default layout. The table is the enhancement, not the baseline: a phone
	   cannot show three plan columns, and the previous horizontal scroll left the
	   Business column undiscoverable. */

	.fc-group {
		margin-bottom: var(--spacing-lg);
	}

	.fc-cat {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin: 0 0 var(--spacing-sm);
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-primary);
	}

	/* Rule runs to the edge so categories read as bands, giving the eye somewhere
	   to rest between groups of features. */
	.fc-cat::after {
		content: '';
		flex: 1;
		height: 1px;
		background: linear-gradient(
			to right,
			color-mix(in srgb, var(--color-primary) 35%, transparent),
			transparent
		);
	}

	.fc-item {
		padding: var(--spacing-sm) 0;
		border-bottom: 1px solid color-mix(in srgb, var(--color-border) 55%, transparent);
	}

	.fc-item:last-child {
		border-bottom: none;
	}

	.fc-name {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		margin: 0 0 var(--spacing-xs);
		font-size: 0.88rem;
		font-weight: 500;
		line-height: 1.3;
		color: var(--color-text);
	}

	/* Equal thirds: three plans always fit a 320px viewport, so nothing scrolls. */
	.fc-plans {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1px;
		background: color-mix(in srgb, var(--color-border) 45%, transparent);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.fc-plan {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-start;
		gap: 2px;
		/* Uniform height so the three cells line up and the eye can run straight down
		   a plan, but no taller than the two-line limits actually need. */
		min-height: 2.9rem;
		padding: 6px 4px;
		background: var(--color-surface);
		text-align: center;
	}

	/* The signature: the recommended plan keeps an unbroken tinted lane down the
	   whole comparison. It is what a table gives you and cards usually lose —
	   following one plan without re-reading the label on every row. */
	.fc-plan.lane {
		background: color-mix(in srgb, var(--color-primary) 9%, var(--color-surface));
	}

	.fc-plan-name {
		font-size: 0.6rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-secondary);
	}

	.fc-plan.lane .fc-plan-name {
		color: var(--color-primary);
	}

	.fc-plan-val {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
		min-height: 1.25rem;
	}

	.comparison-table-wrapper {
		/* Hidden on phones; the card layout above covers this range. */
		display: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
	}

	/* ── Wide screens ─────────────────────────────────────────────────────────
	   Past this width all three plans fit honestly, and a table beats cards for
	   cross-plan comparison. 46rem is where the 200px feature column plus three
	   tier columns stop needing to scroll. */
	@media (min-width: 46rem) {
		.fc {
			display: none;
		}

		.comparison-table-wrapper {
			display: block;
			overflow: hidden;
		}
	}

	.comparison-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}

	.comparison-table thead {
		position: sticky;
		top: 0;
		z-index: 1;
	}

	.comparison-table th {
		padding: var(--spacing-sm) var(--spacing-md);
		text-align: center;
		font-weight: 700;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-secondary);
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
	}

	.feature-col {
		text-align: left !important;
		min-width: 200px;
	}

	/* Wide enough that the longest real limits — "Upload only", "3 per brand" —
	   stay on one line. At 120px they wrapped and pushed those rows taller than
	   their neighbours, which broke the horizontal rhythm of the table. */
	.tier-col {
		width: 140px;
	}

	.category-row td {
		padding: var(--spacing-sm) var(--spacing-md);
		font-weight: 700;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 4%, var(--color-surface));
		border-bottom: 1px solid var(--color-border);
	}

	.comparison-table td {
		padding: var(--spacing-sm) var(--spacing-md);
		border-bottom: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
	}

	.feature-name {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		color: var(--color-text);
	}

	.feature-tip {
		color: var(--color-text-secondary);
		cursor: help;
		display: inline-flex;
	}

	.tier-cell {
		text-align: center;
		vertical-align: middle;
	}

	/* Same lane as the mobile strip, so both layouts point at the same plan in the
	   same language. On the table it also does the job the old design lacked: a
	   column you can follow without tracking back to the header. */
	.tier-col.lane,
	.tier-cell.lane {
		background: color-mix(in srgb, var(--color-primary) 7%, transparent);
	}

	.tier-col.lane {
		color: var(--color-primary);
	}

	/* icon-yes / icon-no / value text now live in PricingFeatureValue, so the card
	   and table layouts cannot drift apart. */

	/* ===== FAQ ===== */
	.faq {
		max-width: 700px;
		margin: 0 auto;
	}

	.faq-title {
		text-align: center;
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0 0 var(--spacing-lg);
	}

	.faq-grid {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.faq-item {
		padding: var(--spacing-md);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		transition: border-color var(--transition-fast);
	}

	.faq-item[open] {
		border-color: color-mix(in srgb, var(--color-primary) 30%, var(--color-border));
	}

	.faq-item summary {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--color-text);
		cursor: pointer;
		list-style: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.faq-item summary::-webkit-details-marker {
		display: none;
	}

	.faq-item summary::after {
		content: '+';
		font-size: 1.1rem;
		font-weight: 400;
		color: var(--color-text-secondary);
		transition: transform var(--transition-fast);
	}

	.faq-item[open] summary::after {
		content: '−';
	}

	.faq-item p {
		margin: var(--spacing-sm) 0 0;
		font-size: 0.85rem;
		line-height: 1.6;
		color: var(--color-text-secondary);
	}

	/* ===== RESPONSIVE ===== */
	@media (min-width: 641px) {
		.pricing-title {
			font-size: 2rem;
		}

		.tier-grid {
			grid-template-columns: repeat(3, 1fr);
		}

		.faq-grid {
			display: grid;
			grid-template-columns: repeat(2, 1fr);
			gap: var(--spacing-sm);
		}
	}

	@media (min-width: 960px) {
		.pricing-title {
			font-size: 2.2rem;
		}
	}
</style>
