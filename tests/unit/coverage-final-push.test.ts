/**
 * Final coverage push — targets remaining uncovered branches.
 * Focus: ai-media-generation (83%), chat/stream (86%), brand-colors (90%),
 *        file-archive (92%), onboarding service (89%), archive/ai-save (91%),
 *        brand/assets/upload (91%), setup (92%), chatHistory store (93%),
 *        brand-assets (94%), brand/update-field (93%)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal @sveltejs/kit mock
vi.mock('@sveltejs/kit', () => ({
	error: (status: number, message: string) => {
		throw { status, body: { message } };
	},
	json: (data: any, init?: any) =>
		new Response(JSON.stringify(data), {
			...init,
			headers: { 'Content-Type': 'application/json' }
		}),
	redirect: (status: number, location: string) => {
		throw { status, location };
	}
}));
vi.mock('$app/environment', () => ({ browser: false, dev: true }));

beforeEach(() => {
	vi.resetModules();
	vi.restoreAllMocks();
});

function mockDB(overrides?: any) {
	const defaults = {
		first: vi.fn().mockResolvedValue(null),
		all: vi.fn().mockResolvedValue({ results: [] }),
		run: vi.fn().mockResolvedValue({ success: true })
	};
	const funcs = { ...defaults, ...overrides };
	const chain = {
		bind: vi.fn().mockReturnValue({
			first: funcs.first,
			all: funcs.all,
			run: funcs.run
		})
	};
	return {
		prepare: vi.fn().mockReturnValue(chain),
		batch: vi.fn().mockResolvedValue([]),
		exec: vi.fn().mockResolvedValue(undefined)
	};
}

// =========================================================
// ai-media-generation.ts — updateAIGenerationStatus branch coverage
// Each optional field has an if(x !== undefined) check.
// Test with NO optional fields to cover all false branches.
// =========================================================
describe('AI Media Generation - updateAIGenerationStatus real branches', () => {
	it('updates with ONLY status (all optional fields undefined)', async () => {
		const { updateAIGenerationStatus } = await import('$lib/services/ai-media-generation');
		const db = mockDB();
		await updateAIGenerationStatus(db as any, 'gen1', {
			status: 'processing'
		});
		expect(db.prepare).toHaveBeenCalled();
		const query = db.prepare.mock.calls[0][0] as string;
		expect(query).toContain('status = ?');
		expect(query).not.toContain('provider_job_id');
		expect(query).not.toContain('result_url');
	});

	it('updates with providerJobId only', async () => {
		const { updateAIGenerationStatus } = await import('$lib/services/ai-media-generation');
		const db = mockDB();
		await updateAIGenerationStatus(db as any, 'gen1', {
			status: 'processing',
			providerJobId: 'job123'
		});
		const query = db.prepare.mock.calls[0][0] as string;
		expect(query).toContain('provider_job_id');
	});

	it('updates with resultUrl only', async () => {
		const { updateAIGenerationStatus } = await import('$lib/services/ai-media-generation');
		const db = mockDB();
		await updateAIGenerationStatus(db as any, 'gen1', {
			status: 'complete',
			resultUrl: 'https://example.com/video.mp4'
		});
		const query = db.prepare.mock.calls[0][0] as string;
		expect(query).toContain('result_url');
		expect(query).toContain('completed_at');
	});

	it('updates with r2Key only', async () => {
		const { updateAIGenerationStatus } = await import('$lib/services/ai-media-generation');
		const db = mockDB();
		await updateAIGenerationStatus(db as any, 'gen1', {
			status: 'processing',
			r2Key: 'videos/abc.mp4'
		});
		const query = db.prepare.mock.calls[0][0] as string;
		expect(query).toContain('r2_key');
	});

	it('updates with brandMediaId only', async () => {
		const { updateAIGenerationStatus } = await import('$lib/services/ai-media-generation');
		const db = mockDB();
		await updateAIGenerationStatus(db as any, 'gen1', {
			status: 'processing',
			brandMediaId: 'media1'
		});
		const query = db.prepare.mock.calls[0][0] as string;
		expect(query).toContain('brand_media_id');
	});

	it('updates with cost only', async () => {
		const { updateAIGenerationStatus } = await import('$lib/services/ai-media-generation');
		const db = mockDB();
		await updateAIGenerationStatus(db as any, 'gen1', {
			status: 'complete',
			cost: 0.05
		});
		const query = db.prepare.mock.calls[0][0] as string;
		expect(query).toContain('cost');
	});

	it('updates with errorMessage only', async () => {
		const { updateAIGenerationStatus } = await import('$lib/services/ai-media-generation');
		const db = mockDB();
		await updateAIGenerationStatus(db as any, 'gen1', {
			status: 'failed',
			errorMessage: 'Timeout'
		});
		const query = db.prepare.mock.calls[0][0] as string;
		expect(query).toContain('error_message');
		expect(query).toContain('completed_at');
	});

	it('updates with progress only', async () => {
		const { updateAIGenerationStatus } = await import('$lib/services/ai-media-generation');
		const db = mockDB();
		await updateAIGenerationStatus(db as any, 'gen1', {
			status: 'processing',
			progress: 50
		});
		const query = db.prepare.mock.calls[0][0] as string;
		expect(query).toContain('progress');
	});

	it('updates with ALL optional fields', async () => {
		const { updateAIGenerationStatus } = await import('$lib/services/ai-media-generation');
		const db = mockDB();
		await updateAIGenerationStatus(db as any, 'gen1', {
			status: 'complete',
			providerJobId: 'j1',
			resultUrl: 'https://example.com/v.mp4',
			r2Key: 'videos/v.mp4',
			brandMediaId: 'm1',
			cost: 0.1,
			errorMessage: undefined,
			progress: 100
		});
		const query = db.prepare.mock.calls[0][0] as string;
		expect(query).toContain('provider_job_id');
		expect(query).toContain('result_url');
		expect(query).toContain('r2_key');
		expect(query).toContain('brand_media_id');
		expect(query).toContain('cost');
		expect(query).toContain('progress');
		expect(query).not.toContain('error_message');
	});
});

// =========================================================
// brand-colors.ts — more hue ranges and suggestBackgroundColors
// =========================================================
describe('Brand Colors - remaining branches', () => {
	it('suggestBackgroundColors with invalid hex returns defaults', async () => {
		const { suggestBackgroundColors } = await import('$lib/utils/brand-colors');
		const result = suggestBackgroundColors('not-a-hex');
		expect(result.light).toBe('#f8f9fa');
		expect(result.dark).toBe('#0f0f14');
	});

	it('suggestBackgroundColors with valid hex returns calculated colors', async () => {
		const { suggestBackgroundColors } = await import('$lib/utils/brand-colors');
		const result = suggestBackgroundColors('#3366CC');
		expect(result.light).toBeDefined();
		expect(result.light).not.toBe('#f8f9fa');
		expect(result.dark).toBeDefined();
	});

	it('getColorName for all hue families', async () => {
		const { getColorName } = await import('$lib/utils/brand-colors');
		// Each hex targets a specific hue range in getHueFamily
		const tests: [string, string][] = [
			['#FF0000', 'Red'], // h ≈ 0 (Red, h < 15)
			['#FF8800', 'Orange'], // h ≈ 32 (Orange, 15 ≤ h < 40)
			['#FFDD00', 'Yellow'], // h ≈ 52 (Yellow, 40 ≤ h < 65)
			['#CCFF00', 'Lime'], // h ≈ 72 (Lime, 65 ≤ h < 80)
			['#00CC44', 'Green'], // h ≈ 140 (Green, 80 ≤ h < 150)
			['#00CCAA', 'Teal'], // h ≈ 160 (Teal, 150 ≤ h < 175)
			['#00CCFF', 'Cyan'], // h ≈ 195 (Cyan, 175 ≤ h < 200)
			['#0044FF', 'Blue'], // h ≈ 224 (Blue, 200 ≤ h < 250)
			['#5500FF', 'Indigo'], // h ≈ 260 (Indigo, 250 ≤ h < 280)
			['#AA00FF', 'Purple'], // h ≈ 290 (Purple, 280 ≤ h < 310)
			['#FF00AA', 'Pink'], // h ≈ 330 (Pink, 310 ≤ h < 345)
			['#FF0033', 'Red'] // h ≈ 348 (Red, >= 345)
		];
		for (const [hex, hueFamily] of tests) {
			const name = getColorName(hex);
			expect(name).toContain(hueFamily);
		}
	});

	it('getColorName for edge cases: near-white, very dark, neutral', async () => {
		const { getColorName } = await import('$lib/utils/brand-colors');
		expect(getColorName('#FAFAFA')).toContain('White');
		expect(getColorName('#111111')).toContain('Black');
		expect(getColorName('#FFD0D0')).toContain('Pale'); // l ≈ 91 (> 90, < 95)
		expect(getColorName('#1A0000')).toContain('Dark'); // l < 12
	});

	it('getColorName with muted and vivid prefixes', async () => {
		const { getColorName } = await import('$lib/utils/brand-colors');
		// Low saturation, mid lightness
		const mutedName = getColorName('#887766');
		expect(mutedName).toContain('Muted');
		// High saturation, mid lightness
		const vividName = getColorName('#FF0066');
		expect(vividName).toContain('Vivid');
	});

	it('getColorName with light prefix', async () => {
		const { getColorName } = await import('$lib/utils/brand-colors');
		// l > 70, normal sat (not near-white)
		const name = getColorName('#99BBFF');
		expect(name).toContain('Light');
	});

	it('getColorTemperature edge cases', async () => {
		const { getColorTemperature } = await import('$lib/utils/brand-colors');
		expect(getColorTemperature('invalid')).toBe('neutral');
		expect(getColorTemperature('#808080')).toBe('neutral'); // low saturation
		expect(getColorTemperature('#FF6600')).toBe('warm'); // orange
		expect(getColorTemperature('#0066FF')).toBe('cool'); // blue
		expect(getColorTemperature('#88FF88')).toBe('neutral'); // green ≈ 120, between warm and cool ranges
	});
});

// =========================================================
// chat/stream — validation branches (lines 74-80)
// =========================================================
describe('Chat Stream - validation branches', () => {
	vi.mock('$lib/services/openai-chat', () => ({
		getEnabledOpenAIKey: vi.fn().mockResolvedValue({ apiKey: 'sk-test' }),
		formatMessagesForOpenAI: vi.fn().mockReturnValue([]),
		streamChatCompletion: vi.fn()
	}));
	vi.mock('$lib/utils/cost', () => ({
		calculateCost: vi.fn().mockReturnValue({ totalCost: 0 }),
		getModelDisplayName: vi.fn().mockReturnValue('GPT-4o')
	}));

	it('POST with empty messages throws 400', async () => {
		const { POST } = await import('../../src/routes/api/chat/stream/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ messages: [], conversationId: 'c1' })
				}),
				platform: { env: { DB: mockDB(), KV: { get: vi.fn() } } },
				locals: { user: { id: 'u1' } }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('POST with non-array messages throws 400', async () => {
		const { POST } = await import('../../src/routes/api/chat/stream/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ messages: 'not-array', conversationId: 'c1' })
				}),
				platform: { env: { DB: mockDB(), KV: { get: vi.fn() } } },
				locals: { user: { id: 'u1' } }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('POST without conversationId throws 400', async () => {
		const { POST } = await import('../../src/routes/api/chat/stream/+server');
		try {
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
				}),
				platform: { env: { DB: mockDB(), KV: { get: vi.fn() } } },
				locals: { user: { id: 'u1' } }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});
});

// =========================================================
// brand/assets/upload — validation branches (lines 28-31)
// =========================================================
describe('Brand Assets Upload - validation branches', () => {
	it('POST without file throws 400', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/upload/+server');
		const formData = new FormData();
		formData.append('brandProfileId', 'bp1');

		try {
			await POST({
				request: new Request('http://localhost', { method: 'POST', body: formData }),
				platform: { env: { DB: mockDB(), BUCKET: { put: vi.fn() } } },
				locals: { user: { id: 'u1' } }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('POST without brandProfileId throws 400', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/upload/+server');
		const formData = new FormData();
		formData.append('file', new File(['data'], 'test.jpg', { type: 'image/jpeg' }));

		try {
			await POST({
				request: new Request('http://localhost', { method: 'POST', body: formData }),
				platform: { env: { DB: mockDB(), BUCKET: { put: vi.fn() } } },
				locals: { user: { id: 'u1' } }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('POST with invalid mediaType throws 400', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/upload/+server');
		const formData = new FormData();
		formData.append('file', new File(['data'], 'test.jpg', { type: 'image/jpeg' }));
		formData.append('brandProfileId', 'bp1');
		formData.append('mediaType', 'document'); // invalid

		try {
			await POST({
				request: new Request('http://localhost', { method: 'POST', body: formData }),
				platform: { env: { DB: mockDB(), BUCKET: { put: vi.fn() } } },
				locals: { user: { id: 'u1' } }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});

	it('POST without category throws 400', async () => {
		const { POST } = await import('../../src/routes/api/brand/assets/upload/+server');
		const formData = new FormData();
		formData.append('file', new File(['data'], 'test.jpg', { type: 'image/jpeg' }));
		formData.append('brandProfileId', 'bp1');
		formData.append('mediaType', 'image');
		// no category

		try {
			await POST({
				request: new Request('http://localhost', { method: 'POST', body: formData }),
				platform: { env: { DB: mockDB(), BUCKET: { put: vi.fn() } } },
				locals: { user: { id: 'u1' } }
			} as any);
			expect.fail('Should have thrown');
		} catch (err: any) {
			expect(err.status).toBe(400);
		}
	});
});

// =========================================================
// file-archive.ts — rowToEntry bad tags, archiveFile null result
// =========================================================
describe('File Archive - uncovered branches', () => {
	it('listFileArchive with malformed JSON tags returns empty tags array', async () => {
		const { listFileArchive } = await import('$lib/services/file-archive');
		const db = mockDB({
			all: vi.fn().mockResolvedValue({
				results: [
					{
						id: 'f1',
						brand_profile_id: 'bp1',
						user_id: 'u1',
						file_name: 'test.jpg',
						mime_type: 'image/jpeg',
						file_size: 1000,
						r2_key: 'files/test.jpg',
						file_type: 'image',
						source: 'upload',
						context: 'chat',
						folder: '/images',
						is_starred: 0,
						tags: '{broken json',
						created_at: '2024-01-01',
						updated_at: '2024-01-01'
					}
				]
			}),
			first: vi.fn().mockResolvedValue({ count: 1 })
		});
		const result = await listFileArchive(db as any, { brandProfileId: 'bp1' });
		expect(result.files[0].tags).toEqual([]);
	});

	it('createFileArchiveEntry throws when DB returns null', async () => {
		const { createFileArchiveEntry } = await import('$lib/services/file-archive');
		const db = mockDB({ first: vi.fn().mockResolvedValue(null) });
		await expect(
			createFileArchiveEntry(db as any, {
				brandProfileId: 'bp1',
				userId: 'u1',
				fileName: 'test.jpg',
				mimeType: 'image/jpeg',
				fileSize: 1000,
				r2Key: 'files/test.jpg',
				fileType: 'image' as any,
				source: 'upload' as any,
				context: 'chat' as any
			})
		).rejects.toThrow('Failed to create file archive entry');
	});

	it('getArchiveStats handles undefined results arrays', async () => {
		const { getArchiveStats } = await import('$lib/services/file-archive');
		const db = {
			prepare: vi.fn().mockReturnValue({
				bind: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue(null),
					all: vi.fn().mockResolvedValue({ results: undefined })
				})
			}),
			batch: vi
				.fn()
				.mockResolvedValue([{ results: undefined }, { results: undefined }, { results: undefined }])
		};
		const stats = await getArchiveStats(db as any, 'bp1');
		expect(stats.totalFiles).toBe(0);
		expect(stats.byType).toEqual({});
	});
});

// =========================================================
// onboarding service — mapRowToMessage branches
// =========================================================
describe('Onboarding Service - message mapping branches', () => {
	it('getOnboardingMessages maps rows without attachments', async () => {
		const { getOnboardingMessages } = await import('$lib/services/onboarding');
		const db = mockDB({
			all: vi.fn().mockResolvedValue({
				results: [
					{
						id: 'msg1',
						brand_profile_id: 'bp1',
						user_id: 'u1',
						role: 'user',
						content: 'Hello',
						step: 'welcome',
						metadata: null,
						attachments: null,
						created_at: '2024-01-01'
					}
				]
			})
		});
		const messages = await getOnboardingMessages(db as any, 'bp1');
		expect(messages[0].attachments).toBeUndefined();
		expect(messages[0].metadata).toBeUndefined();
	});

	it('getOnboardingMessages handles malformed JSON attachments', async () => {
		const { getOnboardingMessages } = await import('$lib/services/onboarding');
		const db = mockDB({
			all: vi.fn().mockResolvedValue({
				results: [
					{
						id: 'msg2',
						brand_profile_id: 'bp1',
						user_id: 'u1',
						role: 'assistant',
						content: 'Hi',
						step: 'welcome',
						metadata: '{"key":"value"}',
						attachments: '{bad json',
						created_at: '2024-01-01'
					}
				]
			})
		});
		const messages = await getOnboardingMessages(db as any, 'bp1');
		expect(messages[0].attachments).toBeUndefined();
		expect(messages[0].metadata).toEqual({ key: 'value' });
	});
});

// archive/ai-save, brand/update-field, brand-assets/texts → moved to separate file

// brand/update-field → moved to coverage-route-tests.test.ts

// brand-assets createBrandText → moved to coverage-route-tests.test.ts

// =========================================================
// chatHistory store — createConversation API failure fallback
// =========================================================
describe('ChatHistory Store - createConversation fallback', () => {
	it('falls back to local conversation when API fails', async () => {
		globalThis.fetch = vi
			.fn()
			.mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({ conversations: [] }) })
			.mockResolvedValueOnce({ ok: false, status: 500 });

		const { chatHistoryStore } = await import('$lib/stores/chatHistory');
		const { get } = await import('svelte/store');

		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		await chatHistoryStore.initializeForUser('u1');
		await chatHistoryStore.createConversation();

		const state = get(chatHistoryStore) as any;
		expect(state.conversations.length).toBe(1);
		expect(state.currentConversationId).toBeDefined();
		consoleError.mockRestore();
	});

	it('initializeForUser with non-ok response resets state', async () => {
		globalThis.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 });

		const { chatHistoryStore } = await import('$lib/stores/chatHistory');
		const { get } = await import('svelte/store');
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		await chatHistoryStore.initializeForUser('u1');
		const state = get(chatHistoryStore) as any;
		expect(state.conversations).toEqual([]);
		consoleError.mockRestore();
	});

	it('initializeForUser with fetch error resets state', async () => {
		globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('network fail'));

		const { chatHistoryStore } = await import('$lib/stores/chatHistory');
		const { get } = await import('svelte/store');
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		await chatHistoryStore.initializeForUser('u1');
		const state = get(chatHistoryStore) as any;
		expect(state.conversations).toEqual([]);
		consoleError.mockRestore();
	});

	it('deleteConversation removes from state and handles fetch error', async () => {
		globalThis.fetch = vi
			.fn()
			.mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({ conversations: [] }) })
			.mockResolvedValueOnce({
				ok: true,
				json: vi
					.fn()
					.mockResolvedValue({
						id: 'c1',
						title: 'Test',
						createdAt: '2024-01-01',
						updatedAt: '2024-01-01'
					})
			})
			.mockRejectedValueOnce(new Error('delete fail'));

		const { chatHistoryStore } = await import('$lib/stores/chatHistory');
		const { get } = await import('svelte/store');
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		await chatHistoryStore.initializeForUser('u1');
		await chatHistoryStore.createConversation();
		await chatHistoryStore.deleteConversation('c1');

		const state = get(chatHistoryStore) as any;
		expect(state.conversations.length).toBe(0);
		consoleError.mockRestore();
	});
});

// brand-assets/texts → moved to coverage-route-tests.test.ts

// chat/stream persistMessage → moved to coverage-route-tests.test.ts
