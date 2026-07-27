import type { RequestHandler } from './$types';
import { requireApiKey, apiJson } from '$lib/server/api-guard';

/**
 * GET /api/v1/brands
 *
 * Brands this key can reach: those owned by the key's user, plus any shared with
 * them through `brand_access`. A brand-scoped key returns only its own brand.
 *
 * The query does the filtering rather than fetching everything and filtering in
 * application code — the latter is how a brand belonging to someone else ends up in
 * a response after a later refactor.
 */
export const GET: RequestHandler = async (event) => {
	const auth = await requireApiKey(event, 'brands:read');
	if (!auth.ok) return auth.response;
	const { principal, db } = auth.value;

	const scopeClause = principal.brandProfileId ? 'AND bp.id = ?' : '';
	// Built in placeholder order — the query takes userId three times (role CASE, the
	// access JOIN, the ownership test) before the optional brand scope.
	const binds: string[] = [principal.userId, principal.userId, principal.userId];
	if (principal.brandProfileId) binds.push(principal.brandProfileId);

	const result = await db
		.prepare(
			`SELECT DISTINCT
				bp.id, bp.brand_name, bp.tagline, bp.status,
				bp.primary_color, bp.secondary_color, bp.accent_color,
				bp.logo_url, bp.industry, bp.created_at, bp.updated_at,
				CASE WHEN bp.user_id = ? THEN 'owner' ELSE ba.role END AS role
			 FROM brand_profiles bp
			 LEFT JOIN brand_access ba
			   ON ba.brand_profile_id = bp.id AND ba.user_id = ?
			 WHERE (bp.user_id = ? OR ba.user_id IS NOT NULL) ${scopeClause}
			 ORDER BY bp.updated_at DESC
			 LIMIT 100`
		)
		.bind(...binds)
		.all();

	const brands = (result.results ?? []).map((row: Record<string, unknown>) => ({
		id: row.id,
		name: row.brand_name,
		tagline: row.tagline,
		status: row.status,
		industry: row.industry,
		colors: {
			primary: row.primary_color,
			secondary: row.secondary_color,
			accent: row.accent_color
		},
		logo_url: row.logo_url,
		role: row.role,
		created_at: row.created_at,
		updated_at: row.updated_at
	}));

	return apiJson({ data: brands });
};
