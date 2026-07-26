<script lang="ts">
	/**
	 * Inline logo card for the chat.
	 *
	 * Uploading is handled here because it is one action and belongs in the flow.
	 * AI generation deliberately is not: it needs a prompt, a provider, a job and a
	 * results gallery, and reproducing that inline would be a worse version of the
	 * Images tab rather than a convenience. So this card links there instead of
	 * pretending to own it.
	 */
	import { createEventDispatcher } from 'svelte';

	export let brandProfileId: string;
	export let onboardingStep: string;
	export let currentLogoUrl: string | undefined = undefined;
	export let saving = false;

	const dispatch = createEventDispatcher<{
		save: { field: string; value: string };
		dismiss: void;
	}>();

	let fileInput: HTMLInputElement;
	let uploading = false;
	let error: string | null = null;

	/** Images only: this becomes the brand mark, so a PDF or video is never right. */
	const ACCEPT = 'image/png,image/jpeg,image/svg+xml,image/webp';
	const MAX_BYTES = 5 * 1024 * 1024;

	async function handleFile(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		error = null;

		if (!file.type.startsWith('image/')) {
			error = 'A logo needs to be an image.';
			input.value = '';
			return;
		}
		if (file.size > MAX_BYTES) {
			error = 'That file is over 5MB — try a smaller export.';
			input.value = '';
			return;
		}

		uploading = true;
		try {
			const formData = new FormData();
			formData.append('file', file);
			formData.append('brandProfileId', brandProfileId);
			formData.append('onboardingStep', onboardingStep);

			const response = await fetch('/api/onboarding/attachments/upload', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				const detail = await response.json().catch(() => ({}));
				throw new Error(detail.message || `Upload failed: ${response.statusText}`);
			}

			const data = await response.json();
			// The upload stores the file; the profile field is what makes it the logo.
			dispatch('save', { field: 'logoUrl', value: data.url });
		} catch (err) {
			error = err instanceof Error ? err.message : 'Upload failed.';
		} finally {
			uploading = false;
			input.value = '';
		}
	}
</script>

<div class="logo-card">
	<div class="card-head">
		<span class="card-title">Add your logo</span>
		<button class="dismiss" on:click={() => dispatch('dismiss')} aria-label="Dismiss">×</button>
	</div>

	{#if currentLogoUrl}
		<div class="current">
			<img src={currentLogoUrl} alt="Current brand logo" />
			<span class="current-note">Uploading a new one replaces this.</span>
		</div>
	{/if}

	<div class="actions">
		<input
			bind:this={fileInput}
			type="file"
			accept={ACCEPT}
			class="file-input"
			on:change={handleFile}
			aria-label="Upload a logo image"
		/>
		<button class="upload-btn" on:click={() => fileInput.click()} disabled={uploading || saving}>
			{#if uploading}
				Uploading…
			{:else if saving}
				Saving…
			{:else}
				Upload an image
			{/if}
		</button>

		<a class="generate-link" href="/brand/{brandProfileId}?tab=images">
			or generate one with AI →
		</a>
	</div>

	{#if error}
		<p class="error">{error}</p>
	{/if}
</div>

<style>
	.logo-card {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		padding: var(--spacing-sm) var(--spacing-md);
		margin-top: var(--spacing-xs);
	}

	.card-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-xs);
	}

	.card-title {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.dismiss {
		background: none;
		border: none;
		color: var(--color-text-secondary);
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
		padding: 0 4px;
	}

	.dismiss:hover {
		color: var(--color-text);
	}

	.current {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-xs);
	}

	.current img {
		width: 44px;
		height: 44px;
		object-fit: contain;
		border-radius: var(--radius-sm, 4px);
		/* Logos are usually transparent; a neutral plate keeps a white mark visible
		   on the dark surface and a dark mark visible on light. */
		background: rgb(127 127 127 / 0.15);
		padding: 4px;
	}

	.current-note {
		font-size: 0.7rem;
		color: var(--color-text-secondary);
	}

	.actions {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
	}

	/* Hidden but still focusable-by-proxy: the visible button forwards the click. */
	.file-input {
		display: none;
	}

	.upload-btn {
		padding: 5px var(--spacing-md);
		background: var(--color-primary);
		color: var(--color-background);
		border: none;
		border-radius: var(--radius-sm, 4px);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
	}

	.upload-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.generate-link {
		font-size: 0.72rem;
		color: var(--color-primary);
		text-decoration: none;
	}

	.generate-link:hover {
		text-decoration: underline;
	}

	.error {
		font-size: 0.68rem;
		color: var(--color-error, #e5534b);
		margin: var(--spacing-xs) 0 0;
	}
</style>
