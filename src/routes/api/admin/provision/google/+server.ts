import { error, json } from '@sveltejs/kit';
import {
	GcpError,
	getAccessToken,
	getGcpConfig,
	getStoredTokens,
	listProjects,
	provisionApiKey
} from '$lib/server/gcp-provision';
import type { RequestHandler } from './$types';

function requireAdmin(locals: App.Locals) {
	if (!locals.user?.isOwner && !locals.user?.isAdmin) {
		throw error(403, 'Admin access required');
	}
}

// GET - Connection status plus, once connected, the projects available to mint in.
export const GET: RequestHandler = async ({ platform, locals }) => {
	requireAdmin(locals);

	const config = await getGcpConfig(platform);
	if (!config) {
		return json({ configured: false, connected: false, projects: [] });
	}

	const tokens = await getStoredTokens(platform);
	if (!tokens) {
		return json({ configured: true, connected: false, projects: [] });
	}

	try {
		const accessToken = await getAccessToken(config, tokens.refreshToken);
		const projects = await listProjects(accessToken);
		return json({
			configured: true,
			connected: true,
			account: tokens.account,
			projects
		});
	} catch (err) {
		const message = err instanceof GcpError ? err.message : 'Failed to reach Google Cloud';
		return json({ configured: true, connected: false, projects: [], error: message });
	}
};

// POST - Mint (or reuse) an API key in the chosen project and save it as an AI key.
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	requireAdmin(locals);

	if (!platform?.env?.KV) {
		throw error(500, 'KV storage not available');
	}

	const body = (await request.json().catch(() => ({}))) as {
		projectId?: string;
		name?: string;
		models?: string[];
	};
	if (!body.projectId) {
		throw error(400, 'projectId is required');
	}

	const config = await getGcpConfig(platform);
	if (!config) throw error(400, 'Google Cloud OAuth client is not configured');

	const tokens = await getStoredTokens(platform);
	if (!tokens) throw error(400, 'Google Cloud account is not connected');

	try {
		const accessToken = await getAccessToken(config, tokens.refreshToken);
		const result = await provisionApiKey(body.projectId, accessToken);

		// Store using the same record shape as the hand-entered AI keys.
		const id = crypto.randomUUID();
		const newKey = {
			id,
			name: body.name || `Google (${result.projectId})`,
			provider: 'google',
			models: body.models || [],
			apiKey: result.keyString,
			enabled: true,
			voiceEnabled: false,
			voiceModels: [],
			videoEnabled: false,
			videoModels: [],
			provisioned: true,
			gcpProjectId: result.projectId,
			gcpKeyName: result.keyName,
			createdAt: new Date().toISOString()
		};

		await platform.env.KV.put(`ai_key:${id}`, JSON.stringify(newKey));
		const keysList = await platform.env.KV.get('ai_keys_list');
		const keyIds = keysList ? JSON.parse(keysList) : [];
		keyIds.push(id);
		await platform.env.KV.put('ai_keys_list', JSON.stringify(keyIds));

		const { apiKey: _omit, ...safeKey } = newKey;
		return json({ success: true, key: safeKey, reused: result.reused });
	} catch (err) {
		if (err instanceof GcpError) {
			console.error('Google provisioning failed:', err.message);
			throw error(err.status && err.status < 500 ? 400 : 502, err.message);
		}
		if (err instanceof Error && 'status' in err) throw err;
		console.error('Google provisioning failed:', err);
		throw error(500, 'Failed to provision Google API key');
	}
};
