export type TurnstileConfig =
	| { enabled: false }
	| { enabled: true; siteKey: string; secretKey: string }
	| { enabled: false; error: string };

export function getTurnstileConfig(siteKey?: string, secretKey?: string): TurnstileConfig {
	if (!siteKey && !secretKey) return { enabled: false };
	if (!siteKey || !secretKey) {
		return {
			enabled: false,
			error: 'Turnstile requires both TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY.'
		};
	}
	return { enabled: true, siteKey, secretKey };
}

export async function verifyTurnstile(options: {
	secretKey: string;
	token: string;
	remoteIp?: string;
	fetchFn?: typeof fetch;
}): Promise<boolean> {
	if (!options.token) return false;
	const body = new FormData();
	body.set('secret', options.secretKey);
	body.set('response', options.token);
	if (options.remoteIp) body.set('remoteip', options.remoteIp);
	try {
		const response = await (options.fetchFn || fetch)(
			'https://challenges.cloudflare.com/turnstile/v0/siteverify',
			{
				method: 'POST',
				body
			}
		);
		if (!response.ok) return false;
		return Boolean(((await response.json()) as { success?: boolean }).success);
	} catch {
		return false;
	}
}
