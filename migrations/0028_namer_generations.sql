-- Persist every brand-name generation, and keep suggested names unique.
--
-- Two tables rather than one, and the split is the privacy design rather than
-- normalisation for its own sake.
--
-- `namer_generations` holds somebody's brief — what they are building, who for.
-- That is user content and can be commercially sensitive: it is the shape of an
-- unlaunched business. It is only ever read back filtered by user_id, and rows
-- with a NULL user_id (anonymous visitors) are readable by nobody at all.
--
-- `namer_reserved_names` is the collision set, consulted on every generation so
-- the same name is never suggested twice — to a different person or to the same
-- one. It deliberately carries **no user reference and no brief**. Not "we do not
-- select those columns": they do not exist. A name checked against this table
-- cannot reveal who was given it or what they were building, because the table
-- does not know. That is what makes a global uniqueness check safe to run across
-- every user's history.

CREATE TABLE IF NOT EXISTS namer_generations (
  id TEXT PRIMARY KEY,
  -- NULL for a logged-out visitor. Nothing reads those rows back; they exist so
  -- the generation is saved, as asked, without minting a tracking identifier for
  -- someone who did not ask for an account.
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  audience TEXT,
  archetype TEXT,
  -- JSON array of the TLDs that had to be free, for reproducing a past run.
  require_tlds TEXT,
  -- JSON array of the names as they were shown, with their computed checks.
  names TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- The only supported read path: one user's own history, newest first.
CREATE INDEX IF NOT EXISTS idx_namer_generations_user
  ON namer_generations(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS namer_reserved_names (
  -- Lowercase, letters and digits only, so "Blue Bottle", "bluebottle" and
  -- "BlueBottle" collide as the same name rather than sneaking past each other.
  name_key TEXT PRIMARY KEY,
  -- The spelling it was first issued with, purely so a future feature can show
  -- the canonical form. Says nothing about who received it.
  display_name TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
