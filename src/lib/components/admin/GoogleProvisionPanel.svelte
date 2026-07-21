<script lang="ts">
	import { onMount, createEventDispatcher } from 'svelte';

	interface GcpProject {
		projectId: string;
		name: string;
		billingEnabled: boolean;
	}

	const dispatch = createEventDispatcher<{ provisioned: { projectId: string } }>();

	let loading = true;
	let configured = false;
	let connected = false;
	let account: string | undefined;
	let projects: GcpProject[] = [];
	let selectedProject = '';
	let working = false;
	let message: { kind: 'ok' | 'err'; text: string } | null = null;

	const ERRORS: Record<string, string> = {
		not_configured: 'No Google Cloud OAuth client configured yet.',
		denied: 'Consent was cancelled.',
		no_code: 'Google did not return an authorization code.',
		bad_state: 'Security check failed (state mismatch). Try again.',
		no_refresh_token: 'Google withheld a refresh token. Try again.',
		exchange_failed: 'Could not complete the Google handshake.'
	};

	async function refresh() {
		loading = true;
		try {
			const res = await fetch('/api/admin/provision/google');
			if (res.ok) {
				const data = await res.json();
				configured = data.configured;
				connected = data.connected;
				account = data.account;
				projects = data.projects || [];
				// Default to a billed project — Vertex rejects unbilled ones.
				selectedProject = projects.find((p) => p.billingEnabled)?.projectId || '';
				if (data.error) message = { kind: 'err', text: data.error };
			}
		} catch {
			message = { kind: 'err', text: 'Could not reach the provisioning API.' };
		} finally {
			loading = false;
		}
	}

	async function provision() {
		if (!selectedProject) return;
		working = true;
		message = null;
		try {
			const res = await fetch('/api/admin/provision/google', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ projectId: selectedProject })
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				message = { kind: 'err', text: data.message || 'Provisioning failed.' };
				return;
			}
			message = {
				kind: 'ok',
				text: data.reused
					? `Reused the existing key in ${selectedProject} and saved it.`
					: `Created a new key in ${selectedProject} and saved it.`
			};
			dispatch('provisioned', { projectId: selectedProject });
		} catch {
			message = { kind: 'err', text: 'Provisioning request failed.' };
		} finally {
			working = false;
		}
	}

	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		const err = params.get('gcp_error');
		if (err) message = { kind: 'err', text: ERRORS[err] || 'Google connection failed.' };
		else if (params.get('gcp') === 'connected')
			message = { kind: 'ok', text: 'Google Cloud connected.' };
		if (err || params.get('gcp')) {
			// Clear the query so a refresh doesn't replay the banner.
			window.history.replaceState({}, '', window.location.pathname);
		}
		refresh();
	});
</script>

<section class="panel">
	<header>
		<h2>Google Cloud</h2>
		{#if connected && account}
			<span class="badge ok">Connected as {account}</span>
		{:else if configured}
			<span class="badge">Not connected</span>
		{/if}
	</header>

	{#if message}
		<p class="msg {message.kind}">{message.text}</p>
	{/if}

	{#if loading}
		<p class="muted">Checking…</p>
	{:else if !configured}
		<p class="muted">
			A Google Cloud OAuth client hasn't been set up yet. Add one under Auth Keys (or set
			<code>GCP_CLIENT_ID</code> / <code>GCP_CLIENT_SECRET</code>) to enable one-click key
			provisioning.
		</p>
	{:else if !connected}
		<p class="muted">
			Connect a Google account to mint Gemini / Vertex API keys directly, without copying them out
			of the Cloud console.
		</p>
		<a class="btn primary" href="/api/admin/provision/google/start">Connect Google Cloud</a>
	{:else}
		<label for="gcp-project">Project</label>
		<select id="gcp-project" bind:value={selectedProject} disabled={working}>
			<option value="" disabled>Choose a project…</option>
			{#each projects as p (p.projectId)}
				<option value={p.projectId}>
					{p.projectId}{p.billingEnabled ? '' : ' — no billing'}
				</option>
			{/each}
		</select>

		{#if selectedProject && !projects.find((p) => p.projectId === selectedProject)?.billingEnabled}
			<p class="msg err">
				This project has no billing account. Vertex AI image models will reject requests until
				billing is linked.
			</p>
		{/if}

		<div class="row">
			<button class="btn primary" on:click={provision} disabled={!selectedProject || working}>
				{working ? 'Provisioning…' : 'Create API key'}
			</button>
			<a class="btn" href="/api/admin/provision/google/start">Reconnect</a>
		</div>
		<p class="muted small">
			Creates a service-account-bound authorization key restricted to the Generative Language and
			Vertex AI APIs. Re-running reuses the existing key rather than making a duplicate.
		</p>
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
	.small {
		font-size: 0.8rem;
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
	label {
		display: block;
		font-size: 0.85rem;
		margin-bottom: 0.25rem;
		color: var(--text-muted, #999);
	}
	select {
		width: 100%;
		max-width: 28rem;
		padding: 0.5rem;
		border-radius: 6px;
		border: 1px solid var(--border-color, #333);
		background: var(--input-bg, #111);
		color: inherit;
		margin-bottom: 0.75rem;
	}
	.row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	.btn {
		display: inline-block;
		padding: 0.5rem 0.9rem;
		border-radius: 6px;
		border: 1px solid var(--border-color, #333);
		background: transparent;
		color: inherit;
		cursor: pointer;
		text-decoration: none;
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
