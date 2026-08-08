/**
 * Tests for Video Generate API and Video Stream API
 * Covers: POST /api/video/generate (low coverage),
 *         GET /api/video/[id]/stream (low coverage)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Helper to read a streaming Response body in happy-dom.
 * happy-dom's Response wraps the body but doesn't support .text() or .getReader() on it.
 * We intercept the original ReadableStream passed to new Response() and read it directly.
 */
let capturedStream: ReadableStream | null = null;
const OriginalResponse = globalThis.Response;
const SpyResponse = function (body?: any, init?: any) {
	if (body instanceof ReadableStream) {
		capturedStream = body;
	}
	return new OriginalResponse(body, init);
} as any;
SpyResponse.prototype = OriginalResponse.prototype;
SpyResponse.json = OriginalResponse.json;
SpyResponse.error = OriginalResponse.error;
SpyResponse.redirect = OriginalResponse.redirect;

async function readStreamResponse(_response: Response): Promise<string> {
	const stream = capturedStream;
	capturedStream = null;
	if (!stream) return '';
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let result = '';
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		result += decoder.decode(value, { stream: true });
	}
	return result;
}

// Replace Response globally so our spy intercepts stream construction
globalThis.Response = SpyResponse;

vi.mock('$lib/services/video-registry', () => ({
	getEnabledVideoKey: vi.fn(),
	getVideoProvider: vi.fn(),
	getModelsForKey: vi.fn(),
	getAllEnabledVideoKeys: vi.fn(),
	getAllVideoModels: vi.fn()
}));

vi.mock('$lib/utils/cost', () => ({
	calculateVideoCostFromPricing: vi.fn(() => 0.5)
}));

let mockDB: any;
let mockPlatform: any;
let mockLocals: any;

function createMockDB() {
	return {
		prepare: vi.fn().mockReturnThis(),
		bind: vi.fn().mockReturnThis(),
		first: vi.fn().mockResolvedValue(null),
		all: vi.fn().mockResolvedValue({ results: [] }),
		run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } })
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mockDB = createMockDB();
	mockPlatform = {
		env: {
			DB: mockDB,
			KV: { get: vi.fn(), put: vi.fn() },
			BUCKET: { put: vi.fn(), get: vi.fn(), delete: vi.fn() }
		},
		context: { waitUntil: vi.fn() }
	};
	mockLocals = { user: { id: 'user-1', login: 'testuser' } };
});

// ─────────────────────────────────────
// POST /api/video/generate
// ─────────────────────────────────────
describe('POST /api/video/generate - Extended', () => {
	it('should return 401 when not authenticated', async () => {
		const { POST } = await import('../../src/routes/api/video/generate/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ prompt: 'test' })
				}),
				platform: mockPlatform,
				locals: { user: null }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 500 when platform not available', async () => {
		const { POST } = await import('../../src/routes/api/video/generate/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ prompt: 'test' })
				}),
				platform: null,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('should return 400 when prompt is empty', async () => {
		const { POST } = await import('../../src/routes/api/video/generate/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ prompt: '' })
				}),
				platform: mockPlatform,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return 400 when prompt is too long', async () => {
		const { POST } = await import('../../src/routes/api/video/generate/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ prompt: 'A'.repeat(4001) })
				}),
				platform: mockPlatform,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return 503 when no video key available', async () => {
		const { getEnabledVideoKey } = await import('$lib/services/video-registry');
		vi.mocked(getEnabledVideoKey).mockResolvedValue(null);

		const { POST } = await import('../../src/routes/api/video/generate/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ prompt: 'Generate a video' })
				}),
				platform: mockPlatform,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(503);
		}
	});

	it('should return 503 when provider not supported', async () => {
		const { getEnabledVideoKey, getVideoProvider } = await import('$lib/services/video-registry');
		vi.mocked(getEnabledVideoKey).mockResolvedValue({
			provider: 'unknown',
			apiKey: 'key'
		} as any);
		vi.mocked(getVideoProvider).mockReturnValue(null);

		const { POST } = await import('../../src/routes/api/video/generate/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ prompt: 'Generate a video' })
				}),
				platform: mockPlatform,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(503);
		}
	});

	it('should handle generation error from provider', async () => {
		const { getEnabledVideoKey, getVideoProvider } = await import('$lib/services/video-registry');
		vi.mocked(getEnabledVideoKey).mockResolvedValue({
			provider: 'openai',
			apiKey: 'key'
		} as any);
		vi.mocked(getVideoProvider).mockReturnValue({
			getAvailableModels: () => [{ id: 'sora-2', pricing: {} }],
			generateVideo: vi.fn().mockResolvedValue({
				status: 'error',
				error: 'Generation failed'
			})
		} as any);

		const { POST } = await import('../../src/routes/api/video/generate/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ prompt: 'test' })
				}),
				platform: mockPlatform,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(502);
		}
	});

	it('should handle successful queued generation', async () => {
		const { getEnabledVideoKey, getVideoProvider } = await import('$lib/services/video-registry');
		vi.mocked(getEnabledVideoKey).mockResolvedValue({
			provider: 'openai',
			apiKey: 'key'
		} as any);
		vi.mocked(getVideoProvider).mockReturnValue({
			getAvailableModels: () => [{ id: 'sora-2', pricing: {} }],
			generateVideo: vi.fn().mockResolvedValue({
				status: 'queued',
				providerJobId: 'job-123'
			})
		} as any);

		const { POST } = await import('../../src/routes/api/video/generate/+server');
		const response = await POST({
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					prompt: 'A sunset timelapse',
					model: 'sora-2',
					aspectRatio: '16:9',
					duration: 8
				})
			}),
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const data = await response.json();
		expect(data.status).toBe('queued');
		expect(data.providerJobId).toBe('job-123');
	});

	it('should handle completed generation immediately', async () => {
		const { getEnabledVideoKey, getVideoProvider } = await import('$lib/services/video-registry');
		vi.mocked(getEnabledVideoKey).mockResolvedValue({
			provider: 'openai',
			apiKey: 'key'
		} as any);
		vi.mocked(getVideoProvider).mockReturnValue({
			getAvailableModels: () => [{ id: 'sora-2', pricing: { estimatedCostPerSecond: 0.5 } }],
			generateVideo: vi.fn().mockResolvedValue({
				status: 'complete',
				providerJobId: 'job-456',
				videoUrl: 'http://example.com/video.mp4',
				duration: 8
			})
		} as any);

		const { POST } = await import('../../src/routes/api/video/generate/+server');
		const response = await POST({
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					prompt: 'A sunset',
					conversationId: 'conv-1',
					messageId: 'msg-1'
				})
			}),
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const data = await response.json();
		expect(data.status).toBe('complete');
		expect(data.videoUrl).toBe('http://example.com/video.mp4');
	});

	it('should handle processing status', async () => {
		const { getEnabledVideoKey, getVideoProvider } = await import('$lib/services/video-registry');
		vi.mocked(getEnabledVideoKey).mockResolvedValue({
			provider: 'openai',
			apiKey: 'key'
		} as any);
		vi.mocked(getVideoProvider).mockReturnValue({
			getAvailableModels: () => [{ id: 'sora-2' }],
			generateVideo: vi.fn().mockResolvedValue({
				status: 'processing',
				providerJobId: 'job-789'
			})
		} as any);

		const { POST } = await import('../../src/routes/api/video/generate/+server');
		const response = await POST({
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ prompt: 'test' })
			}),
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const data = await response.json();
		expect(data.status).toBe('processing');
	});

	it('should handle DB error during storage gracefully', async () => {
		const { getEnabledVideoKey, getVideoProvider } = await import('$lib/services/video-registry');
		vi.mocked(getEnabledVideoKey).mockResolvedValue({
			provider: 'openai',
			apiKey: 'key'
		} as any);
		vi.mocked(getVideoProvider).mockReturnValue({
			getAvailableModels: () => [{ id: 'sora-2' }],
			generateVideo: vi.fn().mockResolvedValue({
				status: 'queued',
				providerJobId: 'job-123'
			})
		} as any);
		mockDB.run.mockRejectedValueOnce(new Error('DB error'));

		const { POST } = await import('../../src/routes/api/video/generate/+server');
		const response = await POST({
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ prompt: 'test' })
			}),
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		// Should still return successfully (DB logging failure is non-critical)
		const data = await response.json();
		expect(data.providerJobId).toBe('job-123');
	});

	it('should use valid duration or ignore invalid', async () => {
		const { getEnabledVideoKey, getVideoProvider } = await import('$lib/services/video-registry');
		vi.mocked(getEnabledVideoKey).mockResolvedValue({
			provider: 'openai',
			apiKey: 'key'
		} as any);
		const mockGenerate = vi.fn().mockResolvedValue({
			status: 'queued',
			providerJobId: 'job-123'
		});
		vi.mocked(getVideoProvider).mockReturnValue({
			getAvailableModels: () => [{ id: 'sora-2' }],
			generateVideo: mockGenerate
		} as any);

		const { POST } = await import('../../src/routes/api/video/generate/+server');

		// Valid duration
		await POST({
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ prompt: 'test', duration: 4 })
			}),
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		expect(mockGenerate).toHaveBeenCalledWith('key', expect.objectContaining({ duration: 4 }));

		// Invalid duration should be undefined
		mockGenerate.mockClear();
		await POST({
			request: new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ prompt: 'test', duration: 99 })
			}),
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		expect(mockGenerate).toHaveBeenCalledWith(
			'key',
			expect.objectContaining({ duration: undefined })
		);
	});

	it('should handle error storage failure', async () => {
		const { getEnabledVideoKey, getVideoProvider } = await import('$lib/services/video-registry');
		vi.mocked(getEnabledVideoKey).mockResolvedValue({
			provider: 'openai',
			apiKey: 'key'
		} as any);
		vi.mocked(getVideoProvider).mockReturnValue({
			getAvailableModels: () => [{ id: 'sora-2' }],
			generateVideo: vi.fn().mockResolvedValue({
				status: 'error',
				error: 'Provider error'
			})
		} as any);

		// DB errors during error record storage should not mask the original error
		mockDB.run.mockRejectedValueOnce(new Error('DB error'));

		const { POST } = await import('../../src/routes/api/video/generate/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ prompt: 'test' })
				}),
				platform: mockPlatform,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(502);
		}
	});
});

// ─────────────────────────────────────
// GET /api/video/[id]/stream
// ─────────────────────────────────────
describe('GET /api/video/[id]/stream', () => {
	it('should return 401 when not authenticated', async () => {
		const { GET } = await import('../../src/routes/api/video/[id]/stream/+server');
		try {
			await GET({
				params: { id: 'gen-1' },
				platform: mockPlatform,
				locals: { user: null }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 500 when platform not available', async () => {
		const { GET } = await import('../../src/routes/api/video/[id]/stream/+server');
		try {
			await GET({
				params: { id: 'gen-1' },
				platform: { env: undefined },
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('should return 404 when generation not found', async () => {
		const { GET } = await import('../../src/routes/api/video/[id]/stream/+server');
		mockDB.first.mockResolvedValueOnce(null);
		try {
			await GET({
				params: { id: 'nonexistent' },
				platform: mockPlatform,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});

	it('should return immediately for already complete generation', async () => {
		const { GET } = await import('../../src/routes/api/video/[id]/stream/+server');
		mockDB.first.mockResolvedValueOnce({
			id: 'gen-1',
			status: 'complete',
			video_url: 'http://example.com/video.mp4',
			provider: 'openai',
			provider_job_id: 'job-1',
			model: 'sora-2'
		});

		const response = await GET({
			params: { id: 'gen-1' },
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		expect(response.headers.get('Content-Type')).toBe('text/event-stream');
		const result = await readStreamResponse(response);
		expect(result).toContain('"status":"complete"');
		expect(result).toContain('"progress":100');
	});

	it('should return immediately for errored generation', async () => {
		const { GET } = await import('../../src/routes/api/video/[id]/stream/+server');
		mockDB.first.mockResolvedValueOnce({
			id: 'gen-1',
			status: 'error',
			video_url: null,
			provider: 'openai',
			provider_job_id: 'job-1',
			model: 'sora-2'
		});

		const response = await GET({
			params: { id: 'gen-1' },
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const result = await readStreamResponse(response);
		expect(result).toContain('"status":"error"');
		expect(result).toContain('"progress":0');
	});

	it('should return 503 when video key no longer available', async () => {
		const { getEnabledVideoKey } = await import('$lib/services/video-registry');
		vi.mocked(getEnabledVideoKey).mockResolvedValue(null);

		const { GET } = await import('../../src/routes/api/video/[id]/stream/+server');
		mockDB.first.mockResolvedValueOnce({
			id: 'gen-1',
			status: 'pending',
			provider: 'openai',
			provider_job_id: 'job-1',
			model: 'sora-2'
		});

		try {
			await GET({
				params: { id: 'gen-1' },
				platform: mockPlatform,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(503);
		}
	});

	it('should return 503 when provider not supported', async () => {
		const { getEnabledVideoKey, getVideoProvider } = await import('$lib/services/video-registry');
		vi.mocked(getEnabledVideoKey).mockResolvedValue({
			provider: 'unknown',
			apiKey: 'key'
		} as any);
		vi.mocked(getVideoProvider).mockReturnValue(null);

		const { GET } = await import('../../src/routes/api/video/[id]/stream/+server');
		mockDB.first.mockResolvedValueOnce({
			id: 'gen-1',
			status: 'pending',
			provider: 'unknown',
			provider_job_id: 'job-1',
			model: 'sora-2'
		});

		try {
			await GET({
				params: { id: 'gen-1' },
				platform: mockPlatform,
				locals: mockLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(503);
		}
	});

	it('should poll and stream completion with R2 upload', async () => {
		vi.useFakeTimers();
		const { getEnabledVideoKey, getVideoProvider } = await import('$lib/services/video-registry');
		vi.mocked(getEnabledVideoKey).mockResolvedValue({
			provider: 'openai',
			apiKey: 'key'
		} as any);

		let pollCount = 0;
		vi.mocked(getVideoProvider).mockReturnValue({
			getAvailableModels: () => [{ id: 'sora-2', pricing: { estimatedCostPerSecond: 0.5 } }],
			getStatus: vi.fn().mockImplementation(async () => {
				pollCount++;
				if (pollCount === 1) {
					return { status: 'processing', progress: 50 };
				}
				return {
					status: 'complete',
					videoUrl: 'http://example.com/video.mp4',
					thumbnailUrl: 'http://example.com/thumb.jpg',
					duration: 5
				};
			}),
			downloadVideo: vi.fn().mockResolvedValue(new ArrayBuffer(100))
		} as any);

		const { GET } = await import('../../src/routes/api/video/[id]/stream/+server');
		mockDB.first.mockResolvedValueOnce({
			id: 'gen-1',
			status: 'pending',
			provider: 'openai',
			provider_job_id: 'job-1',
			model: 'sora-2',
			duration_seconds: 5,
			message_id: 'msg-1',
			conversation_id: 'conv-1',
			resolution: null
		});

		const response = await GET({
			params: { id: 'gen-1' },
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		expect(response.headers.get('Content-Type')).toBe('text/event-stream');

		// Start reading in a promise; advance fake timers to trigger second poll
		const readPromise = readStreamResponse(response);

		// Let initial poll resolve
		await vi.advanceTimersByTimeAsync(100);
		// Advance past 5s interval for second poll
		await vi.advanceTimersByTimeAsync(5100);
		// Allow async work to settle
		await vi.advanceTimersByTimeAsync(100);

		const result = await readPromise;

		expect(result).toContain('"status":"processing"');
		expect(result).toContain('"status":"complete"');

		vi.useRealTimers();
	});

	it('should handle poll error from provider status', async () => {
		vi.useFakeTimers();
		const { getEnabledVideoKey, getVideoProvider } = await import('$lib/services/video-registry');
		vi.mocked(getEnabledVideoKey).mockResolvedValue({
			provider: 'openai',
			apiKey: 'key'
		} as any);

		let callCount = 0;
		vi.mocked(getVideoProvider).mockReturnValue({
			getAvailableModels: () => [{ id: 'sora-2' }],
			getStatus: vi.fn().mockImplementation(async () => {
				callCount++;
				if (callCount === 1) {
					throw new Error('Network error');
				}
				return { status: 'complete', videoUrl: 'http://example.com/v.mp4' };
			}),
			downloadVideo: vi.fn().mockRejectedValue(new Error('download failed'))
		} as any);

		const { GET } = await import('../../src/routes/api/video/[id]/stream/+server');
		mockDB.first.mockResolvedValueOnce({
			id: 'gen-1',
			status: 'generating',
			provider: 'openai',
			provider_job_id: 'job-1',
			model: 'sora-2',
			duration_seconds: null,
			message_id: null,
			conversation_id: null,
			resolution: null
		});

		const response = await GET({
			params: { id: 'gen-1' },
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const readPromise = readStreamResponse(response);

		// Let initial poll (error) resolve
		await vi.advanceTimersByTimeAsync(100);
		// Advance past 5s interval for second poll (complete)
		await vi.advanceTimersByTimeAsync(5100);
		// Allow async work to settle
		await vi.advanceTimersByTimeAsync(100);

		const result = await readPromise;

		// Should contain temporary polling error then complete
		expect(result).toContain('Temporary polling error');
		expect(result).toContain('"status":"complete"');

		vi.useRealTimers();
	});

	it('should handle error status from provider', async () => {
		const { getEnabledVideoKey, getVideoProvider } = await import('$lib/services/video-registry');
		vi.mocked(getEnabledVideoKey).mockResolvedValue({
			provider: 'openai',
			apiKey: 'key'
		} as any);
		vi.mocked(getVideoProvider).mockReturnValue({
			getAvailableModels: () => [{ id: 'sora-2' }],
			getStatus: vi.fn().mockResolvedValue({
				status: 'error',
				error: 'Provider error'
			})
		} as any);

		const { GET } = await import('../../src/routes/api/video/[id]/stream/+server');
		mockDB.first.mockResolvedValueOnce({
			id: 'gen-1',
			status: 'generating',
			provider: 'openai',
			provider_job_id: 'job-1',
			model: 'sora-2',
			duration_seconds: null,
			message_id: 'msg-1',
			conversation_id: null,
			resolution: null
		});

		const response = await GET({
			params: { id: 'gen-1' },
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const result = await readStreamResponse(response);

		expect(result).toContain('"status":"error"');
		expect(result).toContain('"error":"Provider error"');
	});

	it('should handle DB update errors during completion', async () => {
		const { getEnabledVideoKey, getVideoProvider } = await import('$lib/services/video-registry');
		vi.mocked(getEnabledVideoKey).mockResolvedValue({
			provider: 'openai',
			apiKey: 'key'
		} as any);
		vi.mocked(getVideoProvider).mockReturnValue({
			getAvailableModels: () => [{ id: 'sora-2', pricing: {} }],
			getStatus: vi.fn().mockResolvedValue({
				status: 'complete',
				videoUrl: 'http://example.com/v.mp4',
				duration: 5
			}),
			downloadVideo: vi.fn().mockResolvedValue(new ArrayBuffer(100))
		} as any);

		// DB errors should be caught gracefully
		mockDB.run.mockRejectedValue(new Error('DB error'));

		const { GET } = await import('../../src/routes/api/video/[id]/stream/+server');
		mockDB.first.mockResolvedValueOnce({
			id: 'gen-1',
			status: 'pending',
			provider: 'openai',
			provider_job_id: 'job-1',
			model: 'sora-2',
			duration_seconds: 5,
			message_id: null,
			conversation_id: null,
			resolution: null
		});

		const response = await GET({
			params: { id: 'gen-1' },
			platform: mockPlatform,
			locals: mockLocals
		} as any);

		const result = await readStreamResponse(response);

		// Should still complete even if DB update failed
		expect(result).toContain('"status":"complete"');
	});

	it('should handle complete without BUCKET available', async () => {
		const { getEnabledVideoKey, getVideoProvider } = await import('$lib/services/video-registry');
		vi.mocked(getEnabledVideoKey).mockResolvedValue({
			provider: 'openai',
			apiKey: 'key'
		} as any);
		vi.mocked(getVideoProvider).mockReturnValue({
			getAvailableModels: () => [{ id: 'sora-2' }],
			getStatus: vi.fn().mockResolvedValue({
				status: 'complete',
				videoUrl: 'http://example.com/v.mp4'
			}),
			downloadVideo: vi.fn()
		} as any);

		const platformNoBucket = {
			...mockPlatform,
			env: { ...mockPlatform.env, BUCKET: undefined }
		};

		const { GET } = await import('../../src/routes/api/video/[id]/stream/+server');
		mockDB.first.mockResolvedValueOnce({
			id: 'gen-1',
			status: 'pending',
			provider: 'openai',
			provider_job_id: 'job-1',
			model: 'sora-2',
			duration_seconds: null,
			message_id: null,
			conversation_id: null,
			resolution: null
		});

		const response = await GET({
			params: { id: 'gen-1' },
			platform: platformNoBucket,
			locals: mockLocals
		} as any);

		const result = await readStreamResponse(response);

		expect(result).toContain('"status":"complete"');
	});
});
