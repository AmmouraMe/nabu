import { error, json } from '@sveltejs/kit';
import { WORKERS_AI_IMAGE_MODELS, runWorkersAIImage } from '$lib/services/ai-media-generation';
import { WORKERS_AI_TEXT_MODELS } from '$lib/services/openai-chat';
import type { RequestHandler } from './$types';

/**
 * Cloudflare Workers AI "connection".
 *
 * There is nothing to authenticate: the `AI` binding authorises as the account
 * that owns the Worker, so there is no key to paste, store, or rotate. This
 * endpoint therefore only (a) reports whether the binding is actually present
 * and working, and (b) records an enabled entry in the normal `ai_key:` list so
 * the provider shows up beside the hand-entered keys.
 */

const PROBE_MODEL = '@cf/black-forest-labs/flux-1-schnell';

function requireAdmin(locals: App.Locals) {
	if (!locals.user?.isOwner && !locals.user?.isAdmin) {
		throw error(403, 'Admin access required');
	}
}

async function findExisting(platform: App.Platform) {
	const listRaw = await platform.env.KV.get('ai_keys_list');
	if (!listRaw) return null;
	for (const id of JSON.parse(listRaw) as string[]) {
		const raw = await platform.env.KV.get(`ai_key:${id}`);
		if (!raw) continue;
		const key = JSON.parse(raw);
		if (key.provider === 'workers-ai') return key;
	}
	return null;
}

// GET - Is the binding present, and is it already connected?
export const GET: RequestHandler = async ({ platform, locals }) => {
	requireAdmin(locals);

	const available = Boolean(platform?.env?.AI);
	if (!platform?.env?.KV) {
		return json({ available, connected: false, models: WORKERS_AI_IMAGE_MODELS });
	}

	const existing = await findExisting(platform);
	return json({
		available,
		connected: Boolean(existing),
		enabled: existing?.enabled !== false,
		models: WORKERS_AI_IMAGE_MODELS
	});
};

// POST - Connect (idempotent), or ?test=1 to prove the binding really generates.
export const POST: RequestHandler = async ({ url, platform, locals }) => {
	requireAdmin(locals);

	if (!platform?.env?.AI) {
		throw error(400, 'The Workers AI binding is not available in this environment');
	}

	if (url.searchParams.get('test') === '1') {
		try {
			const started = Date.now();
			const result = await runWorkersAIImage(platform.env.AI, PROBE_MODEL, {
				prompt: 'a simple geometric shape, flat vector, solid background',
				steps: 4
			});
			if (!result?.image) throw new Error('no image returned');
			return json({
				ok: true,
				ms: Date.now() - started,
				bytes: Math.floor((result.image.length * 3) / 4)
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Workers AI test failed';
			console.error('Workers AI test generation failed:', err);
			return json({ ok: false, message }, { status: 200 });
		}
	}

	if (!platform.env.KV) throw error(500, 'KV storage not available');

	const imageModels = WORKERS_AI_IMAGE_MODELS.map((m) => m.id);
	const existing = await findExisting(platform);
	if (existing) {
		// Self-heal records written before text support existed: `models` is the
		// TEXT chat list (chat picks models[0]), images live in `imageModels`.
		const needsUpgrade =
			!Array.isArray(existing.models) ||
			existing.models.length === 0 ||
			existing.models.some((m: string) => imageModels.includes(m));
		if (needsUpgrade) {
			existing.models = [...WORKERS_AI_TEXT_MODELS];
			existing.imageModels = imageModels;
			await platform.env.KV.put(`ai_key:${existing.id}`, JSON.stringify(existing));
		}
		return json({ success: true, alreadyConnected: true, upgraded: needsUpgrade, key: existing });
	}

	const id = crypto.randomUUID();
	const record = {
		id,
		name: 'Cloudflare Workers AI',
		provider: 'workers-ai',
		// Text chat models — chat resolves models[0] as the effective model.
		models: [...WORKERS_AI_TEXT_MODELS],
		imageModels,
		// Deliberately empty: the binding authenticates, not a secret. Consumers
		// key off `provider`, so nothing reads this field for workers-ai.
		apiKey: '',
		keyless: true,
		enabled: true,
		voiceEnabled: false,
		voiceModels: [],
		videoEnabled: false,
		videoModels: [],
		createdAt: new Date().toISOString()
	};

	await platform.env.KV.put(`ai_key:${id}`, JSON.stringify(record));
	const listRaw = await platform.env.KV.get('ai_keys_list');
	const ids = listRaw ? JSON.parse(listRaw) : [];
	ids.push(id);
	await platform.env.KV.put('ai_keys_list', JSON.stringify(ids));

	return json({ success: true, key: record });
};
