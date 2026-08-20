<script lang="ts">
	/**
	 * The public brand-name generator.
	 *
	 * Reachable without an account on purpose — someone who names their brand here
	 * has already taken the first step of onboarding, and the page points at the
	 * rest. Signing in only raises the hourly ceiling.
	 *
	 * ── Three things this page is built around ─────────────────────────────────
	 *
	 * **Names arrive one at a time.** Generation takes fifteen to twenty seconds.
	 * The endpoint streams NDJSON and emits each name the moment its JSON object
	 * closes, so the page fills a row of empty slots as the model writes rather
	 * than sitting dead and then flashing six cards at once.
	 *
	 * **Rejections are shown, not swallowed.** With a domain requirement on, most
	 * candidates get struck off. Watching that happen is the clearest possible
	 * account of what the wait is buying; hiding it makes the same wait look
	 * broken.
	 *
	 * **The order is the input.** Taste is far easier to demonstrate by arranging
	 * six candidates than to describe in a brief, so the list is drag-rankable and
	 * "More like these" feeds that order back as the strongest signal available.
	 *
	 * Everything is real markup rather than DOM built in a handler: Svelte scopes
	 * styles by adding a class to template elements, and anything created at
	 * runtime never gets it.
	 */
	import type { PageData } from './$types';
	import Seo from '$lib/components/Seo.svelte';
	import { absoluteUrl } from '$lib/site';

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

	/** TLDs that must be free for a name to be worth showing at all. */
	let requireTlds: string[] = [];

	let loading = false;
	let status = '';
	let statusIsError = false;

	let names: NameCard[] = [];
	/** Struck off by the domain requirement, newest first. */
	let rejected: { name: string; reason: string }[] = [];
	let remaining: number | null = null;
	let hourlyLimit = data.limit;

	/** Every name shown this session, so a refine round never repeats one. */
	let seen: string[] = [];
	let round = 0;

	let availability: Record<string, Availability> = {};
	let requested = new Set<string>();

	/** Frozen at submit, so toggling mid-run cannot leave cards checked two ways. */
	let activeChecks = { domains: true, handles: true, trademark: true };
	let activeRequire: string[] = [];

	$: charsLeft = MAX_DESCRIPTION - description.length;
	$: showCount = description.length >= MAX_DESCRIPTION * 0.75;
	$: wantedLabels = [
		activeChecks.domains && 'domains',
		activeChecks.handles && 'handles',
		activeChecks.trademark && 'trademarks'
	].filter(Boolean) as string[];

	/** Empty slots still to fill, so the grid shows the shape of what is coming. */
	$: pending = loading ? Math.max(0, data.namesPerRound - names.length) : 0;
	$: canRefine = names.length > 1 && !loading;
	/**
	 * Asking for a free .com throws most candidates away, so a round can end well
	 * short of a full set. Saying so beats leaving someone to wonder whether the
	 * generator simply gave up.
	 */
	$: shortfall =
		!loading && rejected.length > 0 && names.length > 0 && names.length < data.namesPerRound;

	function toggleTld(tld: string) {
		requireTlds = requireTlds.includes(tld)
			? requireTlds.filter((t) => t !== tld)
			: [...requireTlds, tld];
	}

	/**
	 * Whole NDJSON lines from a chunked body.
	 *
	 * A hand-rolled twin of the server's reader — the browser cannot import from
	 * `$lib/server`, and the alternative is moving the parser somewhere neither
	 * side owns for the sake of ten lines.
	 */
	function lineReader() {
		let buffer = '';
		return (chunk: string): string[] => {
			buffer += chunk;
			const lines = buffer.split('\n');
			buffer = lines.pop() as string;
			return lines.filter((line) => line.trim());
		};
	}

	async function generate(refine = false) {
		activeChecks = { domains: wantDomains, handles: wantHandles, trademark: wantTrademark };
		activeRequire = [...requireTlds];

		// A refine round keeps the ranking as its steer; a fresh run starts clean.
		const liked = refine ? names.map((n) => n.name) : [];
		if (!refine) {
			seen = [];
			round = 0;
		}

		loading = true;
		statusIsError = false;
		status = refine ? 'Reading your ranking…' : 'Reading your brief…';
		names = [];
		rejected = [];
		availability = {};
		requested = new Set();

		try {
			const response = await fetch('/api/namer/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					description,
					audience,
					archetype,
					liked,
					avoid: seen,
					requireTlds: activeRequire
				})
			});

			// A refusal still arrives as JSON with a status — the stream only begins
			// once the request is accepted.
			if (!response.ok || !response.body) {
				const body = await response.json().catch(() => ({}));
				status = body.error || 'Something went wrong. Try again.';
				statusIsError = true;
				return;
			}

			round += 1;
			status = 'Writing names…';

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			const takeLines = lineReader();

			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;

				for (const line of takeLines(decoder.decode(value, { stream: true }))) {
					let event: Record<string, unknown>;
					try {
						event = JSON.parse(line);
					} catch {
						continue;
					}

					if (event.type === 'name') {
						const card = event.name as NameCard;
						names = [...names, card];
						seen = [...seen, card.name];
						status = `${names.length} of ${data.namesPerRound}…`;
					} else if (event.type === 'rejected') {
						rejected = [
							{ name: event.name as string, reason: event.reason as string },
							...rejected
						];
						seen = [...seen, event.name as string];
					} else if (event.type === 'done') {
						remaining = event.remaining as number;
						hourlyLimit = event.limit as number;
						status = '';
					} else if (event.type === 'error') {
						status = event.error as string;
						statusIsError = true;
					}
				}
			}
		} catch {
			status = 'Could not reach the generator. Check your connection and try again.';
			statusIsError = true;
		} finally {
			loading = false;
		}
	}

	// ── Ranking ────────────────────────────────────────────────────────────────

	let dragIndex: number | null = null;

	function move(from: number, to: number) {
		if (to < 0 || to >= names.length || from === to) return;
		const next = [...names];
		const [card] = next.splice(from, 1);
		next.splice(to, 0, card);
		names = next;
	}

	function onDrop(index: number) {
		if (dragIndex !== null) move(dragIndex, index);
		dragIndex = null;
	}

	// ── Availability ───────────────────────────────────────────────────────────

	/**
	 * Fetched when a card is first opened, never up front. Nobody reads ten
	 * lookups for a name they rejected on sight, and firing all of them at once
	 * tripped registry rate limits — which surfaced as spurious "unchecked".
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

	// ── Sharing ────────────────────────────────────────────────────────────────

	let justShared: string | null = null;

	async function shareName(card: NameCard) {
		const text = `${card.name} — ${card.meaning}`;
		// The production link, not this origin — a name shared from a preview or
		// localhost should still point somewhere a reader can open.
		const url = absoluteUrl('/name');

		try {
			if (navigator.share) {
				await navigator.share({ title: `${card.name} — a brand name from Nabu`, text, url });
				return;
			}
			await navigator.clipboard.writeText(`${text}\n\nNamed with ${url}`);
			justShared = card.name;
			setTimeout(() => {
				if (justShared === card.name) justShared = null;
			}, 2000);
		} catch (error) {
			// A dismissed share sheet is someone changing their mind, not a failure.
			if ((error as Error)?.name === 'AbortError') return;
			status = 'Could not share that — copy it by hand.';
			statusIsError = true;
		}
	}
</script>

<Seo
	path="/name"
	title="Name your brand"
	description="Six brand names generated against nine real naming heuristics — short, early in the alphabet, survives the radio test — then checked against the domains, the handles and the trademark register. Free, no account."
	image="name"
/>

<div class="wrap">
	<!-- ── Hero ──────────────────────────────────────────────────────────── -->
	<header class="hero">
		<p class="eyebrow">Free tool</p>
		<h1>
			Name your <span class="mark">brand</span>.
		</h1>
		<p class="lede">
			Six names against nine real heuristics — short, early in the alphabet, survives being heard
			once aloud, and actually means something. Then we check what is genuinely free, and say
			plainly what we could not check.
		</p>
	</header>

	<!-- ── The brief ─────────────────────────────────────────────────────── -->
	<form on:submit|preventDefault={() => generate(false)}>
		<div class="brief">
			<label for="description">What are you building?</label>
			<textarea
				id="description"
				bind:value={description}
				maxlength={MAX_DESCRIPTION}
				required
				rows="3"
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
				<label for="audience">Who is it for? <span class="hint">optional</span></label>
				<input
					type="text"
					id="audience"
					bind:value={audience}
					maxlength={1000}
					placeholder="Home baristas, 25–45, city dwellers"
				/>
			</div>

			<div class="field">
				<label for="archetype">Brand archetype <span class="hint">optional</span></label>
				<select id="archetype" bind:value={archetype}>
					<option value="">Not sure yet — pick one for me</option>
					{#each data.archetypes as a (a.id)}
						<option value={a.id}>{a.label} — {a.traits.toLowerCase()}</option>
					{/each}
				</select>
			</div>
		</div>

		<!-- ── Requirement ────────────────────────────────────────────────── -->
		<div class="require">
			<div class="require-head">
				<span class="require-title">Insist the domain is free</span>
				<span class="require-sub">
					Names whose domain is already registered are discarded before you see them. Only TLDs with
					a real lookup service can be enforced.
				</span>
			</div>
			<div class="tlds">
				{#each data.checkedTlds as tld (tld)}
					<button
						type="button"
						class="tld"
						class:on={requireTlds.includes(tld)}
						aria-pressed={requireTlds.includes(tld)}
						on:click={() => toggleTld(tld)}
					>
						.{tld}
					</button>
				{/each}
			</div>
		</div>

		<!-- ── What to look up ────────────────────────────────────────────── -->
		<fieldset class="checks">
			<legend>Then check each survivor against</legend>
			<div class="pills">
				<label class="pill" class:on={wantDomains}>
					<input type="checkbox" bind:checked={wantDomains} />
					<span>Domains</span>
				</label>
				<label class="pill" class:on={wantHandles}>
					<input type="checkbox" bind:checked={wantHandles} />
					<span>Handles</span>
				</label>
				<label class="pill" class:on={wantTrademark}>
					<input type="checkbox" bind:checked={wantTrademark} />
					<span>Trademarks</span>
				</label>
			</div>
		</fieldset>

		<div class="actions">
			<button type="submit" class="go" disabled={loading}>
				{#if loading}
					<span class="spinner" aria-hidden="true"></span>
					Naming…
				{:else if round > 0}
					Start over
				{:else}
					Generate names
				{/if}
			</button>

			{#if canRefine}
				<button type="button" class="refine" on:click={() => generate(true)}>
					More like these
					<span class="refine-hint">uses your order</span>
				</button>
			{/if}

			{#if remaining !== null}
				<span class="counter">
					{remaining}
					{remaining === 1 ? 'generation' : 'generations'} left this hour of {hourlyLimit}
				</span>
			{/if}
			{#if !data.user && remaining !== null}
				<a class="upsell" href="/auth/login">Sign in for {data.signedInLimit}/hour</a>
			{/if}
		</div>
	</form>

	<!-- ── Live status ───────────────────────────────────────────────────── -->
	{#if status}
		<div class="status" class:error={statusIsError} role="status" aria-live="polite">
			{#if loading}<span class="pulse" aria-hidden="true"></span>{/if}
			{status}
		</div>
	{/if}

	<!-- Struck off before they ever reached the list. Shown because a run that
	     silently discards four of six looks stalled. -->
	{#if rejected.length}
		<ul class="rejected" aria-label="Discarded names">
			{#each rejected.slice(0, 5) as item (item.name)}
				<li><s>{item.name}</s> <span>{item.reason}</span></li>
			{/each}
			{#if rejected.length > 5}
				<li class="rejected-more">and {rejected.length - 5} more</li>
			{/if}
		</ul>
	{/if}

	<!-- ── Results ───────────────────────────────────────────────────────── -->
	{#if shortfall}
		<p class="shortfall">
			{names.length} of {data.namesPerRound} had a free .{activeRequire.join(', .')} — the rest are listed
			above. Generate again for more.
		</p>
	{/if}

	{#if names.length || pending}
		{#if names.length > 1}
			<p class="rank-hint">
				Drag to rank them, best first — then <strong>More like these</strong> generates a new set from
				your order.
			</p>
		{/if}

		<ol class="results">
			{#each names as name, index (name.name)}
				{@const avail = availability[name.name]}
				<li
					class="slot-wrap"
					class:dragging={dragIndex === index}
					draggable="true"
					on:dragstart={() => (dragIndex = index)}
					on:dragend={() => (dragIndex = null)}
					on:dragover|preventDefault
					on:drop|preventDefault={() => onDrop(index)}
				>
					<div class="rank">
						<span class="rank-number">{index + 1}</span>
						<span class="grip" aria-hidden="true">⠿</span>
						<span class="rank-moves">
							<button
								type="button"
								on:click={() => move(index, index - 1)}
								disabled={index === 0}
								aria-label="Move {name.name} up">▲</button
							>
							<button
								type="button"
								on:click={() => move(index, index + 1)}
								disabled={index === names.length - 1}
								aria-label="Move {name.name} down">▼</button
							>
						</span>
					</div>

					<details class="card" on:toggle={() => loadAvailability(name.name)}>
						<summary class="card-summary">
							<span class="card-name">{name.name}</span>
							<span class="card-meta">
								<span class="chip" class:good={name.checks.syllables <= 2}>
									{name.checks.syllables}
									{name.checks.syllables === 1 ? 'syl' : 'syls'}
								</span>
								<!-- Rank is 1 (A) to 26 (Z); "early" is the first third. -->
								<span class="chip" class:good={name.checks.alphabeticalRank <= 9}>
									{name.checks.initial}
								</span>
								<span class="card-more">Why this one</span>
							</span>
						</summary>

						<div class="card-body">
							<div class="card-actions">
								<button type="button" class="share" on:click={() => shareName(name)}>
									{justShared === name.name ? 'Copied' : 'Share this name'}
								</button>
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
										<p class="avail-pending">
											<span class="pulse" aria-hidden="true"></span>
											Checking {wantedLabels.join(', ')}…
										</p>
									{:else}
										{#if avail.domains}
											<div class="avail-group">
												<p class="avail-head">Domains</p>
												<div class="avail-list">
													{#each avail.domains as check (check.id)}
														<a
															class="dot {check.state}"
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
															class="dot {check.state}"
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
														class="dot {avail.trademark.state}"
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
												Not checked: {avail.unverifiableTlds.map((t) => `.${t}`).join(', ')} — these
												registries publish no lookup service, so we cannot tell free from taken.
											</p>
										{/if}
									{/if}
								</div>
							{/if}
						</div>
					</details>
				</li>
			{/each}

			<!-- Empty slots for what is still coming, so the grid shows its shape. -->
			{#each Array(pending) as _, i (i)}
				<li class="slot-wrap ghost" aria-hidden="true">
					<div class="rank"><span class="rank-number">{names.length + i + 1}</span></div>
					<div class="card skeleton"><span class="shimmer"></span></div>
				</li>
			{/each}
		</ol>
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
	/* The page borrows the app's palette rather than carrying its own, so it
	   follows the theme switcher and the two can never drift. These locals are an
	   adapter onto the real tokens in app.css. */
	.wrap {
		--bg: var(--color-background);
		--surface: var(--color-surface);
		--surface-2: var(--color-surface-hover);
		--text: var(--color-text);
		--dim: var(--color-text-secondary);
		--line: var(--color-border);
		--accent: var(--color-primary);
		--radius: var(--radius-md);

		max-width: 58rem;
		margin: 0 auto;
		padding: clamp(2rem, 6vw, 4.5rem) 1.25rem 5rem;
	}

	/* ── Hero ─────────────────────────────────────────────────────────────── */

	.hero {
		margin-bottom: clamp(1.75rem, 4vw, 2.75rem);
	}

	.eyebrow {
		margin: 0 0 0.7rem;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.7rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--accent);
	}

	h1 {
		margin: 0 0 0.9rem;
		font-size: clamp(2.4rem, 7vw, 4rem);
		line-height: 1.02;
		letter-spacing: -0.04em;
		font-weight: 700;
	}

	/* The one flourish, and it is the logo's own geometry: the mark is two
	   interlocking shapes cut on a diagonal, so the underline is cut the same way
	   rather than being a rectangle. */
	.mark {
		position: relative;
		white-space: nowrap;
	}

	.mark::after {
		content: '';
		position: absolute;
		left: -0.04em;
		right: -0.04em;
		bottom: 0.06em;
		height: 0.22em;
		background:
			linear-gradient(100deg, var(--accent) 0%, var(--accent) 55%, transparent 55%),
			linear-gradient(100deg, transparent 45%, var(--accent) 45%);
		opacity: 0.28;
		border-radius: 2px;
		z-index: -1;
	}

	.lede {
		margin: 0;
		max-width: 40rem;
		font-size: clamp(1rem, 2.2vw, 1.12rem);
		line-height: 1.6;
		color: var(--dim);
	}

	/* ── Form ─────────────────────────────────────────────────────────────── */

	form {
		display: grid;
		gap: 1.1rem;
	}

	label {
		display: block;
		font-size: 0.8rem;
		font-weight: 600;
		margin-bottom: 0.4rem;
	}

	.hint {
		font-weight: 400;
		color: var(--dim);
	}

	/* The brief is the whole input to the thing, so it gets the weight. */
	.brief {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 1.15rem 1.25rem 0.9rem;
		transition: border-color 160ms ease;
	}

	.brief:focus-within {
		border-color: var(--accent);
	}

	textarea,
	input[type='text'],
	select {
		width: 100%;
		font: inherit;
		color: var(--text);
		background: transparent;
		border: none;
		padding: 0;
	}

	textarea {
		font-size: 1.05rem;
		line-height: 1.55;
		resize: vertical;
		min-height: 4.6rem;
	}

	textarea:focus,
	input[type='text']:focus,
	select:focus {
		outline: none;
	}

	textarea::placeholder,
	input::placeholder {
		color: var(--dim);
		opacity: 0.65;
	}

	.row {
		display: grid;
		gap: 1.1rem;
		grid-template-columns: 1fr;
	}

	@media (min-width: 660px) {
		.row {
			grid-template-columns: 1fr 1fr;
		}
	}

	.field input[type='text'],
	.field select {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 0.6rem 0.75rem;
		font-size: 0.92rem;
	}

	.field input[type='text']:focus,
	.field select:focus {
		outline: none;
		border-color: var(--accent);
	}

	/* ── Domain requirement ───────────────────────────────────────────────── */

	.require {
		display: grid;
		gap: 0.75rem;
		padding: 1rem 1.15rem;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		/* A hairline of accent down the edge, so the one control that changes what
		   you are shown does not read as another checkbox row. */
		border-left: 3px solid color-mix(in srgb, var(--accent) 55%, transparent);
	}

	.require-title {
		display: block;
		font-size: 0.86rem;
		font-weight: 650;
	}

	.require-sub {
		display: block;
		margin-top: 0.25rem;
		font-size: 0.78rem;
		line-height: 1.5;
		color: var(--dim);
	}

	.tlds {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.tld {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.8rem;
		padding: 0.3rem 0.7rem;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: none;
		color: var(--dim);
		cursor: pointer;
		transition:
			color 140ms ease,
			border-color 140ms ease,
			background-color 140ms ease;
	}

	.tld:hover {
		color: var(--text);
		border-color: var(--accent);
	}

	.tld.on {
		background: color-mix(in srgb, var(--accent) 16%, transparent);
		border-color: var(--accent);
		color: var(--accent);
		font-weight: 650;
	}

	.tld:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	/* ── Check pills ──────────────────────────────────────────────────────── */

	.checks {
		border: none;
		padding: 0;
		margin: 0;
	}

	.checks legend {
		padding: 0;
		font-size: 0.8rem;
		font-weight: 600;
		margin-bottom: 0.5rem;
	}

	.pills {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}

	.pill {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0;
		padding: 0.35rem 0.8rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		font-size: 0.82rem;
		font-weight: 500;
		color: var(--dim);
		cursor: pointer;
		transition:
			color 140ms ease,
			border-color 140ms ease;
	}

	.pill input {
		width: 0.85rem;
		height: 0.85rem;
		margin: 0;
		accent-color: var(--accent);
		cursor: pointer;
	}

	.pill.on {
		color: var(--text);
		border-color: color-mix(in srgb, var(--accent) 45%, transparent);
	}

	.pill:hover {
		border-color: var(--accent);
	}

	/* ── Actions ──────────────────────────────────────────────────────────── */

	.actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.75rem 1rem;
		margin-top: 0.35rem;
	}

	.go {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		background: var(--accent);
		color: var(--bg);
		border: none;
		border-radius: 999px;
		padding: 0.7rem 1.6rem;
		font: inherit;
		font-size: 0.95rem;
		font-weight: 650;
		cursor: pointer;
		transition:
			transform 140ms ease,
			opacity 140ms ease;
	}

	.go:hover:not(:disabled) {
		transform: translateY(-1px);
	}

	.go:disabled {
		opacity: 0.75;
		cursor: progress;
	}

	.go:focus-visible,
	.refine:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 3px;
	}

	.refine {
		display: inline-flex;
		align-items: baseline;
		gap: 0.4rem;
		background: none;
		border: 1px solid var(--accent);
		border-radius: 999px;
		padding: 0.62rem 1.2rem;
		font: inherit;
		font-size: 0.9rem;
		font-weight: 650;
		color: var(--accent);
		cursor: pointer;
	}

	.refine-hint {
		font-size: 0.72rem;
		font-weight: 400;
		opacity: 0.75;
	}

	.counter,
	.upsell {
		font-size: 0.78rem;
		color: var(--dim);
		font-variant-numeric: tabular-nums;
	}

	.upsell {
		color: var(--accent);
	}

	/* ── Motion ───────────────────────────────────────────────────────────── */

	.spinner {
		width: 0.9rem;
		height: 0.9rem;
		border-radius: 50%;
		border: 2px solid color-mix(in srgb, var(--bg) 40%, transparent);
		border-top-color: var(--bg);
		animation: spin 700ms linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* A slow breath rather than a blink — the wait is fifteen seconds, and a fast
	   pulse over that long reads as alarm rather than activity. */
	.pulse {
		display: inline-block;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--accent);
		margin-right: 0.45rem;
		animation: breathe 1.6s ease-in-out infinite;
	}

	@keyframes breathe {
		0%,
		100% {
			opacity: 0.25;
			transform: scale(0.8);
		}
		50% {
			opacity: 1;
			transform: scale(1);
		}
	}

	/* ── Status and rejections ────────────────────────────────────────────── */

	.status {
		display: flex;
		align-items: center;
		margin-top: 1.4rem;
		font-size: 0.9rem;
		color: var(--dim);
		font-variant-numeric: tabular-nums;
	}

	.status.error {
		color: var(--text);
		background: var(--surface);
		border: 1px solid var(--line);
		border-left: 3px solid var(--color-error);
		border-radius: var(--radius);
		padding: 0.8rem 1rem;
	}

	.rejected {
		list-style: none;
		margin: 0.7rem 0 0;
		padding: 0;
		display: grid;
		gap: 0.2rem;
		font-size: 0.78rem;
		color: var(--dim);
	}

	.rejected li {
		animation: slip 220ms ease;
	}

	.rejected s {
		color: var(--text);
		opacity: 0.55;
		margin-right: 0.4rem;
	}

	.rejected-more {
		opacity: 0.7;
		font-style: italic;
	}

	@keyframes slip {
		from {
			opacity: 0;
			transform: translateX(-4px);
		}
	}

	/* ── Results ──────────────────────────────────────────────────────────── */

	.shortfall {
		margin: 0.9rem 0 0;
		font-size: 0.82rem;
		color: var(--dim);
	}

	.rank-hint {
		margin: 1.6rem 0 0.6rem;
		font-size: 0.82rem;
		color: var(--dim);
	}

	.results {
		list-style: none;
		margin: 0.9rem 0 0;
		padding: 0;
		display: grid;
		gap: 0.55rem;
	}

	.slot-wrap {
		display: grid;
		grid-template-columns: 2.4rem 1fr;
		align-items: start;
		gap: 0.6rem;
		animation: rise 260ms ease backwards;
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
	}

	.slot-wrap.dragging {
		opacity: 0.4;
	}

	.rank {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
		padding-top: 0.95rem;
		color: var(--dim);
		cursor: grab;
	}

	.rank-number {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.85rem;
		font-weight: 650;
		color: var(--accent);
	}

	.grip {
		font-size: 0.7rem;
		opacity: 0.5;
	}

	/* Keyboard equivalent of the drag, because ranking is the whole feature and a
	   pointer-only version of it is not a feature everyone has. */
	.rank-moves {
		display: flex;
		flex-direction: column;
		line-height: 1;
	}

	.rank-moves button {
		background: none;
		border: none;
		padding: 0.1rem;
		font-size: 0.55rem;
		color: var(--dim);
		cursor: pointer;
	}

	.rank-moves button:disabled {
		opacity: 0.25;
		cursor: default;
	}

	.rank-moves button:hover:not(:disabled) {
		color: var(--accent);
	}

	.card {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		overflow: hidden;
		transition: border-color 160ms ease;
	}

	.card[open] {
		border-color: color-mix(in srgb, var(--accent) 45%, transparent);
	}

	.card-summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.85rem 1.1rem;
		cursor: pointer;
		list-style: none;
	}

	.card-summary::-webkit-details-marker {
		display: none;
	}

	.card-summary:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	.card-name {
		font-size: 1.35rem;
		font-weight: 650;
		letter-spacing: -0.02em;
		color: var(--accent);
		line-height: 1.15;
	}

	.card-meta {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-shrink: 0;
	}

	.chip {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.68rem;
		padding: 0.12rem 0.42rem;
		border-radius: 999px;
		background: var(--surface-2);
		color: var(--dim);
		white-space: nowrap;
	}

	.chip.good {
		background: color-mix(in srgb, var(--accent) 16%, transparent);
		color: var(--accent);
	}

	/* Hidden on narrow screens rather than truncated: the chips already say the
	   useful part, and a clipped "Why th…" is worse than no label. */
	.card-more {
		font-size: 0.68rem;
		color: var(--dim);
		white-space: nowrap;
	}

	@media (max-width: 560px) {
		.card-more {
			display: none;
		}
	}

	.card[open] .card-more::after {
		content: ' — close';
	}

	.card-body {
		padding: 0 1.1rem 1.15rem;
	}

	.card-actions {
		display: flex;
		justify-content: flex-end;
		margin: -0.2rem 0 0.6rem;
	}

	.share {
		padding: 0.28rem 0.7rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: none;
		color: var(--dim);
		font: inherit;
		font-size: 0.72rem;
		font-weight: 600;
		cursor: pointer;
	}

	.share:hover {
		color: var(--accent);
		border-color: var(--accent);
	}

	dl {
		margin: 0;
		display: grid;
		gap: 0.5rem;
	}

	dt {
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--dim);
	}

	dd {
		margin: 0;
		font-size: 0.88rem;
		line-height: 1.55;
	}

	/* ── Skeletons ────────────────────────────────────────────────────────── */

	.ghost .rank-number {
		color: var(--dim);
		opacity: 0.5;
	}

	.skeleton {
		position: relative;
		height: 3.35rem;
		overflow: hidden;
		border-style: dashed;
	}

	.shimmer {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			100deg,
			transparent 20%,
			color-mix(in srgb, var(--accent) 9%, transparent) 50%,
			transparent 80%
		);
		background-size: 220% 100%;
		animation: sweep 1.5s ease-in-out infinite;
	}

	@keyframes sweep {
		from {
			background-position: 180% 0;
		}
		to {
			background-position: -80% 0;
		}
	}

	/* ── Availability ─────────────────────────────────────────────────────── */

	.avail {
		margin-top: 0.85rem;
		padding-top: 0.8rem;
		border-top: 1px solid var(--line);
	}

	.avail-group + .avail-group {
		margin-top: 0.65rem;
	}

	.avail-head {
		margin: 0 0 0.3rem;
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--dim);
	}

	.avail-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.avail-pending {
		display: flex;
		align-items: center;
		margin: 0;
		font-size: 0.78rem;
		color: var(--dim);
	}

	/* Three states, three weights — never a green/red binary, because "we could
	   not check" must not look like either answer. */
	.dot {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.72rem;
		padding: 0.16rem 0.45rem;
		border-radius: 6px;
		border: 1px solid var(--line);
		background: var(--surface-2);
		color: var(--dim);
		text-decoration: none;
	}

	.dot::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
		background: var(--dim);
	}

	.dot:hover {
		border-color: var(--accent);
	}

	.dot.available {
		color: var(--accent);
		border-color: color-mix(in srgb, var(--accent) 45%, transparent);
	}

	.dot.available::before {
		background: var(--accent);
	}

	.dot.taken {
		opacity: 0.7;
	}

	.dot.taken::before {
		background: transparent;
		box-shadow: inset 0 0 0 1px var(--dim);
	}

	/* Deliberately neither colour: an unchecked slot is a question, not a result. */
	.dot.unchecked {
		border-style: dashed;
	}

	.dot.unchecked::before {
		background: transparent;
		box-shadow: inset 0 0 0 1px var(--line);
	}

	.tm-caveat {
		display: block;
		margin-top: 0.35rem;
		padding-left: 0.6rem;
		border-left: 2px solid var(--line);
		font-size: 0.71rem;
		line-height: 1.45;
		color: var(--dim);
	}

	.avail-note {
		margin: 0.4rem 0 0;
		font-size: 0.7rem;
		color: var(--dim);
	}

	/* ── Heuristics and footer ────────────────────────────────────────────── */

	.guidelines {
		margin-top: 3.5rem;
		border-top: 1px solid var(--line);
		padding-top: 1.6rem;
	}

	.guidelines h2 {
		margin: 0 0 0.9rem;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.09em;
		color: var(--dim);
	}

	.guidelines ul {
		margin: 0;
		padding-left: 1.05rem;
		columns: 2;
		column-gap: 2.5rem;
		font-size: 0.84rem;
		line-height: 1.5;
		color: var(--dim);
	}

	.guidelines li {
		margin-bottom: 0.45rem;
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
		margin-top: 2.2rem;
		font-size: 0.78rem;
		line-height: 1.6;
		color: var(--dim);
	}

	@media (prefers-reduced-motion: reduce) {
		.spinner,
		.pulse,
		.shimmer,
		.rejected li,
		.slot-wrap {
			animation: none;
		}

		.go:hover:not(:disabled) {
			transform: none;
		}

		/* The shimmer carried the "still working" signal; without motion the dashed
		   outline and a static tint have to carry it instead. */
		.shimmer {
			background: color-mix(in srgb, var(--accent) 7%, transparent);
		}
	}
</style>
