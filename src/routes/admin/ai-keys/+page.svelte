<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	interface ModelWithPricing {
		id: string;
		displayName?: string;
		pricing?: {
			input: number;
			output: number;
			cached?: number;
		};
		audioPricing?: {
			input: number;
			output: number;
		};
		ownedBy: string;
		created: number;
	}

	let keys = data.keys || [];
	let showForm = false;
	let editingKey: any = null;

	// ── Robust Drag & Drop (pointer-event based, works on touch + mouse) ──

	let dragState: {
		fromIndex: number;
		currentIndex: number; // where item would be inserted
		startY: number;
		currentY: number;
		clone: HTMLElement | null;
		listEl: HTMLElement | null;
		rects: DOMRect[]; // snapshot of card positions at drag start
		scrollInterval: number | null;
	} | null = null;

	let savingOrder = false;
	let listEl: HTMLElement | null = null;

	$: isDragging = dragState !== null;
	$: dropTargetIndex = dragState?.currentIndex ?? -1;
	$: dragFromIndex = dragState?.fromIndex ?? -1;

	async function saveOrder() {
		savingOrder = true;
		try {
			const order = keys.map((k: any) => k.id);
			const response = await fetch('/api/admin/ai-keys/reorder', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ order })
			});
			if (!response.ok) {
				console.error('Failed to save order');
			}
		} catch (err) {
			console.error('Failed to save order:', err);
		} finally {
			savingOrder = false;
		}
	}

	/** Snapshot all card rects at pointer-down time so we don't re-measure during drag */
	function snapshotRects(): DOMRect[] {
		if (!listEl) return [];
		const cards = listEl.querySelectorAll<HTMLElement>('.key-card');
		return Array.from(cards).map((c) => c.getBoundingClientRect());
	}

	/** Given a Y position, figure out which slot the item should drop into */
	function calcDropIndex(y: number, fromIndex: number, rects: DOMRect[]): number {
		for (let i = 0; i < rects.length; i++) {
			const mid = rects[i].top + rects[i].height / 2;
			if (y < mid) {
				// When dragging downward, the visual positions shift, so adjust
				return i <= fromIndex ? i : i;
			}
		}
		return rects.length; // past the end
	}

	/** Convert a drop-slot index to the final array index after removal of source */
	function slotToArrayIndex(slot: number, fromIndex: number): number {
		if (slot <= fromIndex) return slot;
		return slot - 1;
	}

	function startDrag(e: PointerEvent, index: number) {
		// Only primary button (or touch)
		if (e.button !== 0) return;

		const handle = e.currentTarget as HTMLElement;
		const card = handle.closest('.key-card') as HTMLElement;
		if (!card || !listEl) return;

		e.preventDefault();
		handle.setPointerCapture(e.pointerId);

		const rects = snapshotRects();
		const rect = rects[index];
		if (!rect) return;

		// Create clone
		const clone = card.cloneNode(true) as HTMLElement;
		clone.style.cssText = `
			position: fixed;
			left: ${rect.left}px;
			top: ${rect.top}px;
			width: ${rect.width}px;
			height: ${rect.height}px;
			z-index: 10000;
			pointer-events: none;
			opacity: 0.95;
			transform: scale(1.03);
			box-shadow: 0 16px 48px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,0.15);
			border-radius: var(--radius-lg);
			border: 2px solid var(--color-primary);
			transition: transform 0.1s ease, box-shadow 0.1s ease;
			will-change: top;
		`;
		document.body.appendChild(clone);

		dragState = {
			fromIndex: index,
			currentIndex: index,
			startY: e.clientY,
			currentY: e.clientY,
			clone,
			listEl,
			rects,
			scrollInterval: null
		};

		// Start auto-scroll
		dragState.scrollInterval = window.setInterval(() => autoScroll(), 16);
	}

	function moveDrag(e: PointerEvent) {
		if (!dragState) return;
		e.preventDefault();

		const dy = e.clientY - dragState.startY;
		const originRect = dragState.rects[dragState.fromIndex];

		if (dragState.clone) {
			dragState.clone.style.top = `${originRect.top + dy}px`;
		}

		dragState.currentY = e.clientY;
		dragState.currentIndex = calcDropIndex(e.clientY, dragState.fromIndex, dragState.rects);
	}

	function endDrag(e: PointerEvent) {
		if (!dragState) return;

		const { fromIndex, currentIndex, clone, scrollInterval } = dragState;

		// Clear auto-scroll
		if (scrollInterval !== null) clearInterval(scrollInterval);

		// Remove clone
		if (clone) clone.remove();

		// Perform the reorder if position changed
		const targetArrayIdx = slotToArrayIndex(currentIndex, fromIndex);
		if (targetArrayIdx !== fromIndex) {
			const newKeys = [...keys];
			const [moved] = newKeys.splice(fromIndex, 1);
			newKeys.splice(targetArrayIdx, 0, moved);
			keys = newKeys;
			saveOrder();
		}

		dragState = null;
	}

	function cancelDrag() {
		if (!dragState) return;
		if (dragState.scrollInterval !== null) clearInterval(dragState.scrollInterval);
		if (dragState.clone) dragState.clone.remove();
		dragState = null;
	}

	/** Auto-scroll when dragging near edges */
	function autoScroll() {
		if (!dragState) return;
		const y = dragState.currentY;
		const margin = 60;
		const speed = 8;
		if (y < margin) {
			window.scrollBy(0, -speed);
			refreshRectsOnScroll();
		} else if (y > window.innerHeight - margin) {
			window.scrollBy(0, speed);
			refreshRectsOnScroll();
		}
	}

	/** After auto-scroll, rects shift — re-snapshot */
	function refreshRectsOnScroll() {
		if (!dragState || !dragState.listEl) return;
		dragState.rects = snapshotRects();
		// Recalculate drop index with new rects
		dragState.currentIndex = calcDropIndex(
			dragState.currentY,
			dragState.fromIndex,
			dragState.rects
		);
	}

	// Prevent native drag from interfering
	function preventNativeDrag(e: DragEvent) {
		e.preventDefault();
	}

	// Keyboard reorder for accessibility
	function handleKeyReorder(e: KeyboardEvent, index: number) {
		if (e.key === 'ArrowUp' && index > 0) {
			e.preventDefault();
			const newKeys = [...keys];
			[newKeys[index - 1], newKeys[index]] = [newKeys[index], newKeys[index - 1]];
			keys = newKeys;
			saveOrder();
			// Focus the moved card's handle after tick
			requestAnimationFrame(() => {
				const handles = listEl?.querySelectorAll<HTMLElement>('.drag-handle');
				handles?.[index - 1]?.focus();
			});
		} else if (e.key === 'ArrowDown' && index < keys.length - 1) {
			e.preventDefault();
			const newKeys = [...keys];
			[newKeys[index], newKeys[index + 1]] = [newKeys[index + 1], newKeys[index]];
			keys = newKeys;
			saveOrder();
			requestAnimationFrame(() => {
				const handles = listEl?.querySelectorAll<HTMLElement>('.drag-handle');
				handles?.[index + 1]?.focus();
			});
		}
	}
	let formData = {
		name: '',
		provider: 'openai',
		apiKey: '',
		models: [] as string[],
		enabled: true,
		voiceEnabled: false,
		voiceModels: [] as string[],
		videoEnabled: false,
		videoModels: [] as string[]
	};
	let errors: Record<string, string> = {};
	let visibleKeys: Record<string, boolean> = {};
	let showDeleteConfirm = false;
	let deletingKeyId: string | null = null;

	// Account info (balance + usage) per key
	interface AccountBalance {
		available: boolean;
		amount?: number;
		currency?: string;
		reason?: string;
		rateLimits?: {
			requestsLimit?: number;
			requestsRemaining?: number;
			tokensLimit?: number;
			tokensRemaining?: number;
		};
		label?: string;
	}

	interface UsageDay {
		date: string;
		cost: number;
		requests: number;
	}

	interface AccountUsage {
		available: boolean;
		daily: UsageDay[];
		totalCost?: number;
		totalRequests?: number;
	}

	interface AccountInfo {
		balance: AccountBalance;
		usage: AccountUsage;
		loading: boolean;
		error?: string;
	}

	let accountInfo: Record<string, AccountInfo> = {};

	async function loadAccountInfo(keyId: string) {
		accountInfo[keyId] = {
			...accountInfo[keyId],
			loading: true,
			error: undefined
		};
		accountInfo = accountInfo;

		try {
			const response = await fetch(`/api/admin/ai-keys/${encodeURIComponent(keyId)}/account-info`);
			if (!response.ok) {
				throw new Error(`Failed to fetch (${response.status})`);
			}
			const data = await response.json();
			accountInfo[keyId] = {
				balance: data.balance,
				usage: data.usage,
				loading: false
			};
		} catch (err) {
			accountInfo[keyId] = {
				balance: { available: false, reason: 'Failed to load' },
				usage: { available: false, daily: [] },
				loading: false,
				error: err instanceof Error ? err.message : 'Unknown error'
			};
		}
		accountInfo = accountInfo;
	}

	function loadAllAccountInfo() {
		for (const key of keys) {
			if (key.enabled !== false) {
				loadAccountInfo(key.id);
			}
		}
	}

	function formatCurrency(amount: number): string {
		return `$${amount.toFixed(2)}`;
	}

	// OpenAI models loaded from API
	let openaiChatModels: ModelWithPricing[] = [];
	let openaiVoiceModels: ModelWithPricing[] = [];
	let loadingModels = false;
	let modelsError = '';
	let modelsLoadedFromApi = false;

	const providers = [
		{
			value: 'openai',
			label: 'OpenAI',
			models: [] as Array<{
				id: string;
				displayName: string;
				pricing?: { input: number; output: number; cached?: number };
			}>
		},
		{
			value: 'anthropic',
			label: 'Anthropic',
			models: [
				{
					id: 'claude-sonnet-4-20250514',
					displayName: 'Claude Sonnet 4',
					pricing: { input: 3, output: 15 }
				},
				{
					id: 'claude-3-5-sonnet-20241022',
					displayName: 'Claude 3.5 Sonnet',
					pricing: { input: 3, output: 15 }
				},
				{
					id: 'claude-3-5-haiku-20241022',
					displayName: 'Claude 3.5 Haiku',
					pricing: { input: 1, output: 5 }
				},
				{
					id: 'claude-3-opus-20240229',
					displayName: 'Claude 3 Opus',
					pricing: { input: 15, output: 75 }
				},
				{
					id: 'claude-3-haiku-20240307',
					displayName: 'Claude 3 Haiku',
					pricing: { input: 0.25, output: 1.25 }
				}
			]
		},
		{
			value: 'google',
			label: 'Google (Gemini)',
			models: [
				{ id: 'gemini-pro', displayName: 'Gemini Pro' },
				{ id: 'gemini-pro-vision', displayName: 'Gemini Pro Vision' }
			]
		},
		{
			value: 'mistral',
			label: 'Mistral AI',
			models: [
				{ id: 'mistral-large', displayName: 'Mistral Large' },
				{ id: 'mistral-medium', displayName: 'Mistral Medium' },
				{ id: 'mistral-small', displayName: 'Mistral Small' }
			]
		},
		{
			value: 'cohere',
			label: 'Cohere',
			models: [
				{ id: 'command', displayName: 'Command' },
				{ id: 'command-light', displayName: 'Command Light' }
			]
		},
		{
			value: 'wavespeed',
			label: 'WaveSpeed AI',
			models: [] as Array<{
				id: string;
				displayName: string;
				pricing?: { input: number; output: number; cached?: number };
			}>
		}
	];

	// Format pricing for display
	function formatPricing(
		pricing: { input: number; output: number; cached?: number } | undefined
	): string {
		if (!pricing) return '';
		let text = `$${pricing.input}/$${pricing.output}/M`;
		if (pricing.cached) {
			text += ` (cached: $${pricing.cached})`;
		}
		return text;
	}

	function formatAudioPricing(pricing: { input: number; output: number } | undefined): string {
		if (!pricing) return '';
		return `$${pricing.input}/$${pricing.output}/min`;
	}

	// Format compact pricing for display
	function formatCompactPricing(
		pricing?: { input: number; output: number; cached?: number },
		audioPricing?: { input: number; output: number }
	): string {
		const parts: string[] = [];
		if (pricing) {
			parts.push(`$${pricing.input}/$${pricing.output}/M`);
		}
		if (audioPricing) {
			parts.push(`$${audioPricing.input}/$${audioPricing.output}/min audio`);
		}
		return parts.join(' • ');
	}

	// Load OpenAI models when provider is selected or on mount
	async function loadOpenAIModels() {
		if (loadingModels) return;
		loadingModels = true;
		modelsError = '';

		try {
			const response = await fetch('/api/admin/ai-keys/models');
			if (!response.ok) {
				throw new Error('Failed to load models');
			}

			const data = await response.json();
			openaiChatModels = data.chatModels || [];
			openaiVoiceModels = data.voiceModels || [];
			modelsLoadedFromApi = data.fromApi || false;
		} catch (err) {
			console.error('Failed to load OpenAI models:', err);
			modelsError = 'Failed to load models. Using default list.';
			// Fallback to static list
			openaiChatModels = [
				{
					id: 'gpt-5.2',
					pricing: { input: 1.75, output: 14, cached: 0.175 },
					ownedBy: 'openai',
					created: 0
				},
				{
					id: 'gpt-5.1',
					pricing: { input: 1.25, output: 10, cached: 0.125 },
					ownedBy: 'openai',
					created: 0
				},
				{
					id: 'gpt-5',
					pricing: { input: 1.25, output: 10, cached: 0.125 },
					ownedBy: 'openai',
					created: 0
				},
				{
					id: 'gpt-5-mini',
					pricing: { input: 0.25, output: 2, cached: 0.025 },
					ownedBy: 'openai',
					created: 0
				},
				{
					id: 'gpt-4.1',
					pricing: { input: 2, output: 8, cached: 0.5 },
					ownedBy: 'openai',
					created: 0
				},
				{
					id: 'gpt-4.1-mini',
					pricing: { input: 0.4, output: 1.6, cached: 0.1 },
					ownedBy: 'openai',
					created: 0
				},
				{
					id: 'gpt-4o',
					pricing: { input: 2.5, output: 10, cached: 1.25 },
					ownedBy: 'openai',
					created: 0
				},
				{
					id: 'gpt-4o-mini',
					pricing: { input: 0.15, output: 0.6, cached: 0.075 },
					ownedBy: 'openai',
					created: 0
				},
				{
					id: 'o4-mini',
					pricing: { input: 1.1, output: 4.4, cached: 0.275 },
					ownedBy: 'openai',
					created: 0
				},
				{ id: 'o3', pricing: { input: 2, output: 8, cached: 0.5 }, ownedBy: 'openai', created: 0 }
			];
			openaiVoiceModels = [
				{
					id: 'gpt-realtime',
					pricing: { input: 4, output: 16, cached: 0.4 },
					audioPricing: { input: 0.05, output: 0.19 },
					ownedBy: 'openai',
					created: 0
				},
				{
					id: 'gpt-realtime-mini',
					pricing: { input: 0.6, output: 2.4, cached: 0.06 },
					audioPricing: { input: 0.015, output: 0.06 },
					ownedBy: 'openai',
					created: 0
				},
				{
					id: 'gpt-4o-realtime-preview-2024-12-17',
					pricing: { input: 5, output: 20, cached: 2.5 },
					audioPricing: { input: 0.06, output: 0.24 },
					ownedBy: 'openai',
					created: 0
				},
				{
					id: 'gpt-4o-mini-realtime-preview-2024-12-17',
					pricing: { input: 0.6, output: 2.4, cached: 0.3 },
					audioPricing: { input: 0.015, output: 0.06 },
					ownedBy: 'openai',
					created: 0
				}
			];
		} finally {
			loadingModels = false;
		}
	}

	// Get models for current provider (only those with pricing for OpenAI)
	$: currentProviderModels =
		formData.provider === 'openai'
			? openaiChatModels.filter((m) => m.pricing)
			: providers
					.find((p) => p.value === formData.provider)
					?.models.map((m) => ({
						id: m.id,
						displayName: m.displayName,
						pricing: m.pricing,
						ownedBy: '',
						created: 0
					})) || [];

	// Get voice models with pricing only
	$: filteredVoiceModels = openaiVoiceModels.filter((m) => m.pricing || m.audioPricing);

	// Calculate total selected models pricing
	$: selectedTextModels = currentProviderModels.filter((m) => formData.models.includes(m.id));
	$: selectedVoiceModelsList = filteredVoiceModels.filter((m) =>
		formData.voiceModels.includes(m.id)
	);

	// Video models (static list from registry)
	// Pricing from https://openai.com/api/pricing/ (per second of generated video)
	const videoModelOptions = [
		{
			id: 'sora-2',
			displayName: 'Sora 2',
			description: 'Fast video generation, ideal for iteration',
			resolutions: '720p',
			pricing: { perSecond: 0.1 }
		},
		{
			id: 'sora-2-pro',
			displayName: 'Sora 2 Pro',
			description: 'Higher quality, production-grade output',
			resolutions: '720p / 1080p',
			pricing: { perSecond: 0.3, perSecondHighRes: 0.5 }
		}
	];

	// WaveSpeed video/image model options
	// Fallback pricing from https://wavespeed.ai/pricing — overridden by live API data when available
	const wavespeedModelOptions = [
		{
			id: 'wan-2.1/t2v',
			displayName: 'Wan 2.1 T2V',
			description: 'Text-to-video, 480p–720p quality',
			category: 'video',
			fallbackPrice: 0.03
		},
		{
			id: 'wan-2.1/i2v-720p',
			displayName: 'Wan 2.1 I2V 720p',
			description: 'Image-to-video, 720p quality',
			category: 'video',
			fallbackPrice: 0.04
		},
		{
			id: 'wan-2.2/t2v',
			displayName: 'Wan 2.2 T2V',
			description: 'Latest Wan text-to-video',
			category: 'video',
			fallbackPrice: 0.04
		},
		{
			id: 'wan-2.2/i2v-480p',
			displayName: 'Wan 2.2 I2V 480p',
			description: 'Latest Wan image-to-video',
			category: 'video',
			fallbackPrice: 0.03
		},
		{
			id: 'hunyuan-video/t2v',
			displayName: 'HunYuan Video',
			description: 'Tencent HunYuan text-to-video',
			category: 'video',
			fallbackPrice: 0.05
		},
		{
			id: 'ltx-video/ltx-2-19b-text-to-video',
			displayName: 'LTX 2 T2V',
			description: 'Lightricks text-to-video',
			category: 'video',
			fallbackPrice: 0.03
		},
		{
			id: 'ltx-video/ltx-2-19b-image-to-video',
			displayName: 'LTX 2 I2V',
			description: 'Lightricks image-to-video',
			category: 'video',
			fallbackPrice: 0.035
		},
		{
			id: 'framepack/framepack-f1',
			displayName: 'FramePack',
			description: 'Frame-based video generation',
			category: 'video',
			fallbackPrice: 0.04
		},
		{
			id: 'flux-dev',
			displayName: 'Flux Dev',
			description: 'High-quality image generation',
			category: 'image',
			fallbackPrice: 0.025
		},
		{
			id: 'flux-schnell',
			displayName: 'Flux Schnell',
			description: 'Fast image generation',
			category: 'image',
			fallbackPrice: 0.015
		}
	];

	// WaveSpeed pricing data
	interface WaveSpeedPricingModel {
		model_id: string;
		name: string;
		base_price: number;
		description: string;
		type: string;
	}
	let wavespeedPricing: WaveSpeedPricingModel[] = [];
	let wavespeedPricingLoading = false;
	let wavespeedPricingError = '';
	let wavespeedPricingCached = false;

	async function loadWaveSpeedPricing(forceRefresh = false) {
		if (wavespeedPricingLoading) return;
		wavespeedPricingLoading = true;
		wavespeedPricingError = '';
		try {
			const url = forceRefresh
				? '/api/admin/ai-keys/wavespeed-pricing?refresh=true'
				: '/api/admin/ai-keys/wavespeed-pricing';
			const response = await fetch(url);
			if (!response.ok) throw new Error('Failed to load pricing');
			const data = await response.json();
			wavespeedPricing = data.models || [];
			wavespeedPricingCached = data.cached || false;
			if (data.error) wavespeedPricingError = data.error;
		} catch (err) {
			console.error('Failed to load WaveSpeed pricing:', err);
			wavespeedPricingError = 'Failed to load pricing data.';
		} finally {
			wavespeedPricingLoading = false;
		}
	}

	/**
	 * Look up base_price for a local model ID.
	 * Checks live API pricing data first, then falls back to the local fallback price.
	 * Local IDs like "wan-2.1/t2v" map to API model_ids like "wavespeed-ai/wan-2.1/t2v-720p".
	 * Performs normalized matching (strips prefix, replaces / with -).
	 */
	function getWaveSpeedPrice(localModelId: string): number | null {
		// Try live API pricing first
		if (wavespeedPricing.length > 0) {
			// Direct match with wavespeed-ai/ prefix
			const prefixed = `wavespeed-ai/${localModelId}`;
			const directMatch = wavespeedPricing.find((m) => m.model_id === prefixed);
			if (directMatch) return directMatch.base_price;

			// Normalized match: strip prefix and replace / with -
			const normalizedLocal = localModelId.toLowerCase();
			const normalizedMatch = wavespeedPricing.find((m) => {
				const stripped = m.model_id
					.replace(/^wavespeed-ai\//, '')
					.replace(/\//g, '-')
					.toLowerCase();
				return stripped === normalizedLocal;
			});
			if (normalizedMatch) return normalizedMatch.base_price;
		}

		// Fall back to local pricing estimate
		const model = wavespeedModelOptions.find((m) => m.id === localModelId);
		return model?.fallbackPrice ?? null;
	}

	/**
	 * Look up the live API price only (no fallback). Used to determine
	 * whether the displayed price came from the API or from local estimates.
	 */
	function getWaveSpeedLivePrice(localModelId: string): number | null {
		if (wavespeedPricing.length === 0) return null;

		const prefixed = `wavespeed-ai/${localModelId}`;
		const directMatch = wavespeedPricing.find((m) => m.model_id === prefixed);
		if (directMatch) return directMatch.base_price;

		const normalizedLocal = localModelId.toLowerCase();
		const normalizedMatch = wavespeedPricing.find((m) => {
			const stripped = m.model_id
				.replace(/^wavespeed-ai\//, '')
				.replace(/\//g, '-')
				.toLowerCase();
			return stripped === normalizedLocal;
		});
		if (normalizedMatch) return normalizedMatch.base_price;

		return null;
	}

	/**
	 * Get the model type from API data for display (e.g., "per second", "per image")
	 */
	function getWaveSpeedModelType(localModelId: string): string | null {
		if (wavespeedPricing.length === 0) return null;

		const prefixed = `wavespeed-ai/${localModelId}`;
		const match =
			wavespeedPricing.find((m) => m.model_id === prefixed) ||
			wavespeedPricing.find((m) => {
				const stripped = m.model_id
					.replace(/^wavespeed-ai\//, '')
					.replace(/\//g, '-')
					.toLowerCase();
				return stripped === localModelId.toLowerCase();
			});
		return match?.type || null;
	}

	// WaveSpeed key validation
	let wavespeedValidating = false;
	let wavespeedValidationResult: { valid: boolean; balance?: number; error?: string } | null = null;

	async function validateWavespeedKey() {
		if (!formData.apiKey.trim()) {
			wavespeedValidationResult = { valid: false, error: 'Enter an API key first' };
			return;
		}
		wavespeedValidating = true;
		wavespeedValidationResult = null;
		try {
			const response = await fetch('/api/admin/ai-keys/wavespeed-validate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ apiKey: formData.apiKey })
			});
			wavespeedValidationResult = await response.json();
		} catch {
			wavespeedValidationResult = { valid: false, error: 'Failed to validate key' };
		} finally {
			wavespeedValidating = false;
		}
	}

	onMount(() => {
		loadOpenAIModels();
		loadWaveSpeedPricing();
		loadAllAccountInfo();
	});

	function toggleModel(modelId: string) {
		if (formData.models.includes(modelId)) {
			formData.models = formData.models.filter((m) => m !== modelId);
		} else {
			formData.models = [...formData.models, modelId];
		}
	}

	function toggleVoiceModel(modelId: string) {
		if (formData.voiceModels.includes(modelId)) {
			formData.voiceModels = formData.voiceModels.filter((m) => m !== modelId);
		} else {
			formData.voiceModels = [...formData.voiceModels, modelId];
		}
	}

	function toggleVideoModel(modelId: string) {
		if (formData.videoModels.includes(modelId)) {
			formData.videoModels = formData.videoModels.filter((m) => m !== modelId);
		} else {
			formData.videoModels = [...formData.videoModels, modelId];
		}
	}

	function openAddForm() {
		showForm = true;
		editingKey = null;
		formData = {
			name: '',
			provider: 'openai',
			apiKey: '',
			models: [],
			enabled: true,
			voiceEnabled: false,
			voiceModels: [],
			videoEnabled: false,
			videoModels: []
		};
		errors = {};
		wavespeedValidationResult = null;
	}

	function openEditForm(key: any) {
		showForm = true;
		editingKey = key;
		// Support both old single model format and new multiple models format
		let existingModels = key.models || (key.model ? [key.model] : []);
		const existingVoiceModels = key.voiceModels || (key.voiceModel ? [key.voiceModel] : []);
		const existingVideoModels = key.videoModels || [];

		// Migrate legacy short Anthropic model names to full API IDs
		if (key.provider === 'anthropic') {
			const aliasMap: Record<string, string> = {
				'claude-3-opus': 'claude-3-opus-20240229',
				'claude-3-sonnet': 'claude-3-5-sonnet-20241022',
				'claude-3-haiku': 'claude-3-haiku-20240307',
				'claude-3.5-sonnet': 'claude-3-5-sonnet-20241022',
				'claude-3.5-haiku': 'claude-3-5-haiku-20241022'
			};
			existingModels = existingModels.map((m: string) => aliasMap[m] || m);
		}
		formData = {
			name: key.name,
			provider: key.provider,
			apiKey: '',
			models: existingModels,
			enabled: key.enabled !== undefined ? key.enabled : true,
			voiceEnabled: key.voiceEnabled ?? false,
			voiceModels: existingVoiceModels,
			videoEnabled: key.videoEnabled ?? false,
			videoModels: existingVideoModels
		};
		errors = {};
	}

	function closeForm() {
		showForm = false;
		editingKey = null;
		formData = {
			name: '',
			provider: 'openai',
			apiKey: '',
			models: [],
			enabled: true,
			voiceEnabled: false,
			voiceModels: [],
			videoEnabled: false,
			videoModels: []
		};
		errors = {};
		wavespeedValidationResult = null;
	}

	function validateForm() {
		errors = {};

		if (!formData.name.trim()) {
			errors.name = 'Key name is required';
		}

		if (!editingKey && !formData.apiKey.trim()) {
			errors.apiKey = 'API Key is required';
		}

		return Object.keys(errors).length === 0;
	}

	async function saveKey() {
		if (!validateForm()) {
			return;
		}

		try {
			const url = editingKey ? `/api/admin/ai-keys/${editingKey.id}` : '/api/admin/ai-keys';
			const method = editingKey ? 'PUT' : 'POST';

			const response = await fetch(url, {
				method,
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(formData)
			});

			if (response.ok) {
				const result = await response.json();
				if (editingKey) {
					keys = keys.map((k: any) =>
						k.id === editingKey.id ? { ...k, ...formData, apiKey: undefined } : k
					);
				} else {
					keys = [...keys, result.key];
				}
				closeForm();
			} else {
				const errorData = await response.json().catch(() => null);
				errors.submit = errorData?.message || `Failed to save key (${response.status})`;
			}
		} catch (error) {
			errors.submit = 'An error occurred while saving';
		}
	}

	function openDeleteConfirm(keyId: string) {
		deletingKeyId = keyId;
		showDeleteConfirm = true;
	}

	function closeDeleteConfirm() {
		deletingKeyId = null;
		showDeleteConfirm = false;
	}

	async function confirmDelete() {
		if (!deletingKeyId) return;

		try {
			const response = await fetch(`/api/admin/ai-keys/${deletingKeyId}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				keys = keys.filter((k: any) => k.id !== deletingKeyId);
				closeDeleteConfirm();
			}
		} catch (error) {
			console.error('Failed to delete key:', error);
		}
	}

	function toggleKeyVisibility(keyId: string) {
		visibleKeys[keyId] = !visibleKeys[keyId];
	}

	function maskValue(value: string): string {
		return '••••••';
	}

	async function toggleEnabled(keyId: string, currentEnabled: boolean) {
		// Optimistically update UI
		keys = keys.map((k: any) => (k.id === keyId ? { ...k, enabled: !currentEnabled } : k));

		try {
			const response = await fetch(`/api/admin/ai-keys/${keyId}/toggle`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ enabled: !currentEnabled })
			});

			if (!response.ok) {
				// Revert on failure
				keys = keys.map((k: any) => (k.id === keyId ? { ...k, enabled: currentEnabled } : k));
				console.error('Failed to toggle key status');
			}
		} catch (error) {
			// Revert on error
			keys = keys.map((k: any) => (k.id === keyId ? { ...k, enabled: currentEnabled } : k));
			console.error('Failed to toggle key status:', error);
		}
	}
</script>

<svelte:head>
	<title>AI Provider Keys - Admin - Nabu</title>
</svelte:head>

<div class="ai-keys-page">
	<header class="page-header">
		<h1>AI Provider Keys</h1>
		<p class="page-description">
			Manage API keys for AI providers. Drag to reorder — higher priority keys are tried first for
			AI generation.
		</p>
	</header>

	<div class="page-actions">
		<button class="btn btn-primary" on:click={openAddForm}>
			<svg
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<path d="M12 5v14m-7-7h14" />
			</svg>
			Add AI Key
		</button>
	</div>

	{#if keys.length === 0}
		<div class="empty-state">
			<svg
				width="64"
				height="64"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
			>
				<path d="M12 3v18m0-18l-3 3m3-3l3 3M3 12h18M3 12l3-3m-3 3l3 3m12-3l-3-3m3 3l-3 3" />
			</svg>
			<h3>No AI provider keys configured</h3>
			<p>Add your first AI provider key to enable AI features.</p>
		</div>
	{:else}
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div
			class="keys-list"
			class:is-dragging={isDragging}
			bind:this={listEl}
			on:dragstart={preventNativeDrag}
		>
			{#each keys as key, index (key.id)}
				{@const keyModels = key.models || (key.model ? [key.model] : [])}
				{@const keyVoiceModels = key.voiceModels || (key.voiceModel ? [key.voiceModel] : [])}
				<!-- Slot indicator — rendered between items via CSS, no DOM changes during drag -->
				<div
					class="drop-slot"
					class:drop-slot-active={isDragging &&
						dropTargetIndex === index &&
						dragFromIndex !== index}
				>
					<div class="drop-slot-inner">
						<span class="drop-slot-dot"></span>
						<span class="drop-slot-line"></span>
						<span class="drop-slot-text">Priority #{index + 1}</span>
						<span class="drop-slot-line"></span>
						<span class="drop-slot-dot"></span>
					</div>
				</div>
				<div
					class="key-card"
					class:is-dragged={dragFromIndex === index}
					on:dragstart={preventNativeDrag}
				>
					<div class="key-header">
						<div class="key-info">
							<div class="key-title-row">
								<!-- Drag handle: pointer events for unified mouse + touch -->
								<button
									class="drag-handle"
									aria-label="Drag to reorder {key.name}. Use arrow keys."
									on:pointerdown={(e) => startDrag(e, index)}
									on:pointermove={moveDrag}
									on:pointerup={endDrag}
									on:pointercancel={cancelDrag}
									on:keydown={(e) => handleKeyReorder(e, index)}
								>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
										<circle cx="8" cy="4" r="2" />
										<circle cx="16" cy="4" r="2" />
										<circle cx="8" cy="12" r="2" />
										<circle cx="16" cy="12" r="2" />
										<circle cx="8" cy="20" r="2" />
										<circle cx="16" cy="20" r="2" />
									</svg>
								</button>
								<span class="priority-badge" title="Priority order — tried first for AI generation"
									>#{index + 1}</span
								>
								<h3>{key.name}</h3>
							</div>
							<div class="key-badges">
								<span class="key-provider">{key.provider}</span>
								{#if keyModels.length > 0}
									<span class="key-model-count">
										<svg
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
										>
											<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
										</svg>
										{keyModels.length} text model{keyModels.length > 1 ? 's' : ''}
									</span>
								{/if}
								{#if key.provider === 'openai' && key.voiceEnabled && keyVoiceModels.length > 0}
									<span class="key-voice-badge">
										<svg
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
										>
											<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
											<path d="M19 10v2a7 7 0 0 1-14 0v-2" />
											<line x1="12" y1="19" x2="12" y2="23" />
											<line x1="8" y1="23" x2="16" y2="23" />
										</svg>
										{keyVoiceModels.length} voice model{keyVoiceModels.length > 1 ? 's' : ''}
									</span>
								{/if}
								{#if key.videoEnabled && (key.videoModels?.length ?? 0) > 0}
									<span class="key-voice-badge video-badge">
										<svg
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
										>
											<rect x="2" y="4" width="20" height="16" rx="2" />
											<polygon points="10,9 16,12 10,15" />
										</svg>
										{key.videoModels.length} video model{key.videoModels.length > 1 ? 's' : ''}
									</span>
								{/if}
							</div>
						</div>
						<div class="key-actions">
							<label class="toggle-switch">
								<input
									type="checkbox"
									checked={key.enabled !== false}
									on:change={() => toggleEnabled(key.id, key.enabled !== false)}
									aria-label={`Toggle ${key.name}`}
								/>
								<span class="slider"></span>
							</label>
							<button
								class="btn-icon"
								on:click={() => openEditForm(key)}
								aria-label={`Edit ${key.name}`}
							>
								<svg
									width="20"
									height="20"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
									<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
								</svg>
							</button>
							<button
								class="btn-icon btn-danger"
								on:click={() => openDeleteConfirm(key.id)}
								aria-label={`Delete ${key.name}`}
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
										d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
									/>
								</svg>
							</button>
						</div>
					</div>
					{#if key.apiKey}
						<div class="key-field">
							<div class="label">API Key</div>
							<div class="key-value">
								<span>{visibleKeys[key.id] ? key.apiKey : maskValue(key.apiKey)}</span>
								<button
									class="btn-icon-sm"
									on:click={() => toggleKeyVisibility(key.id)}
									aria-label={visibleKeys[key.id] ? 'Hide value' : 'Show value'}
								>
									{#if visibleKeys[key.id]}
										<svg
											width="16"
											height="16"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
										>
											<path
												d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"
											/>
										</svg>
									{:else}
										<svg
											width="16"
											height="16"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
										>
											<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
											<circle cx="12" cy="12" r="3" />
										</svg>
									{/if}
								</button>
							</div>
						</div>
					{/if}
					<!-- Account Info: Balance & Usage -->
					{#if true}
						{@const info = accountInfo[key.id]}
						<div class="account-info-section">
							<div class="account-info-row">
								<!-- Balance -->
								<div class="balance-display">
									<div class="balance-label">
										<svg
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
										>
											<line x1="12" y1="1" x2="12" y2="23" />
											<path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
										</svg>
										{#if info?.balance?.label}
											{info.balance.label}
										{:else if key.provider === 'openai'}
											30-Day Spend
										{:else}
											Balance
										{/if}
									</div>
									{#if info?.loading}
										<div class="balance-value balance-loading">
											<span class="loading-dot"></span>
											<span class="loading-dot"></span>
											<span class="loading-dot"></span>
										</div>
									{:else if info?.balance?.available && info.balance.rateLimits}
										<div class="balance-value rate-limits">
											{#if info.balance.rateLimits.requestsRemaining != null}
												<span
													class="rate-limit-item"
													title="Requests: {info.balance.rateLimits.requestsRemaining?.toLocaleString()} / {info.balance.rateLimits.requestsLimit?.toLocaleString()}"
												>
													{info.balance.rateLimits.requestsRemaining?.toLocaleString()}/{info.balance.rateLimits.requestsLimit?.toLocaleString()}
													req
												</span>
											{/if}
											{#if info.balance.rateLimits.tokensRemaining != null}
												<span
													class="rate-limit-item"
													title="Tokens: {info.balance.rateLimits.tokensRemaining?.toLocaleString()} / {info.balance.rateLimits.tokensLimit?.toLocaleString()}"
												>
													{info.balance.rateLimits.tokensRemaining?.toLocaleString()}/{info.balance.rateLimits.tokensLimit?.toLocaleString()}
													tok
												</span>
											{/if}
										</div>
									{:else if info?.balance?.available}
										<div class="balance-value">
											{formatCurrency(info.balance.amount ?? 0)}
										</div>
									{:else if info?.balance}
										<div class="balance-value balance-na" title={info.balance.reason || ''}>
											N/A
										</div>
									{:else}
										<div class="balance-value balance-na">—</div>
									{/if}
									<button
										class="btn-icon-xs"
										on:click={() => loadAccountInfo(key.id)}
										aria-label="Refresh account info"
										disabled={info?.loading}
									>
										<svg
											width="12"
											height="12"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											class:spinning={info?.loading}
										>
											<polyline points="23 4 23 10 17 10" />
											<polyline points="1 20 1 14 7 14" />
											<path
												d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"
											/>
										</svg>
									</button>
								</div>

								<!-- Usage summary -->
								{#if info?.usage?.available && info.usage.totalRequests}
									<div class="usage-summary">
										<span class="usage-stat">
											<svg
												width="12"
												height="12"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
											>
												<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
											</svg>
											{info.usage.totalRequests} requests
										</span>
										{#if info.usage.totalCost}
											<span class="usage-stat">
												{formatCurrency(info.usage.totalCost)} spent
											</span>
										{/if}
									</div>
								{/if}
							</div>

							<!-- Usage Chart -->
							{#if info?.usage?.available && info.usage.daily.length > 0}
								{@const daily = info.usage.daily}
								{@const maxCost = Math.max(...daily.map((d) => d.cost), 0.01)}
								<div class="usage-chart-container">
									<div class="usage-chart-header">
										<span class="usage-chart-title">Daily Usage (30 days)</span>
										<span class="usage-chart-max">{formatCurrency(maxCost)} peak</span>
									</div>
									<div class="usage-chart">
										<svg
											viewBox="0 0 {daily.length * 14} 48"
											preserveAspectRatio="none"
											class="usage-bars"
										>
											{#each daily as day, i}
												{@const barHeight = Math.max((day.cost / maxCost) * 40, 1)}
												<rect
													x={i * 14 + 2}
													y={48 - barHeight - 4}
													width="10"
													height={barHeight}
													rx="2"
													class="usage-bar"
												>
													<title
														>{day.date}: {formatCurrency(day.cost)} ({day.requests} requests)</title
													>
												</rect>
											{/each}
										</svg>
									</div>
								</div>
							{:else if info && !info.loading && info.usage?.available}
								<div class="usage-chart-empty">No usage data in the last 30 days</div>
							{/if}
						</div>
					{/if}

					<div class="key-meta">
						<span>Added {new Date(key.createdAt).toLocaleDateString()}</span>
					</div>
				</div>
			{/each}
			<!-- Final drop slot (after last item) -->
			<div
				class="drop-slot"
				class:drop-slot-active={isDragging &&
					dropTargetIndex === keys.length &&
					dragFromIndex !== keys.length - 1}
			>
				<div class="drop-slot-inner">
					<span class="drop-slot-dot"></span>
					<span class="drop-slot-line"></span>
					<span class="drop-slot-text">Priority #{keys.length}</span>
					<span class="drop-slot-line"></span>
					<span class="drop-slot-dot"></span>
				</div>
			</div>
		</div>
		{#if savingOrder}
			<div class="save-order-indicator">
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					class="spinning"
				>
					<polyline points="23 4 23 10 17 10" />
					<polyline points="1 20 1 14 7 14" />
					<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
				</svg>
				Saving order...
			</div>
		{/if}
	{/if}
</div>

{#if showForm}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div class="modal-overlay" on:click={closeForm}>
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div class="modal modal-lg" on:click|stopPropagation>
			<div class="modal-header">
				<h2>{editingKey ? 'Edit AI Key' : 'Add New AI Key'}</h2>
				<button class="btn-close" on:click={closeForm} aria-label="Close">
					<svg
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M18 6L6 18M6 6l12 12" />
					</svg>
				</button>
			</div>
			<div class="modal-body">
				<div class="form-row">
					<div class="form-group">
						<label for="key-name">Key Name</label>
						<input
							id="key-name"
							type="text"
							bind:value={formData.name}
							class:error={errors.name}
							placeholder="e.g., OpenAI Production"
						/>
						{#if errors.name}
							<span class="error-message">{errors.name}</span>
						{/if}
					</div>

					<div class="form-group">
						<label for="provider">Provider</label>
						<select id="provider" bind:value={formData.provider}>
							{#each providers as provider}
								<option value={provider.value}>{provider.label}</option>
							{/each}
						</select>
					</div>
				</div>

				<div class="form-group">
					<label for="api-key">API Key</label>
					{#if formData.provider === 'wavespeed'}
						<div class="api-key-helper">
							<a
								href="https://wavespeed.ai/accesskey"
								target="_blank"
								rel="noopener noreferrer"
								class="btn btn-sm btn-outline"
							>
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
									<polyline points="15 3 21 3 21 9" />
									<line x1="10" y1="14" x2="21" y2="3" />
								</svg>
								Get Your API Key
							</a>
						</div>
					{/if}
					<input
						id="api-key"
						type="password"
						bind:value={formData.apiKey}
						class:error={errors.apiKey}
						placeholder={editingKey
							? 'Leave blank to keep existing'
							: formData.provider === 'wavespeed'
								? 'Paste your WaveSpeed API key'
								: 'Enter API key'}
					/>
					{#if errors.apiKey}
						<span class="error-message">{errors.apiKey}</span>
					{/if}
					{#if formData.provider === 'wavespeed'}
						<div class="wavespeed-validate">
							<button
								type="button"
								class="btn btn-sm btn-secondary"
								on:click={validateWavespeedKey}
								disabled={wavespeedValidating}
							>
								{#if wavespeedValidating}
									Validating...
								{:else}
									Validate Key
								{/if}
							</button>
							{#if wavespeedValidationResult}
								{#if wavespeedValidationResult.valid}
									<span class="validation-success">
										<svg
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
										>
											<polyline points="20 6 9 17 4 12" />
										</svg>
										Valid — Balance: ${wavespeedValidationResult.balance?.toFixed(2)}
									</span>
								{:else}
									<span class="validation-error">
										<svg
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
										>
											<circle cx="12" cy="12" r="10" />
											<line x1="15" y1="9" x2="9" y2="15" />
											<line x1="9" y1="9" x2="15" y2="15" />
										</svg>
										{wavespeedValidationResult.error || 'Invalid key'}
									</span>
								{/if}
							{/if}
						</div>
					{/if}
				</div>

				{#if formData.provider === 'openai' && (selectedTextModels.length > 0 || selectedVoiceModelsList.length > 0)}
					<div class="pricing-summary">
						<h4>
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
							</svg>
							Selected Models Pricing
						</h4>
						{#if selectedTextModels.length > 0}
							<div class="pricing-group">
								<span class="pricing-group-title">Text Models ({selectedTextModels.length})</span>
								{#each selectedTextModels as model}
									<div class="pricing-item">
										<span class="pricing-item-name">{model.id}</span>
										<span class="pricing-item-value">{formatPricing(model.pricing)}</span>
									</div>
								{/each}
							</div>
						{/if}
						{#if formData.voiceEnabled && selectedVoiceModelsList.length > 0}
							<div class="pricing-group">
								<span class="pricing-group-title"
									>Voice Models ({selectedVoiceModelsList.length})</span
								>
								{#each selectedVoiceModelsList as model}
									<div class="pricing-item">
										<span class="pricing-item-name">{model.id}</span>
										<span class="pricing-item-value">
											{model.pricing ? formatPricing(model.pricing) : ''}
											{model.pricing && model.audioPricing ? ' • ' : ''}
											{model.audioPricing ? formatAudioPricing(model.audioPricing) : ''}
										</span>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}

				{#if formData.provider === 'openai'}
					<div class="form-section">
						<div class="section-header">
							<h3>
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
								</svg>
								Text Models
							</h3>
							<span class="selection-count">{formData.models.length} selected</span>
						</div>
						{#if loadingModels}
							<div class="loading-state">
								<span class="loading-indicator">Loading models...</span>
							</div>
						{:else if modelsError}
							<span class="warning-message">{modelsError}</span>
						{:else}
							{#if modelsLoadedFromApi}
								<span class="success-hint">Models loaded from your OpenAI API</span>
							{/if}
							<div class="model-grid">
								{#each currentProviderModels as model}
									<button
										type="button"
										class="model-card"
										class:selected={formData.models.includes(model.id)}
										on:click={() => toggleModel(model.id)}
									>
										<div class="model-card-header">
											<span class="model-name">{model.id}</span>
											<label class="toggle-switch-sm">
												<input
													type="checkbox"
													checked={formData.models.includes(model.id)}
													on:click|stopPropagation={() => toggleModel(model.id)}
												/>
												<span class="slider-sm"></span>
											</label>
										</div>
										{#if model.pricing}
											<div class="model-pricing">
												<span class="price-tag">
													<span class="price-label">In:</span> ${model.pricing.input}/M
												</span>
												<span class="price-tag">
													<span class="price-label">Out:</span> ${model.pricing.output}/M
												</span>
												{#if model.pricing.cached}
													<span class="price-tag cached">
														<span class="price-label">Cached:</span> ${model.pricing.cached}/M
													</span>
												{/if}
											</div>
										{/if}
									</button>
								{/each}
							</div>
						{/if}
					</div>

					<div class="form-section">
						<div class="section-header">
							<h3>
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
									<path d="M19 10v2a7 7 0 0 1-14 0v-2" />
									<line x1="12" y1="19" x2="12" y2="23" />
									<line x1="8" y1="23" x2="16" y2="23" />
								</svg>
								Voice Models
							</h3>
							<div class="section-header-actions">
								<span class="selection-count">{formData.voiceModels.length} selected</span>
								<label class="toggle-switch">
									<input type="checkbox" bind:checked={formData.voiceEnabled} />
									<span class="slider"></span>
								</label>
							</div>
						</div>
						{#if formData.voiceEnabled}
							<p class="help-text-inline">
								Enable voice chat to allow users to interact with AI using speech (OpenAI Realtime
								API).
							</p>
							{#if loadingModels}
								<div class="loading-state">
									<span class="loading-indicator">Loading models...</span>
								</div>
							{:else}
								<div class="model-grid">
									{#each filteredVoiceModels as model}
										<button
											type="button"
											class="model-card voice-card"
											class:selected={formData.voiceModels.includes(model.id)}
											on:click={() => toggleVoiceModel(model.id)}
										>
											<div class="model-card-header">
												<span class="model-name">{model.id}</span>
												<label class="toggle-switch-sm">
													<input
														type="checkbox"
														checked={formData.voiceModels.includes(model.id)}
														on:click|stopPropagation={() => toggleVoiceModel(model.id)}
													/>
													<span class="slider-sm"></span>
												</label>
											</div>
											<div class="model-pricing">
												{#if model.pricing}
													<div class="price-row">
														<span class="price-category">Tokens:</span>
														<span class="price-tag">
															<span class="price-label">In:</span> ${model.pricing.input}/M
														</span>
														<span class="price-tag">
															<span class="price-label">Out:</span> ${model.pricing.output}/M
														</span>
													</div>
												{/if}
												{#if model.audioPricing}
													<div class="price-row">
														<span class="price-category">Audio:</span>
														<span class="price-tag audio">
															<span class="price-label">In:</span> ${model.audioPricing.input}/min
														</span>
														<span class="price-tag audio">
															<span class="price-label">Out:</span> ${model.audioPricing.output}/min
														</span>
													</div>
												{/if}
											</div>
										</button>
									{/each}
								</div>
							{/if}
						{:else}
							<p class="help-text-inline disabled">
								Toggle voice models on to enable real-time voice conversations.
							</p>
						{/if}
					</div>

					<!-- Video Models Section -->
					<div class="form-section">
						<div class="section-header">
							<h3>
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<rect x="2" y="4" width="20" height="16" rx="2" />
									<polygon points="10,9 16,12 10,15" />
								</svg>
								Video Generation
							</h3>
							<div class="section-header-actions">
								<span class="selection-count">{formData.videoModels.length} selected</span>
								<label class="toggle-switch">
									<input type="checkbox" bind:checked={formData.videoEnabled} />
									<span class="slider"></span>
								</label>
							</div>
						</div>
						{#if formData.videoEnabled}
							<p class="help-text-inline">
								Enable video generation to allow users to create AI-generated videos from text
								prompts.
							</p>
							<div class="model-grid">
								{#each videoModelOptions as model}
									<button
										type="button"
										class="model-card video-card"
										class:selected={formData.videoModels.includes(model.id)}
										on:click={() => toggleVideoModel(model.id)}
									>
										<div class="model-card-header">
											<span class="model-name">{model.displayName}</span>
											<label class="toggle-switch-sm">
												<input
													type="checkbox"
													checked={formData.videoModels.includes(model.id)}
													on:click|stopPropagation={() => toggleVideoModel(model.id)}
												/>
												<span class="slider-sm"></span>
											</label>
										</div>
										<div class="model-description">
											{model.description}
										</div>
										{#if model.pricing}
											<div class="model-pricing">
												<div class="price-row">
													<span class="price-tag">
														<span class="price-label">{model.resolutions}:</span>
														${model.pricing.perSecond.toFixed(2)}/sec
													</span>
												</div>
												{#if model.pricing.perSecondHighRes}
													<div class="price-row">
														<span class="price-tag">
															<span class="price-label">1080p+:</span>
															${model.pricing.perSecondHighRes.toFixed(2)}/sec
														</span>
													</div>
												{/if}
											</div>
										{/if}
									</button>
								{/each}
							</div>
						{:else}
							<p class="help-text-inline disabled">
								Toggle video generation on to enable AI video creation from prompts.
							</p>
						{/if}
					</div>
				{:else if formData.provider === 'wavespeed'}
					<!-- WaveSpeed models -->
					<div class="form-section">
						<div class="section-header">
							<h3>
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<rect x="2" y="4" width="20" height="16" rx="2" />
									<polygon points="10,9 16,12 10,15" />
								</svg>
								Video &amp; Image Models
							</h3>
							<div class="section-header-actions">
								<span class="selection-count">{formData.videoModels.length} selected</span>
								<label class="toggle-switch">
									<input type="checkbox" bind:checked={formData.videoEnabled} />
									<span class="slider"></span>
								</label>
							</div>
						</div>
						{#if formData.videoEnabled}
							<p class="help-text-inline">
								Select which WaveSpeed models to enable for video and image generation.
								{#if wavespeedPricingLoading}
									<span class="loading-hint">Loading pricing...</span>
								{:else if wavespeedPricingCached}
									<button
										type="button"
										class="refresh-pricing-btn"
										on:click|preventDefault={() => loadWaveSpeedPricing(true)}
									>
										↻ Refresh pricing
									</button>
								{/if}
							</p>
							{@const videoModels = wavespeedModelOptions.filter((m) => m.category === 'video')}
							{@const imageModels = wavespeedModelOptions.filter((m) => m.category === 'image')}
							{#if videoModels.length > 0}
								<div class="model-category-label">Video Models</div>
								<div class="model-grid">
									{#each videoModels as model}
										{@const price = getWaveSpeedPrice(model.id)}
										{@const modelType = getWaveSpeedModelType(model.id)}
										{@const isLivePrice =
											wavespeedPricing.length > 0 && getWaveSpeedLivePrice(model.id) !== null}
										<button
											type="button"
											class="model-card video-card"
											class:selected={formData.videoModels.includes(model.id)}
											on:click={() => toggleVideoModel(model.id)}
										>
											<div class="model-card-header">
												<span class="model-name">{model.displayName}</span>
												<label class="toggle-switch-sm">
													<input
														type="checkbox"
														checked={formData.videoModels.includes(model.id)}
														on:click|stopPropagation={() => toggleVideoModel(model.id)}
													/>
													<span class="slider-sm"></span>
												</label>
											</div>
											<div class="model-description">
												{model.description}
											</div>
											{#if price !== null}
												<div class="model-pricing">
													<span class="price-tag wavespeed">
														{#if isLivePrice}
															${price}{modelType?.includes('video') ? '/sec' : '/run'}
														{:else}
															~${price}/run
														{/if}
													</span>
												</div>
											{/if}
										</button>
									{/each}
								</div>
							{/if}
							{#if imageModels.length > 0}
								<div class="model-category-label">Image Models</div>
								<div class="model-grid">
									{#each imageModels as model}
										{@const price = getWaveSpeedPrice(model.id)}
										{@const isLivePrice =
											wavespeedPricing.length > 0 && getWaveSpeedLivePrice(model.id) !== null}
										<button
											type="button"
											class="model-card video-card"
											class:selected={formData.videoModels.includes(model.id)}
											on:click={() => toggleVideoModel(model.id)}
										>
											<div class="model-card-header">
												<span class="model-name">{model.displayName}</span>
												<label class="toggle-switch-sm">
													<input
														type="checkbox"
														checked={formData.videoModels.includes(model.id)}
														on:click|stopPropagation={() => toggleVideoModel(model.id)}
													/>
													<span class="slider-sm"></span>
												</label>
											</div>
											<div class="model-description">
												{model.description}
											</div>
											{#if price !== null}
												<div class="model-pricing">
													<span class="price-tag wavespeed">
														{#if isLivePrice}
															${price}/image
														{:else}
															~${price}/image
														{/if}
													</span>
												</div>
											{/if}
										</button>
									{/each}
								</div>
							{/if}
						{:else}
							<p class="help-text-inline disabled">
								Toggle on to enable WaveSpeed video and image generation models.
							</p>
						{/if}
					</div>
				{:else}
					<!-- Non-OpenAI providers -->
					<div class="form-section">
						<div class="section-header">
							<h3>Models</h3>
							<span class="selection-count">{formData.models.length} selected</span>
						</div>
						<div class="model-grid">
							{#each currentProviderModels as model}
								<button
									type="button"
									class="model-card"
									class:selected={formData.models.includes(model.id)}
									on:click={() => toggleModel(model.id)}
								>
									<div class="model-card-header">
										<span class="model-name">{model.displayName || model.id}</span>
										<label class="toggle-switch-sm">
											<input
												type="checkbox"
												checked={formData.models.includes(model.id)}
												on:click|stopPropagation={() => toggleModel(model.id)}
											/>
											<span class="slider-sm"></span>
										</label>
									</div>
									<span class="model-api-id">{model.id}</span>
									{#if model.pricing}
										<div class="model-pricing">
											<span class="price-tag">
												<span class="price-label">In:</span> ${model.pricing.input}/M
											</span>
											<span class="price-tag">
												<span class="price-label">Out:</span> ${model.pricing.output}/M
											</span>
										</div>
									{/if}
								</button>
							{/each}
						</div>
					</div>
				{/if}

				{#if errors.submit}
					<div class="error-message submit-error">{errors.submit}</div>
				{/if}
			</div>
			<div class="modal-footer">
				<button class="btn btn-secondary" on:click={closeForm}>Cancel</button>
				<button class="btn btn-primary" on:click={saveKey}>
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
						<polyline points="17 21 17 13 7 13 7 21" />
						<polyline points="7 3 7 8 15 8" />
					</svg>
					Save Key
				</button>
			</div>
		</div>
	</div>
{/if}

{#if showDeleteConfirm}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div class="modal-overlay" on:click={closeDeleteConfirm}>
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div class="modal modal-sm" on:click|stopPropagation>
			<div class="modal-header">
				<h2>Confirm Deletion</h2>
			</div>
			<div class="modal-body">
				<p>Are you sure you want to delete this AI provider key? This action cannot be undone.</p>
			</div>
			<div class="modal-footer">
				<button class="btn btn-secondary" on:click={closeDeleteConfirm}>Cancel</button>
				<button class="btn btn-danger" on:click={confirmDelete}>Confirm</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.ai-keys-page {
		max-width: 1000px;
	}

	.page-header {
		margin-bottom: var(--spacing-lg);
	}

	.page-header h1 {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--color-text);
		margin-bottom: var(--spacing-sm);
	}

	.page-description {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	.page-actions {
		margin-bottom: var(--spacing-xl);
	}

	.btn {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		font-weight: 500;
		border: 1px solid transparent;
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.btn-primary {
		background: var(--color-primary);
		color: var(--color-background);
	}

	.btn-primary:hover {
		opacity: 0.9;
	}

	.btn-secondary {
		background: var(--color-surface);
		color: var(--color-text);
		border-color: var(--color-border);
	}

	.btn-secondary:hover {
		background: var(--color-background);
	}

	.btn-sm {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: 0.813rem;
	}

	.btn-outline {
		background: transparent;
		color: var(--color-primary);
		border-color: var(--color-primary);
	}

	.btn-outline:hover {
		background: var(--color-primary);
		color: var(--color-background);
	}

	.btn-danger {
		background: #ef4444;
		color: white;
	}

	.btn-danger:hover {
		background: #dc2626;
	}

	.btn-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: var(--radius-md);
		background: transparent;
		border: none;
		cursor: pointer;
		color: var(--color-text-secondary);
		transition: all var(--transition-fast);
	}

	.btn-icon:hover {
		background: var(--color-surface);
		color: var(--color-text);
	}

	.btn-icon.btn-danger:hover {
		background: #fef2f2;
		color: #ef4444;
	}

	.btn-icon-sm {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-sm);
		background: transparent;
		border: none;
		cursor: pointer;
		color: var(--color-text-secondary);
		transition: all var(--transition-fast);
	}

	.btn-icon-sm:hover {
		background: var(--color-surface);
		color: var(--color-text);
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--spacing-4xl);
		text-align: center;
		color: var(--color-text-secondary);
	}

	.empty-state svg {
		margin-bottom: var(--spacing-lg);
		opacity: 0.5;
	}

	.empty-state h3 {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: var(--spacing-sm);
	}

	.keys-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.key-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
	}

	.key-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: var(--spacing-md);
		gap: var(--spacing-sm);
		flex-wrap: wrap;
	}

	.key-info {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.key-info h3 {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.key-badges {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		flex-wrap: wrap;
	}

	.key-provider,
	.key-voice-badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
		text-transform: capitalize;
	}

	.key-provider {
		background: var(--color-background);
		color: var(--color-text-secondary);
	}

	.key-voice-badge {
		background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
		color: var(--color-background);
		font-weight: 500;
	}

	.key-actions {
		display: flex;
		gap: var(--spacing-xs);
	}

	.key-field {
		margin-bottom: var(--spacing-md);
	}

	.key-field .label {
		display: block;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text-secondary);
		margin-bottom: var(--spacing-xs);
	}

	.key-value {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm);
		background: var(--color-background);
		border-radius: var(--radius-md);
		font-family: monospace;
		font-size: 0.875rem;
	}

	.key-value span {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.key-meta {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
	}

	/* Account Info Section */
	.account-info-section {
		margin-top: var(--spacing-md);
		padding-top: var(--spacing-md);
		border-top: 1px solid var(--color-border);
	}

	.account-info-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-md);
		flex-wrap: wrap;
	}

	.balance-display {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.balance-label {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: 500;
	}

	.balance-value {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--color-text);
		font-variant-numeric: tabular-nums;
	}

	.balance-loading {
		display: flex;
		gap: 3px;
		align-items: center;
	}

	.loading-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--color-text-secondary);
		animation: dotPulse 1.2s ease-in-out infinite;
	}

	.loading-dot:nth-child(2) {
		animation-delay: 0.2s;
	}

	.loading-dot:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes dotPulse {
		0%,
		80%,
		100% {
			opacity: 0.3;
		}
		40% {
			opacity: 1;
		}
	}

	.balance-na {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.rate-limits {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 0.85rem;
		font-weight: 600;
	}

	.rate-limit-item {
		color: var(--color-text);
		font-variant-numeric: tabular-nums;
	}

	.btn-icon-xs {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: var(--radius-sm);
		background: transparent;
		border: none;
		cursor: pointer;
		color: var(--color-text-secondary);
		transition: all var(--transition-fast);
		padding: 0;
	}

	.btn-icon-xs:hover {
		background: var(--color-background);
		color: var(--color-text);
	}

	.btn-icon-xs:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.spinning {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.usage-summary {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.usage-stat {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 0.8rem;
		color: var(--color-text-secondary);
	}

	/* Usage Chart */
	.usage-chart-container {
		margin-top: var(--spacing-sm);
	}

	.usage-chart-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--spacing-xs);
	}

	.usage-chart-title {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.usage-chart-max {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.usage-chart {
		width: 100%;
		height: 48px;
		overflow: hidden;
		border-radius: var(--radius-sm);
		background: var(--color-background);
	}

	.usage-bars {
		width: 100%;
		height: 100%;
	}

	.usage-bar {
		fill: var(--color-primary);
		opacity: 0.7;
		transition: opacity var(--transition-fast);
	}

	.usage-bar:hover {
		opacity: 1;
	}

	.usage-chart-empty {
		margin-top: var(--spacing-sm);
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: flex-end;
		justify-content: center;
		z-index: 1100;
		padding: 0;
	}

	.modal {
		background: var(--color-surface);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		width: 100%;
		max-width: 500px;
		max-height: 90vh;
		overflow: auto;
	}

	.modal-sm {
		max-width: 400px;
	}

	@media (min-width: 640px) {
		.modal-overlay {
			align-items: center;
			padding: var(--spacing-lg);
		}

		.modal {
			border-radius: var(--radius-lg);
			width: 90%;
		}
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
	}

	.modal-header h2 {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.btn-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-md);
		background: transparent;
		border: none;
		cursor: pointer;
		color: var(--color-text-secondary);
		transition: all var(--transition-fast);
	}

	.btn-close:hover {
		background: var(--color-background);
		color: var(--color-text);
	}

	.modal-body {
		padding: var(--spacing-lg);
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: var(--spacing-sm);
		padding: var(--spacing-lg);
		border-top: 1px solid var(--color-border);
	}

	.form-section {
		margin-top: var(--spacing-xl);
		padding-top: var(--spacing-lg);
		border-top: 1px solid var(--color-border);
	}

	.form-section h3 {
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: var(--spacing-md);
	}

	.form-group {
		margin-bottom: var(--spacing-md);
	}

	.form-group label {
		display: block;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text);
		margin-bottom: var(--spacing-xs);
	}

	.form-group input,
	.form-group select {
		width: 100%;
		padding: var(--spacing-sm);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-background);
		color: var(--color-text);
		font-size: 1rem;
	}

	.form-group input:focus,
	.form-group select:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.form-group input.error {
		border-color: #ef4444;
	}

	.error-message {
		display: block;
		margin-top: var(--spacing-xs);
		font-size: 0.875rem;
		color: #ef4444;
	}

	.warning-message {
		display: block;
		margin-top: var(--spacing-xs);
		font-size: 0.813rem;
		color: #f59e0b;
	}

	.success-hint {
		display: block;
		margin-top: var(--spacing-xs);
		font-size: 0.813rem;
		color: #10b981;
	}

	.loading-indicator {
		font-size: 0.813rem;
		color: var(--color-text-secondary);
		font-weight: 400;
		margin-left: var(--spacing-xs);
	}

	.pricing-summary {
		margin-bottom: var(--spacing-md);
		padding: var(--spacing-md);
		background: linear-gradient(
			135deg,
			var(--color-primary-soft, rgba(99, 102, 241, 0.1)),
			var(--color-secondary-soft, rgba(139, 92, 246, 0.1))
		);
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
	}

	.pricing-summary h4 {
		margin: 0 0 var(--spacing-sm) 0;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.toggle-switch {
		position: relative;
		display: inline-block;
		width: 48px;
		height: 24px;
		margin-right: var(--spacing-sm);
	}

	.toggle-switch input {
		opacity: 0;
		width: 0;
		height: 0;
	}

	.slider {
		position: absolute;
		cursor: pointer;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: var(--color-border);
		transition: var(--transition-fast);
		border-radius: 24px;
	}

	.slider:before {
		position: absolute;
		content: '';
		height: 18px;
		width: 18px;
		left: 3px;
		bottom: 3px;
		background-color: var(--color-background);
		transition: var(--transition-fast);
		border-radius: 50%;
	}

	input:checked + .slider {
		background-color: var(--color-primary);
	}

	input:checked + .slider:before {
		transform: translateX(24px);
	}

	.toggle-switch:hover .slider {
		opacity: 0.9;
	}

	select:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* New styles for multi-select model interface */
	.modal-lg {
		max-width: 700px;
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--spacing-md);
	}

	.section-header {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-md);
	}

	.section-header h3 {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.section-header-actions {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.selection-count {
		font-size: 0.813rem;
		color: var(--color-text-secondary);
		background: var(--color-background);
		padding: 2px 8px;
		border-radius: var(--radius-sm);
	}

	.model-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--spacing-sm);
		max-height: 480px;
		overflow-y: auto;
		padding: var(--spacing-xs);
	}

	.model-card {
		display: flex;
		flex-direction: column;
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: all var(--transition-fast);
		text-align: left;
		gap: 0;
	}

	.model-card:hover {
		border-color: var(--color-primary);
		background: var(--color-surface);
	}

	.model-card.selected {
		border-color: var(--color-primary);
		background: linear-gradient(
			135deg,
			var(--color-primary-soft, rgba(99, 102, 241, 0.1)),
			var(--color-secondary-soft, rgba(139, 92, 246, 0.05))
		);
	}

	.model-card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.model-name {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text);
		flex: 1;
		word-break: break-word;
	}

	.model-api-id {
		font-size: 0.688rem;
		color: var(--color-text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		margin-top: 2px;
		opacity: 0.7;
		font-family: monospace;
	}

	.model-pricing {
		display: flex;
		flex-direction: row;
		gap: var(--spacing-xs);
		margin-top: var(--spacing-xs);
	}

	.price-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		flex-wrap: wrap;
	}

	.price-category {
		font-size: 0.688rem;
		color: var(--color-text-secondary);
		min-width: 45px;
	}

	.price-tag {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		background: var(--color-surface);
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		font-family: monospace;
	}

	.price-tag.cached {
		background: rgba(16, 185, 129, 0.1);
		color: #10b981;
	}

	.price-tag.audio {
		background: rgba(139, 92, 246, 0.1);
		color: var(--color-secondary, #8b5cf6);
	}

	.price-tag.wavespeed {
		background: rgba(59, 130, 246, 0.1);
		color: var(--color-primary, #3b82f6);
	}

	.price-label {
		font-weight: 500;
		opacity: 0.6;
		font-family: inherit;
	}

	.loading-hint {
		color: var(--color-text-secondary);
		font-style: italic;
		font-size: 0.8rem;
	}

	.refresh-pricing-btn {
		background: none;
		border: none;
		color: var(--color-primary);
		font-size: 0.8rem;
		cursor: pointer;
		padding: 0;
		margin-left: var(--spacing-xs);
		text-decoration: underline;
	}

	.refresh-pricing-btn:hover {
		opacity: 0.8;
	}

	.toggle-switch-sm {
		position: relative;
		display: inline-block;
		width: 32px;
		height: 18px;
		flex-shrink: 0;
	}

	.toggle-switch-sm input {
		opacity: 0;
		width: 0;
		height: 0;
	}

	.slider-sm {
		position: absolute;
		cursor: pointer;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: var(--color-border);
		transition: var(--transition-fast);
		border-radius: 18px;
	}

	.slider-sm:before {
		position: absolute;
		content: '';
		height: 14px;
		width: 14px;
		left: 2px;
		bottom: 2px;
		background-color: var(--color-background);
		transition: var(--transition-fast);
		border-radius: 50%;
	}

	.toggle-switch-sm input:checked + .slider-sm {
		background-color: var(--color-primary);
	}

	.toggle-switch-sm input:checked + .slider-sm:before {
		transform: translateX(14px);
	}

	.loading-state {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--spacing-xl);
		color: var(--color-text-secondary);
	}

	.help-text-inline {
		font-size: 0.813rem;
		color: var(--color-text-secondary);
		margin-bottom: var(--spacing-md);
	}

	.help-text-inline.disabled {
		opacity: 0.6;
		font-style: italic;
	}

	.voice-card {
		min-height: 80px;
	}

	.pricing-summary h4 {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.pricing-group {
		margin-bottom: var(--spacing-sm);
	}

	.pricing-group:last-child {
		margin-bottom: 0;
	}

	.pricing-group-title {
		display: block;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: var(--spacing-xs);
	}

	.pricing-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 2px 0;
		font-size: 0.813rem;
	}

	.pricing-item-name {
		color: var(--color-text);
		font-weight: 500;
	}

	.pricing-item-value {
		color: var(--color-text-secondary);
		font-family: monospace;
	}

	.submit-error {
		margin-top: var(--spacing-md);
		padding: var(--spacing-sm);
		background: rgba(239, 68, 68, 0.1);
		border-radius: var(--radius-md);
	}

	.key-model-count {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
		background: var(--color-primary);
		color: var(--color-background);
		opacity: 0.8;
	}

	@media (min-width: 601px) {
		.form-row {
			grid-template-columns: 1fr 1fr;
		}

		.model-grid {
			grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		}

		.section-header {
			flex-direction: row;
			align-items: center;
		}
	}

	@media (min-width: 769px) {
		.page-header {
			margin-bottom: var(--spacing-2xl);
		}

		.page-header h1 {
			font-size: 2rem;
		}

		.page-description {
			font-size: 1.125rem;
		}
	}

	/* WaveSpeed-specific styles */
	.api-key-helper {
		display: flex;
		margin-bottom: var(--spacing-sm);
	}

	.api-key-helper a {
		text-decoration: none;
	}

	.wavespeed-validate {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-top: var(--spacing-sm);
	}

	.validation-success {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 0.813rem;
		color: var(--color-success, #22c55e);
		font-weight: 500;
	}

	.validation-error {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 0.813rem;
		color: var(--color-error, #ef4444);
		font-weight: 500;
	}

	.model-category-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-top: var(--spacing-md);
		margin-bottom: var(--spacing-sm);
	}

	.model-description {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		margin-top: 4px;
	}

	/* ── Drag & Drop ── */
	.keys-list {
		position: relative;
	}

	.key-title-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.drag-handle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		background: transparent;
		color: var(--color-text-secondary);
		cursor: grab;
		border-radius: var(--radius-sm);
		transition:
			color 0.15s ease,
			background 0.15s ease;
		flex-shrink: 0;
		touch-action: none; /* critical: prevents browser scroll/pan on touch */
		-webkit-user-select: none;
		user-select: none;
		padding: 0;
	}

	.drag-handle:hover {
		background: var(--color-background);
		color: var(--color-primary);
	}

	.drag-handle:active {
		cursor: grabbing;
	}

	.priority-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 28px;
		height: 22px;
		padding: 0 6px;
		border-radius: var(--radius-sm);
		background: var(--color-primary);
		color: var(--color-background);
		font-size: 0.75rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		flex-shrink: 0;
		letter-spacing: -0.02em;
	}

	/* Card drag states */
	.key-card {
		transition:
			transform 0.25s cubic-bezier(0.2, 0, 0, 1),
			opacity 0.2s ease,
			box-shadow 0.2s ease;
		position: relative;
	}

	.key-card.is-dragged {
		opacity: 0.25;
		transform: scale(0.97);
		box-shadow: none;
	}

	/* ── Drop Slots ──
	   Always in the DOM — height transitions from 0 to visible.
	   No conditional {#if} blocks means no layout thrashing during drag.
	*/
	.drop-slot {
		height: 0;
		overflow: hidden;
		transition: height 0.2s cubic-bezier(0.2, 0, 0, 1);
	}

	.drop-slot-active {
		height: 36px;
	}

	.drop-slot-inner {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 0;
		opacity: 0;
		transform: scaleX(0.7);
		transition:
			opacity 0.15s ease 0.05s,
			transform 0.2s cubic-bezier(0.2, 0, 0, 1) 0.05s;
	}

	.drop-slot-active .drop-slot-inner {
		opacity: 1;
		transform: scaleX(1);
	}

	.drop-slot-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-primary);
		flex-shrink: 0;
		animation: none;
	}

	.drop-slot-active .drop-slot-dot {
		animation: slotDotPulse 1s ease-in-out infinite;
	}

	@keyframes slotDotPulse {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.4);
		}
	}

	.drop-slot-line {
		flex: 1;
		height: 2px;
		background: var(--color-primary);
		border-radius: 1px;
	}

	.drop-slot-text {
		font-size: 0.688rem;
		font-weight: 700;
		color: var(--color-primary);
		white-space: nowrap;
		padding: 2px 10px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-primary);
		border-radius: var(--radius-sm);
		letter-spacing: 0.01em;
	}

	/* Overlay during drag — subtle darken for non-dragged cards */
	.keys-list.is-dragging .key-card:not(.is-dragged) {
		transition:
			transform 0.25s cubic-bezier(0.2, 0, 0, 1),
			opacity 0.2s ease;
	}

	/* Save order indicator */
	.save-order-indicator {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		justify-content: center;
		padding: var(--spacing-sm) var(--spacing-md);
		margin-top: var(--spacing-sm);
		color: var(--color-text-secondary);
		font-size: 0.813rem;
		animation: fadeIn 0.2s ease;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	/* Mobile responsive, larger hit targets */
	@media (max-width: 600px) {
		.key-header {
			flex-direction: column;
			gap: var(--spacing-sm);
		}

		.key-actions {
			align-self: flex-end;
		}

		.key-title-row h3 {
			font-size: 1rem;
		}

		.drag-handle {
			width: 44px;
			height: 44px;
		}

		.account-info-row {
			flex-direction: column;
			align-items: flex-start;
		}

		.drop-slot-active {
			height: 40px;
		}
	}
</style>
