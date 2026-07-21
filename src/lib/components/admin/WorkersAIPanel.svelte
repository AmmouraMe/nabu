<script lang="ts">
	import { onMount, createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher<{ connected: void }>();

	let loading = true;
	let available = false;
	let connected = false;
	let working = false;
	let testing = false;
	let message: { kind: 'ok' | 'err'; text: string } | null = null;

	async function refresh() {
		loading = true;
		try {
			const res = await fetch('/api/admin/provision/workers-ai');
			if (res.ok) {
				const data = await res.json();
				available = data.available;
				connected = data.connected;
			}
		} catch {
			message = { kind: 'err', text: 'Could not reach the provisioning API.' };
		} finally {
			loading = false;
		}
	}

	async function connect() {
		working = true;
		message = null;
		try {
			const res = await fetch('/api/admin/provision/workers-ai', { method: 'POST' });
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				message = { kind: 'err', text: data.message || 'Could not connect Workers AI.' };
				return;
			}
			connected = true;
			message = {
				kind: 'ok',
				text: data.alreadyConnected ? 'Already connected.' : 'Connected — image generation is live.'
			};
			dispatch('connected');
		} catch {
			message = { kind: 'err', text: 'Connection request failed.' };
		} finally {
			working = false;
		}
	}

	async function test() {
		testing = true;
		message = null;
		try {
			const res = await fetch('/api/admin/provision/workers-ai?test=1', { method: 'POST' });
			const data = await res.json().catch(() => ({}));
			message = data.ok
				? { kind: 'ok', text: `Generated a test image in ${(data.ms / 1000).toFixed(1)}s.` }
				: { kind: 'err', text: data.message || 'Test generation failed.' };
		} catch {
			message = { kind: 'err', text: 'Test request failed.' };
		} finally {
			testing = false;
		}
	}

	onMount(refresh);
</script>

<section class="panel">
	<header>
		<h2>Cloudflare Workers AI</h2>
		{#if connected}
			<span class="badge ok">Connected</span>
		{:else if available}
			<span class="badge">Available</span>
		{/if}
	</header>

	{#if message}
		<p class="msg {message.kind}">{message.text}</p>
	{/if}

	{#if loading}
		<p class="muted">Checking…</p>
	{:else if !available}
		<p class="muted">
			The <code>AI</code> binding isn't available in this environment, so Workers AI can't be used
			here. Check the <code>[ai]</code> block in <code>wrangler.toml</code>.
		</p>
	{:else}
		<p class="muted">
			Runs on this account's <code>AI</code> binding — <strong>no API key required</strong>. Free
			within Cloudflare's daily allocation (10,000 Neurons, resets 00:00 UTC — roughly 65 images a
			day at 1024²), then billed per use.
		</p>
		<div class="row">
			{#if !connected}
				<button class="btn primary" on:click={connect} disabled={working}>
					{working ? 'Connecting…' : 'Connect'}
				</button>
			{/if}
			<button class="btn" on:click={test} disabled={testing}>
				{testing ? 'Generating…' : 'Test generation'}
			</button>
		</div>
	{/if}
</section>

<style>
	.panel {
		border: 1px solid var(--border-color, #333);
		border-radius: 8px;
		padding: 1.25rem;
		margin-bottom: 1.5rem;
		background: var(--surface-color, #1a1a1a);
	}
	header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}
	h2 {
		margin: 0;
		font-size: 1.1rem;
	}
	.badge {
		font-size: 0.75rem;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		border: 1px solid var(--border-color, #333);
		color: var(--text-muted, #999);
	}
	.badge.ok {
		border-color: #2d7d4a;
		color: #6ee7a0;
	}
	.muted {
		color: var(--text-muted, #999);
		margin: 0 0 0.75rem;
	}
	.msg {
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		margin: 0 0 0.75rem;
		font-size: 0.9rem;
	}
	.msg.ok {
		background: rgba(45, 125, 74, 0.15);
		color: #6ee7a0;
	}
	.msg.err {
		background: rgba(160, 50, 50, 0.15);
		color: #f2a0a0;
	}
	.row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	.btn {
		padding: 0.5rem 0.9rem;
		border-radius: 6px;
		border: 1px solid var(--border-color, #333);
		background: transparent;
		color: inherit;
		cursor: pointer;
		font-size: 0.9rem;
	}
	.btn.primary {
		background: var(--accent-color, #3b82f6);
		border-color: transparent;
		color: #fff;
	}
	.btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
