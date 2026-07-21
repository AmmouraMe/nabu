/**
 * Brand Asset Types
 * Types for the comprehensive brand text/image/audio/video asset management system.
 */

// ─── Text Asset Categories ────────────────────────────────────────

/** Categories for organizing brand text assets */
export type TextAssetCategory =
	| 'names' // Brand name, legal name, DBA, abbreviation, former names
	| 'messaging' // Tagline, slogan, elevator pitch, value proposition, mission, vision
	| 'descriptions' // Short bio, long bio, boilerplate, about us
	| 'legal' // Copyright notice, trademark text, disclaimers
	| 'social' // Social media bios (Twitter, Instagram, LinkedIn, etc.)
	| 'voice'; // Tone guidelines, vocabulary, key phrases, phrases to avoid

// ─── Media Asset Categories ────────────────────────────────────────

/** Categories for brand image assets */
export type ImageAssetCategory =
	| 'logo' // Primary logo, icon, wordmark, horizontal, vertical, stacked
	| 'social' // Profile pictures, cover images, story templates
	| 'marketing' // Banner ads, email headers, business cards, letterhead
	| 'product' // Product photos, screenshots, mockups
	| 'brand_elements' // Patterns, textures, icons, illustrations, watermarks
	| 'team'; // Team photos, headshots

/** Categories for brand audio assets */
export type AudioAssetCategory =
	| 'sonic_identity' // Audio logo, sound mark, notification sounds
	| 'music' // Brand anthem, jingles, background music, hold music
	| 'voiceover'; // Voiceover samples, podcast intros, IVR recordings

/** Categories for brand video assets */
export type VideoAssetCategory =
	| 'brand' // Brand videos, logo animations, manifesto
	| 'social' // Social media content, stories, reels
	| 'marketing' // Commercials, product demos, testimonials
	| 'content' // Tutorials, educational, entertainment
	| 'internal'; // Training, culture, onboarding

/** All media types */
export type MediaType = 'image' | 'audio' | 'video';

/** Variant types for media assets (especially logos) */
export type MediaVariantType =
	| 'size' // Dimension variant: 16x16, 64x64, 512x512, 1024x1024
	| 'format' // File format variant: SVG, PNG, JPEG, WebP
	| 'color_mode' // Color treatment: full_color, monochrome, grayscale, single_color
	| 'background' // Background variant: transparent, dark_bg, light_bg, colored_bg
	| 'platform'; // Platform-specific: favicon, apple_touch, og_image, twitter_card

// ─── Data Interfaces ──────────────────────────────────────────────

/** A text asset stored for a brand */
export interface BrandText {
	id: string;
	brandProfileId: string;
	category: TextAssetCategory;
	key: string;
	label: string;
	value: string;
	language: string;
	sortOrder: number;
	metadata?: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
}

/** A media asset (image, audio, or video) stored for a brand */
export interface BrandMediaAsset {
	id: string;
	brandProfileId: string;
	mediaType: MediaType;
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
	metadata?: Record<string, unknown>;
	sortOrder: number;
	isPrimary: boolean;
	createdAt: string;
	updatedAt: string;
}

/** A size/format/color variant of a media asset */
export interface BrandMediaVariant {
	id: string;
	brandMediaId: string;
	variantType: MediaVariantType;
	label: string;
	url?: string;
	r2Key?: string;
	mimeType?: string;
	fileSize?: number;
	width?: number;
	height?: number;
	metadata?: Record<string, unknown>;
	createdAt: string;
}

/** A media asset with its variants loaded */
export interface BrandMediaWithVariants {
	asset: BrandMediaAsset;
	variants: BrandMediaVariant[];
}

/** Summary of all brand assets by type */
export interface BrandAssetSummary {
	textCount: number;
	imageCount: number;
	audioCount: number;
	videoCount: number;
	videoGenerationsCount: number;
	totalCount: number;
}

// ─── Input Params ────────────────────────────────────────────────

/** Params for creating a brand text asset */
export interface CreateBrandTextParams {
	brandProfileId: string;
	category: TextAssetCategory;
	key: string;
	label: string;
	value: string;
	language?: string;
	sortOrder?: number;
	metadata?: Record<string, unknown>;
	/** Optional: user ID for initial revision tracking */
	userId?: string;
	/** Optional: source of the creation for revision tracking */
	changeSource?: TextChangeSource;
}

/** Params for updating a brand text asset */
export interface UpdateBrandTextParams {
	value?: string;
	label?: string;
	sortOrder?: number;
	metadata?: Record<string, unknown>;
	/** Optional: user ID for revision tracking (creates a revision if value changed) */
	userId?: string;
	/** Optional: source of the change for revision tracking */
	changeSource?: TextChangeSource;
	/** Optional: note for the revision */
	changeNote?: string;
}

/** Params for creating a brand media asset */
export interface CreateBrandMediaParams {
	brandProfileId: string;
	mediaType: MediaType;
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
	metadata?: Record<string, unknown>;
	sortOrder?: number;
	isPrimary?: boolean;
}

/** Params for updating a brand media asset */
export interface UpdateBrandMediaParams {
	name?: string;
	description?: string;
	url?: string;
	r2Key?: string;
	mimeType?: string;
	fileSize?: number;
	width?: number;
	height?: number;
	durationSeconds?: number;
	tags?: string[];
	metadata?: Record<string, unknown>;
	sortOrder?: number;
	isPrimary?: boolean;
}

/** Params for creating a media variant */
export interface CreateMediaVariantParams {
	brandMediaId: string;
	variantType: MediaVariantType;
	label: string;
	url?: string;
	r2Key?: string;
	mimeType?: string;
	fileSize?: number;
	width?: number;
	height?: number;
	metadata?: Record<string, unknown>;
}

// ─── AI Generation Types ──────────────────────────────────────────

/** Source of a media asset — how it was added */
export type MediaSource = 'upload' | 'ai_generated' | 'url_import';

/** AI provider used for generation */
export type AIGenerationProvider = 'openai' | 'wavespeed' | 'workers-ai';

/** Status of an AI generation job */
export type AIGenerationStatus = 'pending' | 'processing' | 'complete' | 'failed';

/** Type of AI generation */
export type AIGenerationType = 'image' | 'audio' | 'video';

/** An AI media generation job */
export interface AIMediaGeneration {
	id: string;
	brandProfileId: string;
	brandMediaId?: string;
	generationType: AIGenerationType;
	provider: AIGenerationProvider;
	model: string;
	prompt: string;
	negativePrompt?: string;
	status: AIGenerationStatus;
	/** Provider-specific job ID for polling */
	providerJobId?: string;
	/** Generated result URL */
	resultUrl?: string;
	/** R2 storage key for cached result */
	r2Key?: string;
	/** Cost in USD */
	cost?: number;
	/** Error message if failed */
	errorMessage?: string;
	/** Generation parameters (size, style, voice, etc.) */
	parameters?: Record<string, unknown>;
	/** Processing progress 0-100 */
	progress?: number;
	createdAt: string;
	completedAt?: string;
}

/** Params for requesting an AI image generation */
export interface AIImageGenerationParams {
	brandProfileId: string;
	prompt: string;
	negativePrompt?: string;
	model?: string;
	size?: '1024x1024' | '1792x1024' | '1024x1792' | '512x512' | '256x256';
	style?: 'vivid' | 'natural';
	quality?: 'standard' | 'hd';
	/** Category to assign the resulting image to */
	category?: string;
	/** Name for the resulting asset */
	name?: string;
}

/** Params for requesting an AI audio generation (TTS) */
export interface AIAudioGenerationParams {
	brandProfileId: string;
	prompt: string;
	model?: string;
	voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
	speed?: number;
	responseFormat?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav';
	/** Category to assign the resulting audio to */
	category?: string;
	/** Name for the resulting asset */
	name?: string;
}

/** Params for requesting an AI video generation */
export interface AIVideoGenerationParams {
	brandProfileId: string;
	prompt: string;
	model?: string;
	provider?: AIGenerationProvider;
	aspectRatio?: '16:9' | '9:16' | '1:1';
	duration?: number;
	resolution?: string;
	/** Category to assign the resulting video to */
	category?: string;
	/** Name for the resulting asset */
	name?: string;
}

// ─── Activity Log Types ────────────────────────────────────────────

/** Actions that can be logged for media assets */
export type MediaActivityAction =
	| 'created'
	| 'uploaded'
	| 'ai_generated'
	| 'updated'
	| 'replaced'
	| 'deleted'
	| 'restored'
	| 'variant_added'
	| 'variant_deleted'
	| 'metadata_updated'
	| 'revision_created'
	| 'revision_reverted';

/** A single activity log entry for a media asset */
export interface MediaActivityLog {
	id: string;
	brandProfileId: string;
	brandMediaId?: string;
	userId: string;
	action: MediaActivityAction;
	/** Human-readable description */
	description: string;
	/** Snapshot of changed data */
	details?: Record<string, unknown>;
	/** Source of the action */
	source: MediaSource;
	createdAt: string;
}

/** Params for creating an activity log entry */
export interface CreateMediaActivityLogParams {
	brandProfileId: string;
	brandMediaId?: string;
	userId: string;
	action: MediaActivityAction;
	description: string;
	details?: Record<string, unknown>;
	source: MediaSource;
}

// ─── Revision Control Types ───────────────────────────────────────

/** A revision (version snapshot) of a media asset */
export interface MediaRevision {
	id: string;
	brandMediaId: string;
	revisionNumber: number;
	/** URL of this revision's file */
	url?: string;
	/** R2 key for this revision */
	r2Key?: string;
	mimeType?: string;
	fileSize?: number;
	width?: number;
	height?: number;
	durationSeconds?: number;
	/** How this revision was created */
	source: MediaSource;
	/** User who created this revision */
	userId: string;
	/** Optional change note */
	changeNote?: string;
	/** Whether this is the currently active revision */
	isCurrent: boolean;
	metadata?: Record<string, unknown>;
	createdAt: string;
}

/** Params for creating a media revision */
export interface CreateMediaRevisionParams {
	brandMediaId: string;
	url?: string;
	r2Key?: string;
	mimeType?: string;
	fileSize?: number;
	width?: number;
	height?: number;
	durationSeconds?: number;
	source: MediaSource;
	userId: string;
	changeNote?: string;
	metadata?: Record<string, unknown>;
}

/** A media asset with its full revision history */
export interface BrandMediaWithRevisions {
	asset: BrandMediaAsset;
	revisions: MediaRevision[];
	currentRevision?: MediaRevision;
}

// ─── Text Revision Control Types ──────────────────────────────────

/** Change source for text revisions */
export type TextChangeSource = 'manual' | 'ai' | 'import' | 'revert';

/** A revision (version snapshot) of a text asset */
export interface TextRevision {
	id: string;
	brandTextId: string;
	revisionNumber: number;
	/** The text value at this revision */
	value: string;
	/** Label at time of revision */
	label?: string;
	/** How this revision was created */
	changeSource: TextChangeSource;
	/** User who created this revision */
	userId: string;
	/** Optional change note */
	changeNote?: string;
	/** Whether this is the currently active revision */
	isCurrent: boolean;
	createdAt: string;
}

/** Params for creating a text revision */
export interface CreateTextRevisionParams {
	brandTextId: string;
	value: string;
	label?: string;
	changeSource: TextChangeSource;
	userId: string;
	changeNote?: string;
}

/** A text asset with its full revision history */
export interface BrandTextWithRevisions {
	text: BrandText;
	revisions: TextRevision[];
	currentRevision?: TextRevision;
}
