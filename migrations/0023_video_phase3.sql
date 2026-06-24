-- Migration 0023: Phase 3 Video Generation
-- 1. Extend content_items to support video type and video platforms
-- 2. SQLite doesn't allow ALTER TABLE to change CHECK constraints,
--    so we recreate the table with updated constraints.

CREATE TABLE content_items_new (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('post', 'article', 'update', 'video')),
  platform TEXT NOT NULL CHECK(platform IN ('devto', 'linkedin', 'twitter', 'email', 'youtube', 'tiktok', 'generic')),
  title TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'scheduled', 'published', 'failed')),
  scheduled_for TEXT,
  published_at TEXT,
  external_url TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO content_items_new SELECT * FROM content_items;
DROP TABLE content_items;
ALTER TABLE content_items_new RENAME TO content_items;

CREATE INDEX idx_content_items_brand ON content_items(brand_id);
CREATE INDEX idx_content_items_status ON content_items(status);
CREATE INDEX idx_content_items_platform ON content_items(platform);
CREATE INDEX idx_content_items_scheduled ON content_items(scheduled_for) WHERE scheduled_for IS NOT NULL;
