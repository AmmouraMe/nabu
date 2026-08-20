/**
 * Video Provider Interface
 * Abstract interface for video generation providers (OpenAI Sora, etc.)
 */

export type VideoStatus = 'queued' | 'processing' | 'complete' | 'error';

export interface VideoGenerationRequest {
	prompt: string;
	model: string;
	aspectRatio?: '16:9' | '9:16' | '1:1';
	duration?: number;
	/** Target resolution (e.g. '480p', '720p', '1080p'). Affects output quality and pricing. */
	resolution?: string;
}

export interface VideoGenerationResult {
	providerJobId: string;
	status: VideoStatus;
	videoUrl?: string;
	thumbnailUrl?: string;
	duration?: number;
	error?: string;
	cost?: number;
}

export interface VideoStatusResult {
	status: VideoStatus;
	progress?: number;
	videoUrl?: string;
	thumbnailUrl?: string;
	duration?: number;
	error?: string;
	cost?: number;
}

/** Resolution-specific pricing override */
export interface ResolutionPricing {
	estimatedCostPerSecond?: number;
	estimatedCostPerGeneration?: number;
}

export interface VideoModelPricing {
	/** Cost per second of generated video — default/fallback rate (e.g. OpenAI Sora) */
	estimatedCostPerSecond?: number;
	/** Flat cost per generation regardless of duration — default/fallback (e.g. WaveSpeed) */
	estimatedCostPerGeneration?: number;
	/**
	 * Resolution-specific pricing overrides.
	 * Keys are resolution labels (e.g. '480p', '720p', '1080p').
	 * When a resolution key is present, its rates take priority over the
	 * top-level estimatedCostPerSecond / estimatedCostPerGeneration.
	 */
	pricingByResolution?: Record<string, ResolutionPricing>;
	/** ISO 4217 currency code */
	currency: string;
}

export type VideoModelType = 'text-to-video' | 'image-to-video' | 'image';

export interface VideoModel {
	id: string;
	displayName: string;
	provider: string;
	/** The type of generation this model performs */
	type: VideoModelType;
	maxDuration?: number;
	/** Allowed duration values in seconds (e.g. [5, 8]). Provider APIs may only accept specific values. */
	supportedDurations?: number[];
	supportedAspectRatios?: string[];
	supportedResolutions?: string[];
	/**
	 * Explicit map of valid (aspectRatio, resolution) → API size string.
	 * Keys are aspect ratio values (e.g. '16:9'), values map resolution labels
	 * (e.g. '720p') to the concrete size string the provider API expects.
	 * When present, the UI should only allow combinations defined here.
	 */
	validSizes?: Record<string, Record<string, string>>;
	/** Estimated pricing for this model */
	pricing?: VideoModelPricing;
}

/**
 * Interface that all video providers must implement
 */
export interface VideoProvider {
	readonly name: string;

	/**
	 * Start a video generation job
	 */
	generateVideo(apiKey: string, request: VideoGenerationRequest): Promise<VideoGenerationResult>;

	/**
	 * Check the status of a video generation job
	 */
	getStatus(apiKey: string, providerJobId: string): Promise<VideoStatusResult>;

	/**
	 * Get the list of available video models for this provider
	 */
	getAvailableModels(): VideoModel[];

	/**
	 * Download the video content as bytes (for R2 caching)
	 */
	downloadVideo(apiKey: string, videoUrl: string): Promise<ArrayBuffer>;
}
