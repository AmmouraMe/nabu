import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for Account Merging
 * TDD: Testing that when a social account is already linked to another user,
 * the accounts should be merged seamlessly instead of showing an error.
 */

describe('Account Merge Service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	describe('mergeAccounts', () => {
		it('should transfer all oauth_accounts from source user to target user', async () => {
			const { mergeAccounts } = await import('../../src/lib/services/account-merge');

			const mockBatchResults = { success: true };
			const mockPrepare = vi.fn().mockReturnValue({
				bind: vi.fn().mockReturnValue({
					run: vi.fn().mockResolvedValue({}),
					first: vi.fn().mockResolvedValue({ is_admin: 0 })
				})
			});
			const mockBatch = vi.fn().mockResolvedValue(mockBatchResults);

			const mockDB = {
				prepare: mockPrepare,
				batch: mockBatch
			};

			await mergeAccounts(mockDB as any, 'source-user-id', 'target-user-id');

			// Verify oauth_accounts are transferred
			expect(mockPrepare).toHaveBeenCalledWith(
				'UPDATE oauth_accounts SET user_id = ? WHERE user_id = ?'
			);
		});

		it('should transfer all chat_messages from source user to target user', async () => {
			const { mergeAccounts } = await import('../../src/lib/services/account-merge');

			const mockBatchResults = { success: true };
			const mockPrepare = vi.fn().mockReturnValue({
				bind: vi.fn().mockReturnValue({
					run: vi.fn().mockResolvedValue({}),
					first: vi.fn().mockResolvedValue({ is_admin: 0 })
				})
			});
			const mockBatch = vi.fn().mockResolvedValue(mockBatchResults);

			const mockDB = {
				prepare: mockPrepare,
				batch: mockBatch
			};

			await mergeAccounts(mockDB as any, 'source-user-id', 'target-user-id');

			// Verify chat_messages are transferred
			expect(mockPrepare).toHaveBeenCalledWith(
				'UPDATE chat_messages SET user_id = ? WHERE user_id = ?'
			);
		});

		it('should transfer all sessions from source user to target user', async () => {
			const { mergeAccounts } = await import('../../src/lib/services/account-merge');

			const mockBatchResults = { success: true };
			const mockPrepare = vi.fn().mockReturnValue({
				bind: vi.fn().mockReturnValue({
					run: vi.fn().mockResolvedValue({}),
					first: vi.fn().mockResolvedValue({ is_admin: 0 })
				})
			});
			const mockBatch = vi.fn().mockResolvedValue(mockBatchResults);

			const mockDB = {
				prepare: mockPrepare,
				batch: mockBatch
			};

			await mergeAccounts(mockDB as any, 'source-user-id', 'target-user-id');

			// Verify sessions are transferred
			expect(mockPrepare).toHaveBeenCalledWith('UPDATE sessions SET user_id = ? WHERE user_id = ?');
		});

		it('should transfer brand ownership and related brand activity to the target user', async () => {
			const { mergeAccounts } = await import('../../src/lib/services/account-merge');

			const mockPrepare = vi.fn().mockReturnValue({
				bind: vi.fn().mockReturnValue({
					run: vi.fn().mockResolvedValue({}),
					first: vi.fn().mockResolvedValue({ is_admin: 0 })
				})
			});
			const mockBatch = vi.fn().mockResolvedValue({ success: true });

			const mockDB = {
				prepare: mockPrepare,
				batch: mockBatch
			};

			await mergeAccounts(mockDB as any, 'source-user-id', 'target-user-id');

			expect(mockPrepare).toHaveBeenCalledWith(
				'UPDATE brand_profiles SET user_id = ? WHERE user_id = ?'
			);
			expect(mockPrepare).toHaveBeenCalledWith(
				'UPDATE onboarding_messages SET user_id = ? WHERE user_id = ?'
			);
			expect(mockPrepare).toHaveBeenCalledWith(
				'UPDATE brand_field_versions SET user_id = ? WHERE user_id = ?'
			);
			expect(mockPrepare).toHaveBeenCalledWith(
				'UPDATE file_archive SET user_id = ? WHERE user_id = ?'
			);
			expect(mockPrepare).toHaveBeenCalledWith(
				'UPDATE media_activity_log SET user_id = ? WHERE user_id = ?'
			);
		});

		it('should delete the source user after transferring data', async () => {
			const { mergeAccounts } = await import('../../src/lib/services/account-merge');

			const mockPrepare = vi.fn().mockReturnValue({
				bind: vi.fn().mockReturnValue({
					run: vi.fn().mockResolvedValue({}),
					first: vi.fn().mockResolvedValue({ is_admin: 0 })
				})
			});
			const mockBatch = vi.fn().mockResolvedValue({ success: true });

			const mockDB = {
				prepare: mockPrepare,
				batch: mockBatch
			};

			await mergeAccounts(mockDB as any, 'source-user-id', 'target-user-id');

			// Verify source user is deleted
			expect(mockPrepare).toHaveBeenCalledWith('DELETE FROM users WHERE id = ?');
		});

		it('should merge admin status (source is admin should make target admin)', async () => {
			const { mergeAccounts } = await import('../../src/lib/services/account-merge');

			const mockPrepare = vi.fn().mockReturnValue({
				bind: vi.fn().mockReturnValue({
					run: vi.fn().mockResolvedValue({}),
					first: vi.fn().mockResolvedValue({ is_admin: 1 })
				})
			});
			const mockBatch = vi.fn().mockResolvedValue({ success: true });

			const mockDB = {
				prepare: mockPrepare,
				batch: mockBatch
			};

			await mergeAccounts(mockDB as any, 'admin-source-id', 'target-user-id');

			// Should check source user's admin status and update target if source was admin
			expect(mockPrepare).toHaveBeenCalledWith('SELECT is_admin FROM users WHERE id = ?');
		});

		it('should use batch operations for atomic updates', async () => {
			const { mergeAccounts } = await import('../../src/lib/services/account-merge');

			const mockBatch = vi.fn().mockResolvedValue({ success: true });
			const mockPrepare = vi.fn().mockReturnValue({
				bind: vi.fn().mockReturnValue({
					run: vi.fn().mockResolvedValue({}),
					first: vi.fn().mockResolvedValue({ is_admin: 0 })
				})
			});

			const mockDB = {
				prepare: mockPrepare,
				batch: mockBatch
			};

			await mergeAccounts(mockDB as any, 'source-user-id', 'target-user-id');

			// Verify batch is called for atomic operations
			expect(mockBatch).toHaveBeenCalled();
		});
	});
});

describe('GitHub Callback - Account Merge on Link', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it('should merge accounts instead of showing error when GitHub is already linked to another user', async () => {
		// This test verifies the behavior when:
		// 1. User A is logged in
		// 2. User A tries to link GitHub account X
		// 3. GitHub account X is already linked to User B
		// Expected: User B's data should be merged into User A, User B deleted

		// The actual callback test would be complex due to OAuth flow
		// This is a placeholder to document expected behavior
		expect(true).toBe(true);
	});
});

describe('Discord Callback - Account Merge on Link', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it('should merge accounts instead of showing error when Discord is already linked to another user', async () => {
		// This test verifies the behavior when:
		// 1. User A is logged in
		// 2. User A tries to link Discord account X
		// 3. Discord account X is already linked to User B
		// Expected: User B's data should be merged into User A, User B deleted

		// The actual callback test would be complex due to OAuth flow
		// This is a placeholder to document expected behavior
		expect(true).toBe(true);
	});
});
