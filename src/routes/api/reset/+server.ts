import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// POST - Reset setup configuration
export const POST: RequestHandler = async ({ platform, cookies, locals }) => {
	try {
		if (!platform?.env?.KV) {
			throw error(500, 'KV storage not available');
		}

		// Check if reset route is disabled via admin settings.
		// Checked first: this is a hard kill switch and applies to everyone, owner included.
		const resetDisabled = await platform.env.KV.get('reset_route_disabled');
		if (resetDisabled === 'true') {
			throw error(403, 'Reset route has been disabled by the administrator');
		}

		// Once an owner exists, only that owner may reset.
		//
		// This endpoint deletes `admin_first_login_completed`, which is the only thing
		// locking /setup. Unauthenticated, it was therefore a complete takeover: reset
		// the instance, then claim admin through the normal setup flow. It had no auth
		// check at all — only the kill switch above, which defaults to off and can only
		// be switched on from the admin UI *after* an owner has already logged in, i.e.
		// never during the window that mattered.
		//
		// Before an owner exists there is nothing to protect and /setup is openly
		// bootstrappable by design, so the check is scoped to "an owner has been
		// established". An operator locked out of a half-configured instance can still
		// clear these keys with `wrangler kv key delete`.
		const ownerEstablished = !!(
			(await platform.env.KV.get('github_owner_id')) ||
			(await platform.env.KV.get('admin_first_login_completed'))
		);
		if (ownerEstablished && !locals?.user?.isOwner) {
			throw error(403, 'Only the owner can reset the configuration');
		}

		// Delete setup-related KV keys
		const keysToDelete = [
			'auth_config:github',
			'github_owner_id',
			'github_owner_username',
			'admin_first_login_completed'
		];

		for (const key of keysToDelete) {
			try {
				await platform.env.KV.delete(key);
				console.log(`✓ Deleted KV key: ${key}`);
			} catch (err) {
				console.warn(`Failed to delete KV key ${key}:`, err);
			}
		}

		// Clear the session cookie to force re-login
		cookies.delete('session', { path: '/' });

		console.log('✓ Setup configuration reset complete');

		return json({
			success: true,
			message: 'Configuration reset successfully. You will be redirected to the setup page.'
		});
	} catch (err) {
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		console.error('Failed to reset configuration:', err);
		throw error(500, 'Failed to reset configuration');
	}
};
