/**
 * Google Cloud API-key provisioning.
 *
 * Mints a Gemini/Vertex API key from inside the admin UI instead of having an
 * operator copy one out of the Cloud console. This is the same sequence the
 * `scripts/provision-keys.sh` CLI performs, expressed against the REST APIs so
 * it runs on a Worker (no gcloud binary, no filesystem).
 *
 * Auth model: single-tenant ops. One Google account (StarSpace's) consents once
 * with the `cloud-platform` scope; we keep the refresh token in KV and mint
 * access tokens from it as needed.
 *
 * Google rejects unrestricted *standard* API keys already, and rejects ALL
 * standard keys from September 2026 — so we only ever create service-account
 * bound *authorization* keys.
 * https://ai.google.dev/gemini-api/docs/api-key
 */

export const GCP_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
export const KV_GCP_TOKENS = 'gcp_oauth:tokens';
export const KV_GCP_CONFIG = 'auth_config:gcp';

const TARGET_SERVICES = ['generativelanguage.googleapis.com', 'aiplatform.googleapis.com'];

export interface GcpConfig {
	clientId: string;
	clientSecret: string;
}

export interface GcpTokens {
	refreshToken: string;
	/** Email of the consenting Google account, for display only. */
	account?: string;
	obtainedAt: string;
}

export interface GcpProject {
	projectId: string;
	name: string;
	billingEnabled: boolean;
}

export class GcpError extends Error {
	constructor(
		message: string,
		readonly status?: number
	) {
		super(message);
		this.name = 'GcpError';
	}
}

/** Read the OAuth client config, preferring env over KV (mirrors the auth routes). */
export async function getGcpConfig(platform: App.Platform | undefined): Promise<GcpConfig | null> {
	const clientId = platform?.env?.GCP_CLIENT_ID;
	const clientSecret = platform?.env?.GCP_CLIENT_SECRET;
	if (clientId && clientSecret) return { clientId, clientSecret };

	if (!platform?.env?.KV) return null;
	try {
		const stored = await platform.env.KV.get(KV_GCP_CONFIG);
		if (!stored) return null;
		const parsed = JSON.parse(stored) as Partial<GcpConfig>;
		if (!parsed.clientId || !parsed.clientSecret) return null;
		return { clientId: parsed.clientId, clientSecret: parsed.clientSecret };
	} catch (err) {
		console.error('Failed to read GCP OAuth config from KV:', err);
		return null;
	}
}

export async function getStoredTokens(
	platform: App.Platform | undefined
): Promise<GcpTokens | null> {
	if (!platform?.env?.KV) return null;
	try {
		const stored = await platform.env.KV.get(KV_GCP_TOKENS);
		return stored ? (JSON.parse(stored) as GcpTokens) : null;
	} catch {
		return null;
	}
}

export async function storeTokens(
	platform: App.Platform | undefined,
	tokens: GcpTokens
): Promise<void> {
	if (!platform?.env?.KV) throw new GcpError('KV storage not available');
	await platform.env.KV.put(KV_GCP_TOKENS, JSON.stringify(tokens));
}

/** Exchange an authorization code for tokens. Requires access_type=offline upstream. */
export async function exchangeCode(
	config: GcpConfig,
	code: string,
	redirectUri: string
): Promise<{ accessToken: string; refreshToken?: string }> {
	const res = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			code,
			client_id: config.clientId,
			client_secret: config.clientSecret,
			redirect_uri: redirectUri,
			grant_type: 'authorization_code'
		})
	});
	const body = (await res.json()) as {
		access_token?: string;
		refresh_token?: string;
		error_description?: string;
		error?: string;
	};
	if (!res.ok || !body.access_token) {
		throw new GcpError(
			`Token exchange failed: ${body.error_description || body.error || res.status}`,
			res.status
		);
	}
	return { accessToken: body.access_token, refreshToken: body.refresh_token };
}

/** Mint a short-lived access token from the stored refresh token. */
export async function getAccessToken(config: GcpConfig, refreshToken: string): Promise<string> {
	const res = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			refresh_token: refreshToken,
			client_id: config.clientId,
			client_secret: config.clientSecret,
			grant_type: 'refresh_token'
		})
	});
	const body = (await res.json()) as { access_token?: string; error_description?: string };
	if (!res.ok || !body.access_token) {
		throw new GcpError(
			`Could not refresh Google access token: ${body.error_description || res.status}. Reconnect the account.`,
			res.status
		);
	}
	return body.access_token;
}

async function gapi<T>(url: string, accessToken: string, init: RequestInit = {}): Promise<T> {
	const res = await fetch(url, {
		...init,
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json',
			...(init.headers || {})
		}
	});
	const text = await res.text();
	const body = text ? JSON.parse(text) : {};
	if (!res.ok) {
		const msg = body?.error?.message || `HTTP ${res.status}`;
		throw new GcpError(msg, res.status);
	}
	return body as T;
}

/**
 * List projects the consenting account can use, annotated with billing state.
 * Vertex rejects requests on unbilled projects, so the picker needs to show it.
 */
export async function listProjects(accessToken: string): Promise<GcpProject[]> {
	const listed = await gapi<{
		projects?: { projectId: string; name: string; lifecycleState: string }[];
	}>('https://cloudresourcemanager.googleapis.com/v1/projects?pageSize=200', accessToken);
	const active = (listed.projects || []).filter((p) => p.lifecycleState === 'ACTIVE');

	// Billing is a per-project lookup; run them together rather than serially.
	const withBilling = await Promise.all(
		active.map(async (p) => {
			let billingEnabled = false;
			try {
				const info = await gapi<{ billingEnabled?: boolean }>(
					`https://cloudbilling.googleapis.com/v1/projects/${p.projectId}/billingInfo`,
					accessToken
				);
				billingEnabled = Boolean(info.billingEnabled);
			} catch {
				// Missing billing permission shouldn't hide the project.
			}
			return { projectId: p.projectId, name: p.name, billingEnabled };
		})
	);
	return withBilling.sort(
		(a, b) =>
			Number(b.billingEnabled) - Number(a.billingEnabled) || a.projectId.localeCompare(b.projectId)
	);
}

async function enableServices(projectId: string, accessToken: string): Promise<void> {
	for (const service of TARGET_SERVICES) {
		try {
			await gapi(
				`https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${service}:enable`,
				accessToken,
				{ method: 'POST', body: '{}' }
			);
		} catch (err) {
			// Already-enabled surfaces as an error on some projects; keep going.
			if (err instanceof GcpError && err.status === 400) continue;
			throw err;
		}
	}
}

async function ensureServiceAccount(
	projectId: string,
	accessToken: string,
	accountId: string
): Promise<string> {
	const email = `${accountId}@${projectId}.iam.gserviceaccount.com`;
	try {
		await gapi(
			`https://iam.googleapis.com/v1/projects/${projectId}/serviceAccounts/${email}`,
			accessToken
		);
		return email;
	} catch (err) {
		if (!(err instanceof GcpError) || err.status !== 404) throw err;
	}
	await gapi(`https://iam.googleapis.com/v1/projects/${projectId}/serviceAccounts`, accessToken, {
		method: 'POST',
		body: JSON.stringify({
			accountId,
			serviceAccount: { displayName: 'Nabu AI provisioning' }
		})
	});
	return email;
}

/** Poll a long-running operation until it reports done. */
async function awaitOperation<T>(
	opName: string,
	accessToken: string,
	{ tries = 30, delayMs = 1000 } = {}
): Promise<T> {
	for (let i = 0; i < tries; i++) {
		const op = await gapi<{ done?: boolean; response?: T; error?: { message: string } }>(
			`https://apikeys.googleapis.com/v2/${opName}`,
			accessToken
		);
		if (op.done) {
			if (op.error) throw new GcpError(op.error.message);
			return op.response as T;
		}
		await new Promise((r) => setTimeout(r, delayMs));
	}
	throw new GcpError('Timed out waiting for Google to finish creating the key');
}

export interface ProvisionResult {
	keyString: string;
	keyName: string;
	projectId: string;
	reused: boolean;
}

/**
 * Ensure an authorization key exists for `projectId` and return its secret.
 * Idempotent: an existing key with the same display name is reused, because
 * Google caps API keys per project and re-running shouldn't burn the quota.
 */
export async function provisionApiKey(
	projectId: string,
	accessToken: string,
	displayName = 'nabu-admin-provisioned'
): Promise<ProvisionResult> {
	await enableServices(projectId, accessToken);
	const saEmail = await ensureServiceAccount(projectId, accessToken, 'nabu-ai');

	const parent = `projects/${projectId}/locations/global`;
	const existing = await gapi<{ keys?: { name: string; displayName?: string }[] }>(
		`https://apikeys.googleapis.com/v2/${parent}/keys`,
		accessToken
	);
	const match = (existing.keys || []).find((k) => k.displayName === displayName);

	let keyName: string;
	let reused = false;
	if (match) {
		keyName = match.name;
		reused = true;
	} else {
		const op = await gapi<{ name: string }>(
			`https://apikeys.googleapis.com/v2/${parent}/keys`,
			accessToken,
			{
				method: 'POST',
				body: JSON.stringify({
					displayName,
					restrictions: {
						apiTargets: TARGET_SERVICES.map((service) => ({ service }))
					},
					serviceAccountEmail: saEmail
				})
			}
		);
		const created = await awaitOperation<{ name: string }>(op.name, accessToken);
		keyName = created.name;
	}

	const { keyString } = await gapi<{ keyString: string }>(
		`https://apikeys.googleapis.com/v2/${keyName}/keyString`,
		accessToken
	);
	if (!keyString) throw new GcpError('Google returned an empty key string');

	return { keyString, keyName, projectId, reused };
}
