/**
 * Tests for /api/onboarding/profile - GET with ?id param, and PATCH edge cases
 * Covers: lines 25-33 of +server.ts (GET with specific profile ID, ownership check)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────

vi.mock('$lib/services/onboarding', () => ({
  createBrandProfile: vi.fn(),
  getBrandProfile: vi.fn(),
  getBrandProfileByUser: vi.fn(),
  updateBrandProfile: vi.fn()
}));

// ─── Helpers ─────────────────────────────────────────────────────

function createMockPlatform() {
  return {
    env: {
      DB: {
        prepare: vi.fn().mockImplementation((sql: string) => ({
          bind: vi.fn().mockReturnValue({
            first: vi
              .fn()
              .mockResolvedValue(
                sql.includes('SELECT user_id FROM brand_profiles') ? { user_id: 'user-1' } : null
              ),
            all: vi.fn().mockResolvedValue({ results: [] }),
            run: vi.fn().mockResolvedValue({ success: true })
          })
        }))
      }
    }
  };
}

function createMockUser() {
  return { id: 'user-1', login: 'tester', email: 'test@test.com', isOwner: false, isAdmin: false };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/onboarding/profile with ?id param', () => {
  it('should return a specific profile by id when owned by user', async () => {
    const { getBrandProfile } = await import('$lib/services/onboarding');
    vi.mocked(getBrandProfile).mockResolvedValue({
      id: 'bp-specific',
      userId: 'user-1',
      status: 'in_progress',
      onboardingStep: 'welcome',
      brandName: 'MyBrand',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    } as any);

    const { GET } = await import('../../src/routes/api/onboarding/profile/+server');
    const event = {
      locals: { user: createMockUser() },
      platform: createMockPlatform(),
      url: new URL('http://localhost/api/onboarding/profile?id=bp-specific')
    };

    const response = await GET(event as any);
    const data = await response.json();
    expect(data.profile).toBeDefined();
    expect(data.profile.id).toBe('bp-specific');
    expect(data.profile.brandName).toBe('MyBrand');
  });

  it('should return 404 when profile not found by id', async () => {
    const { getBrandProfile } = await import('$lib/services/onboarding');
    vi.mocked(getBrandProfile).mockResolvedValue(null);

    const { GET } = await import('../../src/routes/api/onboarding/profile/+server');
    const event = {
      locals: { user: createMockUser() },
      platform: createMockPlatform(),
      url: new URL('http://localhost/api/onboarding/profile?id=nonexistent')
    };

    await expect(GET(event as any)).rejects.toThrow();
  });

  it('should return 403 when profile belongs to different user', async () => {
    const { getBrandProfile } = await import('$lib/services/onboarding');
    vi.mocked(getBrandProfile).mockResolvedValue({
      id: 'bp-other',
      userId: 'other-user',
      status: 'in_progress',
      onboardingStep: 'welcome',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    } as any);

    const { GET } = await import('../../src/routes/api/onboarding/profile/+server');
    const event = {
      locals: { user: createMockUser() },
      platform: createMockPlatform(),
      url: new URL('http://localhost/api/onboarding/profile?id=bp-other')
    };

    await expect(GET(event as any)).rejects.toThrow();
  });
});

describe('PATCH /api/onboarding/profile - edge cases', () => {
  it('should return 400 when profileId is missing from body', async () => {
    const { PATCH } = await import('../../src/routes/api/onboarding/profile/+server');
    const event = {
      locals: { user: createMockUser() },
      platform: createMockPlatform(),
      request: new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ updates: { brandName: 'New' } })
      })
    };

    await expect(PATCH(event as any)).rejects.toThrow();
  });

  it('should return 400 when updates is missing from body', async () => {
    const { PATCH } = await import('../../src/routes/api/onboarding/profile/+server');
    const event = {
      locals: { user: createMockUser() },
      platform: createMockPlatform(),
      request: new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ profileId: 'bp-1' })
      })
    };

    await expect(PATCH(event as any)).rejects.toThrow();
  });

  it('should auto-confirm brandName when brandName is set', async () => {
    const { updateBrandProfile, getBrandProfile } = await import('$lib/services/onboarding');
    vi.mocked(updateBrandProfile).mockResolvedValue(undefined);
    vi.mocked(getBrandProfile).mockResolvedValue({
      id: 'bp-1',
      userId: 'user-1',
      status: 'in_progress',
      brandName: 'NewBrand',
      brandNameConfirmed: true,
      onboardingStep: 'welcome',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    } as any);

    const { PATCH } = await import('../../src/routes/api/onboarding/profile/+server');
    const event = {
      locals: { user: createMockUser() },
      platform: createMockPlatform(),
      request: new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({
          profileId: 'bp-1',
          updates: { brandName: 'NewBrand' }
        })
      })
    };

    const response = await PATCH(event as any);
    expect(response).toBeDefined();

    // Verify that updateBrandProfile was called with brandNameConfirmed = true
    expect(updateBrandProfile).toHaveBeenCalledWith(
      expect.anything(),
      'bp-1',
      expect.objectContaining({ brandNameConfirmed: true })
    );
  });

  it('should not auto-confirm when brandNameConfirmed is explicitly set', async () => {
    const { updateBrandProfile, getBrandProfile } = await import('$lib/services/onboarding');
    vi.mocked(updateBrandProfile).mockResolvedValue(undefined);
    vi.mocked(getBrandProfile).mockResolvedValue({
      id: 'bp-1',
      userId: 'user-1',
      status: 'in_progress',
      brandName: 'NewBrand',
      brandNameConfirmed: false,
      onboardingStep: 'welcome',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    } as any);

    const { PATCH } = await import('../../src/routes/api/onboarding/profile/+server');
    const event = {
      locals: { user: createMockUser() },
      platform: createMockPlatform(),
      request: new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({
          profileId: 'bp-1',
          updates: { brandName: 'NewBrand', brandNameConfirmed: false }
        })
      })
    };

    const response = await PATCH(event as any);
    expect(response).toBeDefined();

    // Should NOT override the explicit brandNameConfirmed value
    expect(updateBrandProfile).toHaveBeenCalledWith(
      expect.anything(),
      'bp-1',
      expect.objectContaining({ brandNameConfirmed: false })
    );
  });
});
