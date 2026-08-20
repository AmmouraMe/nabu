<script lang="ts">
	/**
	 * The public brand-name generator.
	 *
	 * Reachable without an account on purpose — someone who names their brand here
	 * has already done the first step of onboarding, and the page points at the
	 * rest. Signing in only raises the hourly ceiling; it changes nothing about
	 * the names or the checks.
	 *
	 * The results are real markup rather than DOM built in a handler. That is not
	 * only tidier: Svelte scopes styles by adding a class to elements in the
	 * template, and elements created at runtime never get it, so an injected card
	 * would render unstyled.
	 */
	import type { PageData } from './$types';

	export let data: PageData;

	type CheckState = 'taken' | 'available' | 'unchecked';
	interface Check {
		id: string;
		label: string;
		state: CheckState;
		note?: string;
		url?: string;
	}
	interface Availability {
		domains?: Check[];
		handles?: Check[];
		trademark?: Check;
		unverifiableTlds?: string[];
	}
	interface NameCard {
		name: string;
		meaning: string;
		sound: string;
		radio: string;
		translation: string;
		domain: string;
		checks: { syllables: number; alphabeticalRank: number; initial: string; typable: boolean };
	}

	const MAX_DESCRIPTION = 4000;

	let description = '';
	let audience = '';
	let archetype = '';

	let wantDomains = true;
	let wantHandles = true;
	let wantTrademark = true;

	let loading = false;
	let status = '';
	let statusIsError = false;
	let names: NameCard[] = [];
	let remaining: number | null = null;

	/** Frozen at submit, so toggling mid-run cannot leave cards checked two ways. */
	let activeChecks = { domains: true, handles: true, trademark: true };

	/** Availability per name, plus which ones are already in flight. */
	let availability: Record<string, Availability> = {};
	let requested = new Set<string>();

	// Silent until the last quarter — a counter at 38/4000 is noise, and the point
	// of the larger cap is that you should stop thinking about it.
	$: charsLeft = MAX_DESCRIPTION - description.length;
	$: showCount = description.length >= MAX_DESCRIPTION * 0.75;

	$: wantedLabels = [
		activeChecks.domains && 'domains',
		activeChecks.handles && 'handles',
		activeChecks.trademark && 'trademarks'
	].filter(Boolean);

	async function generate() {
		activeChecks = { domains: wantDomains, handles: wantHandles, trademark: wantTrademark };
		loading = true;
		status = 'Working through the heuristics…';
		statusIsError = false;
		names = [];
		availability = {};
		requested = new Set();

		try {
			const response = await fetch('/api/namer/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ description, audience, archetype })
			});
			const body = await response.json().catch(() => ({}));

			if (!response.ok) {
				status = body.error || 'Something went wrong. Try again.';
				statusIsError = true;
				return;
			}

			names = body.names ?? [];
			remaining = typeof body.remaining === 'number' ? body.remaining : null;
			status = '';
		} catch {
			status = 'Could not reach the generator. Check your connection and try again.';
			statusIsError = true;
		} finally {
			loading = false;
		}
	}

	/**
	 * Fetched when a card is first opened, never up front. Nobody reads ten
	 * lookups for a name they rejected on sight — and firing all of them at once
	 * tripped registry rate limits, which showed up as spurious "unchecked".
	 */
	async function loadAvailability(name: string) {
		if (requested.has(name) || !wantedLabels.length) return;
		requested = new Set(requested).add(name);

		try {
			const response = await fetch('/api/namer/check', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, checks: activeChecks })
			});
			if (!response.ok) throw new Error('check failed');
			availability = { ...availability, [name]: await response.json() };
		} catch {
			availability = { ...availability, [name]: { domains: [], handles: [] } };
		}
	}

	/** "available" from an exact-match search means far less than "free to use". */
	function trademarkLabel(state: CheckState): string {
		if (state === 'taken') return 'Exact match on file';
		if (state === 'available') return 'No exact match';
		return 'Not checked';
	}

	function slotTitle(check: Check): string {
		return check.note
			? `${check.label} — ${check.state}. ${check.note}`
			: `${check.label} — ${check.state}`;
	}
</script>

<svelte:head>
	<title>Name your brand — Nabu</title>
	<meta
		name="description"
		content="Generate brand names against a real set of naming heuristics — few syllables, early in the alphabet, passes the radio test — then check the domains, handles and trademark register."
	/>
</svelte:head>

<div class="wrap">
	<h1>Name your brand.</h1>
	<p class="lede">
		Six names, generated against the same nine heuristics we use ourselves — short, early in the
		alphabet, survives being heard once aloud, and actually means something. Then we check the
		domains, the handles and the trademark register, and say plainly which ones we could not check.
	</p>

	<form on:submit|preventDefault={generate}>
		<div class="field">
			<label for="description">
				What are you building?
				<span class="hint">— the more specific, the better the names</span>
			</label>
			<textarea
				id="description"
				bind:value={description}
				maxlength={MAX_DESCRIPTION}
				required
				placeholder="A subscription box of single-origin coffee for people who grind at home but don't want to think about it. Roasted to order, three origins rotating monthly."
			></textarea>
			<p class="field-count" class:near={charsLeft < 200} aria-live="polite">
				{#if showCount}
					{charsLeft === 0 ? 'Character limit reached' : `${charsLeft} characters left`}
				{/if}
			</p>
		</div>

		<div class="row">
			<div class="field">
				<label for="audience">Who is it for? <span class="hint">— optional</span></label>
				<input
					type="text"
					id="audience"
					bind:value={audience}
					maxlength={1000}
					placeholder="Home baristas, 25–45, city dwellers"
				/>
			</div>

			<div class="field">
				<label for="archetype">Brand archetype <span class="hint">— optional</span></label>
				<select id="archetype" bind:value={archetype}>
					<option value="">Not sure yet — pick one for me</option>
					{#each data.archetypes as a (a.id)}
						<option value={a.id}>{a.label} — {a.traits.toLowerCase()}</option>
					{/each}
				</select>
			</div>
		</div>

		<fieldset class="checks">
			<legend>What should we check each name against?</legend>
			<p class="checks-hint">
				Each one is a live lookup. Turn off what you don't need and we'll skip it entirely rather
				than making you wait for it.
			</p>

			<label class="check">
				<input type="checkbox" bind:checked={wantDomains} />
				<span>
					<strong>Domains</strong>
					<em>{data.checkedTlds.map((t) => `.${t}`).join(', ')} — checked against each registry</em>
				</span>
			</label>

			<label class="check">
				<input type="checkbox" bind:checked={wantHandles} />
				<span>
					<strong>Handles</strong>
					<em>GitHub, Bluesky and npm</em>
				</span>
			</label>

			<label class="check">
				<input type="checkbox" bind:checked={wantTrademark} />
				<span>
					<strong>Trademarks</strong>
					<em>
						Exact matches on the US register, plus a prefilled search link. Never a clearance
						search.
					</em>
				</span>
			</label>
		</fieldset>

		<div class="actions">
			<button type="submit" disabled={loading}>{loading ? 'Naming…' : 'Generate names'}</button>
			{#if remaining !== null}
				<span class="counter">
					{remaining}
					{remaining === 1 ? 'generation' : 'generations'} left this hour of {data.limit}
				</span>
			{/if}
			{#if !data.user && remaining !== null}
				<a class="upsell" href="/auth/login">Sign in for {data.signedInLimit}/hour</a>
			{/if}
		</div>
	</form>

	{#if status}
		<div class="status" class:error={statusIsError} role="status" aria-live="polite">{status}</div>
	{/if}

	{#if names.length}
		<div class="results">
			{#each names as name (name.name)}
				{@const avail = availability[name.name]}
				<details class="card" on:toggle={() => loadAvailability(name.name)}>
					<summary class="card-summary">
						<span class="card-name">{name.name}</span>
						<span class="card-more">Why this one</span>
					</summary>

					<div class="card-body">
						<div class="chips">
							<span class="chip" class:good={name.checks.syllables <= 2}>
								{name.checks.syllables}
								{name.checks.syllables === 1 ? 'syllable' : 'syllables'}
							</span>
							<!-- Rank is 1 (A) to 26 (Z); "early" is the first third. -->
							<span class="chip" class:good={name.checks.alphabeticalRank <= 9}>
								Starts {name.checks.initial}
							</span>
							<span class="chip" class:good={name.checks.typable}>
								{name.checks.typable ? 'Easy to type' : 'Awkward to type'}
							</span>
						</div>

						<dl>
							{#if name.meaning}<dt>Meaning</dt>
								<dd>{name.meaning}</dd>{/if}
							{#if name.sound}<dt>Sound</dt>
								<dd>{name.sound}</dd>{/if}
							{#if name.radio}<dt>Radio test</dt>
								<dd>{name.radio}</dd>{/if}
							{#if name.translation}<dt>Travels well</dt>
								<dd>{name.translation}</dd>{/if}
						</dl>

						{#if wantedLabels.length}
							<div class="avail">
								{#if !avail}
									<p class="avail-pending">Checking {wantedLabels.join(', ')}…</p>
								{:else}
									{#if avail.domains}
										<div class="avail-group">
											<p class="avail-head">Domains</p>
											<div class="avail-list">
												{#each avail.domains as check (check.id)}
													<a
														class="slot {check.state}"
														href={check.url}
														rel="noopener noreferrer"
														target="_blank"
														title={slotTitle(check)}>{check.label}</a
													>
												{/each}
											</div>
										</div>
									{/if}

									{#if avail.handles}
										<div class="avail-group">
											<p class="avail-head">Handles</p>
											<div class="avail-list">
												{#each avail.handles as check (check.id)}
													<a
														class="slot {check.state}"
														href={check.url}
														rel="noopener noreferrer"
														target="_blank"
														title={slotTitle(check)}>{check.label}</a
													>
												{/each}
											</div>
										</div>
									{/if}

									{#if avail.trademark}
										<div class="avail-group">
											<p class="avail-head">Trademark</p>
											<div class="avail-list">
												<a
													class="slot {avail.trademark.state}"
													href={avail.trademark.url}
													rel="noopener noreferrer"
													target="_blank"
													title={slotTitle(avail.trademark)}
													>{trademarkLabel(avail.trademark.state)}</a
												>
											</div>
											{#if avail.trademark.note}
												<!-- Attached to the result, not a footnote. -->
												<span class="tm-caveat">{avail.trademark.note}</span>
											{/if}
										</div>
									{/if}

									{#if avail.domains && avail.unverifiableTlds?.length}
										<p class="avail-note">
											Not checked: {avail.unverifiableTlds.map((t) => `.${t}`).join(', ')} — these registries
											publish no lookup service, so we cannot tell free from taken.
										</p>
									{/if}
								{/if}
							</div>
						{/if}
					</div>
				</details>
			{/each}
		</div>
	{/if}

	<section class="guidelines">
		<h2>The heuristics</h2>
		<ul>
			{#each data.heuristics as h (h.label)}
				<li><strong>{h.label}</strong> — {h.guidance}</li>
			{/each}
		</ul>
	</section>

	<footer>
		<p>
			Availability is not clearance. Domain and handle checks are live lookups that can go stale
			within the hour, and the trademark check finds exact matches only — a name with no exact match
			can still infringe a similar mark in the same class. Confirm anything you intend to rely on.
		</p>
	</footer>
</div>

<style>
	/* The standalone build carried its own palette. Here the page borrows the
	   app's, so it follows the theme switcher and the two cannot drift. These
	   locals are only an adapter onto the real tokens in app.css. */
	.wrap {
		--bg: var(--color-background);
		--surface: var(--color-surface);
		--surface-2: var(--color-surface-hover);
		--text: var(--color-text);
		--text-dim: var(--color-text-secondary);
		--border: var(--color-border);
		--accent: var(--color-primary);
		--radius: var(--radius-md);
		--maxw: 60rem;
	}

	.wrap {
		max-width: var(--maxw);
		margin: 0 auto;
		padding: 2.5rem 1.25rem 5rem;
	}

	h1 {
		font-size: clamp(1.9rem, 5vw, 2.9rem);
		line-height: 1.12;
		letter-spacing: -0.03em;
		margin: 0 0 0.6rem;
	}

	.lede {
		font-size: 1.02rem;
		color: var(--text-dim);
		margin: 0 0 2rem;
		max-width: 44rem;
	}

	/* ── Form ───────────────────────────────────────────────── */

	form {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1.5rem;
	}

	.field + .field {
		margin-top: 1.1rem;
	}

	label {
		display: block;
		font-size: 0.82rem;
		font-weight: 600;
		margin-bottom: 0.35rem;
	}

	.hint {
		font-weight: 400;
		color: var(--text-dim);
	}

	textarea,
	input[type='text'],
	select {
		width: 100%;
		padding: 0.6rem 0.7rem;
		background: var(--bg);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 8px;
		font: inherit;
		font-size: 0.92rem;
	}

	textarea {
		resize: vertical;
		min-height: 5.5rem;
	}

	textarea:focus,
	input[type='text']:focus,
	select:focus {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
		border-color: transparent;
	}

	.row {
		display: grid;
		gap: 1.1rem;
		grid-template-columns: 1fr;
	}

	@media (min-width: 640px) {
		.row {
			grid-template-columns: 1fr 1fr;
		}

		.row .field + .field {
			margin-top: 0;
		}
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-top: 1.4rem;
		flex-wrap: wrap;
	}

	button[type='submit'] {
		background: var(--accent);
		color: var(--bg);
		border: none;
		border-radius: 8px;
		padding: 0.65rem 1.35rem;
		font: inherit;
		font-weight: 650;
		font-size: 0.92rem;
		cursor: pointer;
		transition: opacity 0.15s ease;
	}

	button[type='submit']:hover:not(:disabled) {
		opacity: 0.88;
	}

	button[type='submit']:disabled {
		opacity: 0.5;
		cursor: progress;
	}

	button[type='submit']:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 3px;
	}

	.counter {
		font-size: 0.78rem;
		color: var(--text-dim);
		font-variant-numeric: tabular-nums;
	}

	/* ── Field counter and check selection ──────────────────── */

	/* Silent until it matters: a counter sitting at 38/4000 is noise, and the
		   point of the bigger limit is that you should stop thinking about it. */
	.field-count {
		margin: 0.3rem 0 0;
		font-size: 0.72rem;
		color: var(--text-dim);
		font-variant-numeric: tabular-nums;
		min-height: 1em;
	}

	.field-count.near {
		color: var(--accent);
	}

	.checks {
		margin: 1.4rem 0 0;
		padding: 1rem 1.1rem 1.1rem;
		border: 1px solid var(--border);
		border-radius: 8px;
	}

	.checks legend {
		padding: 0 0.4rem;
		font-size: 0.82rem;
		font-weight: 600;
	}

	.checks-hint {
		margin: 0 0 0.75rem;
		font-size: 0.76rem;
		color: var(--text-dim);
	}

	.check {
		display: flex;
		align-items: flex-start;
		gap: 0.55rem;
		padding: 0.4rem 0;
		font-weight: 400;
		margin: 0;
		cursor: pointer;
	}

	.check input {
		margin: 0.15rem 0 0;
		width: 1rem;
		height: 1rem;
		accent-color: var(--accent);
		flex-shrink: 0;
		cursor: pointer;
	}

	.check strong {
		display: block;
		font-size: 0.85rem;
		font-weight: 600;
	}

	.check em {
		display: block;
		font-size: 0.74rem;
		font-style: normal;
		color: var(--text-dim);
		line-height: 1.45;
	}

	/* Dimmed rather than hidden — you can still see what you turned off. */
	.check:has(input:not(:checked)) strong,
	.check:has(input:not(:checked)) em {
		opacity: 0.55;
	}

	.check input:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	/* ── Status ─────────────────────────────────────────────── */

	.status {
		margin-top: 1.75rem;
		font-size: 0.9rem;
		color: var(--text-dim);
	}

	.status.error {
		color: var(--text);
		background: var(--surface);
		border: 1px solid var(--border);
		border-left: 3px solid #dc3545;
		border-radius: 8px;
		padding: 0.8rem 1rem;
	}

	/* ── Results ────────────────────────────────────────────── */

	/* A shortlist first, detail on demand. Closed cards tile at their natural
		   width; an open one takes the full row so its prose is not squeezed into a
		   column. */
	.results {
		display: grid;
		gap: 0.7rem;
		margin-top: 1.75rem;
		grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
		align-items: start;
	}

	.card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
	}

	.card[open] {
		grid-column: 1 / -1;
		border-color: color-mix(in srgb, var(--accent) 45%, transparent);
	}

	.card-summary {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.6rem;
		padding: 0.95rem 1.1rem;
		cursor: pointer;
		list-style: none;
	}

	/* Safari draws its own triangle without this. */
	.card-summary::-webkit-details-marker {
		display: none;
	}

	.card-summary:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	.card-name {
		font-size: 1.3rem;
		font-weight: 650;
		letter-spacing: -0.02em;
		color: var(--accent);
		line-height: 1.2;
	}

	/* The affordance. Quiet until you are on the card, because six of these
		   shouting "Why this one" would compete with the names themselves. */
	.card-more {
		flex-shrink: 0;
		font-size: 0.68rem;
		color: var(--text-dim);
		opacity: 0;
		transition: opacity var(--transition-fast, 150ms) ease;
	}

	.card:hover .card-more,
	.card-summary:focus-visible .card-more {
		opacity: 1;
	}

	.card[open] .card-more {
		opacity: 1;
	}

	.card[open] .card-more::after {
		content: ' — close';
	}

	.card-body {
		padding: 0 1.15rem 1.25rem;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-bottom: 0.85rem;
	}

	.chip {
		font-size: 0.7rem;
		font-weight: 600;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		background: var(--surface-2);
		color: var(--text-dim);
		white-space: nowrap;
	}

	.chip.good {
		background: color-mix(in srgb, var(--accent) 18%, transparent);
		color: var(--accent);
	}

	.card dl {
		margin: 0;
		display: grid;
		gap: 0.55rem;
	}

	.card dt {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-dim);
		margin-bottom: 0.1rem;
	}

	.card dd {
		margin: 0;
		font-size: 0.88rem;
	}

	/* ── Availability ───────────────────────────────────────── */

	.avail {
		margin-top: 0.9rem;
		padding-top: 0.85rem;
		border-top: 1px solid var(--border);
	}

	.avail-group + .avail-group {
		margin-top: 0.7rem;
	}

	.avail-head {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-dim);
		margin-bottom: 0.3rem;
	}

	.avail-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	/* Three states, three weights — never a bare green/red binary, because
		   "we could not check" must not look like either answer. */
	.slot {
		display: inline-flex;
		align-items: center;
		gap: 0.28rem;
		font-size: 0.72rem;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		padding: 0.16rem 0.45rem;
		border-radius: 6px;
		border: 1px solid var(--border);
		background: var(--surface-2);
		color: var(--text-dim);
		text-decoration: none;
	}

	a.slot:hover {
		border-color: var(--accent);
	}

	.slot::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
		background: var(--text-dim);
	}

	.slot.available {
		color: var(--accent);
		border-color: color-mix(in srgb, var(--accent) 45%, transparent);
	}

	.slot.available::before {
		background: var(--accent);
	}

	.slot.taken {
		color: var(--text-dim);
		opacity: 0.72;
	}

	.slot.taken::before {
		background: transparent;
		box-shadow: inset 0 0 0 1px var(--text-dim);
	}

	/* Deliberately neither colour. An unchecked slot is a question, not a result. */
	.slot.unchecked {
		border-style: dashed;
	}

	.slot.unchecked::before {
		background: transparent;
		box-shadow: inset 0 0 0 1px var(--border);
	}

	.avail-pending {
		font-size: 0.72rem;
		color: var(--text-dim);
	}

	/* The trademark caveat is not a footnote. It sits with the result. */
	.tm-caveat {
		display: block;
		font-size: 0.71rem;
		line-height: 1.45;
		color: var(--text-dim);
		margin-top: 0.35rem;
		padding-left: 0.6rem;
		border-left: 2px solid var(--border);
	}

	.avail-note {
		font-size: 0.7rem;
		color: var(--text-dim);
		margin-top: 0.4rem;
	}

	/* ── Guidelines ─────────────────────────────────────────── */

	.guidelines {
		margin-top: 3.5rem;
		border-top: 1px solid var(--border);
		padding-top: 1.75rem;
	}

	.guidelines h2 {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.09em;
		color: var(--text-dim);
		margin: 0 0 0.9rem;
	}

	.guidelines ul {
		margin: 0;
		padding-left: 1.1rem;
		columns: 2;
		column-gap: 2.5rem;
		font-size: 0.86rem;
		color: var(--text-dim);
	}

	.guidelines li {
		margin-bottom: 0.4rem;
		break-inside: avoid;
	}

	.guidelines strong {
		color: var(--text);
		font-weight: 600;
	}

	@media (max-width: 620px) {
		.guidelines ul {
			columns: 1;
		}
	}

	footer {
		margin-top: 2.5rem;
		font-size: 0.8rem;
		color: var(--text-dim);
	}

	@media (prefers-reduced-motion: reduce) {
		* {
			transition: none !important;
		}
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	/* Only offered once a run has happened and the ceiling is real to them. */
	.upsell {
		font-size: 0.76rem;
		color: var(--accent);
	}
</style>
