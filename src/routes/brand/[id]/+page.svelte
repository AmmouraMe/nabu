<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { PageData } from './$types';
	import type { BrandProfile } from '$lib/types/onboarding';
	import type { BrandMediaAsset } from '$lib/types/brand-assets';
	import BrandFieldCard from '$lib/components/BrandFieldCard.svelte';
	import BrandFieldHistory from '$lib/components/BrandFieldHistory.svelte';
	import BrandTextPicker from '$lib/components/BrandTextPicker.svelte';
	import BrandColorEditor from '$lib/components/BrandColorEditor.svelte';
	import MediaGallery from '$lib/components/MediaGallery.svelte';
	import AITextQuickGenerate from '$lib/components/AITextQuickGenerate.svelte';
	import TextRevisionHistory from '$lib/components/TextRevisionHistory.svelte';
	import { labelToKey } from '$lib/utils/text';
	import {
		FIELD_TO_TEXT_MAPPING,
		FIELD_TO_PRESET_KEY,
		IMAGE_FIELDS,
		getMatchingProfileField
	} from '$lib/services/brand';
	import { getEmptyTextFields } from '$lib/services/brand-ai-fill';

	export let data: PageData;

	// ─── Types ───────────────────────────────────────────────

	interface BrandFieldItem {
		key: string;
		label: string;
		value: unknown;
		type: 'text' | 'color' | 'list' | 'object' | 'archetype';
	}

	interface BrandSection {
		id: string;
		title: string;
		icon: string;
		fields: BrandFieldItem[];
	}

	interface TextAsset {
		id: string;
		brandProfileId: string;
		category: string;
		key: string;
		label: string;
		value: string;
		language: string;
		sortOrder: number;
		createdAt: string;
		updatedAt: string;
	}

	interface MediaAsset {
		id: string;
		brandProfileId: string;
		mediaType: 'image' | 'audio' | 'video';
		category: string;
		name: string;
		description?: string;
		url?: string;
		r2Key?: string;
		mimeType?: string;
		fileSize?: number;
		width?: number;
		height?: number;
		durationSeconds?: number;
		tags?: string[];
		sortOrder: number;
		isPrimary: boolean;
		createdAt: string;
		updatedAt: string;
	}

	interface AssetSummary {
		textCount: number;
		imageCount: number;
		audioCount: number;
		videoCount: number;
		videoGenerationsCount: number;
		totalCount: number;
	}

	interface VideoItem {
		id: string;
		prompt: string;
		provider: string;
		model: string;
		status: string;
		videoUrl: string | null;
		thumbnailUrl: string | null;
		r2Key: string | null;
		duration: number | null;
		aspectRatio: string | null;
		cost: number | null;
		error: string | null;
		createdAt: string;
		completedAt: string | null;
	}

	// ─── State ───────────────────────────────────────────────

	let profile: BrandProfile | null = null;
	let sections: BrandSection[] = [];
	let isLoading = true;
	let error: string | null = null;

	// Section collapse state
	let collapsedSections: Record<string, boolean> = {};

	function toggleSection(sectionId: string) {
		collapsedSections[sectionId] = !collapsedSections[sectionId];
		collapsedSections = collapsedSections;
	}

	$: visualSection = sections.find((s) => s.id === 'visual') ?? null;
	$: otherSections = sections.filter((s) => s.id !== 'visual');

	// Tab navigation
	let activeTab: 'profile' | 'text' | 'images' | 'audio' | 'videos' = 'profile';

	// Field history modal
	let historyFieldKey: string | null = null;
	let historyFieldLabel: string | null = null;

	// Editing state (profile fields)
	let editingField: string | null = null;
	let editValue = '';
	let isSaving = false;

	// Text picker state
	let pickerFieldKey: string | null = null;
	let pickerFieldLabel: string | null = null;

	// Asset state
	let assetSummary: AssetSummary | null = null;
	let textAssets: TextAsset[] = [];
	let imageAssets: BrandMediaAsset[] = [];
	let audioAssets: BrandMediaAsset[] = [];
	let videoAssets: BrandMediaAsset[] = [];
	let brandVideos: VideoItem[] = [];
	let assetsLoading = false;

	// Text asset creation
	let showAddText = false;
	let showAITextGenerate = false;
	let newTextCategory = 'names';
	let selectedPresetKey = ''; // '' = pick one, '__custom__' = custom entry
	let customLabel = '';
	let newTextValue = '';

	// Derived key/label from preset or custom entry
	$: currentPresets = aiPresets;
	$: selectedPreset =
		selectedPresetKey && selectedPresetKey !== '__custom__'
			? (currentPresets.find((p) => p.key === selectedPresetKey) ?? null)
			: null;
	$: newTextLabel = selectedPreset ? selectedPreset.label : customLabel;
	$: newTextKey = selectedPreset ? selectedPreset.key : labelToKey(customLabel);

	// Text editing
	let editingTextId: string | null = null;
	let editTextValue = '';

	// Pending text edit — set when navigating from profile field to auto-open editor
	let pendingTextEdit: { category: string; presetKey: string; fieldValue?: string } | null = null;

	// AI fill empty fields
	let aiFilling = false;
	let aiFillResults: Array<{
		field: string;
		label: string;
		status: 'success' | 'error';
		value?: string;
		error?: string;
	}> | null = null;
	let aiFillMessage: string | null = null;

	$: emptyTextFieldCount = profile ? getEmptyTextFields(profile).length : 0;

	// Text revision history modal
	let textHistoryId: string | null = null;
	let textHistoryLabel: string | null = null;

	// Push-to-profile state
	let pushingTextId: string | null = null;
	let pushSuccessMessage: string | null = null;

	// AI text generation
	let aiGenerating = false;
	let aiError: string | null = null;
	let showAiPrompt = false;
	let aiCustomPrompt = '';
	let aiPresets: Array<{ key: string; label: string; promptTemplate: string }> = [];
	let aiEditGenerating = false;
	let aiEditCustomPrompt = '';
	let showAiEditPrompt = false;

	// Text categories config
	const textCategoryInfo: Record<string, { label: string; icon: string; description: string }> = {
		names: { label: 'Names', icon: '🏷️', description: 'Brand name, legal name, DBA, abbreviation' },
		messaging: {
			label: 'Messaging',
			icon: '💬',
			description: 'Tagline, slogan, elevator pitch, value proposition'
		},
		descriptions: {
			label: 'Descriptions',
			icon: '📝',
			description: 'Short bio, long bio, boilerplate, about us'
		},
		legal: {
			label: 'Legal',
			icon: '⚖️',
			description: 'Copyright notice, trademark text, disclaimers'
		},
		social: {
			label: 'Social',
			icon: '📱',
			description: 'Social media bios — Twitter, Instagram, LinkedIn'
		},
		voice: { label: 'Voice', icon: '🎤', description: 'Tone guidelines, vocabulary, key phrases' }
	};

	// Completion stats
	$: filledFields = sections.reduce((count, section) => {
		return count + section.fields.filter((f) => f.value != null && f.value !== '').length;
	}, 0);

	$: totalFields = sections.reduce((count, section) => count + section.fields.length, 0);

	$: completionPercent = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;

	// Group text assets by category
	$: textsByCategory = textAssets.reduce(
		(groups, text) => {
			if (!groups[text.category]) groups[text.category] = [];
			groups[text.category].push(text);
			return groups;
		},
		{} as Record<string, TextAsset[]>
	);

	onMount(async () => {
		await loadProfile();
		loadAssetSummary();
	});

	let initialLoadDone = false;

	async function loadProfile() {
		if (!initialLoadDone) isLoading = true;
		error = null;
		try {
			const res = await fetch(`/api/brand/profile?id=${data.brandId}`);
			if (!res.ok) {
				if (res.status === 404) {
					error = 'Brand not found';
					return;
				}
				throw new Error('Failed to load brand profile');
			}
			const result = await res.json();
			profile = result.profile;
			sections = result.sections || [];
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load';
		} finally {
			isLoading = false;
			initialLoadDone = true;
		}
	}

	function openHistory(fieldKey: string, fieldLabel: string) {
		historyFieldKey = fieldKey;
		historyFieldLabel = fieldLabel;
	}

	function closeHistory() {
		historyFieldKey = null;
		historyFieldLabel = null;
	}

	function startEditing(fieldKey: string, currentValue: unknown) {
		// If the field is an image field, navigate to the Images tab
		if (IMAGE_FIELDS.has(fieldKey)) {
			switchTab('images');
			return;
		}

		// If the field has a text preset mapping, navigate to the Text tab
		const preset = FIELD_TO_PRESET_KEY[fieldKey];
		if (preset) {
			const stringValue =
				currentValue != null && typeof currentValue === 'string' ? currentValue : undefined;
			navigateToTextAsset(preset.category, preset.presetKey, stringValue);
			return;
		}

		// No text mapping — use inline editing
		editingField = fieldKey;
		if (currentValue == null) {
			editValue = '';
		} else if (typeof currentValue === 'string') {
			editValue = currentValue;
		} else if (Array.isArray(currentValue)) {
			editValue = currentValue.join(', ');
		} else {
			editValue = JSON.stringify(currentValue, null, 2);
		}
	}

	function navigateToTextAsset(category: string, presetKey: string, fieldValue?: string) {
		// Set pending edit so loadTabAssets can find and open the right text asset
		pendingTextEdit = { category, presetKey, fieldValue };
		showAddText = false;
		switchTab('text');
	}

	function cancelEditing() {
		editingField = null;
		editValue = '';
	}

	function openTextPicker(fieldKey: string, fieldLabel: string) {
		pickerFieldKey = fieldKey;
		pickerFieldLabel = fieldLabel;
	}

	function closeTextPicker() {
		pickerFieldKey = null;
		pickerFieldLabel = null;
	}

	async function handleTextPicked(event: CustomEvent<{ value: string; label: string }>) {
		if (!profile || !pickerFieldKey) return;
		const fieldKey = pickerFieldKey;
		closeTextPicker();

		try {
			const res = await fetch('/api/brand/update-field', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					profileId: profile.id,
					fieldName: fieldKey,
					newValue: event.detail.value,
					changeSource: 'manual'
				})
			});

			if (!res.ok) throw new Error('Failed to save');
			await loadProfile();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to apply text';
		}
	}

	async function saveField(fieldKey: string, fieldType: string, valueFromEvent?: string) {
		if (!profile || isSaving) return;
		isSaving = true;

		// Use the value passed from the event (captured at save time)
		// This is critical — editValue can be corrupted by re-renders
		const rawValue = valueFromEvent ?? editValue;

		let parsedValue: unknown = rawValue;

		// Parse list fields
		if (fieldType === 'list' && typeof rawValue === 'string') {
			parsedValue = rawValue
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);
		}

		// Parse object fields
		if (fieldType === 'object' && typeof rawValue === 'string') {
			try {
				parsedValue = JSON.parse(rawValue);
			} catch {
				// Keep as string if not valid JSON
			}
		}

		try {
			const res = await fetch('/api/brand/update-field', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					profileId: profile.id,
					fieldName: fieldKey,
					newValue: parsedValue,
					changeSource: 'manual'
				})
			});

			if (!res.ok) throw new Error('Failed to save');

			await loadProfile();
			editingField = null;
			editValue = '';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save field';
		} finally {
			isSaving = false;
		}
	}

	async function handleRevert(event: CustomEvent<{ versionId: string }>) {
		if (!profile || !historyFieldKey) return;

		try {
			const res = await fetch('/api/brand/revert-field', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					profileId: profile.id,
					fieldName: historyFieldKey,
					versionId: event.detail.versionId
				})
			});

			if (!res.ok) throw new Error('Failed to revert');

			closeHistory();
			await loadProfile();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to revert';
		}
	}

	// ─── Asset Management Functions ─────────────────────────

	async function loadAssetSummary() {
		try {
			const res = await fetch(`/api/brand/assets/summary?brandProfileId=${data.brandId}`);
			if (res.ok) {
				const result = await res.json();
				assetSummary = result.summary;
			}
		} catch {
			// Non-critical
		}
	}

	async function loadTabAssets(tab: string) {
		assetsLoading = true;
		try {
			if (tab === 'text') {
				const res = await fetch(`/api/brand/assets/texts?brandProfileId=${data.brandId}`);
				if (res.ok) {
					const result = await res.json();
					textAssets = result.texts;
				}
				// After loading, check for pending text edit from profile field click
				if (pendingTextEdit) {
					const pending = pendingTextEdit;
					pendingTextEdit = null;
					const match = textAssets.find(
						(t) => t.category === pending.category && t.key === pending.presetKey
					);
					if (match) {
						// Found matching text asset — open its editor
						startEditingText(match);
						requestAnimationFrame(() => {
							const el = document.querySelector(`[data-category="${pending.category}"]`);
							if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
						});
					} else {
						// No matching text asset — open add form pre-filled
						newTextCategory = pending.category;
						selectedPresetKey = pending.presetKey;
						customLabel = '';
						newTextValue = pending.fieldValue ?? '';
						showAddText = true;
					}
				}
			} else if (tab === 'images') {
				const res = await fetch(
					`/api/brand/assets/media?brandProfileId=${data.brandId}&mediaType=image`
				);
				if (res.ok) {
					const result = await res.json();
					imageAssets = result.media;
				}
			} else if (tab === 'audio') {
				const res = await fetch(
					`/api/brand/assets/media?brandProfileId=${data.brandId}&mediaType=audio`
				);
				if (res.ok) {
					const result = await res.json();
					audioAssets = result.media;
				}
			} else if (tab === 'videos') {
				const res = await fetch(
					`/api/brand/assets/media?brandProfileId=${data.brandId}&mediaType=video`
				);
				if (res.ok) {
					const result = await res.json();
					videoAssets = result.media;
				}
				// Also load AI-generated videos for this brand
				const vRes = await fetch(`/api/video?brandProfileId=${data.brandId}`);
				if (vRes.ok) {
					const vResult = await vRes.json();
					brandVideos = vResult.videos || [];
				}
			}
		} catch {
			// Handle silently
		} finally {
			assetsLoading = false;
		}
	}

	function switchTab(tab: typeof activeTab) {
		activeTab = tab;
		if (tab !== 'profile') {
			loadTabAssets(tab);
		}
		// Scroll to top when switching tabs so user sees the content from the start
		requestAnimationFrame(() => {
			window.scrollTo({ top: 0, behavior: 'smooth' });
		});
	}

	// Text CRUD

	async function addTextAsset() {
		if (!newTextKey || !newTextLabel || !newTextValue) return;
		try {
			const res = await fetch('/api/brand/assets/texts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					brandProfileId: data.brandId,
					category: newTextCategory,
					key: newTextKey,
					label: newTextLabel,
					value: newTextValue
				})
			});
			if (res.ok) {
				showAddText = false;
				selectedPresetKey = '';
				customLabel = '';
				newTextValue = '';
				await loadTabAssets('text');
				loadAssetSummary();
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to add text';
		}
	}

	function startEditingText(text: TextAsset) {
		editingTextId = text.id;
		editTextValue = text.value;
	}

	function cancelEditingText() {
		editingTextId = null;
		editTextValue = '';
	}

	async function saveTextAsset(textId: string) {
		try {
			const res = await fetch('/api/brand/assets/texts', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: textId, value: editTextValue })
			});
			if (res.ok) {
				editingTextId = null;
				editTextValue = '';
				await loadTabAssets('text');
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save';
		}
	}

	// AI Text Generation

	async function loadAiPresets(category: string) {
		try {
			const res = await fetch(`/api/brand/assets/generate-text?category=${category}`);
			if (res.ok) {
				const result = await res.json();
				aiPresets = result.presets || [];
			}
		} catch {
			aiPresets = [];
		}
	}

	// Load presets when category changes
	$: if (showAddText && newTextCategory) {
		loadAiPresets(newTextCategory);
	}

	async function generateTextWithAI(customPrompt?: string) {
		aiGenerating = true;
		aiError = null;
		try {
			const res = await fetch('/api/brand/assets/generate-text', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					brandProfileId: data.brandId,
					category: newTextCategory,
					key: newTextKey || 'generated',
					label: newTextLabel || 'Generated Text',
					customPrompt: customPrompt || undefined
				})
			});
			if (res.ok) {
				const result = await res.json();
				newTextValue = result.text;
				showAiPrompt = false;
				aiCustomPrompt = '';
			} else {
				const err = await res.json().catch(() => ({ message: 'Generation failed' }));
				aiError = err.message || 'Failed to generate text';
			}
		} catch (err) {
			aiError = err instanceof Error ? err.message : 'Failed to generate text';
		} finally {
			aiGenerating = false;
		}
	}

	async function generateFromPreset(preset: {
		key: string;
		label: string;
		promptTemplate: string;
	}) {
		selectedPresetKey = preset.key;
		await generateTextWithAI(preset.promptTemplate);
	}

	async function generateEditTextWithAI(
		textId: string,
		category: string,
		key: string,
		label: string,
		customPrompt?: string
	) {
		aiEditGenerating = true;
		aiError = null;
		try {
			const res = await fetch('/api/brand/assets/generate-text', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					brandProfileId: data.brandId,
					category,
					key,
					label,
					customPrompt: customPrompt || undefined
				})
			});
			if (res.ok) {
				const result = await res.json();
				editTextValue = result.text;
				showAiEditPrompt = false;
				aiEditCustomPrompt = '';
			} else {
				const err = await res.json().catch(() => ({ message: 'Generation failed' }));
				aiError = err.message || 'Failed to generate text';
			}
		} catch (err) {
			aiError = err instanceof Error ? err.message : 'Failed to generate text';
		} finally {
			aiEditGenerating = false;
		}
	}

	async function deleteTextAsset(textId: string) {
		try {
			const res = await fetch(`/api/brand/assets/texts?id=${textId}`, { method: 'DELETE' });
			if (res.ok) {
				await loadTabAssets('text');
				loadAssetSummary();
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete';
		}
	}

	/**
	 * Push a text asset's current value to the corresponding profile field.
	 * Optionally pushes a specific revision's value instead.
	 */
	async function pushTextToProfile(textId: string, revisionId?: string) {
		if (!profile || pushingTextId) return;
		pushingTextId = textId;
		pushSuccessMessage = null;
		try {
			const body: Record<string, string> = {
				brandProfileId: profile.id,
				textId
			};
			if (revisionId) body.revisionId = revisionId;

			const res = await fetch('/api/brand/push-to-profile', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) {
				const errData = await res.json().catch(() => null);
				throw new Error(errData?.message || 'Failed to push to profile');
			}
			const result = await res.json();
			pushSuccessMessage = `Updated ${result.pushedLabel} on profile`;
			// Refresh profile data so the Profile tab reflects the change
			await loadProfile();
			// Auto-dismiss success message after 3 seconds
			setTimeout(() => {
				pushSuccessMessage = null;
			}, 3000);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to push to profile';
		} finally {
			pushingTextId = null;
		}
	}

	async function refreshMediaAssets() {
		await loadTabAssets(activeTab);
		loadAssetSummary();
	}

	// Set an image asset as the brand's logo URL
	let settingProfileImage = false;
	let profileImageSuccess: string | null = null;

	const LOGO_VARIANT_FIELDS: Record<string, string> = {
		icon: 'logoUrl',
		horizontal: 'logoHorizontalUrl',
		vertical: 'logoVerticalUrl'
	};

	const LOGO_VARIANT_LABELS: Record<string, string> = {
		icon: 'Icon',
		horizontal: 'Horizontal',
		vertical: 'Vertical'
	};

	async function setImageAsProfileLogo(
		e: CustomEvent<{
			asset: import('$lib/types/brand-assets').BrandMediaAsset;
			url: string;
			variant?: 'icon' | 'horizontal' | 'vertical';
		}>
	) {
		if (!profile || settingProfileImage) return;
		const { asset, url, variant = 'icon' } = e.detail;
		const fieldName = LOGO_VARIANT_FIELDS[variant] || 'logoUrl';
		const variantLabel = LOGO_VARIANT_LABELS[variant] || 'Icon';
		settingProfileImage = true;
		profileImageSuccess = null;
		try {
			const res = await fetch('/api/brand/update-field', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					profileId: profile.id,
					fieldName,
					newValue: url,
					changeSource: 'manual',
					changeReason: `Set ${variantLabel} logo from media asset: ${asset.name}`
				})
			});
			if (!res.ok) {
				throw new Error('Failed to set logo');
			}
			profileImageSuccess = `${variantLabel} logo updated from "${asset.name}"`;
			await loadProfile();
			setTimeout(() => {
				profileImageSuccess = null;
			}, 3000);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to set logo';
		} finally {
			settingProfileImage = false;
		}
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	async function fillEmptyFieldsWithAI() {
		if (!profile || aiFilling) return;
		aiFilling = true;
		aiFillResults = null;
		aiFillMessage = null;
		error = null;

		try {
			const res = await fetch('/api/brand/assets/fill-empty-fields', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ brandProfileId: profile.id })
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({ message: 'Failed to fill fields' }));
				throw new Error(err.message || 'Failed to fill fields');
			}

			const result = await res.json();
			aiFillResults = result.results;
			aiFillMessage =
				result.totalFilled > 0
					? `Filled ${result.totalFilled} field${result.totalFilled !== 1 ? 's' : ''} with AI${result.totalFailed > 0 ? ` (${result.totalFailed} failed)` : ''}`
					: result.message || 'No fields to fill';

			await loadProfile();
			setTimeout(() => {
				aiFillMessage = null;
				aiFillResults = null;
			}, 5000);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to fill empty fields';
		} finally {
			aiFilling = false;
		}
	}

	async function handleColorsBatchChange(
		e: CustomEvent<{ colors: { key: string; value: string }[] }>
	) {
		if (!profile || isSaving) return;
		const profileRecord = profile as unknown as Record<string, unknown>;
		const changed = e.detail.colors.filter((c) => profileRecord[c.key] !== c.value);
		if (changed.length === 0) return;
		isSaving = true;
		try {
			for (const c of changed) {
				const res = await fetch('/api/brand/update-field', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						profileId: profile.id,
						fieldName: c.key,
						newValue: c.value,
						changeSource: 'manual'
					})
				});
				if (!res.ok) throw new Error(`Failed to save ${c.key}`);
			}
			await loadProfile();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save colors';
		} finally {
			isSaving = false;
		}
	}
</script>

<svelte:head>
	<title>{profile?.brandName || 'Brand'} — Brand Profile | NebulaKit</title>
	<meta
		name="description"
		content="View and manage your brand profile, identity, visual assets, and style guide."
	/>
</svelte:head>

<div class="brand-page">
	{#if isLoading}
		<div class="loading-state">
			<div class="spinner"></div>
			<p>Loading your brand...</p>
		</div>
	{:else if error}
		<div class="error-state">
			<p>{error}</p>
			<a href="/brand" class="back-link">← Back to Brands</a>
		</div>
	{:else if profile}
		<!-- Header -->
		<header class="brand-header">
			<div class="header-content">
				<div class="header-left">
					<a href="/brand" class="back-link">← All Brands</a>
					<h1 class="brand-title" class:codename={!profile.brandNameConfirmed}>
						{profile.brandName || 'New Brand'}
						{#if !profile.brandNameConfirmed}
							<span class="codename-badge">Codename</span>
						{/if}
					</h1>
					{#if profile.tagline}
						<p class="brand-tagline">{profile.tagline}</p>
					{/if}
				</div>
				<div class="header-actions">
					<a href="/onboarding?brand={profile.id}" class="architect-link">
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M12 20h9" />
							<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
						</svg>
						Brand Architect AI
					</a>
				</div>
			</div>

			<!-- Progress bar -->
			<div class="completion-bar">
				<div class="completion-info">
					<span class="completion-label">Profile Completion</span>
					<span class="completion-value">{completionPercent}%</span>
				</div>
				<div class="progress-track">
					<div class="progress-fill" style="width: {completionPercent}%"></div>
				</div>
				<div class="completion-detail">
					<span>{filledFields} of {totalFields} fields completed</span>
					{#if data.hasAIProviders && emptyTextFieldCount > 0}
						<button
							class="ai-fill-btn"
							on:click={fillEmptyFieldsWithAI}
							disabled={aiFilling}
							aria-label="Use AI to fill {emptyTextFieldCount} empty text fields"
						>
							{#if aiFilling}
								<span class="ai-fill-spinner"></span>
								Filling {emptyTextFieldCount} fields…
							{:else}
								✨ AI Fill {emptyTextFieldCount} Empty Fields
							{/if}
						</button>
					{/if}
				</div>
			</div>
		</header>

		<!-- Error message -->
		{#if error}
			<div class="error-banner">
				<span>{error}</span>
				<button on:click={() => (error = null)} aria-label="Dismiss error">×</button>
			</div>
		{/if}

		<!-- Push to profile success -->
		{#if pushSuccessMessage}
			<div class="success-banner">
				<span>✅ {pushSuccessMessage}</span>
				<button on:click={() => (pushSuccessMessage = null)} aria-label="Dismiss">×</button>
			</div>
		{/if}

		<!-- AI fill success -->
		{#if aiFillMessage}
			<div class="success-banner">
				<span>✨ {aiFillMessage}</span>
				<button
					on:click={() => {
						aiFillMessage = null;
						aiFillResults = null;
					}}
					aria-label="Dismiss">×</button
				>
			</div>
		{/if}

		<!-- Tab Navigation -->
		<div class="tab-nav" role="tablist">
			<button
				class="tab-btn"
				class:active={activeTab === 'profile'}
				on:click={() => switchTab('profile')}
				role="tab"
				aria-selected={activeTab === 'profile'}
			>
				<span class="tab-icon">📋</span>
				<span class="tab-label">Profile</span>
			</button>
			<button
				class="tab-btn"
				class:active={activeTab === 'text'}
				on:click={() => switchTab('text')}
				role="tab"
				aria-selected={activeTab === 'text'}
			>
				<span class="tab-icon">📝</span>
				<span class="tab-label">Text</span>
				{#if assetSummary && assetSummary.textCount > 0}
					<span class="tab-badge">{assetSummary.textCount}</span>
				{/if}
			</button>
			<button
				class="tab-btn"
				class:active={activeTab === 'images'}
				on:click={() => switchTab('images')}
				role="tab"
				aria-selected={activeTab === 'images'}
			>
				<span class="tab-icon">🖼️</span>
				<span class="tab-label">Images</span>
				{#if assetSummary && assetSummary.imageCount > 0}
					<span class="tab-badge">{assetSummary.imageCount}</span>
				{/if}
			</button>
			<button
				class="tab-btn"
				class:active={activeTab === 'audio'}
				on:click={() => switchTab('audio')}
				role="tab"
				aria-selected={activeTab === 'audio'}
			>
				<span class="tab-icon">🔊</span>
				<span class="tab-label">Audio</span>
				{#if assetSummary && assetSummary.audioCount > 0}
					<span class="tab-badge">{assetSummary.audioCount}</span>
				{/if}
			</button>
			<button
				class="tab-btn"
				class:active={activeTab === 'videos'}
				on:click={() => switchTab('videos')}
				role="tab"
				aria-selected={activeTab === 'videos'}
			>
				<span class="tab-icon">🎬</span>
				<span class="tab-label">Videos</span>
				{#if assetSummary && assetSummary.videoCount + assetSummary.videoGenerationsCount > 0}
					<span class="tab-badge"
						>{assetSummary.videoCount + assetSummary.videoGenerationsCount}</span
					>
				{/if}
			</button>
		</div>

		<!-- ═══ Profile Tab ═══ -->
		{#if activeTab === 'profile'}
			<!-- Visual Identity — full width at top -->
			{#if visualSection}
				<section class="brand-section brand-section--visual">
					<button
						class="section-header section-header--toggle"
						on:click={() => toggleSection('visual')}
						aria-expanded={!collapsedSections['visual']}
					>
						<span class="section-icon">{visualSection.icon}</span>
						<h2 class="section-title">{visualSection.title}</h2>
						<svg
							class="collapse-chevron"
							class:collapsed={collapsedSections['visual']}
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"><polyline points="6 9 12 15 18 9" /></svg
						>
					</button>

					{#if !collapsedSections['visual']}
						<BrandColorEditor
							colors={{
								primaryColor: profile?.primaryColor,
								secondaryColor: profile?.secondaryColor,
								accentColor: profile?.accentColor,
								brandColor4: profile?.brandColor4,
								brandColor5: profile?.brandColor5
							}}
							logoUrl={profile?.logoUrl}
							logoHorizontalUrl={profile?.logoHorizontalUrl}
							logoVerticalUrl={profile?.logoVerticalUrl}
							logoConcept={profile?.logoConcept}
							typographyLogo={profile?.typographyLogo}
							typographyHeading={profile?.typographyHeading}
							typographyBody={profile?.typographyBody}
							on:colorchange={(e) => {
								saveField(e.detail.key, 'color', e.detail.value);
							}}
							on:colorsbatchchange={handleColorsBatchChange}
							on:editlogo={() => switchTab('images')}
							on:fontchange={async (e) => {
								if (!profile) return;
								try {
									isSaving = true;
									const res = await fetch('/api/brand/update-field', {
										method: 'PATCH',
										headers: { 'Content-Type': 'application/json' },
										body: JSON.stringify({
											profileId: profile.id,
											fieldName: e.detail.field,
											newValue: e.detail.value,
											changeSource: 'manual'
										})
									});
									if (!res.ok) throw new Error('Failed to save font');
									await loadProfile();
								} catch (err) {
									error = err instanceof Error ? err.message : 'Failed to save font';
								} finally {
									isSaving = false;
								}
							}}
						/>
					{/if}
				</section>
			{/if}

			<!-- Other sections in grid -->
			<div class="sections-grid">
				{#each otherSections as section}
					<section class="brand-section">
						<button
							class="section-header section-header--toggle"
							on:click={() => toggleSection(section.id)}
							aria-expanded={!collapsedSections[section.id]}
						>
							<span class="section-icon">{section.icon}</span>
							<h2 class="section-title">{section.title}</h2>
							<svg
								class="collapse-chevron"
								class:collapsed={collapsedSections[section.id]}
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"><polyline points="6 9 12 15 18 9" /></svg
							>
						</button>

						{#if !collapsedSections[section.id]}
							<div class="fields-list">
								{#each section.fields as field (field.key)}
									<BrandFieldCard
										fieldKey={field.key}
										label={field.label}
										value={field.value}
										type={field.type}
										isEditing={editingField === field.key}
										hasTextSuggestions={!!FIELD_TO_TEXT_MAPPING[field.key]}
										{editValue}
										on:edit={() => startEditing(field.key, field.value)}
										on:save={(e) => saveField(field.key, field.type, e.detail?.value)}
										on:cancel={cancelEditing}
										on:history={() => openHistory(field.key, field.label)}
										on:picktext={() => openTextPicker(field.key, field.label)}
									/>
								{/each}
							</div>
						{/if}
					</section>
				{/each}
			</div>

			<!-- ═══ Text Tab ═══ -->
		{:else if activeTab === 'text'}
			<div class="asset-tab">
				<div class="asset-tab-header">
					<h2 class="asset-tab-title">Brand Text Assets</h2>
					<div class="asset-tab-actions">
						{#if data.hasAIProviders}
							<button class="add-asset-btn ai" on:click={() => (showAITextGenerate = true)}>
								✨ AI Generate
							</button>
						{/if}
						<button class="add-asset-btn" on:click={() => (showAddText = !showAddText)}>
							{showAddText ? '✕ Cancel' : '+ Add Text'}
						</button>
					</div>
				</div>

				{#if showAddText}
					<div class="add-text-form">
						<div class="form-row two-col">
							<label class="form-label">
								Category
								<select
									bind:value={newTextCategory}
									on:change={() => {
										selectedPresetKey = '';
										customLabel = '';
										newTextValue = '';
									}}
									class="form-input"
								>
									{#each Object.entries(textCategoryInfo) as [key, info]}
										<option value={key}>{info.icon} {info.label}</option>
									{/each}
								</select>
								<span class="form-hint">{textCategoryInfo[newTextCategory]?.description}</span>
							</label>
							<label class="form-label">
								Type
								<select bind:value={selectedPresetKey} class="form-input">
									<option value="">— Pick a type —</option>
									{#each aiPresets as preset}
										<option value={preset.key}>{preset.label}</option>
									{/each}
									<option value="__custom__">✏️ Custom...</option>
								</select>
							</label>
						</div>

						{#if selectedPresetKey === '__custom__'}
							<label class="form-label">
								Name
								<input
									type="text"
									bind:value={customLabel}
									placeholder="e.g. Brand Anthem, Welcome Message"
									class="form-input"
								/>
								{#if customLabel}
									<span class="form-hint">Key: <code>{newTextKey}</code></span>
								{/if}
							</label>
						{/if}

						{#if selectedPresetKey}
							<label class="form-label">
								Value
								<textarea
									bind:value={newTextValue}
									placeholder="Enter text content or use AI to generate..."
									class="form-textarea"
									rows="3"
								></textarea>
							</label>

							<!-- AI Generation Section -->
							{#if data.hasAIProviders}
								<div class="ai-generate-section">
									<div class="ai-generate-header">
										<span class="ai-label">✨ AI Generate</span>
										<div class="ai-actions-row">
											<button
												class="ai-btn"
												on:click={() => {
													if (selectedPreset) {
														generateTextWithAI(selectedPreset.promptTemplate);
													} else {
														generateTextWithAI();
													}
												}}
												disabled={aiGenerating ||
													(selectedPresetKey === '__custom__' && !customLabel)}
												title="Auto-generate based on type and brand context"
											>
												{aiGenerating ? '⏳ Generating...' : '🪄 Auto'}
											</button>
											<button
												class="ai-btn secondary"
												on:click={() => (showAiPrompt = !showAiPrompt)}
												disabled={aiGenerating}
											>
												💬 With Prompt
											</button>
										</div>
									</div>

									{#if showAiPrompt}
										<div class="ai-prompt-area">
											<textarea
												bind:value={aiCustomPrompt}
												placeholder="Describe what you want, e.g. 'Write a catchy tagline about innovation'..."
												class="form-textarea"
												rows="2"
											></textarea>
											<button
												class="ai-btn"
												on:click={() => generateTextWithAI(aiCustomPrompt)}
												disabled={aiGenerating || !aiCustomPrompt}
											>
												{aiGenerating ? '⏳ Generating...' : '✨ Generate'}
											</button>
										</div>
									{/if}

									{#if aiError}
										<div class="ai-error">
											{aiError}
											<button class="ai-error-dismiss" on:click={() => (aiError = null)}>✕</button>
										</div>
									{/if}
								</div>
							{/if}

							<button
								class="save-btn"
								on:click={addTextAsset}
								disabled={!newTextKey || !newTextLabel || !newTextValue}
							>
								Save Text Asset
							</button>
						{/if}
					</div>
				{/if}

				{#if assetsLoading}
					<div class="loading-state small">
						<div class="spinner"></div>
					</div>
				{:else if textAssets.length === 0}
					<div class="empty-state">
						<span class="empty-icon">📝</span>
						<p>No text assets yet</p>
						<p class="empty-hint">Add brand names, taglines, bios, legal copy, and more.</p>
						{#if data.hasAIProviders}
							<button
								class="add-asset-btn ai empty-cta"
								on:click={() => (showAITextGenerate = true)}
							>
								✨ Generate with AI
							</button>
						{/if}
					</div>
				{:else}
					{#each Object.entries(textCategoryInfo) as [catKey, catInfo]}
						{@const catTexts = textsByCategory[catKey]}
						{#if catTexts && catTexts.length > 0}
							<div class="asset-category-group" data-category={catKey}>
								<div class="asset-category-header">
									<span>{catInfo.icon}</span>
									<h3>{catInfo.label}</h3>
									<span class="category-count">{catTexts.length}</span>
								</div>
								<div class="text-assets-list">
									{#each catTexts as text}
										<div class="text-asset-card" class:editing={editingTextId === text.id}>
											<div class="text-asset-header">
												<span class="text-asset-label">{text.label}</span>
												<span class="text-asset-key">{text.key}</span>
												{#if text.language !== 'en'}
													<span class="lang-badge">{text.language}</span>
												{/if}
											</div>
											{#if editingTextId === text.id}
												<div class="edit-form">
													<textarea
														bind:value={editTextValue}
														class="form-textarea edit-textarea"
														rows="4"
														placeholder="Enter text content..."
													></textarea>
													<div class="edit-toolbar">
														<div class="edit-toolbar-left">
															{#if data.hasAIProviders}
																<button
																	class="toolbar-btn ai"
																	on:click={() =>
																		generateEditTextWithAI(
																			text.id,
																			text.category,
																			text.key,
																			text.label
																		)}
																	disabled={aiEditGenerating}
																	title="Regenerate this text using AI"
																>
																	{aiEditGenerating ? '⏳ Generating...' : '✨ AI Regenerate'}
																</button>
																<button
																	class="toolbar-btn"
																	on:click={() => (showAiEditPrompt = !showAiEditPrompt)}
																	disabled={aiEditGenerating}
																	title="Custom AI prompt"
																>
																	💬 Custom Prompt
																</button>
															{/if}
														</div>
														<div class="edit-toolbar-right">
															<button class="toolbar-btn cancel" on:click={cancelEditingText}
																>Cancel</button
															>
															<button
																class="toolbar-btn save"
																on:click={() => saveTextAsset(text.id)}>Save Changes</button
															>
														</div>
													</div>
													{#if showAiEditPrompt}
														<div class="custom-prompt-area">
															<textarea
																bind:value={aiEditCustomPrompt}
																placeholder="Describe what you want, e.g. 'Make it more concise' or 'Add a playful tone'..."
																class="form-textarea prompt-textarea"
																rows="2"
															></textarea>
															<button
																class="toolbar-btn ai"
																on:click={() =>
																	generateEditTextWithAI(
																		text.id,
																		text.category,
																		text.key,
																		text.label,
																		aiEditCustomPrompt
																	)}
																disabled={aiEditGenerating || !aiEditCustomPrompt}
															>
																{aiEditGenerating ? '⏳ Generating...' : '✨ Generate with Prompt'}
															</button>
														</div>
													{/if}
												</div>
											{:else}
												<p class="text-asset-value">{text.value}</p>
												<div class="text-asset-actions">
													<button class="edit-btn" on:click={() => startEditingText(text)}
														>Edit</button
													>
													{#if getMatchingProfileField(text.category, text.key)}
														<button
															class="push-btn"
															on:click={() => pushTextToProfile(text.id)}
															disabled={pushingTextId === text.id}
															title="Push this value to the profile's {getMatchingProfileField(
																text.category,
																text.key
															)?.fieldLabel} field"
														>
															{pushingTextId === text.id ? '⏳...' : '📤 Push to Profile'}
														</button>
													{/if}
													<button
														class="history-btn"
														on:click={() => {
															textHistoryId = text.id;
															textHistoryLabel = text.label;
														}}
														title="Revision history">History</button
													>
													<button class="delete-btn" on:click={() => deleteTextAsset(text.id)}
														>Delete</button
													>
												</div>
											{/if}
										</div>
									{/each}
								</div>
							</div>
						{/if}
					{/each}
				{/if}
			</div>

			{#if showAITextGenerate && data.brandId}
				<AITextQuickGenerate
					brandProfileId={data.brandId}
					on:close={() => (showAITextGenerate = false)}
					on:saved={() => {
						showAITextGenerate = false;
						loadTabAssets('text');
						loadProfile();
					}}
				/>
			{/if}

			<!-- ═══ Images Tab ═══ -->
		{:else if activeTab === 'images'}
			<div class="asset-tab">
				{#if profileImageSuccess}
					<div class="success-banner">{profileImageSuccess}</div>
				{/if}
				<MediaGallery
					brandProfileId={data.brandId ?? ''}
					mediaType="image"
					assets={imageAssets}
					loading={assetsLoading}
					showSetAsProfile={true}
					on:refresh={refreshMediaAssets}
					on:setProfileImage={setImageAsProfileLogo}
				/>
			</div>

			<!-- ═══ Audio Tab ═══ -->
		{:else if activeTab === 'audio'}
			<div class="asset-tab">
				<MediaGallery
					brandProfileId={data.brandId ?? ''}
					mediaType="audio"
					assets={audioAssets}
					loading={assetsLoading}
					on:refresh={refreshMediaAssets}
				/>
			</div>

			<!-- ═══ Videos Tab ═══ -->
		{:else if activeTab === 'videos'}
			<div class="asset-tab">
				<MediaGallery
					brandProfileId={data.brandId ?? ''}
					mediaType="video"
					assets={videoAssets}
					loading={assetsLoading}
					on:refresh={refreshMediaAssets}
				/>
			</div>
		{/if}
	{/if}

	<!-- Field History Modal -->
	{#if historyFieldKey && profile}
		<BrandFieldHistory
			profileId={profile.id}
			fieldName={historyFieldKey}
			fieldLabel={historyFieldLabel || historyFieldKey}
			on:close={closeHistory}
			on:revert={handleRevert}
		/>
	{/if}

	<!-- Text Revision History Modal -->
	{#if textHistoryId}
		{@const historyText = textAssets.find((t) => t.id === textHistoryId)}
		<TextRevisionHistory
			brandTextId={textHistoryId}
			textLabel={textHistoryLabel || ''}
			brandProfileId={profile?.id ?? ''}
			canPushToProfile={historyText
				? !!getMatchingProfileField(historyText.category, historyText.key)
				: false}
			on:close={() => {
				textHistoryId = null;
				textHistoryLabel = null;
			}}
			on:revert={() => {
				textHistoryId = null;
				textHistoryLabel = null;
				loadTabAssets('text');
			}}
			on:pushed={(e) => {
				textHistoryId = null;
				textHistoryLabel = null;
				pushSuccessMessage = `Updated ${e.detail.label} on profile`;
				loadProfile();
				setTimeout(() => {
					pushSuccessMessage = null;
				}, 3000);
			}}
		/>
	{/if}

	<!-- Text Picker Modal -->
	{#if pickerFieldKey && profile}
		<BrandTextPicker
			brandProfileId={profile.id}
			fieldName={pickerFieldKey}
			fieldLabel={pickerFieldLabel || pickerFieldKey}
			on:select={handleTextPicked}
			on:close={closeTextPicker}
		/>
	{/if}
</div>

<style>
	.brand-page {
		max-width: 1400px;
		margin: 0 auto;
		padding: var(--spacing-lg) var(--spacing-md);
		min-height: calc(100vh - 60px);
	}

	/* Loading */
	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 400px;
		gap: var(--spacing-md);
	}

	.loading-state.small {
		min-height: 200px;
	}

	.spinner {
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

	.loading-state p {
		color: var(--color-text-secondary);
		font-size: 0.9rem;
	}

	/* Error state */
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 300px;
		gap: var(--spacing-md);
		color: var(--color-text-secondary);
	}

	.back-link {
		color: var(--color-primary);
		text-decoration: none;
		font-size: 0.85rem;
		font-weight: 500;
		transition: color var(--transition-fast);
	}

	.back-link:hover {
		color: var(--color-primary-hover);
	}

	/* Header */
	.brand-header {
		margin-bottom: var(--spacing-lg);
	}

	.header-content {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-lg);
	}

	.header-left {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.brand-title {
		font-size: 1.8rem;
		font-weight: 800;
		color: var(--color-text);
		margin: 0;
		line-height: 1.2;
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
	}

	.brand-title.codename {
		font-style: italic;
	}

	.codename-badge {
		font-size: 0.6rem;
		font-weight: 500;
		font-style: normal;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-secondary);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: 0.15em 0.5em;
		white-space: nowrap;
	}

	.brand-tagline {
		color: var(--color-text-secondary);
		font-size: 1rem;
		margin: 0;
		font-style: italic;
	}

	.architect-link {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) var(--spacing-md);
		background-color: var(--color-primary);
		color: var(--color-background);
		border-radius: var(--radius-md);
		text-decoration: none;
		font-weight: 600;
		font-size: 0.8rem;
		white-space: nowrap;
		transition: background-color var(--transition-fast);
	}

	.architect-link:hover {
		background-color: var(--color-primary-hover);
	}

	/* Completion bar */
	.completion-bar {
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--spacing-md);
	}

	.completion-info {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--spacing-xs);
	}

	.completion-label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.completion-value {
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--color-primary);
	}

	.progress-track {
		height: 6px;
		background-color: var(--color-border);
		border-radius: 3px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--color-primary), var(--color-secondary));
		border-radius: 3px;
		transition: width var(--transition-base);
	}

	.completion-detail {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		margin-top: var(--spacing-xs);
	}

	/* AI Fill button */
	.ai-fill-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) var(--spacing-sm);
		background-color: var(--color-primary);
		color: var(--color-background);
		border: none;
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
		transition:
			background-color var(--transition-fast),
			opacity var(--transition-fast);
	}

	.ai-fill-btn:hover:not(:disabled) {
		background-color: var(--color-primary-hover);
	}

	.ai-fill-btn:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	.ai-fill-spinner {
		display: inline-block;
		width: 12px;
		height: 12px;
		border: 2px solid var(--color-background);
		border-top-color: transparent;
		border-radius: 50%;
		animation: ai-fill-spin 0.6s linear infinite;
	}

	@keyframes ai-fill-spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Error banner */
	.error-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background-color: var(--color-error);
		color: var(--color-background);
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-md);
		font-size: 0.85rem;
	}

	.error-banner button {
		background: none;
		border: none;
		color: var(--color-background);
		cursor: pointer;
		font-size: 1.2rem;
		padding: 0 var(--spacing-xs);
	}

	/* Success banner */
	.success-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background-color: var(--color-success, #22c55e);
		color: var(--color-background);
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-md);
		font-size: 0.85rem;
	}

	.success-banner button {
		background: none;
		border: none;
		color: var(--color-background);
		cursor: pointer;
		font-size: 1.2rem;
		padding: 0 var(--spacing-xs);
	}

	/* ─── Tab Navigation ─────────────────────────────────── */

	.tab-nav {
		display: flex;
		gap: var(--spacing-xs);
		margin-bottom: var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
	}

	.tab-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: var(--spacing-sm) var(--spacing-md);
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--color-text-secondary);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
		transition: all var(--transition-fast);
	}

	.tab-btn:hover {
		color: var(--color-text);
	}

	.tab-btn.active {
		color: var(--color-primary);
		border-bottom-color: var(--color-primary);
	}

	.tab-icon {
		font-size: 1rem;
	}

	.tab-badge {
		background-color: var(--color-primary);
		color: var(--color-background);
		font-size: 0.7rem;
		font-weight: 700;
		padding: 1px 6px;
		border-radius: 10px;
		min-width: 18px;
		text-align: center;
	}

	/* ─── Profile Sections Grid ──────────────────────────── */

	.brand-section--visual {
		margin-bottom: var(--spacing-lg);
	}

	.sections-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--spacing-lg);
	}

	@media (min-width: 768px) {
		.sections-grid {
			grid-template-columns: 1fr 1fr;
		}
	}

	.brand-section {
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-md);
		padding-bottom: var(--spacing-sm);
		border-bottom: 1px solid var(--color-border);
	}

	.section-header--toggle {
		width: 100%;
		background: none;
		border: none;
		border-bottom: 1px solid var(--color-border);
		cursor: pointer;
		color: inherit;
		padding: 0 0 var(--spacing-sm);
		transition: color var(--transition-fast);
	}

	.section-header--toggle:hover {
		color: var(--color-primary);
	}

	.collapse-chevron {
		margin-left: auto;
		color: var(--color-text-secondary);
		transition: transform var(--transition-fast);
		flex-shrink: 0;
	}

	.collapse-chevron.collapsed {
		transform: rotate(-90deg);
	}

	.section-icon {
		font-size: 1.3rem;
	}

	.section-title {
		font-size: 1rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0;
	}

	.fields-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	/* ─── Asset Tabs (shared) ────────────────────────────── */

	.asset-tab {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.asset-tab-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.asset-tab-title {
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0;
	}

	.add-asset-btn {
		padding: var(--spacing-xs) var(--spacing-md);
		background-color: var(--color-primary);
		color: var(--color-background);
		border: none;
		border-radius: var(--radius-md);
		font-weight: 600;
		font-size: 0.8rem;
		cursor: pointer;
		transition: background-color var(--transition-fast);
	}

	.add-asset-btn:hover {
		background-color: var(--color-primary-hover);
	}

	.add-asset-btn.ai {
		background-color: var(--color-surface);
		color: var(--color-primary);
		border: 1px solid var(--color-primary);
	}

	.add-asset-btn.ai:hover {
		background-color: var(--color-primary);
		color: var(--color-background);
	}

	.add-asset-btn.empty-cta {
		margin-top: var(--spacing-md);
		padding: var(--spacing-sm) var(--spacing-lg);
		font-size: 0.9rem;
	}

	.asset-tab-actions {
		display: flex;
		gap: var(--spacing-sm);
		align-items: center;
	}

	/* Empty state */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--spacing-2xl) var(--spacing-md);
		text-align: center;
		color: var(--color-text-secondary);
		background-color: var(--color-surface);
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-lg);
	}

	.empty-icon {
		font-size: 2.5rem;
		margin-bottom: var(--spacing-sm);
	}

	.empty-state p {
		margin: 0;
		font-size: 0.95rem;
	}

	.empty-hint {
		font-size: 0.8rem !important;
		margin-top: var(--spacing-xs) !important;
		color: var(--color-text-secondary);
	}

	/* ─── Category Groups ────────────────────────────────── */

	.asset-category-group {
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
	}

	.asset-category-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-md);
		padding-bottom: var(--spacing-sm);
		border-bottom: 1px solid var(--color-border);
	}

	.asset-category-header h3 {
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0;
		flex: 1;
	}

	.category-count {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		background-color: var(--color-border);
		padding: 1px 8px;
		border-radius: 10px;
	}

	/* ─── Text Assets ────────────────────────────────────── */

	.add-text-form {
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: var(--spacing-md);
	}

	.form-row.two-col {
		grid-template-columns: 1fr 1fr;
	}

	.form-hint {
		font-size: 0.7rem;
		color: var(--color-text-secondary);
		font-weight: 400;
		margin-top: 2px;
	}

	.form-hint code {
		font-family: monospace;
		font-size: 0.7rem;
		color: var(--color-text-secondary);
		background-color: var(--color-surface);
		padding: 1px 4px;
		border-radius: 3px;
	}

	.form-label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text-secondary);
	}

	.form-input,
	.form-textarea {
		background-color: var(--color-background);
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: var(--spacing-sm);
		font-size: 0.85rem;
		font-family: inherit;
		transition: border-color var(--transition-fast);
	}

	.form-input:focus,
	.form-textarea:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.form-textarea {
		resize: vertical;
	}

	.text-assets-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.text-asset-card {
		background-color: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--spacing-md);
		transition:
			border-color var(--transition-fast),
			box-shadow var(--transition-fast);
	}

	.text-asset-card.editing {
		border-color: var(--color-primary);
		box-shadow:
			0 0 0 1px var(--color-primary),
			0 4px 12px rgba(0, 0, 0, 0.08);
	}

	.text-asset-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-sm);
	}

	.text-asset-label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.text-asset-key {
		font-size: 0.65rem;
		color: var(--color-text-secondary);
		font-family: monospace;
		background-color: var(--color-surface);
		padding: 1px 6px;
		border-radius: var(--radius-sm);
	}

	.lang-badge {
		font-size: 0.65rem;
		font-weight: 600;
		background-color: var(--color-primary);
		color: var(--color-background);
		padding: 1px 5px;
		border-radius: 3px;
		text-transform: uppercase;
	}

	.text-asset-value {
		font-size: 0.9rem;
		color: var(--color-text);
		margin: 0 0 var(--spacing-sm);
		line-height: 1.6;
		white-space: pre-wrap;
	}

	.text-asset-actions {
		display: flex;
		gap: var(--spacing-xs);
		flex-wrap: wrap;
	}

	/* ─── Edit Form ──────────────────────────────────────── */

	.edit-form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.edit-textarea {
		width: 100%;
		min-height: 100px;
		padding: var(--spacing-md);
		font-size: 0.9rem;
		line-height: 1.6;
		resize: vertical;
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		transition: border-color var(--transition-fast);
	}

	.edit-textarea:focus {
		border-color: var(--color-primary);
		outline: none;
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 20%, transparent);
	}

	.edit-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-sm);
		padding-top: var(--spacing-xs);
		border-top: 1px solid var(--color-border);
	}

	.edit-toolbar-left,
	.edit-toolbar-right {
		display: flex;
		gap: var(--spacing-xs);
		align-items: center;
	}

	.toolbar-btn {
		padding: 6px 12px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background-color: var(--color-surface);
		color: var(--color-text);
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		transition: all var(--transition-fast);
		white-space: nowrap;
	}

	.toolbar-btn:hover:not(:disabled) {
		background-color: var(--color-border);
	}

	.toolbar-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.toolbar-btn.ai {
		background-color: var(--color-primary);
		border-color: var(--color-primary);
		color: var(--color-background);
	}

	.toolbar-btn.ai:hover:not(:disabled) {
		background-color: var(--color-primary-hover);
	}

	.toolbar-btn.save {
		background-color: var(--color-primary);
		border-color: var(--color-primary);
		color: var(--color-background);
		font-weight: 600;
	}

	.toolbar-btn.save:hover:not(:disabled) {
		background-color: var(--color-primary-hover);
	}

	.toolbar-btn.cancel {
		background-color: transparent;
		color: var(--color-text-secondary);
	}

	.toolbar-btn.cancel:hover:not(:disabled) {
		color: var(--color-text);
		background-color: var(--color-border);
	}

	.custom-prompt-area {
		display: flex;
		gap: var(--spacing-xs);
		align-items: flex-end;
		padding: var(--spacing-sm);
		background-color: var(--color-surface);
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
	}

	.prompt-textarea {
		flex: 1;
		font-size: 0.8rem;
		min-height: unset;
		padding: var(--spacing-sm);
	}

	/* ─── Buttons ─────────────────────────────────────────── */

	.save-btn,
	.edit-btn,
	.delete-btn,
	.history-btn,
	.push-btn {
		padding: var(--spacing-xs) var(--spacing-sm);
		border: none;
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: background-color var(--transition-fast);
	}

	.save-btn {
		background-color: var(--color-primary);
		color: var(--color-background);
	}

	.save-btn:hover {
		background-color: var(--color-primary-hover);
	}

	.save-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.edit-btn {
		background-color: var(--color-border);
		color: var(--color-text);
	}

	.edit-btn:hover {
		background-color: var(--color-text-secondary);
		color: var(--color-background);
	}

	.history-btn {
		background-color: transparent;
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
	}

	.history-btn:hover {
		background-color: var(--color-border);
		color: var(--color-text);
	}

	.delete-btn {
		background-color: transparent;
		color: var(--color-text-secondary);
	}

	.delete-btn:hover {
		background-color: var(--color-error);
		color: var(--color-background);
	}

	.push-btn {
		background-color: var(--color-primary);
		color: var(--color-background);
	}

	.push-btn:hover {
		background-color: var(--color-primary-hover);
	}

	.push-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* ─── AI Generate Section ─────────────────────────────── */

	.ai-generate-section {
		background-color: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--spacing-md);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.ai-generate-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-sm);
	}

	.ai-label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text-secondary);
	}

	.ai-actions-row {
		display: flex;
		gap: var(--spacing-xs);
	}

	.ai-btn {
		padding: var(--spacing-xs) var(--spacing-sm);
		background-color: var(--color-primary);
		color: var(--color-background);
		border: none;
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: background-color var(--transition-fast);
		white-space: nowrap;
	}

	.ai-btn:hover:not(:disabled) {
		background-color: var(--color-primary-hover);
	}

	.ai-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.ai-btn.secondary {
		background-color: var(--color-border);
		color: var(--color-text);
	}

	.ai-btn.secondary:hover:not(:disabled) {
		background-color: var(--color-text-secondary);
		color: var(--color-background);
	}

	.ai-prompt-area {
		display: flex;
		gap: var(--spacing-xs);
		align-items: flex-end;
	}

	.ai-prompt-area .form-textarea {
		flex: 1;
	}

	.ai-error {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-sm);
		padding: var(--spacing-xs) var(--spacing-sm);
		background-color: var(--color-error);
		color: var(--color-background);
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
	}

	.ai-error-dismiss {
		background: none;
		border: none;
		color: var(--color-background);
		cursor: pointer;
		padding: 0;
		font-size: 0.9rem;
		line-height: 1;
	}

	/* ─── Responsive ──────────────────────────────────────── */

	@media (max-width: 768px) {
		.form-row {
			grid-template-columns: 1fr;
		}

		.tab-label {
			display: none;
		}

		.tab-icon {
			font-size: 1.2rem;
		}

		.edit-toolbar {
			flex-direction: column;
			align-items: stretch;
		}

		.edit-toolbar-left,
		.edit-toolbar-right {
			justify-content: center;
		}

		.custom-prompt-area {
			flex-direction: column;
		}
	}

	@media (max-width: 480px) {
		.header-content {
			flex-direction: column;
		}

		.brand-title {
			font-size: 1.4rem;
		}
	}
</style>
