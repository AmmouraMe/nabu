import { error, json } from '@sveltejs/kit';
import { requireOwner } from '$lib/server/auth-guards';
import type { RequestHandler } from './$types';

// PUT - Update auth key
export const PUT: RequestHandler = async ({ params, request, platform, locals }) => {
	requireOwner(locals);

	try {
		const { id } = params;
		const data = await request.json();

		// Prevent editing of GitHub OAuth setup key
		if (platform?.env?.KV) {
			try {
				const authConfigStr = await platform.env.KV.get('auth_config:github');
				if (authConfigStr) {
					const authConfig = JSON.parse(authConfigStr);
					if (authConfig.id === id) {
						throw error(
							403,
							'Cannot edit setup authentication key. This key was configured during initial setup and cannot be modified here.'
						);
					}
				}
			} catch (err: unknown) {
				// If it's an HttpError (has status property), re-throw it
				if (err && typeof err === 'object' && 'status' in err) {
					throw err;
				}
				// Otherwise, log and continue (allow edit if check fails)
				console.error('Failed to check setup key status:', err);
			}
		}

		// Validate required fields
		if (!data.name || !data.clientId) {
			throw error(400, 'Missing required fields');
		}

		const updatedKey = {
			id,
			name: data.name,
			provider: data.provider,
			type: data.type,
			clientId: data.clientId,
			updatedAt: new Date().toISOString()
		};

		// Update auth config in KV for OAuth providers
		if (platform?.env?.KV && data.provider) {
			try {
				// Get existing config to preserve createdAt and potentially clientSecret
				const existingStr = await platform.env.KV.get(`auth_config:${data.provider}`);
				const existing = existingStr ? JSON.parse(existingStr) : {};

				const authConfig = {
					...existing,
					id,
					provider: data.provider,
					clientId: data.clientId,
					// Only update clientSecret if provided
					...(data.clientSecret && { clientSecret: data.clientSecret }),
					updatedAt: new Date().toISOString()
				};
				await platform.env.KV.put(`auth_config:${data.provider}`, JSON.stringify(authConfig));
				console.log(`✓ Updated ${data.provider} OAuth config in KV`);
			} catch (kvErr) {
				console.error('Failed to update auth config in KV:', kvErr);
			}
		}

		return json({ success: true, key: updatedKey });
	} catch (err: unknown) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		console.error('Failed to update auth key:', err);
		throw error(500, 'Failed to update authentication key');
	}
};

// DELETE - Delete auth key
export const DELETE: RequestHandler = async ({ params, platform, locals }) => {
	requireOwner(locals);

	try {
		const { id } = params;

		// Prevent deletion of GitHub OAuth setup key
		if (platform?.env?.KV) {
			try {
				const authConfigStr = await platform.env.KV.get('auth_config:github');
				if (authConfigStr) {
					const authConfig = JSON.parse(authConfigStr);
					if (authConfig.id === id) {
						throw error(
							403,
							'Cannot delete setup authentication key. This key was configured during initial setup and is required for authentication.'
						);
					}
				}
			} catch (err: unknown) {
				// If it's an HttpError (has status property), re-throw it
				if (err && typeof err === 'object' && 'status' in err) {
					throw err;
				}
				// Otherwise, log and continue (allow deletion if check fails)
				console.error('Failed to check setup key status:', err);
			}
		}

		// Delete auth config from KV
		// Find which provider this key belongs to and delete it
		if (platform?.env?.KV) {
			for (const provider of ['github', 'discord', 'google', 'microsoft']) {
				try {
					const configStr = await platform.env.KV.get(`auth_config:${provider}`);
					if (configStr) {
						const config = JSON.parse(configStr);
						if (config.id === id) {
							await platform.env.KV.delete(`auth_config:${provider}`);
							console.log(`✓ Deleted ${provider} OAuth config from KV`);
							break;
						}
					}
				} catch (kvErr) {
					console.error(`Failed to check/delete ${provider} config:`, kvErr);
				}
			}
		}

		return json({ success: true });
	} catch (err: unknown) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		console.error('Failed to delete auth key:', err);
		throw error(500, 'Failed to delete authentication key');
	}
};
