/**
 * Tests for Brand Text Revisions API endpoint
 * Covers GET and POST /api/brand/assets/texts/revisions
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withBrandAccess } from '../fixtures/brand-access';

vi.mock('$lib/services/text-history', () => ({
	getTextRevisions: vi.fn(),
	getCurrentTextRevision: vi.fn(),
	revertTextToRevision: vi.fn(),
	createTextRevision: vi.fn()
}));

vi.mock('$lib/services/brand-assets', () => ({
	updateBrandText: vi.fn()
}));

describe('Brand Text Revisions API', () => {
	let mockPlatform: any;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
		mockPlatform = {
			env: {
				// Wrapped so the route's ownership check answers — `u1` owns the text asset
				// these tests operate on.
				DB: withBrandAccess(
					{
						prepare: vi.fn().mockReturnValue({
							bind: vi.fn().mockReturnValue({
								first: vi.fn().mockResolvedValue(null),
								all: vi.fn().mockResolvedValue({ results: [] }),
								run: vi.fn().mockResolvedValue({ success: true })
							})
						})
					},
					{ userId: 'u1' }
				)
			}
		};
	});

	// ─── GET endpoint ──────────────────────────────

	describe('GET /api/brand/assets/texts/revisions', () => {
		it('should return 401 when not authenticated', async () => {
			const { GET } = await import('../../src/routes/api/brand/assets/texts/revisions/+server');
			await expect(
				GET({ url: new URL('http://localhost'), platform: mockPlatform, locals: {} } as any)
			).rejects.toThrow();
		});

		it('should return 500 when platform not available', async () => {
			const { GET } = await import('../../src/routes/api/brand/assets/texts/revisions/+server');
			await expect(
				GET({
					url: new URL('http://localhost'),
					platform: {},
					locals: { user: { id: 'u1' } }
				} as any)
			).rejects.toThrow();
		});

		it('should return 400 when brandTextId missing', async () => {
			const { GET } = await import('../../src/routes/api/brand/assets/texts/revisions/+server');
			await expect(
				GET({
					url: new URL('http://localhost'),
					platform: mockPlatform,
					locals: { user: { id: 'u1' } }
				} as any)
			).rejects.toThrow();
		});

		it('should return current revision when current=true', async () => {
			const { getCurrentTextRevision } = await import('$lib/services/text-history');
			const mockRevision = { id: 'r1', value: 'Current value', isCurrent: true };
			vi.mocked(getCurrentTextRevision).mockResolvedValue(mockRevision as any);

			const { GET } = await import('../../src/routes/api/brand/assets/texts/revisions/+server');
			const url = new URL('http://localhost?brandTextId=text-1&current=true');
			const response = await GET({
				url,
				platform: mockPlatform,
				locals: { user: { id: 'u1' } }
			} as any);

			const data = await response.json();
			expect(data.revision).toEqual(mockRevision);
		});

		it('should return all revisions when current is not true', async () => {
			const { getTextRevisions } = await import('$lib/services/text-history');
			const mockRevisions = [
				{ id: 'r1', revisionNumber: 1 },
				{ id: 'r2', revisionNumber: 2 }
			];
			vi.mocked(getTextRevisions).mockResolvedValue(mockRevisions as any);

			const { GET } = await import('../../src/routes/api/brand/assets/texts/revisions/+server');
			const url = new URL('http://localhost?brandTextId=text-1');
			const response = await GET({
				url,
				platform: mockPlatform,
				locals: { user: { id: 'u1' } }
			} as any);

			const data = await response.json();
			expect(data.revisions).toEqual(mockRevisions);
		});
	});

	// ─── POST endpoint ──────────────────────────────

	describe('POST /api/brand/assets/texts/revisions', () => {
		it('should return 401 when not authenticated', async () => {
			const { POST } = await import('../../src/routes/api/brand/assets/texts/revisions/+server');
			await expect(
				POST({
					request: new Request('http://localhost', { method: 'POST', body: '{}' }),
					platform: mockPlatform,
					locals: {}
				} as any)
			).rejects.toThrow();
		});

		it('should return 500 when platform not available', async () => {
			const { POST } = await import('../../src/routes/api/brand/assets/texts/revisions/+server');
			await expect(
				POST({
					request: new Request('http://localhost', { method: 'POST', body: '{}' }),
					platform: {},
					locals: { user: { id: 'u1' } }
				} as any)
			).rejects.toThrow();
		});

		it('should revert to a previous revision', async () => {
			const { revertTextToRevision } = await import('$lib/services/text-history');
			const { updateBrandText } = await import('$lib/services/brand-assets');
			const mockRevision = {
				id: 'new-r',
				brandTextId: 'text-1',
				value: 'Reverted',
				label: 'Label'
			};
			vi.mocked(revertTextToRevision).mockResolvedValue(mockRevision as any);
			vi.mocked(updateBrandText).mockResolvedValue(undefined as any);

			const { POST } = await import('../../src/routes/api/brand/assets/texts/revisions/+server');
			const response = await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'revert', revisionId: 'r1' })
				}),
				platform: mockPlatform,
				locals: { user: { id: 'u1' } }
			} as any);

			const data = await response.json();
			expect(data.revision).toEqual(mockRevision);
			expect(updateBrandText).toHaveBeenCalledWith(expect.anything(), 'text-1', {
				value: 'Reverted',
				label: 'Label'
			});
		});

		it('should return 400 when revisionId missing for revert', async () => {
			const { POST } = await import('../../src/routes/api/brand/assets/texts/revisions/+server');
			await expect(
				POST({
					request: new Request('http://localhost', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ action: 'revert' })
					}),
					platform: mockPlatform,
					locals: { user: { id: 'u1' } }
				} as any)
			).rejects.toThrow();
		});

		it('should create a new revision', async () => {
			const { createTextRevision } = await import('$lib/services/text-history');
			const mockRevision = { id: 'new-r', brandTextId: 'text-1', value: 'New value' };
			vi.mocked(createTextRevision).mockResolvedValue(mockRevision as any);

			const { POST } = await import('../../src/routes/api/brand/assets/texts/revisions/+server');
			const response = await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						brandTextId: 'text-1',
						value: 'New value',
						label: 'Tagline',
						changeSource: 'manual',
						changeNote: 'Edited'
					})
				}),
				platform: mockPlatform,
				locals: { user: { id: 'u1' } }
			} as any);

			expect(response.status).toBe(201);
			const data = await response.json();
			expect(data.revision).toEqual(mockRevision);
		});

		it('should return 400 when brandTextId missing for create', async () => {
			const { POST } = await import('../../src/routes/api/brand/assets/texts/revisions/+server');
			await expect(
				POST({
					request: new Request('http://localhost', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ value: 'test' })
					}),
					platform: mockPlatform,
					locals: { user: { id: 'u1' } }
				} as any)
			).rejects.toThrow();
		});

		it('should return 400 when value missing for create', async () => {
			const { POST } = await import('../../src/routes/api/brand/assets/texts/revisions/+server');
			await expect(
				POST({
					request: new Request('http://localhost', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ brandTextId: 'text-1' })
					}),
					platform: mockPlatform,
					locals: { user: { id: 'u1' } }
				} as any)
			).rejects.toThrow();
		});

		it('should default changeSource to manual when not specified', async () => {
			const { createTextRevision } = await import('$lib/services/text-history');
			vi.mocked(createTextRevision).mockResolvedValue({ id: 'r1' } as any);

			const { POST } = await import('../../src/routes/api/brand/assets/texts/revisions/+server');
			await POST({
				request: new Request('http://localhost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ brandTextId: 'text-1', value: 'val' })
				}),
				platform: mockPlatform,
				locals: { user: { id: 'u1' } }
			} as any);

			expect(createTextRevision).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					changeSource: 'manual'
				})
			);
		});
	});
});
