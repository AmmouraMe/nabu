<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	// ─── Dev.to ───────────────────────────────────────────────────────

	let devtoKey = '';
	let devtoSaving = false;
	let devtoError: string | null = null;
	let devtoSuccess = data.devtoConnected;

	async function saveDevToKey() {
		if (!devtoKey.trim() || devtoSaving) return;
		devtoSaving = true;
		devtoError = null;
		try {
			const res = await fetch('/api/connect/devto', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ apiKey: devtoKey.trim() })
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message ?? 'Failed to save API key');
			}
			devtoSuccess = true;
			devtoKey = '';
		} catch (err) {
			devtoError = err instanceof Error ? err.message : 'Failed to save';
		} finally {
			devtoSaving = false;
		}
	}

	async function removeDevTo() {
		try {
			await fetch('/api/connect/devto', { method: 'DELETE' });
			devtoSuccess = false;
		} catch {
			devtoError = 'Failed to disconnect';
		}
	}

	// ─── Google AI ────────────────────────────────────────────────────

	let googleSuccess = data.googleConnected;
	let googleKey = '';
	let googleSaving = false;
	let googleError: string | null = null;

	async function saveGoogleKey() {
		if (!googleKey.trim() || googleSaving) return;
		googleSaving = true;
		googleError = null;
		try {
			const res = await fetch('/api/connect/google', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ apiKey: googleKey.trim() })
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error((err as { message?: string }).message ?? 'Failed to save API key');
			}
			googleSuccess = true;
			googleKey = '';
		} catch (err) {
			googleError = err instanceof Error ? err.message : 'Failed to save';
		} finally {
			googleSaving = false;
		}
	}

	async function removeGoogle() {
		try {
			await fetch('/api/connect/google', { method: 'DELETE' });
			googleSuccess = false;
		} catch {
			googleError = 'Failed to disconnect';
		}
	}

	// ─── LinkedIn ─────────────────────────────────────────────────────

	let linkedinSuccess = data.linkedinConnected;
	let linkedinNote =
		'LinkedIn OAuth requires a registered LinkedIn App. ' +
		'To connect manually, enter your access token and Author URN below.';

	let linkedinToken = '';
	let linkedinUrn = '';
	let linkedinSaving = false;
	let linkedinError: string | null = null;

	async function saveLinkedIn() {
		if (!linkedinToken.trim() || !linkedinUrn.trim() || linkedinSaving) return;
		linkedinSaving = true;
		linkedinError = null;
		try {
			const res = await fetch('/api/connect/linkedin', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ accessToken: linkedinToken.trim(), authorUrn: linkedinUrn.trim() })
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.message ?? 'Failed to save LinkedIn credentials');
			}
			linkedinSuccess = true;
			linkedinToken = '';
			linkedinUrn = '';
		} catch (err) {
			linkedinError = err instanceof Error ? err.message : 'Failed to save';
		} finally {
			linkedinSaving = false;
		}
	}

	async function removeLinkedIn() {
		try {
			await fetch('/api/connect/linkedin', { method: 'DELETE' });
			linkedinSuccess = false;
		} catch {
			linkedinError = 'Failed to disconnect';
		}
	}
</script>

<svelte:head>
	<title>Connect Accounts — {data.brandName} | Nabu</title>
</svelte:head>

<div class="connect-page">
	<header class="page-header">
		<div class="header-left">
			<a href="/brand/{data.brandProfileId}/content" class="back-link">← Content Calendar</a>
			<h1 class="page-title">Connect Publishing Accounts</h1>
			<p class="page-subtitle">Link your publishing accounts to post content directly from Nabu.</p>
		</div>
	</header>

	<div class="accounts-grid">
		<!-- Dev.to -->
		<div class="account-card">
			<div class="account-header">
				<span class="account-icon">📝</span>
				<div>
					<h2 class="account-name">Dev.to</h2>
					<p class="account-desc">Publish technical articles to the Dev.to community</p>
				</div>
				{#if devtoSuccess}
					<span class="status-badge connected">Connected</span>
				{:else}
					<span class="status-badge">Not connected</span>
				{/if}
			</div>

			{#if devtoSuccess}
				<div class="connected-state">
					<p class="connected-note">
						Your Dev.to API key is stored securely. Articles will be created as drafts.
					</p>
					<button class="disconnect-btn" on:click={removeDevTo}>Disconnect</button>
				</div>
			{:else}
				<div class="connect-form">
					<p class="form-note">
						Get your API key from
						<a href="https://dev.to/settings/extensions" target="_blank" rel="noopener">
							dev.to/settings/extensions
						</a>
					</p>
					<label class="form-label">
						API Key
						<input
							type="password"
							bind:value={devtoKey}
							placeholder="Enter your Dev.to API key"
							class="form-input"
							autocomplete="off"
						/>
					</label>
					{#if devtoError}
						<p class="field-error">{devtoError}</p>
					{/if}
					<button
						class="connect-btn"
						on:click={saveDevToKey}
						disabled={!devtoKey.trim() || devtoSaving}
					>
						{devtoSaving ? 'Saving…' : 'Connect Dev.to'}
					</button>
				</div>
			{/if}
		</div>

		<!-- LinkedIn -->
		<div class="account-card">
			<div class="account-header">
				<span class="account-icon">💼</span>
				<div>
					<h2 class="account-name">LinkedIn</h2>
					<p class="account-desc">Share professional updates to your LinkedIn network</p>
				</div>
				{#if linkedinSuccess}
					<span class="status-badge connected">Connected</span>
				{:else}
					<span class="status-badge">Not connected</span>
				{/if}
			</div>

			{#if linkedinSuccess}
				<div class="connected-state">
					<p class="connected-note">Your LinkedIn credentials are stored securely.</p>
					<button class="disconnect-btn" on:click={removeLinkedIn}>Disconnect</button>
				</div>
			{:else}
				<div class="connect-form">
					<p class="form-note">{linkedinNote}</p>
					<label class="form-label">
						Access Token
						<input
							type="password"
							bind:value={linkedinToken}
							placeholder="LinkedIn OAuth access token"
							class="form-input"
							autocomplete="off"
						/>
					</label>
					<label class="form-label">
						Author URN
						<input
							type="text"
							bind:value={linkedinUrn}
							placeholder="urn:li:person:XXXXXXXXXX"
							class="form-input"
						/>
						<span class="field-hint"> Find your URN via the LinkedIn API: GET /v2/me </span>
					</label>
					{#if linkedinError}
						<p class="field-error">{linkedinError}</p>
					{/if}
					<button
						class="connect-btn"
						on:click={saveLinkedIn}
						disabled={!linkedinToken.trim() || !linkedinUrn.trim() || linkedinSaving}
					>
						{linkedinSaving ? 'Saving…' : 'Connect LinkedIn'}
					</button>
				</div>
			{/if}
		</div>
		<!-- Google AI -->
		<div class="account-card">
			<div class="account-header">
				<span class="account-icon">&#x1F3A5;</span>
				<div>
					<h2 class="account-name">Google AI (Veo 3)</h2>
					<p class="account-desc">Generate short-form videos with Google Veo 3</p>
				</div>
				{#if googleSuccess}
					<span class="status-badge connected">Connected</span>
				{:else}
					<span class="status-badge">Not connected</span>
				{/if}
			</div>

			{#if googleSuccess}
				<div class="connected-state">
					<p class="connected-note">
						Your Google AI API key is stored securely. Videos are generated via Veo 3.
					</p>
					<a href="/brand/{data.brandProfileId}/videos" class="videos-link">Open Video Studio</a>
					<button class="disconnect-btn" on:click={removeGoogle}>Disconnect</button>
				</div>
			{:else}
				<div class="connect-form">
					<p class="form-note">
						Get your API key from
						<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">
							aistudio.google.com/apikey
						</a>
					</p>
					<label class="form-label">
						API Key
						<input
							type="password"
							bind:value={googleKey}
							placeholder="Enter your Google AI API key"
							class="form-input"
							autocomplete="off"
						/>
					</label>
					{#if googleError}
						<p class="field-error">{googleError}</p>
					{/if}
					<button
						class="connect-btn"
						on:click={saveGoogleKey}
						disabled={!googleKey.trim() || googleSaving}
					>
						{googleSaving ? 'Saving…' : 'Connect Google AI'}
					</button>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.connect-page {
		max-width: 800px;
		margin: 0 auto;
		padding: var(--spacing-lg) var(--spacing-md);
		min-height: calc(100vh - 60px);
	}

	.page-header {
		margin-bottom: var(--spacing-xl, 2rem);
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

	.accounts-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--spacing-lg);
	}

	@media (min-width: 640px) {
		.accounts-grid {
			grid-template-columns: 1fr 1fr;
		}
	}

	.account-card {
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.account-header {
		display: flex;
		align-items: flex-start;
		gap: var(--spacing-sm);
	}

	.account-icon {
		font-size: 1.8rem;
		flex-shrink: 0;
	}

	.account-name {
		font-size: 1rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0 0 2px;
	}

	.account-desc {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		margin: 0;
	}

	.status-badge {
		margin-left: auto;
		flex-shrink: 0;
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 3px 10px;
		border-radius: 999px;
		background-color: var(--color-border);
		color: var(--color-text-secondary);
	}

	.status-badge.connected {
		background-color: color-mix(in srgb, var(--color-success, #22c55e) 20%, transparent);
		color: var(--color-success, #22c55e);
	}

	.connected-state {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.connected-note {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		margin: 0;
	}

	.videos-link {
		align-self: flex-start;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-primary);
		text-decoration: none;
	}

	.videos-link:hover {
		text-decoration: underline;
	}

	.disconnect-btn {
		align-self: flex-start;
		padding: var(--spacing-xs) var(--spacing-md);
		background: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		cursor: pointer;
	}

	.disconnect-btn:hover {
		border-color: var(--color-error);
		color: var(--color-error);
	}

	.connect-form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.form-note {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		margin: 0;
	}

	.form-note a {
		color: var(--color-primary);
	}

	.form-label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text-secondary);
	}

	.form-input {
		background-color: var(--color-background);
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: var(--spacing-sm);
		font-size: 0.85rem;
		font-family: inherit;
	}

	.form-input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.field-hint {
		font-size: 0.7rem;
		color: var(--color-text-secondary);
		font-weight: 400;
	}

	.field-error {
		font-size: 0.8rem;
		color: var(--color-error);
		margin: 0;
	}

	.connect-btn {
		padding: var(--spacing-sm) var(--spacing-lg);
		background-color: var(--color-primary);
		color: var(--color-background);
		border: none;
		border-radius: var(--radius-md);
		font-weight: 700;
		font-size: 0.85rem;
		cursor: pointer;
		align-self: flex-start;
	}

	.connect-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.connect-btn:not(:disabled):hover {
		background-color: var(--color-primary-hover);
	}
</style>
