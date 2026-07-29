import { redirect } from '@sveltejs/kit';
import { resolvePlan, usageSnapshot } from '$lib/server/entitlements';
// Third copy of this helper in the codebase before it was shared; see
// $lib/server/oauth-config for why login, signup and profile now ask one function.
import { configuredProviders } from '$lib/server/oauth-config';
import { getTier } from '$lib/utils/pricing';
import type { PageServerLoad } from './$types';

interface OAuthAccount {
	provider: string;
	provider_account_id: string;
	created_at: string;
}

export const load: PageServerLoad = async ({ locals, platform }) => {
	// Require authentication
	if (!locals.user) {
		throw redirect(302, '/auth/login');
	}

	console.log('[Profile] Loading for user:', locals.user.id, 'login:', locals.user.login);

	// Fetch connected accounts from database
	let connectedAccounts: OAuthAccount[] = [];

	if (platform?.env?.DB) {
		console.log('[Profile] DB available, fetching oauth_accounts');
		try {
			const result = await platform.env.DB.prepare(
				'SELECT provider, provider_account_id, created_at FROM oauth_accounts WHERE user_id = ?'
			)
				.bind(locals.user.id)
				.all<OAuthAccount>();

			console.log('[Profile] oauth_accounts query result:', JSON.stringify(result));

			if (result.results) {
				connectedAccounts = result.results;
			}

			// Migration fix: If user has github_login but no GitHub oauth_account, create one
			// This handles users created before oauth_accounts was fully implemented
			const hasGitHubConnection = connectedAccounts.some((acc) => acc.provider === 'github');
			console.log(
				'[Profile] hasGitHubConnection:',
				hasGitHubConnection,
				'user.login:',
				locals.user.login
			);

			if (!hasGitHubConnection && locals.user.login) {
				// Check if the user has a github_login in the database
				const userRecord = await platform.env.DB.prepare(
					'SELECT github_login FROM users WHERE id = ?'
				)
					.bind(locals.user.id)
					.first<{ github_login: string | null }>();

				console.log('[Profile] User record from DB:', JSON.stringify(userRecord));

				if (userRecord?.github_login) {
					console.log('[Profile] Creating missing oauth_accounts record for GitHub');
					// Create the missing oauth_accounts record
					// User ID is used as provider_account_id for GitHub users (their GitHub numeric ID)
					await platform.env.DB.prepare(
						`INSERT INTO oauth_accounts (id, user_id, provider, provider_account_id, created_at)
						VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
					)
						.bind(crypto.randomUUID(), locals.user.id, 'github', locals.user.id)
						.run();

					// Add to the result so UI shows it immediately
					connectedAccounts.push({
						provider: 'github',
						provider_account_id: locals.user.id,
						created_at: new Date().toISOString()
					});
					console.log('[Profile] Created oauth_accounts record successfully');
				}
			}
		} catch (err) {
			console.error('[Profile] Failed to fetch/create connected accounts:', err);
		}
	} else {
		// No DB available - cannot determine connected accounts without database
		// In production, DB should always be available
		console.warn('[Profile] Database not available for fetching connected accounts');
	}

	console.log('[Profile] Returning connectedAccounts:', JSON.stringify(connectedAccounts));

	// Plan and consumption, so the account page can show where someone stands before
	// a limit stops them mid-task. Rendered server-side rather than fetched from
	// /api/account/usage so the panel is there on first paint — this is the page
	// people open *because* something was refused.
	let usage: Awaited<ReturnType<typeof usageSnapshot>> | null = null;
	let planName: string | null = null;

	if (platform?.env?.DB) {
		try {
			const plan = await resolvePlan(platform.env.DB, locals.user.id);
			usage = await usageSnapshot(platform.env.DB, locals.user.id, plan);
			planName = getTier(plan).name;
		} catch (err) {
			// The rest of the page is still worth rendering without it.
			console.error('[Profile] Failed to load plan usage:', err);
		}
	}

	return {
		user: locals.user,
		connectedAccounts,
		configuredProviders: await configuredProviders(platform),
		usage,
		planName
	};
};
