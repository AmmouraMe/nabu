/**
 * Brand Asset Service
 * Manages comprehensive text/image/audio/video assets for brands.
 * Every brand gets a structured, category-based asset library with
 * multilingual text, logo variants for all sizes, and full media management.
 */

import type { D1Database } from '@cloudflare/workers-types';
import type {
  BrandText,
  BrandMediaAsset,
  BrandMediaVariant,
  BrandMediaWithVariants,
  BrandAssetSummary,
  CreateBrandTextParams,
  UpdateBrandTextParams,
  CreateBrandMediaParams,
  UpdateBrandMediaParams,
  CreateMediaVariantParams
} from '$lib/types/brand-assets';
import { createTextRevision } from '$lib/services/text-history';

// Re-export types the tests import directly from this module
export type { BrandText, BrandMediaAsset, BrandMediaVariant, BrandAssetSummary };

// ─── Category Constants ──────────────────────────────────────────

/** Valid text asset categories */
export const TEXT_CATEGORIES = [
  'names',         // Brand name, legal name, DBA, abbreviation, former names
  'messaging',     // Tagline, slogan, elevator pitch, value proposition, mission, vision
  'descriptions',  // Short bio, long bio, boilerplate, about us
  'legal',         // Copyright notice, trademark text, disclaimers
  'social',        // Social media bios (Twitter, Instagram, LinkedIn, etc.)
  'voice'          // Tone guidelines, vocabulary, key phrases, phrases to avoid
] as const;

/** Valid image asset categories */
export const IMAGE_CATEGORIES = [
  'logo',           // Primary logo, icon, wordmark, horizontal, vertical, stacked
  'social',         // Profile pictures, cover images, story templates
  'marketing',      // Banner ads, email headers, business cards, letterhead
  'product',        // Product photos, screenshots, mockups
  'brand_elements', // Patterns, textures, icons, illustrations, watermarks
  'team'            // Team photos, headshots
] as const;

/** Valid audio asset categories */
export const AUDIO_CATEGORIES = [
  'sonic_identity', // Audio logo, sound mark, notification sounds
  'music',          // Brand anthem, jingles, background music, hold music
  'voiceover'       // Voiceover samples, podcast intros, IVR recordings
] as const;

/** Valid video asset categories */
export const VIDEO_CATEGORIES = [
  'brand',          // Brand videos, logo animations, manifesto
  'social',         // Social media content, stories, reels
  'marketing',      // Commercials, product demos, testimonials
  'content',        // Tutorials, educational, entertainment
  'internal'        // Training, culture, onboarding videos
] as const;

// ─── Row Mappers ─────────────────────────────────────────────────

function mapRowToText(row: Record<string, unknown>): BrandText {
  return {
    id: row.id as string,
    brandProfileId: row.brand_profile_id as string,
    category: row.category as BrandText['category'],
    key: row.key as string,
    label: row.label as string,
    value: row.value as string,
    language: row.language as string,
    sortOrder: (row.sort_order as number) || 0,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  };
}

function mapRowToMedia(row: Record<string, unknown>): BrandMediaAsset {
  return {
    id: row.id as string,
    brandProfileId: row.brand_profile_id as string,
    mediaType: row.media_type as BrandMediaAsset['mediaType'],
    category: row.category as string,
    name: row.name as string,
    description: (row.description as string) || undefined,
    url: (row.url as string) || undefined,
    r2Key: (row.r2_key as string) || undefined,
    mimeType: (row.mime_type as string) || undefined,
    fileSize: (row.file_size as number) || undefined,
    width: (row.width as number) || undefined,
    height: (row.height as number) || undefined,
    durationSeconds: (row.duration_seconds as number) || undefined,
    tags: row.tags ? JSON.parse(row.tags as string) : undefined,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    sortOrder: (row.sort_order as number) || 0,
    isPrimary: (row.is_primary as number) === 1,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  };
}

function mapRowToVariant(row: Record<string, unknown>): BrandMediaVariant {
  return {
    id: row.id as string,
    brandMediaId: row.brand_media_id as string,
    variantType: row.variant_type as BrandMediaVariant['variantType'],
    label: row.label as string,
    url: (row.url as string) || undefined,
    r2Key: (row.r2_key as string) || undefined,
    mimeType: (row.mime_type as string) || undefined,
    fileSize: (row.file_size as number) || undefined,
    width: (row.width as number) || undefined,
    height: (row.height as number) || undefined,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    createdAt: row.created_at as string
  };
}

// ─── Brand Text Assets ──────────────────────────────────────────

/**
 * Get a text asset by its ID.
 * Returns null if not found.
 */
export async function getBrandTextById(
  db: D1Database,
  textId: string
): Promise<BrandText | null> {
  const row = await db
    .prepare('SELECT * FROM brand_texts WHERE id = ?')
    .bind(textId)
    .first<Record<string, unknown>>();

  if (!row) return null;
  return mapRowToText(row);
}

/**
 * Find a text asset by brand profile, category, and key.
 * Pass `language` to match the table's
 * UNIQUE(brand_profile_id, category, key, language) identity exactly —
 * omit it to search across languages.
 * Returns null if not found.
 */
export async function findBrandTextByKey(
  db: D1Database,
  brandProfileId: string,
  category: string,
  key: string,
  language?: string
): Promise<BrandText | null> {
  const sql = language
    ? `SELECT * FROM brand_texts
       WHERE brand_profile_id = ? AND category = ? AND key = ? AND language = ?`
    : `SELECT * FROM brand_texts
       WHERE brand_profile_id = ? AND category = ? AND key = ?`;
  const binds = language
    ? [brandProfileId, category, key, language]
    : [brandProfileId, category, key];

  const row = await db
    .prepare(sql)
    .bind(...binds)
    .first<Record<string, unknown>>();

  if (!row) return null;
  return mapRowToText(row);
}

/**
 * Find the text asset a profile field is mirrored to, considering every key
 * that field is known by. Earlier keys win, so the canonical key is preferred
 * when rows exist under more than one alias.
 *
 * Needed because the Text tab's preset keys and FIELD_TO_TEXT_MAPPING's
 * canonical key diverge for some fields (e.g. 'mission_statement' vs
 * 'mission'); matching only the canonical key would shadow an existing row
 * with a second, duplicate one.
 */
export async function findBrandTextByAnyKey(
  db: D1Database,
  brandProfileId: string,
  category: string,
  keys: string[]
): Promise<BrandText | null> {
  if (keys.length === 0) return null;

  const placeholders = keys.map(() => '?').join(', ');
  const preference = keys.map((_, index) => `WHEN ? THEN ${index}`).join(' ');

  const row = await db
    .prepare(
      `SELECT * FROM brand_texts
       WHERE brand_profile_id = ? AND category = ? AND key IN (${placeholders})
       ORDER BY CASE key ${preference} ELSE ${keys.length} END
       LIMIT 1`
    )
    .bind(brandProfileId, category, ...keys, ...keys)
    .first<Record<string, unknown>>();

  if (!row) return null;
  return mapRowToText(row);
}

/**
 * Sync a brand profile field value to a corresponding text asset.
 * Uses FIELD_TO_TEXT_MAPPING to determine the text category and key.
 * Creates the text if it doesn't exist, or updates it if it does.
 * Clearing the field blanks the mirrored text asset rather than leaving the
 * previous value stranded on the Text tab.
 * No-ops for fields without a mapping.
 */
export async function syncFieldToTextAsset(
  db: D1Database,
  params: {
    brandProfileId: string;
    fieldName: string;
    value: string | null;
  }
): Promise<void> {
  // Import inline to avoid circular dependency at module level
  const { FIELD_TO_TEXT_MAPPING, BRAND_FIELD_LABELS } = await import('$lib/services/brand');

  const mapping = FIELD_TO_TEXT_MAPPING[params.fieldName];
  if (!mapping) return;

  const category = mapping.category;
  const key = mapping.keys[0]; // Use first key as the canonical key
  const label = BRAND_FIELD_LABELS[params.fieldName] || params.fieldName;

  // Check if a text asset already exists for this field, under any of the
  // keys it may have been stored under
  const existing = await findBrandTextByAnyKey(db, params.brandProfileId, category, mapping.keys);

  if (!params.value) {
    // The field was cleared. Blank the mirrored asset so the Text tab stops
    // showing the old content; the row and its revision history are kept so
    // the value stays recoverable. Never create an asset for an empty value —
    // that would invent Text-tab entries for fields the user never filled in.
    if (existing) {
      await updateBrandText(db, existing.id, { value: '' });
    }
    return;
  }

  if (existing) {
    // Update the existing text asset
    await updateBrandText(db, existing.id, { value: params.value });
  } else {
    // Create a new text asset
    await createBrandText(db, {
      brandProfileId: params.brandProfileId,
      category: category as CreateBrandTextParams['category'],
      key,
      label,
      value: params.value
    });
  }
}

/**
 * Create a text asset for a brand.
 * If userId is provided, also creates an initial revision for history tracking.
 */
export async function createBrandText(
  db: D1Database,
  params: CreateBrandTextParams
): Promise<BrandText> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const language = params.language || 'en';
  const sortOrder = params.sortOrder ?? 0;
  const metadataStr = params.metadata ? JSON.stringify(params.metadata) : null;

  await db
    .prepare(
      `INSERT INTO brand_texts
       (id, brand_profile_id, category, key, label, value, language, sort_order, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, params.brandProfileId, params.category, params.key, params.label, params.value, language, sortOrder, metadataStr, now, now)
    .run();

  // Create initial revision if user context is available
  if (params.userId) {
    await createTextRevision(db, {
      brandTextId: id,
      value: params.value,
      label: params.label,
      changeSource: params.changeSource ?? 'manual',
      userId: params.userId,
      changeNote: 'Initial version'
    });
  }

  return {
    id,
    brandProfileId: params.brandProfileId,
    category: params.category,
    key: params.key,
    label: params.label,
    value: params.value,
    language,
    sortOrder,
    metadata: params.metadata,
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Get all text assets for a brand, ordered by category then sort order.
 */
export async function getBrandTexts(
  db: D1Database,
  brandProfileId: string
): Promise<BrandText[]> {
  const result = await db
    .prepare(
      `SELECT * FROM brand_texts
       WHERE brand_profile_id = ?
       ORDER BY category, sort_order, key`
    )
    .bind(brandProfileId)
    .all();

  return (result.results || []).map((row) =>
    mapRowToText(row as Record<string, unknown>)
  );
}

/**
 * Get text assets for a brand filtered by category.
 */
export async function getBrandTextsByCategory(
  db: D1Database,
  brandProfileId: string,
  category: string
): Promise<BrandText[]> {
  const result = await db
    .prepare(
      `SELECT * FROM brand_texts
       WHERE brand_profile_id = ? AND category = ?
       ORDER BY sort_order, key`
    )
    .bind(brandProfileId, category)
    .all();

  return (result.results || []).map((row) =>
    mapRowToText(row as Record<string, unknown>)
  );
}

/**
 * Update a text asset.
 * If userId is provided and the value is being changed, creates a new revision.
 */
export async function updateBrandText(
  db: D1Database,
  textId: string,
  params: UpdateBrandTextParams
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (params.value !== undefined) {
    sets.push('value = ?');
    values.push(params.value);
  }
  if (params.label !== undefined) {
    sets.push('label = ?');
    values.push(params.label);
  }
  if (params.sortOrder !== undefined) {
    sets.push('sort_order = ?');
    values.push(params.sortOrder);
  }
  if (params.metadata !== undefined) {
    sets.push('metadata = ?');
    values.push(JSON.stringify(params.metadata));
  }

  if (sets.length === 0) return;

  sets.push("updated_at = datetime('now')");
  values.push(textId);

  await db
    .prepare(`UPDATE brand_texts SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  // Create a revision if value changed and user context is available
  if (params.value !== undefined && params.userId) {
    await createTextRevision(db, {
      brandTextId: textId,
      value: params.value,
      label: params.label,
      changeSource: params.changeSource ?? 'manual',
      userId: params.userId,
      changeNote: params.changeNote
    });
  }
}

/**
 * Delete a text asset.
 */
export async function deleteBrandText(
  db: D1Database,
  textId: string
): Promise<void> {
  await db
    .prepare('DELETE FROM brand_texts WHERE id = ?')
    .bind(textId)
    .run();
}

// ─── Brand Media Assets ──────────────────────────────────────────

/**
 * Create a media asset (image, audio, or video) for a brand.
 */
export async function createBrandMedia(
  db: D1Database,
  params: CreateBrandMediaParams
): Promise<BrandMediaAsset> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const sortOrder = params.sortOrder ?? 0;
  const isPrimary = params.isPrimary ?? false;
  const tagsStr = params.tags ? JSON.stringify(params.tags) : null;
  const metadataStr = params.metadata ? JSON.stringify(params.metadata) : null;

  await db
    .prepare(
      `INSERT INTO brand_media
       (id, brand_profile_id, media_type, category, name, description,
        url, r2_key, mime_type, file_size, width, height, duration_seconds,
        tags, metadata, sort_order, is_primary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id, params.brandProfileId, params.mediaType, params.category, params.name,
      params.description ?? null, params.url ?? null, params.r2Key ?? null,
      params.mimeType ?? null, params.fileSize ?? null, params.width ?? null,
      params.height ?? null, params.durationSeconds ?? null,
      tagsStr, metadataStr, sortOrder, isPrimary ? 1 : 0, now, now
    )
    .run();

  return {
    id,
    brandProfileId: params.brandProfileId,
    mediaType: params.mediaType,
    category: params.category,
    name: params.name,
    description: params.description,
    url: params.url,
    r2Key: params.r2Key,
    mimeType: params.mimeType,
    fileSize: params.fileSize,
    width: params.width,
    height: params.height,
    durationSeconds: params.durationSeconds,
    tags: params.tags,
    metadata: params.metadata,
    sortOrder,
    isPrimary,
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Get all media assets for a brand.
 */
export async function getBrandMedia(
  db: D1Database,
  brandProfileId: string
): Promise<BrandMediaAsset[]> {
  const result = await db
    .prepare(
      `SELECT * FROM brand_media
       WHERE brand_profile_id = ?
       ORDER BY media_type, category, sort_order, name`
    )
    .bind(brandProfileId)
    .all();

  return (result.results || []).map((row) =>
    mapRowToMedia(row as Record<string, unknown>)
  );
}

/**
 * Get media assets filtered by type (image, audio, video).
 */
export async function getBrandMediaByType(
  db: D1Database,
  brandProfileId: string,
  mediaType: string
): Promise<BrandMediaAsset[]> {
  const result = await db
    .prepare(
      `SELECT * FROM brand_media
       WHERE brand_profile_id = ? AND media_type = ?
       ORDER BY category, sort_order, name`
    )
    .bind(brandProfileId, mediaType)
    .all();

  return (result.results || []).map((row) =>
    mapRowToMedia(row as Record<string, unknown>)
  );
}

/**
 * Get media assets filtered by type and category.
 */
export async function getBrandMediaByCategory(
  db: D1Database,
  brandProfileId: string,
  mediaType: string,
  category: string
): Promise<BrandMediaAsset[]> {
  const result = await db
    .prepare(
      `SELECT * FROM brand_media
       WHERE brand_profile_id = ? AND media_type = ? AND category = ?
       ORDER BY sort_order, name`
    )
    .bind(brandProfileId, mediaType, category)
    .all();

  return (result.results || []).map((row) =>
    mapRowToMedia(row as Record<string, unknown>)
  );
}

/**
 * Get the primary media asset for a given type+category, e.g. the primary logo.
 */
export async function getPrimaryMediaForCategory(
  db: D1Database,
  brandProfileId: string,
  mediaType: string,
  category: string
): Promise<BrandMediaAsset | null> {
  const row = await db
    .prepare(
      `SELECT * FROM brand_media
       WHERE brand_profile_id = ? AND media_type = ? AND category = ? AND is_primary = 1
       LIMIT 1`
    )
    .bind(brandProfileId, mediaType, category)
    .first();

  if (!row) return null;
  return mapRowToMedia(row as Record<string, unknown>);
}

/**
 * Update a media asset.
 */
export async function updateBrandMedia(
  db: D1Database,
  mediaId: string,
  params: UpdateBrandMediaParams
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (params.name !== undefined) { sets.push('name = ?'); values.push(params.name); }
  if (params.description !== undefined) { sets.push('description = ?'); values.push(params.description); }
  if (params.url !== undefined) { sets.push('url = ?'); values.push(params.url); }
  if (params.r2Key !== undefined) { sets.push('r2_key = ?'); values.push(params.r2Key); }
  if (params.mimeType !== undefined) { sets.push('mime_type = ?'); values.push(params.mimeType); }
  if (params.fileSize !== undefined) { sets.push('file_size = ?'); values.push(params.fileSize); }
  if (params.width !== undefined) { sets.push('width = ?'); values.push(params.width); }
  if (params.height !== undefined) { sets.push('height = ?'); values.push(params.height); }
  if (params.durationSeconds !== undefined) { sets.push('duration_seconds = ?'); values.push(params.durationSeconds); }
  if (params.tags !== undefined) { sets.push('tags = ?'); values.push(JSON.stringify(params.tags)); }
  if (params.metadata !== undefined) { sets.push('metadata = ?'); values.push(JSON.stringify(params.metadata)); }
  if (params.sortOrder !== undefined) { sets.push('sort_order = ?'); values.push(params.sortOrder); }
  if (params.isPrimary !== undefined) { sets.push('is_primary = ?'); values.push(params.isPrimary ? 1 : 0); }

  if (sets.length === 0) return;

  sets.push("updated_at = datetime('now')");
  values.push(mediaId);

  await db
    .prepare(`UPDATE brand_media SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();
}

/**
 * Delete a media asset and all its variants.
 */
export async function deleteBrandMedia(
  db: D1Database,
  mediaId: string
): Promise<void> {
  // Delete variants first (cascade should handle this, but be explicit)
  await db
    .prepare('DELETE FROM brand_media_variants WHERE brand_media_id = ?')
    .bind(mediaId)
    .run();

  await db
    .prepare('DELETE FROM brand_media WHERE id = ?')
    .bind(mediaId)
    .run();
}

// ─── Media Variants ──────────────────────────────────────────────

/**
 * Create a variant (size, format, color mode, background, platform) for a media asset.
 */
export async function createMediaVariant(
  db: D1Database,
  params: CreateMediaVariantParams
): Promise<BrandMediaVariant> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const metadataStr = params.metadata ? JSON.stringify(params.metadata) : null;

  await db
    .prepare(
      `INSERT INTO brand_media_variants
       (id, brand_media_id, variant_type, label, url, r2_key, mime_type, file_size, width, height, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id, params.brandMediaId, params.variantType, params.label,
      params.url ?? null, params.r2Key ?? null, params.mimeType ?? null,
      params.fileSize ?? null, params.width ?? null, params.height ?? null,
      metadataStr, now
    )
    .run();

  return {
    id,
    brandMediaId: params.brandMediaId,
    variantType: params.variantType,
    label: params.label,
    url: params.url,
    r2Key: params.r2Key,
    mimeType: params.mimeType,
    fileSize: params.fileSize,
    width: params.width,
    height: params.height,
    metadata: params.metadata,
    createdAt: now
  };
}

/**
 * Get all variants for a media asset.
 */
export async function getMediaVariants(
  db: D1Database,
  brandMediaId: string
): Promise<BrandMediaVariant[]> {
  const result = await db
    .prepare(
      `SELECT * FROM brand_media_variants
       WHERE brand_media_id = ?
       ORDER BY variant_type, label`
    )
    .bind(brandMediaId)
    .all();

  return (result.results || []).map((row) =>
    mapRowToVariant(row as Record<string, unknown>)
  );
}

/**
 * Delete a specific variant.
 */
export async function deleteMediaVariant(
  db: D1Database,
  variantId: string
): Promise<void> {
  await db
    .prepare('DELETE FROM brand_media_variants WHERE id = ?')
    .bind(variantId)
    .run();
}

// ─── Logo Convenience ────────────────────────────────────────────

/**
 * Get all logo assets with their variants.
 * This is the most common query — every brand needs logos in multiple shapes/sizes.
 */
export async function getLogoAssets(
  db: D1Database,
  brandProfileId: string
): Promise<BrandMediaWithVariants[]> {
  const logos = await getBrandMediaByCategory(db, brandProfileId, 'image', 'logo');

  const results: BrandMediaWithVariants[] = [];
  for (const logo of logos) {
    const variants = await getMediaVariants(db, logo.id);
    results.push({ asset: logo, variants });
  }

  return results;
}

// ─── Brand Asset Summary ─────────────────────────────────────────

/**
 * Get a summary of all asset counts for a brand.
 */
export async function getBrandAssetSummary(
  db: D1Database,
  brandProfileId: string
): Promise<BrandAssetSummary> {
  const textRow = await db
    .prepare('SELECT COUNT(*) as count FROM brand_texts WHERE brand_profile_id = ?')
    .bind(brandProfileId)
    .first<{ count: number; }>();

  const imageRow = await db
    .prepare("SELECT COUNT(*) as count FROM brand_media WHERE brand_profile_id = ? AND media_type = 'image'")
    .bind(brandProfileId)
    .first<{ count: number; }>();

  const audioRow = await db
    .prepare("SELECT COUNT(*) as count FROM brand_media WHERE brand_profile_id = ? AND media_type = 'audio'")
    .bind(brandProfileId)
    .first<{ count: number; }>();

  const videoRow = await db
    .prepare("SELECT COUNT(*) as count FROM brand_media WHERE brand_profile_id = ? AND media_type = 'video'")
    .bind(brandProfileId)
    .first<{ count: number; }>();

  const videoGenRow = await db
    .prepare('SELECT COUNT(*) as count FROM video_generations WHERE brand_profile_id = ?')
    .bind(brandProfileId)
    .first<{ count: number; }>();

  const textCount = textRow?.count ?? 0;
  const imageCount = imageRow?.count ?? 0;
  const audioCount = audioRow?.count ?? 0;
  const videoCount = videoRow?.count ?? 0;
  const videoGenerationsCount = videoGenRow?.count ?? 0;

  return {
    textCount,
    imageCount,
    audioCount,
    videoCount,
    videoGenerationsCount,
    totalCount: textCount + imageCount + audioCount + videoCount
  };
}
