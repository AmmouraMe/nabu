/**
 * Test fixture for the brand authorisation guard.
 *
 * Every `/api/brand/assets/*` route resolves ownership before it acts, which means a
 * route test has to answer two kinds of question the guard asks: who owns a brand,
 * and which brand owns an asset. Rather than teach each test file's D1 mock about
 * those queries, wrap it once here.
 *
 * Usage — wrap an existing mock so the caller owns everything it touches:
 *
 *   const db = withBrandAccess(myMockDb, { userId: 'user-1' });
 *
 * The wrapper only intercepts the guard's own statements; everything else falls
 * through to the mock underneath, so existing expectations keep working.
 */

/** Statements the guard issues. The asset resolvers all select `…brand_profile_id FROM`. */
const OWNERSHIP = 'SELECT user_id FROM brand_profiles';
const ASSET_BRAND = 'brand_profile_id FROM';

export interface BrandAccessOptions {
	/** The user the routes will see as `locals.user.id`. Defaults to `user-1`. */
	userId?: string;
	/** The brand every asset resolves to. Defaults to `bp-1`. */
	brandProfileId?: string;
	/**
	 * Answer as though the caller is a stranger: the brand exists but belongs to
	 * someone else and there is no grant. Use to assert a route refuses.
	 */
	asStranger?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withBrandAccess(db: any, options: BrandAccessOptions = {}): any {
	const userId = options.userId ?? 'user-1';
	const brandProfileId = options.brandProfileId ?? 'bp-1';

	return {
		...db,
		prepare(sql: string) {
			const flat = String(sql).replace(/\s+/g, ' ').trim();

			if (flat.includes(OWNERSHIP)) {
				return guardAnswer({ user_id: options.asStranger ? 'someone-else' : userId });
			}
			if (flat.includes('FROM brand_access')) {
				return guardAnswer(null);
			}
			if (flat.includes(ASSET_BRAND)) {
				return guardAnswer({ brand_profile_id: brandProfileId });
			}

			return db.prepare(sql);
		}
	};
}

function guardAnswer(row: unknown) {
	return {
		bind: () => ({
			first: async () => row,
			all: async () => ({ results: row ? [row] : [] }),
			run: async () => ({ meta: { changes: 0 } })
		})
	};
}
