-- Migration 0022: Content Automation Engine
-- Adds tables for brands (content automation), content items, and publishing accounts

-- Lightweight brand entity for content automation
-- Links optionally to the detailed brand_profiles built via the onboarding wizard
CREATE TABLE brands (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brand_profile_id TEXT REFERENCES brand_profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  tagline TEXT,
  voice_tone TEXT,
  target_audience TEXT,
  niche TEXT,
  style_guide TEXT,           -- JSON blob: colors, fonts, tone rules, etc.
  auto_schedule INTEGER NOT NULL DEFAULT 0 CHECK(auto_schedule IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_brands_user ON brands(user_id);
CREATE INDEX idx_brands_brand_profile ON brands(brand_profile_id);
CREATE INDEX idx_brands_auto_schedule ON brands(auto_schedule);

-- Individual pieces of generated or scheduled content
CREATE TABLE brand_content_items (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('post', 'article', 'update')),
  platform TEXT NOT NULL CHECK(platform IN ('devto', 'linkedin', 'twitter', 'email')),
  title TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'scheduled', 'published', 'failed')),
  scheduled_for TEXT,
  published_at TEXT,
  external_url TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_brand_content_items_brand ON brand_content_items(brand_id);
CREATE INDEX idx_brand_content_items_status ON brand_content_items(status);
CREATE INDEX idx_brand_content_items_platform ON brand_content_items(platform);
CREATE INDEX idx_brand_content_items_scheduled ON brand_content_items(scheduled_for) WHERE scheduled_for IS NOT NULL;

-- Connected publishing accounts (actual tokens stored in KV, not here)
CREATE TABLE publishing_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  kv_key TEXT,                -- KV namespace key where the real token lives
  username TEXT,
  connected_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, platform)
);

CREATE INDEX idx_publishing_accounts_user ON publishing_accounts(user_id);
