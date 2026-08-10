/**
 * Tests for Brand Onboarding Service
 * TDD: Write tests first, then implement
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createBrandProfile,
  getBrandProfile,
  getBrandProfileByUser,
  updateBrandProfile,
  getOnboardingMessages,
  addOnboardingMessage,
  getStepConfig,
  getSystemPromptForStep,
  ONBOARDING_STEPS,
  buildConversationContext,
  archiveBrandProfile,
  STEP_COMPLETE_MARKER,
  getNextStep,
  getPreviousStep,
  getStepProgress,
  buildBrandContentContextString,
  generatePlaceholderBrandName,
  buildExtractionPrompt,
  parseExtractionResponse,
  mapRowToProfile,
  type ExtractedFields
} from '$lib/services/onboarding';
import type { BrandContentContext } from '$lib/services/onboarding';
import type { BrandProfile, OnboardingStep } from '$lib/types/onboarding';

// Mock D1 database
function createMockDB() {
  const mockResult = { results: [], success: true, meta: {} };
  const mockFirst = vi.fn().mockResolvedValue(null);
  const mockAll = vi.fn().mockResolvedValue(mockResult);
  const mockRun = vi.fn().mockResolvedValue(mockResult);

  const mockBind = vi.fn().mockReturnValue({
    first: mockFirst,
    all: mockAll,
    run: mockRun
  });

  const mockPrepare = vi.fn().mockReturnValue({
    bind: mockBind,
    first: mockFirst,
    all: mockAll,
    run: mockRun
  });

  return {
    prepare: mockPrepare,
    batch: vi.fn().mockResolvedValue([]),
    _mockBind: mockBind,
    _mockFirst: mockFirst,
    _mockAll: mockAll,
    _mockRun: mockRun
  };
}

describe('Brand Onboarding Service', () => {
  let mockDB: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    mockDB = createMockDB();
    vi.clearAllMocks();
  });

  describe('ONBOARDING_STEPS', () => {
    it('should define all onboarding steps in order', () => {
      expect(ONBOARDING_STEPS).toBeDefined();
      expect(Array.isArray(ONBOARDING_STEPS)).toBe(true);
      expect(ONBOARDING_STEPS.length).toBeGreaterThan(0);

      // Should start with welcome
      expect(ONBOARDING_STEPS[0].id).toBe('welcome');

      // Should end with complete
      expect(ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1].id).toBe('complete');
    });

    it('should have required fields for each step', () => {
      for (const step of ONBOARDING_STEPS) {
        expect(step.id).toBeDefined();
        expect(step.title).toBeDefined();
        expect(step.description).toBeDefined();
        expect(step.systemPrompt).toBeDefined();
        expect(typeof step.systemPrompt).toBe('string');
        expect(step.systemPrompt.length).toBeGreaterThan(0);
      }
    });

    it('should include brand_assessment step after welcome', () => {
      const stepIds = ONBOARDING_STEPS.map((s) => s.id);
      expect(stepIds).toContain('brand_assessment');
      const welcomeIdx = stepIds.indexOf('welcome');
      const assessmentIdx = stepIds.indexOf('brand_assessment');
      expect(assessmentIdx).toBeGreaterThan(welcomeIdx);
    });

    it('should include all critical branding steps', () => {
      const stepIds = ONBOARDING_STEPS.map((s) => s.id);
      expect(stepIds).toContain('brand_identity');
      expect(stepIds).toContain('target_audience');
      expect(stepIds).toContain('brand_personality');
      expect(stepIds).toContain('visual_identity');
      expect(stepIds).toContain('brand_story');
      expect(stepIds).toContain('style_guide');
    });
  });

  describe('STEP_COMPLETE_MARKER', () => {
    it('should be a non-empty string', () => {
      expect(STEP_COMPLETE_MARKER).toBeDefined();
      expect(typeof STEP_COMPLETE_MARKER).toBe('string');
      expect(STEP_COMPLETE_MARKER.length).toBeGreaterThan(0);
    });

    it('should be a distinctive marker unlikely to appear in normal text', () => {
      expect(STEP_COMPLETE_MARKER).toContain('<<');
      expect(STEP_COMPLETE_MARKER).toContain('>>');
    });
  });

  describe('getStepConfig', () => {
    it('should return step config for a valid step', () => {
      const config = getStepConfig('welcome');
      expect(config).toBeDefined();
      expect(config!.id).toBe('welcome');
      expect(config!.title).toBeDefined();
      expect(config!.systemPrompt).toBeDefined();
    });

    it('should return undefined for invalid step', () => {
      const config = getStepConfig('nonexistent' as OnboardingStep);
      expect(config).toBeUndefined();
    });
  });

  describe('getSystemPromptForStep', () => {
    it('should return a system prompt for any valid step', () => {
      const prompt = getSystemPromptForStep('welcome');
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(50);
    });

    it('should include marketing expertise context in prompts', () => {
      const prompt = getSystemPromptForStep('welcome');
      expect(prompt.toLowerCase()).toMatch(/brand|marketing|expert/i);
    });

    it('should include psychology/philosophy references for brand_personality step', () => {
      const prompt = getSystemPromptForStep('brand_personality');
      expect(prompt.toLowerCase()).toMatch(/archetype|psychology|personality/i);
    });

    it('should return empty string for invalid step', () => {
      const prompt = getSystemPromptForStep('nonexistent' as OnboardingStep);
      expect(prompt).toBe('');
    });

    it('should incorporate existing brand data when provided', () => {
      const brandData: Partial<BrandProfile> = {
        brandName: 'TestBrand',
        industry: 'Technology'
      };
      const prompt = getSystemPromptForStep('target_audience', brandData);
      expect(prompt).toContain('TestBrand');
      expect(prompt).toContain('Technology');
    });

    it('should include auto-progression instruction for non-complete steps', () => {
      const prompt = getSystemPromptForStep('welcome');
      expect(prompt).toContain(STEP_COMPLETE_MARKER);
      expect(prompt).toContain('AUTOMATIC STEP PROGRESSION');
    });

    it('should NOT include auto-progression instruction for complete step', () => {
      const prompt = getSystemPromptForStep('complete');
      expect(prompt).not.toContain(STEP_COMPLETE_MARKER);
      expect(prompt).not.toContain('AUTOMATIC STEP PROGRESSION');
    });
  });

  describe('generatePlaceholderBrandName', () => {
    it('should return a non-empty string', () => {
      const name = generatePlaceholderBrandName();
      expect(name).toBeDefined();
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    });

    it('should follow "Adjective Noun" format (two words)', () => {
      const name = generatePlaceholderBrandName();
      const words = name.split(' ');
      expect(words.length).toBe(2);
      // Both words should be capitalized
      for (const word of words) {
        expect(word[0]).toBe(word[0].toUpperCase());
      }
    });

    it('should generate different names across multiple calls', () => {
      const names = new Set<string>();
      // Generate 20 names; with large word lists, duplicates should be rare
      for (let i = 0; i < 20; i++) {
        names.add(generatePlaceholderBrandName());
      }
      // At least some should be unique (probabilistic but very reliable)
      expect(names.size).toBeGreaterThan(5);
    });

    it('should only contain alphabetic characters and a single space', () => {
      for (let i = 0; i < 10; i++) {
        const name = generatePlaceholderBrandName();
        expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
      }
    });
  });

  describe('createBrandProfile', () => {
    it('should create a new brand profile', async () => {
      const result = await createBrandProfile(mockDB as any, 'user-123');

      expect(mockDB.prepare).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.userId).toBe('user-123');
      expect(result.status).toBe('in_progress');
      expect(result.onboardingStep).toBe('welcome');
      expect(result.id).toBeDefined();
    });

    it('should generate a unique ID for each profile', async () => {
      const result1 = await createBrandProfile(mockDB as any, 'user-123');
      const result2 = await createBrandProfile(mockDB as any, 'user-123');

      expect(result1.id).not.toBe(result2.id);
    });

    it('should assign a placeholder brand name', async () => {
      const result = await createBrandProfile(mockDB as any, 'user-123');

      expect(result.brandName).toBeDefined();
      expect(typeof result.brandName).toBe('string');
      expect(result.brandName!.length).toBeGreaterThan(0);
      // Should follow "Adjective Noun" pattern
      expect(result.brandName).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    });

    it('should include brand_name in the INSERT query', async () => {
      await createBrandProfile(mockDB as any, 'user-123');

      const prepareCall = mockDB.prepare.mock.calls[0][0] as string;
      expect(prepareCall).toContain('brand_name');
    });

    it('should set brandNameConfirmed to false for new profiles', async () => {
      const result = await createBrandProfile(mockDB as any, 'user-123');

      expect(result.brandNameConfirmed).toBe(false);
    });

    it('should include brand_name_confirmed in the INSERT query', async () => {
      await createBrandProfile(mockDB as any, 'user-123');

      const prepareCall = mockDB.prepare.mock.calls[0][0] as string;
      expect(prepareCall).toContain('brand_name_confirmed');
    });
  });

  describe('getBrandProfile', () => {
    it('should return a brand profile by ID', async () => {
      const mockProfile = {
        id: 'bp-123',
        user_id: 'user-123',
        status: 'in_progress',
        brand_name: 'TestBrand',
        onboarding_step: 'brand_identity',
        brand_personality_traits: '["bold","innovative"]',
        color_palette: '["#FF0000","#00FF00"]',
        target_audience: '{"demographics":{"ageRange":"25-35"}}',
        brand_values: '["quality","innovation"]',
        competitors: '["Competitor A"]',
        unique_selling_points: '["Fast delivery"]',
        customer_pain_points: '["High cost"]',
        style_guide: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z'
      };

      mockDB._mockFirst.mockResolvedValueOnce(mockProfile);

      const result = await getBrandProfile(mockDB as any, 'bp-123');

      expect(result).toBeDefined();
      expect(result!.id).toBe('bp-123');
      expect(result!.brandName).toBe('TestBrand');
      expect(result!.onboardingStep).toBe('brand_identity');
      expect(result!.brandPersonalityTraits).toEqual('bold, innovative');
    });

    it('should map brand_name_confirmed field correctly', async () => {
      const mockProfile = {
        id: 'bp-123',
        user_id: 'user-123',
        status: 'in_progress',
        brand_name: 'My Real Brand',
        brand_name_confirmed: 1,
        onboarding_step: 'brand_identity',
        brand_personality_traits: null,
        color_palette: null,
        target_audience: null,
        brand_values: null,
        competitors: null,
        unique_selling_points: null,
        customer_pain_points: null,
        style_guide: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z'
      };

      mockDB._mockFirst.mockResolvedValueOnce(mockProfile);

      const result = await getBrandProfile(mockDB as any, 'bp-123');

      expect(result).toBeDefined();
      expect(result!.brandNameConfirmed).toBe(true);
    });

    it('should default brandNameConfirmed to false when not set in DB', async () => {
      const mockProfile = {
        id: 'bp-456',
        user_id: 'user-123',
        status: 'in_progress',
        brand_name: 'Wild Fox',
        brand_name_confirmed: 0,
        onboarding_step: 'welcome',
        brand_personality_traits: null,
        color_palette: null,
        target_audience: null,
        brand_values: null,
        competitors: null,
        unique_selling_points: null,
        customer_pain_points: null,
        style_guide: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z'
      };

      mockDB._mockFirst.mockResolvedValueOnce(mockProfile);

      const result = await getBrandProfile(mockDB as any, 'bp-456');

      expect(result).toBeDefined();
      expect(result!.brandNameConfirmed).toBe(false);
    });

    it('should return null if profile not found', async () => {
      mockDB._mockFirst.mockResolvedValueOnce(null);

      const result = await getBrandProfile(mockDB as any, 'nonexistent');
      expect(result).toBeNull();
    });

    it('should convert JSON arrays to readable strings for text fields', async () => {
      const mockProfile = {
        id: 'bp-789',
        user_id: 'user-123',
        status: 'completed',
        brand_name: 'TestBrand',
        onboarding_step: 'complete',
        brand_personality_traits: '["bold","innovative","playful"]',
        color_palette: '["#FF0000","#00FF00"]',
        target_audience: '{"demographics":{"ageRange":"25-35"}}',
        brand_values: '["quality","innovation","trust"]',
        competitors: '["Competitor A","Competitor B"]',
        unique_selling_points: '["Fast delivery","Low cost"]',
        customer_pain_points: '["High cost","Slow service"]',
        style_guide: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z'
      };

      mockDB._mockFirst.mockResolvedValueOnce(mockProfile);

      const result = await getBrandProfile(mockDB as any, 'bp-789');

      expect(result).toBeDefined();
      // JSON arrays should be converted to comma-separated strings
      expect(result!.brandPersonalityTraits).toBe('bold, innovative, playful');
      expect(result!.brandValues).toBe('quality, innovation, trust');
      expect(result!.competitors).toBe('Competitor A, Competitor B');
      expect(result!.uniqueSellingPoints).toBe('Fast delivery, Low cost');
      expect(result!.customerPainPoints).toBe('High cost, Slow service');
      // JSON object returns raw string for user to re-edit
      expect(result!.targetAudience).toBe('{"demographics":{"ageRange":"25-35"}}');
      // colorPalette remains as parsed JSON array (not converted)
      expect(result!.colorPalette).toEqual(['#FF0000', '#00FF00']);
    });

    it('should handle plain text strings for text fields', async () => {
      const mockProfile = {
        id: 'bp-790',
        user_id: 'user-123',
        status: 'completed',
        brand_name: 'TestBrand',
        onboarding_step: 'complete',
        brand_personality_traits: 'bold, innovative, playful',
        color_palette: null,
        target_audience: 'Millennials interested in tech',
        brand_values: 'quality, innovation, trust',
        competitors: 'Competitor A, Competitor B',
        unique_selling_points: 'Fast delivery, Low cost',
        customer_pain_points: 'High cost, Slow service',
        style_guide: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z'
      };

      mockDB._mockFirst.mockResolvedValueOnce(mockProfile);

      const result = await getBrandProfile(mockDB as any, 'bp-790');

      expect(result).toBeDefined();
      // Plain strings should pass through unchanged
      expect(result!.brandPersonalityTraits).toBe('bold, innovative, playful');
      expect(result!.targetAudience).toBe('Millennials interested in tech');
      expect(result!.brandValues).toBe('quality, innovation, trust');
      expect(result!.competitors).toBe('Competitor A, Competitor B');
      expect(result!.uniqueSellingPoints).toBe('Fast delivery, Low cost');
      expect(result!.customerPainPoints).toBe('High cost, Slow service');
    });
  });

  describe('getBrandProfileByUser', () => {
    it('should return active brand profile for a user', async () => {
      const mockProfile = {
        id: 'bp-123',
        user_id: 'user-123',
        status: 'in_progress',
        brand_name: null,
        onboarding_step: 'welcome',
        brand_personality_traits: null,
        color_palette: null,
        target_audience: null,
        brand_values: null,
        competitors: null,
        unique_selling_points: null,
        customer_pain_points: null,
        style_guide: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z'
      };

      mockDB._mockFirst.mockResolvedValueOnce(mockProfile);

      const result = await getBrandProfileByUser(mockDB as any, 'user-123');

      expect(result).toBeDefined();
      expect(result!.userId).toBe('user-123');
    });

    it('should return null when user has no active profile', async () => {
      mockDB._mockFirst.mockResolvedValueOnce(null);

      const result = await getBrandProfileByUser(mockDB as any, 'user-456');
      expect(result).toBeNull();
    });
  });

  describe('updateBrandProfile', () => {
    it('should update brand profile fields', async () => {
      await updateBrandProfile(mockDB as any, 'bp-123', {
        brandName: 'NewBrand',
        tagline: 'Be bold',
        onboardingStep: 'brand_identity'
      });

      expect(mockDB.prepare).toHaveBeenCalled();
    });

    it('should serialize JSON fields correctly', async () => {
      await updateBrandProfile(mockDB as any, 'bp-123', {
        brandPersonalityTraits: 'bold, innovative',
        colorPalette: ['#FF0000', '#00FF00']
      });

      expect(mockDB.prepare).toHaveBeenCalled();
    });

    it('should support updating brandNameConfirmed', async () => {
      await updateBrandProfile(mockDB as any, 'bp-123', {
        brandNameConfirmed: true
      });

      expect(mockDB.prepare).toHaveBeenCalled();
      const query = mockDB.prepare.mock.calls[0][0] as string;
      expect(query).toContain('brand_name_confirmed');
    });
  });

  describe('addOnboardingMessage', () => {
    it('should add a message to the onboarding conversation', async () => {
      const result = await addOnboardingMessage(mockDB as any, {
        brandProfileId: 'bp-123',
        userId: 'user-123',
        role: 'user',
        content: 'Hello, I want to build a brand',
        step: 'welcome'
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.content).toBe('Hello, I want to build a brand');
      expect(result.role).toBe('user');
      expect(mockDB.prepare).toHaveBeenCalled();
    });

    it('should store metadata when provided', async () => {
      const result = await addOnboardingMessage(mockDB as any, {
        brandProfileId: 'bp-123',
        userId: 'user-123',
        role: 'assistant',
        content: 'Great! Let me help you.',
        step: 'welcome',
        metadata: { extractedName: 'TestBrand' }
      });

      expect(result.metadata).toEqual({ extractedName: 'TestBrand' });
    });
  });

  describe('getOnboardingMessages', () => {
    it('should return messages for a brand profile', async () => {
      mockDB._mockAll.mockResolvedValueOnce({
        results: [
          {
            id: 'msg-1',
            brand_profile_id: 'bp-123',
            user_id: 'user-123',
            role: 'assistant',
            content: 'Welcome!',
            step: 'welcome',
            metadata: null,
            created_at: '2026-01-01T00:00:00Z'
          },
          {
            id: 'msg-2',
            brand_profile_id: 'bp-123',
            user_id: 'user-123',
            role: 'user',
            content: 'Hi there!',
            step: 'welcome',
            metadata: null,
            created_at: '2026-01-01T00:01:00Z'
          }
        ]
      });

      const messages = await getOnboardingMessages(mockDB as any, 'bp-123');

      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('assistant');
      expect(messages[1].role).toBe('user');
    });

    it('should filter messages by step when provided', async () => {
      mockDB._mockAll.mockResolvedValueOnce({
        results: [
          {
            id: 'msg-1',
            brand_profile_id: 'bp-123',
            user_id: 'user-123',
            role: 'assistant',
            content: 'Tell me about your brand',
            step: 'brand_identity',
            metadata: null,
            created_at: '2026-01-01T00:00:00Z'
          }
        ]
      });

      const messages = await getOnboardingMessages(mockDB as any, 'bp-123', 'brand_identity');

      expect(messages).toHaveLength(1);
      expect(messages[0].step).toBe('brand_identity');
    });

    it('should return empty array when no messages exist', async () => {
      mockDB._mockAll.mockResolvedValueOnce({ results: [] });

      const messages = await getOnboardingMessages(mockDB as any, 'bp-123');
      expect(messages).toEqual([]);
    });
  });

  describe('buildConversationContext', () => {
    it('should build conversation context with system prompt and messages', () => {
      const messages = [
        {
          id: 'msg-1',
          brandProfileId: 'bp-123',
          userId: 'user-123',
          role: 'assistant' as const,
          content: 'Welcome! Do you have an existing brand?',
          step: 'welcome' as OnboardingStep,
          createdAt: '2026-01-01T00:00:00Z'
        },
        {
          id: 'msg-2',
          brandProfileId: 'bp-123',
          userId: 'user-123',
          role: 'user' as const,
          content: 'No, I am starting from scratch',
          step: 'welcome' as OnboardingStep,
          createdAt: '2026-01-01T00:01:00Z'
        }
      ];

      const context = buildConversationContext('welcome', messages);

      expect(context).toBeDefined();
      expect(Array.isArray(context)).toBe(true);
      // Should start with system message
      expect(context[0].role).toBe('system');
      // Should include conversation messages
      expect(context.length).toBeGreaterThan(1);
    });

    it('should incorporate brand data into system prompt', () => {
      const brandData: Partial<BrandProfile> = {
        brandName: 'Acme Corp',
        industry: 'Software'
      };

      const context = buildConversationContext('brand_identity', [], brandData);

      const systemMessage = context.find((m) => m.role === 'system');
      expect(systemMessage).toBeDefined();
      expect(systemMessage!.content).toContain('Acme Corp');
    });

    it('should include brand content context in system prompt when provided', () => {
      const brandData: Partial<BrandProfile> = {
        brandName: 'Acme Corp'
      };

      const contentContext: BrandContentContext = {
        texts: [
          {
            id: 'txt-1',
            brandProfileId: 'bp-123',
            category: 'messaging',
            key: 'tagline',
            label: 'Tagline',
            value: 'Innovation without limits',
            language: 'en',
            sortOrder: 0,
            createdAt: '2026-01-01',
            updatedAt: '2026-01-01'
          }
        ],
        assetSummary: {
          textCount: 1,
          imageCount: 3,
          audioCount: 0,
          videoCount: 1,
          videoGenerationsCount: 2,
          totalCount: 5
        }
      };

      const context = buildConversationContext('brand_identity', [], brandData, contentContext);

      const systemMessage = context.find((m) => m.role === 'system');
      expect(systemMessage).toBeDefined();
      expect(systemMessage!.content).toContain('GENERATED CONTENT AWARENESS');
      expect(systemMessage!.content).toContain('Tagline');
      expect(systemMessage!.content).toContain('Innovation without limits');
      expect(systemMessage!.content).toContain('3 image(s)');
      expect(systemMessage!.content).toContain('2 AI-generated video(s)');
    });
  });

  describe('buildBrandContentContextString', () => {
    it('should return empty string when no content exists', () => {
      const result = buildBrandContentContextString({
        texts: [],
        assetSummary: { textCount: 0, imageCount: 0, audioCount: 0, videoCount: 0, videoGenerationsCount: 0, totalCount: 0 }
      });
      expect(result).toBe('');
    });

    it('should group text assets by category', () => {
      const result = buildBrandContentContextString({
        texts: [
          { id: '1', brandProfileId: 'bp', category: 'messaging', key: 'tagline', label: 'Tagline', value: 'Be bold', language: 'en', sortOrder: 0, createdAt: '', updatedAt: '' },
          { id: '2', brandProfileId: 'bp', category: 'messaging', key: 'slogan', label: 'Slogan', value: 'Go further', language: 'en', sortOrder: 1, createdAt: '', updatedAt: '' },
          { id: '3', brandProfileId: 'bp', category: 'descriptions', key: 'bio', label: 'Short Bio', value: 'A tech company', language: 'en', sortOrder: 0, createdAt: '', updatedAt: '' }
        ],
        assetSummary: { textCount: 3, imageCount: 0, audioCount: 0, videoCount: 0, videoGenerationsCount: 0, totalCount: 0 }
      });

      expect(result).toContain('Messaging:');
      expect(result).toContain('Descriptions:');
      expect(result).toContain('Tagline: Be bold');
      expect(result).toContain('Slogan: Go further');
      expect(result).toContain('Short Bio: A tech company');
    });

    it('should include asset inventory counts', () => {
      const result = buildBrandContentContextString({
        texts: [],
        assetSummary: { textCount: 0, imageCount: 5, audioCount: 2, videoCount: 1, videoGenerationsCount: 3, totalCount: 8 }
      });

      expect(result).toContain('BRAND ASSET INVENTORY');
      expect(result).toContain('5 image(s)');
      expect(result).toContain('2 audio asset(s)');
      expect(result).toContain('1 video asset(s)');
      expect(result).toContain('3 AI-generated video(s)');
    });

    it('should truncate long text values', () => {
      const longValue = 'A'.repeat(500);
      const result = buildBrandContentContextString({
        texts: [
          { id: '1', brandProfileId: 'bp', category: 'descriptions', key: 'bio', label: 'Long Bio', value: longValue, language: 'en', sortOrder: 0, createdAt: '', updatedAt: '' }
        ],
        assetSummary: { textCount: 1, imageCount: 0, audioCount: 0, videoCount: 0, videoGenerationsCount: 0, totalCount: 0 }
      });

      expect(result).toContain('Long Bio:');
      expect(result).toContain('\u2026'); // ellipsis
      // Should not contain the full 500-char value
      expect(result.length).toBeLessThan(500);
    });
  });

  describe('getSystemPromptForStep with content context', () => {
    it('should include generated content awareness when content context is provided', () => {
      const contentContext: BrandContentContext = {
        texts: [
          { id: '1', brandProfileId: 'bp', category: 'voice', key: 'tone', label: 'Tone Guidelines', value: 'Friendly and approachable', language: 'en', sortOrder: 0, createdAt: '', updatedAt: '' }
        ],
        assetSummary: { textCount: 1, imageCount: 2, audioCount: 0, videoCount: 0, videoGenerationsCount: 0, totalCount: 3 }
      };

      const prompt = getSystemPromptForStep('brand_personality', undefined, contentContext);

      expect(prompt).toContain('GENERATED CONTENT AWARENESS');
      expect(prompt).toContain('Tone Guidelines');
      expect(prompt).toContain('Friendly and approachable');
      expect(prompt).toContain('2 image(s)');
    });

    it('should not include generated content section when content context is empty', () => {
      const contentContext: BrandContentContext = {
        texts: [],
        assetSummary: { textCount: 0, imageCount: 0, audioCount: 0, videoCount: 0, videoGenerationsCount: 0, totalCount: 0 }
      };

      const prompt = getSystemPromptForStep('brand_personality', undefined, contentContext);

      expect(prompt).not.toContain('GENERATED CONTENT AWARENESS');
    });

    it('should include both brand data and content context when both provided', () => {
      const brandData: Partial<BrandProfile> = {
        brandName: 'StarBrand',
        toneOfVoice: 'Bold and confident'
      };

      const contentContext: BrandContentContext = {
        texts: [
          { id: '1', brandProfileId: 'bp', category: 'messaging', key: 'pitch', label: 'Elevator Pitch', value: 'We help startups scale', language: 'en', sortOrder: 0, createdAt: '', updatedAt: '' }
        ],
        assetSummary: { textCount: 1, imageCount: 1, audioCount: 0, videoCount: 0, videoGenerationsCount: 0, totalCount: 2 }
      };

      const prompt = getSystemPromptForStep('brand_identity', brandData, contentContext);

      expect(prompt).toContain('StarBrand');
      expect(prompt).toContain('BRAND FIELD AWARENESS');
      expect(prompt).toContain('GENERATED CONTENT AWARENESS');
      expect(prompt).toContain('Elevator Pitch');
    });
  });

  describe('archiveBrandProfile', () => {
    it('should set profile status to archived', async () => {
      await archiveBrandProfile(mockDB as any, 'bp-123');

      expect(mockDB.prepare).toHaveBeenCalled();
    });
  });

  describe('getNextStep', () => {
    it('should return the next step in sequence', () => {
      expect(getNextStep('welcome')).toBe('brand_assessment');
      expect(getNextStep('brand_assessment')).toBe('brand_identity');
      expect(getNextStep('brand_identity')).toBe('target_audience');
    });

    it('should return null for the last step', () => {
      expect(getNextStep('complete')).toBeNull();
    });

    it('should return null for an invalid step', () => {
      expect(getNextStep('nonexistent' as any)).toBeNull();
    });
  });

  describe('getPreviousStep', () => {
    it('should return the previous step in sequence', () => {
      expect(getPreviousStep('brand_assessment')).toBe('welcome');
      expect(getPreviousStep('brand_identity')).toBe('brand_assessment');
      expect(getPreviousStep('target_audience')).toBe('brand_identity');
      expect(getPreviousStep('complete')).toBe('style_guide');
    });

    it('should return null for the first step (welcome)', () => {
      expect(getPreviousStep('welcome')).toBeNull();
    });

    it('should return null for an invalid step', () => {
      expect(getPreviousStep('nonexistent' as any)).toBeNull();
    });
  });

  describe('getStepProgress', () => {
    it('should return 0% for welcome step', () => {
      expect(getStepProgress('welcome')).toBe(0);
    });

    it('should return 100% for complete step', () => {
      expect(getStepProgress('complete')).toBe(100);
    });

    it('should return intermediate values for middle steps', () => {
      const progress = getStepProgress('brand_identity');
      expect(progress).toBeGreaterThan(0);
      expect(progress).toBeLessThan(100);
    });
  });

  describe('buildExtractionPrompt', () => {
    it('should return a system prompt for extracting brand data', () => {
      const prompt = buildExtractionPrompt('welcome', []);
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(50);
    });

    it('should instruct the AI to return JSON', () => {
      const prompt = buildExtractionPrompt('welcome', []);
      expect(prompt.toLowerCase()).toMatch(/json/i);
    });

    it('should include the relevant extraction fields for the step', () => {
      const prompt = buildExtractionPrompt('brand_assessment', []);
      expect(prompt).toContain('brandName');
      expect(prompt).toContain('industry');
      expect(prompt).toContain('elevatorPitch');
    });

    it('should include extraction fields for brand_identity step', () => {
      const prompt = buildExtractionPrompt('brand_identity', []);
      expect(prompt).toContain('brandName');
      expect(prompt).toContain('tagline');
      expect(prompt).toContain('missionStatement');
    });

    it('should include conversation messages for context', () => {
      const messages = [
        { role: 'user' as const, content: 'My brand is called *Space' },
        { role: 'assistant' as const, content: 'Great name! Tell me more about *Space.' }
      ];
      const prompt = buildExtractionPrompt('welcome', messages);
      expect(prompt).toContain('*Space');
    });

    it('should always include brandName in welcome step', () => {
      // Welcome step has empty extractionFields, but should still extract brandName
      const prompt = buildExtractionPrompt('welcome', []);
      expect(prompt).toContain('brandName');
    });

    it('should return empty string for complete step', () => {
      const prompt = buildExtractionPrompt('complete', []);
      expect(prompt).toBe('');
    });
  });

  describe('parseExtractionResponse', () => {
    it('should parse valid JSON extraction response', () => {
      const response = JSON.stringify({
        brandName: '*Space',
        industry: 'Technology'
      });

      const result = parseExtractionResponse(response);
      expect(result).toBeDefined();
      expect(result!.brandName).toBe('*Space');
      expect(result!.industry).toBe('Technology');
    });

    it('should return null for invalid JSON', () => {
      const result = parseExtractionResponse('not valid json');
      expect(result).toBeNull();
    });

    it('should return null for empty response', () => {
      const result = parseExtractionResponse('');
      expect(result).toBeNull();
    });

    it('should strip null/undefined values from result', () => {
      const response = JSON.stringify({
        brandName: '*Space',
        industry: null,
        tagline: undefined,
        elevatorPitch: ''
      });

      const result = parseExtractionResponse(response);
      expect(result).toBeDefined();
      expect(result!.brandName).toBe('*Space');
      expect(result!.industry).toBeUndefined();
      expect(result!.tagline).toBeUndefined();
      expect(result!.elevatorPitch).toBeUndefined();
    });

    it('should handle JSON wrapped in markdown code blocks', () => {
      const response = '```json\n{"brandName": "Acme Corp", "industry": "SaaS"}\n```';

      const result = parseExtractionResponse(response);
      expect(result).toBeDefined();
      expect(result!.brandName).toBe('Acme Corp');
      expect(result!.industry).toBe('SaaS');
    });

    it('should handle JSON with array values', () => {
      const response = JSON.stringify({
        brandName: 'TestBrand',
        brandPersonalityTraits: ['bold', 'innovative', 'friendly']
      });

      const result = parseExtractionResponse(response);
      expect(result).toBeDefined();
      expect(result!.brandPersonalityTraits).toEqual(['bold', 'innovative', 'friendly']);
    });

    it('should return null when all values are null or empty', () => {
      const response = JSON.stringify({
        brandName: null,
        industry: '',
        tagline: null
      });

      const result = parseExtractionResponse(response);
      expect(result).toBeNull();
    });

    it('should preserve special characters in brand names', () => {
      const response = JSON.stringify({
        brandName: '*Space'
      });

      const result = parseExtractionResponse(response);
      expect(result).toBeDefined();
      expect(result!.brandName).toBe('*Space');
    });

    it('should handle response with only unknown fields', () => {
      const response = JSON.stringify({
        unknownField: 'whatever',
        anotherField: 123
      });

      const result = parseExtractionResponse(response);
      // Should filter to only known brand fields
      expect(result).toBeNull();
    });
  });
});

/**
 * The write path (updateBrandField) stores JSON-field values verbatim when the
 * caller sends a string, so a malformed value can land in style_guide or
 * color_palette. Row mapping must degrade to `undefined` instead of throwing,
 * or one bad PATCH permanently breaks every subsequent profile load.
 */
describe('Onboarding service - malformed stored JSON must not throw', () => {
  const baseRow = {
    id: 'profile-1',
    user_id: 'user-1',
    status: 'in_progress',
    brand_name: 'Acme Corp',
    onboarding_step: 'welcome',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z'
  };

  it('maps a profile whose style_guide column holds malformed JSON', () => {
    const profile = mapRowToProfile({
      ...baseRow,
      style_guide: 'not valid json {'
    });

    // No throw, field degrades, the rest of the profile survives.
    expect(profile.styleGuide).toBeUndefined();
    expect(profile.brandName).toBe('Acme Corp');
    expect(profile.id).toBe('profile-1');
  });

  it('maps a profile whose color_palette column holds malformed JSON', () => {
    const profile = mapRowToProfile({
      ...baseRow,
      color_palette: '[#FF0000, broken'
    });

    expect(profile.colorPalette).toBeUndefined();
    expect(profile.brandName).toBe('Acme Corp');
  });

  it('still parses valid JSON in style_guide and color_palette', () => {
    const profile = mapRowToProfile({
      ...baseRow,
      style_guide: JSON.stringify({ logoUsage: 'clear space 2x' }),
      color_palette: JSON.stringify(['#FF0000', '#00FF00'])
    });

    expect(profile.styleGuide).toEqual({ logoUsage: 'clear space 2x' });
    expect(profile.colorPalette).toEqual(['#FF0000', '#00FF00']);
  });

  it('returns messages even when a metadata column holds malformed JSON', async () => {
    const mockDB = createMockDB();
    mockDB._mockAll.mockResolvedValueOnce({
      results: [
        {
          id: 'msg-1',
          brand_profile_id: 'bp-123',
          user_id: 'user-123',
          role: 'assistant',
          content: 'Welcome!',
          step: 'welcome',
          metadata: '{broken metadata',
          created_at: '2026-01-01T00:00:00Z'
        }
      ]
    });

    const messages = await getOnboardingMessages(mockDB as any, 'bp-123');

    expect(messages).toHaveLength(1);
    expect(messages[0].metadata).toBeUndefined();
    expect(messages[0].content).toBe('Welcome!');
  });
});
