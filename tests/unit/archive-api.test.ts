/**
 * Tests for Archive API endpoints
 * Covers:
 *   - GET/PATCH/DELETE /api/archive
 *   - POST /api/archive/ai-save
 *   - GET /api/archive/file
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('$lib/services/file-archive', () => ({
	listFileArchive: vi.fn(),
	getFileArchiveEntry: vi.fn(),
	deleteFileArchiveEntry: vi.fn(),
	getArchiveFolders: vi.fn(),
	getArchiveStats: vi.fn(),
	toggleFileStar: vi.fn(),
	updateFileArchiveEntry: vi.fn(),
	createFileArchiveEntry: vi.fn()
}));

vi.mock('$lib/utils/attachments', () => ({
	getAttachmentType: vi.fn()
}));

import {
	listFileArchive,
	getFileArchiveEntry,
	deleteFileArchiveEntry,
	getArchiveFolders,
	getArchiveStats,
	toggleFileStar,
	updateFileArchiveEntry,
	createFileArchiveEntry
} from '$lib/services/file-archive';

beforeEach(() => {
	vi.resetModules();
	vi.restoreAllMocks();
});

// ─── Helpers ────────────────────────────────────────────────────

function makeUrl(path: string, params: Record<string, string> = {}) {
	const u = new URL(`http://localhost${path}`);
	for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
	return u;
}

const mockDB = { prepare: vi.fn() };
const mockBucket = { get: vi.fn(), put: vi.fn(), delete: vi.fn() };
const authedLocals = { user: { id: 'user-1' } };
const noUser = { user: null };

// ═══════════════════════════════════════════════════════════════
// GET /api/archive
// ═══════════════════════════════════════════════════════════════
describe('GET /api/archive', () => {
	it('should return 401 when not authenticated', async () => {
		const { GET } = await import('../../src/routes/api/archive/+server');
		try {
			await GET({
				url: makeUrl('/api/archive', { brandProfileId: 'bp-1' }),
				platform: { env: { DB: mockDB } },
				locals: noUser
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 500 when platform not available', async () => {
		const { GET } = await import('../../src/routes/api/archive/+server');
		try {
			await GET({
				url: makeUrl('/api/archive', { brandProfileId: 'bp-1' }),
				platform: { env: {} },
				locals: authedLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('should return 400 when brandProfileId missing', async () => {
		const { GET } = await import('../../src/routes/api/archive/+server');
		try {
			await GET({
				url: makeUrl('/api/archive'),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return folders when action=folders', async () => {
		const { GET } = await import('../../src/routes/api/archive/+server');
		vi.mocked(getArchiveFolders).mockResolvedValue(['/images', '/audio'] as any);

		const res = await GET({
			url: makeUrl('/api/archive', { brandProfileId: 'bp-1', action: 'folders' }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.folders).toEqual(['/images', '/audio']);
	});

	it('should return stats when action=stats', async () => {
		const { GET } = await import('../../src/routes/api/archive/+server');
		vi.mocked(getArchiveStats).mockResolvedValue({ total: 5 } as any);

		const res = await GET({
			url: makeUrl('/api/archive', { brandProfileId: 'bp-1', action: 'stats' }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.stats).toEqual({ total: 5 });
	});

	it('should list files with filters', async () => {
		const { GET } = await import('../../src/routes/api/archive/+server');
		vi.mocked(listFileArchive).mockResolvedValue({
			files: [{ id: 'f1', r2Key: 'archive/bp-1/img.png', fileName: 'img.png' }],
			total: 1
		} as any);

		const res = await GET({
			url: makeUrl('/api/archive', {
				brandProfileId: 'bp-1',
				fileType: 'image',
				source: 'user_upload',
				context: 'onboarding',
				search: 'logo',
				starred: 'true',
				limit: '10',
				offset: '0'
			}),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.files).toHaveLength(1);
		expect(data.files[0].url).toContain('/api/archive/file?key=');
		expect(data.total).toBe(1);
		expect(vi.mocked(listFileArchive)).toHaveBeenCalledWith(
			mockDB,
			expect.objectContaining({
				brandProfileId: 'bp-1',
				fileType: 'image',
				source: 'user_upload',
				context: 'onboarding',
				search: 'logo',
				isStarred: true,
				limit: 10,
				offset: 0
			})
		);
	});

	it('should handle starred=false filter', async () => {
		const { GET } = await import('../../src/routes/api/archive/+server');
		vi.mocked(listFileArchive).mockResolvedValue({ files: [], total: 0 } as any);

		await GET({
			url: makeUrl('/api/archive', { brandProfileId: 'bp-1', starred: 'false' }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		expect(vi.mocked(listFileArchive)).toHaveBeenCalledWith(
			mockDB,
			expect.objectContaining({
				isStarred: false
			})
		);
	});

	it('should use default limit/offset when not provided', async () => {
		const { GET } = await import('../../src/routes/api/archive/+server');
		vi.mocked(listFileArchive).mockResolvedValue({ files: [], total: 0 } as any);

		await GET({
			url: makeUrl('/api/archive', { brandProfileId: 'bp-1' }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		expect(vi.mocked(listFileArchive)).toHaveBeenCalledWith(
			mockDB,
			expect.objectContaining({
				limit: 50,
				offset: 0
			})
		);
	});
});

// ═══════════════════════════════════════════════════════════════
// PATCH /api/archive
// ═══════════════════════════════════════════════════════════════
describe('PATCH /api/archive', () => {
	it('should return 401 when not authenticated', async () => {
		const { PATCH } = await import('../../src/routes/api/archive/+server');
		try {
			await PATCH({
				request: new Request('http://localhost', {
					method: 'PATCH',
					body: JSON.stringify({ id: 'f1' })
				}),
				platform: { env: { DB: mockDB } },
				locals: noUser
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 400 when id missing', async () => {
		const { PATCH } = await import('../../src/routes/api/archive/+server');
		try {
			await PATCH({
				request: new Request('http://localhost', {
					method: 'PATCH',
					body: JSON.stringify({})
				}),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should toggle star when action=star', async () => {
		const { PATCH } = await import('../../src/routes/api/archive/+server');
		vi.mocked(toggleFileStar).mockResolvedValue(true);

		const res = await PATCH({
			request: new Request('http://localhost', {
				method: 'PATCH',
				body: JSON.stringify({ id: 'f1', action: 'star' })
			}),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.isStarred).toBe(true);
	});

	it('should update file entry', async () => {
		const { PATCH } = await import('../../src/routes/api/archive/+server');
		vi.mocked(updateFileArchiveEntry).mockResolvedValue({
			id: 'f1',
			r2Key: 'archive/bp-1/img.png',
			description: 'updated'
		} as any);

		const res = await PATCH({
			request: new Request('http://localhost', {
				method: 'PATCH',
				body: JSON.stringify({ id: 'f1', description: 'updated' })
			}),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.file.description).toBe('updated');
		expect(data.file.url).toContain('/api/archive/file?key=');
	});

	it('should return 404 when file not found on update', async () => {
		const { PATCH } = await import('../../src/routes/api/archive/+server');
		vi.mocked(updateFileArchiveEntry).mockResolvedValue(null);

		try {
			await PATCH({
				request: new Request('http://localhost', {
					method: 'PATCH',
					body: JSON.stringify({ id: 'nonexistent', description: 'x' })
				}),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// DELETE /api/archive
// ═══════════════════════════════════════════════════════════════
describe('DELETE /api/archive', () => {
	it('should return 401 when not authenticated', async () => {
		const { DELETE } = await import('../../src/routes/api/archive/+server');
		try {
			await DELETE({
				url: makeUrl('/api/archive', { id: 'f1' }),
				platform: { env: { DB: mockDB, BUCKET: mockBucket } },
				locals: noUser
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 500 when BUCKET not available', async () => {
		const { DELETE } = await import('../../src/routes/api/archive/+server');
		try {
			await DELETE({
				url: makeUrl('/api/archive', { id: 'f1' }),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('should return 400 when id missing', async () => {
		const { DELETE } = await import('../../src/routes/api/archive/+server');
		try {
			await DELETE({
				url: makeUrl('/api/archive'),
				platform: { env: { DB: mockDB, BUCKET: mockBucket } },
				locals: authedLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return 404 when entry not found', async () => {
		const { DELETE } = await import('../../src/routes/api/archive/+server');
		vi.mocked(getFileArchiveEntry).mockResolvedValue(null);

		try {
			await DELETE({
				url: makeUrl('/api/archive', { id: 'f1' }),
				platform: { env: { DB: mockDB, BUCKET: mockBucket } },
				locals: authedLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});

	it('should return 403 when user does not own file', async () => {
		const { DELETE } = await import('../../src/routes/api/archive/+server');
		vi.mocked(getFileArchiveEntry).mockResolvedValue({
			id: 'f1',
			userId: 'other-user',
			r2Key: 'archive/bp-1/img.png'
		} as any);

		try {
			await DELETE({
				url: makeUrl('/api/archive', { id: 'f1' }),
				platform: { env: { DB: mockDB, BUCKET: mockBucket } },
				locals: authedLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(403);
		}
	});

	it('should delete file from R2 and DB', async () => {
		const { DELETE } = await import('../../src/routes/api/archive/+server');
		vi.mocked(getFileArchiveEntry).mockResolvedValue({
			id: 'f1',
			userId: 'user-1',
			r2Key: 'archive/bp-1/img.png'
		} as any);
		mockBucket.delete.mockResolvedValue(undefined);
		vi.mocked(deleteFileArchiveEntry).mockResolvedValue(undefined as any);

		const res = await DELETE({
			url: makeUrl('/api/archive', { id: 'f1' }),
			platform: { env: { DB: mockDB, BUCKET: mockBucket } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.success).toBe(true);
		expect(mockBucket.delete).toHaveBeenCalledWith('archive/bp-1/img.png');
		expect(deleteFileArchiveEntry).toHaveBeenCalledWith(mockDB, 'f1');
	});

	it('should still delete DB record when R2 deletion fails', async () => {
		const { DELETE } = await import('../../src/routes/api/archive/+server');
		vi.mocked(getFileArchiveEntry).mockResolvedValue({
			id: 'f1',
			userId: 'user-1',
			r2Key: 'archive/bp-1/img.png'
		} as any);
		mockBucket.delete.mockRejectedValue(new Error('R2 failed'));
		vi.mocked(deleteFileArchiveEntry).mockResolvedValue(undefined as any);
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const res = await DELETE({
			url: makeUrl('/api/archive', { id: 'f1' }),
			platform: { env: { DB: mockDB, BUCKET: mockBucket } },
			locals: authedLocals
		} as any);
		const data = await res.json();
		expect(data.success).toBe(true);
		expect(deleteFileArchiveEntry).toHaveBeenCalledWith(mockDB, 'f1');
		consoleSpy.mockRestore();
	});
});

// ═══════════════════════════════════════════════════════════════
// GET /api/archive/file
// ═══════════════════════════════════════════════════════════════
describe('GET /api/archive/file', () => {
	it('should return 401 when not authenticated', async () => {
		const { GET } = await import('../../src/routes/api/archive/file/+server');
		try {
			await GET({
				url: makeUrl('/api/archive/file', { key: 'archive/bp-1/img.png' }),
				platform: { env: { BUCKET: mockBucket } },
				locals: noUser
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 500 when BUCKET not available', async () => {
		const { GET } = await import('../../src/routes/api/archive/file/+server');
		try {
			await GET({
				url: makeUrl('/api/archive/file', { key: 'k' }),
				platform: { env: {} },
				locals: authedLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('should return 400 when key missing', async () => {
		const { GET } = await import('../../src/routes/api/archive/file/+server');
		try {
			await GET({
				url: makeUrl('/api/archive/file'),
				platform: { env: { BUCKET: mockBucket } },
				locals: authedLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should return 404 when object not in R2', async () => {
		const { GET } = await import('../../src/routes/api/archive/file/+server');
		mockBucket.get.mockResolvedValue(null);

		try {
			await GET({
				url: makeUrl('/api/archive/file', { key: 'missing.png' }),
				platform: { env: { BUCKET: mockBucket } },
				locals: authedLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});

	it('should serve file with correct headers', async () => {
		const { GET } = await import('../../src/routes/api/archive/file/+server');
		const mockBody = new ReadableStream();
		mockBucket.get.mockResolvedValue({
			body: mockBody,
			size: 5000,
			httpMetadata: { contentType: 'image/png' }
		});

		const res = await GET({
			url: makeUrl('/api/archive/file', { key: 'archive/bp-1/img.png' }),
			platform: { env: { BUCKET: mockBucket } },
			locals: authedLocals
		} as any);
		expect(res.headers.get('Content-Type')).toBe('image/png');
		expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
		expect(res.headers.get('Content-Length')).toBe('5000');
	});

	it('should default content type to application/octet-stream', async () => {
		const { GET } = await import('../../src/routes/api/archive/file/+server');
		mockBucket.get.mockResolvedValue({
			body: new ReadableStream(),
			size: 0,
			httpMetadata: {}
		});

		const res = await GET({
			url: makeUrl('/api/archive/file', { key: 'archive/bp-1/data.bin' }),
			platform: { env: { BUCKET: mockBucket } },
			locals: authedLocals
		} as any);
		expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
	});
});

// ═══════════════════════════════════════════════════════════════
// POST /api/archive/ai-save
// ═══════════════════════════════════════════════════════════════
describe('POST /api/archive/ai-save', () => {
	it('should return 401 when not authenticated', async () => {
		const { POST } = await import('../../src/routes/api/archive/ai-save/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({})
				}),
				platform: { env: { DB: mockDB, BUCKET: mockBucket } },
				locals: noUser
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('should return 500 when platform not available', async () => {
		const { POST } = await import('../../src/routes/api/archive/ai-save/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({})
				}),
				platform: { env: {} },
				locals: authedLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});

	it('should return 400 when required fields missing', async () => {
		const { POST } = await import('../../src/routes/api/archive/ai-save/+server');

		for (const missing of ['brandProfileId', 'sourceUrl', 'fileName', 'fileType']) {
			const body: Record<string, string> = {
				brandProfileId: 'bp-1',
				sourceUrl: 'https://example.com/img.png',
				fileName: 'test.png',
				fileType: 'image'
			};
			delete body[missing];

			try {
				await POST({
					request: new Request('http://localhost', {
						method: 'POST',
						body: JSON.stringify(body)
					}),
					platform: { env: { DB: mockDB, BUCKET: mockBucket } },
					locals: authedLocals
				} as any);
				expect.fail(`Should have thrown for missing ${missing}`);
			} catch (err: any) {
				expect(err.status).toBe(400);
			}
		}
	});

	it('should handle data URL source', async () => {
		const { POST } = await import('../../src/routes/api/archive/ai-save/+server');
		vi.mocked(createFileArchiveEntry).mockResolvedValue({
			id: 'fa-1',
			r2Key: 'archive/bp-1/ai-generated/images/2026-01-01_abc123.png',
			fileName: 'generated.png',
			fileType: 'image',
			folder: '/ai-generated/images'
		} as any);
		mockBucket.put.mockResolvedValue(undefined);

		// Small 1x1 PNG as base64
		const pngBase64 =
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
		const dataUrl = `data:image/png;base64,${pngBase64}`;

		const res = await POST({
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					brandProfileId: 'bp-1',
					sourceUrl: dataUrl,
					fileName: 'generated.png',
					fileType: 'image',
					context: 'chat',
					aiPrompt: 'a logo',
					aiModel: 'dall-e-3'
				})
			}),
			platform: { env: { DB: mockDB, BUCKET: mockBucket } },
			locals: authedLocals
		} as any);
		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data.id).toBe('fa-1');
		expect(data.url).toContain('/api/archive/file?key=');
		expect(mockBucket.put).toHaveBeenCalled();
	});

	it('should return 400 for invalid data URL', async () => {
		const { POST } = await import('../../src/routes/api/archive/ai-save/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({
						brandProfileId: 'bp-1',
						sourceUrl: 'data:invalid',
						fileName: 'bad.png',
						fileType: 'image'
					})
				}),
				platform: { env: { DB: mockDB, BUCKET: mockBucket } },
				locals: authedLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('should fetch from external URL and store', async () => {
		const { POST } = await import('../../src/routes/api/archive/ai-save/+server');
		vi.mocked(createFileArchiveEntry).mockResolvedValue({
			id: 'fa-2',
			r2Key: 'archive/bp-1/ai-generated/images/2026-01-01_xyz.png',
			fileName: 'ext.png',
			fileType: 'image',
			folder: '/ai-generated/images'
		} as any);
		mockBucket.put.mockResolvedValue(undefined);

		const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			new Response(new ArrayBuffer(100), {
				status: 200,
				headers: { 'content-type': 'image/png' }
			})
		);

		const res = await POST({
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					brandProfileId: 'bp-1',
					sourceUrl: 'https://example.com/img.png',
					fileName: 'ext.png',
					fileType: 'image'
				})
			}),
			platform: { env: { DB: mockDB, BUCKET: mockBucket } },
			locals: authedLocals
		} as any);
		expect(res.status).toBe(201);
		mockFetch.mockRestore();
	});

	it('should return 502 when external fetch fails', async () => {
		const { POST } = await import('../../src/routes/api/archive/ai-save/+server');
		const mockFetch = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(new Response(null, { status: 500 }));

		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({
						brandProfileId: 'bp-1',
						sourceUrl: 'https://example.com/bad.png',
						fileName: 'bad.png',
						fileType: 'image'
					})
				}),
				platform: { env: { DB: mockDB, BUCKET: mockBucket } },
				locals: authedLocals
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(502);
		} finally {
			mockFetch.mockRestore();
		}
	});
});
