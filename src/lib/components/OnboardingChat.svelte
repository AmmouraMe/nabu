<script lang="ts">
	/**
	 * OnboardingChat - The main AI-driven brand building conversation interface.
	 * Acts as a world-class marketing expert guiding users through brand creation.
	 * Supports image, video, and audio attachments uploaded to the file archive.
	 */
	import { onMount, afterUpdate, tick } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import OnboardingProgress from './OnboardingProgress.svelte';
	import {
		onboardingStore,
		sendMessage,
		updateStep,
		updateBrandData,
		startOnboarding,
		loadExistingProfile,
		resetOnboarding
	} from '$lib/stores/onboarding';
	import type { OnboardingStep, OnboardingAttachment, BrandProfile } from '$lib/types/onboarding';
	import {
		ONBOARDING_STEPS,
		getNextStep,
		getPreviousStep,
		STEP_COMPLETE_MARKER
	} from '$lib/services/onboarding';
	import {
		validateAttachmentFile,
		getAttachmentType,
		formatFileSize,
		getAcceptString,
		MAX_ATTACHMENTS
	} from '$lib/utils/attachments';
	import { renderMessageHtml } from '$lib/utils/message-format';
	import BrandCompletionMeter from './BrandCompletionMeter.svelte';
	import BrandColorCard from './BrandColorCard.svelte';
	import GoogleFontPicker from './GoogleFontPicker.svelte';
	import BrandLogoCard from './BrandLogoCard.svelte';
	import type { CompletionItem } from '$lib/services/brand-completion';

	/** Optional brand profile ID to load a specific brand for continued onboarding */
	export let brandId: string | undefined = undefined;

	let input = '';
	let chatContainer: HTMLDivElement;
	let textareaElement: HTMLTextAreaElement;
	let fileInputElement: HTMLInputElement;
	let initialized = false;
	let showWelcomeScreen = true;
	let stepTransition: { from: string; to: string } | null = null;
	let previousStep: OnboardingStep | null = null;

	// Attachment state
	let pendingAttachments: Array<{
		id: string;
		file: File;
		type: 'image' | 'video' | 'audio';
		name: string;
		previewUrl: string | null;
		uploading: boolean;
		uploaded?: {
			r2Key: string;
			url: string;
			archiveId: string;
		};
		error?: string;
	}> = [];
	let isDragging = false;
	let attachmentError: string | null = null;

	// Watch for step changes to show transition notification
	$: {
		const current = $onboardingStore.currentStep;
		if (previousStep && previousStep !== current && initialized) {
			const fromConfig = ONBOARDING_STEPS.find((s) => s.id === previousStep);
			const toConfig = ONBOARDING_STEPS.find((s) => s.id === current);
			stepTransition = {
				from: fromConfig?.title || '',
				to: toConfig?.title || ''
			};
			setTimeout(() => {
				stepTransition = null;
			}, 4000);
		}
		previousStep = current;
	}

	const MAX_INPUT_LENGTH = 4000;
	$: inputLength = input.length;
	$: hasAttachments = pendingAttachments.length > 0;
	$: allUploaded = pendingAttachments.every((a) => a.uploaded && !a.uploading);
	$: canSend =
		(input.trim().length > 0 || (hasAttachments && allUploaded)) &&
		!$onboardingStore.isStreaming &&
		!$onboardingStore.isLoading;
	$: showCharCount = inputLength > MAX_INPUT_LENGTH * 0.8;

	onMount(async () => {
		// Check if user already has a profile (or load specific brand)
		const existingProfile = await loadExistingProfile(brandId);
		if (existingProfile) {
			showWelcomeScreen = false;
			initialized = true;
			await tick();
			scrollToBottom();
		}
	});

	afterUpdate(() => {
		if ($onboardingStore.isStreaming) {
			scrollToBottom();
		}
	});

	function scrollToBottom() {
		if (chatContainer) {
			chatContainer.scrollTop = chatContainer.scrollHeight;
		}
	}

	async function handleStartOnboarding() {
		showWelcomeScreen = false;
		initialized = true;
		await startOnboarding();
		await tick();
		scrollToBottom();
		textareaElement?.focus();
	}

	async function handleSend() {
		if (!canSend) return;
		const message = input.trim() || (hasAttachments ? '(attached files)' : '');
		if (!message) return;

		// Collect uploaded attachment metadata to send with message
		const attachmentsForMessage: OnboardingAttachment[] = pendingAttachments
			.filter((a) => a.uploaded)
			.map((a) => ({
				id: a.id,
				type: a.type,
				name: a.name,
				url: a.uploaded!.url,
				r2Key: a.uploaded!.r2Key,
				mimeType: a.file.type,
				size: a.file.size,
				archiveId: a.uploaded!.archiveId
			}));

		input = '';
		pendingAttachments = [];
		autoResizeTextarea();
		await sendMessage(
			message,
			attachmentsForMessage.length > 0 ? attachmentsForMessage : undefined
		);
		await tick();
		scrollToBottom();
		textareaElement?.focus();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSend();
		}
	}

	function autoResizeTextarea() {
		if (textareaElement) {
			textareaElement.style.height = 'auto';
			textareaElement.style.height = Math.min(textareaElement.scrollHeight, 200) + 'px';
		}
	}

	// ─── Attachment handling ───────────────────────────────────────

	function handleAttachButtonClick() {
		fileInputElement?.click();
	}

	function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files) {
			addFiles(Array.from(input.files));
			input.value = '';
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		isDragging = true;
	}

	function handleDragLeave() {
		isDragging = false;
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		isDragging = false;
		if (event.dataTransfer?.files) {
			addFiles(Array.from(event.dataTransfer.files));
		}
	}

	function handlePaste(event: ClipboardEvent) {
		const items = event.clipboardData?.items;
		if (!items) return;
		const files: File[] = [];
		for (const item of items) {
			if (item.kind === 'file') {
				const file = item.getAsFile();
				if (file) files.push(file);
			}
		}
		if (files.length > 0) {
			event.preventDefault();
			addFiles(files);
		}
	}

	async function addFiles(files: File[]) {
		attachmentError = null;

		if (pendingAttachments.length + files.length > MAX_ATTACHMENTS) {
			attachmentError = `Maximum ${MAX_ATTACHMENTS} attachments per message`;
			return;
		}

		for (const file of files) {
			const validation = validateAttachmentFile(file);
			if (validation) {
				attachmentError = validation;
				continue;
			}

			const type = getAttachmentType(file.type);
			if (!type) continue;

			const id = crypto.randomUUID();

			// Create preview URL for images
			let previewUrl: string | null = null;
			if (type === 'image') {
				previewUrl = URL.createObjectURL(file);
			}

			const attachment = {
				id,
				file,
				type,
				name: file.name,
				previewUrl,
				uploading: true,
				uploaded: undefined as undefined | { r2Key: string; url: string; archiveId: string },
				error: undefined as string | undefined
			};

			pendingAttachments = [...pendingAttachments, attachment];

			// Upload to R2 immediately
			uploadAttachment(attachment);
		}
	}

	async function uploadAttachment(attachment: (typeof pendingAttachments)[0]) {
		const state = $onboardingStore;
		if (!state.profile) return;

		try {
			const formData = new FormData();
			formData.append('file', attachment.file);
			formData.append('brandProfileId', state.profile.id);
			formData.append('onboardingStep', state.currentStep);

			const response = await fetch('/api/onboarding/attachments/upload', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				const errData = await response.json().catch(() => ({}));
				throw new Error(errData.message || `Upload failed: ${response.statusText}`);
			}

			const data = await response.json();

			pendingAttachments = pendingAttachments.map((a) =>
				a.id === attachment.id
					? {
							...a,
							uploading: false,
							uploaded: { r2Key: data.r2Key, url: data.url, archiveId: data.id }
						}
					: a
			);
		} catch (err) {
			pendingAttachments = pendingAttachments.map((a) =>
				a.id === attachment.id
					? { ...a, uploading: false, error: err instanceof Error ? err.message : 'Upload failed' }
					: a
			);
		}
	}

	function removeAttachment(id: string) {
		const att = pendingAttachments.find((a) => a.id === id);
		if (att?.previewUrl) {
			URL.revokeObjectURL(att.previewUrl);
		}
		pendingAttachments = pendingAttachments.filter((a) => a.id !== id);
	}

	async function handleNextStep() {
		const next = getNextStep($onboardingStore.currentStep);
		if (next) {
			await updateStep(next);
			await tick();
			scrollToBottom();
		}
	}

	async function handleRestartOnboarding() {
		resetOnboarding();
		showWelcomeScreen = true;
	}

	/**
	 * The one card currently open, or null. Deliberately singular: the meter offers a
	 * single next step, so opening a stack of editors would contradict it.
	 */
	let activeCard: CompletionItem | null = null;
	let cardSaving = false;

	/** Card kinds with a real inline editor. Everything else stays conversational. */
	const DIRECT_EDIT_CARDS = new Set(['color', 'typography', 'logo']);

	// Narrowed here rather than in the markup: Svelte's template parser cannot read a
	// TS `as` cast to a union type inside an expression.
	$: typographyField = (
		activeCard?.key === 'typographyBody' ? 'typographyBody' : 'typographyHeading'
	) as 'typographyHeading' | 'typographyBody';
	$: typographyCurrentFont = activeCard
		? ($onboardingStore.profile?.[activeCard.key as keyof BrandProfile] as string | undefined)
		: undefined;

	/**
	 * Act on the meter's "next best thing" suggestion.
	 *
	 * Colours (and later fonts and logos) get a card, because picking one by describing
	 * it in prose is a poor trade. Everything else — mission, audience, story — is
	 * genuinely better as conversation, so it steers the chat instead and lets the
	 * existing per-step extraction capture the answer with no new save path.
	 */
	async function handleResolveItem(event: CustomEvent<CompletionItem>) {
		const item = event.detail;
		if (!item || $onboardingStore.isStreaming) return;

		if (DIRECT_EDIT_CARDS.has(item.card)) {
			activeCard = item;
			await tick();
			scrollToBottom();
			return;
		}

		await sendMessage(`Let's work on my ${item.label.toLowerCase()}.`);
		await tick();
		scrollToBottom();
	}

	/**
	 * Persist a card edit. `updateBrandData` PATCHes and refreshes the store, so the
	 * meter recomputes on its own — there is no separate progress state to keep in sync.
	 */
	/**
	 * GoogleFontPicker reports `{ field, font }`; the card host speaks
	 * `{ field, value }`. Adapt rather than change the picker, which is also used by
	 * the brand page.
	 */
	async function handleFontSelect(event: CustomEvent<{ field: string; font: string }>) {
		await handleCardSave(
			new CustomEvent('save', {
				detail: { field: event.detail.field, value: event.detail.font }
			})
		);
	}

	async function handleCardSave(event: CustomEvent<{ field: string; value: string }>) {
		const { field, value } = event.detail;
		cardSaving = true;
		try {
			await updateBrandData({ [field]: value } as Partial<BrandProfile>);
			activeCard = null;
		} catch (err) {
			console.error('Failed to save brand field:', err);
			// Leave the card open on failure so the choice is not silently lost.
		} finally {
			cardSaving = false;
		}
	}

	/**
	 * Render markdown-like formatting in messages.
	 *
	 * The marker is stripped here, before rendering: it is angle-bracketed
	 * (`<<STEP_COMPLETE>>`), so removing it afterwards would mean matching its
	 * escaped form instead.
	 */
	function formatMessage(content: string): string {
		return renderMessageHtml(content.replace(STEP_COMPLETE_MARKER, ''));
	}

	$: currentStepConfig = ONBOARDING_STEPS.find((s) => s.id === $onboardingStore.currentStep);
	$: canGoBack = getPreviousStep($onboardingStore.currentStep) !== null;
	$: brandName =
		$onboardingStore.profile?.brandName || ($onboardingStore.profile ? 'New Brand' : '');
	$: brandNameConfirmed = $onboardingStore.profile?.brandNameConfirmed ?? false;

	async function handlePreviousStep() {
		const prev = getPreviousStep($onboardingStore.currentStep);
		if (prev) {
			await updateStep(prev);
			await tick();
			scrollToBottom();
		}
	}

	async function handleStepNavigate(
		event: CustomEvent<import('$lib/types/onboarding').OnboardingStep>
	) {
		const targetStep = event.detail;
		await updateStep(targetStep);
		await tick();
		scrollToBottom();
	}
</script>

<div class="onboarding-container">
	{#if showWelcomeScreen}
		<!-- Welcome/Landing Screen -->
		<div class="welcome-screen" in:fade={{ duration: 300 }}>
			<div class="welcome-content">
				<div class="welcome-icon">✨</div>
				<h1>Brand Architect</h1>
				<p class="welcome-subtitle">
					Your AI-powered brand strategist, combining psychology, philosophy, and world-class
					marketing expertise to build your perfect brand.
				</p>

				<div class="welcome-features">
					<div class="feature">
						<span class="feature-icon">🧠</span>
						<div>
							<strong>Psychology-Driven</strong>
							<p>Using Jungian archetypes, behavioral economics, and cognitive psychology</p>
						</div>
					</div>
					<div class="feature">
						<span class="feature-icon">🎯</span>
						<div>
							<strong>Market Expert</strong>
							<p>Strategic positioning, audience targeting, and competitive analysis</p>
						</div>
					</div>
					<div class="feature">
						<span class="feature-icon">🎨</span>
						<div>
							<strong>Visual Identity</strong>
							<p>Color psychology, typography, and complete brand style guides</p>
						</div>
					</div>
					<div class="feature">
						<span class="feature-icon">📖</span>
						<div>
							<strong>Brand Storytelling</strong>
							<p>Hero's journey, narrative psychology, and authentic brand stories</p>
						</div>
					</div>
				</div>

				<div class="welcome-cta">
					<p class="cta-note">
						Whether you have an existing brand to refine or are starting from scratch — even if you
						have no idea yet — we'll build something extraordinary together.
					</p>
					<button class="start-button" on:click={handleStartOnboarding}>
						Begin Your Brand Journey
						<span class="arrow">→</span>
					</button>
				</div>
			</div>
		</div>
	{:else}
		<!-- Onboarding Chat Interface -->
		<div class="chat-layout" in:fade={{ duration: 200 }}>
			<OnboardingProgress
				currentStep={$onboardingStore.currentStep}
				on:stepClick={handleStepNavigate}
			/>

			<!-- Sits under the step rail deliberately: the steps say where you are in the
			     conversation, this says how much of the brand actually exists yet. They
			     diverge, because a step can be walked past without answering everything. -->
			<BrandCompletionMeter profile={$onboardingStore.profile} on:resolve={handleResolveItem} />

			<div class="chat-area" bind:this={chatContainer}>
				{#if $onboardingStore.isLoading && $onboardingStore.messages.length === 0}
					<div class="loading-state">
						<div class="loading-spinner"></div>
						<p>Preparing your brand architect...</p>
					</div>
				{/if}

				{#each $onboardingStore.messages as message, i (message.id)}
					<div class="message {message.role}" in:fly={{ y: 20, duration: 300, easing: quintOut }}>
						<div class="message-avatar">
							{#if message.role === 'assistant'}
								<span class="avatar-icon">✨</span>
							{:else}
								<span class="avatar-icon">👤</span>
							{/if}
						</div>
						<div class="message-content">
							{#if message.role === 'assistant'}
								<div class="message-header">
									<span class="message-sender">Brand Architect</span>
									{#if message.step}
										<span class="message-step">{message.step.replace(/_/g, ' ')}</span>
									{/if}
								</div>
							{/if}
							<div class="message-text">
								{@html formatMessage(message.content)}
								{#if $onboardingStore.isStreaming && i === $onboardingStore.messages.length - 1 && message.role === 'assistant'}
									<span class="cursor-blink">▊</span>
								{/if}
							</div>
							{#if message.attachments && message.attachments.length > 0}
								<div class="message-attachments">
									{#each message.attachments as att}
										<div class="attachment-preview-item">
											{#if att.type === 'image'}
												<img src={att.url} alt={att.name} class="attachment-image" loading="lazy" />
											{:else if att.type === 'video'}
												<!-- svelte-ignore a11y-media-has-caption -->
												<video src={att.url} class="attachment-video" controls preload="metadata"
												></video>
											{:else if att.type === 'audio'}
												<!-- svelte-ignore a11y-media-has-caption -->
												<audio src={att.url} class="attachment-audio" controls preload="metadata"
												></audio>
											{/if}
											<span class="attachment-name">{att.name}</span>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				{/each}

				<!-- Inline editor card. Sits at the end of the transcript so it reads as the
				     latest turn in the conversation rather than a modal interrupting it. -->
				{#if activeCard}
					<div class="inline-card" in:fly={{ y: 20, duration: 250, easing: quintOut }}>
						<div class="message-avatar">
							<span class="avatar-icon">✨</span>
						</div>
						<div class="card-body">
							{#if activeCard.card === 'color'}
								<BrandColorCard
									field={activeCard.key}
									label={activeCard.label}
									profile={$onboardingStore.profile}
									saving={cardSaving}
									on:save={handleCardSave}
									on:dismiss={() => (activeCard = null)}
								/>
							{:else if activeCard.card === 'typography'}
								<!-- GoogleFontPicker is already a self-contained inline panel and its
								     `field` union is exactly these keys, so it needs no wrapper. The
								     casts live in the script: Svelte's template parser cannot read a
								     TS union type inside an expression. -->
								<GoogleFontPicker
									field={typographyField}
									currentFont={typographyCurrentFont}
									on:select={handleFontSelect}
									on:close={() => (activeCard = null)}
								/>
							{:else if activeCard.card === 'logo' && $onboardingStore.profile}
								<BrandLogoCard
									brandProfileId={$onboardingStore.profile.id}
									onboardingStep={$onboardingStore.currentStep}
									currentLogoUrl={$onboardingStore.profile.logoUrl}
									saving={cardSaving}
									on:save={handleCardSave}
									on:dismiss={() => (activeCard = null)}
								/>
							{/if}
						</div>
					</div>
				{/if}

				{#if $onboardingStore.streamingStatus}
					<div class="streaming-status-bar" in:fade={{ duration: 150 }}>
						<span class="status-icon">⟳</span>
						<span class="status-text">{$onboardingStore.streamingStatus}</span>
					</div>
				{/if}

				{#if stepTransition}
					<div
						class="step-transition"
						in:fly={{ y: 20, duration: 400 }}
						out:fade={{ duration: 300 }}
					>
						<span class="transition-icon">✅</span>
						<span class="transition-text">
							<strong>{stepTransition.from}</strong> complete — moving to
							<strong>{stepTransition.to}</strong>
						</span>
					</div>
				{/if}

				{#if $onboardingStore.error}
					<div class="error-message" in:fade>
						<span>⚠️</span>
						<p>{$onboardingStore.error}</p>
						<button on:click={() => onboardingStore.update((s) => ({ ...s, error: null }))}>
							Dismiss
						</button>
					</div>
				{/if}
			</div>

			<!-- Bottom bar: stuck to bottom -->
			<div class="bottom-bar">
				<!-- Brand name indicator -->
				{#if $onboardingStore.profile}
					<div class="brand-indicator">
						<span class="brand-indicator-label">{brandNameConfirmed ? 'Brand' : 'Codename'}</span>
						<span class="brand-indicator-name" class:untitled={!brandNameConfirmed}
							>{brandName}</span
						>
					</div>
				{/if}
				<!-- Step info + manual skip -->
				{#if !$onboardingStore.isStreaming && $onboardingStore.messages.length > 0 && $onboardingStore.currentStep !== 'complete'}
					<div class="step-navigation">
						{#if canGoBack}
							<button
								class="back-step-btn"
								on:click={handlePreviousStep}
								title="Go to previous step"
							>
								← Back
							</button>
						{/if}
						{#if currentStepConfig}
							<span class="step-hint">
								{currentStepConfig.title} — {currentStepConfig.description}
							</span>
						{/if}
						<button class="skip-step-btn" on:click={handleNextStep} title="Skip to next step">
							Skip →
						</button>
					</div>
				{/if}

				{#if $onboardingStore.currentStep === 'complete'}
					<div class="completion-banner" in:fly={{ y: 20 }}>
						<h3>🎉 Brand Foundation Complete!</h3>
						<p>Your brand style guide is ready. You can continue chatting to refine any details.</p>
						<div class="completion-actions">
							<!-- An anchor, not a button: this is navigation, so middle-click and
							     open-in-new-tab should work. Guarded on the id because the banner can
							     render from a restored session before the profile has loaded. -->
							{#if $onboardingStore.profile?.id}
								<a class="primary-btn" href="/brand/{$onboardingStore.profile.id}">
									View {brandName || 'Brand'} →
								</a>
							{/if}
							<button class="secondary-btn" on:click={handleRestartOnboarding}>
								Start New Brand
							</button>
						</div>
					</div>
				{/if}

				<!-- Input area -->
				<div
					class="input-area"
					class:drag-over={isDragging}
					on:dragover={handleDragOver}
					on:dragleave={handleDragLeave}
					on:drop={handleDrop}
					role="region"
					aria-label="Message input area"
				>
					{#if isDragging}
						<div class="drag-overlay" transition:fade={{ duration: 150 }}>
							<span>📎 Drop files to attach</span>
						</div>
					{/if}

					{#if attachmentError}
						<div class="attachment-error" transition:fade={{ duration: 200 }}>
							<span>⚠️ {attachmentError}</span>
							<button class="dismiss-btn" on:click={() => (attachmentError = null)}>✕</button>
						</div>
					{/if}

					{#if pendingAttachments.length > 0}
						<div class="pending-attachments" transition:fly={{ y: 10, duration: 200 }}>
							{#each pendingAttachments as att (att.id)}
								<div
									class="pending-attachment"
									class:error={!!att.error}
									transition:fade={{ duration: 150 }}
								>
									{#if att.type === 'image' && att.previewUrl}
										<img src={att.previewUrl} alt={att.name} class="pending-thumb" />
									{:else if att.type === 'video'}
										<div class="pending-icon">🎬</div>
									{:else if att.type === 'audio'}
										<div class="pending-icon">🎵</div>
									{/if}
									<div class="pending-info">
										<span class="pending-name">{att.name}</span>
										<span class="pending-size">{formatFileSize(att.file.size)}</span>
										{#if att.uploading}
											<span class="pending-status uploading">Uploading…</span>
										{:else if att.error}
											<span class="pending-status error">{att.error}</span>
										{:else if att.uploaded}
											<span class="pending-status ready">✓ Ready</span>
										{/if}
									</div>
									<button
										class="remove-attachment"
										on:click={() => removeAttachment(att.id)}
										title="Remove attachment"
										aria-label="Remove {att.name}">✕</button
									>
								</div>
							{/each}
						</div>
					{/if}

					<div class="input-wrapper" class:focused={true}>
						<button
							class="attach-button"
							on:click={handleAttachButtonClick}
							title="Attach image, video, or audio"
							aria-label="Attach file"
							disabled={$onboardingStore.isStreaming || $onboardingStore.isLoading}
						>
							<svg
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"
								></path>
							</svg>
						</button>
						<input
							bind:this={fileInputElement}
							type="file"
							accept={getAcceptString()}
							multiple
							class="file-input-hidden"
							on:change={handleFileSelect}
							aria-hidden="true"
							tabindex="-1"
						/>
						<textarea
							bind:this={textareaElement}
							bind:value={input}
							on:keydown={handleKeydown}
							on:input={autoResizeTextarea}
							on:paste={handlePaste}
							placeholder={$onboardingStore.isStreaming
								? 'AI is responding...'
								: 'Type your message or attach files...'}
							disabled={$onboardingStore.isStreaming || $onboardingStore.isLoading}
							maxlength={MAX_INPUT_LENGTH}
							rows="1"
							aria-label="Chat message input"
						></textarea>
						<button
							class="send-button"
							on:click={handleSend}
							disabled={!canSend}
							aria-label="Send message"
							title="Send message"
						>
							<svg
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<line x1="22" y1="2" x2="11" y2="13"></line>
								<polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
							</svg>
						</button>
					</div>
					{#if showCharCount}
						<div class="char-count" class:warning={inputLength > MAX_INPUT_LENGTH * 0.95}>
							{inputLength}/{MAX_INPUT_LENGTH}
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.onboarding-container {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
		background-color: var(--color-background);
	}

	/* Welcome Screen */
	.welcome-screen {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
		padding: var(--spacing-xl);
	}

	.welcome-content {
		max-width: 640px;
		text-align: center;
	}

	.welcome-icon {
		font-size: 3rem;
		margin-bottom: var(--spacing-md);
	}

	.welcome-content h1 {
		font-size: 2.2rem;
		font-weight: 700;
		color: var(--color-text);
		margin-bottom: var(--spacing-sm);
		letter-spacing: -0.02em;
	}

	.welcome-subtitle {
		font-size: 1rem;
		color: var(--color-text-secondary);
		line-height: 1.6;
		margin-bottom: var(--spacing-xl);
	}

	.welcome-features {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--spacing-md);
		text-align: left;
		margin-bottom: var(--spacing-xl);
	}

	.feature {
		display: flex;
		gap: var(--spacing-sm);
		padding: var(--spacing-md);
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
		background-color: var(--color-surface);
	}

	.feature-icon {
		font-size: 1.4rem;
		flex-shrink: 0;
	}

	.feature strong {
		display: block;
		font-size: 0.85rem;
		color: var(--color-text);
		margin-bottom: 2px;
	}

	.feature p {
		font-size: 0.72rem;
		color: var(--color-text-secondary);
		line-height: 1.4;
		margin: 0;
	}

	.welcome-cta {
		margin-top: var(--spacing-lg);
	}

	.cta-note {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		margin-bottom: var(--spacing-md);
		font-style: italic;
	}

	.start-button {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-md) var(--spacing-xl);
		background-color: var(--color-primary);
		color: var(--color-background);
		border: none;
		border-radius: var(--radius-md);
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.start-button:hover {
		background-color: var(--color-primary-hover);
		transform: translateY(-1px);
		box-shadow: var(--shadow-md);
	}

	.start-button .arrow {
		transition: transform var(--transition-fast);
	}

	.start-button:hover .arrow {
		transform: translateX(4px);
	}

	/* Chat Layout */
	.chat-layout {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		overflow: hidden;
		height: 100%;
	}

	.chat-area {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--spacing-md);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	/* Loading state */
	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-md);
		padding: var(--spacing-2xl);
		color: var(--color-text-secondary);
	}

	.loading-spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--color-border);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Messages */
	.message {
		display: flex;
		gap: var(--spacing-sm);
		max-width: 95%;
		animation: messageIn 0.3s ease;
	}

	@keyframes messageIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.message.user {
		align-self: flex-end;
		flex-direction: row-reverse;
	}

	.message.assistant {
		align-self: flex-start;
	}

	.message-avatar {
		flex-shrink: 0;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		font-size: 0.9rem;
	}

	.message.assistant .message-avatar {
		background-color: var(--color-primary);
	}

	.message-content {
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-lg);
		line-height: 1.6;
		font-size: 0.85rem;
	}

	.message.assistant .message-content {
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		color: var(--color-text);
	}

	.message.user .message-content {
		background-color: var(--color-primary);
		color: var(--color-background);
	}

	.message-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-xs);
	}

	.message-sender {
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.message-step {
		font-size: 0.6rem;
		padding: 2px 6px;
		background-color: var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		text-transform: capitalize;
	}

	.message-text {
		word-wrap: break-word;
		overflow-wrap: break-word;
	}

	.message-text :global(h3) {
		font-size: 1rem;
		font-weight: 700;
		margin: var(--spacing-md) 0 var(--spacing-xs);
		color: var(--color-text);
	}

	.message-text :global(h4) {
		font-size: 0.9rem;
		font-weight: 600;
		margin: var(--spacing-sm) 0 var(--spacing-xs);
		color: var(--color-text);
	}

	.message-text :global(strong) {
		font-weight: 600;
	}

	.message-text :global(li) {
		margin-left: var(--spacing-md);
		margin-bottom: var(--spacing-xs);
		list-style: disc;
	}

	.message-text :global(p) {
		margin-bottom: var(--spacing-sm);
	}
	/* Hex colours in a message render as a swatch followed by the code itself —
	   the code stays selectable and copyable, which is the point of quoting it. */
	.message-text :global(.color-chip) {
		display: inline-flex;
		align-items: center;
		gap: 0.35em;
		/* Keep the swatch welded to its hex code across a line wrap. */
		white-space: nowrap;
	}
	.message-text :global(.color-swatch) {
		width: 0.85em;
		height: 0.85em;
		border-radius: 3px;
		flex-shrink: 0;
		/* Palettes routinely include near-black and near-white, which would dissolve
		   into the bubble. An inset ring in mid-grey stays visible against both, so
		   it needs no light/dark variant. */
		box-shadow: inset 0 0 0 1px rgb(127 127 127 / 0.6);
	}

	.cursor-blink {
		animation: blink 0.8s infinite;
		color: var(--color-primary);
	}

	@keyframes blink {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0;
		}
	}

	.streaming-status-bar {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) var(--spacing-md);
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	.streaming-status-bar .status-icon {
		animation: spin 1s linear infinite;
		display: inline-block;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	/* Error message */
	.error-message {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		background-color: var(--color-surface);
		border: 1px solid var(--color-error);
		border-radius: var(--radius-md);
		color: var(--color-error);
		font-size: 0.8rem;
	}

	.error-message button {
		margin-left: auto;
		padding: 4px 8px;
		border: 1px solid var(--color-error);
		background: none;
		color: var(--color-error);
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: 0.7rem;
	}

	/* Bottom bar - pinned to bottom via flex layout */
	.bottom-bar {
		background-color: var(--color-surface);
		border-top: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	/* Brand indicator */
	.brand-indicator {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-xs) var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
		background-color: var(--color-background);
	}

	.brand-indicator-label {
		font-size: 0.6rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
	}

	.brand-indicator-name {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-primary);
	}

	.brand-indicator-name.untitled {
		color: var(--color-text-secondary);
		font-style: italic;
	}

	/* Step navigation */
	.step-navigation {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
	}

	.back-step-btn,
	.skip-step-btn {
		padding: 4px var(--spacing-sm);
		background: none;
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-size: 0.65rem;
		font-weight: 500;
		cursor: pointer;
		transition: all var(--transition-fast);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.back-step-btn:hover,
	.skip-step-btn:hover {
		border-color: var(--color-text-secondary);
		color: var(--color-text);
	}

	.step-hint {
		flex: 1;
		font-size: 0.65rem;
		color: var(--color-text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Step transition notification */
	.step-transition {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		margin: var(--spacing-sm) var(--spacing-lg);
		background-color: var(--color-surface);
		border: 1px solid var(--color-success);
		border-radius: var(--radius-md);
		font-size: 0.75rem;
		color: var(--color-success);
	}

	.transition-icon {
		font-size: 1rem;
		flex-shrink: 0;
	}

	.transition-text {
		color: var(--color-text-secondary);
	}

	.transition-text strong {
		color: var(--color-text);
	}

	/* Completion banner */
	/* Mirrors the assistant message layout so a card reads as part of the
	   conversation, not as something bolted on beside it. */
	.inline-card {
		display: flex;
		gap: var(--spacing-sm);
		padding: 0 var(--spacing-lg) var(--spacing-sm);
	}

	.inline-card .card-body {
		flex: 1;
		min-width: 0;
	}

	.completion-banner {
		padding: var(--spacing-md) var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
		text-align: center;
	}

	.completion-banner h3 {
		font-size: 1rem;
		margin-bottom: var(--spacing-xs);
		color: var(--color-text);
	}

	.completion-banner p {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		margin-bottom: var(--spacing-md);
	}

	.completion-actions {
		display: flex;
		gap: var(--spacing-sm);
		justify-content: center;
		/* The two actions sit side by side, but wrap rather than squeeze on narrow
		   screens — the brand name makes the primary label variable-width. */
		flex-wrap: wrap;
		align-items: center;
	}

	/* Primary action: go to the brand just built. --color-primary already carries
	   the brand teal and has separate light/dark values, so this needs no theme
	   handling of its own. */
	.primary-btn {
		padding: var(--spacing-xs) var(--spacing-md);
		background: var(--color-primary);
		color: var(--color-background);
		border: 1px solid var(--color-primary);
		border-radius: var(--radius-md);
		font-size: 0.75rem;
		font-weight: 600;
		text-decoration: none;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.primary-btn:hover {
		background: var(--color-primary-hover);
		border-color: var(--color-primary-hover);
	}

	.secondary-btn {
		padding: var(--spacing-xs) var(--spacing-md);
		background: none;
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-size: 0.75rem;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.secondary-btn:hover {
		border-color: var(--color-text-secondary);
		color: var(--color-text);
	}

	/* Input area */
	.input-area {
		padding: var(--spacing-sm) var(--spacing-md);
	}

	.input-wrapper {
		display: flex;
		align-items: flex-end;
		gap: var(--spacing-sm);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-xs) var(--spacing-sm);
		background-color: var(--color-background);
		transition: border-color var(--transition-fast);
	}

	.input-wrapper:focus-within {
		border-color: var(--color-primary);
	}

	.input-wrapper textarea {
		flex: 1;
		border: none;
		outline: none;
		background: none;
		color: var(--color-text);
		font-size: 0.85rem;
		font-family: var(--font-sans);
		resize: none;
		padding: var(--spacing-xs);
		line-height: 1.5;
		max-height: 200px;
	}

	.input-wrapper textarea::placeholder {
		color: var(--color-text-secondary);
	}

	.send-button {
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		background-color: var(--color-primary);
		color: var(--color-background);
		border-radius: 50%;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.send-button:hover:not(:disabled) {
		background-color: var(--color-primary-hover);
		transform: scale(1.05);
	}

	.send-button:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.char-count {
		text-align: right;
		font-size: 0.65rem;
		color: var(--color-text-secondary);
		margin-top: 4px;
	}

	.char-count.warning {
		color: var(--color-warning);
	}

	/* Attachment button */
	.attach-button {
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: none;
		color: var(--color-text-secondary);
		border-radius: 50%;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.attach-button:hover:not(:disabled) {
		color: var(--color-primary);
		background-color: var(--color-surface);
	}

	.attach-button:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.file-input-hidden {
		position: absolute;
		width: 0;
		height: 0;
		overflow: hidden;
		opacity: 0;
		pointer-events: none;
	}

	/* Drag and drop overlay */
	.input-area {
		position: relative;
	}

	.input-area.drag-over {
		border: 2px dashed var(--color-primary);
		border-radius: var(--radius-lg);
		background-color: color-mix(in srgb, var(--color-primary) 5%, transparent);
	}

	.drag-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: color-mix(in srgb, var(--color-primary) 10%, transparent);
		border-radius: var(--radius-lg);
		font-size: 0.85rem;
		color: var(--color-primary);
		font-weight: 500;
		z-index: 5;
		pointer-events: none;
	}

	/* Attachment error */
	.attachment-error {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-xs) var(--spacing-sm);
		margin-bottom: var(--spacing-xs);
		background-color: color-mix(in srgb, var(--color-error) 10%, transparent);
		border: 1px solid var(--color-error);
		border-radius: var(--radius-md);
		font-size: 0.75rem;
		color: var(--color-error);
	}

	.dismiss-btn {
		background: none;
		border: none;
		color: var(--color-error);
		cursor: pointer;
		font-size: 0.8rem;
		padding: 2px 4px;
	}

	/* Pending attachments */
	.pending-attachments {
		display: flex;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) 0;
		overflow-x: auto;
		flex-wrap: wrap;
	}

	.pending-attachment {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) var(--spacing-sm);
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-size: 0.75rem;
		max-width: 200px;
	}

	.pending-attachment.error {
		border-color: var(--color-error);
	}

	.pending-thumb {
		width: 40px;
		height: 40px;
		object-fit: cover;
		border-radius: var(--radius-sm);
		flex-shrink: 0;
	}

	.pending-icon {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: var(--color-background);
		border-radius: var(--radius-sm);
		font-size: 1.2rem;
		flex-shrink: 0;
	}

	.pending-info {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
		flex: 1;
	}

	.pending-name {
		font-weight: 500;
		color: var(--color-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.pending-size {
		color: var(--color-text-secondary);
		font-size: 0.65rem;
	}

	.pending-status {
		font-size: 0.65rem;
	}

	.pending-status.uploading {
		color: var(--color-primary);
	}

	.pending-status.ready {
		color: var(--color-success);
	}

	.pending-status.error {
		color: var(--color-error);
	}

	.remove-attachment {
		background: none;
		border: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		font-size: 0.8rem;
		padding: 2px;
		flex-shrink: 0;
		border-radius: 50%;
		transition: all var(--transition-fast);
	}

	.remove-attachment:hover {
		color: var(--color-error);
		background-color: color-mix(in srgb, var(--color-error) 10%, transparent);
	}

	/* Message attachments */
	.message-attachments {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs);
		margin-top: var(--spacing-xs);
	}

	.attachment-preview-item {
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-width: 300px;
	}

	.attachment-image {
		max-width: 100%;
		max-height: 250px;
		border-radius: var(--radius-md);
		object-fit: contain;
		cursor: pointer;
		border: 1px solid var(--color-border);
	}

	.attachment-image:hover {
		opacity: 0.9;
	}

	.attachment-video {
		max-width: 100%;
		max-height: 250px;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
	}

	.attachment-audio {
		width: 100%;
		min-width: 200px;
	}

	.attachment-name {
		font-size: 0.65rem;
		color: var(--color-text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Responsive */
	@media (min-width: 769px) {
		.welcome-features {
			grid-template-columns: 1fr 1fr;
		}

		.welcome-content h1 {
			font-size: 2rem;
		}

		.message {
			max-width: 85%;
		}

		.chat-area {
			padding: var(--spacing-lg);
		}

		.input-area {
			padding: var(--spacing-md) var(--spacing-lg);
		}

		.step-navigation {
			flex-direction: row;
			align-items: center;
			padding: var(--spacing-sm) var(--spacing-lg);
			gap: var(--spacing-md);
		}
	}
</style>
