<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	/**
	 * Public API reference.
	 *
	 * Renders `$lib/api-spec` rather than restating it in prose, so this page cannot
	 * describe an endpoint that does not exist — and `api-spec-drift.test.ts` fails the
	 * build if a route is added or removed without updating that file. The scope and
	 * style lists shown here are the same constants the server enforces.
	 */
	import {
		V1_ENDPOINTS,
		KEY_ENDPOINTS,
		ALL_SCOPES,
		SCOPE_DESCRIPTIONS,
		LOGO_STYLES,
		LOGO_STYLE_DESCRIPTIONS,
		ERROR_CODES,
		API_BASE_URL,
		API_VERSION,
		type ApiEndpoint
	} from '$lib/api-spec';

	/** Group by status so the error table reads as tiers rather than a flat list. */
	$: errorsByStatus = ERROR_CODES.reduce<Record<number, typeof ERROR_CODES>>((acc, e) => {
		(acc[e.status] ??= []).push(e);
		return acc;
	}, {});

	function anchor(e: ApiEndpoint): string {
		return `${e.method}-${e.path}`
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
	}
</script>

<Seo
	path="/docs/api"
	title="API reference"
	description="Nabu's public API: manage brands and generate assets programmatically."
	image="default"
/>

<div class="docs">
	<header class="head">
		<span class="eyebrow">API reference · {API_VERSION}</span>
		<h1>Manage brands from your own app</h1>
		<p class="lede">
			Read brands and generate assets over HTTP. Every endpoint below is generated from the running
			API's own definitions, so this page cannot drift out of step with it.
		</p>
		<code class="base">{API_BASE_URL}</code>
	</header>

	<!-- Auth first: nothing else on the page is usable without it. -->
	<section class="block">
		<h2>Authentication</h2>
		<p>Send your key as a bearer token on every <code>/api/{API_VERSION}</code> request.</p>
		<pre><code>Authorization: Bearer nabu_sk_…</code></pre>
		<p class="note">
			Keys are stored as a SHA-256 hash. The plaintext is shown once when you create it and cannot
			be recovered afterwards — if you lose it, revoke it and make another.
		</p>
	</section>

	<section class="block">
		<h2>Scopes</h2>
		<p>
			There is no hierarchy: <code>assets:write</code> does not imply
			<code>assets:read</code>. Ask for each scope you need. New keys default to
			<code>brands:read</code>.
		</p>
		<dl class="defs">
			{#each ALL_SCOPES as scope (scope)}
				<div class="def">
					<dt><code>{scope}</code></dt>
					<dd>{SCOPE_DESCRIPTIONS[scope]}</dd>
				</div>
			{/each}
		</dl>
	</section>

	<section class="block">
		<h2>Brand access</h2>
		<p>
			A key acts as the person who created it. For each brand that resolves to a role —
			<code>owner</code>, <code>manager</code>, <code>editor</code> or <code>viewer</code> — and only
			the first three can write.
		</p>
		<p class="note">
			A brand you cannot reach returns <code>404</code>, not <code>403</code>. That is deliberate: a
			403 would confirm the id exists to someone with no business knowing.
		</p>
	</section>

	{#each [{ title: 'Endpoints', items: V1_ENDPOINTS }, { title: 'Managing keys', items: KEY_ENDPOINTS }] as group (group.title)}
		<section class="block">
			<h2>{group.title}</h2>
			{#if group.title === 'Managing keys'}
				<p>
					These use your browser session, not an API key — a key cannot mint another key, or a
					single leak would outlive revoking the original.
				</p>
			{/if}

			{#each group.items as e (anchor(e))}
				<article class="endpoint" id={anchor(e)}>
					<div class="ep-head">
						<span class="method method-{e.method.toLowerCase()}">{e.method}</span>
						<code class="ep-path">{e.path}</code>
						{#if e.scope}
							<span class="scope-tag">{e.scope}</span>
						{:else}
							<span class="scope-tag session">session</span>
						{/if}
					</div>

					<h3 class="ep-summary">{e.summary}</h3>
					<p class="ep-desc">{e.description}</p>

					{#if e.body?.length}
						<div class="params">
							<span class="params-label">Body</span>
							{#each e.body as p (p.name)}
								<div class="param">
									<div class="param-sig">
										<code>{p.name}</code>
										<span class="param-type">{p.type}</span>
										{#if p.required}
											<span class="req">required</span>
										{:else if p.default}
											<span class="param-default">default {p.default}</span>
										{:else}
											<span class="param-default">optional</span>
										{/if}
									</div>
									<p class="param-desc">{p.description}</p>
								</div>
							{/each}
						</div>
					{/if}

					<p class="returns"><span class="returns-label">Returns</span> {e.returns}</p>

					{#if e.example}
						<pre class="example"><code>{e.example}</code></pre>
					{/if}
				</article>
			{/each}
		</section>
	{/each}

	<section class="block">
		<h2>Logo styles</h2>
		<dl class="defs">
			{#each LOGO_STYLES as style (style)}
				<div class="def">
					<dt><code>{style}</code></dt>
					<dd>{LOGO_STYLE_DESCRIPTIONS[style]}</dd>
				</div>
			{/each}
		</dl>
	</section>

	<section class="block">
		<h2>Errors</h2>
		<p>
			Every failure uses one envelope, so you can branch on <code>code</code> instead of parsing prose.
		</p>
		<pre><code
				>{JSON.stringify(
					{
						error: {
							code: 'insufficient_scope',
							message: 'This key is missing the `assets:write` scope.'
						}
					},
					null,
					2
				)}</code
			></pre>

		{#each Object.keys(errorsByStatus)
			.map(Number)
			.sort((a, b) => a - b) as status (status)}
			<div class="err-group">
				<span class="err-status">{status}</span>
				<dl class="defs">
					{#each errorsByStatus[status] as e (e.code)}
						<div class="def">
							<dt><code>{e.code}</code></dt>
							<dd>{e.meaning}</dd>
						</div>
					{/each}
				</dl>
			</div>
		{/each}
	</section>
</div>

<style>
	/* Mobile-first: single column, and every wide thing (code, tables of terms) is
	   allowed to scroll inside itself so the page body never scrolls sideways. */
	.docs {
		max-width: 48rem;
		margin: 0 auto;
		padding: var(--spacing-lg) var(--spacing-md) var(--spacing-2xl);
	}

	.head {
		margin-bottom: var(--spacing-xl);
	}

	.eyebrow {
		display: inline-block;
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--color-primary);
		margin-bottom: var(--spacing-xs);
	}

	h1 {
		font-size: 1.7rem;
		line-height: 1.15;
		margin: 0 0 var(--spacing-sm);
		color: var(--color-text);
	}

	.lede {
		font-size: 0.95rem;
		line-height: 1.55;
		color: var(--color-text-secondary);
		margin: 0 0 var(--spacing-md);
	}

	.base {
		display: inline-block;
		padding: 5px var(--spacing-sm);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-size: 0.8rem;
		color: var(--color-primary);
	}

	.block {
		margin-bottom: var(--spacing-xl);
	}

	h2 {
		font-size: 1.05rem;
		margin: 0 0 var(--spacing-sm);
		padding-bottom: var(--spacing-xs);
		border-bottom: 1px solid var(--color-border);
		color: var(--color-text);
	}

	p {
		font-size: 0.85rem;
		line-height: 1.6;
		color: var(--color-text-secondary);
		margin: 0 0 var(--spacing-sm);
	}

	code {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.8em;
		color: var(--color-text);
	}

	pre {
		/* Long curl examples scroll here rather than widening the page. */
		overflow-x: auto;
		padding: var(--spacing-sm);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		margin: 0 0 var(--spacing-sm);
	}

	pre code {
		font-size: 0.72rem;
		line-height: 1.6;
		white-space: pre;
		color: var(--color-text);
	}

	.note {
		padding-left: var(--spacing-sm);
		border-left: 2px solid color-mix(in srgb, var(--color-primary) 45%, transparent);
	}

	.defs {
		margin: 0;
	}

	.def {
		padding: var(--spacing-xs) 0;
		border-bottom: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
	}

	.def:last-child {
		border-bottom: none;
	}

	dt {
		margin-bottom: 2px;
	}

	dd {
		margin: 0;
		font-size: 0.8rem;
		line-height: 1.5;
		color: var(--color-text-secondary);
	}

	/* ── Endpoints ── */
	.endpoint {
		padding: var(--spacing-md) 0;
		border-bottom: 1px solid var(--color-border);
	}

	.endpoint:last-child {
		border-bottom: none;
	}

	.ep-head {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		/* Wraps on a phone instead of pushing the path off-screen. */
		flex-wrap: wrap;
		margin-bottom: var(--spacing-xs);
	}

	.method {
		flex-shrink: 0;
		padding: 2px 7px;
		border-radius: var(--radius-sm, 4px);
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		color: var(--color-background);
	}

	.method-get {
		background: var(--color-primary);
	}

	.method-post {
		background: var(--color-success, #3fb950);
	}

	.method-delete {
		background: var(--color-error, #e5534b);
	}

	.ep-path {
		font-size: 0.8rem;
		color: var(--color-text);
		/* Break at slashes so a long nested path wraps instead of overflowing. */
		word-break: break-all;
	}

	.scope-tag {
		flex-shrink: 0;
		padding: 2px 6px;
		border: 1px solid color-mix(in srgb, var(--color-primary) 45%, transparent);
		border-radius: 999px;
		font-size: 0.6rem;
		color: var(--color-primary);
	}

	.scope-tag.session {
		border-color: var(--color-border);
		color: var(--color-text-secondary);
	}

	.ep-summary {
		font-size: 0.95rem;
		margin: 0 0 4px;
		color: var(--color-text);
	}

	.ep-desc {
		margin-bottom: var(--spacing-sm);
	}

	.params {
		margin-bottom: var(--spacing-sm);
	}

	.params-label,
	.returns-label {
		display: inline-block;
		font-size: 0.62rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-secondary);
		margin-bottom: 4px;
	}

	.param {
		padding: 6px 0 6px var(--spacing-sm);
		border-left: 1px solid var(--color-border);
		margin-bottom: 2px;
	}

	.param-sig {
		display: flex;
		align-items: baseline;
		gap: var(--spacing-xs);
		flex-wrap: wrap;
	}

	.param-type {
		font-size: 0.68rem;
		color: var(--color-primary);
	}

	.req {
		font-size: 0.6rem;
		font-weight: 700;
		text-transform: uppercase;
		color: var(--color-error, #e5534b);
	}

	.param-default {
		font-size: 0.62rem;
		color: var(--color-text-secondary);
	}

	.param-desc {
		margin: 2px 0 0;
		font-size: 0.78rem;
	}

	.returns {
		font-size: 0.8rem;
	}

	.example {
		margin-top: var(--spacing-sm);
	}

	.err-group {
		margin-bottom: var(--spacing-md);
	}

	.err-status {
		display: inline-block;
		padding: 1px 7px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm, 4px);
		font-family: var(--font-mono, monospace);
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--color-text);
		margin-bottom: 4px;
	}

	@media (min-width: 40rem) {
		.docs {
			padding: var(--spacing-2xl) var(--spacing-lg);
		}

		h1 {
			font-size: 2.1rem;
		}
	}
</style>
