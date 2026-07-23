/**
 * Tests for Brand Onboarding API Endpoints
 * TDD: Tests first, then implement
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules
vi.mock('$lib/services/onboarding', () => ({
	createBrandProfile: vi.fn(),
	getBrandProfile: vi.fn(),
	getBrandProfileByUser: vi.fn(),
	updateBrandProfile: vi.fn(),
	addOnboardingMessage: vi.fn(),
	getOnboardingMessages: vi.fn(),
	getStepConfig: vi.fn(),
	getSystemPromptForStep: vi.fn(),
	buildConversationContext: vi.fn(),
	archiveBrandProfile: vi.fn(),
	getNextStep: vi.fn(),
	getStepProgress: vi.fn(),
	ONBOARDING_STEPS: [
		{
			id: 'welcome',
			title: 'Welcome',
			description: 'Intro',
			systemPrompt: 'test',
			extractionFields: []
		},
		{
			id: 'brand_assessment',
			title: 'Assessment',
			description: 'Assess',
			systemPrompt: 'test',
			extractionFields: []
		},
		{
			id: 'complete',
			title: 'Complete',
			description: 'Done',
			systemPrompt: 'test',
			extractionFields: []
		}
	]
}));

vi.mock('$lib/services/openai-chat', () => ({
	getEnabledOpenAIKey: vi.fn(),
	streamChatCompletion: vi.fn(),
	getAllEnabledAIKeys: vi.fn(),
	getFirstEnabledAIKey: vi.fn(),
	chatCompletionWithKey: vi.fn(),
	streamChatCompletionWithFallback: vi.fn()
}));

// Helper: create mock platform
function createMockPlatform() {
	const mockDB = {
		prepare: vi.fn().mockReturnValue({
			bind: vi.fn().mockReturnValue({
				first: vi.fn().mockResolvedValue(null),
				all: vi.fn().mockResolvedValue({ results: [] }),
				run: vi.fn().mockResolvedValue({ success: true })
			}),
			first: vi.fn().mockResolvedValue(null),
			all: vi.fn().mockResolvedValue({ results: [] }),
			run: vi.fn().mockResolvedValue({ success: true })
		}),
		batch: vi.fn().mockResolvedValue([])
	};

	return {
		env: {
			DB: mockDB,
			KV: {
				get: vi.fn().mockResolvedValue(null),
				put: vi.fn().mockResolvedValue(undefined),
				delete: vi.fn().mockResolvedValue(undefined)
			},
			BUCKET: {},
			QUEUE: {},
			TURNSTILE_SECRET_KEY: 'test'
		},
		context: {
			waitUntil: vi.fn()
		}
	};
}

function createMockUser(overrides = {}) {
	return {
		id: 'user-123',
		login: 'testuser',
		email: 'test@example.com',
		isOwner: false,
		isAdmin: false,
		...overrides
	};
}

describe('Onboarding API Endpoints', () => {
	let mockPlatform: ReturnType<typeof createMockPlatform>;

	beforeEach(() => {
		mockPlatform = createMockPlatform();
		vi.clearAllMocks();
	});

	describe('GET /api/onboarding/profile', () => {
		it('should return 401 when not authenticated', async () => {
			const { GET } = await import('../../src/routes/api/onboarding/profile/+server');
			const event = {
				locals: {},
				platform: mockPlatform,
				url: new URL('http://localhost/api/onboarding/profile')
			};

			try {
				await GET(event as any);
				expect.unreachable('Should have thrown');
			} catch (e: any) {
				expect(e.status).toBe(401);
			}
		});

		it('should return existing brand profile when one exists', async () => {
			const { getBrandProfileByUser } = await import('$lib/services/onboarding');
			const mockProfile = {
				id: 'bp-123',
				userId: 'user-123',
				status: 'in_progress',
				onboardingStep: 'welcome',
				createdAt: '2026-01-01',
				updatedAt: '2026-01-01'
			};
			vi.mocked(getBrandProfileByUser).mockResolvedValueOnce(mockProfile as any);

			const { GET } = await import('../../src/routes/api/onboarding/profile/+server');
			const event = {
				locals: { user: createMockUser() },
				platform: mockPlatform,
				url: new URL('http://localhost/api/onboarding/profile')
			};

			const response = await GET(event as any);
			const data = await response.json();

			expect(data.profile).toBeDefined();
			expect(data.profile.id).toBe('bp-123');
		});

		it('should return null when no profile exists', async () => {
			const { getBrandProfileByUser } = await import('$lib/services/onboarding');
			vi.mocked(getBrandProfileByUser).mockResolvedValueOnce(null);

			const { GET } = await import('../../src/routes/api/onboarding/profile/+server');
			const event = {
				locals: { user: createMockUser() },
				platform: mockPlatform,
				url: new URL('http://localhost/api/onboarding/profile')
			};

			const response = await GET(event as any);
			const data = await response.json();

			expect(data.profile).toBeNull();
		});
	});

	describe('POST /api/onboarding/profile', () => {
		it('should return 401 when not authenticated', async () => {
			const { POST } = await import('../../src/routes/api/onboarding/profile/+server');
			const event = {
				locals: {},
				platform: mockPlatform
			};

			try {
				await POST(event as any);
				expect.unreachable('Should have thrown');
			} catch (e: any) {
				expect(e.status).toBe(401);
			}
		});

		it('should create a new brand profile', async () => {
			const { createBrandProfile } = await import('$lib/services/onboarding');
			const mockProfile = {
				id: 'bp-new',
				userId: 'user-123',
				status: 'in_progress',
				onboardingStep: 'welcome',
				createdAt: '2026-01-01',
				updatedAt: '2026-01-01'
			};
			vi.mocked(createBrandProfile).mockResolvedValueOnce(mockProfile as any);

			const { POST } = await import('../../src/routes/api/onboarding/profile/+server');
			const event = {
				locals: { user: createMockUser() },
				platform: mockPlatform
			};

			const response = await POST(event as any);
			const data = await response.json();

			expect(data.profile).toBeDefined();
			expect(data.profile.id).toBe('bp-new');
		});
	});

	describe('PATCH /api/onboarding/profile', () => {
		it('should return 401 when not authenticated', async () => {
			const { PATCH } = await import('../../src/routes/api/onboarding/profile/+server');
			const event = {
				locals: {},
				platform: mockPlatform,
				request: new Request('http://localhost', {
					method: 'PATCH',
					body: JSON.stringify({ profileId: 'bp-123', updates: {} })
				})
			};

			try {
				await PATCH(event as any);
				expect.unreachable('Should have thrown');
			} catch (e: any) {
				expect(e.status).toBe(401);
			}
		});

		it('should update an existing profile', async () => {
			const { updateBrandProfile, getBrandProfile } = await import('$lib/services/onboarding');
			const mockProfile = {
				id: 'bp-123',
				userId: 'user-123',
				status: 'in_progress',
				brandName: 'UpdatedBrand',
				onboardingStep: 'brand_identity',
				createdAt: '2026-01-01',
				updatedAt: '2026-01-01'
			};
			vi.mocked(updateBrandProfile).mockResolvedValueOnce(undefined);
			vi.mocked(getBrandProfile).mockResolvedValueOnce(mockProfile as any);

			const { PATCH } = await import('../../src/routes/api/onboarding/profile/+server');
			const event = {
				locals: { user: createMockUser() },
				platform: mockPlatform,
				request: new Request('http://localhost', {
					method: 'PATCH',
					body: JSON.stringify({
						profileId: 'bp-123',
						updates: { brandName: 'UpdatedBrand' }
					})
				})
			};

			const response = await PATCH(event as any);
			const data = await response.json();

			expect(data.profile).toBeDefined();
			expect(updateBrandProfile).toHaveBeenCalled();
		});
	});

	describe('POST /api/onboarding/chat', () => {
		it('should return 401 when not authenticated', async () => {
			const { POST } = await import('../../src/routes/api/onboarding/chat/+server');
			const event = {
				locals: {},
				platform: mockPlatform,
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({
						profileId: 'bp-123',
						message: 'Hello',
						step: 'welcome'
					})
				})
			};

			try {
				await POST(event as any);
				expect.unreachable('Should have thrown');
			} catch (e: any) {
				expect(e.status).toBe(401);
			}
		});

		it('should return 400 when required fields are missing', async () => {
			const { POST } = await import('../../src/routes/api/onboarding/chat/+server');
			const event = {
				locals: { user: createMockUser() },
				platform: mockPlatform,
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({})
				})
			};

			try {
				await POST(event as any);
				expect.unreachable('Should have thrown');
			} catch (e: any) {
				expect(e.status).toBe(400);
			}
		});

		it('should return 503 when no AI key is configured', async () => {
			const { getAllEnabledAIKeys } = await import('$lib/services/openai-chat');
			const {
				getBrandProfile,
				addOnboardingMessage,
				getOnboardingMessages,
				buildConversationContext
			} = await import('$lib/services/onboarding');

			vi.mocked(getAllEnabledAIKeys).mockResolvedValueOnce([]);
			vi.mocked(getBrandProfile).mockResolvedValueOnce({
				id: 'bp-123',
				userId: 'user-123',
				status: 'in_progress',
				onboardingStep: 'welcome',
				createdAt: '2026-01-01',
				updatedAt: '2026-01-01'
			} as any);

			const { POST } = await import('../../src/routes/api/onboarding/chat/+server');
			const event = {
				locals: { user: createMockUser() },
				platform: mockPlatform,
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({
						profileId: 'bp-123',
						message: 'Hello',
						step: 'welcome'
					})
				})
			};

			try {
				await POST(event as any);
				expect.unreachable('Should have thrown');
			} catch (e: any) {
				expect(e.status).toBe(503);
			}
		});
	});

	describe('GET /api/onboarding/messages/[profileId]', () => {
		it('should return 401 when not authenticated', async () => {
			const { GET } = await import('../../src/routes/api/onboarding/messages/[profileId]/+server');
			const event = {
				locals: {},
				platform: mockPlatform,
				params: { profileId: 'bp-123' },
				url: new URL('http://localhost/api/onboarding/messages/bp-123')
			};

			try {
				await GET(event as any);
				expect.unreachable('Should have thrown');
			} catch (e: any) {
				expect(e.status).toBe(401);
			}
		});

		it('should return messages for a profile', async () => {
			const { getOnboardingMessages } = await import('$lib/services/onboarding');
			vi.mocked(getOnboardingMessages).mockResolvedValueOnce([
				{
					id: 'msg-1',
					brandProfileId: 'bp-123',
					userId: 'user-123',
					role: 'assistant',
					content: 'Welcome!',
					step: 'welcome' as any,
					createdAt: '2026-01-01'
				}
			]);

			const { GET } = await import('../../src/routes/api/onboarding/messages/[profileId]/+server');
			const event = {
				locals: { user: createMockUser() },
				platform: mockPlatform,
				params: { profileId: 'bp-123' },
				url: new URL('http://localhost/api/onboarding/messages/bp-123')
			};

			const response = await GET(event as any);
			const data = await response.json();

			expect(data.messages).toBeDefined();
			expect(data.messages).toHaveLength(1);
		});
	});

	describe('POST /api/onboarding/start', () => {
		it('should return 401 when not authenticated', async () => {
			const { POST } = await import('../../src/routes/api/onboarding/start/+server');
			const event = {
				locals: {},
				platform: mockPlatform,
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({})
				})
			};

			try {
				await POST(event as any);
				expect.unreachable('Should have thrown');
			} catch (e: any) {
				expect(e.status).toBe(401);
			}
		});

		it('should create profile and return initial message', async () => {
			const { createBrandProfile, addOnboardingMessage } = await import('$lib/services/onboarding');
			const { getEnabledOpenAIKey, streamChatCompletion } = await import(
				'$lib/services/openai-chat'
			);
			const { getSystemPromptForStep } = await import('$lib/services/onboarding');

			const mockProfile = {
				id: 'bp-new',
				userId: 'user-123',
				status: 'in_progress',
				onboardingStep: 'welcome',
				createdAt: '2026-01-01',
				updatedAt: '2026-01-01'
			};
			vi.mocked(createBrandProfile).mockResolvedValueOnce(mockProfile as any);
			vi.mocked(getEnabledOpenAIKey).mockResolvedValueOnce({
				id: 'key-1',
				name: 'OpenAI',
				provider: 'openai',
				apiKey: 'sk-test',
				enabled: true
			});
			vi.mocked(getSystemPromptForStep).mockReturnValueOnce('You are a brand expert...');
			vi.mocked(addOnboardingMessage).mockResolvedValue({
				id: 'msg-1',
				brandProfileId: 'bp-new',
				userId: 'user-123',
				role: 'assistant',
				content: 'Welcome! Do you have a brand?',
				step: 'welcome',
				createdAt: '2026-01-01'
			} as any);

			// Mock the streaming generator
			async function* mockStream() {
				yield { type: 'content' as const, content: 'Welcome! Do you have a brand?' };
				yield {
					type: 'usage' as const,
					usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
					model: 'gpt-4o'
				};
			}
			vi.mocked(streamChatCompletion).mockReturnValueOnce(mockStream());

			const { POST } = await import('../../src/routes/api/onboarding/start/+server');
			const event = {
				locals: { user: createMockUser() },
				platform: mockPlatform,
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({})
				})
			};

			const response = await POST(event as any);
			const data = await response.json();

			expect(data.profile).toBeDefined();
			expect(data.profile.id).toBe('bp-new');
			expect(data.message).toBeDefined();
		});
	});
});
