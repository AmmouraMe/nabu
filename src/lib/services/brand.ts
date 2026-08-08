/**
 * Brand Service
 * Manages brand profile field versioning, retrieval, structured summaries,
 * and multi-brand management (listing, duplicating, ownership verification).
 * Complements the onboarding service with direct brand management capabilities.
 */

import type { BrandProfile } from '$lib/types/onboarding';
import type { D1Database } from '@cloudflare/workers-types';
import { mapRowToProfile } from '$lib/services/onboarding';

/** A single version record for a brand field */
export interface BrandFieldVersion {
	id: string;
	brandProfileId: string;
	userId: string;
	fieldName: string;
	oldValue: string | null;
	newValue: string | null;
	changeSource: 'manual' | 'ai' | 'import';
	changeReason: string | null;
	versionNumber: number;
	createdAt: string;
}

/** A field in a brand section summary */
export interface BrandFieldSummaryItem {
	key: string;
	label: string;
	value: unknown;
	type: 'text' | 'color' | 'list' | 'object' | 'archetype' | 'image';
}

/** A section grouping related brand fields */
export interface BrandFieldSection {
	id: string;
	title: string;
	icon: string;
	fields: BrandFieldSummaryItem[];
}

/** Human-readable labels for all brand profile fields */
export const BRAND_FIELD_LABELS: Record<string, string> = {
	brandName: 'Brand Name',
	tagline: 'Tagline',
	missionStatement: 'Mission Statement',
	visionStatement: 'Vision Statement',
	elevatorPitch: 'Elevator Pitch',
	brandArchetype: 'Brand Archetype',
	brandPersonalityTraits: 'Personality Traits',
	toneOfVoice: 'Tone of Voice',
	communicationStyle: 'Communication Style',
	targetAudience: 'Target Audience',
	customerPainPoints: 'Customer Pain Points',
	valueProposition: 'Value Proposition',
	primaryColor: 'Primary Color',
	secondaryColor: 'Secondary Color',
	accentColor: 'Accent Color',
	brandColor4: 'Brand Color 4',
	brandColor5: 'Brand Color 5',
	backgroundColor: 'Background',
	surfaceColor: 'Surface',
	textColor: 'Text',
	textSecondaryColor: 'Text Secondary',
	borderColor: 'Border',
	successColor: 'Success',
	warningColor: 'Warning',
	errorColor: 'Error',
	colorPalette: 'Color Palette',
	typographyLogo: 'Logo Font',
	typographyHeading: 'Heading Font',
	typographyBody: 'Body Font',
	logoConcept: 'Logo Concept',
	logoUrl: 'Logo (Icon)',
	logoHorizontalUrl: 'Logo (Horizontal)',
	logoVerticalUrl: 'Logo (Vertical)',
	industry: 'Industry',
	competitors: 'Competitors',
	uniqueSellingPoints: 'Unique Selling Points',
	marketPosition: 'Market Position',
	originStory: 'Origin Story',
	brandValues: 'Brand Values',
	brandPromise: 'Brand Promise',
	styleGuide: 'Style Guide'
};

/**
 * Map from camelCase field names to snake_case DB column names
 */
const FIELD_TO_COLUMN: Record<string, string> = {
	brandName: 'brand_name',
	tagline: 'tagline',
	missionStatement: 'mission_statement',
	visionStatement: 'vision_statement',
	elevatorPitch: 'elevator_pitch',
	brandArchetype: 'brand_archetype',
	brandPersonalityTraits: 'brand_personality_traits',
	toneOfVoice: 'tone_of_voice',
	communicationStyle: 'communication_style',
	targetAudience: 'target_audience',
	customerPainPoints: 'customer_pain_points',
	valueProposition: 'value_proposition',
	primaryColor: 'primary_color',
	secondaryColor: 'secondary_color',
	accentColor: 'accent_color',
	brandColor4: 'brand_color_4',
	brandColor5: 'brand_color_5',
	backgroundColor: 'background_color',
	surfaceColor: 'surface_color',
	textColor: 'text_color',
	textSecondaryColor: 'text_secondary_color',
	borderColor: 'border_color',
	successColor: 'success_color',
	warningColor: 'warning_color',
	errorColor: 'error_color',
	colorPalette: 'color_palette',
	typographyLogo: 'typography_logo',
	typographyHeading: 'typography_heading',
	typographyBody: 'typography_body',
	logoConcept: 'logo_concept',
	logoUrl: 'logo_url',
	logoHorizontalUrl: 'logo_horizontal_url',
	logoVerticalUrl: 'logo_vertical_url',
	industry: 'industry',
	competitors: 'competitors',
	uniqueSellingPoints: 'unique_selling_points',
	marketPosition: 'market_position',
	originStory: 'origin_story',
	brandValues: 'brand_values',
	brandPromise: 'brand_promise',
	styleGuide: 'style_guide',
	sortOrder: 'sort_order'
};

/** Fields stored as JSON arrays in the database */
const JSON_ARRAY_FIELDS = new Set(['colorPalette']);

/** Fields stored as JSON objects in the database */
const JSON_OBJECT_FIELDS = new Set(['styleGuide']);

/** A text suggestion from saved brand text assets */
export interface TextSuggestion {
	id: string;
	category: string;
	key: string;
	label: string;
	value: string;
	language: string;
}

/**
 * Mapping from brand profile field names to text asset categories/keys.
 * This allows "pick from saved text" for profile fields that have
 * corresponding text assets stored in brand_texts.
 */
export const FIELD_TO_TEXT_MAPPING: Record<string, { category: string; keys: string[] }> = {
	// Identity → Names
	brandName: { category: 'names', keys: ['brand_name', 'primary_name', 'company_name'] },
	// Identity → Messaging
	tagline: { category: 'messaging', keys: ['tagline', 'slogan'] },
	missionStatement: { category: 'messaging', keys: ['mission', 'mission_statement'] },
	visionStatement: { category: 'messaging', keys: ['vision', 'vision_statement'] },
	elevatorPitch: { category: 'messaging', keys: ['elevator_pitch', 'pitch'] },
	valueProposition: { category: 'messaging', keys: ['value_proposition'] },
	brandPromise: { category: 'messaging', keys: ['brand_promise', 'promise'] },
	// Personality → Voice
	toneOfVoice: { category: 'voice', keys: ['tone', 'tone_of_voice', 'tone_guidelines'] },
	communicationStyle: { category: 'voice', keys: ['communication_style', 'style_guidelines'] },
	brandArchetype: { category: 'voice', keys: ['brand_archetype', 'archetype'] },
	brandPersonalityTraits: {
		category: 'voice',
		keys: ['personality_traits', 'brand_personality_traits']
	},
	// Story → Descriptions
	originStory: { category: 'descriptions', keys: ['origin_story', 'about_us', 'long_bio'] },
	// Market
	marketPosition: { category: 'descriptions', keys: ['market_position', 'positioning'] },
	industry: { category: 'descriptions', keys: ['industry'] },
	// Audience
	targetAudience: { category: 'messaging', keys: ['target_audience'] },
	customerPainPoints: { category: 'messaging', keys: ['customer_pain_points', 'pain_points'] },
	// Market (list fields)
	competitors: { category: 'descriptions', keys: ['competitors'] },
	uniqueSellingPoints: { category: 'messaging', keys: ['unique_selling_points', 'usps'] },
	// Story (list fields)
	brandValues: { category: 'messaging', keys: ['brand_values', 'values'] }
};

/**
 * Direct mapping from profile field key to the Text tab preset key.
 * Used to pre-select the correct preset type when navigating from an empty profile field.
 */
export const FIELD_TO_PRESET_KEY: Record<string, { category: string; presetKey: string }> = {
	brandName: { category: 'names', presetKey: 'brand_name' },
	tagline: { category: 'messaging', presetKey: 'tagline' },
	missionStatement: { category: 'messaging', presetKey: 'mission_statement' },
	visionStatement: { category: 'messaging', presetKey: 'vision_statement' },
	elevatorPitch: { category: 'messaging', presetKey: 'elevator_pitch' },
	valueProposition: { category: 'messaging', presetKey: 'value_proposition' },
	brandPromise: { category: 'messaging', presetKey: 'brand_promise' },
	toneOfVoice: { category: 'voice', presetKey: 'tone_guidelines' },
	communicationStyle: { category: 'voice', presetKey: 'communication_style' },
	brandArchetype: { category: 'voice', presetKey: 'brand_archetype' },
	brandPersonalityTraits: { category: 'voice', presetKey: 'personality_traits' },
	originStory: { category: 'descriptions', presetKey: 'origin_story' },
	marketPosition: { category: 'descriptions', presetKey: 'market_position' },
	industry: { category: 'descriptions', presetKey: 'industry' },
	targetAudience: { category: 'messaging', presetKey: 'target_audience' },
	customerPainPoints: { category: 'messaging', presetKey: 'customer_pain_points' },
	competitors: { category: 'descriptions', presetKey: 'competitors' },
	uniqueSellingPoints: { category: 'messaging', presetKey: 'unique_selling_points' },
	brandValues: { category: 'messaging', presetKey: 'brand_values' }
};

/**
 * Set of profile field keys that should navigate to the Images tab when clicked.
 * These fields represent visual/image concepts rather than text assets.
 */
export const IMAGE_FIELDS: Set<string> = new Set(['logoConcept']);

/**
 * Reverse mapping: given a text category + key, find the matching brand profile field.
 * Returns { fieldName, fieldLabel } if the text key maps to a profile field, or null.
 */
export function getMatchingProfileField(
	category: string,
	key: string
): { fieldName: string; fieldLabel: string } | null {
	for (const [fieldName, mapping] of Object.entries(FIELD_TO_TEXT_MAPPING)) {
		if (mapping.category === category && mapping.keys.includes(key)) {
			return {
				fieldName,
				fieldLabel: BRAND_FIELD_LABELS[fieldName] || fieldName
			};
		}
	}
	return null;
}

/**
 * Get the current value of a single profile field.
 * Returns the raw value (string or null) from the brand_profiles table.
 */
export async function getProfileFieldValue(
	db: D1Database,
	profileId: string,
	fieldName: string
): Promise<string | null> {
	const column = FIELD_TO_COLUMN[fieldName];
	if (!column) {
		throw new Error(`Unknown field: ${fieldName}`);
	}

	const row = await db
		.prepare(`SELECT ${column} FROM brand_profiles WHERE id = ?`)
		.bind(profileId)
		.first<Record<string, unknown>>();

	if (!row) return null;
	return (row[column] as string) ?? null;
}

/**
 * Get text asset suggestions that could populate a brand profile field.
 * Returns all text assets from the matching category for that field,
 * so the user can pick any saved text — not just exact key matches.
 */
export async function getTextSuggestionsForField(
	db: D1Database,
	brandProfileId: string,
	fieldName: string
): Promise<TextSuggestion[]> {
	const mapping = FIELD_TO_TEXT_MAPPING[fieldName];
	if (!mapping) return [];

	const result = await db
		.prepare(
			`SELECT id, category, key, label, value, language
       FROM brand_texts
       WHERE brand_profile_id = ? AND category = ?
       ORDER BY sort_order, key`
		)
		.bind(brandProfileId, mapping.category)
		.all();

	return (result.results || []).map((row) => ({
		id: (row as Record<string, unknown>).id as string,
		category: (row as Record<string, unknown>).category as string,
		key: (row as Record<string, unknown>).key as string,
		label: (row as Record<string, unknown>).label as string,
		value: (row as Record<string, unknown>).value as string,
		language: (row as Record<string, unknown>).language as string
	}));
}

/**
 * Map a database row to a BrandFieldVersion
 */
function mapRowToVersion(row: Record<string, unknown>): BrandFieldVersion {
	return {
		id: row.id as string,
		brandProfileId: row.brand_profile_id as string,
		userId: row.user_id as string,
		fieldName: row.field_name as string,
		oldValue: (row.old_value as string) || null,
		newValue: (row.new_value as string) || null,
		changeSource: row.change_source as BrandFieldVersion['changeSource'],
		changeReason: (row.change_reason as string) || null,
		versionNumber: row.version_number as number,
		createdAt: row.created_at as string
	};
}

/**
 * Add a version record for a brand field change
 */
export async function addFieldVersion(
	db: D1Database,
	params: {
		brandProfileId: string;
		userId: string;
		fieldName: string;
		oldValue: unknown;
		newValue: unknown;
		changeSource: 'manual' | 'ai' | 'import';
		changeReason?: string;
	}
): Promise<BrandFieldVersion> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();

	// Get the current max version number for this field
	const maxVersionRow = await db
		.prepare(
			`SELECT COALESCE(MAX(version_number), 0) as max_version 
       FROM brand_field_versions 
       WHERE brand_profile_id = ? AND field_name = ?`
		)
		.bind(params.brandProfileId, params.fieldName)
		.first<{ max_version: number }>();

	const versionNumber = (maxVersionRow?.max_version || 0) + 1;

	// Serialize values for storage
	const oldValueStr =
		params.oldValue != null
			? typeof params.oldValue === 'string'
				? params.oldValue
				: JSON.stringify(params.oldValue)
			: null;
	const newValueStr =
		params.newValue != null
			? typeof params.newValue === 'string'
				? params.newValue
				: JSON.stringify(params.newValue)
			: null;

	await db
		.prepare(
			`INSERT INTO brand_field_versions 
       (id, brand_profile_id, user_id, field_name, old_value, new_value, change_source, change_reason, version_number, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			id,
			params.brandProfileId,
			params.userId,
			params.fieldName,
			oldValueStr,
			newValueStr,
			params.changeSource,
			params.changeReason || null,
			versionNumber,
			now
		)
		.run();

	return {
		id,
		brandProfileId: params.brandProfileId,
		userId: params.userId,
		fieldName: params.fieldName,
		oldValue: oldValueStr,
		newValue: newValueStr,
		changeSource: params.changeSource,
		changeReason: params.changeReason || null,
		versionNumber,
		createdAt: now
	};
}

/**
 * Get version history for a specific field
 */
export async function getFieldHistory(
	db: D1Database,
	brandProfileId: string,
	fieldName: string
): Promise<BrandFieldVersion[]> {
	const result = await db
		.prepare(
			`SELECT * FROM brand_field_versions 
       WHERE brand_profile_id = ? AND field_name = ?
       ORDER BY version_number ASC`
		)
		.bind(brandProfileId, fieldName)
		.all();

	return (result.results || []).map((row) => mapRowToVersion(row as Record<string, unknown>));
}

/**
 * Get all version history across all fields for a brand profile
 */
export async function getAllFieldHistory(
	db: D1Database,
	brandProfileId: string
): Promise<BrandFieldVersion[]> {
	const result = await db
		.prepare(
			`SELECT * FROM brand_field_versions 
       WHERE brand_profile_id = ?
       ORDER BY created_at DESC`
		)
		.bind(brandProfileId)
		.all();

	return (result.results || []).map((row) => mapRowToVersion(row as Record<string, unknown>));
}

/**
 * Update a brand field and create a version record
 */
export async function updateBrandFieldWithVersion(
	db: D1Database,
	params: {
		profileId: string;
		userId: string;
		fieldName: string;
		newValue: unknown;
		changeSource: 'manual' | 'ai' | 'import';
		changeReason?: string;
	}
): Promise<void> {
	const column = FIELD_TO_COLUMN[params.fieldName];
	if (!column) {
		throw new Error(`Unknown field: ${params.fieldName}`);
	}

	// Get current value for version tracking
	const currentRow = await db
		.prepare(`SELECT ${column} FROM brand_profiles WHERE id = ?`)
		.bind(params.profileId)
		.first<Record<string, unknown>>();

	const oldValue = currentRow?.[column] ?? null;

	// Determine how to store the new value
	let dbValue: string | null;
	if (params.newValue == null) {
		dbValue = null;
	} else if (JSON_ARRAY_FIELDS.has(params.fieldName) || JSON_OBJECT_FIELDS.has(params.fieldName)) {
		dbValue =
			typeof params.newValue === 'string' ? params.newValue : JSON.stringify(params.newValue);
	} else if (Array.isArray(params.newValue)) {
		// Convert arrays to comma-separated text (e.g. from AI extraction)
		dbValue = params.newValue.join(', ');
	} else {
		dbValue = String(params.newValue);
	}

	// Update the field
	await db
		.prepare(`UPDATE brand_profiles SET ${column} = ?, updated_at = datetime('now') WHERE id = ?`)
		.bind(dbValue, params.profileId)
		.run();

	// When brand name is explicitly set (manually or by AI), mark it as confirmed
	if (params.fieldName === 'brandName') {
		await db
			.prepare(`UPDATE brand_profiles SET brand_name_confirmed = 1 WHERE id = ?`)
			.bind(params.profileId)
			.run();
	}

	// Create version record
	await addFieldVersion(db, {
		brandProfileId: params.profileId,
		userId: params.userId,
		fieldName: params.fieldName,
		oldValue,
		newValue: params.newValue,
		changeSource: params.changeSource,
		changeReason: params.changeReason
	});

	// Best-effort sync to corresponding text asset (non-fatal).
	// Centralizes the invariant that field writes are mirrored to the Text tab
	// (same behavior as manual edits via /api/brand/update-field).
	// The field update and version are always the source of truth.
	try {
		const { syncFieldToTextAsset } = await import('$lib/services/brand-assets');
		// Mirror exactly what the profile column stores (dbValue) so the Text tab
		// and the DB never diverge — e.g. JSON-array fields previously stored
		// JSON in the column but a comma-joined string in the text asset.
		await syncFieldToTextAsset(db, {
			brandProfileId: params.profileId,
			fieldName: params.fieldName,
			value: dbValue
		});
	} catch (error) {
		// Non-fatal — text asset is a derived convenience — but never silent:
		// this catch also guards the dynamic import, and a swallowed module
		// failure would permanently disable mirroring at every call site.
		console.error('syncFieldToTextAsset failed:', error);
	}
}

/**
 * Revert a field to a specific version
 */
export async function revertFieldToVersion(
	db: D1Database,
	params: {
		profileId: string;
		userId: string;
		fieldName: string;
		versionId: string;
	}
): Promise<void> {
	// Get the version record
	const versionRow = await db
		.prepare('SELECT * FROM brand_field_versions WHERE id = ? AND brand_profile_id = ?')
		.bind(params.versionId, params.profileId)
		.first<Record<string, unknown>>();

	if (!versionRow) {
		throw new Error('Version not found');
	}

	const targetValue = versionRow.new_value as string | null;

	// Apply via the versioned update (which creates a new version record for the revert)
	await updateBrandFieldWithVersion(db, {
		profileId: params.profileId,
		userId: params.userId,
		fieldName: params.fieldName,
		newValue: targetValue,
		changeSource: 'manual',
		changeReason: `Reverted to version ${versionRow.version_number}`
	});
}

/**
 * Get a structured summary of all brand fields organized by section
 */
export function getBrandFieldsSummary(profile: BrandProfile): BrandFieldSection[] {
	return [
		{
			id: 'identity',
			title: 'Brand Identity',
			icon: '🏷️',
			fields: [
				{ key: 'brandName', label: 'Brand Name', value: profile.brandName, type: 'text' },
				{ key: 'tagline', label: 'Tagline', value: profile.tagline, type: 'text' },
				{
					key: 'missionStatement',
					label: 'Mission Statement',
					value: profile.missionStatement,
					type: 'text'
				},
				{
					key: 'visionStatement',
					label: 'Vision Statement',
					value: profile.visionStatement,
					type: 'text'
				},
				{
					key: 'elevatorPitch',
					label: 'Elevator Pitch',
					value: profile.elevatorPitch,
					type: 'text'
				}
			]
		},
		{
			id: 'personality',
			title: 'Brand Personality',
			icon: '🎭',
			fields: [
				{
					key: 'brandArchetype',
					label: 'Brand Archetype',
					value: profile.brandArchetype,
					type: 'text'
				},
				{
					key: 'brandPersonalityTraits',
					label: 'Personality Traits',
					value: profile.brandPersonalityTraits,
					type: 'text'
				},
				{ key: 'toneOfVoice', label: 'Tone of Voice', value: profile.toneOfVoice, type: 'text' },
				{
					key: 'communicationStyle',
					label: 'Communication Style',
					value: profile.communicationStyle,
					type: 'text'
				}
			]
		},
		{
			id: 'audience',
			title: 'Target Audience',
			icon: '🎯',
			fields: [
				{
					key: 'targetAudience',
					label: 'Target Audience',
					value: profile.targetAudience,
					type: 'text'
				},
				{
					key: 'customerPainPoints',
					label: 'Customer Pain Points',
					value: profile.customerPainPoints,
					type: 'text'
				},
				{
					key: 'valueProposition',
					label: 'Value Proposition',
					value: profile.valueProposition,
					type: 'text'
				}
			]
		},
		{
			id: 'visual',
			title: 'Visual Identity',
			icon: '🎨',
			fields: [
				{ key: 'logoConcept', label: 'Logo Concept', value: profile.logoConcept, type: 'image' },
				{ key: 'logoUrl', label: 'Logo (Icon)', value: profile.logoUrl, type: 'image' },
				{
					key: 'logoHorizontalUrl',
					label: 'Logo (Horizontal)',
					value: profile.logoHorizontalUrl,
					type: 'image'
				},
				{
					key: 'logoVerticalUrl',
					label: 'Logo (Vertical)',
					value: profile.logoVerticalUrl,
					type: 'image'
				},
				{ key: 'primaryColor', label: 'Primary', value: profile.primaryColor, type: 'color' },
				{ key: 'secondaryColor', label: 'Secondary', value: profile.secondaryColor, type: 'color' },
				{ key: 'accentColor', label: 'Accent', value: profile.accentColor, type: 'color' },
				{
					key: 'backgroundColor',
					label: 'Background',
					value: profile.backgroundColor,
					type: 'color'
				},
				{ key: 'surfaceColor', label: 'Surface', value: profile.surfaceColor, type: 'color' },
				{ key: 'textColor', label: 'Text', value: profile.textColor, type: 'color' },
				{
					key: 'textSecondaryColor',
					label: 'Text Secondary',
					value: profile.textSecondaryColor,
					type: 'color'
				},
				{ key: 'borderColor', label: 'Border', value: profile.borderColor, type: 'color' },
				{ key: 'successColor', label: 'Success', value: profile.successColor, type: 'color' },
				{ key: 'warningColor', label: 'Warning', value: profile.warningColor, type: 'color' },
				{ key: 'errorColor', label: 'Error', value: profile.errorColor, type: 'color' },
				{ key: 'colorPalette', label: 'Color Palette', value: profile.colorPalette, type: 'list' },
				{ key: 'typographyLogo', label: 'Logo Font', value: profile.typographyLogo, type: 'text' },
				{
					key: 'typographyHeading',
					label: 'Heading Font',
					value: profile.typographyHeading,
					type: 'text'
				},
				{ key: 'typographyBody', label: 'Body Font', value: profile.typographyBody, type: 'text' }
			]
		},
		{
			id: 'market',
			title: 'Market Position',
			icon: '📊',
			fields: [
				{ key: 'industry', label: 'Industry', value: profile.industry, type: 'text' },
				{ key: 'competitors', label: 'Competitors', value: profile.competitors, type: 'text' },
				{
					key: 'uniqueSellingPoints',
					label: 'Unique Selling Points',
					value: profile.uniqueSellingPoints,
					type: 'text'
				},
				{
					key: 'marketPosition',
					label: 'Market Position',
					value: profile.marketPosition,
					type: 'text'
				}
			]
		},
		{
			id: 'story',
			title: 'Brand Story',
			icon: '📖',
			fields: [
				{ key: 'originStory', label: 'Origin Story', value: profile.originStory, type: 'text' },
				{ key: 'brandValues', label: 'Brand Values', value: profile.brandValues, type: 'text' },
				{ key: 'brandPromise', label: 'Brand Promise', value: profile.brandPromise, type: 'text' }
			]
		}
	];
}

// ─── Multi-Brand Management ──────────────────────────────────────────

/**
 * Get all non-archived brand profiles for a user, ordered by most recently updated.
 */
export async function getAllBrandProfilesByUser(
	db: D1Database,
	userId: string
): Promise<BrandProfile[]> {
	const result = await db
		.prepare(
			`SELECT * FROM brand_profiles 
       WHERE user_id = ? AND status IN ('in_progress', 'completed')
       ORDER BY sort_order ASC, updated_at DESC`
		)
		.bind(userId)
		.all();

	return (result.results || []).map((row) => mapRowToProfile(row as Record<string, unknown>));
}

/**
 * Get all archived brand profiles for a user, ordered by most recently updated.
 */
export async function getArchivedBrandProfilesByUser(
	db: D1Database,
	userId: string
): Promise<BrandProfile[]> {
	const result = await db
		.prepare(
			`SELECT * FROM brand_profiles 
       WHERE user_id = ? AND status = 'archived'
       ORDER BY updated_at DESC`
		)
		.bind(userId)
		.all();

	return (result.results || []).map((row) => mapRowToProfile(row as Record<string, unknown>));
}

/**
 * Get a specific brand profile, verified to belong to the given user.
 * Returns null if not found or belongs to a different user.
 */
export async function getBrandProfileForUser(
	db: D1Database,
	profileId: string,
	userId: string
): Promise<BrandProfile | null> {
	const row = await db
		.prepare('SELECT * FROM brand_profiles WHERE id = ? AND user_id = ?')
		.bind(profileId, userId)
		.first();

	if (!row) return null;
	return mapRowToProfile(row as Record<string, unknown>);
}

/**
 * Duplicate an existing brand profile, creating a new copy with "(Copy)" appended to the name.
 * The copy starts in 'in_progress' status but preserves all brand data.
 */
export async function duplicateBrandProfile(
	db: D1Database,
	sourceProfileId: string,
	userId: string
): Promise<BrandProfile> {
	// Get and verify the source profile
	const sourceRow = await db
		.prepare('SELECT * FROM brand_profiles WHERE id = ? AND user_id = ?')
		.bind(sourceProfileId, userId)
		.first();

	if (!sourceRow) {
		throw new Error('Source profile not found');
	}

	const source = sourceRow as Record<string, unknown>;
	const newId = crypto.randomUUID();
	const now = new Date().toISOString();

	// Build the brand name for the copy
	const sourceName = (source.brand_name as string) || 'Untitled';
	const copyName = `${sourceName} (Copy)`;

	await db
		.prepare(
			`INSERT INTO brand_profiles (
        id, user_id, status,
        brand_name, brand_name_confirmed, tagline, mission_statement, vision_statement, elevator_pitch,
        brand_archetype, brand_personality_traits, tone_of_voice, communication_style,
        target_audience, customer_pain_points, value_proposition,
        primary_color, secondary_color, accent_color, color_palette,
        typography_logo, typography_heading, typography_body,
        logo_concept, logo_url, logo_horizontal_url, logo_vertical_url,
        industry, competitors, unique_selling_points, market_position,
        origin_story, brand_values, brand_promise, style_guide,
        onboarding_step, created_at, updated_at
      ) VALUES (
        ?, ?, 'in_progress',
        ?, 0, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?
      )`
		)
		.bind(
			newId,
			userId,
			copyName,
			source.tagline ?? null,
			source.mission_statement ?? null,
			source.vision_statement ?? null,
			source.elevator_pitch ?? null,
			source.brand_archetype ?? null,
			source.brand_personality_traits ?? null,
			source.tone_of_voice ?? null,
			source.communication_style ?? null,
			source.target_audience ?? null,
			source.customer_pain_points ?? null,
			source.value_proposition ?? null,
			source.primary_color ?? null,
			source.secondary_color ?? null,
			source.accent_color ?? null,
			source.color_palette ?? null,
			source.typography_logo ?? null,
			source.typography_heading ?? null,
			source.typography_body ?? null,
			source.logo_concept ?? null,
			source.logo_url ?? null,
			source.logo_horizontal_url ?? null,
			source.logo_vertical_url ?? null,
			source.industry ?? null,
			source.competitors ?? null,
			source.unique_selling_points ?? null,
			source.market_position ?? null,
			source.origin_story ?? null,
			source.brand_values ?? null,
			source.brand_promise ?? null,
			source.style_guide ?? null,
			source.onboarding_step ?? 'complete',
			now,
			now
		)
		.run();

	return {
		id: newId,
		userId,
		status: 'in_progress',
		brandName: copyName,
		brandNameConfirmed: false,
		tagline: (source.tagline as string) || undefined,
		missionStatement: (source.mission_statement as string) || undefined,
		visionStatement: (source.vision_statement as string) || undefined,
		elevatorPitch: (source.elevator_pitch as string) || undefined,
		brandArchetype: (source.brand_archetype as BrandProfile['brandArchetype']) || undefined,
		toneOfVoice: (source.tone_of_voice as string) || undefined,
		communicationStyle: (source.communication_style as string) || undefined,
		valueProposition: (source.value_proposition as string) || undefined,
		primaryColor: (source.primary_color as string) || undefined,
		secondaryColor: (source.secondary_color as string) || undefined,
		accentColor: (source.accent_color as string) || undefined,
		industry: (source.industry as string) || undefined,
		marketPosition: (source.market_position as BrandProfile['marketPosition']) || undefined,
		originStory: (source.origin_story as string) || undefined,
		brandPromise: (source.brand_promise as string) || undefined,
		logoConcept: (source.logo_concept as string) || undefined,
		logoUrl: (source.logo_url as string) || undefined,
		logoHorizontalUrl: (source.logo_horizontal_url as string) || undefined,
		logoVerticalUrl: (source.logo_vertical_url as string) || undefined,
		typographyLogo: (source.typography_logo as string) || undefined,
		typographyHeading: (source.typography_heading as string) || undefined,
		typographyBody: (source.typography_body as string) || undefined,
		onboardingStep: (source.onboarding_step as BrandProfile['onboardingStep']) || 'complete',
		createdAt: now,
		updatedAt: now
	};
}
