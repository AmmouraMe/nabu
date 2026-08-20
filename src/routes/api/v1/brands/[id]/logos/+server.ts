import type { RequestHandler } from './$types';
import { requireApiKey, requireBrand, readJson, apiJson } from '$lib/server/api-guard';
import { apiError } from '$lib/server/api-keys';
import { buildLogoPrompt, isLogoStyle, LOGO_STYLES } from '$lib/server/logo-prompt';
import {
	generateImage,
	isWorkersAIModel,
	runWorkersAIImage,
	updateAIGenerationStatus
} from '$lib/services/ai-media-generation';
import { createBrandMedia } from '$lib/services/brand-assets';
import {
	consumeUsage,
	entitlementRefusal,
	hasFeature,
	releaseUsage,
	resolvePlan
} from '$lib/server/entitlements';

/** Keyless default: Workers AI needs no provider key, so the API works out of the box. */
const DEFAULT_MODEL = '@cf/black-forest-labs/flux-1-schnell';

/**
 * GET /api/v1/brands/:id/logos
 *
 * Logo assets generated for this brand, newest first, plus which one is currently
 * assigned as the brand's logo.
 */
export const GET: RequestHandler = async (event) => {
	const auth = await requireApiKey(event, 'assets:read');
	if (!auth.ok) return auth.response;
	const { principal, db } = auth.value;

	const brandId = event.params.id;
	const access = await requireBrand(db, principal, brandId, 'read');
	if (!access.ok) return access.response;

	const rows = await db
		.prepare(
			`SELECT id, name, r2_key, mime_type, width, height, created_at
			 FROM brand_media
			 WHERE brand_profile_id = ? AND media_type = 'image' AND category = 'logo'
			 ORDER BY created_at DESC LIMIT 50`
		)
		.bind(brandId)
		.all();

	const profile = await db
		.prepare('SELECT logo_url FROM brand_profiles WHERE id = ?')
		.bind(brandId)
		.first<{ logo_url: string | null }>();

	return apiJson({
		data: (rows.results ?? []).map((r: Record<string, unknown>) => ({
			id: r.id,
			name: r.name,
			// Fetchable with the caller's API key; the app's own file route needs a
			// browser session and would be a dead link to an API client.
			url: `/api/v1/brands/${brandId}/assets/${r.id}/content`,
			mime_type: r.mime_type,
			width: r.width,
			height: r.height,
			created_at: r.created_at
		})),
		current_logo_url: profile?.logo_url ?? null
	});
};

/**
 * POST /api/v1/brands/:id/logos
 *
 * Generate a logo for the brand and store it as an asset.
 *
 * Runs synchronously for Workers AI, which returns inline — so a caller gets a
 * finished asset in one request rather than having to poll. The generation row is
 * still written first, so a failure leaves a record explaining why instead of
 * nothing at all.
 *
 * Assigning the result as the brand's logo is opt-in via `set_as_logo`. Generating
 * and choosing are separate decisions: an app will usually want to offer a few
 * candidates before overwriting the mark a brand is already using.
 */
export const POST: RequestHandler = async (event) => {
	const auth = await requireApiKey(event, 'assets:write');
	if (!auth.ok) return auth.response;
	const { principal, db } = auth.value;

	const brandId = event.params.id;
	const access = await requireBrand(db, principal, brandId, 'write');
	if (!access.ok) return access.response;

	const parsed = await readJson(event.request);
	if (!parsed.ok) return parsed.response;
	const body = parsed.value;

	const style = body.style ?? 'abstract';
	if (!isLogoStyle(style)) {
		return apiError(400, 'invalid_style', `\`style\` must be one of: ${LOGO_STYLES.join(', ')}.`);
	}

	const instruction = typeof body.instruction === 'string' ? body.instruction : undefined;
	if (instruction && instruction.length > 500) {
		return apiError(400, 'instruction_too_long', '`instruction` is limited to 500 characters.');
	}

	const setAsLogo = body.set_as_logo === true;
	const model = typeof body.model === 'string' && body.model ? body.model : DEFAULT_MODEL;

	if (!isWorkersAIModel(model)) {
		// Other providers exist in the app but need a configured key and run
		// asynchronously; keeping v1 to the keyless path means the endpoint behaves the
		// same for every caller.
		return apiError(
			400,
			'unsupported_model',
			'v1 supports Workers AI image models only. Omit `model` to use the default.'
		);
	}
	if (!event.platform?.env?.AI) {
		return apiError(503, 'ai_unavailable', 'Image generation is not available.');
	}
	if (!event.platform?.env?.BUCKET) {
		return apiError(503, 'storage_unavailable', 'Asset storage is not available.');
	}

	// The plan belongs to the key's owner, so the public API is bound by exactly the
	// same limits as the UI. Without this it would be the way around them: an API key
	// is free to mint and this endpoint generates images.
	//
	// Answers in the v1 envelope rather than throwing, like every other refusal here —
	// clients branch on `error.code`, and a SvelteKit HTML error page would break them.
	const plan = await resolvePlan(db, principal.userId);
	if (!hasFeature(plan, 'aiLogoGeneration')) {
		return apiError(
			402,
			'plan_feature_locked',
			'AI logo generation is not included on this plan. Logos can still be uploaded.'
		);
	}

	try {
		await consumeUsage(db, principal.userId, 'aiImageGenerations', plan);
	} catch (err) {
		const refusal = entitlementRefusal(err);
		if (!refusal) throw err;
		return apiError(402, refusal.code, refusal.message);
	}
	const refundImage = () => releaseUsage(db, principal.userId, 'aiImageGenerations');

	const brand = await db
		.prepare(
			`SELECT brand_name, industry, brand_personality_traits,
			        primary_color, secondary_color, logo_concept
			 FROM brand_profiles WHERE id = ?`
		)
		.bind(brandId)
		.first<Record<string, string | null>>();

	const prompt = buildLogoPrompt(
		{
			brandName: brand?.brand_name,
			industry: brand?.industry,
			brandPersonalityTraits: brand?.brand_personality_traits,
			primaryColor: brand?.primary_color,
			secondaryColor: brand?.secondary_color,
			logoConcept: brand?.logo_concept
		},
		style,
		instruction
	);

	const generation = await generateImage(db, {
		brandProfileId: brandId,
		prompt,
		model,
		size: '1024x1024',
		category: 'logo',
		name: `${style} logo`
	});

	try {
		const result = await runWorkersAIImage(event.platform.env.AI, model, { prompt, steps: 4 });
		if (!result?.image) {
			await refundImage();
			await updateAIGenerationStatus(db, generation.id, {
				status: 'failed',
				errorMessage: 'Model returned no image'
			});
			return apiError(502, 'generation_failed', 'The model returned no image. Try again.');
		}

		// base64 → bytes without Buffer, which Workers does not provide.
		const binary = atob(result.image);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

		const r2Key = `brands/${brandId}/logo/${generation.id}.jpg`;
		await event.platform.env.BUCKET.put(r2Key, bytes, {
			httpMetadata: { contentType: 'image/jpeg' }
		});

		const media = await createBrandMedia(db, {
			brandProfileId: brandId,
			mediaType: 'image',
			category: 'logo',
			name: `${style} logo`,
			description: `API-generated logo (${style})`,
			r2Key,
			mimeType: 'image/jpeg',
			fileSize: bytes.byteLength,
			width: 1024,
			height: 1024,
			metadata: { aiGenerated: true, prompt, model, style, source: 'api/v1' }
		});

		// Two different URLs on purpose. The API returns one its callers can fetch with
		// a key; `logo_url` keeps the app's session-based convention, which is what the
		// existing UI and existing rows use.
		const url = `/api/v1/brands/${brandId}/assets/${media.id}/content`;
		const appUrl = `/api/brand/assets/file?key=${encodeURIComponent(r2Key)}`;

		if (setAsLogo) {
			await db
				.prepare('UPDATE brand_profiles SET logo_url = ?, updated_at = ? WHERE id = ?')
				.bind(appUrl, new Date().toISOString(), brandId)
				.run();
		}

		await updateAIGenerationStatus(db, generation.id, { status: 'complete' });

		return apiJson(
			{
				data: {
					id: media.id,
					generation_id: generation.id,
					url,
					style,
					prompt,
					model,
					width: 1024,
					height: 1024,
					set_as_logo: setAsLogo
				}
			},
			201
		);
	} catch (err) {
		await refundImage();
		await updateAIGenerationStatus(db, generation.id, {
			status: 'failed',
			errorMessage: err instanceof Error ? err.message : 'Unknown error'
		});
		// The generation id is returned so a caller can correlate a failure with the
		// record rather than being told only that something went wrong.
		return apiError(
			502,
			'generation_failed',
			`Logo generation failed (generation ${generation.id}).`
		);
	}
};
