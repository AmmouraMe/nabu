import { error, json } from '@sveltejs/kit';
import { requireOwner } from '$lib/server/auth-guards';
import { AUTH_PROVIDERS, isAuthProvider } from '$lib/server/auth-provider-config';
import type { RequestHandler } from './$types';

interface AuthKeySummary {
	id: string;
	name: string;
	provider: (typeof AUTH_PROVIDERS)[number];
	type: 'oauth';
	clientId: string;
	createdAt: string;
	isSetupKey: boolean;
}

// GET - List all auth keys
export const GET: RequestHandler = async ({ platform, locals }) => {
	requireOwner(locals);

	try {
		const keys: AuthKeySummary[] = [];

		// Fetch GitHub OAuth configuration from KV (saved during setup)
		if (platform?.env?.KV) {
			for (const provider of AUTH_PROVIDERS) {
				const configString = await platform.env.KV.get(`auth_config:${provider}`);
				if (!configString) continue;
				const config = JSON.parse(configString) as Partial<
					Pick<AuthKeySummary, 'id' | 'clientId' | 'createdAt'>
				>;
				if (
					typeof config.id !== 'string' ||
					typeof config.clientId !== 'string' ||
					typeof config.createdAt !== 'string'
				) {
					throw new Error(`Invalid stored ${provider} OAuth configuration`);
				}
				keys.push({
					id: config.id,
					name: `${provider === 'github' ? 'GitHub' : 'Discord'} OAuth`,
					provider,
					type: 'oauth',
					clientId: config.clientId,
					createdAt: config.createdAt,
					isSetupKey: provider === 'github'
				});
			}
		}

		return json({ keys });
	} catch (err) {
		console.error('Failed to fetch auth keys:', err);
		throw error(500, 'Failed to fetch authentication keys');
	}
};

// POST - Create new auth key
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	requireOwner(locals);

	try {
		const data = await request.json();

		// Validate required fields
		if (!data.name || !data.provider || !data.clientId || !data.clientSecret) {
			throw error(400, 'Missing required fields');
		}
		if (!isAuthProvider(data.provider)) throw error(400, 'Unsupported authentication provider');

		// Generate unique ID
		const id = crypto.randomUUID();
		const createdAt = new Date().toISOString();

		const newKey = {
			id,
			name: data.name,
			provider: data.provider,
			type: data.type,
			clientId: data.clientId,
			createdAt
		};

		// Store in KV for OAuth providers (github, discord, etc.)
		if (platform?.env?.KV && data.provider) {
			const authConfig = {
				id,
				provider: data.provider,
				clientId: data.clientId,
				clientSecret: data.clientSecret,
				createdAt,
				updatedAt: new Date().toISOString()
			};
			await platform.env.KV.put(`auth_config:${data.provider}`, JSON.stringify(authConfig));
			console.log(`✓ Saved ${data.provider} OAuth config to KV`);
		}

		return json({ success: true, key: newKey });
	} catch (err) {
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		console.error('Failed to create auth key:', err);
		throw error(500, 'Failed to create authentication key');
	}
};
