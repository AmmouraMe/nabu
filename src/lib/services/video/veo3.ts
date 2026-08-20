/**
 * Google Veo 3 Video Generation Service
 * Calls the Google Generative Language REST API — no npm SDK required.
 * Compatible with Cloudflare Workers (pure fetch, no Node.js APIs).
 *
 * API key stored in KV under: google:apikey:{userId}
 *
 * Flow:
 *   1. POST /v1beta/models/veo-3-lite:generateContent → may return an
 *      Operation (async, done=false) or a completed response directly.
 *   2. If async, poll /v1beta/operations/{id} until done=true.
 *   3. Extract videoUrl from the completed response.
 */

const GENAI_BASE = 'https://generativelanguage.googleapis.com';
const VEO_MODEL = 'veo-3-lite';

// ─── Types ────────────────────────────────────────────────────────

export type Veo3Status = 'pending' | 'complete' | 'error';

export interface Veo3GenerateResult {
	operationName: string | null;
	videoUrl: string | null;
	status: Veo3Status;
	rawResponse?: unknown;
}

export interface Veo3PollResult {
	done: boolean;
	videoUrl: string | null;
	error: string | null;
}

export interface Veo3Options {
	aspectRatio?: string;
	durationSeconds?: number;
	fps?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────

function buildRequestBody(prompt: string, opts: Veo3Options): Record<string, unknown> {
	return {
		contents: [
			{
				role: 'user',
				parts: [{ text: `Generate a ${opts.durationSeconds ?? 5}-second video: ${prompt}` }]
			}
		],
		generationConfig: {
			videoDuration: opts.durationSeconds ?? 5,
			aspectRatio: opts.aspectRatio ?? '16:9',
			fps: opts.fps ?? 24
		}
	};
}

/**
 * Try to extract a video URL from multiple possible response shapes.
 * Google's API returns video data in different locations depending on
 * the model and response format version.
 */
function extractVideoUrl(data: unknown): string | null {
	if (!data || typeof data !== 'object') return null;
	const obj = data as Record<string, unknown>;

	// Shape 1: operation completed response wrapper
	const response = (obj.response ?? obj) as Record<string, unknown>;

	// Shape 2: candidates array
	const candidates = (response.candidates ?? []) as unknown[];
	if (!Array.isArray(candidates) || candidates.length === 0) return null;

	const candidate = candidates[0] as Record<string, unknown>;
	const content = candidate.content as Record<string, unknown> | undefined;
	if (!content) return null;

	const parts = (content.parts ?? []) as unknown[];
	if (!Array.isArray(parts) || parts.length === 0) return null;

	const part = parts[0] as Record<string, unknown>;

	// videoUrl (source app's expected field)
	if (typeof part.videoUrl === 'string') return part.videoUrl;

	// fileData.fileUri (Google Files API URI)
	const fileData = part.fileData as Record<string, unknown> | undefined;
	if (fileData && typeof fileData.fileUri === 'string') return fileData.fileUri;

	// videoMetadata + inlineData or fileUri
	if (part.fileUri && typeof part.fileUri === 'string') return part.fileUri;
	if (part.uri && typeof part.uri === 'string') return part.uri;

	return null;
}

function isOperation(data: unknown): data is { name: string; done?: boolean } {
	return (
		!!data &&
		typeof data === 'object' &&
		typeof (data as Record<string, unknown>).name === 'string' &&
		(data as Record<string, unknown>).name !== '' &&
		!('candidates' in (data as object))
	);
}

// ─── Public API ───────────────────────────────────────────────────

export async function generateVideo(
	apiKey: string,
	prompt: string,
	opts: Veo3Options = {}
): Promise<Veo3GenerateResult> {
	const url = `${GENAI_BASE}/v1beta/models/${VEO_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
	const body = buildRequestBody(prompt, opts);

	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});

	if (!res.ok) {
		const errText = await res.text().catch(() => res.statusText);
		const msg = parseApiError(errText, res.status);
		throw new Error(msg);
	}

	const data = (await res.json()) as Record<string, unknown>;

	// Long-running operation (async path)
	if (isOperation(data) && data.done !== true) {
		return {
			operationName: data.name,
			videoUrl: null,
			status: 'pending',
			rawResponse: data
		};
	}

	// If operation is already done (done === true) or direct response
	const videoUrl = extractVideoUrl(data);
	return {
		operationName: isOperation(data) ? data.name : null,
		videoUrl,
		status: videoUrl ? 'complete' : 'error',
		rawResponse: data
	};
}

export async function pollOperation(
	apiKey: string,
	operationName: string
): Promise<Veo3PollResult> {
	// operationName is the full path, e.g. "operations/xyz" or "projects/.../operations/xyz"
	const opPath = operationName.startsWith('/') ? operationName : `/${operationName}`;
	const url = `${GENAI_BASE}/v1beta${opPath}?key=${encodeURIComponent(apiKey)}`;

	const res = await fetch(url);

	if (!res.ok) {
		const errText = await res.text().catch(() => res.statusText);
		return { done: false, videoUrl: null, error: parseApiError(errText, res.status) };
	}

	const data = (await res.json()) as Record<string, unknown>;
	const done = data.done === true;

	if (!done) {
		return { done: false, videoUrl: null, error: null };
	}

	if (data.error) {
		const errData = data.error as Record<string, unknown>;
		return {
			done: true,
			videoUrl: null,
			error: (errData.message as string) ?? 'Operation failed'
		};
	}

	const videoUrl = extractVideoUrl(data);
	return {
		done: true,
		videoUrl,
		error: videoUrl ? null : 'No video URL in completed operation'
	};
}

function parseApiError(body: string, status: number): string {
	if (
		status === 401 ||
		body.toLowerCase().includes('api key') ||
		body.toLowerCase().includes('invalid key')
	) {
		return 'Invalid or expired Google AI API key';
	}
	if (status === 429 || body.toLowerCase().includes('quota')) {
		return 'Google AI API quota exceeded';
	}
	if (body.toLowerCase().includes('safety') || body.toLowerCase().includes('blocked')) {
		return 'Content filtered for safety — try a different prompt';
	}
	try {
		const parsed = JSON.parse(body) as Record<string, unknown>;
		const errObj = parsed.error as Record<string, unknown> | undefined;
		if (errObj?.message) return String(errObj.message);
	} catch {
		// not JSON
	}
	return `Veo 3 API error ${status}`;
}

export function googleKvKey(userId: string): string {
	return `google:apikey:${userId}`;
}

// ─── Exports for testing ──────────────────────────────────────────
export { buildRequestBody, extractVideoUrl, isOperation };
