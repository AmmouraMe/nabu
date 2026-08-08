/**
 * OpenAI Video Provider (Sora)
 * Implements video generation using OpenAI's Sora Video API
 * @see https://developers.openai.com/api/docs/guides/video-generation
 *
 * API endpoints:
 *   POST   /v1/videos              - Create a video render job
 *   GET    /v1/videos/{video_id}   - Poll job status & progress
 *   GET    /v1/videos/{video_id}/content - Download the finished MP4
 *   GET    /v1/videos              - List videos
 *   DELETE /v1/videos/{video_id}   - Delete a video
 */

import type {
	VideoProvider,
	VideoGenerationRequest,
	VideoGenerationResult,
	VideoStatusResult,
	VideoModel
} from '../video-provider';

const OPENAI_API_BASE = 'https://api.openai.com/v1';

/**
 * Official OpenAI Sora API pricing (per second):
 *   sora-2     — 480p: $0.04/sec, 720p: $0.10/sec
 *   sora-2-pro — 480p: $0.04/sec, 720p: $0.30/sec, 1080p: $0.50/sec
 * @see https://developers.openai.com/api/docs/pricing
 */
const OPENAI_VIDEO_MODELS: VideoModel[] = [
	{
		id: 'sora-2',
		displayName: 'Sora 2',
		provider: 'openai',
		type: 'text-to-video',
		maxDuration: 12,
		supportedDurations: [4, 8, 12],
		supportedAspectRatios: ['16:9', '9:16'],
		supportedResolutions: ['720p'],
		validSizes: {
			'16:9': { '720p': '1280x720' },
			'9:16': { '720p': '720x1280' }
		},
		pricing: {
			estimatedCostPerSecond: 0.1,
			pricingByResolution: {
				'720p': { estimatedCostPerSecond: 0.1 }
			},
			currency: 'USD'
		}
	},
	{
		id: 'sora-2-pro',
		displayName: 'Sora 2 Pro',
		provider: 'openai',
		type: 'text-to-video',
		maxDuration: 12,
		supportedDurations: [4, 8, 12],
		supportedAspectRatios: ['16:9', '9:16'],
		supportedResolutions: ['720p', '1080p'],
		validSizes: {
			'16:9': { '720p': '1280x720', '1080p': '1792x1024' },
			'9:16': { '720p': '720x1280', '1080p': '1024x1792' }
		},
		pricing: {
			estimatedCostPerSecond: 0.3,
			pricingByResolution: {
				'720p': { estimatedCostPerSecond: 0.3 },
				'1080p': { estimatedCostPerSecond: 0.5 }
			},
			currency: 'USD'
		}
	}
];

export class OpenAIVideoProvider implements VideoProvider {
	readonly name = 'openai';

	async generateVideo(
		apiKey: string,
		request: VideoGenerationRequest
	): Promise<VideoGenerationResult> {
		try {
			const response = await fetch(`${OPENAI_API_BASE}/videos`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${apiKey}`
				},
				body: JSON.stringify({
					model: request.model || 'sora-2',
					prompt: request.prompt,
					size: this.mapAspectRatioAndResolution(
						request.aspectRatio,
						request.resolution,
						request.model
					),
					seconds: String(request.duration || 8)
				})
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				const errorMessage =
					(errorData as Record<string, Record<string, string>>)?.error?.message ||
					`OpenAI API error: ${response.status}`;
				return {
					providerJobId: '',
					status: 'error',
					error: errorMessage
				};
			}

			const data = (await response.json()) as {
				id: string;
				object: string;
				status: string;
				model: string;
				progress: number;
				seconds: string;
				size: string;
			};

			// The API returns a job with status 'queued' or 'in_progress'
			// Video must be polled via GET /videos/{id} until 'completed'
			if (data.status === 'completed') {
				return {
					providerJobId: data.id,
					status: 'complete',
					videoUrl: `${OPENAI_API_BASE}/videos/${data.id}/content`,
					duration: parseFloat(data.seconds) || undefined
				};
			}

			return {
				providerJobId: data.id,
				status: data.status === 'queued' ? 'queued' : 'processing',
				duration: parseFloat(data.seconds) || undefined
			};
		} catch (err) {
			return {
				providerJobId: '',
				status: 'error',
				error: err instanceof Error ? err.message : 'Failed to start video generation'
			};
		}
	}

	async getStatus(apiKey: string, providerJobId: string): Promise<VideoStatusResult> {
		try {
			const response = await fetch(`${OPENAI_API_BASE}/videos/${providerJobId}`, {
				headers: {
					Authorization: `Bearer ${apiKey}`
				}
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				return {
					status: 'error',
					error:
						(errorData as Record<string, Record<string, string>>)?.error?.message ||
						`Status check failed: ${response.status}`
				};
			}

			const data = (await response.json()) as {
				id: string;
				object: string;
				status: string;
				model: string;
				progress: number;
				seconds: string;
				size: string;
			};

			if (data.status === 'completed') {
				return {
					status: 'complete',
					videoUrl: `${OPENAI_API_BASE}/videos/${data.id}/content`,
					progress: 100,
					duration: parseFloat(data.seconds) || undefined
				};
			}

			if (data.status === 'failed') {
				return {
					status: 'error',
					error: 'Video generation failed'
				};
			}

			return {
				status: data.status === 'queued' ? 'queued' : 'processing',
				progress: data.progress ?? 0
			};
		} catch (err) {
			return {
				status: 'error',
				error: err instanceof Error ? err.message : 'Failed to check video status'
			};
		}
	}

	getAvailableModels(): VideoModel[] {
		return OPENAI_VIDEO_MODELS;
	}

	async downloadVideo(apiKey: string, videoUrl: string): Promise<ArrayBuffer> {
		// OpenAI video content endpoint requires authentication
		const response = await fetch(videoUrl, {
			headers: {
				Authorization: `Bearer ${apiKey}`
			}
		});
		if (!response.ok) {
			throw new Error(`Failed to download video: ${response.status}`);
		}
		return response.arrayBuffer();
	}

	/**
	 * Map aspect ratio + resolution to OpenAI size parameter (width x height).
	 * Uses the validSizes lookup on each model definition, falling back to
	 * a hardcoded table for backwards compatibility.
	 */
	private mapAspectRatioAndResolution(
		aspectRatio?: string,
		resolution?: string,
		modelId?: string
	): string {
		// Try validSizes lookup first
		const model = OPENAI_VIDEO_MODELS.find((m) => m.id === modelId);
		if (model?.validSizes) {
			const ar = aspectRatio || '16:9';
			const res = resolution || '720p';
			const size = model.validSizes[ar]?.[res];
			if (size) return size;
			// If the exact combo isn't found, pick the first valid size for this ratio
			const ratioSizes = model.validSizes[ar];
			if (ratioSizes) {
				const firstRes = Object.keys(ratioSizes)[0];
				if (firstRes) return ratioSizes[firstRes];
			}
		}

		// Fallback table
		const res = resolution || '720p';
		if (res === '1080p') {
			switch (aspectRatio) {
				case '9:16':
					return '1024x1792';
				case '16:9':
				default:
					return '1792x1024';
			}
		}
		// 720p (default)
		switch (aspectRatio) {
			case '9:16':
				return '720x1280';
			case '16:9':
			default:
				return '1280x720';
		}
	}
}
