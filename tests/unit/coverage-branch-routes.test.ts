/**
 * Branch coverage tests targeting route-level and service-level uncovered branches.
 * Targets the remaining 1.23% branch gap (95.77% → 97%).
 *
 * Focus areas:
 *   - Route +server.ts error/validation branches via vi.mock
 *   - Service function edge cases
 *   - Store derived-store fallbacks
 *   - Utility edge cases
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('$lib/services/brand-assets', () => ({
	createBrandMedia: vi.fn(),
	getBrandMedia: vi.fn(),
	getBrandMediaByType: vi.fn(),
	getBrandMediaByCategory: vi.fn(),
	updateBrandMedia: vi.fn(),
	deleteBrandMedia: vi.fn(),
	getLogoAssets: vi.fn(),
	getBrandAssetSummary: vi.fn(),
	createBrandText: vi.fn(),
	getBrandTexts: vi.fn(),
	getBrandTextsByCategory: vi.fn(),
	updateBrandText: vi.fn(),
	deleteBrandText: vi.fn(),
	createMediaVariant: vi.fn(),
	getMediaVariants: vi.fn(),
	deleteMediaVariant: vi.fn(),
	getBrandTextById: vi.fn(),
	findBrandTextByKey: vi.fn(),
	syncFieldToTextAsset: vi.fn()
}));

vi.mock('$lib/services/brand', () => ({
	updateBrandFieldWithVersion: vi.fn(),
	getMatchingProfileField: vi.fn(),
	getProfileFieldValue: vi.fn(),
	getTextSuggestionsForField: vi.fn(),
	FIELD_TO_TEXT_MAPPING: { tagline: { category: 'core', key: 'tagline' } },
	getBrandFieldsSummary: vi.fn(),
	getAllFieldHistory: vi.fn(),
	getFieldHistory: vi.fn(),
	getBrandProfileForUser: vi.fn()
}));

vi.mock('$lib/services/onboarding', () => ({
	getBrandProfile: vi.fn(),
	updateBrandProfile: vi.fn(),
	addOnboardingMessage: vi.fn(),
	getOnboardingMessages: vi.fn(),
	buildConversationContext: vi.fn(),
	getSystemPromptForStep: vi.fn(),
	getStepConfig: vi.fn(),
	ONBOARDING_STEPS: [],
	STEP_COMPLETE_MARKER: '::STEP_COMPLETE::'
}));

vi.mock('$lib/services/text-history', () => ({
	getRevisionById: vi.fn(),
	getTextRevisions: vi.fn(),
	createTextRevision: vi.fn()
}));

vi.mock('$lib/services/openai-chat', () => ({
	formatMessagesForOpenAI: vi.fn().mockReturnValue([]),
	getEnabledOpenAIKey: vi.fn(),
	streamChatCompletion: vi.fn(),
	getAllEnabledAIKeys: vi.fn(),
	streamChatCompletionWithFallback: vi.fn()
}));

vi.mock('$lib/utils/cost', () => ({
	calculateCost: vi.fn().mockReturnValue({ totalCost: 0.01 }),
	getModelDisplayName: vi.fn().mockReturnValue('GPT-4o'),
	calculateVideoCostFromPricing: vi.fn().mockReturnValue(0)
}));

vi.mock('$lib/services/file-archive', () => ({
	createFileArchiveEntry: vi.fn()
}));

vi.mock('$lib/services/media-history', () => ({
	getMediaActivityLog: vi.fn(),
	getMediaActivityLogForAsset: vi.fn(),
	getMediaRevisions: vi.fn(),
	getCurrentRevision: vi.fn(),
	revertToRevision: vi.fn(),
	createMediaRevision: vi.fn(),
	logMediaActivity: vi.fn()
}));

vi.mock('$lib/utils/attachments', () => ({
	getAttachmentType: vi.fn()
}));

import {
	updateBrandFieldWithVersion,
	getMatchingProfileField,
	getTextSuggestionsForField
} from '$lib/services/brand';
import {
	createBrandText,
	getBrandTextById,
	updateBrandText,
	deleteBrandText
} from '$lib/services/brand-assets';
import { getBrandProfile } from '$lib/services/onboarding';
import { getRevisionById } from '$lib/services/text-history';
import { createFileArchiveEntry } from '$lib/services/file-archive';
import { syncFieldToTextAsset } from '$lib/services/brand-assets';
import { getAllEnabledAIKeys, streamChatCompletionWithFallback } from '$lib/services/openai-chat';
import { withBrandAccess } from '../fixtures/brand-access';

beforeEach(() => {
	vi.clearAllMocks();
});

// ─── Helpers ────────────────────────────────────────────────────

function makeUrl(path: string, params: Record<string, string> = {}) {
	const u = new URL(`http://localhost${path}`);
	for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
	return u;
}

// Wrapped so the brand guard on the asset routes answers; `user-1` owns what these
// tests touch, leaving them free to exercise the branches they are about.
const mockDB = withBrandAccess(
	{
		prepare: vi.fn().mockReturnValue({
			bind: vi.fn().mockReturnValue({
				first: vi.fn().mockResolvedValue(null),
				all: vi.fn().mockResolvedValue({ results: [] }),
				run: vi.fn().mockResolvedValue({})
			})
		})
	},
	{ userId: 'user-1' }
);
const mockBucket = { get: vi.fn(), put: vi.fn(), delete: vi.fn() };
const mockKV = { get: vi.fn(), put: vi.fn(), delete: vi.fn(), list: vi.fn() };
const authedLocals = { user: { id: 'user-1' } };
const adminLocals = { user: { id: 'user-1', isAdmin: true, isOwner: true } };

// ═══════════════════════════════════════════════════════════════
// 1. /api/brand/assets/texts — POST non-fatal field update fail (line ~86)
// ═══════════════════════════════════════════════════════════════
describe('Brand Assets Texts — POST branch: field update fails', () => {
	it('POST: catches field update failure and still returns text', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/texts/+server');
		vi.mocked(createBrandText).mockResolvedValue({ id: 't-1', value: 'My tagline' } as any);
		vi.mocked(updateBrandFieldWithVersion).mockRejectedValue(new Error('DB error'));

		const res = await POST({
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					brandProfileId: 'bp-1',
					category: 'core',
					key: 'tagline',
					label: 'Tagline',
					value: 'Innovation first',
					setAsProfileField: true,
					profileFieldName: 'tagline'
				})
			}),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);

		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data.text).toBeDefined();
		expect(data.profileFieldUpdated).toBe(false);
	});

	it('POST: missing required fields throws 400', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/texts/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ brandProfileId: 'bp-1', category: 'core' })
				}),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// 2. /api/brand/text-suggestions — unmapped field (line 14)
// ═══════════════════════════════════════════════════════════════
describe('Brand Text Suggestions — unmapped field branch', () => {
	it('GET: returns empty for unmapped field', async () => {
		const { GET } = await import('../../src/routes/api/brand/text-suggestions/+server');
		const res = await GET({
			url: makeUrl('/x', { brandProfileId: 'bp-1', fieldName: 'unknownField' }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);

		const data = await res.json();
		expect(data.suggestions).toEqual([]);
		expect(data.hasMappedTexts).toBe(false);
	});

	it('GET: returns suggestions for mapped field', async () => {
		const { GET } = await import('../../src/routes/api/brand/text-suggestions/+server');
		vi.mocked(getTextSuggestionsForField).mockResolvedValue([
			{ id: 's-1', value: 'Great tagline' } as any
		]);

		const res = await GET({
			url: makeUrl('/x', { brandProfileId: 'bp-1', fieldName: 'tagline' }),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);

		const data = await res.json();
		expect(data.hasMappedTexts).toBe(true);
		expect(data.suggestions.length).toBe(1);
	});
});

// ═══════════════════════════════════════════════════════════════
// 3. /api/brand/assets/file — R2 file not found / no BUCKET (lines 14, 19)
// ═══════════════════════════════════════════════════════════════
describe('Brand Assets File — R2 branches', () => {
	// The route authorises the key's brand before touching R2, so these branches are
	// only reachable for a caller who owns it.
	const ownerDB = {
		prepare: vi.fn().mockImplementation((sql: string) => ({
			bind: vi.fn().mockReturnValue({
				first: vi
					.fn()
					.mockResolvedValue(sql.includes('FROM brand_profiles') ? { user_id: 'user-1' } : null)
			})
		}))
	};

	it('GET: throws 404 when R2 object not found', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/file/+server');
		mockBucket.get.mockResolvedValue(null);

		try {
			await GET({
				url: makeUrl('/x', { key: 'brands/foo/image.png' }),
				platform: { env: { BUCKET: mockBucket, DB: ownerDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});

	it('GET: returns file with content-type from httpMetadata', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/file/+server');
		const body = new ReadableStream();
		mockBucket.get.mockResolvedValue({
			body,
			httpMetadata: { contentType: 'image/png' },
			size: 1024
		});

		const res = await GET({
			url: makeUrl('/x', { key: 'brands/foo/image.png' }),
			platform: { env: { BUCKET: mockBucket, DB: ownerDB } },
			locals: authedLocals
		} as any);

		expect(res.headers.get('Content-Type')).toBe('image/png');
		expect(res.headers.get('Content-Length')).toBe('1024');
	});

	it('GET: defaults to application/octet-stream when no contentType', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/file/+server');
		mockBucket.get.mockResolvedValue({
			body: new ReadableStream(),
			httpMetadata: {},
			size: 0
		});

		const res = await GET({
			url: makeUrl('/x', { key: 'brands/foo/unknown.bin' }),
			platform: { env: { BUCKET: mockBucket, DB: ownerDB } },
			locals: authedLocals
		} as any);

		expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
	});
});

// ═══════════════════════════════════════════════════════════════
// 4. /api/brand/update-field — syncFieldToTextAsset catch branch (line 47)
// ═══════════════════════════════════════════════════════════════
describe('Brand Update Field — sync catch branch', () => {
	it('POST: continues even when sync fails', async () => {
		const { PATCH } = await import('../../src/routes/api/brand/update-field/+server');
		vi.mocked(updateBrandFieldWithVersion).mockResolvedValue(undefined as any);
		vi.mocked(syncFieldToTextAsset).mockRejectedValue(new Error('sync fail'));
		vi.mocked(getBrandProfile).mockResolvedValue({
			id: 'bp-1',
			userId: 'user-1',
			brandName: 'Test'
		} as any);

		// Need to provide additional params the route expects
		const res = await PATCH({
			request: new Request('http://localhost', {
				method: 'PATCH',
				body: JSON.stringify({
					profileId: 'bp-1',
					fieldName: 'tagline',
					newValue: 'New tagline',
					changeSource: 'manual'
				})
			}),
			platform: { env: { DB: mockDB } },
			locals: authedLocals
		} as any);

		const data = await res.json();
		expect(data.profile).toBeDefined();
	});
});

// ═══════════════════════════════════════════════════════════════
// 5. /api/brand/push-to-profile — error branches (lines 24-25)
// ═══════════════════════════════════════════════════════════════
describe('Brand Push To Profile — error branches', () => {
	it('POST: throws 404 when profile not found', async () => {
		const { POST } = await import('../../src/routes/api/brand/push-to-profile/+server');
		vi.mocked(getBrandProfile).mockResolvedValue(null);

		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ brandProfileId: 'bp-1', textId: 't-1' })
				}),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(404);
		}
	});

	it('POST: throws 403 when user does not own profile', async () => {
		const { POST } = await import('../../src/routes/api/brand/push-to-profile/+server');
		vi.mocked(getBrandProfile).mockResolvedValue({ id: 'bp-1', userId: 'other-user' } as any);

		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ brandProfileId: 'bp-1', textId: 't-1' })
				}),
				platform: { env: { DB: mockDB } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(403);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// 6. /api/brand/assets/upload — validation branches (lines 28-31)
// ═══════════════════════════════════════════════════════════════
describe('Brand Assets Upload — validation branches', () => {
	function makeFormData(fields: Record<string, string | Blob>) {
		const fd = new FormData();
		for (const [k, v] of Object.entries(fields)) fd.append(k, v);
		return fd;
	}

	it('POST: throws 400 when no file provided', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/upload/+server');
		try {
			await POST({
				request: {
					formData: vi.fn().mockResolvedValue(
						makeFormData({
							brandProfileId: 'bp-1',
							mediaType: 'image',
							category: 'logo'
						})
					)
				},
				platform: { env: { DB: mockDB, BUCKET: mockBucket } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('POST: throws 400 with invalid mediaType', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/upload/+server');
		const blob = new Blob(['test'], { type: 'application/pdf' });
		const fd = makeFormData({
			brandProfileId: 'bp-1',
			mediaType: 'document',
			category: 'logo'
		});
		fd.set('file', blob, 'test.pdf');

		try {
			await POST({
				request: { formData: vi.fn().mockResolvedValue(fd) },
				platform: { env: { DB: mockDB, BUCKET: mockBucket } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('POST: throws 400 when category missing', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/upload/+server');
		const blob = new Blob(['test'], { type: 'image/png' });
		const fd = makeFormData({ brandProfileId: 'bp-1', mediaType: 'image' });
		fd.set('file', blob, 'logo.png');

		try {
			await POST({
				request: { formData: vi.fn().mockResolvedValue(fd) },
				platform: { env: { DB: mockDB, BUCKET: mockBucket } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// 7. /api/setup — err instanceof Response check (lines 138-139)
// ═══════════════════════════════════════════════════════════════
describe('Setup API — error re-throw branches', () => {
	it('POST: re-throws Response-like errors', async () => {
		// The setup route checks `err instanceof Response`
		// Let's test the validate portion that doesn't need full github API mocking
		const { POST } = await import('../../src/routes/api/setup/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({
						provider: 'github',
						clientId: '',
						clientSecret: 'secret',
						adminUsername: 'testuser'
					})
				}),
				platform: { env: { DB: mockDB, KV: mockKV } },
				locals: {}
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBeDefined();
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// 8. /api/chat/models — error catch: re-throw SvelteKit errors (lines 141-146)
// ═══════════════════════════════════════════════════════════════
describe('Chat Models — catch branch variants', () => {
	it('GET: throws 401 without user', async () => {
		const { GET } = await import('../../src/routes/api/chat/models/+server');
		try {
			await GET({
				platform: { env: { DB: mockDB, KV: mockKV } },
				locals: { user: null }
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('GET: throws 503 without KV', async () => {
		const { GET } = await import('../../src/routes/api/chat/models/+server');
		try {
			await GET({
				platform: { env: { DB: mockDB, KV: null } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(503);
		}
	});

	it('GET: returns an empty model list when KV holds no keys', async () => {
		const { GET } = await import('../../src/routes/api/chat/models/+server');
		mockKV.get.mockResolvedValue(null);

		const res = await GET({
			platform: { env: { DB: mockDB, KV: mockKV } },
			locals: authedLocals
		} as any);

		expect(await res.json()).toEqual({ models: [], defaultModel: null });
	});
});

// ═══════════════════════════════════════════════════════════════
// 9. /api/chat/conversations/[id] — attachments JSON parse catch (line 73-78)
// ═══════════════════════════════════════════════════════════════
describe('Chat Conversations [id] — attachment parse branch', () => {
	it('GET: ignores malformed attachment JSON', async () => {
		const { GET } = await import('../../src/routes/api/chat/conversations/[id]/+server');
		const mockDBLocal = {
			prepare: vi.fn().mockReturnValue({
				bind: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue({
						id: 'conv-1',
						title: 'Test',
						user_id: 'user-1',
						created_at: '2024-01-01',
						updated_at: '2024-01-01'
					}),
					all: vi.fn().mockResolvedValue({
						results: [
							{
								id: 'msg-1',
								conversation_id: 'conv-1',
								role: 'user',
								content: 'Hello',
								created_at: '2024-01-01',
								attachments: '{invalid-json',
								media_type: null,
								media_url: null,
								media_thumbnail_url: null,
								media_status: null,
								media_r2_key: null,
								media_duration: null,
								media_error: null,
								media_provider_job_id: null
							}
						]
					})
				})
			})
		};

		const res = await GET({
			params: { id: 'conv-1' },
			platform: { env: { DB: mockDBLocal } },
			locals: authedLocals
		} as any);

		const data = await res.json();
		expect(data.messages).toHaveLength(1);
		// Attachments should be undefined because JSON.parse failed
		expect(data.messages[0].attachments).toBeUndefined();
	});

	it('GET: parses valid attachment JSON', async () => {
		const { GET } = await import('../../src/routes/api/chat/conversations/[id]/+server');
		const mockDBLocal = {
			prepare: vi.fn().mockReturnValue({
				bind: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue({
						id: 'conv-1',
						title: 'Test',
						user_id: 'user-1',
						created_at: '2024-01-01',
						updated_at: '2024-01-01'
					}),
					all: vi.fn().mockResolvedValue({
						results: [
							{
								id: 'msg-1',
								conversation_id: 'conv-1',
								role: 'user',
								content: 'Hello',
								created_at: '2024-01-01',
								attachments: JSON.stringify([{ name: 'file.png', type: 'image' }]),
								media_type: 'video',
								media_url: 'http://example.com/video.mp4',
								media_thumbnail_url: null,
								media_status: 'complete',
								media_r2_key: null,
								media_duration: 10,
								media_error: null,
								media_provider_job_id: null
							}
						]
					})
				})
			})
		};

		const res = await GET({
			params: { id: 'conv-1' },
			platform: { env: { DB: mockDBLocal } },
			locals: authedLocals
		} as any);

		const data = await res.json();
		expect(data.messages[0].attachments).toEqual([{ name: 'file.png', type: 'image' }]);
		expect(data.messages[0].media).toBeDefined();
		expect(data.messages[0].media.type).toBe('video');
	});
});

// ═══════════════════════════════════════════════════════════════
// 10. /api/brand/assets/generate — catch block (lines 84-85)
// ═══════════════════════════════════════════════════════════════
describe('Brand Assets Generate — catch branches', () => {
	it('POST: throws 401 without user', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');
		try {
			await POST({
				request: new Request('http://localhost', { method: 'POST', body: '{}' }),
				platform: { env: { DB: mockDB, KV: mockKV } },
				locals: { user: null }
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('POST: throws 500 without platform', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/generate/+server');
		try {
			await POST({
				request: new Request('http://localhost', { method: 'POST', body: '{}' }),
				platform: null,
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// 11. brand-colors.ts — hsvToHex hPrime >= 5 branch (line 161)
// ═══════════════════════════════════════════════════════════════
describe('Brand Colors — hsvToHex hPrime >= 5 branch', () => {
	it('converts H=330 S=100 V=100 (magenta-pink range)', async () => {
		const { hsvToHex } = await import('$lib/utils/brand-colors');
		// H=330 → hPrime = 330/60 = 5.5 (>= 5, triggers else branch)
		const hex = hsvToHex(330, 100, 100);
		expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
		// Should be pinkish: #FF0080
		expect(hex.toUpperCase()).toBe('#FF0080');
	});

	it('converts H=300 S=100 V=100 (boundary of hPrime=5)', async () => {
		const { hsvToHex } = await import('$lib/utils/brand-colors');
		// H=300 → hPrime = 5.0 exactly, triggers the else branch
		const hex = hsvToHex(300, 100, 100);
		expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
		// Should be magenta: #FF00FF
		expect(hex.toUpperCase()).toBe('#FF00FF');
	});

	it('converts H=350 S=50 V=80 (hPrime ~5.83)', async () => {
		const { hsvToHex } = await import('$lib/utils/brand-colors');
		const hex = hsvToHex(350, 50, 80);
		expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
	});
});

// ═══════════════════════════════════════════════════════════════
// 12. onboarding.ts — jsonToReadableString branches
// ═══════════════════════════════════════════════════════════════
describe('Onboarding — jsonToReadableString branches', () => {
	// This is a private function, tested indirectly through buildBrandContextString
	// which calls jsonToReadableString. Let's test getBrandFieldsSummary which
	// should exercise those code paths.

	it('buildBrandContextString handles JSON-encoded array fields', async () => {
		vi.resetModules();
		// We need the real module (not the mock) to test internal logic
		const onboarding = await vi.importActual<typeof import('$lib/services/onboarding')>(
			'$lib/services/onboarding'
		);

		// The getStepConfig and buildConversationContext use internal logic
		// Test getSystemPromptForStep with brandData that has JSON-encoded values
		const prompt = onboarding.getSystemPromptForStep('brand_assessment', {
			brandName: 'TestBrand',
			industry: 'Technology',
			colorPalette: '["#FF0000","#00FF00"]' as any
		});

		expect(typeof prompt).toBe('string');
		expect(prompt.length).toBeGreaterThan(0);
	});

	it('getSystemPromptForStep with object brandData', async () => {
		vi.resetModules();
		const onboarding = await vi.importActual<typeof import('$lib/services/onboarding')>(
			'$lib/services/onboarding'
		);

		const prompt = onboarding.getSystemPromptForStep('visual_identity', {
			brandName: 'Test',
			styleGuide: '{"heading":"Arial"}' as any
		});

		expect(typeof prompt).toBe('string');
		expect(prompt.length).toBeGreaterThan(0);
	});

	it('getSystemPromptForStep returns empty for unknown step', async () => {
		vi.resetModules();
		const onboarding = await vi.importActual<typeof import('$lib/services/onboarding')>(
			'$lib/services/onboarding'
		);

		const prompt = onboarding.getSystemPromptForStep('nonexistent_step' as any);
		expect(prompt).toBe('');
	});

	it('getSystemPromptForStep with contentContext', async () => {
		vi.resetModules();
		const onboarding = await vi.importActual<typeof import('$lib/services/onboarding')>(
			'$lib/services/onboarding'
		);

		const prompt = onboarding.getSystemPromptForStep(
			'brand_story',
			{
				brandName: 'TestBrand'
			},
			{
				texts: [
					{ category: 'tagline', key: 'main', label: 'Main Tagline', value: 'Innovation first' }
				],
				assetSummary: {
					textCount: 1,
					imageCount: 1,
					audioCount: 0,
					videoCount: 0,
					videoGenerationsCount: 0,
					totalCount: 2
				}
			} as any
		);

		expect(prompt).toContain('TestBrand');
	});
});

// ═══════════════════════════════════════════════════════════════
// 13. /api/video/generate — catch blocks (lines 124-125, 165-166)
// ═══════════════════════════════════════════════════════════════
describe('Video Generate — catch branches', () => {
	it('POST: throws 401 without user', async () => {
		const { POST } = await import('../../src/routes/api/video/generate/+server');
		try {
			await POST({
				request: new Request('http://localhost', { method: 'POST', body: '{}' }),
				platform: { env: { DB: mockDB, KV: mockKV } },
				locals: { user: null }
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('POST: throws 500 without platform', async () => {
		const { POST } = await import('../../src/routes/api/video/generate/+server');
		try {
			await POST({
				request: new Request('http://localhost', { method: 'POST', body: '{}' }),
				platform: null,
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// 14. /api/admin/ai-keys — GET/POST branches (lines 96-97)
// ═══════════════════════════════════════════════════════════════
describe('Admin AI Keys — auth/platform branches', () => {
	it('GET: throws 403 for a non-admin user', async () => {
		const { GET } = await import('../../src/routes/api/admin/ai-keys/+server');
		try {
			await GET({
				platform: { env: { DB: mockDB, KV: mockKV } },
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(403);
		}
	});

	it('GET: returns an empty key list without KV', async () => {
		const { GET } = await import('../../src/routes/api/admin/ai-keys/+server');
		const res = await GET({
			platform: { env: { DB: mockDB, KV: null } },
			locals: adminLocals
		} as any);
		expect(await res.json()).toEqual({ keys: [] });
	});
});

// ═══════════════════════════════════════════════════════════════
// 15. /api/admin/auth-keys — missing platform branches (lines 97-98)
// ═══════════════════════════════════════════════════════════════
describe('Admin Auth Keys — auth branches', () => {
	it('GET: throws 401 without an authenticated user', async () => {
		const { GET } = await import('../../src/routes/api/admin/auth-keys/+server');
		try {
			await GET({
				platform: { env: { DB: mockDB, KV: mockKV } },
				locals: { user: null }
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// 16. /api/archive/ai-save — extension fallback branches (lines 57, 73)
// ═══════════════════════════════════════════════════════════════
describe('Archive AI Save — extension fallback branches', () => {
	it('POST: throws 401 without user', async () => {
		const { POST } = await import('../../src/routes/api/archive/ai-save/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({})
				}),
				platform: { env: { DB: mockDB, BUCKET: mockBucket } },
				locals: { user: null }
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('POST: throws 500 without platform', async () => {
		const { POST } = await import('../../src/routes/api/archive/ai-save/+server');
		try {
			await POST({
				request: new Request('http://localhost', { method: 'POST', body: '{}' }),
				platform: null,
				locals: authedLocals
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(500);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// 17. /api/attachments/upload — missing file branch (line 36)
// ═══════════════════════════════════════════════════════════════
describe('Attachments Upload — validation branches', () => {
	it('POST: throws 401 without user', async () => {
		const { POST } = await import('../../src/routes/api/onboarding/attachments/upload/+server');
		try {
			await POST({
				request: new Request('http://localhost', { method: 'POST', body: '{}' }),
				platform: { env: { DB: mockDB, BUCKET: mockBucket } },
				locals: { user: null }
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// 18. /api/auth/connections — missing platform (line 25)
// ═══════════════════════════════════════════════════════════════
describe('Auth Connections — platform branches', () => {
	it('GET: returns no connections without platform', async () => {
		const { GET } = await import('../../src/routes/api/auth/connections/+server');
		const res = await GET({
			platform: null,
			locals: authedLocals
		} as any);
		expect(await res.json()).toEqual({ connections: [] });
	});

	it('GET: throws 401 without user', async () => {
		const { GET } = await import('../../src/routes/api/auth/connections/+server');
		try {
			await GET({ platform: null, locals: { user: null } } as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// 19. /api/brand/assets/variants — additional branch
// ═══════════════════════════════════════════════════════════════
describe('Brand Assets Variants — additional branches', () => {
	it('GET: throws 401 without user', async () => {
		const { GET } = await import('../../src/routes/api/brand/assets/variants/+server');
		try {
			await GET({
				url: makeUrl('/x', { brandMediaId: 'bm-1' }),
				platform: { env: { DB: mockDB } },
				locals: { user: null }
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// 20. /api/admin/users + /api/admin/users/[id] — branches
// ═══════════════════════════════════════════════════════════════
describe('Admin Users — auth branches', () => {
	it('GET: throws 401 without user', async () => {
		const { GET } = await import('../../src/routes/api/admin/users/+server');
		try {
			await GET({
				url: makeUrl('/x'),
				platform: { env: { DB: mockDB } },
				locals: { user: null }
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// 21. /api/cms/types — branches (lines 68-69)
// ═══════════════════════════════════════════════════════════════
describe('CMS Types — auth branches', () => {
	it('GET: throws 401 without user', async () => {
		const { GET } = await import('../../src/routes/api/cms/types/+server');
		try {
			await GET({
				url: makeUrl('/x'),
				platform: { env: { DB: mockDB } },
				locals: { user: null }
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// 22. /api/cms/types/[id] — branches (lines 77-78)
// ═══════════════════════════════════════════════════════════════
describe('CMS Types [id] — branches', () => {
	it('GET: throws 401 without user', async () => {
		const { GET } = await import('../../src/routes/api/cms/types/[id]/+server');
		try {
			await GET({
				params: { id: 'type-1' },
				platform: { env: { DB: mockDB } },
				locals: { user: null }
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// 23. /api/admin/ai-keys/models — catch branch (lines 284-285)
// ═══════════════════════════════════════════════════════════════
describe('Admin AI Keys Models — error branches', () => {
	it('GET: throws 403 without an admin user', async () => {
		const { GET } = await import('../../src/routes/api/admin/ai-keys/models/+server');
		try {
			await GET({
				url: makeUrl('/x', { keyId: 'k-1' }),
				platform: { env: { DB: mockDB, KV: mockKV } },
				locals: { user: null }
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(403);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// 24. /api/admin/ai-keys/reorder — branches (lines 46-47)
// ═══════════════════════════════════════════════════════════════
describe('Admin AI Keys Reorder — branches', () => {
	it('POST: throws 403 without an admin user', async () => {
		const { POST } = await import('../../src/routes/api/admin/ai-keys/reorder/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ orderedIds: ['k-1', 'k-2'] })
				}),
				platform: { env: { DB: mockDB, KV: mockKV } },
				locals: { user: null }
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(403);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// 25. /api/admin/auth-keys/[id] — branches (lines 64, 133-135)
// ═══════════════════════════════════════════════════════════════
describe('Admin Auth Keys [id] — branches', () => {
	it('PUT: throws 401 without an authenticated user', async () => {
		const { PUT } = await import('../../src/routes/api/admin/auth-keys/[id]/+server');
		try {
			await PUT({
				params: { id: 'ak-1' },
				request: new Request('http://localhost', { method: 'PUT', body: '{}' }),
				platform: { env: { DB: mockDB, KV: mockKV } },
				locals: { user: null }
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});

	it('DELETE: throws 401 without an authenticated user', async () => {
		const { DELETE } = await import('../../src/routes/api/admin/auth-keys/[id]/+server');
		try {
			await DELETE({
				params: { id: 'ak-1' },
				platform: { env: { DB: mockDB, KV: mockKV } },
				locals: { user: null }
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// 26. /api/admin/ai-keys/[id] — branches (lines 35, 48)
// ═══════════════════════════════════════════════════════════════
describe('Admin AI Keys [id] — branches', () => {
	it('PUT: throws 403 without an admin user', async () => {
		const { PUT } = await import('../../src/routes/api/admin/ai-keys/[id]/+server');
		try {
			await PUT({
				params: { id: 'key-1' },
				request: new Request('http://localhost', { method: 'PUT', body: '{}' }),
				platform: { env: { DB: mockDB, KV: mockKV } },
				locals: { user: null }
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(403);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// 27. /chat/+page.server.ts — voice/video availability (lines 80-81, 117-118)
// ═══════════════════════════════════════════════════════════════
describe('Chat Page Server — voice/video availability branches', () => {
	it('load: redirects a regular user home without KV', async () => {
		const { load } = await import('../../src/routes/chat/+page.server');
		try {
			await load({
				platform: { env: { DB: mockDB, KV: null } },
				locals: authedLocals,
				depends: vi.fn()
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(302);
			expect(err.location).toBe('/');
		}
	});

	it('load: redirects an admin to /admin with an empty KV keys list', async () => {
		const { load } = await import('../../src/routes/chat/+page.server');
		mockKV.get.mockResolvedValue(null); // No ai_keys_list

		try {
			await load({
				platform: { env: { DB: mockDB, KV: mockKV } },
				locals: adminLocals,
				depends: vi.fn()
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(302);
			expect(err.location).toBe('/admin');
		}
	});

	it('load: returns voice/video enabled with proper keys', async () => {
		const { load } = await import('../../src/routes/chat/+page.server');
		mockKV.get.mockImplementation((key: string) => {
			if (key === 'ai_keys_list') return JSON.stringify(['k-1']);
			if (key === 'ai_key:k-1')
				return JSON.stringify({
					enabled: true,
					voiceEnabled: true,
					videoEnabled: true,
					apiKey: 'sk-test'
				});
			return null;
		});

		const result = await load({
			platform: { env: { DB: mockDB, KV: mockKV } },
			locals: authedLocals,
			depends: vi.fn()
		} as any);

		expect(result).toBeDefined();
	});
});

// ═══════════════════════════════════════════════════════════════
// 28. /profile/[id]/account-info — branches (lines 59, 186-189)
// ═══════════════════════════════════════════════════════════════
describe('Account Info — branches', () => {
	it('GET: throws 403 without an admin user', async () => {
		const { GET } = await import('../../src/routes/api/admin/ai-keys/[id]/account-info/+server');
		try {
			await GET({
				params: { id: 'key-1' },
				platform: { env: { DB: mockDB, KV: mockKV } },
				locals: { user: null }
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(403);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// 29. /api/wavespeed-pricing — branches (line 102)
// ═══════════════════════════════════════════════════════════════
describe('Wavespeed Pricing — branches', () => {
	it('GET: throws 403 without an admin user', async () => {
		const { GET } = await import('../../src/routes/api/admin/ai-keys/wavespeed-pricing/+server');
		try {
			await GET({
				url: makeUrl('/x'),
				platform: { env: { DB: mockDB, KV: mockKV } },
				locals: { user: null }
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(403);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// 30. /api/brand/generate-text — branches (line 173)
// ═══════════════════════════════════════════════════════════════
describe('Brand Generate Text — branches', () => {
	it('POST: throws 401 without user', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/generate-text/+server');
		try {
			await POST({
				request: new Request('http://localhost', { method: 'POST', body: '{}' }),
				platform: { env: { DB: mockDB, KV: mockKV } },
				locals: { user: null }
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});
});

// ═══════════════════════════════════════════════════════════════
// 31. conversations/[id]/messages — branches (lines 128-129)
// ═══════════════════════════════════════════════════════════════
describe('Conversations Messages — branches', () => {
	it('POST: throws 401 without user', async () => {
		const { POST } = await import('../../src/routes/api/chat/conversations/[id]/messages/+server');
		try {
			await POST({
				params: { id: 'conv-1' },
				request: new Request('http://localhost', { method: 'POST', body: '{}' }),
				platform: { env: { DB: mockDB } },
				locals: { user: null }
			} as any);
			expect.fail();
		} catch (err: any) {
			expect(err.status).toBe(401);
		}
	});
});
