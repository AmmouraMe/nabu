import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Admin Core Principle Questions Page Server', () => {
	let mockFetch: ReturnType<typeof vi.fn>;
	let load: any;

	beforeEach(async () => {
		vi.resetModules();
		mockFetch = vi.fn();
		const module = await import('../../src/routes/admin/core-principle-questions/+page.server.js');
		load = module.load;
	});

	it('returns questions when fetch succeeds', async () => {
		const questions = [{ id: 'q1', question: 'What does your brand stand for?', is_active: 1 }];
		mockFetch.mockResolvedValue({ ok: true, json: async () => ({ questions }) });

		const result = await load({ fetch: mockFetch });
		expect(result.questions).toEqual(questions);
		expect(mockFetch).toHaveBeenCalledWith('/api/admin/core-principle-questions');
	});

	it('returns empty list when fetch fails', async () => {
		mockFetch.mockResolvedValue({ ok: false });
		const result = await load({ fetch: mockFetch });
		expect(result.questions).toEqual([]);
	});
});
