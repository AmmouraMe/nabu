-- Migration 0024: Brand Book Generator
-- Track when a brand book was last generated for each brand profile.

ALTER TABLE brand_profiles ADD COLUMN brand_book_generated_at TEXT;
