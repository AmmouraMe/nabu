/**
 * Brand Admin Service
 * Manages brand access delegation, audit logging, and admin-level brand operations.
 */

import type { D1Database } from '@cloudflare/workers-types';

export interface BrandAccessRecord {
	id: string;
	brandProfileId: string;
	userId: string;
	grantedBy: string;
	role: 'viewer' | 'editor' | 'manager';
	createdAt: string;
	updatedAt: string;
	// Joined fields
	userName?: string;
	userEmail?: string;
	userAvatar?: string;
	userLogin?: string;
}

export interface BrandAuditEntry {
	id: string;
	brandProfileId: string;
	userId: string;
	action: string;
	entityType: string | null;
	entityId: string | null;
	details: string | null;
	ipAddress: string | null;
	createdAt: string;
	// Joined fields
	userName?: string;
	userLogin?: string;
	userAvatar?: string;
}

export interface BrandAdminSummary {
	id: string;
	brandName: string | null;
	ownerName: string | null;
	ownerLogin: string | null;
	ownerEmail: string | null;
	ownerAvatar: string | null;
	status: string;
	collaboratorCount: number;
	createdAt: string;
	updatedAt: string;
}

/**
 * Get all brands with owner info for admin view
 */
export async function getAllBrandsForAdmin(db: D1Database): Promise<BrandAdminSummary[]> {
	const result = await db
		.prepare(
			`
			SELECT 
				bp.id,
				bp.brand_name,
				bp.status,
				bp.created_at,
				bp.updated_at,
				u.name as owner_name,
				u.github_login as owner_login,
				u.email as owner_email,
				u.github_avatar_url as owner_avatar,
				(SELECT COUNT(*) FROM brand_access ba WHERE ba.brand_profile_id = bp.id) as collaborator_count
			FROM brand_profiles bp
			JOIN users u ON bp.user_id = u.id
			ORDER BY bp.updated_at DESC
		`
		)
		.all();

	return (result.results || []).map((row: any) => ({
		id: row.id,
		brandName: row.brand_name,
		ownerName: row.owner_name,
		ownerLogin: row.owner_login,
		ownerEmail: row.owner_email,
		ownerAvatar: row.owner_avatar,
		status: row.status,
		collaboratorCount: row.collaborator_count,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	}));
}

/**
 * Get access list for a specific brand
 */
export async function getBrandAccess(
	db: D1Database,
	brandProfileId: string
): Promise<BrandAccessRecord[]> {
	const result = await db
		.prepare(
			`
			SELECT 
				ba.id,
				ba.brand_profile_id,
				ba.user_id,
				ba.granted_by,
				ba.role,
				ba.created_at,
				ba.updated_at,
				u.name as user_name,
				u.email as user_email,
				u.github_avatar_url as user_avatar,
				u.github_login as user_login
			FROM brand_access ba
			JOIN users u ON ba.user_id = u.id
			WHERE ba.brand_profile_id = ?
			ORDER BY ba.created_at DESC
		`
		)
		.bind(brandProfileId)
		.all();

	return (result.results || []).map((row: any) => ({
		id: row.id,
		brandProfileId: row.brand_profile_id,
		userId: row.user_id,
		grantedBy: row.granted_by,
		role: row.role,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		userName: row.user_name,
		userEmail: row.user_email,
		userAvatar: row.user_avatar,
		userLogin: row.user_login
	}));
}

/**
 * Grant access to a brand for a user
 */
export async function grantBrandAccess(
	db: D1Database,
	brandProfileId: string,
	userId: string,
	grantedBy: string,
	role: 'viewer' | 'editor' | 'manager' = 'viewer'
): Promise<string> {
	const id = crypto.randomUUID();
	await db
		.prepare(
			`
			INSERT INTO brand_access (id, brand_profile_id, user_id, granted_by, role)
			VALUES (?, ?, ?, ?, ?)
		`
		)
		.bind(id, brandProfileId, userId, grantedBy, role)
		.run();

	await addAuditLog(
		db,
		brandProfileId,
		grantedBy,
		'access_granted',
		'brand_access',
		id,
		JSON.stringify({ userId, role })
	);

	return id;
}

/**
 * Update a user's role on a brand
 */
export async function updateBrandAccess(
	db: D1Database,
	accessId: string,
	role: 'viewer' | 'editor' | 'manager',
	updatedBy: string
): Promise<void> {
	const existing = await db
		.prepare('SELECT brand_profile_id, user_id, role FROM brand_access WHERE id = ?')
		.bind(accessId)
		.first<{ brand_profile_id: string; user_id: string; role: string }>();

	if (!existing) throw new Error('Access record not found');

	await db
		.prepare('UPDATE brand_access SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
		.bind(role, accessId)
		.run();

	await addAuditLog(
		db,
		existing.brand_profile_id,
		updatedBy,
		'access_updated',
		'brand_access',
		accessId,
		JSON.stringify({ userId: existing.user_id, oldRole: existing.role, newRole: role })
	);
}

/**
 * Revoke a user's access to a brand
 */
export async function revokeBrandAccess(
	db: D1Database,
	accessId: string,
	revokedBy: string
): Promise<void> {
	const existing = await db
		.prepare('SELECT brand_profile_id, user_id, role FROM brand_access WHERE id = ?')
		.bind(accessId)
		.first<{ brand_profile_id: string; user_id: string; role: string }>();

	if (!existing) throw new Error('Access record not found');

	await db.prepare('DELETE FROM brand_access WHERE id = ?').bind(accessId).run();

	await addAuditLog(
		db,
		existing.brand_profile_id,
		revokedBy,
		'access_revoked',
		'brand_access',
		accessId,
		JSON.stringify({ userId: existing.user_id, role: existing.role })
	);
}

/**
 * Add an audit log entry
 */
export async function addAuditLog(
	db: D1Database,
	brandProfileId: string,
	userId: string,
	action: string,
	entityType?: string,
	entityId?: string,
	details?: string,
	ipAddress?: string
): Promise<void> {
	const id = crypto.randomUUID();
	await db
		.prepare(
			`
			INSERT INTO brand_audit_log (id, brand_profile_id, user_id, action, entity_type, entity_id, details, ip_address)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`
		)
		.bind(
			id,
			brandProfileId,
			userId,
			action,
			entityType || null,
			entityId || null,
			details || null,
			ipAddress || null
		)
		.run();
}

/**
 * Get audit log entries for a brand
 */
export async function getBrandAuditLog(
	db: D1Database,
	brandProfileId: string,
	limit = 50,
	offset = 0
): Promise<{ entries: BrandAuditEntry[]; total: number }> {
	const [logResult, countResult] = await db.batch([
		db
			.prepare(
				`
				SELECT 
					bal.id,
					bal.brand_profile_id,
					bal.user_id,
					bal.action,
					bal.entity_type,
					bal.entity_id,
					bal.details,
					bal.ip_address,
					bal.created_at,
					u.name as user_name,
					u.github_login as user_login,
					u.github_avatar_url as user_avatar
				FROM brand_audit_log bal
				JOIN users u ON bal.user_id = u.id
				WHERE bal.brand_profile_id = ?
				ORDER BY bal.created_at DESC
				LIMIT ? OFFSET ?
			`
			)
			.bind(brandProfileId, limit, offset),
		db
			.prepare('SELECT COUNT(*) as total FROM brand_audit_log WHERE brand_profile_id = ?')
			.bind(brandProfileId)
	]);

	const entries = ((logResult as any).results || []).map((row: any) => ({
		id: row.id,
		brandProfileId: row.brand_profile_id,
		userId: row.user_id,
		action: row.action,
		entityType: row.entity_type,
		entityId: row.entity_id,
		details: row.details,
		ipAddress: row.ip_address,
		createdAt: row.created_at,
		userName: row.user_name,
		userLogin: row.user_login,
		userAvatar: row.user_avatar
	}));

	const total = (countResult as any).results?.[0]?.total || 0;

	return { entries, total };
}
