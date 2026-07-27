/**
 * The public API's single source of truth.
 *
 * Everything that describes the API lives here: scopes, endpoints, parameters, error
 * codes. Three consumers read it, which is what keeps the docs honest:
 *
 * 1. `src/lib/server/api-keys.ts` imports the scope list, so the values the docs show
 *    are literally the values the guard enforces.
 * 2. `/docs/api` renders this file, so published docs cannot describe an endpoint
 *    that does not exist here.
 * 3. `tests/unit/api-spec-drift.test.ts` walks `src/routes/api/v1` and fails when a
 *    route exists without a spec entry, when a spec entry has no route, or when the
 *    declared HTTP methods do not match the handlers the file actually exports.
 *
 * So adding an endpoint without documenting it breaks the build, and documenting one
 * that was removed breaks the build. Drift is a test failure rather than a slow lie.
 *
 * Deliberately free of server-only imports: the docs page is public and renders this
 * in the browser.
 */

// ─── Scopes ──────────────────────────────────────────────────────────

export type ApiScope = 'brands:read' | 'brands:write' | 'assets:read' | 'assets:write';

/** Canonical scope list. `api-keys.ts` imports this rather than restating it. */
export const ALL_SCOPES: ApiScope[] = [
	'brands:read',
	'brands:write',
	'assets:read',
	'assets:write'
];

export const SCOPE_DESCRIPTIONS: Record<ApiScope, string> = {
	'brands:read': 'List and read brands.',
	'brands:write': 'Reserved. No v1 endpoint requires it yet.',
	'assets:read': 'List assets and fetch their bytes.',
	'assets:write': 'Generate assets.'
};

// ─── Logo styles ─────────────────────────────────────────────────────

export type LogoStyle = 'wordmark' | 'lettermark' | 'abstract' | 'mascot' | 'emblem';

/** Canonical style list. `logo-prompt.ts` imports this. */
export const LOGO_STYLES: LogoStyle[] = ['wordmark', 'lettermark', 'abstract', 'mascot', 'emblem'];

export const LOGO_STYLE_DESCRIPTIONS: Record<LogoStyle, string> = {
	wordmark: 'The brand name set as a custom letterform.',
	lettermark: 'A monogram built from the brand initials.',
	abstract: 'A geometric mark with no letters or objects.',
	mascot: 'A single stylised character mark.',
	emblem: 'A badge, with the mark inside a bounding shape.'
};

// ─── Endpoints ───────────────────────────────────────────────────────

export interface ApiParam {
	name: string;
	type: string;
	required: boolean;
	default?: string;
	description: string;
}

export interface ApiEndpoint {
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
	/** SvelteKit route path, so the drift test can map it to a file on disk. */
	path: string;
	summary: string;
	/** Null means session-authenticated rather than key-authenticated. */
	scope: ApiScope | null;
	description: string;
	body?: ApiParam[];
	returns: string;
	example?: string;
}

/**
 * Key management is session-authenticated and lives outside `/api/v1`, so it is kept
 * in its own list — the drift test only walks `/api/v1`, and mixing the two would
 * make it assert against files it does not govern.
 */
export const KEY_ENDPOINTS: ApiEndpoint[] = [
	{
		method: 'POST',
		path: '/api/keys',
		summary: 'Create an API key',
		scope: null,
		description:
			'Returns the only copy of the key that will ever exist. Only a SHA-256 hash is stored, so it cannot be shown again or recovered from a database dump. Requires a browser session — a key can never mint another key, or one leak would outlive revoking the original.',
		body: [
			{ name: 'name', type: 'string', required: true, description: 'Label, up to 80 characters.' },
			{
				name: 'scopes',
				type: 'string[]',
				required: false,
				default: '["brands:read"]',
				description: 'Any of the scopes above. Unknown values are rejected outright.'
			},
			{
				name: 'brand_profile_id',
				type: 'string',
				required: false,
				description:
					'Pins the key to one brand. Every other brand then answers 404, even ones you own.'
			},
			{
				name: 'expires_at',
				type: 'string',
				required: false,
				description: 'ISO-8601. The key stops working at that moment.'
			}
		],
		returns: '`201` with `{ id, name, scopes, key, warning }`.',
		example: `curl -X POST https://nabu.ammoura.me/api/keys \\
  -H 'Content-Type: application/json' \\
  --data '{"name":"my-app","scopes":["brands:read","assets:write"]}'`
	},
	{
		method: 'GET',
		path: '/api/keys',
		summary: 'List your keys',
		scope: null,
		description: 'Never returns key material — only the visible prefix and usage counters.',
		returns: '`200` with `{ keys: [...] }`.'
	},
	{
		method: 'DELETE',
		path: '/api/keys/[id]',
		summary: 'Revoke a key',
		scope: null,
		description:
			'Effective on the next request. Sets a revocation timestamp rather than deleting the row, so the audit trail survives a compromise.',
		returns: '`200` with `{ revoked: true, id }`.'
	}
];

/**
 * Meta endpoints: they describe the API rather than operating on data, so they need
 * no key and carry no scope. Kept apart from `V1_ENDPOINTS` so the drift test can
 * still insist every *data* endpoint is scoped.
 */
export const META_ENDPOINTS: ApiEndpoint[] = [
	{
		method: 'GET',
		path: '/api/v1/openapi.json',
		summary: 'OpenAPI 3.1 document',
		scope: null,
		description:
			'Machine-readable description of this API, generated from the same definitions as this page. Public and unauthenticated — requiring a key to discover how keys work would be a poor first experience.',
		returns: 'An OpenAPI 3.1 document.',
		example: `curl ${'https://nabu.ammoura.me'}/api/v1/openapi.json`
	}
];

export const V1_ENDPOINTS: ApiEndpoint[] = [
	{
		method: 'GET',
		path: '/api/v1/brands',
		summary: 'List brands',
		scope: 'brands:read',
		description:
			'Brands this key can reach — owned, plus any shared with you — newest first, capped at 100. A brand-scoped key returns only its own.',
		returns:
			'`200` with `{ data: [ { id, name, tagline, status, industry, colors, logo_url, role, … } ] }`.',
		example: `curl https://nabu.ammoura.me/api/v1/brands \\
  -H "Authorization: Bearer $NABU_KEY"`
	},
	{
		method: 'GET',
		path: '/api/v1/brands/[id]/logos',
		summary: 'List logos',
		scope: 'assets:read',
		description:
			"Logo assets for the brand, newest first, plus which one is currently assigned as the brand's logo.",
		returns:
			'`200` with `{ data: [ { id, name, url, mime_type, width, height, … } ], current_logo_url }`.'
	},
	{
		method: 'POST',
		path: '/api/v1/brands/[id]/logos',
		summary: 'Generate a logo',
		scope: 'assets:write',
		description:
			"Generates a logo and stores it as an asset. Runs synchronously, so one request returns a finished asset with no polling. The prompt is built from the brand's own name, industry, personality and palette, plus constraints that keep output usable as a mark rather than as illustration.",
		body: [
			{
				name: 'style',
				type: 'enum',
				required: false,
				default: 'abstract',
				description: 'One of the styles listed above.'
			},
			{
				name: 'instruction',
				type: 'string',
				required: false,
				description:
					'Extra direction, up to 500 characters. Added to the constraints rather than replacing them, so output stays printable.'
			},
			{
				name: 'set_as_logo',
				type: 'boolean',
				required: false,
				default: 'false',
				description:
					"Assign the result as the brand's logo. Defaults to false: generating and choosing are separate decisions, and an app usually wants to offer candidates before overwriting a mark already in use."
			},
			{
				name: 'model',
				type: 'string',
				required: false,
				default: 'Workers AI FLUX',
				description: 'v1 accepts Workers AI image models only.'
			}
		],
		returns:
			'`201` with `{ data: { id, generation_id, url, style, prompt, model, width, height, set_as_logo } }`.',
		example: `curl -X POST https://nabu.ammoura.me/api/v1/brands/<brand-id>/logos \\
  -H "Authorization: Bearer $NABU_KEY" \\
  -H 'Content-Type: application/json' \\
  --data '{"style":"lettermark","instruction":"geometric, single weight"}'`
	},
	{
		method: 'GET',
		path: '/api/v1/brands/[id]/assets/[assetId]/content',
		summary: 'Fetch asset bytes',
		scope: 'assets:read',
		description:
			"Streams the asset itself. Asset URLs from this API point here rather than at the app's own file route, which needs a browser session and would be a dead link to an API client. The lookup is scoped to the brand in the path, so an asset id belonging to another brand resolves to nothing.",
		returns: 'The raw file, with its `content-type`.'
	}
];

// ─── Errors ──────────────────────────────────────────────────────────

export interface ApiErrorCode {
	status: number;
	code: string;
	meaning: string;
}

export const ERROR_CODES: ApiErrorCode[] = [
	{ status: 400, code: 'invalid_json', meaning: 'Body was not valid JSON.' },
	{ status: 400, code: 'invalid_body', meaning: 'Body was not a JSON object.' },
	{ status: 400, code: 'invalid_style', meaning: '`style` was not a known logo style.' },
	{ status: 400, code: 'instruction_too_long', meaning: '`instruction` exceeded 500 characters.' },
	{ status: 400, code: 'unsupported_model', meaning: 'Model is not a Workers AI image model.' },
	{
		status: 401,
		code: 'missing_credentials',
		meaning: 'No `Authorization: Bearer` header was sent.'
	},
	{
		status: 401,
		code: 'invalid_key',
		meaning:
			'Key is unknown, revoked or expired. One code covers all three on purpose — telling them apart would let a caller probe which keys exist.'
	},
	{ status: 403, code: 'insufficient_scope', meaning: 'The key lacks the scope this route needs.' },
	{ status: 403, code: 'read_only_access', meaning: 'Your role on this brand cannot write.' },
	{
		status: 404,
		code: 'brand_not_found',
		meaning:
			'The brand does not exist, or this key cannot reach it. Deliberately the same answer: a 403 would confirm the id exists.'
	},
	{ status: 404, code: 'asset_not_found', meaning: 'No such asset on this brand.' },
	{
		status: 410,
		code: 'asset_content_missing',
		meaning: 'The record exists but its file is gone.'
	},
	{
		status: 502,
		code: 'generation_failed',
		meaning: 'The model failed. The generation id is included so you can correlate it.'
	},
	{ status: 503, code: 'unavailable', meaning: 'Database unavailable.' },
	{ status: 503, code: 'ai_unavailable', meaning: 'Image generation unavailable.' },
	{ status: 503, code: 'storage_unavailable', meaning: 'Asset storage unavailable.' }
];

export const API_VERSION = 'v1';
export const API_BASE_URL = 'https://nabu.ammoura.me';
